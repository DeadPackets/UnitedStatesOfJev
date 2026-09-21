import { z } from "zod";
import { post, type Env } from "./jev";
import { TAGS, type Bill, type BillDraft, type Senator } from "./engine";

export const BillDraftSchema = z.object({ title: z.string(), summary: z.string(), tags: z.array(z.enum(TAGS)) });
const AmendmentsSchema = z.object({ amendments: z.array(BillDraftSchema) });
const HeadlineSchema = z.object({ title: z.string(), lede: z.string() });

// Condensed from Wikipedia's "Signs of AI writing" so Luna's prose reads as written by a person.
const STYLE = ` Writing rules, strict: plain words, short sentences, concrete nouns and numbers. Use is/are/has, not "serves as", "stands as", "represents", "boasts". No em dashes. No groups of three for effect. No "not just X, but Y". Never use: crucial, pivotal, key, vital, landscape, tapestry, testament, underscore, highlight, showcase, delve, foster, enhance, robust, vibrant, seamless, comprehensive, ensure, Additionally, Moreover. No -ing tails that add fake depth ("reflecting", "ensuring", "highlighting"). No hedging, no upbeat closers, no praise. Straight quotes only. Sound like a tired newsroom, not a press release.`;

export async function luna<T>(env: Env, schema: z.ZodType<T>, name: string, system: string, user: string, maxTokens: number): Promise<T> {
  const body = {
    // Measured (scripts/luna-latency.ts): effort "none" ~1.4 s vs "low" ~3 s for a bill parse; latency-sorted routing shaves ~0.2 s.
    model: "openai/gpt-5.6-luna", max_tokens: maxTokens, reasoning: { effort: "none" }, provider: { sort: "latency" },
    messages: [{ role: "system", content: system + STYLE }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema: z.toJSONSchema(schema) } },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await post(env, "chat/completions", body);
    const content = r.choices?.[0]?.message?.content;
    if (!content) { console.warn("luna: no content", JSON.stringify(r).slice(0, 200)); await new Promise((res) => setTimeout(res, 500)); continue; }
    try {
      const parsed = schema.safeParse(JSON.parse(content));
      if (parsed.success) return parsed.data;
    } catch {}
  }
  throw new Error("Luna returned an invalid " + name);
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export async function parseBill(env: Env, text: string): Promise<BillDraft> {
  const d = await luna(env, BillDraftSchema, "bill",
    "You are the Senate parliamentarian. Turn the President's proposal into a bill. Title: 3 to 7 words, ending in Act. Summary: one paragraph, at most 60 words, neutral, states exactly what the bill does. Tags: 1 to 4 from the allowed list, only those the bill materially touches.",
    text, 400);
  return { title: clip(d.title, 80), summary: clip(d.summary, 600), tags: d.tags.slice(0, 4) };
}

export async function amendBill(env: Env, bill: Bill, opponents: Senator[], loudestBloc: string): Promise<BillDraft[]> {
  const d = await luna(env, AmendmentsSchema, "amendments",
    "You are a Senate whip. Propose exactly 3 distinct amendments that could win over the listed opponents while keeping the bill's purpose. Each is a full replacement: title, summary (at most 60 words), tags. One narrows scope, one adds a sweetener for the opponents' states or issues, one phases it in over time.",
    JSON.stringify({ bill: { title: bill.title, summary: bill.summary, tags: bill.tags }, opponents: opponents.map((s) => ({ state: s.state, party: s.party, core_issues: s.core_issues, donors: s.donors })), loudest_opposing_bloc: loudestBloc }),
    900);
  return d.amendments.slice(0, 3).map((a) => ({ title: clip(a.title, 80), summary: clip(a.summary, 600), tags: a.tags.slice(0, 4) }));
}

export async function narrate(env: Env, bill: Bill, yes: number, threshold: number, defectors: Senator[], blocs: Record<string, number>): Promise<{ title: string; lede: string }> {
  const d = await luna(env, HeadlineSchema, "headline",
    "You are a wire-service political editor. Write one newspaper headline (at most 12 words, no clickbait) and a two-sentence lede about this Senate vote. Name at most two senators. Dry, factual, a little wry.",
    JSON.stringify({ bill: bill.title, summary: bill.summary, yes, no: 100 - yes, needed: threshold, passed: bill.passed, struck_down_by_court: bill.struck, notable_defectors: defectors.map((s) => `${s.name} (${s.party}-${s.state})`), bloc_opposition_0_to_2: blocs }),
    160);
  return { title: clip(d.title, 90), lede: clip(d.lede, 300) };
}
