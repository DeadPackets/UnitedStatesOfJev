import { test, expect, mock, setSystemTime } from "bun:test";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
  WorkflowEntrypoint: class {},
}));
mock.module("cloudflare:workflows", () => ({ NonRetryableError: class extends Error {} }));
const { dailySeed } = await import("./index");
const app = (await import("./index")).default;

test("the daily seed is the same for everyone on one day and different on the next", () => {
  expect(dailySeed("2026-09-22")).toBe(dailySeed("2026-09-22"));
  expect(dailySeed("2026-09-22")).not.toBe(dailySeed("2026-09-23"));
  expect(dailySeed("2026-09-22")).toBeGreaterThanOrEqual(0);
  expect(dailySeed("2026-09-22")).toBeLessThanOrEqual(0x7fffffff);
});

const env = (rows: Record<string, unknown>) =>
  ({
    DAILY_SECRET: "test-secret",
    RL: { limit: async () => ({ success: true }) },
    DB: {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () =>
            sql.includes("FROM dailies")
              ? rows.daily
              : sql.includes("COUNT(*)")
                ? { n: rows.plays ?? 0 }
                : sql.includes("daily_plays")
                  ? rows.play
                  : null,
          all: async () => ({
            results: sql.includes("ORDER BY d.day") ? (rows.archive ?? []) : (rows.days ?? []),
          }),
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
    },
  }) as never;

const ready = {
  day: "2026-09-22",
  scenario: "abc123",
  status: "ready",
  prompt: "Rome in 44 BC",
  created: 0,
  title: "Rome, 44 BC",
  era: "44 BC",
  place: "Rome",
};

test("the daily route names today's term, sets the cookie once and counts the streak", async () => {
  const r = await app.fetch(
    new Request("https://x/api/daily"),
    env({ daily: ready, play: null, days: [], plays: 12 }),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("set-cookie")).toContain("usoj_id=");
  const body = (await r.json()) as Record<string, unknown>;
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
    play: {
      id: "p",
      day: "2026-09-22",
      game: "g1",
      grid: JSON.stringify([{ ledger: "authority" }, { ledger: "treasury", won: true }]),
      won: 1,
      ended: 1,
    },
    days: [{ day: "2026-09-22" }],
    plays: 1,
  });
  setSystemTime(new Date("2026-09-22T12:00:00Z")); // the streak counts back from today
  const body = (await (await app.fetch(new Request("https://x/api/daily"), e)).json()) as Record<
    string,
    any
  >;
  setSystemTime();
  expect(body.played).toBe(true);
  expect(body.streak).toBe(1);
  expect(body.grid.map((g: { ledger: string }) => g.ledger)).toEqual(["authority", "treasury"]);
  expect(body.grid[1].won).toBe(true);
});

test("a second daily seat from the same player is refused with the link back to the first", async () => {
  const e = env({
    daily: ready,
    play: { id: "p", day: "2026-09-22", game: "g1", grid: null, won: null, ended: 0 },
  });
  const r = await app.fetch(
    new Request("https://x/api/games", {
      method: "POST",
      body: JSON.stringify({ mode: "daily", faction: 0, promises: [0, 1, 2] }),
    }),
    e,
  );
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: "You have played today's term.", game: "g1" });
});

test("a day with no ready term says so and answers no half-empty card", async () => {
  const e = env({
    daily: {
      day: "2026-09-22",
      scenario: null,
      status: "failed",
      prompt: "p",
      created: 0,
      title: null,
      era: null,
      place: null,
    },
    play: null,
    days: [],
  });
  const r = await app.fetch(new Request("https://x/api/daily"), e);
  expect(r.status).toBe(503);
  expect(((await r.json()) as { error: string }).error).toContain("still being written");
});

test("the archive lists past dailies, newest first", async () => {
  const e = env({
    archive: [
      {
        day: "2026-09-21",
        scenario: "z",
        status: "ready",
        title: "Egypt, 2012",
        era: "2012",
        place: "Egypt",
      },
    ],
  });
  const body = (await (
    await app.fetch(new Request("https://x/api/daily/archive"), e)
  ).json()) as any[];
  expect(body).toHaveLength(1);
  expect(body[0].day).toBe("2026-09-21");
  expect(body[0].scenario).toBe("z");
});

test.each([
  ["events/0/decline", "events/0/decline"],
  ["events/2", "events/2"],
  ["acts/negotiate", "acts/negotiate"],
])("POST /api/games/g1/%s reaches the game at %s", async (route, path) => {
  let reached = "";
  const e = {
    ...(env({}) as object),
    GAME: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (req: Request) => ((reached = new URL(req.url).pathname), Response.json({})),
      }),
    },
  } as never;
  const r = await app.fetch(
    new Request(`https://x/api/games/g1/${route}`, { method: "POST", body: "{}" }),
    e,
  );
  expect(r.status).toBe(200);
  expect(reached).toBe(`/${path}`);
});

// Owner rule: at 90% or more the build route answers the stored world's id and starts nothing, without spending the
// player's build window.
test.each([
  ["a stored world at 95% is answered without a build", 0.95, "ok", 200, 0],
  ["a stored world at 95% loads inside the 10-minute window", 0.95, "spaced", 200, 0],
  ["a stored world at 85% still builds", 0.85, "ok", 202, 1],
])("%s", async (_name, p, claimed, status, builds) => {
  let started = 0;
  let claims = 0;
  const e = {
    ...(env({}) as object),
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [
              { id: "rome01", title: "Rome", era: "44 BC", place: "Rome", description: "" },
            ],
          }),
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
    },
    BUILDS: {
      idFromName: () => "builds",
      get: () => ({
        claim: async () => {
          claims++;
          return claimed;
        },
      }),
    },
    BUILD: { create: async () => void started++ },
    AI: { run: async () => ({ data: [[0.1, 0.2]] }) },
    VEC: { query: async () => ({ matches: [{ id: "rome01", score: 0.5 }] }) },
  } as never;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({
      answers: { match: { probabilities: { rome01: p, none_of_these: 1 - p } } },
      usage: { input_tokens: 1 },
    })) as unknown as typeof fetch;
  const r = await app
    .fetch(
      new Request("https://x/api/scenarios", {
        method: "POST",
        body: JSON.stringify({ prompt: "Rome after Caesar" }),
      }),
      e,
    )
    .finally(() => {
      globalThis.fetch = realFetch;
    });
  expect(r.status).toBe(status);
  expect(started).toBe(builds);
  expect(claims).toBe(builds);
  if (builds === 0) expect(await r.json()).toEqual({ id: "rome01" });
});

test("a search that fails offers a build instead of an error", async () => {
  const e = {
    ...(env({}) as object),
    BUILDS: { idFromName: () => "builds", get: () => ({ claim: async () => "ok" }) },
    AI: { run: async () => ({ data: [[0.1, 0.2]] }) },
    VEC: { query: async () => Promise.reject(new Error("no Vectorize")) },
  } as never;
  const r = await app.fetch(
    new Request("https://x/api/scenarios/match", {
      method: "POST",
      body: JSON.stringify({ prompt: "Rome after Caesar" }),
    }),
    e,
  );
  expect([r.status, await r.json()]).toEqual([200, { build: true }]);
});
