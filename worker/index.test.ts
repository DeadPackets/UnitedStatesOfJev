import { test, expect, mock } from "bun:test";

mock.module("cloudflare:workers", () => ({ DurableObject: class {}, WorkflowEntrypoint: class {} }));
mock.module("cloudflare:workflows", () => ({ NonRetryableError: class extends Error {} }));
const { dailySeed } = await import("./index");
const app = (await import("./index")).default;

test("the daily seed is the same for everyone on one day and different on the next", () => {
  expect(dailySeed("2026-09-22")).toBe(dailySeed("2026-09-22"));
  expect(dailySeed("2026-09-22")).not.toBe(dailySeed("2026-09-23"));
  expect(dailySeed("2026-09-22")).toBeGreaterThanOrEqual(0);
  expect(dailySeed("2026-09-22")).toBeLessThanOrEqual(0x7fffffff);
});

const env = (rows: Record<string, unknown>) => ({
  DAILY_SECRET: "test-secret",
  RL: { limit: async () => ({ success: true }) },
  DB: {
    prepare: (sql: string) => ({
      bind: () => ({
        first: async () => (sql.includes("FROM dailies") ? rows.daily : sql.includes("COUNT(*)") ? { n: rows.plays ?? 0 } : sql.includes("daily_plays") ? rows.play : null),
        all: async () => ({ results: sql.includes("ORDER BY d.day") ? rows.archive ?? [] : rows.days ?? [] }),
        run: async () => ({ meta: { changes: 1 } }),
      }),
    }),
  },
}) as never;

const ready = { day: "2026-09-22", scenario: "abc123", status: "ready", prompt: "Rome in 44 BC", created: 0, title: "Rome, 44 BC", era: "44 BC", place: "Rome" };

test("the daily route names today's term, sets the cookie once and counts the streak", async () => {
  const r = await app.fetch(new Request("https://x/api/daily"), env({ daily: ready, play: null, days: [], plays: 12 }));
  expect(r.status).toBe(200);
  expect(r.headers.get("set-cookie")).toContain("usoj_id=");
  const body = await r.json() as Record<string, unknown>;
  expect(body.scenario).toBe("abc123");
  expect(body.title).toBe("Rome, 44 BC");
  expect(body.played).toBe(false);
  expect(body.plays).toBe(12);
  expect(body.streak).toBe(0);
  expect(body.grid).toBeUndefined();
});

test("a played daily ships the grid rows the Over screen and the landing both read", async () => {
  const e = env({
    daily: ready,
    play: { id: "p", day: "2026-09-22", game: "g1", grid: JSON.stringify([{ ledger: "authority" }, { ledger: "treasury", won: true }]), won: 1, ended: 1 },
    days: [{ day: "2026-09-22" }], plays: 1,
  });
  const body = await (await app.fetch(new Request("https://x/api/daily"), e)).json() as Record<string, any>;
  expect(body.played).toBe(true);
  expect(body.streak).toBe(1);
  expect(body.grid.map((g: { ledger: string }) => g.ledger)).toEqual(["authority", "treasury"]);
  expect(body.grid[1].won).toBe(true);
});

test("a second daily seat from the same player is refused with the link back to the first", async () => {
  const e = env({ daily: ready, play: { id: "p", day: "2026-09-22", game: "g1", grid: null, won: null, ended: 0 } });
  const r = await app.fetch(new Request("https://x/api/games", { method: "POST", body: JSON.stringify({ mode: "daily", faction: 0, promises: [0, 1, 2] }) }), e);
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: "You have played today's term.", game: "g1" });
});

test("a day with no ready term says so and answers no half-empty card", async () => {
  const e = env({ daily: { day: "2026-09-22", scenario: null, status: "failed", prompt: "p", created: 0, title: null, era: null, place: null }, play: null, days: [] });
  const r = await app.fetch(new Request("https://x/api/daily"), e);
  expect(r.status).toBe(503);
  expect((await r.json() as { error: string }).error).toContain("still being written");
});

test("the archive lists past dailies, newest first", async () => {
  const e = env({ archive: [{ day: "2026-09-21", scenario: "z", status: "ready", title: "Egypt, 2012", era: "2012", place: "Egypt" }] });
  const body = await (await app.fetch(new Request("https://x/api/daily/archive"), e)).json() as any[];
  expect(body).toHaveLength(1);
  expect(body[0].day).toBe("2026-09-21");
  expect(body[0].scenario).toBe("z");
});
