import { test, expect, mock } from "bun:test";

mock.module("cloudflare:workers", () => ({ DurableObject: class {}, WorkflowEntrypoint: class {} }));
const { dayKey, shiftDay, streakOf } = await import("./db");

// Only the two shapes streakOf issues: one .all() of day rows.
const fakeDB = (days: string[]) => ({
  prepare: () => ({ bind: () => ({ all: async () => ({ results: days.map((day) => ({ day })) }) }) }),
}) as unknown as D1Database;

test("a day key is the UTC calendar day and shifts by whole days across a month end", () => {
  expect(dayKey(Date.parse("2026-09-22T23:30:00Z"))).toBe("2026-09-22");
  expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
  expect(shiftDay("2026-02-28", 1)).toBe("2026-03-01");
});

test("the streak counts back from today, allows today unplayed, and stops at the first gap", async () => {
  const env = (days: string[]) => ({ DB: fakeDB(days) }) as never;
  expect(await streakOf(env(["2026-09-22", "2026-09-21", "2026-09-20"]), "p", "2026-09-22", 60)).toBe(3);
  expect(await streakOf(env(["2026-09-21", "2026-09-20"]), "p", "2026-09-22", 60)).toBe(2);
  expect(await streakOf(env(["2026-09-21", "2026-09-19"]), "p", "2026-09-22", 60)).toBe(1);
  expect(await streakOf(env(["2026-09-19"]), "p", "2026-09-22", 60)).toBe(0);
  expect(await streakOf(env([]), "p", "2026-09-22", 60)).toBe(0);
});
