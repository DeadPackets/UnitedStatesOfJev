import { test, expect } from "bun:test";
import { BRIER_LIMIT, DRAW_SHARE, GAP_SCALE, SKILL_GAP, WIN_SPREAD, brier, drawShare, ownFailure, report, winRates } from "./report";
import type { RunLog, TurnLog } from "./run";

const turn = (over: Partial<TurnLog> = {}): TurnLog => ({
  run: "r", policy: "broker", seed: 1, term: 1, turn: 1, bar: 0.5,
  ledgers: {}, holders: [], acts: [], whip: null, jev: { tokens: 0, cost: 0, calls: 0, worst: 0, ms: 0 }, pending: null, wire: [], ...over,
});
const run = (over: Partial<RunLog> = {}): RunLog => ({
  run: "r", game: "g", policy: "broker", seed: 1, terms: 1, ending: "reelected", won: true, term1Won: true, mandate: 0.6, bar: 0.5, turns: [], ...over,
});

test("a perfect forecast scores zero and a backwards one scores one", () => {
  expect(brier([turn({ whip: { expected: 60, needed: 31, yes: 60, size: 60 } })])).toBeCloseTo(0, 5);
  expect(brier([turn({ whip: { expected: 0, needed: 31, yes: 60, size: 60 } })])).toBeCloseTo(1, 5);
  expect(brier([turn()])).toBe(0);
});

test("win rates are the first term only, per policy, in points", () => {
  const rates = winRates([
    run({ policy: "greedy", term1Won: true }), run({ policy: "greedy", term1Won: false }),
    run({ policy: "broker", term1Won: true }),
    // A three term run that lost its third test still counts as the first term it won.
    run({ policy: "broker", terms: 3, won: false, term1Won: true }),
  ]);
  expect(rates.greedy).toBe(50);
  expect(rates.broker).toBe(100);
});

test("the draw share is the spread inside one policy over the spread across all of them", () => {
  const same = [run({ policy: "a", mandate: 0.5 }), run({ policy: "a", mandate: 0.5 }), run({ policy: "b", mandate: 0.7 }), run({ policy: "b", mandate: 0.7 })];
  expect(drawShare(same)).toBe(0);
  const oneOnly = [run({ policy: "a", mandate: 0.2 }), run({ policy: "a", mandate: 0.8 })];
  expect(drawShare(oneOnly)).toBe(1);
  // Each policy spreads 0.2 wide around its own mean, the four runs spread 0.6 wide: 0.01 / 0.05.
  const mixed = [run({ policy: "a", mandate: 0.2 }), run({ policy: "a", mandate: 0.4 }), run({ policy: "b", mandate: 0.6 }), run({ policy: "b", mandate: 0.8 })];
  expect(drawShare(mixed)).toBeCloseTo(0.2, 3);
});

test("a style whose losses are its own failure passes R23's second half", () => {
  expect(ownFailure([run({ policy: "strongman", won: false, ending: "coup" }), run({ policy: "strongman", won: false, ending: "coup" })]).strongman).toBe(true);
  expect(ownFailure([run({ policy: "strongman", won: false, ending: "defeated" }), run({ policy: "strongman", won: false, ending: "defeated" })]).strongman).toBe(false);
});

test("the report fails when a check misses its target", () => {
  const bad = report([run({ policy: "greedy", term1Won: true }), run({ policy: "broker", term1Won: true })], [turn()]);
  expect(bad.ok).toBe(false);
  expect(bad.rows.find((r) => r.name === "skill separation")!.ok).toBe(false);
  expect(SKILL_GAP).toBe(30);
  expect(BRIER_LIMIT).toBe(0.15);
  expect(DRAW_SHARE).toBe(0.2);
  expect(WIN_SPREAD).toBe(10);
  expect(GAP_SCALE).toBe(100);
});
