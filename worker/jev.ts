import { popularity, record, threshold, type Bill, type Game, type Member, type Reaction } from "./engine";
import type { Citizen, Holder, Pack, Storylet } from "./pack";
import { recordGolden } from "./golden";

export type Env = {
  GAME: DurableObjectNamespace; RL: RateLimit; OPENROUTER_API_KEY: string;
  DB: D1Database; VEC: VectorizeIndex; ART: R2Bucket; AI: Ai; BUILD: Workflow; DAILY: Workflow;
  BUILDS: DurableObjectNamespace<import("./db").BuildsDO>; DAILY_BUILD_CAP: string; DAILY_GAME_CAP: string;
  DAILY_SECRET: string;
  MODEL?: string;
  BOTS?: string;
  GOLDEN?: string;
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
      // Measured 2026-09-22: a frame call stalled for 30 minutes with no answer and no error. 120 s is well
      // over the slowest measured call (72 s), and the retry below picks up another provider.
      signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      if (attempt < 2) { await new Promise((res) => setTimeout(res, 300)); continue; }
      throw new UpstreamError(0, String(e));
    }
    if (r.ok) {
      const answer = await r.json();
      // Only the two model endpoints are a prompt set. worker/art.ts:34 posts image bodies through this
      // same function, and a base64 sheet is not a prompt.
      if (path === "systemone" || path === "chat/completions") {
        await recordGolden(env, path === "systemone" ? "jev" : "luna", body, answer);
      }
      return answer;
    }
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

// Spec §11 wants tokens, cost and the largest single call a turn. One GameDO instance answers one request
// at a time and run.ts is sequential, so reset then read is safe; a shared isolate would need per-DO state.
export const meter = {
  tokens: 0, cost: 0, calls: 0, worst: 0,
  reset() { this.tokens = 0; this.cost = 0; this.calls = 0; this.worst = 0; },
};

export async function jev(env: Env, state: unknown, questions: Record<string, Question>): Promise<{ answers: Answers; usage: { input_tokens: number; cost?: number } }> {
  // Choice options go on the wire as criteria keys with a null value, the shape measured against jev-1.13.
  const wire = Object.fromEntries(Object.entries(questions).map(([k, q]) => [k,
    q.type === "choice" ? { type: q.type, instructions: q.instructions, criteria: Object.fromEntries(q.options.map((o) => [o, null])) } : q]));
  const r = await post(env, "systemone", { model: "typesafe/jev-1.13", state, questions: wire });
  // jev() is typed `usage: { input_tokens: number; cost?: number }`; there is no total_tokens on this response.
  const used = Number(r.usage?.input_tokens ?? 0);
  meter.tokens += used;
  meter.cost += Number(r.usage?.cost ?? 0);
  meter.worst = Math.max(meter.worst, used);
  meter.calls++;
  return { answers: r.answers, usage: r.usage };
}

export const nouls = (answers: Answers, prefix: string): Record<string, number> =>
  Object.fromEntries(Object.entries(answers).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v.noul ?? 0]));
export const scores = (answers: Answers, prefix: string): Record<string, number> =>
  Object.fromEntries(Object.entries(answers).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v.score ?? 0]));

export type MatchCandidate = { id: string; title: string; era: string; place: string; description: string };

