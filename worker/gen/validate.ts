import type { Frame } from "./frame";
import type { Facts } from "./facts";

// Thrown when the frame still breaks rules after the retry. Task 6's Workflow catches it and runs Astra.
export class NeedsRepair extends Error {
  constructor(public violations: string[], public last: string) {
    super("frame needs repair: " + violations.join("; "));
    this.name = "NeedsRepair";
  }
}

export type Unit = "day" | "week" | "month" | "season";
export type Calendar = { start_date: string; unit: Unit };
export const UNIT: Record<Unit, number> = { day: 1, week: 7, month: 30.4375, season: 91.3125 };
export const UNITS = Object.keys(UNIT) as Unit[];

const DATE = /^(-?\d{1,6})-(\d{1,2})-(\d{1,2})$/;
export function ymd(s: string | null | undefined): [number, number, number] | null {
  const m = s?.match(DATE);
  if (!m) return null;
  const [y, mo, d] = [parseInt(m[1], 10), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? [y, mo, d] : null;
}

// Proleptic Gregorian day number. Date cannot parse BC years, and the packs carry them (-0044-03-15).
export function days([y, m, d]: [number, number, number]): number {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

export function fromDays(j: number): string {
  const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor((146097 * b) / 4);
  const dd = Math.floor((4 * c + 3) / 1461), e = c - Math.floor((1461 * dd) / 4), m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + dd - 4800 + Math.floor(m / 10);
  return `${year < 0 ? "-" : ""}${String(Math.abs(year)).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const yearOf = (s: string | null | undefined): number | null => {
  const m = s?.match(/^(-?\d{1,6})/);
  return m ? parseInt(m[1], 10) : null;
};

export function turnOf(date: string | null | undefined, start: string, unit: Unit): number | null {
  const a = ymd(date), b = ymd(start);
  return a && b ? Math.floor((days(a) - days(b)) / UNIT[unit]) + 1 : null;
}

const norm = (n: string) => n.toLowerCase().trim();
const last = (n: string) => norm(n).split(/\s+/).pop() ?? "";
const words = (s: string) => s.trim().split(/\s+/).length;

// Every real person of the period: the frame's leaders and everyone the facts sheet names.
export const realNames = (frame: Frame, facts?: Facts | null): string[] =>
  [...frame.factions.map((f) => f.leader), ...(facts?.people ?? []).map((p) => p.name)].filter((n) => n && n.trim());

export const matchName = (name: string, real: string[]): string | null =>
  (name?.trim() ? real.find((r) => norm(r) === norm(name) || last(r) === last(name)) ?? null : null);

// Members are invented, so none of them may carry a real name of the period. Run after the persona calls.
export function members(frame: Frame, roster: { id: string; name: string }[], facts?: Facts | null): string[] {
  const real = realNames(frame, facts);
  return roster.flatMap((m) => {
    const hit = matchName(m.name, real);
    return hit ? [`member ${m.id} "${m.name}" carries the real name "${hit}"; members are invented`] : [];
  });
}

export function frame(f: Frame, sheet?: Facts | null, expectStart?: string | null): string[] {
  const facts: Facts = sheet ?? { people: [], bodies: [], groupings: [], dated_events: [], anchor: -1 };
  const e: string[] = [];
  if (expectStart && f.start_date !== expectStart) e.push(`start_date must be ${expectStart}`);
  const fids = new Set(f.factions.map((x) => x.id)), tags = new Set(f.tags);
  const pids = new Set(f.patrons.map((p) => p.id)), rids = new Set(f.regions.map((r) => r.id));
  const bids = new Set(f.blocs.map((b) => b.id));

  if (words(f.description) > 60) e.push("description is over 60 words");
  if (fids.size !== f.factions.length) e.push("duplicate faction id");
  if (new Set(f.factions.map((x) => x.fill)).size !== f.factions.length) e.push("faction fills are not unique");
  if (rids.size !== f.regions.length) e.push("duplicate region id");
  if (bids.size !== f.blocs.length) e.push("duplicate bloc id");
  if (pids.size !== f.patrons.length) e.push("duplicate patron id");
  const w = f.regions.reduce((s, r) => s + r.weight, 0);
  if (Math.abs(w - 1) > 0.05) e.push(`region weights sum to ${w.toFixed(3)}, not 1`);
  const seats = f.factions.reduce((s, x) => s + x.seats, 0);
  if (seats !== f.chamber.size) e.push(`faction seats sum to ${seats}, not the chamber size ${f.chamber.size}`);
  if (f.chamber.threshold > f.chamber.size || f.chamber.supermajority <= f.chamber.threshold) e.push("threshold and supermajority are out of order");
  if (f.chamber.size > 30 && f.factions.length < 3) e.push(`only ${f.factions.length} factions for a chamber of ${f.chamber.size}; at least 3 are needed`);

  for (const r of f.regions) for (const l of r.lean) if (!fids.has(l.id)) e.push(`region ${r.id} leans to unknown faction ${l.id}`);
  for (const p of f.patrons) for (const t of [...p.wants, ...p.hates]) if (!tags.has(t)) e.push(`patron ${p.id} uses tag ${t}, which is not in tags`);
  for (const p of f.promises) if (!tags.has(p.tag)) e.push(`promise tag ${p.tag} is not in tags`);
  const starts = new Set(f.starts.map((s) => s.faction));
  for (const x of f.factions) if (!starts.has(x.id)) e.push(`no start for faction ${x.id}`);
  for (const s of f.starts) for (const c of [...s.coalition, ...s.hostile]) if (!fids.has(c)) e.push(`start ${s.faction} names unknown faction ${c}`);

  const start = yearOf(f.start_date);
  for (const x of f.factions) {
    const p = facts.people.find((q) => q.name === x.leader || last(q.name) === last(x.leader));
    const died = yearOf(p?.died);
    if (p && p.alive_on_start_date === false) e.push(`leader "${x.leader}" (${x.id}) is not alive on the start date per the facts sheet`);
    else if (died !== null && start !== null && died < start) e.push(`leader "${x.leader}" (${x.id}) died ${p?.died}, before the start date ${f.start_date}`);
  }

  if (!ymd(f.start_date)) e.push(`start_date ${f.start_date} is not a full date`);
  else if (facts.dated_events.length && !calendarHasAnchor(f.start_date, facts)) {
    e.push(`no dated event from the facts sheet falls within a year after the start date ${f.start_date}`);
  }
  return e;
}

const calendarHasAnchor = (start: string, facts: Facts) => {
  const s = ymd(start)!;
  return facts.dated_events.some((ev) => { const x = ymd(ev.date); return !!x && days(x) >= days(s) && days(x) - days(s) <= 366; });
};
