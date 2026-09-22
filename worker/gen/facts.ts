import { z } from "zod";
import { luna } from "../luna";
import type { Env } from "../jev";
import { sourceBlock, type GenCtx } from "./prompts";

const FactsSchema = z.object({
  people: z.array(z.object({
    name: z.string(), role: z.string(), born: z.string().nullable(), died: z.string().nullable(), alive_on_start_date: z.boolean(),
  })),
  bodies: z.array(z.object({ name: z.string(), size: z.number().nullable(), how_chosen: z.string() })),
  groupings: z.array(z.object({ name: z.string(), leader: z.string().nullable(), members_named: z.array(z.string()) })),
  dated_events: z.array(z.object({ date: z.string(), title: z.string() })),
});
export type Facts = z.infer<typeof FactsSchema>;

const last = (n: string) => n.toLowerCase().trim().split(/\s+/).pop() ?? "";

export async function facts(env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  if (ctx.fiction) return { facts: { people: [], bodies: [], groupings: [], dated_events: [] } };
  const sheet = await luna(env, FactsSchema, "facts",
    `Extract a facts sheet from the sources for the scenario "${ctx.prompt}". people: every named person with role, born, died (YYYY-MM-DD or year, BC negative, null if unknown) and whether alive on the scenario's start date. bodies: assemblies or councils with size and how chosen. groupings: parties, factions or blocs with leader and named members. dated_events: every dated event with date and title. Use only what the sources state.`,
    sourceBlock(ctx), 4000);
  return { facts: mergeWikidata(sheet, ctx.sources?.people ?? []) };
}

// Wikidata years win over the sheet's; the sheet hallucinated dates in the measured runs, Wikidata did not.
export function mergeWikidata(sheet: Facts, people: { label: string; born: number | null; died: number | null }[]): Facts {
  return {
    ...sheet,
    people: sheet.people.map((p) => {
      const w = people.find((q) => q.label === p.name || last(q.label) === last(p.name));
      if (!w) return p;
      return { ...p, born: w.born !== null ? String(w.born) : p.born, died: w.died !== null ? String(w.died) : p.died };
    }),
  };
}
