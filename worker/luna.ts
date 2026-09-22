import { z } from "zod";
import { post, type Env } from "./jev";
import type { Bill, BillDraft, Event, Member } from "./engine";
import type { Pack, Storylet } from "./pack";

const HeadlineSchema = z.object({ title: z.string(), lede: z.string() });
const CardSchema = z.object({ title: z.string(), body: z.string(), stances: z.array(z.string()).min(1).max(3) });
const EndingSchema = z.object({ title: z.string(), body: z.string() });
const QuotesSchema = z.object({ quotes: z.array(z.object({ name: z.string(), text: z.string() })) });
const OutcomeSchema = z.object({ line: z.string() });

// Condensed from Wikipedia's "Signs of AI writing" so Luna's prose reads as written by a person.
const STYLE = ` Writing rules, strict: plain words, short sentences, concrete nouns and numbers. Use is/are/has, not "serves as", "stands as", "represents", "boasts". Never three items in a list, in a sentence or in a label: one or two. A title, a headline and a card title are capitalised like a sentence; only names keep their capitals. No em dashes, no double hyphens, straight quotes only. No "not just X, but Y". Never use: crucial, pivotal, key, vital, landscape, tapestry, testament, underscore, highlight, showcase, delve, foster, enhance, robust, vibrant, seamless, comprehensive, ensure, Additionally, Moreover. No -ing tails that add fake depth ("reflecting", "ensuring", "highlighting"). Attribute a claim to a person with a name, never to "observers", "critics", "sources". No hedging, no upbeat closers, no praise. Sound like a tired newsroom, not a press release.`;

export const LUNA = "openai/gpt-5.6-luna";

