import { z } from "zod";
import { post, type Env } from "./jev";
import type { Bill, BillDraft, Member } from "./engine";
import type { Pack, Storylet } from "./pack";

const HeadlineSchema = z.object({ title: z.string(), lede: z.string() });
const CardSchema = z.object({ title: z.string(), body: z.string(), stances: z.array(z.string()).min(1).max(3) });
const EndingSchema = z.object({ title: z.string(), body: z.string() });

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
// The pack's own words and language, so the parliamentarian says decree when the era does.
const world = (pack: Pack) => ` Write in ${pack.lang}. The setting is ${pack.title}, ${pack.place}, ${pack.era}. Call a ${pack.vocabulary.bill} a "${pack.vocabulary.bill}" and the chamber "${pack.vocabulary.chamber}".`;
export const billDraftSchema = (pack: Pack) => z.object({ title: z.string(), summary: z.string(), tags: z.array(z.enum(pack.tags as [string, ...string[]])) });

export async function parseBill(env: Env, pack: Pack, text: string): Promise<BillDraft> {
  const d = await luna(env, billDraftSchema(pack), "bill",
    `You are the clerk of ${pack.vocabulary.chamber}. Turn the proposal into a ${pack.vocabulary.bill}. Title: 3 to 7 words. Summary: one paragraph, at most 60 words, neutral, states exactly what it does. Tags: 1 to 4 from the allowed list, only those it materially touches.${world(pack)}`,
    text, 400);
  return { title: clip(d.title, 80), summary: clip(d.summary, 600), tags: d.tags.slice(0, 4) };
}

export async function amendBill(env: Env, pack: Pack, bill: Bill, opponents: Member[], loudestBloc: string): Promise<BillDraft[]> {
  const d = await luna(env, z.object({ amendments: z.array(billDraftSchema(pack)) }), "amendments",
    `You are the government's whip in ${pack.vocabulary.chamber}. Propose exactly 3 distinct amendments that could win over the listed opponents while keeping the purpose. Each is a full replacement: title, summary (at most 60 words), tags. One narrows scope, one adds a sweetener for the opponents' regions or issues, one phases it in over time.${world(pack)}`,
    JSON.stringify({
      [pack.vocabulary.bill]: { title: bill.title, summary: bill.summary, tags: bill.tags },
      opponents: opponents.map((m) => ({ region: m.region, faction: m.faction, core_issues: m.core_issues, patrons: m.patrons })),
      loudest_opposing_group: loudestBloc,
    }), 900);
  return d.amendments.slice(0, 3).map((a) => ({ title: clip(a.title, 80), summary: clip(a.summary, 600), tags: a.tags.slice(0, 4) }));
}

export async function narrate(env: Env, pack: Pack, bill: Bill, defectors: Member[]): Promise<{ title: string; lede: string }> {
  const d = await luna(env, HeadlineSchema, "headline",
    `You write for ${pack.vocabulary.feed}. Write one headline (at most 12 words, no clickbait) and a two-sentence lede about this vote. Name at most two ${pack.vocabulary.member}s. Dry, factual, a little wry.${world(pack)}`,
    JSON.stringify({
      [pack.vocabulary.bill]: bill.title, summary: bill.summary, yes: bill.yes, needed: bill.threshold, of: pack.chamber.size,
      outcome: bill.passed ? pack.vocabulary.pass : pack.vocabulary.fail, struck_down: bill.struck,
      notable_defectors: defectors.map((m) => `${m.name} (${m.faction}, ${m.region})`), group_opposition_0_to_2: bill.blocs ?? {},
    }), 160);
  return { title: clip(d.title, 90), lede: clip(d.lede, 300) };
}

export async function cardText(env: Env, pack: Pack, storylet: Storylet, state: unknown): Promise<{ title: string; body: string; stances: string[] }> {
  const d = await luna(env, CardSchema, "card",
    `You write the crisis cards for ${pack.title}. From title_hint and stances, write the card: title (at most 8 words), body (at most 60 words, what happened and why it lands now), and one label per stance given, each at most 6 words.${world(pack)}`,
    JSON.stringify({ title_hint: storylet.title_hint, stances: storylet.stances, state }), 220);
  return { title: clip(d.title, 80), body: clip(d.body, 500), stances: d.stances.slice(0, storylet.stances.length).map((s) => clip(s, 40)) };
}

export async function ending(env: Env, pack: Pack, kind: keyof Pack["endings"], state: unknown): Promise<{ title: string; body: string }> {
  const d = await luna(env, EndingSchema, "ending",
    `You write the last page of a term in ${pack.title}. The ending is "${pack.endings[kind]}". Write a title (at most 8 words) and a body of 3 sentences from the record given.${world(pack)}`,
    JSON.stringify(state), 200);
  return { title: clip(d.title, 90), body: clip(d.body, 600) };
}
