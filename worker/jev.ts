import { BLOCS, popularity, type Bill, type Game, type Senator } from "./engine";
import { STATES } from "./states";

export type Env = { GAME: DurableObjectNamespace; RL: RateLimit; OPENROUTER_API_KEY: string };
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
export type Question = Noul | Score;
export type Answers = Record<string, { noul?: number; score?: number; probabilities?: Record<string, number> }>;

export async function jev(env: Env, state: unknown, questions: Record<string, Question>): Promise<{ answers: Answers; usage: { input_tokens: number; cost?: number } }> {
  const r = await post(env, "systemone", { model: "typesafe/jev-1.13", state, questions });
  return { answers: r.answers, usage: r.usage };
}

export const gateQuestion = (): Record<string, Question> => ({
  gate: { type: "noul", instructions: "Is `text` a proposal for a law, program, or government policy that a legislature could vote on?",
    criteria: { true: "It proposes, changes, funds, bans, or repeals something a government does.", false: "It is a greeting, a question, gibberish, or unrelated text." } },
});

const persona = (s: Senator) => ({
  state: STATES[s.state].name, party: s.party === "D" ? "Democrat" : "Republican", years_in_office: s.years_in_office,
  core_issues: s.core_issues, temperament: s.temperament, tell: s.tell, donors: s.donors,
  ...(s.situation ? { situation: s.situation } : {}), ...(s.memory.length ? { memory: s.memory } : {}),
});

export const senatorQuestion = (s: Senator): Noul => ({
  type: "noul",
  instructions: { senator: persona(s), question: "Would this senator vote yes on `bill` on the floor?" },
  criteria: {
    true: "The senator votes yes. The bill serves their core issues, donors, or state, or a favor is owed.",
    false: "The senator votes no. The bill hurts their core issues, donors, or state, or their party opposes it and no favor is owed.",
  },
});

const BLOC_DESC: Record<(typeof BLOCS)[number], string> = {
  business: "business owners and investors", labor: "unions and working-class voters", seniors: "retirees and people over 65",
  youth: "voters under 30", rural: "farmers and small-town voters",
};

export function whipQuestions(seated: Senator[]): Record<string, Question> {
  const qs: Record<string, Question> = {};
  for (const s of seated) qs[s.id] = senatorQuestion(s);
  qs.filibuster = { type: "noul", instructions: "Would the minority party's leader mount a filibuster to block `bill`?",
    criteria: { true: "The bill is a major partisan priority the minority strongly opposes.", false: "The bill is minor, bipartisan, or not worth a filibuster." } };
  for (const b of BLOCS) qs[`bloc_${b}`] = { type: "score", instructions: { bloc: BLOC_DESC[b], question: "How strongly does this bloc oppose `bill`?" },
    criteria: ["Indifferent or supportive", "Opposed", "Outraged"] };
  qs.constitutional = { type: "noul", instructions: "Does `bill` plainly violate the United States Constitution?",
    criteria: { true: "It clearly breaches an enumerated right or limit, such as banning speech or a religion.", false: "It is within ordinary legislative power, even if controversial." } };
  return qs;
}

export function whipState(game: Game, bill: Bill, offer?: string) {
  const majority = game.seated.filter((s) => s.party === "D").length > 50 ? "Democrat" : "Republican";
  return {
    bill: { title: bill.title, summary: bill.summary, tags: bill.tags },
    president: { party: game.settings.party === "D" ? "Democrat" : "Republican", popularity: popularity(game) },
    chamber: { majority, session: game.settings.mode === "term" && game.turn >= 30 ? "election year" : "regular session" },
    ...(offer ? { offer } : {}),
  };
}
