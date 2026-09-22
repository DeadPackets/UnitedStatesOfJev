// Live check: one full term, end to end, against a running Worker.
// Run: bunx wrangler dev --config ./wrangler.dev.jsonc --port 8799
//      bun scripts/term.ts http://127.0.0.1:8799 [scenario] [faction] [p,p,p]
import type { GameView } from "../src/api";

const [base = "http://127.0.0.1:8799", scenario = "v3nj3k", faction = "caesarians", picks = "0,5,7"] = process.argv.slice(2);
const promises = picks.split(",").map(Number);

// Three texts, cycled: works, institutions, supply. No era and no place, so the gate takes them in any polity.
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
console.log(`${g.pack.title} — ${g.seatTitle}, ${faction}. code ${g.code} calendar ${g.calendar.start_date}/${g.calendar.unit}`);
console.log(`${g.pack.chamber.size} ${V.member}s, ${V.bill} needs ${g.pack.chamber.threshold}, ${V.promise}s: ${Object.values(g.promises).map((p) => p.label).join(" / ")}\n`);

const crises: string[] = [];
const timings: number[] = [];

while (g.stage === "session") {
  const turn = g.turn, t0 = performance.now();
  g = await api(`/games/${g.id}/bills`, { turn, text: TEXTS[(turn - 1) % TEXTS.length] });
  g = await api(`/games/${g.id}/bills/${turn}/whip`, { turn });
  const short = () => { const b = g.bills.at(-1)!; return (b.expected ?? 0) < (b.needed ?? Infinity); };

  // Amend when the count is short, and take the amendment with the highest expected yes.
  if (short()) {
    g = await api(`/games/${g.id}/bills/${turn}/amend`, { turn });
    const as = g.bills.at(-1)!.amendments ?? [];
    const best = as.reduce((a, b, i) => (b.expected > as[a].expected ? i : a), 0);
    if (as.length) {
      g = await api(`/games/${g.id}/bills/${turn}/amend/${best}`, { turn });
      console.log(`     amended: "${as[best].title}" (${as.map((a) => a.expected.toFixed(1)).join(", ")})`);
    }
  }

  // Offers to the likeliest holdouts while the count is short. The reserve is deliberate: an empty treasury
  // plus a sour party is the impeachment rule, so a scripted player that spends to zero never reaches turn 20.
  for (let n = 0; n < 2 && short() && g.ledgers.capital >= 30; n++) {
    const bill = g.bills.at(-1)!, whip = bill.whip ?? {};
    const target = g.members.filter((m) => (whip[m.id] ?? 0) < 0.5 && !bill.offers[m.id])
      .sort((a, b) => (whip[b.id] ?? 0) - (whip[a.id] ?? 0))[0];
    if (!target) break;
    g = await api(`/games/${g.id}/bills/${turn}/lobby`, { turn, memberId: target.id, action: "pork" });
  }

  g = await api(`/games/${g.id}/post`, { turn, text: POSTS[(turn - 1) % POSTS.length] });
  const p = g.posts.at(-1)!;
  console.log(`     ${V.post}: ${p.likes} like ${p.boos} boo ${p.shares} share ${p.ignores} ignore` +
    ` | duel ${p.agree.mine}/${p.agree.rival} -> ${p.won ? "won" : "lost"} | "${p.rival.slice(0, 80)}"`);

  g = await api(`/games/${g.id}/bills/${turn}/vote`, { turn });
  const voted = g.bills.find((b) => b.id === turn)!;

  const L = g.ledgers;
  const approval = g.pack.regions.reduce((a, r) => a + r.weight * (L.approval[r.id] ?? 50), 0) / g.pack.regions.reduce((a, r) => a + r.weight, 0);
  console.log(
    `${String(turn).padStart(2)} ${voted.passed ? (voted.struck ? "STRUCK" : V.pass.slice(0, 8).padEnd(8)) : V.fail.slice(0, 8).padEnd(8)}` +
    ` ${String(voted.yes).padStart(3)}/${voted.threshold}` +
    ` | ${V.approval} ${approval.toFixed(1)} ${V.capital} ${L.capital} party ${L.party} chest ${L.chest}` +
    ` | streak ${g.streak} | ${voted.headline?.title ?? "(no headline)"}`,
  );
  if (voted.quotes?.length) console.log(`     "${voted.quotes[0].text}" — ${voted.quotes[0].name}`);

  // The vote no longer moves the clock: End turn does, and the Director draws its card at that boundary.
  g = await api(`/games/${g.id}/turn/end`, { turn });
  console.log(`     end turn: ${g.wire.length} wire lines | ${g.pending ?? "(nothing pending)"}`);
  const open = g.events.findIndex((e) => e.stance === undefined);
  if (open >= 0) {
    const e = g.events[open];
    crises.push(`t${e.turn} ${e.id}${e.relief ? " (relief)" : ""} ${e.card?.title ?? ""}`);
    g = await api(`/games/${g.id}/events/${open}`, { turn: g.turn, stance: 0 });
    const done = g.events[open];
    console.log(`     ${e.relief ? "relief" : "crisis"} ${e.id} "${e.card?.title ?? ""}" -> "${e.stances[0]}": ${done.outcome ?? "(no line)"}`);
  }
  timings.push(performance.now() - t0);
  console.log(`     ${V.turn} ${turn} in ${ms(t0)}`);
  if (turn === g.turn) { console.error(`FAIL: ${V.turn} ${turn} did not advance`); process.exit(1); }

  if (g.stage === "midterm") {
    const m0 = performance.now();
    g = await api(`/games/${g.id}/midterm`, { turn: g.turn });
    const m = g.midterm!;
    console.log(`   ${V.midterm}: ${m.up.length} up, ${m.lost.length} lost (${m.lostOwn} own side)${m.wipeout ? " (wipeout)" : ""} in ${ms(m0)} | ${m.headline?.title ?? "(no headline)"}`);
    console.log(`     new: ${g.members.filter((x) => x.id.startsWith("r") && x.id.includes(`-${g.term}-`)).map((x) => `${x.name} (${x.seat}, ${x.faction})`).join(", ") || "none"}`);
  }
}

