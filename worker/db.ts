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

const DAY_MS = 86_400_000;

export class BuildsDO extends DurableObject<Env> {
  private async count(prefix: string, cap: number): Promise<boolean> {
    const key = `${prefix}:${new Date().toISOString().slice(0, 10)}`;
    const n = ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    if (n > cap) return false;
    await this.ctx.storage.put(key, n);
    return true;
  }

  take(): Promise<boolean> { return this.count("count", Number(this.env.DAILY_BUILD_CAP)); }
  takeGame(): Promise<boolean> { return this.count("games", Number(this.env.DAILY_GAME_CAP)); }

  // Checking and recording are separate so a request the daily cap refuses does not also spend the
  // caller's window: the route calls mark() only once the work is going ahead.
  async spaced(ip: string, kind: string, windowMs: number): Promise<boolean> {
    const last = await this.ctx.storage.get<{ at: number }>(`ip:${kind}:${ip}`);
    return !(last && Date.now() - last.at < windowMs);
  }

  async mark(ip: string, kind: string): Promise<void> {
    const now = Date.now();
    await this.ctx.storage.put(`ip:${kind}:${ip}`, { at: now });
    // ponytail: full scan of the ip: prefix each time; add an alarm-driven sweep past a few thousand keys.
    const stale = [...(await this.ctx.storage.list<{ at: number }>({ prefix: "ip:" }))]
      .filter(([, v]) => !v?.at || now - v.at > DAY_MS).map(([k]) => k);
    if (stale.length) await this.ctx.storage.delete(stale);
  }
}
