import type { Env } from "../jev";
import type { Facts } from "./facts";
import type { GenCtx } from "./prompts";
import { UNIT, UNITS, days, fromDays, turnOf, ymd, type Calendar } from "./validate";

// The sheet's anchor event lands on turn 16, and the unit is the one that fits the most sheet events inside the
// term. Ties go to the shorter unit. Measured 2026-09-22: with the model's own start date the Ides missed the
// term in 12 of 12 Rome runs.
export function pickCalendar(facts?: Facts | null): Calendar | null {
  const event = facts && facts.anchor >= 0 ? facts.dated_events[facts.anchor] : undefined;
  const a = ymd(event?.date);
  if (!a) return null;
  const dates = facts!.dated_events.map((x) => x.date);
  let best: (Calendar & { count: number }) | null = null;
  for (const unit of UNITS) {
    const start_date = fromDays(days(a) - Math.ceil(15 * UNIT[unit]));
    const count = dates.filter((d) => { const t = turnOf(d, start_date, unit); return t !== null && t >= 1 && t <= 20; }).length;
    if (!best || count > best.count) best = { start_date, unit, count };
  }
  return { start_date: best!.start_date, unit: best!.unit };
}

export async function calendarStep(_env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  return { calendar: pickCalendar(ctx.facts) };
}