// env.MODEL swaps the model for every call a whole build step makes; the last argument swaps one call.
export async function luna<T>(env: Env, schema: z.ZodType<T>, name: string, system: string, user: string, maxTokens: number, model: string = env.MODEL ?? LUNA): Promise<T> {
  const body = {
    // Measured (scripts/luna-latency.ts): effort "none" ~1.4 s vs "low" ~3 s for a bill parse; latency-sorted routing shaves ~0.2 s.
    // Only Luna takes effort "none": Astra answers 400 "Reasoning is mandatory for this endpoint".
    model, max_tokens: maxTokens, provider: { sort: "latency" }, ...(model === LUNA ? { reasoning: { effort: "none" } } : {}),
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
const nameOf = (id: string, xs: { id: string; name: string }[]) => xs.find((x) => x.id === id)?.name ?? id;
// The pack's own words and language, so the parliamentarian says decree when the era does.
const world = (pack: Pack) => ` Write in ${pack.lang}. The setting is ${pack.title}, ${pack.place}, ${pack.era}. Call a ${pack.vocabulary.bill} a "${pack.vocabulary.bill}" and the chamber "${pack.vocabulary.chamber}".`;
export const billDraftSchema = (pack: Pack) => z.object({ title: z.string(), summary: z.string(), tags: z.array(z.enum(pack.tags as [string, ...string[]])) });

export async function parseBill(env: Env, pack: Pack, text: string): Promise<BillDraft> {
  const d = await luna(env, billDraftSchema(pack), "bill",
    `You are the clerk of ${pack.vocabulary.chamber}. Turn the proposal into a ${pack.vocabulary.bill}. Title: 3 to 7 words. Summary: one paragraph, at most 60 words, neutral, states exactly what it does. Tags: 1 to 4 from the allowed list, only those it materially touches.${world(pack)}`,
    text, 400);
  // A strict enum array can still repeat a value, and a repeat would keep a promise off one passed bill.
  return { title: clip(d.title, 80), summary: clip(d.summary, 600), tags: [...new Set(d.tags)].slice(0, 4) };
}

export async function amendBill(env: Env, pack: Pack, bill: Bill, opponents: Member[], loudestBloc: string): Promise<BillDraft[]> {
  const d = await luna(env, z.object({ amendments: z.array(billDraftSchema(pack)) }), "amendments",
    `You are the government's whip in ${pack.vocabulary.chamber}. Propose exactly 3 distinct amendments that could win over the listed opponents while keeping the purpose. Each is a full replacement: title, summary (at most 60 words), tags. One narrows scope, one adds a sweetener for the opponents' regions or issues, one phases it in over time.${world(pack)}`,
    JSON.stringify({
      [pack.vocabulary.bill]: { title: bill.title, summary: bill.summary, tags: bill.tags },
      opponents: opponents.map((m) => ({ region: m.region, faction: m.faction, core_issues: m.core_issues, patrons: m.patrons })),
      loudest_opposing_group: loudestBloc,
    }), 900);
  if (!d.amendments.length) throw new Error("Luna returned no amendment");
  return d.amendments.slice(0, 3).map((a) => ({ title: clip(a.title, 80), summary: clip(a.summary, 600), tags: [...new Set(a.tags)].slice(0, 4) }));
}

export async function narrate(env: Env, pack: Pack, bill: Bill, defectors: Member[]): Promise<{ title: string; lede: string }> {
  const d = await luna(env, HeadlineSchema, "headline",
    `You write for ${pack.vocabulary.feed}. Write one headline (at most 12 words, no clickbait) and a two-sentence lede about this vote. Name at most two ${pack.vocabulary.member}s. Dry, factual, a little wry.${world(pack)}`,
    JSON.stringify({
      [pack.vocabulary.bill]: bill.title, summary: bill.summary, yes: bill.yes, needed: bill.threshold, of: pack.chamber.size,
      outcome: bill.passed ? pack.vocabulary.pass : pack.vocabulary.fail, struck_down: bill.struck,
      notable_defectors: defectors.map((m) => `${m.name} (${m.faction}, ${m.region})`), group_opposition_0_to_2: bill.blocs ?? {},
    }), 220);
  return { title: clip(d.title, 90), lede: clip(d.lede, 300) };
}

// The speakers are the seats whose vote least matched their whip count, so the quote explains the surprise.
export async function quotes(env: Env, pack: Pack, bill: Bill, speakers: Member[]): Promise<{ name: string; text: string }[]> {
  if (!speakers.length) return [];
  const d = await luna(env, QuotesSchema, "quotes",
    `You are the clerk taking down what ${pack.vocabulary.member}s said right after the vote. One sentence for each speaker given, at most 25 words, in their own voice, no stage directions. Copy the name as given.${world(pack)}`,
    JSON.stringify({
      [pack.vocabulary.bill]: { title: bill.title, summary: bill.summary },
      outcome: bill.passed ? pack.vocabulary.pass : pack.vocabulary.fail, yes: bill.yes, needed: bill.threshold,
      speakers: speakers.map((m) => ({
        name: m.name, faction: nameOf(m.faction, pack.factions), region: nameOf(m.region, pack.regions),
        voted: bill.votes?.[m.id] ? "yes" : "no", was_expected_to_vote_yes: Math.round((bill.whip?.[m.id] ?? 0) * 100) + "%",
        core_issues: m.core_issues, temperament: m.temperament, tell: m.tell,
      })),
    }), 200);
  return d.quotes.slice(0, speakers.length).map((q) => ({ name: clip(q.name, 60), text: clip(q.text, 220) }));
}

export async function outcome(env: Env, pack: Pack, event: Event, stance: string, state: unknown): Promise<string> {
  const d = await luna(env, OutcomeSchema, "outcome",
    `You write ${pack.vocabulary.feed}'s one-line note on how the government handled this. At most 30 words, one sentence, says what the choice cost or won.${world(pack)}`,
    JSON.stringify({ event: event.card ?? { title: event.id }, stance_taken: stance, record: state }), 140);
  return clip(d.line, 220);
}

export async function cardText(env: Env, pack: Pack, storylet: Storylet, state: unknown): Promise<{ title: string; body: string; stances: string[] }> {
  const d = await luna(env, CardSchema, "card",
    `You write the crisis cards for ${pack.title}. From title_hint and stances, write the card: title (at most 8 words), body (at most 60 words, what happened and why it is on the desk this ${pack.vocabulary.turn}), and one label per stance given, each at most 6 words.${world(pack)}`,
    JSON.stringify({ title_hint: storylet.title_hint, stances: storylet.stances, state }), 220);
  return { title: clip(d.title, 80), body: clip(d.body, 500), stances: d.stances.slice(0, storylet.stances.length).map((s) => clip(s, 40)) };
}

export async function ending(env: Env, pack: Pack, kind: keyof Pack["endings"], state: unknown): Promise<{ title: string; body: string }> {
  const d = await luna(env, EndingSchema, "ending",
    `You write the last page of a term in ${pack.title}. The ending is "${pack.endings[kind] ?? kind}". Write a title (at most 8 words) and a body of 3 sentences from the record given. Say what happened, never what it meant for history.${world(pack)}`,
    JSON.stringify(state), 200);
  return { title: clip(d.title, 90), body: clip(d.body, 600) };
}

const RepliesSchema = z.object({ replies: z.array(z.object({ name: z.string(), text: z.string() })), rival: z.string() });
const MessagesSchema = z.object({ messages: z.array(z.string()) });
const PersonaSchema = (pack: Pack) => z.object({ rows: z.array(z.object({
  id: z.string(), name: z.string(), bio: z.string(), tell: z.string(),
  core_issues: z.array(z.enum(pack.tags as [string, ...string[]])).min(1).max(3),
})) });

export async function replies(env: Env, pack: Pack, text: string,
  loudest: { name: string; town: string; worldview: string; reaction: string }[], state: unknown) {
  const d = await luna(env, RepliesSchema, "replies",
    `You write what people said back to the government's ${pack.vocabulary.post}. One reply per person given, at most 25 words each, in their own voice, copy the name as given. Then write the rival's answer post, at most 240 characters, sharper than the government's.${world(pack)}`,
    JSON.stringify({ post: text, people: loudest, record: state }), 240);
  return { replies: d.replies.slice(0, 3).map((r) => ({ name: clip(r.name, 60), text: clip(r.text, 220) })), rival: clip(d.rival, 240) };
}

export async function messages(env: Env, pack: Pack, state: unknown): Promise<string[]> {
  const d = await luna(env, MessagesSchema, "messages",
    `You write the three lines the government could run on this ${pack.vocabulary.turn} of the race, from the record given. Each at most 20 words, each a different argument: one on what was kept, one on the biggest fight, one on what the other side would do.${world(pack)}`,
    JSON.stringify(state), 160);
  // A blank line is not a message the player can run on, and padding with one makes a campaign unplayable.
  const out = d.messages.map((m) => clip(m.trim(), 160)).filter(Boolean).slice(0, 3);
  if (!out.length) throw new Error("Luna returned no campaign message");
  while (out.length < 3) out.push(out[0]);
  return out;
}

export async function halfTerm(env: Env, pack: Pack, state: unknown) {
  const d = await luna(env, HeadlineSchema, "halfterm",
    `You write for ${pack.vocabulary.feed} the morning after the seats changed hands. The government lost seats_lost of the seats_changed seats that changed hands. One headline, at most 12 words, and a two-sentence lede on what the government has left at the half of its term.${world(pack)}`,
    JSON.stringify(state), 220);
  return { title: clip(d.title, 90), lede: clip(d.lede, 300) };
}

// Only the flipped seats. Identity is already fixed by code: the model writes prose and a name.
export async function newMembers(env: Env, pack: Pack, slots: { id: string; seat: string; region: string; faction: string; temperament: string; years: string }[]) {
  if (!slots.length) return [];
  const d = await luna(env, PersonaSchema(pack), "newmembers",
    `You write the people who just won these seats. Each row has its region, faction, temperament and years: never change them. Write name, bio (at most 40 words), tell (one visible habit, at most 18 words) and 1 to 3 core_issues from the tags. Names are invented, plausible for the period and place, never a real person. Every row is a different person.`,
    JSON.stringify({
      tags: pack.tags,
      rows: slots.map((s) => ({ id: s.id, region: nameOf(s.region, pack.regions), faction: nameOf(s.faction, pack.factions), temperament: s.temperament, years: s.years })),
    }), Math.min(4000, 400 + slots.length * 160));
  return d.rows.slice(0, slots.length).map((r) => ({ id: r.id, name: clip(r.name, 60), bio: clip(r.bio, 400), tell: clip(r.tell, 200), core_issues: r.core_issues }));
}
