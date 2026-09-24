import type { Frame } from "./frame";
import type { Facts } from "./facts";
import { UNIT, days, ymd, turnOf, type Calendar, type Unit } from "./calendar-math";

export { turnOf, ymd, days, UNIT, type Calendar, type Unit };

// Thrown when the frame still breaks rules after the retry. Task 6's Workflow catches it and runs Astra.
export class NeedsRepair extends Error {
  constructor(
    public violations: string[],
    public last: string,
  ) {
    super("frame needs repair: " + violations.join("; "));
    this.name = "NeedsRepair";
  }
}

export const UNITS = Object.keys(UNIT) as Unit[];

export function fromDays(j: number): string {
  const a = j + 32044,
    b = Math.floor((4 * a + 3) / 146097),
    c = a - Math.floor((146097 * b) / 4);
  const dd = Math.floor((4 * c + 3) / 1461),
    e = c - Math.floor((1461 * dd) / 4),
    m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + dd - 4800 + Math.floor(m / 10);
  return `${year < 0 ? "-" : ""}${String(Math.abs(year)).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const norm = (n: string) => n.toLowerCase().trim();
const last = (n: string) => norm(n).split(/\s+/).pop() ?? "";
const first = (n: string) => norm(n).split(/\s+/)[0] ?? "";

// Every real person of the period: the frame's leaders and everyone the facts sheet names.
export const realNames = (frame: Frame, facts?: Facts | null): string[] =>
  [...frame.factions.map((f) => f.leader), ...(facts?.people ?? []).map((p) => p.name)].filter(
    (n) => n && n.trim(),
  );

// Surname alone is not a clash: Roman cognomina repeat (Brutus, Casca), so it rejected every invented Roman.
export const matchName = (name: string, real: string[]): string | null =>
  name?.trim()
    ? (real.find(
        (r) => norm(r) === norm(name) || (first(r) === first(name) && last(r) === last(name)),
      ) ?? null)
    : null;

// Members are invented, so none of them may carry a real name of the period. Run after the persona calls.
export function members(
  frame: Frame,
  roster: { id: string; name: string }[],
  facts?: Facts | null,
): string[] {
  const real = realNames(frame, facts);
  return roster.flatMap((m) => {
    const hit = matchName(m.name, real);
    return hit
      ? [`member ${m.id} "${m.name}" carries the real name "${hit}"; members are invented`]
      : [];
  });
}
