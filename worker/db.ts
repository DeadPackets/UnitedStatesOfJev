import { DurableObject } from "cloudflare:workers";
import type { Env } from "./jev";
import { PackSchema, type Pack } from "./pack";

export type ScenarioRow = {
  id: string; status: string; step: string | null; lang: string | null; title: string | null; era: string | null;
  place: string | null; description: string | null; prompt: string | null; pack: Pack | null; fragments: unknown[];
  error: string | null; created: number; builds: number;
};

export function parseRow(row: any): ScenarioRow {
  const fragments = row.fragments ? JSON.parse(row.fragments) : [];
  if (!row.pack) return { ...row, pack: null, fragments };
  const parsed = PackSchema.safeParse(JSON.parse(row.pack));
  if (!parsed.success) return { ...row, pack: null, fragments, status: "failed", error: "pack no longer matches the schema" };
  return { ...row, pack: parsed.data, fragments };
}

export async function getScenario(env: Env, id: string): Promise<ScenarioRow | null> {
  const row = await env.DB.prepare("SELECT * FROM scenarios WHERE id = ?").bind(id).first();
  return row ? parseRow(row) : null;
}

export async function putStatus(env: Env, id: string, step: string, fragment?: string) {
  if (fragment) {
    await env.DB.prepare(
      "UPDATE scenarios SET status = 'building', step = ?, fragments = json_insert(COALESCE(fragments, '[]'), '$[#]', json(?)) WHERE id = ?",
    ).bind(step, fragment, id).run();
  } else {
    await env.DB.prepare("UPDATE scenarios SET status = 'building', step = ? WHERE id = ?").bind(step, id).run();
  }
}

export async function putPack(env: Env, id: string, pack: Pack) {
  await env.DB.prepare("UPDATE scenarios SET status = 'ready', step = 'ready', pack = ? WHERE id = ?").bind(JSON.stringify(pack), id).run();
}

export async function newScenario(env: Env, id: string, prompt: string) {
  await env.DB.prepare("INSERT INTO scenarios (id, status, step, prompt, fragments, created) VALUES (?, 'queued', 'plan', ?, '[]', ?)")
    .bind(id, prompt, Date.now()).run();
}

// The match columns, written as soon as the frame lands so the build screen and listReady have a title.
export async function putMeta(env: Env, id: string, m: { lang: string; title: string; era: string; place: string; description: string }) {
  await env.DB.prepare("UPDATE scenarios SET lang = ?, title = ?, era = ?, place = ?, description = ? WHERE id = ?")
    .bind(m.lang, m.title, m.era, m.place, m.description, id).run();
}

export async function failScenario(env: Env, id: string, message: string) {
  await env.DB.prepare("UPDATE scenarios SET status = 'failed', error = ? WHERE id = ?").bind(message, id).run();
}

export async function markPortrait(env: Env, id: string, sheet: string, status: "done" | "failed") {
  const row = await getScenario(env, id);
  if (!row?.pack) return;
  const portraits = [...row.pack.art.portraits.filter((p) => p.id !== sheet), { id: sheet, value: status }];
  await env.DB.prepare("UPDATE scenarios SET pack = ? WHERE id = ?")
    .bind(JSON.stringify({ ...row.pack, art: { ...row.pack.art, portraits } }), id).run();
}

