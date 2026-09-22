import { test, expect } from "bun:test";
import { CONTENT_RULE, HISTORIAN } from "./prompts";

test("the historian seats the player as the executive head, not a legislator", () => {
  expect(HISTORIAN).toContain("executive head");
  expect(HISTORIAN).not.toContain("passes bills");
  expect(HISTORIAN).not.toContain("top governing seat of a legislature");
  expect(HISTORIAN).toContain("power holders");
});

test("the content rule keeps force at the strategic level", () => {
  expect(CONTENT_RULE).toContain("Force is strategic only");
});
