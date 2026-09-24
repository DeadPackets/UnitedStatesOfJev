import { describe, expect, mock, test } from "bun:test";
import { mkFacts, mkFrame } from "./fixture";
import type { GenCtx } from "./prompts";

mock.module("../luna", () => ({
  luna: async () => mkFrame(),
}));
const { clampChamberSize, frame } = await import("./frame");

const ctx = (facts = mkFacts()): GenCtx => ({
  prompt: "test",
  lang: "en",
  fiction: false,
  sources: { wikipedia: [], people: [], parties: [] },
  facts,
  frame: mkFrame(),
  calendar: null,
  members: [],
  citizens: [],
  deck: [],
});

describe("clampChamberSize", () => {
  test("matches the prompt's worked examples, capped at 72 seats", () => {
    expect(clampChamberSize(736)).toBe(72);
    expect(clampChamberSize(300)).toBe(38);
    expect(clampChamberSize(60)).toBe(24);
  });
});

describe("frame chamber-size clamp", () => {
  test("a known real seat count overrides Luna's guess and rescales factions and thresholds", async () => {
    const facts = mkFacts({ bodies: [{ name: "The Council", size: 304, how_chosen: "elected" }] });
    const { frame: f } = await frame({} as never, ctx(facts));
    expect(f!.chamber.size).toBe(38);
    expect(f!.factions.reduce((s, x) => s + x.seats, 0)).toBe(38);
    expect(f!.chamber.threshold).toBeLessThan(f!.chamber.supermajority);
    expect(f!.chamber.supermajority).toBeLessThanOrEqual(38);
  });

  test("no numeric body still caps Luna's chamber at 72 seats", async () => {
    const facts = mkFacts({ bodies: [] });
    const { frame: f } = await frame({} as never, ctx(facts));
    expect(f!.chamber.size).toBe(72);
    expect(f!.factions.reduce((s, x) => s + x.seats, 0)).toBe(72);
  });
});
