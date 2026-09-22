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

const { DailyBuild } = await import("./daily");

const steps = () => {
  const names: string[] = [];
  return {
    names,
    step: {
      do: async (name: string, _c: unknown, fn?: () => unknown) => { names.push(name); return (fn ?? (_c as () => unknown))(); },
      sleep: async (name: string) => { names.push(name); },
    } as never,
  };
};

test("a day another instance already built does no work and spends nothing", async () => {
  const env = { DB: { prepare: () => ({ bind: () => ({
    run: async () => ({ meta: { changes: 0 } }),
    first: async () => ({ day: "2026-09-22", status: "ready", scenario: "abc123" }),
  }) }) } } as never;
  const { names, step } = steps();
  const wf = new (DailyBuild as any)({}, env);
  wf.env = env;
  await wf.run({ payload: { day: "2026-09-22" } }, step);
  expect(names).toEqual(["claim"]);
});