console.log(`\nturns 1..${timings.length} in ${ms(started)}; slowest ${(Math.max(...timings) / 1000).toFixed(1)}s, median ${(timings.sort((a, b) => a - b)[timings.length >> 1] / 1000).toFixed(1)}s`);
console.log(`crises drawn (${crises.length}):\n  ${crises.join("\n  ") || "none"}`);

while (g.stage === "campaign") {
  const t0 = performance.now();
  if (!g.campaign!.drafts.length) g = await api(`/games/${g.id}/campaign/drafts`, {});
  const c = g.campaign!;
  // Alternate: money on the weakest region the rival is also working, then a favor to the softest own seat.
  const own = g.members.filter((m) => m.faction === g.faction).sort((a, b) => a.loyalty - b.loyalty)[0];
  const lever = c.turns.length % 2 === 1 && own && g.ledgers.capital >= 25
    ? { kind: "favor", memberId: own.id }
    : { kind: "spend", regions: g.ledgers.chest >= 5 ? [{ id: c.rival[0] ?? g.pack.regions[0].id, amount: 5 }] : [] };
  g = await api(`/games/${g.id}/campaign`, { n: c.turns.length, message: c.drafts[0], lever });
  const t = g.campaign!.turns.at(-1)!;
  console.log(`${V.campaign} ${t.n}/4 "${t.message}"`);
  console.log(`     lever ${t.lever.kind} cost ${t.cost.chest}/${t.cost.capital}` +
    ` | public ${(t.public * 100).toFixed(1)}% band ${(t.band[0] * 100).toFixed(1)}-${(t.band[1] * 100).toFixed(1)}` +
    ` | rival in ${t.rival.join(", ")} | ${ms(t0)}`);
}

if (g.stage === "test") {
  const t0 = performance.now();
  g = await api(`/games/${g.id}/test`, {});
  console.log(`\n${V.test} in ${ms(t0)}`);
  const t = g.test!;
  console.log(`  loyalty ${t.loyalty.toFixed(3)} (drawn ${t.drawnLoyalty.toFixed(3)}) public ${t.public.toFixed(3)} (drawn ${t.drawnPublic.toFixed(3)})`);
  console.log(`  mandate ${t.mandate.toFixed(3)} bar ${t.bar.toFixed(2)}${t.early ? ` early, called by ${t.early}` : ""} -> ${t.won ? "WON" : "LOST"}`);
  console.log(`  ${t.holders.map((h) => `${h.name} ${h.stance.toFixed(2)} x ${h.weight.toFixed(2)}`).join(" | ")}`);
}
const term = g.terms.at(-1);
console.log(`\nending ${g.result?.ending} score ${g.result?.score}`);
if (term) console.log(`term ${term.term}: passed ${term.passed} kept ${term.kept} broken ${term.broken} mandate ${term.mandate.toFixed(3)} points ${term.points}`);
if (g.ending) console.log(`"${g.ending.title}" — ${g.ending.body}`);
if (g.stage === "won") {
  g = await api(`/games/${g.id}/continue`, {});
  console.log(`\ncontinue: term ${g.term} ${V.turn} ${g.turn} stage ${g.stage}, ${g.escalations.length} escalations, ${g.inForce.length} laws in force`);
  if (g.term !== 2 || g.turn !== 1 || g.stage !== "session") { console.error("FAIL: continue did not open term 2"); process.exit(1); }
}
console.log(`\n${calls} requests, ${ms(started)} total`);
if (performance.now() - started > 480_000) { console.error("FAIL: over 8 minutes"); process.exit(1); }
