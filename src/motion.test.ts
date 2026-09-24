import { expect, test } from "bun:test";
import { ease } from "./motion";

test("the easing starts at 0, ends at 1 and never goes backwards", () => {
  expect(ease(0)).toBeCloseTo(0, 6);
  expect(ease(1)).toBeCloseTo(1, 6);
  let last = -1;
  for (let i = 0; i <= 100; i++) {
    const y = ease(i / 100);
    expect(y).toBeGreaterThanOrEqual(last);
    last = y;
  }
});

test("the easing is the same ease-out the stylesheet uses: fast at the start", () => {
  expect(ease(0.5)).toBeGreaterThan(0.8);
});