export async function listReady(env: Env, ids: string[]) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, title, era, place, description FROM scenarios WHERE status = 'ready' AND id IN (${placeholders})`,
  ).bind(...ids).all();
  return results;
}

export type DailyRow = { day: string; scenario: string | null; status: string; prompt: string | null; created: number };
export type DailyMeta = DailyRow & { title: string | null; era: string | null; place: string | null };
export type PlayRow = { id: string; day: string; game: string; grid: string | null; won: number | null; ended: number };

export const STREAK_LOOKBACK = 60;   // TUNE: days of history the streak query reads
export const ARCHIVE_LIMIT = 30;     // TUNE: past dailies the archive route lists

export const dayKey = (at: number = Date.now()) => new Date(at).toISOString().slice(0, 10);
export const shiftDay = (day: string, by: number) => dayKey(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000);

export function getDaily(env: Env, day: string): Promise<DailyRow | null> {
  return env.DB.prepare("SELECT * FROM dailies WHERE day = ?").bind(day).first<DailyRow>();
}

// Title, era and place are read from the scenarios row: the daily table stores the key, never a copy of it.
export function dailyMeta(env: Env, day: string): Promise<DailyMeta | null> {
  return env.DB.prepare(
    "SELECT d.*, s.title, s.era, s.place FROM dailies d LEFT JOIN scenarios s ON s.id = d.scenario WHERE d.day = ?",
  ).bind(day).first<DailyMeta>();
}

// The day's primary key is the lock: a cron that fires twice for one minute takes the row once.
export async function takeDaily(env: Env, day: string): Promise<boolean> {
  const r = await env.DB.prepare("INSERT INTO dailies (day, status, created) VALUES (?, 'building', ?) ON CONFLICT(day) DO NOTHING")
    .bind(day, Date.now()).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function putDaily(env: Env, day: string, prompt: string, scenario: string | null, status: string) {
  await env.DB.prepare("UPDATE dailies SET prompt = ?, scenario = ?, status = ? WHERE day = ?")
    .bind(prompt, scenario, status, day).run();
}

export async function listDailies(env: Env, limit: number): Promise<DailyMeta[]> {
  const { results } = await env.DB.prepare(
    "SELECT d.*, s.title, s.era, s.place FROM dailies d JOIN scenarios s ON s.id = d.scenario" +
    " WHERE d.status = 'ready' ORDER BY d.day DESC LIMIT ?",
  ).bind(limit).all<DailyMeta>();
  return results;
}

// One attempt per identity per day. The primary key is the lock, so two requests at once cannot both take it.
export async function takeAttempt(env: Env, id: string, day: string, game: string): Promise<boolean> {
  const r = await env.DB.prepare("INSERT INTO daily_plays (id, day, game, created) VALUES (?, ?, ?, ?) ON CONFLICT(id, day) DO NOTHING")
    .bind(id, day, game, Date.now()).run();
  return (r.meta.changes ?? 0) > 0;
}

// A game that never started is not an attempt spent: the lock is taken first, so it has to be givable back.
export async function dropAttempt(env: Env, id: string, day: string) {
  await env.DB.prepare("DELETE FROM daily_plays WHERE id = ? AND day = ? AND ended = 0").bind(id, day).run();
}

export function getPlay(env: Env, id: string, day: string): Promise<PlayRow | null> {
  return env.DB.prepare("SELECT * FROM daily_plays WHERE id = ? AND day = ?").bind(id, day).first<PlayRow>();
}

// §14's played count: how many people finished today's term, not how many took the seat.
export async function playCount(env: Env, day: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM daily_plays WHERE day = ? AND ended = 1").bind(day).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function endPlay(env: Env, game: string, grid: string, won: boolean) {
  await env.DB.prepare("UPDATE daily_plays SET grid = ?, won = ?, ended = 1 WHERE game = ?")
    .bind(grid, won ? 1 : 0, game).run();
}

// Consecutive finished days ending today or yesterday. A missed day breaks it; today still unplayed does not.
export async function streakOf(env: Env, id: string, today: string, lookback: number): Promise<number> {
  const { results } = await env.DB.prepare("SELECT day FROM daily_plays WHERE id = ? AND ended = 1 ORDER BY day DESC LIMIT ?")
    .bind(id, lookback).all<{ day: string }>();
  const days = results.map((r) => r.day);
  let want = days[0] === today ? today : shiftDay(today, -1);
  let n = 0;
  for (const d of days) {
    if (d !== want) break;
    n++;
    want = shiftDay(want, -1);
  }
  return n;
}

const DAY_MS = 86_400_000;

export class BuildsDO extends DurableObject<Env> {
  private async count(prefix: string, cap: number): Promise<boolean> {
    const key = `${prefix}:${new Date().toISOString().slice(0, 10)}`;
    // A cap that is not a number must close the gate, not open it: it is a spending limit.
    if (!Number.isFinite(cap)) return false;
    const n = ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    if (n > cap) return false;
    await this.ctx.storage.put(key, n);
    return true;
  }

  takeGame(): Promise<boolean> { return this.count("games", Number(this.env.DAILY_GAME_CAP)); }

  // The window check, the daily slot and the mark are one RPC on purpose: a DO serialises a call, not a
  // sequence of them, so three separate awaits let a burst from one IP through the per-IP window together.
  // The daily slot is taken last, so a request the window refuses does not also spend it.
  async claim(ip: string, kind: string, windowMs: number, daily = false): Promise<"ok" | "spaced" | "capped"> {
    const last = await this.ctx.storage.get<{ at: number }>(`ip:${kind}:${ip}`);
    if (last && Date.now() - last.at < windowMs) return "spaced";
    if (daily && !(await this.count("count", Number(this.env.DAILY_BUILD_CAP)))) return "capped";
    await this.mark(ip, kind);
    return "ok";
  }

  private async mark(ip: string, kind: string): Promise<void> {
    const now = Date.now();
    await this.ctx.storage.put(`ip:${kind}:${ip}`, { at: now });
    // ponytail: full scan of the ip: prefix each time; add an alarm-driven sweep past a few thousand keys.
    const stale = [...(await this.ctx.storage.list<{ at: number }>({ prefix: "ip:" }))]
      .filter(([, v]) => !v?.at || now - v.at > DAY_MS).map(([k]) => k);
    if (stale.length) await this.ctx.storage.delete(stale);
  }
}
