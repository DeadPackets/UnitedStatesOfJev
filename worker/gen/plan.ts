import { z } from "zod";
import { luna } from "../luna";
import type { Env } from "../jev";
import { CONTENT_RULE, HISTORIAN, type GenCtx } from "./prompts";

const PlanSchema = z.object({
  fiction: z.boolean(),
  lang: z.string(),
  lookups: z.array(z.string()).max(10),
  people: z.array(z.string()).max(20),
  parties: z.array(z.string()).max(12),
  keywords: z.array(z.string()).max(12),
});
export type Plan = z.infer<typeof PlanSchema>;

const SYSTEM = `${HISTORIAN}
You are planning the research for one scenario. Name the sources to read before anything is written.
- fiction: true only when the scenario is invented and no real polity matches it.
- lang: the BCP 47 code of the language the pack should be written in, taken from the language of the scenario text.
- lookups: at most 10 Wikipedia article titles, exact, in the edition named by lang. The polity, the election or event, the governing body, and the main groupings. Empty when fiction is true.
- people: the named people of the period whose birth and death dates matter, at most 20. Empty when fiction is true.
- parties: the groupings whose colors and seat counts matter, at most 12. Empty when fiction is true.
- keywords: at most 12 section-heading words that pick the useful sections out of those articles, such as aftermath, composition, elections, government.
${CONTENT_RULE}`;

export async function plan(env: Env, ctx: GenCtx): Promise<Partial<GenCtx> & Plan> {
  return luna(env, PlanSchema, "plan", SYSTEM, `Scenario: ${ctx.prompt}`, 900);
}
