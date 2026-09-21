// Controlled experiment: criteria wording vs co-partisan baseline, and where the lobby offer should live. bun scripts/calib.ts
import { jev, whipState, senatorQuestion, type Question } from "../worker/jev";
import { newGame, encodeCode, type RosterSenator, type Senator } from "../worker/engine";
import roster from "../worker/roster.json";
const env = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY! } as any;
const game = newGame("c", encodeCode({ v: 1, party: "D", seats: 55, mode: "term", pop: 1, lobby: true, amend: true, agenda: 0, seed: 7 }), roster as RosterSenator[]);
const bills = [
  { id: 0, text: "", offers: {}, title: "Assault Weapons Buyback Act", summary: "Bans the sale of assault weapons and funds a federal buyback with a 5 percent tax on gun sales.", tags: ["guns", "taxes"] },
  { id: 1, text: "", offers: {}, title: "Rural Broadband Act", summary: "Spends $40 billion over five years to bring fiber internet to every county with under 50,000 people.", tags: ["infrastructure", "tech"] },
  { id: 2, text: "", offers: {}, title: "Corporate Tax Cut Act", summary: "Cuts the corporate income tax rate from 21 to 15 percent for ten years.", tags: ["taxes", "spending"] },
];
const B = (s: Senator): Question => { const q = senatorQuestion(s) as any; return { ...q, criteria: {
  true: "The senator votes yes. The bill serves their core issues, donors, or state, their party's leadership backs it, or the President has offered them something they want.",
  false: "The senator votes no. The bill hurts their core issues, donors, or state, or their party's leadership opposes it and nothing has been offered to them." } }; };
const mean = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
for (const bill of bills) {
  for (const [name, build] of [["A current", senatorQuestion], ["B party+offer", B]] as const) {
    const r = await jev(env, whipState(game, bill), Object.fromEntries(game.seated.map((s) => [s.id, build(s)])));
    const p = (party: string) => game.seated.filter((s) => s.party === party).map((s) => r.answers[s.id].noul!);
    console.log(`${bill.title.padEnd(30)} ${name.padEnd(14)} D=${mean(p("D"))} R=${mean(p("R"))} expected=${(Number(mean(p("D"))) * 55 + Number(mean(p("R"))) * 45).toFixed(1)}`);
  }
}
console.log("\n## lobby: offer in state vs offer inside the question, 6 lowest Democrats on the gun bill");
const base = await jev(env, whipState(game, bills[0]), Object.fromEntries(game.seated.map((s) => [s.id, senatorQuestion(s)])));
const low = game.seated.filter((s) => s.party === "D").sort((a, b) => base.answers[a.id].noul! - base.answers[b.id].noul!).slice(0, 6);
for (const s of low) {
  const offer = `The President promises a $200 million federal project in ${s.state}.`;
  const inState = await jev(env, whipState(game, bills[0], offer), { q: senatorQuestion(s) });
  const q = senatorQuestion(s) as any;
  const inQ = await jev(env, whipState(game, bills[0]), { q: { ...q, instructions: { ...q.instructions, offer_from_president: offer, question: "Given the President's offer, would this senator vote yes on `bill` on the floor?" } } });
  const inQB = await jev(env, whipState(game, bills[0]), { q: { ...B(s), instructions: { ...q.instructions, offer_from_president: offer, question: "Given the President's offer, would this senator vote yes on `bill` on the floor?" } } });
  console.log(`${s.id.padEnd(8)} ${s.temperament.padEnd(16)} base=${base.answers[s.id].noul}  state=${inState.answers.q.noul}  question=${inQ.answers.q.noul}  question+B=${inQB.answers.q.noul}`);
}
