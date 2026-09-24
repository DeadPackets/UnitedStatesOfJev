import { test, expect } from "bun:test";
import { CONTENT_RULE, HISTORIAN } from "./prompts";

test("the historian seats the player as the executive head, not a legislator", () => {
  expect(HISTORIAN).toContain("executive head");
  expect(HISTORIAN).not.toContain("passes bills");
  expect(HISTORIAN).not.toContain("top governing seat of a legislature");
  expect(HISTORIAN).toContain("power holders");
});

test("the content rule seats the real office and bars only atrocities as play", () => {
  expect(CONTENT_RULE).toContain("real office of that year");
  expect(CONTENT_RULE).toContain("mass killing of civilians");
  expect(CONTENT_RULE).toContain("never soften or moralise a reaction");
  expect(CONTENT_RULE).not.toContain("persecution");
  expect(CONTENT_RULE).toContain("exactly as historians of the period name it");
  expect(CONTENT_RULE).not.toContain("nearest governing seat");
});
