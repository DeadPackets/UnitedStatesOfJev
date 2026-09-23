import { luna } from "../luna";
import type { Env } from "../jev";
import { ConstitutionSchema, HOLDER_RESPONSES, VERBS, type Constitution } from "../pack";
import { CONTENT_RULE, HISTORIAN, frameBrief, type GenCtx } from "./prompts";
import { NeedsRepair, constitution as check } from "./validate";

// Scale, then clamp to the 0.15 to 0.6 band, with the scale found by bisection: the sum rises with the scale,
// so it lands on 1 whenever 2 to 6 holders vote. The live model gave minor holders 0.1 and repeated it on retry.
const LO = 0.15, HI = 0.6;
// Every holder opens near even: the live Biden pack came back with every stance 0, which no ruler can pass the test from.
const STANCE_LO = 0.3, STANCE_HI = 0.7;   // TUNE
function band(vs: number[]): number[] {
  if (vs.length * LO > 1 || vs.length * HI < 1) { const t = vs.reduce((a, b) => a + b, 0); return vs.map((v) => v / t); }
  const at = (k: number) => vs.map((v) => Math.min(HI, Math.max(LO, v * k)));
  let lo = 0, hi = HI / Math.min(...vs);
  for (let i = 0; i < 100; i++) { const k = (lo + hi) / 2; if (at(k).reduce((a, b) => a + b, 0) < 1) lo = k; else hi = k; }
  return at(hi);
}

export function settleConstitution(c: Constitution, chamberExists: boolean): { constitution: Constitution; violations: string[] } {
  const ids = new Set(c.holders.map((h) => h.id));
  const kept = c.retention.weights.filter((w) => ids.has(w.id) && w.value > 0);
  const values = kept.length ? band(kept.map((w) => w.value)) : [];
  const weights = kept.map((w, i) => ({ id: w.id, value: values[i] }));
  const bar = { ...c.retention.bar, step: Math.max(0, c.retention.bar.step), cap: Math.max(c.retention.bar.start, c.retention.bar.cap) };
  const holders = c.holders.map((h) => ({ ...h, stance: Math.min(STANCE_HI, Math.max(STANCE_LO, h.stance)) }));
  const fixed: Constitution = { ...c, holders, retention: { ...c.retention, weights, bar } };
  return { constitution: fixed, violations: check(fixed, chamberExists) };
}

const SYSTEM = `${HISTORIAN}
You write the constitution of this polity in this year: who holds power beside the ruler and who can make the ruler stop.
- ruler: the office the player holds and the faction id they belong to, from the factions given.
- holders: 2 to 6 at home and 1 to 3 abroad plus the international community. A home holder is a body that mattered that year: the chamber where one exists, the army or security service, the court, the clergy where it held power, the street by region and bloc, the ruler's own faction, the patrons. where is "home" or "abroad". members says whose mood the holder is read from: seats, citizens, patrons, blocs or none. line is the resistance, 1 to 100, at which it warns the ruler. response is what it does two turns later if nothing changes: ${HOLDER_RESPONSES.join(", ")}. levers are the instruments that move it. stance is its support for the ruler on the first day, ${STANCE_LO} to ${STANCE_HI}, about 0.5: higher for the ruler's own faction, lower for its rivals. persona is one figure who speaks for it, invented, never a real person of the period, with name, role, bio (at most 40 words) and tell (one visible habit, at most 18 words).
- An abroad holder also has wants (up to three tags), redLines (tags that anger it), gives (treasury or chest it pays while it is served, or null) and responses (what that power actually did in this period, one line each).
- instruments: all seven verbs, named in the era's own words, priced, and available false when this polity cannot use one. consent is none, chamber, chamber_supermajority or army.
- retention: the test that keeps or removes the ruler. weights: one row per holder that votes in it, between 0.15 and 0.6, summing to 1. Holders that do not vote are left out and keep their lines.
- halfTerm: the holder whose scheduled draw falls at the half of the term, and its name in this era.
- ledgers: the era's own name for each of the five resources and the number at which each one fails.
- briefing: three pages for a reader who has never heard of this place. situation: what is happening and what the ruler wants, at most 120 words. room: who can stop the ruler and how, at most 120 words. you: what the ruler holds and what the test asks of them, at most 120 words.
${CONTENT_RULE}`;

export async function constitution(env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  const f = ctx.frame;
  const user = JSON.stringify({
    ...frameBrief(ctx),
    chamber: { size: f.chamber.size, threshold: f.chamber.threshold, word: f.vocabulary.chamber },
    seat_classes: [...new Set(f.factions.map((x) => x.ideology))],
    verbs: VERBS,
    starts: f.starts.map((s) => ({ faction: s.faction, seat_title: s.seat_title, premise: s.premise })),
    people_on_the_sheet: ctx.facts.people.map((p) => p.name),
    bodies_on_the_sheet: ctx.facts.bodies.map((b) => b.name),
  });
  const chamberExists = f.chamber.size > 0;
  const BUDGET = 6000;   // TUNE: the frame call runs at 9000 and this object is about two thirds of it
  const startIds = f.starts.map((s) => s.faction);
  // ruler.faction is a bare string in the schema, so the frame's own start list is the only check there is.
  const wrongFaction = (x: Constitution) =>
    startIds.includes(x.ruler.faction) ? [] : [`ruler.faction must be one of: ${startIds.join(", ")}`];

  let c = await luna(env, ConstitutionSchema, "constitution", SYSTEM, user, BUDGET);
  let settled = settleConstitution(c, chamberExists);
  let violations = [...settled.violations, ...wrongFaction(c)];
  if (violations.length) {
    const retry = `${user}\n\nAn earlier attempt returned this constitution:\n${JSON.stringify(c)}\n\nValidation found these violations:\n- ${violations.join("\n- ")}\n\nReturn the corrected full constitution. Keep everything else the same.`;
    c = await luna(env, ConstitutionSchema, "constitution", SYSTEM, retry, BUDGET);
    settled = settleConstitution(c, chamberExists);
    violations = [...settled.violations, ...wrongFaction(c)];
  }
  if (violations.length) throw new NeedsRepair(violations, JSON.stringify(c));
  return { constitution: settled.constitution };
}
