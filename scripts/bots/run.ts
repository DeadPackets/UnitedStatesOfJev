// One measurement run: every policy against every seed, one JSONL line a turn.
// Run: bunx wrangler dev --config ./wrangler.bots.jsonc --port 8799
//      bun scripts/bots/run.ts --scenario v3nj3k --seeds 8 --terms 1 --out docs/bots/2026-09-22
import { mkdir, writeFile } from "node:fs/promises";
import type { GameView } from "../../src/api";
import { Bot, type BotAct, type Whip } from "./api";
import { POLICIES, mulberry, type Policy } from "./policies";

export const TERM_USD = 0.25;    // TUNE: a v3 term measured $0.2153. Task 16 replaces this with a measured v4 term.
export const BUDGET_USD = 25;    // TUNE: the most one balance pass may spend
export const MAX_TERMS = 100;    // TUNE: the hard stop, whatever the budget arithmetic says
export const TURNS_PER_TERM = 20;   // mirrors worker/engine.ts
export const HARD_STOP = 8;      // TUNE: steps a term may take beyond its turns before it is called stuck
export const TERM_MS = 1_200_000;   // TUNE: 20 minutes, the wall clock a single term may take

export type TurnLog = {
  run: string; policy: string; seed: number; term: number; turn: number; bar: number;
  ledgers: unknown; holders: { id: string; stance: number; resistance: number; line: number; weight: number }[];
  acts: { verb: string; expected: Record<string, number>; realised: Record<string, number> }[];
  whip: Whip | null;
  jev: { tokens: number; cost: number; calls: number; worst: number; ms: number };
  pending: string | null; wire: unknown[];
};
export type RunLog = { run: string; game: string; policy: string; seed: number; terms: number; ending: string | null; won: boolean | null; term1Won: boolean | null; mandate: number | null; bar: number | null; turns: TurnLog[] };

const num = (o: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((o ?? {}) as Record<string, unknown>)) {
    if (typeof v === "number") out[k] = v;
    else if (v && typeof v === "object") for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) if (typeof v2 === "number") out[`${k}.${k2}`] = v2;
  }
  return out;
};
const diff = (before: Record<string, number>, after: Record<string, number>) => {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const d = (after[k] ?? 0) - (before[k] ?? 0);
    if (d !== 0) out[k] = Math.round(d * 1000) / 1000;
  }
  return out;
};
const holdersOf = (g: GameView) => ((g as never as { holders?: TurnLog["holders"] }).holders ?? [])
  .map((h) => ({ id: h.id, stance: h.stance, resistance: h.resistance, line: h.line, weight: h.weight }));
const usageOf = (g: GameView) => (g as never as { usage?: { tokens: number; cost: number; calls: number; worst: number } }).usage
  ?? { tokens: 0, cost: 0, calls: 0, worst: 0 };
// The expected effect at commit time is the pack's own price for that verb, which the view prices per turn.
const priceOf = (g: GameView, verb: string): Record<string, number> => {
  const p = (g as never as { instruments?: Record<string, { price?: Record<string, number> }> }).instruments?.[verb]?.price ?? {};
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, -v]));
};

