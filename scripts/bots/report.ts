// The four checks of spec §11 plus R23's two targets, over one run of scripts/bots/run.ts.
// Run: bun scripts/bots/report.ts docs/bots/2026-09-22
import { readFile } from "node:fs/promises";
import { OWN_FAILURE, STYLES } from "./policies";
import type { RunLog, TurnLog } from "./run";

export const SKILL_GAP = 30; // TUNE: points the styles must beat greedy by (synthesis "Measuring it")
export const BRIER_LIMIT = 0.15; // TUNE: whip-band Brier
export const DRAW_SHARE = 0.2; // TUNE: share of the final mandate the draws may explain
export const WIN_SPREAD = 10; // TUNE: points the four styles' term-1 win rates may differ by (R23)
export const GAP_SCALE = 100; // TUNE: ledger points that count as one point of mandate

export type Check = { name: string; value: number; target: string; ok: boolean };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const variance = (xs: number[]) => {
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
};

/** One forecast a law: the whip's expected share against the share that voted yes. */
export function brier(turns: TurnLog[]): number {
  const pairs = turns
    .filter((t) => t.whip && t.whip.size > 0)
    .map((t) => [t.whip!.expected / t.whip!.size, t.whip!.yes / t.whip!.size] as const);
  return pairs.length ? mean(pairs.map(([p, o]) => (p - o) ** 2)) : 0;
}

/** R23 and §11 both mean the first term. A run continued to three terms still counts once, for term 1. */
export function winRates(runs: RunLog[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const policy of new Set(runs.map((r) => r.policy))) {
    const firsts = runs.filter((r) => r.policy === policy && r.term1Won !== null);
    out[policy] = firsts.length
      ? Math.round((firsts.filter((r) => r.term1Won).length / firsts.length) * 100)
      : 0;
  }
  return out;
}

/**
 * The share of the final mandate's spread that the policy does not explain (challenge-design §4).
 * Hold the policy fixed and the rest is the live unseeded draws: mean within-policy variance over the
 * variance of every run. 0 means the policy decides the mandate, 1 means the draws do.
 */
export function drawShare(runs: RunLog[]): number {
  const usable = runs.filter((r) => typeof r.mandate === "number");
  if (usable.length < 2) return 0;
  const total = variance(usable.map((r) => r.mandate as number));
  if (total === 0) return 0;
  const within: number[] = [];
  for (const policy of new Set(usable.map((r) => r.policy))) {
    const m = usable.filter((r) => r.policy === policy).map((r) => r.mandate as number);
    if (m.length > 1) within.push(variance(m));
  }
  return within.length ? Math.round((mean(within) / total) * 1000) / 1000 : 0;
}

/** A loss is flippable when one act's own realised ledger movement, undone, covers the gap to the bar. */
export function flippable(runs: RunLog[], turns: TurnLog[]): number {
  const losses = runs.filter((r) => r.won === false && r.mandate !== null && r.bar !== null);
  if (!losses.length) return 1;
  const hit = losses.filter((r) => {
    const gap = (r.bar as number) - (r.mandate as number);
    const mine = turns.filter((t) => t.run === r.run).flatMap((t) => t.acts);
    const worst = Math.max(
      0,
      ...mine.map((a) => Math.max(0, ...Object.values(a.realised).map((v) => -v))),
    );
    return worst >= gap * GAP_SCALE;
  });
  return Math.round((hit.length / losses.length) * 1000) / 1000;
}

/** R23: the median losing run of a style ends by that style's own failure. */
export function ownFailure(runs: RunLog[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const style of STYLES) {
    const lost = runs.filter((r) => r.policy === style && r.won === false && r.ending);
    const own = lost.filter((r) => OWN_FAILURE[style].includes(r.ending as string));
    out[style] = lost.length === 0 ? false : own.length * 2 >= lost.length;
  }
  return out;
}

export function report(runs: RunLog[], turns: TurnLog[]): { rows: Check[]; ok: boolean } {
  const rates = winRates(runs);
  const styleRate = mean(STYLES.map((s) => rates[s] ?? 0));
  const spread =
    Math.max(...STYLES.map((s) => rates[s] ?? 0)) - Math.min(...STYLES.map((s) => rates[s] ?? 0));
  const b = brier(turns),
    d = drawShare(runs),
    f = flippable(runs, turns);
  const own = ownFailure(runs);
  const rows: Check[] = [
    {
      name: "skill separation",
      value: Math.round(styleRate - (rates.greedy ?? 0)),
      target: `over ${SKILL_GAP} points`,
      ok: styleRate - (rates.greedy ?? 0) > SKILL_GAP,
    },
    {
      name: "forecast calibration",
      value: Math.round(b * 1000) / 1000,
      target: `Brier under ${BRIER_LIMIT}`,
      ok: b < BRIER_LIMIT,
    },
    { name: "lever identifiability", value: f, target: "every loss flippable", ok: f >= 1 },
    { name: "variance share", value: d, target: `under ${DRAW_SHARE}`, ok: d < DRAW_SHARE },
    {
      name: "style win spread",
      value: spread,
      target: `within ${WIN_SPREAD} points`,
      ok: spread <= WIN_SPREAD,
    },
    {
      name: "own failure",
      value: Object.values(own).filter(Boolean).length,
      target: `${STYLES.length} of ${STYLES.length} styles`,
      ok: Object.values(own).every(Boolean),
    },
  ];
  return { rows, ok: rows.every((r) => r.ok) };
}

if (import.meta.main) {
  const dir = process.argv[2] ?? `docs/bots/${new Date().toISOString().slice(0, 10)}`;
  const runs: RunLog[] = JSON.parse(await readFile(`${dir}/runs.json`, "utf8"));
  const turns: TurnLog[] = (await readFile(`${dir}/turns.jsonl`, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const rates = winRates(runs);

  console.log(`\n${dir}: ${runs.length} runs, ${turns.length} turns\n`);
  console.log("| Policy | Term-1 win rate | Runs |");
  console.log("|---|---|---|");
  for (const [policy, rate] of Object.entries(rates)) {
    console.log(`| ${policy} | ${rate}% | ${runs.filter((r) => r.policy === policy).length} |`);
  }
  const { rows, ok } = report(runs, turns);
  console.log("\n| Check | Value | Target | |");
  console.log("|---|---|---|---|");
  for (const r of rows)
    console.log(`| ${r.name} | ${r.value} | ${r.target} | ${r.ok ? "pass" : "FAIL"} |`);
  const per = (pick: (t: TurnLog) => number) =>
    Math.round(turns.reduce((a, t) => a + pick(t), 0) / Math.max(1, turns.length));
  const spent = turns.reduce((a, t) => a + t.jev.cost, 0);
  console.log(
    `\nJev: ${per((t) => t.jev.tokens)} input tokens and ${per((t) => t.jev.ms)} ms the average turn, largest single call ${Math.max(0, ...turns.map((t) => t.jev.worst))} tokens`,
  );
  console.log(
    `Cost: $${spent.toFixed(4)} over ${runs.length} runs, $${(
      spent /
        Math.max(
          1,
          runs.reduce((a, r) => a + r.terms, 0),
        )
    ).toFixed(4)} a term`,
  );
  process.exit(ok ? 0 : 1);
}
