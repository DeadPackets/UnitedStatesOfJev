import { z } from "zod";
import { luna } from "../luna";
import type { Env } from "../jev";
import { ESCALATION_KEYS, FILLS, FONT_PAIRS, LAYOUTS } from "../pack";
import { CONTENT_RULE, FRAME_RULES, HISTORIAN, sourceBlock, type GenCtx } from "./prompts";
import { NeedsRepair, frame as check } from "./validate";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().regex(/^[a-z0-9_-]+$/);
const SEAT_FLAGS = ["veto", "army", "clergy", "court", "crown"] as const;
const LobbyText = z.object({ cost: z.number(), label: z.string(), text: z.string() });

export const FrameSchema = z.object({
  title: z.string(), era: z.string(), place: z.string(), description: z.string(), content_note: z.string().nullable(),
  vocabulary: z.object({
    seat: z.string(), chamber: z.string(), member: z.string(), bill: z.string(), pass: z.string(), fail: z.string(),
    capital: z.string(), turn: z.string(), midterm: z.string(), campaign: z.string(), test: z.string(), feed: z.string(),
    post: z.string(), whip: z.string(), lobby: z.string(), promise: z.string(), patron: z.string(), approval: z.string(),
  }),
  theme: z.object({
    fonts: z.enum(FONT_PAIRS), ink: hex, paper: hex, accent: hex,
    texture: z.enum(["newsprint", "parchment", "concrete", "steel", "none"]),
    ornament: z.enum(["laurel", "eagle", "star", "crescent", "cross", "gear", "rule", "none"]),
    layout: z.enum(LAYOUTS),
  }),
  chamber: z.object({
    size: z.number().int().min(24).max(100), threshold: z.number().int(), supermajority: z.number().int(),
    alpha: z.number().min(0).max(1), veto: z.object({ flag: z.enum(SEAT_FLAGS), text: z.string() }).nullable(),
  }),
  factions: z.array(z.object({
    id, name: z.string(), short: z.string(), color: hex, fill: z.enum(FILLS), ideology: z.string(),
    leader: z.string(), seats: z.number().int().min(1),
  })).min(2).max(12),
  regions: z.array(z.object({
    id, name: z.string(), weight: z.number().min(0).max(1),
    lean: z.array(z.object({ id, value: z.number().min(-1).max(1) })),
  })).min(6).max(60),
  blocs: z.array(z.object({ id, name: z.string(), description: z.string() })).length(5),
  patrons: z.array(z.object({ id, name: z.string(), wants: z.array(z.string()).min(1).max(3), hates: z.array(z.string()).min(1).max(3) })).length(10),
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(16).max(24),
  problems: z.array(z.string()).min(8).max(12),
  promises: z.array(z.object({ tag: z.string(), label: z.string() })).length(8),
  starts: z.array(z.object({
    faction: id, seat_title: z.string(), coalition: z.array(id), premise: z.string(),
    party: z.number().int().min(0).max(100), capital: z.number().int().min(0).max(100), hostile: z.array(id),
  })).min(2),
  test: z.object({ name: z.string(), win: z.string(), lose: z.string(), reveal: z.enum(["regions", "seats", "both"]) }),
  endings: z.object({ reelected: z.string(), defeated: z.string(), lame_duck: z.string(), impeached: z.string() }),
  lobby: z.object({ pork: LobbyText, favor: LobbyText, threat: LobbyText }),
  escalations: z.array(z.object({ key: z.enum(ESCALATION_KEYS), name: z.string(), headline: z.string() })).length(20),
  start_date: z.string(),
});
export type Frame = z.infer<typeof FrameSchema>;

const SYSTEM = [HISTORIAN, CONTENT_RULE, FRAME_RULES].join("\n");

export async function frame(env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  // The calendar step has already fixed the term from the sheet's anchor, so the model is told the start date
  // rather than asked for one. Only a scenario with no dated anchor leaves the choice to the model.
  const cal = ctx.calendar;
  const user = [sourceBlock(ctx, ctx.facts),
    cal ? `The term begins on ${cal.start_date} and one turn is one ${cal.unit}. Use exactly that start_date.` : ""]
    .filter(Boolean).join("\n\n");
  let f = await luna(env, FrameSchema, "frame", SYSTEM, user, 9000);
  let violations = check(f, ctx.facts, cal?.start_date);
  if (violations.length) {
    const retry = `${user}\n\nAn earlier attempt returned this pack:\n${JSON.stringify(f)}\n\nValidation found these violations:\n- ${violations.join("\n- ")}\n\nReturn the corrected full pack. Keep everything else the same.`;
    f = await luna(env, FrameSchema, "frame", SYSTEM, retry, 9000);
    violations = check(f, ctx.facts, cal?.start_date);
    if (violations.length) throw new NeedsRepair(violations, JSON.stringify(f));
  }
  return { frame: f, calendar: cal ?? { start_date: f.start_date, unit: "week" } };
}
