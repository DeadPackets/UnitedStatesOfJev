import type { Env } from "./jev";

/** Off unless GOLDEN is "1". A recording that fails is a lost sample, never a lost turn. */
export async function recordGolden(env: Env, kind: string, request: unknown, answer: unknown): Promise<void> {
  if (env.GOLDEN !== "1") return;
  try {
    // Stored whole: one Jev request is about 240,000 characters and a clipped one cannot be parsed back.
    const req = JSON.stringify(request);
    const id = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kind + req)))]
      .slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT OR IGNORE INTO golden (id, kind, request, answer, created) VALUES (?, ?, ?, ?, ?)")
      .bind(id, kind, req, JSON.stringify(answer), Date.now()).run();
  } catch (e) {
    console.warn("golden", String(e).slice(0, 120));
  }
}

export async function listGolden(env: Env, limit: number): Promise<{ id: string; kind: string; request: string; answer: string }[]> {
  const { results } = await env.DB.prepare("SELECT id, kind, request, answer FROM golden ORDER BY created DESC LIMIT ?")
    .bind(limit).all<{ id: string; kind: string; request: string; answer: string }>();
  return results;
}
