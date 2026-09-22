import { test, expect } from "bun:test";
import { BIAS_LIMIT, PAIRS, SHARE_USD, biasOf } from "./bias";

test("every pair is the same act in two framings, both long enough for the gate", () => {
  expect(PAIRS.length).toBeGreaterThanOrEqual(6);
  for (const p of PAIRS) {
    expect(p.a.length).toBeGreaterThan(40);
    expect(p.b.length).toBeGreaterThan(40);
    expect(p.a).not.toBe(p.b);
    expect(p.a).not.toContain("—");
    expect(p.b).not.toContain("—");
  }
});

test("the audit reports the mean and the worst absolute shift", () => {
  expect(biasOf([0.02, -0.04, 0.06])).toEqual({ mean: 0.04, worst: 0.06 });
  expect(biasOf([])).toEqual({ mean: 0, worst: 0 });
  expect(BIAS_LIMIT).toBe(0.05);
  expect(SHARE_USD).toBeGreaterThan(0);
});
