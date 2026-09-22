import type { Env } from "./jev";
import { jev, matchQuestion, type MatchCandidate } from "./jev";

export type MatchResult =
  | { load: string }
  | { offer: (MatchCandidate & { p: number })[] }
  | { build: true };

const MIN_CANDIDATES = 3;
// Measured 2026-09-22: bge-m3 scored Rome's own prompt 0.54 against its pack, below the old 0.6 floor.
// Jev still decides above this floor, so lowering it only widens what reaches Jev, not what auto-loads.
const COSINE_FLOOR = 0.45;
// Below MIN_CANDIDATES the archive is too thin to trust "no close match" (today: 2 scenarios, always build).
// A near-duplicate still deserves a load, so a top cosine this high consults Jev anyway.
const NEAR_DUPLICATE = 0.92;

export async function match(env: Env, prompt: string): Promise<MatchResult> {
  const r = (await env.AI.run("@cf/baai/bge-m3", { text: [prompt] } as never)) as any;
  const values: number[] | undefined = r?.data?.[0] ?? r?.response?.data?.[0];
  if (!Array.isArray(values)) throw new Error("bge-m3 returned no vector");

  const q = await env.VEC.query(values, { topK: 20, returnMetadata: "all" });
  const matches = q.matches.filter((m) => m.score >= COSINE_FLOOR).sort((a, b) => b.score - a.score);
  if (matches.length === 0) return { build: true };

  // Lazy import: db.ts pulls in `cloudflare:workers` for its Durable Object class, which only workerd
  // resolves. A static import would break `decide`'s offline unit test.
  const { listReady } = await import("./db");
  const ready = (await listReady(env, matches.map((m) => m.id))) as MatchCandidate[];
  const rows = new Map(ready.map((row) => [row.id, row]));
  const candidates = matches.filter((m) => rows.has(m.id)).map((m) => rows.get(m.id)!);
  if (candidates.length === 0) return { build: true };
  if (candidates.length < MIN_CANDIDATES && matches[0].score < NEAR_DUPLICATE) return { build: true };

  const { answers } = await jev(env, { prompt }, { match: matchQuestion(candidates) });
  return decide(candidates, answers.match.probabilities ?? {});
}

export function decide(candidates: MatchCandidate[], probabilities: Record<string, number>): MatchResult {
  const [topId, topP] = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0] ?? ["none_of_these", 0];
  if (topId === "none_of_these") return { build: true };
  if (topP >= 0.95) return { load: topId };
  if (topP >= 0.85) {
    const offer = Object.entries(probabilities)
      .filter(([id, p]) => id !== "none_of_these" && p >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, p]) => ({ ...candidates.find((c) => c.id === id)!, p }));
    return { offer };
  }
  return { build: true };
}
