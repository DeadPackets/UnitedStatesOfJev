import { test, expect, mock } from "bun:test";

mock.module("cloudflare:workers", () => ({ DurableObject: class {}, WorkflowEntrypoint: class {} }));
mock.module("cloudflare:workflows", () => ({ NonRetryableError: class extends Error {} }));
const { dailySeed } = await import("./index");

test("the daily seed is the same for everyone on one day and different on the next", () => {
  expect(dailySeed("2026-09-22")).toBe(dailySeed("2026-09-22"));
  expect(dailySeed("2026-09-22")).not.toBe(dailySeed("2026-09-23"));
  expect(dailySeed("2026-09-22")).toBeGreaterThanOrEqual(0);
  expect(dailySeed("2026-09-22")).toBeLessThanOrEqual(0x7fffffff);
});
