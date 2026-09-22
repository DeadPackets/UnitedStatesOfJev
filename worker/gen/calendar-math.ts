export type Unit = "day" | "week" | "month" | "season";
export type Calendar = { start_date: string; unit: Unit };
export const UNIT: Record<Unit, number> = { day: 1, week: 7, month: 30.4375, season: 91.3125 };

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

export function turnOf(date: string | null | undefined, start: string, unit: Unit): number | null {
  const a = ymd(date), b = ymd(start);
  return a && b ? Math.floor((days(a) - days(b)) / UNIT[unit]) + 1 : null;
}
