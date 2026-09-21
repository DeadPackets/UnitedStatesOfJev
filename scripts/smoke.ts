// Live check: one whip count and one bill parse. Run: bun scripts/smoke.ts
import { jev, whipQuestions, whipState, gateQuestion } from "../worker/jev";
import { parseBill } from "../worker/luna";
import { newGame, encodeCode, expectedYes, type RosterSenator } from "../worker/engine";
import { STATE_IDS } from "../worker/states";
import { existsSync } from "node:fs";

const env = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY! } as any;
const roster: RosterSenator[] = existsSync("worker/roster.json") ? (await import("../worker/roster.json")).default as RosterSenator[]
  : STATE_IDS.flatMap((st) => [1, 2].flatMap((n) => (["D", "R"] as const).map((party) => ({
    id: `${st}-${n}-${party}`, seat: `${st}-${n}`, state: st, party, name: `Senator ${st}${n}`, bio: "", core_issues: ["taxes", "energy"],
    temperament: "deal-maker", tell: "votes with home-state employers", donors: ["banks"], years_in_office: "mid" as const }))));
const game = newGame("smoke", encodeCode({ v: 1, party: "D", seats: 50, mode: "term", pop: 0, lobby: true, amend: true, agenda: 0, seed: 42 }), roster);

const text = "Every American gets a $1,000 tax credit for installing rooftop solar, paid for by ending oil drilling subsidies.";
let t = performance.now();
const gate = await jev(env, { text }, gateQuestion());
console.log(`gate ${Math.round(performance.now() - t)}ms P(bill)=${gate.answers.gate.noul}`);
t = performance.now();
const draft = await parseBill(env, text);
console.log(`parse ${Math.round(performance.now() - t)}ms`, draft);
const bill = { id: 0, text, ...draft, offers: {} };
t = performance.now();
const w = await jev(env, whipState(game, bill), whipQuestions(game.seated));
const ms = Math.round(performance.now() - t);
const whip = Object.fromEntries(game.seated.map((s) => [s.id, w.answers[s.id].noul!]));
console.log(`whip ${ms}ms tokens=${w.usage.input_tokens} cost=$${w.usage.cost} expectedYes=${expectedYes(whip).toFixed(1)} filibuster=${w.answers.filibuster.noul} constitutional=${w.answers.constitutional.noul}`);
console.log("blocs", Object.fromEntries(Object.entries(w.answers).filter(([k]) => k.startsWith("bloc_")).map(([k, v]) => [k, v.score])));
if (w.usage.input_tokens > 25000 || ms > 1500) { console.error("SMOKE FAIL: over budget"); process.exit(1); }
