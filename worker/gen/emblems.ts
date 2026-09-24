// One emblem per group, drawn by the model as allowlisted SVG shapes, then three guards before any reaches the desk
// (owner, 2026-09-24): Stage 0's sanitizer; a second call that judges each emblem at 28 px and, in a known story or
// history, against its known device (Decision 9); and the line icon for every emblem that fails, is filtered or never
// arrives. A model stop never fails a build, since emblems are decoration; the build's budget still stops it.
import type { z } from "zod";
import { sanitizeEmblem, type Emblem } from "../emblem";
import { GROK, ModelStop, OPUS, nullOnStop, type Caller } from "./openrouter";
import { EmblemReplySchema, EmblemReviewSchema } from "./schemas";
import { worldCall } from "./world";
import { EMBLEM_SYSTEM, REVIEW_SYSTEM } from "./writing";

export type EmblemGroup = { id: string; name: string; identity: string };
export type EmblemWorld = {
  title: string;
  era: string;
  place: string;
  houseVoice: string;
  kind: number;
};
export type EmblemReport = {
  asked: number;
  drawn: number;
  kept: number;
  namesOnly: boolean;
  dropped: { id: string; reason: string }[];
};
type Review = z.infer<typeof EmblemReviewSchema>["emblems"];

const CANON_KINDS = 7; // kinds 1 to 7: the record, a divergence from it, a myth or a canon, where devices are known

const brief = (world: EmblemWorld, groups: EmblemGroup[], namesOnly: boolean) =>
  `World: ${world.title} (${world.era}; ${world.place}). House voice: ${world.houseVoice}.
One emblem for each of these ${groups.length} groups, in this order:
${groups.map((group) => `- id "${group.id}": ${group.name}.${namesOnly ? "" : ` ${group.identity}`}`).join("\n")}`;

export function keepEmblems(
  drawn: Record<string, Emblem>,
  review: Review | null,
  kind: number,
): { kept: Record<string, Emblem>; dropped: { id: string; reason: string }[] } {
  const kept: Record<string, Emblem> = {};
  const dropped: { id: string; reason: string }[] = [];
  for (const [id, emblem] of Object.entries(drawn)) {
    const verdict = review?.find((row) => row.id === id);
    if (!verdict) dropped.push({ id, reason: "not reviewed" });
    else if (!verdict.legible) dropped.push({ id, reason: "does not read at 28 px" });
    else if (kind <= CANON_KINDS && verdict.canon === "wrong")
      dropped.push({ id, reason: "contradicts its known device" });
    else kept[id] = emblem;
  }
  return { kept, dropped };
}

export async function emblemsFor(
  call: Caller,
  world: EmblemWorld,
  groups: EmblemGroup[],
): Promise<{ emblems: Record<string, Emblem>; report: EmblemReport }> {
  // The fridge brief tripped the filter on its botulinum text; the same call with names only passed (emblems-report.md).
  // When that is filtered too, Grok draws them once: the owner's content-filter fallback. Each is a new call, not a retry.
  const attempts = [
    { name: "emblems", namesOnly: false, model: OPUS },
    { name: "emblems-names", namesOnly: true, model: OPUS },
    { name: "emblems-grok", namesOnly: false, model: GROK },
  ];
  let namesOnly = false;
  let reply: z.infer<typeof EmblemReplySchema> | null = null;
  for (const attempt of attempts) {
    try {
      reply = await call({
        name: attempt.name,
        schema: EmblemReplySchema,
        system: EMBLEM_SYSTEM,
        user: brief(world, groups, attempt.namesOnly),
        maxTokens: 24000,
        model: attempt.model,
      });
      namesOnly = attempt.namesOnly;
      break;
    } catch (error) {
      if (!(error instanceof ModelStop)) throw error;
      if (error.reason !== "content_filter") break;
    }
  }
  const drawn: Record<string, Emblem> = {};
  const dropped: { id: string; reason: string }[] = [];
  const wanted = new Set(groups.map((group) => group.id));
  const motifs = new Map<string, string>();
  for (const raw of reply?.emblems ?? []) {
    if (!wanted.has(raw.id) || drawn[raw.id] || dropped.some((row) => row.id === raw.id)) continue;
    const clean = sanitizeEmblem(raw);
    if (clean.emblem) {
      drawn[raw.id] = clean.emblem;
      motifs.set(raw.id, raw.motif);
    } else dropped.push({ id: raw.id, reason: clean.reason });
  }
  for (const group of groups)
    if (!drawn[group.id] && !dropped.some((row) => row.id === group.id))
      dropped.push({ id: group.id, reason: "not drawn" });

  let review: Review | null = null;
  if (Object.keys(drawn).length) {
    const shown = Object.entries(drawn).map(([id, emblem]) => ({
      id,
      name: groups.find((group) => group.id === id)!.name,
      motif: motifs.get(id),
      emblem,
    }));
    review = await worldCall(call, {
      name: "emblem-review",
      schema: EmblemReviewSchema,
      system: REVIEW_SYSTEM,
      user: `World: ${world.title} (${world.era}), kind ${world.kind}: ${world.kind <= CANON_KINDS ? "a known history or story, so check each device against it" : "an invented world, so canon is always none"}.\nEmblems:\n${JSON.stringify(shown)}`,
      maxTokens: 8000,
      strict: true,
    })
      .then((answer) => answer.data.emblems)
      .catch(nullOnStop);
  }
  const { kept, dropped: refused } = keepEmblems(drawn, review, world.kind);
  return {
    emblems: kept,
    report: {
      asked: groups.length,
      drawn: Object.keys(drawn).length,
      kept: Object.keys(kept).length,
      namesOnly,
      dropped: [...dropped, ...refused],
    },
  };
}
