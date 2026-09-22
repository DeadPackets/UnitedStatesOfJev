import { z } from "zod";
import { luna } from "../luna";
import type { Env } from "../jev";
import { DATE_RE, type Storylet } from "../pack";
import { CONTENT_RULE, HISTORIAN, frameBrief, type GenCtx } from "./prompts";
import { TEMPLATES, TEMPLATE_IDS } from "./templates";
import { turnOf } from "./validate";

const LEDGERS = ["approval", "capital", "party", "chest", "bloc", "patron", "streak", "turn"] as const;
const Condition = z.object({ ledger: z.enum(LEDGERS), id: z.string().nullable(), op: z.enum(["<", ">"]), value: z.number() });
const Effect = z.object({
  ledger: z.enum([...LEDGERS, "seat"]), id: z.string().nullable(), delta: z.number().nullable(),
  set: z.string().nullable(), chance: z.number().min(0).max(1).nullable(),
});

export const DeckSchema = z.object({
  generic: z.array(z.object({
    template: z.enum(TEMPLATE_IDS), title_hint: z.string(), stances: z.array(z.string()).min(1).max(3), memory: z.string().nullable(),
  })).length(20),
  dated: z.array(z.object({
    date: z.string().regex(DATE_RE), exogenous: z.boolean(), title_hint: z.string(), stances: z.array(z.string()).min(1).max(3),
    scored: z.array(z.enum(["blocs", "patrons", "none"])).min(1), needs: z.array(Condition), results: z.array(Effect), memory: z.string().nullable(),
  })).min(5).max(8),
});

const SYSTEM = `${HISTORIAN}
You write the crisis deck for one term. Two kinds of card.
Generic cards: one per template, all 20, in the order given. The template fixes what the card does mechanically. You write title_hint (at most 8 words, the situation in the period's own terms), stances (exactly the number the template asks for, each at most 6 words, a real choice with a cost either way) and memory (one line a member would remember about the ruler afterwards, or null).
Dated cards: 5 to 8 real events of the period that fall inside the term. Each has date (YYYY-MM-DD; BC years negative, e.g. -0044-03-15), exogenous true when it happens whatever the ledgers say, false when it needs conditions, and then needs. needs use {ledger, id, op, value}; results use {ledger, id, delta, set, chance}; ledgers are approval, capital, party, chest, bloc, patron, streak, turn, plus seat for results; id is a bloc or patron id from the pack, otherwise null; unused fields are null. Keep deltas between -15 and 15.
${CONTENT_RULE}`;

// Templates address blocs and patrons by slot; the pack's own ids are filled in here.
function resolve<T extends { id?: string | null }>(rows: readonly T[], ctx: GenCtx): T[] {
  const slots: Record<string, string> = {};
  ctx.frame.blocs.forEach((b, i) => { slots[`$bloc${i + 1}`] = b.id; });
  ctx.frame.patrons.forEach((p, i) => { slots[`$patron${i + 1}`] = p.id; });
  return rows.map((r) => (r.id && slots[r.id] ? { ...r, id: slots[r.id] } : { ...r }));
}

const pad = (s: string[], n: number) => Array.from({ length: n }, (_, i) => s[Math.min(i, s.length - 1)]);

export async function deck(env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  const cal = ctx.calendar;
  if (!cal) throw new Error("deck needs a calendar");
  const d = await luna(env, DeckSchema, "deck", SYSTEM,
    JSON.stringify({
      ...frameBrief(ctx), turn_unit: cal.unit, term: `${cal.start_date} plus 20 ${cal.unit}s`,
      templates: TEMPLATES.map((t) => ({ template: t.id, about: t.note, stances: t.stances })),
    }), 9000);

  const byTemplate = new Map(d.generic.map((g) => [g.template, g]));
  const generic: Storylet[] = TEMPLATES.map((t, i) => {
    const g = byTemplate.get(t.id);
    return {
      id: `gen-${String(i + 1).padStart(2, "0")}`, kind: "generic" as const, weight: 1,
      title_hint: g?.title_hint ?? t.note, stances: pad(g?.stances ?? ["Act", "Wait", "Refuse"], t.stances),
      scored: t.scored, needs: resolve(t.needs, ctx), results: resolve(t.results, ctx), memory: g?.memory ?? null,
    };
  });

  const dated: Storylet[] = d.dated.map((s, i) => ({
    id: `dat-${String(i + 1).padStart(2, "0")}`, kind: "dated" as const, date: s.date,
    turn: turnOf(s.date, cal.start_date, cal.unit), exogenous: s.exogenous, weight: 1,
    title_hint: s.title_hint, stances: s.stances, scored: s.scored,
    needs: resolve(s.needs, ctx), results: resolve(s.results, ctx), memory: s.memory,
  })).filter((s) => s.turn !== null && s.turn >= 1 && s.turn <= 20);

  return { deck: [...generic, ...dated] };
}
