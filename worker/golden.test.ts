import { test, expect } from "bun:test";
import { recordGolden } from "./golden";

test("a golden row is written only when the flag is on, and is stored whole", async () => {
  const writes: unknown[][] = [];
  const env = (flag?: string) => ({
    GOLDEN: flag,
    DB: { prepare: (sql: string) => ({ bind: (...a: unknown[]) => ({ run: async () => { writes.push([sql, ...a]); } }) }) },
  }) as never;

  await recordGolden(env(undefined), "jev", { q: 1 }, { a: 2 });
  expect(writes).toHaveLength(0);

  await recordGolden(env("1"), "jev", { q: 1 }, { a: 2 });
  expect(writes).toHaveLength(1);
  expect(String(writes[0][0])).toContain("INSERT OR IGNORE INTO golden");
  expect(writes[0][2]).toBe("jev");
  expect(JSON.parse(String(writes[0][3]))).toEqual({ q: 1 });

  // A real Jev request is about 240,000 characters. It is stored whole or the replay cannot parse it.
  const big = { state: "x".repeat(240_000) };
  await recordGolden(env("1"), "jev", big, { a: 2 });
  expect(JSON.parse(String(writes[1][3]))).toEqual(big);
});

test("a recorder failure never fails the call it was watching", async () => {
  const env = { GOLDEN: "1", DB: { prepare: () => { throw new Error("no table"); } } } as never;
  expect(await recordGolden(env, "luna", {}, {})).toBeUndefined();
});