// Candidates sit in the question, not the state, per §2: Jev sees at most 21 options and the prompt, under 3k tokens.
export const matchQuestion = (candidates: MatchCandidate[]): Choice => ({
  type: "choice",
  instructions: {
    candidates: Object.fromEntries(candidates.map((c) => [c.id, { title: c.title, era: c.era, place: c.place, description: c.description }])),
    question: "Does `prompt` describe the same scenario as one of `candidates`, a close variant of one, or something new?",
  },
  options: [...candidates.map((c) => c.id), "none_of_these"],
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
      ...(game.ledgers.loyalty < 30 ? { party_leadership: "hostile" } : {}),
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

// Measured: 250 citizen questions cost 42 to 55k tokens and the v3 test call reached 93% of the 64k cap.
// One holder is one call, and the street reads a seeded sample, not the whole roll.
export const HOLDER_SAMPLE = 50;   // TUNE

export function holderState(pack: Pack, game: Game, h: Holder): unknown {
  const s = game.holders[h.id];
  return {
    holder: { name: h.name, role: h.persona.role, wants: h.wants, red_lines: h.redLines },
    resistance: s?.resistance ?? 0, line: s?.line ?? h.line,
    [pack.vocabulary.test]: pack.constitution?.retention.name ?? pack.test.name,
    record: record(pack, game),
  };
}

export function holderQuestions(pack: Pack, game: Game, h: Holder, rows: { seats: Member[]; citizens: Citizen[] }): Record<string, Question> {
  const title = pack.constitution?.ruler.role ?? pack.starts.find((s) => s.faction === game.faction)?.seat_title ?? "the government";
  const qs: Record<string, Question> = {};
  const criteria = {
    true: `They would keep the ${title} after this term's record.`,
    false: `They would not keep the ${title} after this term's record.`,
  };
  if (h.members === "seats") {
    for (const m of rows.seats) qs[`stance_${m.id}`] = {
      type: "noul",
      instructions: { [pack.vocabulary.member]: persona(pack, m), whip: Math.round(m.loyalty), question: `Would this ${pack.vocabulary.member} keep the ${title} in power?` },
      criteria,
    };
    return qs;
  }
  if (h.members === "citizens") {
    for (const c of rows.citizens) qs[`stance_${c.id}`] = {
      type: "noul",
      instructions: {
        citizen: citizenPersona(pack, c),
        popularity_here: Math.round(game.ledgers.popularity[c.region] ?? 50),
        question: `Would this person keep the ${title} in power?`,
      },
      criteria,
    };
    return qs;
  }
  qs[`stance_${h.id}`] = {
    type: "noul",
    instructions: {
      holder: { name: h.persona.name, role: h.persona.role, bio: h.persona.bio, tell: h.persona.tell, wants: h.wants, red_lines: h.redLines },
      resistance: game.holders[h.id]?.resistance ?? 0,
      question: `Would ${h.name} keep the ${title} in power?`,
    },
    criteria,
  };
  return qs;
}

// _pack and _h: the caller has both and passes them so every holder read reads the same way, but the mean of
// the stance_ answers needs neither, and tsconfig.worker.json sets noUnusedParameters.
export function holderStance(_pack: Pack, _h: Holder, answers: Answers): number {
  const xs = Object.entries(answers).filter(([k]) => k.startsWith("stance_")).map(([, v]) => v.noul ?? 0);
  if (!xs.length) return 0.5;
  return Math.min(1, Math.max(0, xs.reduce((a, b) => a + b, 0) / xs.length));
}

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

export const choices = (answers: Answers, prefix: string): Record<string, string> =>
  Object.fromEntries(Object.entries(answers)
    .filter(([k, v]) => k.startsWith(prefix) && v.probabilities)
    .map(([k, v]) => [k.slice(prefix.length), Object.entries(v.probabilities!).sort((a, b) => b[1] - a[1])[0][0]]));

// Measured: 0 of 5,000 chose "share" over "like", which a reader does not see as exclusive; this wording is (analysis §5).
export const REACTIONS: Record<string, Reaction> = {
  "pass it on": "share", "like it and move on": "like", "boo it": "boo", "scroll past": "ignore",
};

export function reactQuestions(pack: Pack, citizens: Citizen[]): Record<string, Question> {
  const qs: Record<string, Question> = {};
  for (const c of citizens) qs[`react_${c.id}`] = {
    type: "choice",
    instructions: { citizen: citizenPersona(pack, c), question: "How does this person react to `post` from the government?" },
    options: Object.keys(REACTIONS),
  };
  return qs;
}
export const reactState = (pack: Pack, game: Game, text: string) => ({ post: text, record: record(pack, game) });

export function agreeQuestions(pack: Pack, citizens: Citizen[]): Record<string, Question> {
  const qs: Record<string, Question> = {};
  for (const c of citizens) qs[`agree_${c.id}`] = {
    type: "choice",
    instructions: { citizen: citizenPersona(pack, c), question: "Which of the two posts in `duel` does this person agree with?" },
    options: ["government", "rival"],
  };
  return qs;
}
export const agreeState = (_pack: Pack, mine: string, rival: string) => ({ duel: { government: mine, rival } });

// The money in this person's own region sits in their question; the messages and the record sit in the state.
export function voteQuestions(pack: Pack, game: Game, citizens: Citizen[],
  spend: Record<string, number>, rivalSpend: Record<string, number>): Record<string, Question> {
  const title = pack.starts.find((s) => s.faction === game.faction)?.seat_title ?? "the government";
  const qs: Record<string, Question> = {};
  for (const c of citizens) qs[`vote_${c.id}`] = {
    type: "noul",
    instructions: {
      citizen: citizenPersona(pack, c), spend_here: spend[c.region] ?? 0, rival_spend_here: rivalSpend[c.region] ?? 0,
      question: `Would this person vote to keep the ${title} in power?`,
    },
    criteria: {
      true: `The record and the messages in \`campaign\` are good enough to keep the ${title}.`,
      false: `The record and the messages in \`campaign\` are not good enough, or the rival has made the better case.`,
    },
  };
  return qs;
}
export const voteState = (pack: Pack, game: Game, messages: string[]) =>
  ({ campaign: { [pack.vocabulary.test]: pack.test.name, messages }, record: record(pack, game) });
