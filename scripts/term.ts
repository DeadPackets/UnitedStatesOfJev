// Live check: one full term, end to end, against a running Worker.
// Run: bunx wrangler dev --config ./wrangler.dev.jsonc --port 8799
//      bun scripts/term.ts http://127.0.0.1:8799 [scenario] [faction] [p,p,p]
import type { GameView } from "../src/api";

const [base = "http://127.0.0.1:8799", scenario = "v3nj3k", faction = "caesarians", picks = "0,5,7"] = process.argv.slice(2);
const promises = picks.split(",").map(Number);

// Three typed acts, cycled: works, institutions, supply. No era and no place, so the clerk prices them in any polity.
const TEXTS = [
  "Repair the roads, the water supply and the public buildings, and publish the accounts of the works each month.",
  "Set new rules for the officials who govern: fixed terms, published accounts, and a court that hears claims of extortion.",
  "Fund the supply of food and fuel for the coming year out of the treasury, and fix the duties charged on what is brought in.",
];

// One post a turn, cycled. Each is inside the 240 characters the Feed takes.
const POSTS = [
  "The roads, the water and the public buildings get fixed this year, and the accounts of every work go up in public each month. Read them. Then tell me what else is broken.",
  "An official who robs the public will answer for it in a court, with a fixed term and published books. The people who fear that rule are telling you who they are.",
  "Food and fuel for the coming year are paid for out of the treasury, and the duties are fixed. No family here eats worse because a merchant found a new price.",
];

const ms = (t: number) => `${((performance.now() - t) / 1000).toFixed(1)}s`;
let calls = 0;

