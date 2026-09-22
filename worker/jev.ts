import { popularity, record, threshold, type Bill, type Game, type Member } from "./engine";
import type { Citizen, Pack, Storylet } from "./pack";

export type Env = {
  GAME: DurableObjectNamespace; RL: RateLimit; OPENROUTER_API_KEY: string;
  DB: D1Database; VEC: VectorizeIndex; ART: R2Bucket; AI: Ai; BUILD: Workflow; BUILDS: DurableObjectNamespace; DAILY_BUILD_CAP: string;
};
export class UpstreamError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function post(env: Env, path: string, body: unknown): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let r: Response;
    try {
      r = await fetch(`https://openrouter.ai/api/v1/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://unitedstatesofjev.deadpackets.pw", "X-Title": "United States of Jev" },
      body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt < 2) { await new Promise((res) => setTimeout(res, 300)); continue; }
      throw new UpstreamError(0, String(e));
    }
    if (r.ok) return r.json();
    const text = await r.text();
    if (attempt === 0 && (r.status === 429 || r.status >= 500)) { await new Promise((res) => setTimeout(res, 300)); continue; }
    throw new UpstreamError(r.status, text.slice(0, 300));
  }
}

type Noul = { type: "noul"; instructions: unknown; criteria?: { true: string; false: string } };
type Score = { type: "score"; instructions: unknown; criteria: string[] };
type Choice = { type: "choice"; instructions: unknown; options: string[] };
export type Question = Noul | Score | Choice;
export type Answers = Record<string, { noul?: number; score?: number; probabilities?: Record<string, number> }>;

export async function jev(env: Env, state: unknown, questions: Record<string, Question>): Promise<{ answers: Answers; usage: { input_tokens: number; cost?: number } }> {
  // Choice options go on the wire as criteria keys with a null value, the shape measured against jev-1.13.
  const wire = Object.fromEntries(Object.entries(questions).map(([k, q]) => [k,
    q.type === "choice" ? { type: q.type, instructions: q.instructions, criteria: Object.fromEntries(q.options.map((o) => [o, null])) } : q]));
  const r = await post(env, "systemone", { model: "typesafe/jev-1.13", state, questions: wire });
  return { answers: r.answers, usage: r.usage };
}

export const nouls = (answers: Answers, prefix: string): Record<string, number> =>
  Object.fromEntries(Object.entries(answers).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v.noul ?? 0]));
export const scores = (answers: Answers, prefix: string): Record<string, number> =>
  Object.fromEntries(Object.entries(answers).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v.score ?? 0]));

export const gateQuestion = (pack: Pack): Record<string, Question> => ({
  gate: { type: "noul", instructions: `Is \`text\` a proposal for a ${pack.vocabulary.bill} that ${pack.vocabulary.chamber} could vote on?`,
    criteria: { true: "It proposes, changes, funds, bans, or repeals something the government does.", false: "It is a greeting, a question, gibberish, or unrelated text." } },
});

// Persona fields stay English in the pack so the calibrated criteria hold (v3 spec §8).
const persona = (pack: Pack, m: Member) => ({
  region: pack.regions.find((r) => r.id === m.region)?.name ?? m.region,
  faction: pack.factions.find((f) => f.id === m.faction)?.name ?? m.faction,
  years_in_office: m.years, core_issues: m.core_issues, temperament: m.temperament, tell: m.tell,
  patrons: m.patrons.map((p) => pack.patrons.find((x) => x.id === p)?.name ?? p),
  ...(m.situation ? { situation: m.situation } : {}), ...(m.memory.length ? { memory: m.memory } : {}),
});

// Measured 2026-09-21 (scripts/calib.ts): naming faction leadership and offers in the criteria lifts co-partisans
// 6-10 points; an offer inside the question moves a member ~22 points vs ~12 when it sits in the state.
export const memberQuestion = (pack: Pack, m: Member, offer?: string): Noul => ({
  type: "noul",
  instructions: {
    [pack.vocabulary.member]: persona(pack, m),
    ...(offer ? { offer_from_the_government: offer, question: `Given the offer, would this ${pack.vocabulary.member} vote yes on \`bill\` on the floor?` }
      : { question: `Would this ${pack.vocabulary.member} vote yes on \`bill\` on the floor?` }),
  },
  criteria: {
    true: "They vote yes. The proposal serves their core issues, patrons, or region, their faction's leadership backs it, or the government has offered them something they want.",
    false: "They vote no. The proposal hurts their core issues, patrons, or region, or their faction's leadership opposes it and nothing has been offered to them.",
  },
});