/** Drives one term to its test. Every stage the engine can be in is handled, and the loop is capped twice. */
export async function runTerm(bot: Bot, policy: Policy, g: GameView, log: TurnLog[], seed: number, run: string): Promise<GameView> {
  const rnd = mulberry(seed ^ 0x5eed);
  const cap = TURNS_PER_TERM + HARD_STOP;
  const started = performance.now();
  let steps = 0;
  while (g.stage === "session" || g.stage === "midterm") {
    if (++steps > cap) throw new Error(`the term took more than ${cap} steps and never reached the test`);
    if (performance.now() - started > TERM_MS) throw new Error(`the term took over ${Math.round(TERM_MS / 60_000)} minutes`);
    if (g.stage === "midterm") { g = await bot.midterm(g); continue; }

    const turn = g.turn, term = g.term, before = bot.ms;
    bot.whip = null;
    const rows: TurnLog["acts"] = [];
    for (const a of policy.acts(g, rnd) as BotAct[]) {
      const pre = num(g.ledgers), expected = priceOf(g, a.verb);
      try { g = a.verb === "law" ? await bot.law(g, a.text) : await bot.act(g, a); }
      catch { rows.push({ verb: a.verb, expected, realised: { refused: 1 } }); continue; }
      rows.push({ verb: a.verb, expected, realised: diff(pre, num(g.ledgers)) });
      if (g.stage !== "session") break;
    }
    g = await bot.card(g);
    if (g.stage === "session") g = await bot.end(g);
    log.push({
      run, policy: policy.name, seed, term, turn,
      bar: (g as never as { bar?: number }).bar ?? 0,
      ledgers: g.ledgers, holders: holdersOf(g), acts: rows, whip: bot.whip,
      jev: { ...usageOf(g), ms: Math.round(bot.ms - before) },
      pending: (g as never as { pending?: string | null }).pending ?? null,
      wire: (g as never as { wire?: unknown[] }).wire ?? [],
    });
    if (g.turn === turn && g.stage === "session") throw new Error(`turn ${turn} did not advance`);
  }
  if (g.stage === "test") g = await bot.test(g);
  return g;
}

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const base = arg("base", "http://127.0.0.1:8799");
const scenario = arg("scenario", "v3nj3k");
const faction = arg("faction", "0");
const seeds = Number(arg("seeds", "8"));
const maxTerms = Number(arg("terms", "1"));
const only = arg("policies", "all");
const out = arg("out", `docs/bots/${new Date().toISOString().slice(0, 10)}`);

const chosen = only === "all" ? POLICIES : POLICIES.filter((p) => only.split(",").includes(p.name));
const planned = chosen.length * seeds * maxTerms;
if (planned > MAX_TERMS || planned * TERM_USD > BUDGET_USD) {
  console.error(`FAIL: ${planned} terms is about $${(planned * TERM_USD).toFixed(2)}, over the cap of ${MAX_TERMS} terms / $${BUDGET_USD}.`);
  process.exit(1);
}
console.log(`${chosen.length} policies x ${seeds} seeds x up to ${maxTerms} terms = at most ${planned} terms, about $${(planned * TERM_USD).toFixed(2)}`);

await mkdir(out, { recursive: true });
const runs: RunLog[] = [];
const turns: TurnLog[] = [];
let spent = 0;

for (const policy of chosen) {
  for (let s = 0; s < seeds; s++) {
    const seed = 20260922 + s;
    const run = `${policy.name}-${seed}`;
    const bot = new Bot(base);
    let g = await bot.seat(scenario, faction, [0, 1, 2], seed);
    let terms = 0;
    let term1Won: boolean | null = null;
    try {
      while (terms < maxTerms) {
        const from = turns.length;
        g = await runTerm(bot, policy, g, turns, seed, run);
        terms++;
        // The meter's own cost is the truth; TERM_USD is only the estimate the plan was budgeted with.
        const measured = turns.slice(from).reduce((a, t) => a + t.jev.cost, 0);
        spent += measured > 0 ? measured : TERM_USD;
        if (terms === 1) term1Won = (g.test as never as { won?: boolean } | undefined)?.won ?? null;
        if (spent > BUDGET_USD) throw new Error("budget");
        if (g.stage !== "won" || terms >= maxTerms) break;
        g = await bot.cont(g);
      }
      if (g.stage === "won") g = await bot.stop(g);
    } catch (e) {
      console.error(`  ${run}: ${(e as Error).message}`);
    }
    const t = g.test as never as { mandate?: number; bar?: number; won?: boolean } | undefined;
    runs.push({ run, game: g.id, policy: policy.name, seed, terms, ending: g.result?.ending ?? null, won: t?.won ?? null, term1Won, mandate: t?.mandate ?? null, bar: t?.bar ?? null, turns: [] });
    console.log(`${run}: ${terms} term(s), ${g.result?.ending ?? "unfinished"}, mandate ${t?.mandate?.toFixed(3) ?? "n/a"} vs bar ${t?.bar?.toFixed(3) ?? "n/a"}, ${bot.calls} calls`);
    if (spent > BUDGET_USD) { console.error(`stopping: $${spent.toFixed(2)} spent`); break; }
  }
  if (spent > BUDGET_USD) break;
}

await writeFile(`${out}/turns.jsonl`, turns.map((t) => JSON.stringify(t)).join("\n") + "\n");
await writeFile(`${out}/runs.json`, JSON.stringify(runs, null, 2));
console.log(`\n${runs.length} runs, ${turns.length} turns, about $${spent.toFixed(2)}. Wrote ${out}/turns.jsonl and ${out}/runs.json`);
