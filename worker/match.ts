import type { Env } from "./jev";
import { jev, matchQuestion, type MatchCandidate } from "./jev";

export type MatchResult =
  | { load: string }
  | { offer: (MatchCandidate & { p: number })[] }
  | { build: true };

// Owner rule (experiment 6): Jev reads the cosine top 20 with no floor; a floor had cut Rome's own pack at 0.54.
const SHORTLIST = 20;
const LOAD_AT = 0.9; // at or above: the prompt is this world, so it loads instead of paying for a build
const OFFER_AT = 0.8; // above: the player is offered the match before a build

export async function match(env: Env, prompt: string): Promise<MatchResult> {
  const r = (await env.AI.run("@cf/baai/bge-m3", { text: [prompt] } as never)) as any;
  const values: number[] | undefined = r?.data?.[0] ?? r?.response?.data?.[0];
  if (!Array.isArray(values)) throw new Error("bge-m3 returned no vector");

  const q = await env.VEC.query(values, { topK: SHORTLIST, returnMetadata: "all" });
  const matches = [...q.matches].sort((a, b) => b.score - a.score);
  if (matches.length === 0) return { build: true };

  // Lazy import: db.ts pulls in `cloudflare:workers` for its Durable Object class, which only workerd
  // resolves. A static import would break `decide`'s offline unit test.
  const { listReady } = await import("./db");
  const ready = (await listReady(
    env,
    matches.map((m) => m.id),
  )) as MatchCandidate[];
  const rows = new Map(ready.map((row) => [row.id, row]));
  const candidates = matches.filter((m) => rows.has(m.id)).map((m) => rows.get(m.id)!);
  if (candidates.length === 0) return { build: true };

  const { answers } = await jev(env, { prompt }, { match: matchQuestion(candidates) });
  return decide(candidates, answers.match?.probabilities ?? {});
}

export function decide(
  candidates: MatchCandidate[],
  probabilities: Record<string, number>,
): MatchResult {
  const [topId, topP] = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0] ?? [
    "none_of_these",
    0,
  ];
  if (topId === "none_of_these") return { build: true };
  if (topP >= LOAD_AT) return { load: topId };
  if (topP > OFFER_AT) {
    const offer = Object.entries(probabilities)
      .filter(([id, p]) => id !== "none_of_these" && p >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, p]) => ({ ...candidates.find((c) => c.id === id)!, p }));
    return { offer };
  }
  return { build: true };
}