async function api(path: string, body?: unknown): Promise<GameView> {
  for (let attempt = 0; ; attempt++) {
    calls++;
    const r = await fetch(`${base}/api${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
    if (r.ok) return r.json() as Promise<GameView>;
    const text = await r.text();
    // 40 requests a minute is the Worker's own cap and a full turn is 5 calls; back off rather than fail the run.
    if (r.status === 429 && attempt < 5) { await new Promise((res) => setTimeout(res, 3000)); continue; }
    if (r.status >= 500) { console.error(`FAIL ${r.status} ${path}: ${text.slice(0, 300)}`); process.exit(1); }
    throw new Error(`${r.status} ${path}: ${text.slice(0, 300)}`);
  }
}

const started = performance.now();
let g = await api("/games", { scenario, faction, promises, seed: 20260922 });
const V = g.pack.vocabulary;
console.log(`${g.pack.title}: ${g.seatTitle}, ${faction}. code ${g.code} calendar ${g.calendar.start_date}/${g.calendar.unit}`);
console.log(`${g.pack.chamber.size} ${V.member}s, ${V.bill} needs ${g.pack.chamber.threshold}, bar ${g.bar.toFixed(2)}` +
  `, room: ${g.holders.map((h) => `${h.name} (${h.weight.toFixed(2)})`).join(", ")}`);
console.log(`${V.promise}s: ${Object.values(g.promises).map((p) => p.label).join(" / ")}\n`);

const crises: string[] = [];
const timings: number[] = [];
const refusals: string[] = [];

// C5 caps a turn at six model calls. Every optional call asks first, so the script never earns a 409.
const afford = (n: number) => g.calls.spent + n <= g.calls.cap;
// The view greys an instrument the ledgers or a failure line close; a tag is committed only when it can be paid.
const open = (v: "law" | "proclaim") => g.instruments[v]?.affordable === true;
const pays = (c: { authority: number; treasury: number; chest: number }) =>
  c.authority <= g.ledgers.authority && c.treasury <= g.ledgers.treasury && c.chest <= g.ledgers.chest;

// A won early test resumes the session, so the test sits inside the loop and the term plays on after it.
while (g.stage === "session" || g.stage === "midterm" || g.stage === "test") {
  if (g.stage === "test") {
    const t0 = performance.now();
    g = await api(`/games/${g.id}/test`, {});
    console.log(`\n${V.test} in ${ms(t0)}`);
    const t = g.test;
    if (t) {
      for (const h of t.holders) console.log(`  ${h.counted ? "x" : " "} ${h.name.padEnd(24)} weight ${h.weight.toFixed(2)} stance ${h.stance.toFixed(3)}`);
      console.log(`  mandate ${t.mandate.toFixed(3)} against a bar of ${t.bar.toFixed(3)} -> ${t.won ? "WON" : "LOST"}`);
    } else console.log(`  an early test was survived; the term goes on at ${V.turn} ${g.turn}`);
    continue;
  }
  const turn = g.turn, t0 = performance.now();

  if (g.stage === "midterm") {
    const m0 = performance.now();
    g = await api(`/games/${g.id}/midterm`, { turn });
    const m = g.midterm!;
    console.log(`   ${V.midterm}: ${m.up.length} up, ${m.lost.length} lost (${m.lostOwn} own side)${m.wipeout ? " (wipeout)" : ""} in ${ms(m0)} | ${m.headline?.title ?? "(no headline)"}`);
    if (g.stage !== "session") break;
  }

  // The card first: an unanswered one blocks the boundary.
  const card = g.events.findIndex((e) => e.stance === undefined);
  if (card >= 0 && afford(2)) {
    const e = g.events[card];
    crises.push(`t${e.turn} ${e.kind ?? "crisis"} ${e.id} ${e.card?.title ?? ""}`);
    g = await api(`/games/${g.id}/events/${card}`, { turn, stance: 0 });
    console.log(`     ${e.kind ?? "crisis"} ${e.id} "${e.card?.title ?? ""}" -> "${e.stances[0]}": ${g.events[card].outcome ?? "(no line)"}`);
  }

  // A law: price it, commit it, and the whip is counted inside the commit.
  let tabled = false;
  if (afford(2) && open("law")) {
    g = await api(`/games/${g.id}/acts/price`, { turn, verb: "law", text: TEXTS[(turn - 1) % TEXTS.length] });
    if (g.refusal) refusals.push(`t${turn} ${g.refusal.test}: ${g.refusal.line}`);
    else if (!pays(g.tag!.charge)) console.log(`${String(turn).padStart(2)} law "${g.tag!.title}" left on the desk: the ledgers cannot pay for it`);
    else {
      const tag = g.tag!;
      console.log(`${String(turn).padStart(2)} ${tag.verb} "${tag.title}" cost ${tag.charge.authority}a/${tag.charge.treasury}t/${tag.charge.chest}c` +
        ` cred ${tag.credibility}${tag.discounted ? " (discounted)" : ""} | serves ${tag.serves.join(",") || "-"} hits ${tag.hits.join(",") || "-"}`);
      console.log(`     "${tag.reading}"`);
      g = await api(`/games/${g.id}/acts`, { turn });
      const bill = g.bills.at(-1)!;
      console.log(`     band ${bill.band?.[0]} to ${bill.band?.[1]} of ${bill.needed}, expected ${bill.expected}`);
      tabled = true;
    }
  }

  // One lobby on turn 1 and one amendment on turn 2, so both routes are exercised once each.
  if (tabled && turn === 1 && afford(1)) {
    const soft = [...g.members].sort((a, b) => a.loyalty - b.loyalty)[0];
    g = await api(`/games/${g.id}/bills/${turn}/lobby`, { turn, memberId: soft.id, action: "pork" });
    console.log(`     ${V.lobby} ${soft.name}: expected now ${g.bills.at(-1)!.expected}`);
  }
  if (tabled && turn === 2 && afford(3)) {
    g = await api(`/games/${g.id}/bills/${turn}/amend`, { turn });
    const rows = g.bills.at(-1)!.amendments ?? [];
    console.log(`     amendments: ${rows.map((a) => `${a.title} (${a.expected})`).join(" | ") || "none"}`);
    if (rows.length) {
      g = await api(`/games/${g.id}/bills/${turn}/amend/0`, { turn });
      console.log(`     adopted "${g.bills.at(-1)!.title}"`);
    }
  }

  if (tabled && afford(1)) {
    g = await api(`/games/${g.id}/bills/${turn}/vote`, { turn });
    const voted = g.bills.find((b) => b.id === turn)!;
    console.log(`     ${voted.passed ? (voted.struck ? "STRUCK" : V.pass) : V.fail} ${voted.yes}/${voted.threshold} | ${voted.headline?.title ?? "(no headline)"}`);
  }

  if (afford(3) && open("proclaim")) {
    g = await api(`/games/${g.id}/acts/price`, { turn, verb: "proclaim", text: POSTS[(turn - 1) % POSTS.length] });
    if (g.refusal) refusals.push(`t${turn} ${g.refusal.test}: ${g.refusal.line}`);
    else if (pays(g.tag!.charge)) {
      g = await api(`/games/${g.id}/acts`, { turn });
      const p = g.posts.at(-1)!;
      console.log(`     ${V.post}: ${p.likes} like ${p.boos} boo ${p.shares} share ${p.ignores} ignore | duel ${p.agree.mine}/${p.agree.rival} -> ${p.won ? "won" : "lost"}`);
    }
  }

  g = await api(`/games/${g.id}/turn/end`, { turn });
  const L = g.ledgers;
  const nat = g.pack.regions.reduce((a, r) => a + r.weight * (L.popularity[r.id] ?? 50), 0) / g.pack.regions.reduce((a, r) => a + r.weight, 0);
  console.log(`     ledgers treasury ${L.treasury} authority ${L.authority} chest ${L.chest} loyalty ${L.loyalty} popularity ${nat.toFixed(1)}` +
    ` | calls ${g.calls.spent}/${g.calls.cap} | room ${g.holders.map((h) => `${h.id} ${Math.round(h.resistance)}/${h.line}`).join(" ")}`);
  for (const w of g.wire.slice(0, 4)) console.log(`     wire ${w.kind} ${w.ledger ?? w.id ?? ""} ${w.delta > 0 ? "+" : ""}${w.delta} (${w.cause})`);
  if (g.pending) console.log(`     next: ${g.pending}`);
  timings.push(performance.now() - t0);
  if (turn === g.turn) { console.error(`FAIL: ${V.turn} ${turn} did not advance`); process.exit(1); }
}

console.log(`\nturns 1..${timings.length} in ${ms(started)}; slowest ${(Math.max(...timings) / 1000).toFixed(1)}s, median ${([...timings].sort((a, b) => a - b)[timings.length >> 1] / 1000).toFixed(1)}s`);
console.log(`cards drawn (${crises.length}):\n  ${crises.join("\n  ") || "none"}`);
if (refusals.length) console.log(`refused (${refusals.length}):\n  ${refusals.join("\n  ")}`);

// continueTerm clears result and ending, so they print before the continue.
const term = g.terms.at(-1);
console.log(`\nending ${g.result?.ending} score ${g.result?.score}`);
if (term) console.log(`term ${term.term}: passed ${term.passed} kept ${term.kept} broken ${term.broken} mandate ${term.mandate.toFixed(3)} points ${term.points}`);
if (g.ending) console.log(`"${g.ending.title}": ${g.ending.body}`);

// The two doors out of "won" share a guard, so the script takes the one that exercises freshCards.
// POST /games/:id/stop is the other; worker/game.test.ts covers it.
if (g.stage === "won") {
  g = await api(`/games/${g.id}/continue`, {});
  console.log(`\ncontinued into ${V.turn} ${g.turn} of term ${g.term}`);
  if (g.term !== 2 || g.turn !== 1 || g.stage !== "session") { console.error("FAIL: continue did not open term 2"); process.exit(1); }
}
console.log(`\n${calls} requests, ${ms(started)} total`);
if (performance.now() - started > 480_000) { console.error("FAIL: over 8 minutes"); process.exit(1); }