export function whipQuestions(pack: Pack, members: Member[]): Record<string, Question> {
  const qs: Record<string, Question> = {};
  for (const m of members) qs[m.id] = memberQuestion(pack, m);
  qs.filibuster = { type: "noul", instructions: `Would the opposition's leader block \`bill\` by procedure rather than lose the vote?`,
    criteria: { true: "The proposal is a major partisan priority the opposition strongly opposes.", false: "It is minor, cross-factional, or not worth the fight." } };
  for (const b of pack.blocs) qs[`bloc_${b.id}`] = { type: "score", instructions: { bloc: b.description, question: "How strongly does this group oppose `bill`?" },
    criteria: ["Indifferent or supportive", "Opposed", "Outraged"] };
  for (const p of pack.patrons) qs[`patron_${p.id}`] = { type: "score", instructions: { patron: p.name, wants: p.wants, hates: p.hates, question: "How strongly does this patron oppose `bill`?" },
    criteria: ["Indifferent or supportive", "Opposed", "Outraged"] };
  qs.constitutional = { type: "noul", instructions: `Does \`bill\` plainly exceed what the government of this polity may lawfully do?`,
    criteria: { true: "It clearly breaches a recognized right or limit on power in this polity.", false: "It is within ordinary legislative power, even if controversial." } };
  const veto = pack.chamber.veto;
  if (veto) for (const m of members.filter((x) => x.flags.includes(veto.flag))) {
    qs[`veto_${m.id}`] = { type: "noul", instructions: { [pack.vocabulary.member]: persona(pack, m), power: veto.text, question: "Would they use this power against `bill`?" },
      criteria: { true: "The proposal threatens what they or their institution protect.", false: "They let it go to the vote." } };
  }
  return qs;
}

export function whipState(pack: Pack, game: Game, bill: Bill) {
  const counts = new Map<string, number>();
  for (const m of game.members) counts.set(m.faction, (counts.get(m.faction) ?? 0) + 1);
  const largest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? game.faction;
  const name = (id: string) => pack.factions.find((f) => f.id === id)?.name ?? id;
  const start = pack.starts.find((s) => s.faction === game.faction);
  return {
    [pack.vocabulary.bill]: { title: bill.title, summary: bill.summary, tags: bill.tags },
    government: {
      title: start?.seat_title ?? "the government", faction: name(game.faction), popularity: popularity(pack, game),
      // Measured -6 to -10 on co-factionals (v2 §4): the whip count must see a leadership that has turned.
      ...(game.ledgers.party < 30 ? { party_leadership: "hostile" } : {}),
    },
    [pack.vocabulary.chamber]: { largest_faction: name(largest), needed_to_pass: threshold(pack, game, bill), of: pack.chamber.size },
    record: record(pack, game),
  };
}

const citizenPersona = (pack: Pack, c: Citizen) => ({
  name: c.name, age: c.age, job: c.job, town: c.town, region: pack.regions.find((r) => r.id === c.region)?.name ?? c.region,
  group: pack.blocs.find((b) => b.id === c.bloc)?.name ?? c.bloc, worldview: c.worldview, issues: c.issues,
});

// After every vote and every crisis. The bill or event and the record sit in the state, the persona in the question.
export function citizenQuestions(pack: Pack, citizens: Citizen[], event: "vote" | "crisis"): Record<string, Question> {
  const what = event === "vote" ? "the vote in `event`" : "how the government handled `event`";
  const qs: Record<string, Question> = {};
  for (const c of citizens) qs[c.id] = {
    type: "noul",
    instructions: { citizen: citizenPersona(pack, c), question: `After ${what}, does this person approve of the government?` },
    criteria: {
      true: `They approve. ${what} helps their region, their group, or the issues they name, or it matches their worldview.`,
      false: `They disapprove. ${what} hurts their region, their group, or the issues they name, or it offends their worldview.`,
    },
  };
  return qs;
}

export const citizenState = (pack: Pack, game: Game, event: unknown) => ({ event, record: record(pack, game) });

// Term end. chamber_loyalty is the mean of the confidence whip; public_intent the region-weighted citizen mean.
export function testQuestions(pack: Pack, game: Game): Record<string, Question> {
  const title = pack.starts.find((s) => s.faction === game.faction)?.seat_title ?? "the government";
  const qs: Record<string, Question> = {};
  for (const m of game.members) qs[`loyalty_${m.id}`] = {
    type: "noul",
    instructions: { [pack.vocabulary.member]: persona(pack, m), question: `confidence in the ${title}` },
    criteria: {
      true: `They still back the ${title} after this term's record.`,
      false: `They have lost confidence in the ${title} after this term's record.`,
    },
  };
  for (const c of pack.citizens) qs[`intent_${c.id}`] = {
    type: "noul",
    instructions: { citizen: citizenPersona(pack, c), question: `Would this person vote to keep the ${title} in power?` },
    criteria: { true: `The term's record served them well enough to keep the ${title}.`, false: `The term's record was bad enough for them to want a change.` },
  };
  return qs;
}
export const testState = (pack: Pack, game: Game) => ({ [pack.vocabulary.test]: pack.test.name, record: record(pack, game) });

export function eventQuestions(pack: Pack, scored: Storylet["scored"]): Record<string, Question> {
  const qs: Record<string, Question> = {};
  if (scored.includes("blocs")) for (const b of pack.blocs) qs[`bloc_${b.id}`] = {
    type: "score", instructions: { bloc: b.description, question: "How strongly does this group oppose the `stance` taken on `event`?" },
    criteria: ["Indifferent or supportive", "Opposed", "Outraged"] };
  if (scored.includes("patrons")) for (const p of pack.patrons) qs[`patron_${p.id}`] = {
    type: "score", instructions: { patron: p.name, wants: p.wants, hates: p.hates, question: "How strongly does this patron oppose the `stance` taken on `event`?" },
    criteria: ["Indifferent or supportive", "Opposed", "Outraged"] };
  return qs;
}
