import { DurableObject } from "cloudflare:workers";
import type { Env } from "./jev";
import { PackSchema, type Pack } from "./pack";

export type ScenarioRow = {
  id: string; status: string; step: string | null; lang: string | null; title: string | null; era: string | null;
  place: string | null; description: string | null; prompt: string | null; pack: Pack | null; fragments: unknown[];
  error: string | null; created: number; builds: number;
};

function parseRow(row: any): ScenarioRow {
  return { ...row, pack: row.pack ? PackSchema.parse(JSON.parse(row.pack)) : null, fragments: row.fragments ? JSON.parse(row.fragments) : [] };
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
  await env.DB.prepare("UPDATE scenarios SET status = 'ready', pack = ? WHERE id = ?").bind(JSON.stringify(pack), id).run();
}

export async function listReady(env: Env, ids: string[]) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, title, era, place, description FROM scenarios WHERE status = 'ready' AND id IN (${placeholders})`,
  ).bind(...ids).all();
  return results;
}

const SPACING_SECONDS = 600;

export class BuildsDO extends DurableObject<Env> {
  async take(): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `count:${day}`;
    const count = ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    if (count > Number(this.env.DAILY_BUILD_CAP)) return false;
    await this.ctx.storage.put(key, count);
    return true;
  }

  async spaced(ip: string): Promise<boolean> {
    const key = `ip:${ip}`;
    const last = await this.ctx.storage.get<number>(key);
    const now = Date.now();
    if (last && now - last < SPACING_SECONDS * 1000) return false;
    await this.ctx.storage.put(key, now);
    return true;
  }
}
