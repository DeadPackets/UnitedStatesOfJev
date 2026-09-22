# The Ruler, Stage D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the daily seeded term (cron Workflow, archive, one attempt, streak, share grid), the six measurement bots with their per-turn log and report, the golden prompt set and the bias audit, and the documented balance pass.

**Architecture:** A `scheduled` handler starts a second Workflow, `DailyBuild`, which asks Luna for a non-duplicate scenario prompt from the past dailies, runs the existing `ScenarioBuild` pipeline, polls the scenarios row, and publishes a `dailies` row. The player identity is a signed HttpOnly cookie; one row in `daily_plays` per identity per day is both the attempt lock and the streak record, and its primary key does the locking. The share grid, R22's style line and its two decisive turns all read off one per-turn run log the engine keeps, and `view()` merges them into `game.result`. The bots are plain scripts in `scripts/bots/` driving Stage B's two-call act flow over HTTP, writing a JSONL turn log that a report script turns into the four checks and R23's targets.

**Tech Stack:** TypeScript, zod 4, Hono, Cloudflare Workers + Durable Objects + Workflows + D1 + cron triggers, `bun:test`, React 19.

**Spec:** `docs/superpowers/specs/2026-09-22-the-ruler-design.md` (v4, "The Ruler"), Stage D row of §12, plus §10, §11, R12, R15, R23. Supporting: `.superpowers/ruler/planning-brief.md`, `.superpowers/ruler/maps/{do-routes,pack-gen,models,engine}.md`, `docs/design-synthesis-2026-09-22.md` "Measuring it", `docs/research/2026-09-22-challenge-design.md` §4, `docs/superpowers/plans/2026-09-22-the-ruler-stage-a.md` "## Interfaces produced".

**19 tasks**, each self-contained: its own files, its own code, its own test, its own commands and its own commit. Tasks run in order and a fresh agent sees only its own task, this header and the earlier stages' interfaces.

## Global Constraints

- **Content rule** (spec §0 R6, `worker/gen/prompts.ts` `CONTENT_RULE`): no depiction, planning or reward of atrocities in bills, storylets, headlines or quotes. Force is strategic only: deploy, curfew, martial law, arrest a member, never below that level. Never mention the game, its design, the player, or that anything is fictional.
- **64k Jev cap** (`docs/experiments.md`, models map §1): one Jev request is capped at 64k tokens and the turn-20 test already measured 59,758 tokens, 93% of it. Every per-holder read is its own call and must stay under 20k tokens.
- **No engine numbers in the client bundle:** `grep -c scandal_season dist/client/assets/*.js` must print `0`. The Director, the deck and every persona stay in the Worker.
- **Tests green per commit:** every task ends with `bun test worker src` green and `bunx tsc -b --force` silent.
- **Comments: default none, cap two lines.** Write one only for a constraint the code cannot show.
- **No em dashes in copy** (`worker/luna.ts` `STYLE`): plain words, short sentences, no three-item lists, sentence case titles, straight quotes.
- **Stored packs must keep parsing:** `parseRow` (`worker/db.ts:11`) re-validates every stored pack on read, so **every new pack field is `.optional()` or `.default()`** and no existing required field changes shape. Stage D adds no pack field at all.
- **Never reuse these identifiers:** `LEDGERS` (`worker/pack.ts:25`, storylet effect targets), `pack.test`, `vocabulary.midterm`. Add new names beside them.
- **Player text is data, never in a system prompt.**
- **Numbers to tune carry the literal tag `TUNE` with a default**, for example `export const BUDGET_USD = 25;   // TUNE`.
- **Every bot term costs real money.** One measured v3 Rome term is **$0.2153** (`docs/experiments.md`, "Seconds and cost per route, one full Rome term"); a v4 term is measured in Task 16 before any pass is budgeted. No script in this stage may run unbounded: each one carries a term or call cap and aborts when it is reached.

## Decisions taken before the tasks

These close ambiguities the maps flagged. Every task consumes them as written.

| Question | Decision |
|---|---|
| Player identity for the daily lock | **A signed HttpOnly cookie**, `usoj_id = <uuid>.<HMAC-SHA256 base64url>`, signed with the `DAILY_SECRET` secret. Set by `GET /api/daily` and by `POST /api/games` in daily mode. Trade-off table below. |
| Where the attempt lock lives | One row in D1 `daily_plays`, primary key `(id, day)`, taken with `INSERT ... ON CONFLICT DO NOTHING`. SQLite's primary key is the lock, so no `BuildsDO` method is added. |
| Where the streak lives | Nowhere. It is counted at read time from the identity's finished `daily_plays` rows, newest first. No counter to drift. |
| The daily seed | `hash(day) & 0x7fffffff` (`hash` is already exported from `worker/engine.ts`). Same day, same seed, for everyone. |
| Faction and promises in the daily | Taken from the request body exactly as free play takes them. The daily fixes the scenario and the seed, per R9 and R12; it does not fix the pick-three. |
| The archive replay | No new route. `POST /api/games { scenario, faction, promises }` with no `mode` is already free play, so an archived daily replays as practice and never touches `daily_plays`. `GET /api/daily/archive` lists the past dailies for anything that wants them; Stage D adds no archive list to the landing, because the landing and its props belong to Stage C. |
| The share grid's source | A new `Game.log`, one `RunRow` appended per finished turn inside `endTurn`. `Game.wire` is per turn and is cleared, so it cannot be read back at the end of a run. The log carries the turn, the ledger that moved most, its size and its cause, which is everything R22's two decisive turns and the style line need as well. |
| Where `result.grid`, `result.line` and `result.decisive` are written | In `view()`, from `game.log`, every time a finished run is read. Five places write `game.result`, so a derived read is one line where a write would be five. Stage C reads all three off `game.result` and renders nothing when a field is absent. |
| Who builds the share text | A pure `shareText(title, day, grid, streak)` in `src/rules.ts`, beside `hueClass`. Its only caller is the copy button on Stage C's landing, so it lives with its caller and the worker keeps no copy. The `GameDO` stores the grid rows, never the text, so the streak is never frozen into a stored string. |
| The §11 "expert" bot | The **four style bots pooled**. R23's four styles are the scripted-from-known-levers bots §11 calls expert, so there are six policies, not seven: `random`, `greedy`, `strongman`, `populist`, `broker`, `idealist`. |
| Which routes the bots drive | **Stage B's act flow exactly**: `POST /api/games/:id/acts/price { turn, text, verb?, memberId? }`, then `POST /api/games/:id/acts { turn }` to commit. A law is tabled by that same pair and voted with `POST /api/games/:id/bills/:b/vote { turn }`; a proclamation is an ordinary priced act. Stage B deletes `POST /bills` (draft), `POST /post` and every campaign route, so no bot touches them. The turn boundary is `POST /api/games/:id/turn/end { turn }`, the half term is `POST /api/games/:id/midterm {}`, and the test is `POST /api/games/:id/test {}`. |
| Jev tokens in the turn log | `worker/jev.ts` gains a module-level `meter`; `GameDO` puts `{ tokens, cost, calls, worst }` into the view's `usage` only when `env.BOTS === "1"`. Latency the bot measures itself. |
| Who owns the Landing | **Stage C.** It ships `src/Landing.tsx` with the daily card already rendered from its own `Daily` type, and deletes `src/Write.tsx`. Stage D adds no screen: it answers `GET /api/daily` in Stage C's shape, changes the `onPlayDaily` handler in `src/App.tsx` so the first play carries `mode: "daily"`, and adds one copy button to the card. |
| Golden set storage | A D1 `golden` table written by `post()` only when `env.GOLDEN === "1"`, exported to `docs/golden/<date>.jsonl`. Off in production, so the hot path pays nothing. |

**The identity trade-off, stated:**

| Identity | Holds one attempt for | Breaks when | Cost to build |
|---|---|---|---|
| **Signed cookie (chosen)** | one browser profile | cookies cleared, a second browser, a private window | one 40-line module, no accounts, sent automatically by same-origin `fetch` |
| localStorage token as a header | one browser profile | the same three, plus any XSS reads it | the same module, plus every client call must attach the header |
| IP (`ipOf`, `index.ts:18`) | a household or an office | shared IPs lock strangers out, a VPN bypasses it | free, and wrong |

The cookie and the localStorage token give the same guarantee. The cookie needs no client change on any call, so it is smaller. Both are bypassable by a player who wants to; the daily is a solo streak with no leaderboard (spec §13 puts leaderboards out of scope), so the bar the lock has to clear is "do not let me lose my streak by refreshing", not "cannot be cheated".

---

### Task 1: The daily tables and their helpers

**Files:**
- Create: `migrations/0002_daily.sql`
- Modify: `worker/db.ts` (append after `listReady`, before `const DAY_MS`)
- Create: `worker/daily.test.ts`

**Interfaces:**
- Consumes: `Env` from `worker/jev.ts`.
- Produces: `dayKey`, `shiftDay`, `DailyRow`, `PlayRow`, `DailyMeta`, `getDaily`, `dailyMeta`, `takeDaily`, `putDaily`, `listDailies`, `takeAttempt`, `dropAttempt`, `getPlay`, `playCount`, `endPlay`, `streakOf`, `STREAK_LOOKBACK`, `ARCHIVE_LIMIT`, all from `worker/db.ts`.

- [ ] **Step 1: Write the migration**

Create `migrations/0002_daily.sql`:

```sql
CREATE TABLE dailies (day TEXT PRIMARY KEY, scenario TEXT, status TEXT, prompt TEXT, created INTEGER);
CREATE TABLE daily_plays (id TEXT, day TEXT, game TEXT, grid TEXT, won INTEGER, ended INTEGER DEFAULT 0, created INTEGER, PRIMARY KEY (id, day));
CREATE INDEX daily_plays_game ON daily_plays (game);
```

- [ ] **Step 2: Write the failing test**

Create `worker/daily.test.ts`:

```ts
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
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bun test worker/daily.test.ts`
Expected: FAIL, `export 'dayKey' not found in './db'`.

- [ ] **Step 4: Write the helpers**

Append to `worker/db.ts`, after `listReady` and before `const DAY_MS = 86_400_000;`:

```ts
export type DailyRow = { day: string; scenario: string | null; status: string; prompt: string | null; created: number };
export type DailyMeta = DailyRow & { title: string | null; era: string | null; place: string | null };
export type PlayRow = { id: string; day: string; game: string; grid: string | null; won: number | null; ended: number };

export const STREAK_LOOKBACK = 60;   // TUNE: days of history the streak query reads
export const ARCHIVE_LIMIT = 30;     // TUNE: past dailies the archive route lists

export const dayKey = (at: number = Date.now()) => new Date(at).toISOString().slice(0, 10);
export const shiftDay = (day: string, by: number) => dayKey(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000);

export function getDaily(env: Env, day: string): Promise<DailyRow | null> {
  return env.DB.prepare("SELECT * FROM dailies WHERE day = ?").bind(day).first<DailyRow>();
}

// Title, era and place are read from the scenarios row: the daily table stores the key, never a copy of it.
export function dailyMeta(env: Env, day: string): Promise<DailyMeta | null> {
  return env.DB.prepare(
    "SELECT d.*, s.title, s.era, s.place FROM dailies d LEFT JOIN scenarios s ON s.id = d.scenario WHERE d.day = ?",
  ).bind(day).first<DailyMeta>();
}

// The day's primary key is the lock: a cron that fires twice for one minute takes the row once.
export async function takeDaily(env: Env, day: string): Promise<boolean> {
  const r = await env.DB.prepare("INSERT INTO dailies (day, status, created) VALUES (?, 'building', ?) ON CONFLICT(day) DO NOTHING")
    .bind(day, Date.now()).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function putDaily(env: Env, day: string, prompt: string, scenario: string | null, status: string) {
  await env.DB.prepare("UPDATE dailies SET prompt = ?, scenario = ?, status = ? WHERE day = ?")
    .bind(prompt, scenario, status, day).run();
}

export async function listDailies(env: Env, limit: number): Promise<DailyMeta[]> {
  const { results } = await env.DB.prepare(
    "SELECT d.*, s.title, s.era, s.place FROM dailies d JOIN scenarios s ON s.id = d.scenario" +
    " WHERE d.status = 'ready' ORDER BY d.day DESC LIMIT ?",
  ).bind(limit).all<DailyMeta>();
  return results;
}

// One attempt per identity per day. The primary key is the lock, so two requests at once cannot both take it.
export async function takeAttempt(env: Env, id: string, day: string, game: string): Promise<boolean> {
  const r = await env.DB.prepare("INSERT INTO daily_plays (id, day, game, created) VALUES (?, ?, ?, ?) ON CONFLICT(id, day) DO NOTHING")
    .bind(id, day, game, Date.now()).run();
  return (r.meta.changes ?? 0) > 0;
}

// A game that never started is not an attempt spent: the lock is taken first, so it has to be givable back.
export async function dropAttempt(env: Env, id: string, day: string) {
  await env.DB.prepare("DELETE FROM daily_plays WHERE id = ? AND day = ? AND ended = 0").bind(id, day).run();
}

export function getPlay(env: Env, id: string, day: string): Promise<PlayRow | null> {
  return env.DB.prepare("SELECT * FROM daily_plays WHERE id = ? AND day = ?").bind(id, day).first<PlayRow>();
}

// §14's played count: how many people finished today's term, not how many took the seat.
export async function playCount(env: Env, day: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM daily_plays WHERE day = ? AND ended = 1").bind(day).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function endPlay(env: Env, game: string, grid: string, won: boolean) {
  await env.DB.prepare("UPDATE daily_plays SET grid = ?, won = ?, ended = 1 WHERE game = ?")
    .bind(grid, won ? 1 : 0, game).run();
}

// Consecutive finished days ending today or yesterday. A missed day breaks it; today still unplayed does not.
export async function streakOf(env: Env, id: string, today: string, lookback: number): Promise<number> {
  const { results } = await env.DB.prepare("SELECT day FROM daily_plays WHERE id = ? AND ended = 1 ORDER BY day DESC LIMIT ?")
    .bind(id, lookback).all<{ day: string }>();
  const days = results.map((r) => r.day);
  let want = days[0] === today ? today : shiftDay(today, -1);
  let n = 0;
  for (const d of days) {
    if (d !== want) break;
    n++;
    want = shiftDay(want, -1);
  }
  return n;
}
```

- [ ] **Step 5: Run the tests**

Run: `bun test worker/daily.test.ts worker/db.test.ts`
Expected: PASS, `0 fail`.

- [ ] **Step 6: Apply the migration locally**

Run: `bunx wrangler d1 migrations apply usoj --local`
Expected: `0002_daily.sql` listed and applied, `🚣 3 commands executed successfully.`

- [ ] **Step 7: Commit**

```bash
git add migrations/0002_daily.sql worker/db.ts worker/daily.test.ts
git commit -m "The daily and its attempts get their own two tables"
```

---

### Task 2: The signed cookie that identifies a player

**Files:**
- Create: `worker/identity.ts`
- Create: `worker/identity.test.ts`
- Modify: `worker/jev.ts` (the `Env` type)
- Modify: `.dev.vars`

**Interfaces:**
- Consumes: nothing.
- Produces: `IDENTITY_COOKIE: string`, `signId(secret, id): Promise<string>`, `verifyId(secret, value): Promise<string | null>`, `cookieOf(req): string | null`, `setCookie(signed): string`, `identity(secret, req): Promise<{ id: string; header?: string }>`. `Env` gains `DAILY_SECRET: string`.

- [ ] **Step 1: Write the failing test**

Create `worker/identity.test.ts`:

```ts
import { test, expect } from "bun:test";
import { IDENTITY_COOKIE, cookieOf, identity, setCookie, signId, verifyId } from "./identity";

const SECRET = "test-secret-not-the-real-one";

test("a signed id verifies, and a tampered one does not", async () => {
  const signed = await signId(SECRET, "11111111-2222-3333-4444-555555555555");
  expect(await verifyId(SECRET, signed)).toBe("11111111-2222-3333-4444-555555555555");
  expect(await verifyId(SECRET, signed.replace(/.$/, "x"))).toBeNull();
  expect(await verifyId("another-secret", signed)).toBeNull();
  expect(await verifyId(SECRET, "11111111-2222-3333-4444-555555555555.")).toBeNull();
  expect(await verifyId(SECRET, "not-a-uuid.signature")).toBeNull();
});

test("a request with no cookie gets a fresh identity and the header that sets it", async () => {
  const fresh = await identity(SECRET, new Request("https://x/"));
  expect(fresh.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(fresh.header).toContain(`${IDENTITY_COOKIE}=`);
  expect(fresh.header).toContain("HttpOnly");
  expect(fresh.header).toContain("SameSite=Lax");

  const signed = await signId(SECRET, fresh.id);
  const back = await identity(SECRET, new Request("https://x/", { headers: { cookie: `other=1; ${IDENTITY_COOKIE}=${signed}` } }));
  expect(back.id).toBe(fresh.id);
  expect(back.header).toBeUndefined();
});

test("a forged cookie is replaced, never trusted", async () => {
  const req = new Request("https://x/", { headers: { cookie: `${IDENTITY_COOKIE}=11111111-2222-3333-4444-555555555555.forged` } });
  const who = await identity(SECRET, req);
  expect(who.id).not.toBe("11111111-2222-3333-4444-555555555555");
  expect(who.header).toBeDefined();
});

test("cookieOf reads only its own cookie", () => {
  expect(cookieOf(new Request("https://x/", { headers: { cookie: "a=1; usoj_id=abc; b=2" } }))).toBe("abc");
  expect(cookieOf(new Request("https://x/"))).toBeNull();
  expect(setCookie("abc")).toContain("Path=/");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/identity.test.ts`
Expected: FAIL, `Cannot find module './identity'`.

- [ ] **Step 3: Write the module**

Create `worker/identity.ts`:

```ts
export const IDENTITY_COOKIE = "usoj_id";
const MAX_AGE = 34_560_000;   // 400 days, the longest life a browser keeps a cookie for
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const bytes = (s: string) => new TextEncoder().encode(s);
const b64url = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const keyOf = (secret: string) =>
  crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

export async function signId(secret: string, id: string): Promise<string> {
  return `${id}.${b64url(await crypto.subtle.sign("HMAC", await keyOf(secret), bytes(id)))}`;
}

// Re-sign and compare the whole value: a timing oracle on a value the attacker already chose buys nothing.
export async function verifyId(secret: string, value: string): Promise<string | null> {
  const id = value.split(".")[0];
  if (!UUID.test(id)) return null;
  return (await signId(secret, id)) === value ? id : null;
}

export function cookieOf(req: Request): string | null {
  const hit = (req.headers.get("cookie") ?? "").split(";").map((p) => p.trim())
    .find((p) => p.startsWith(`${IDENTITY_COOKIE}=`));
  return hit ? hit.slice(IDENTITY_COOKIE.length + 1) : null;
}

export const setCookie = (signed: string) =>
  `${IDENTITY_COOKIE}=${signed}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;

/** The identity a daily route works with, and the Set-Cookie header to send when it is new. */
export async function identity(secret: string, req: Request): Promise<{ id: string; header?: string }> {
  const raw = cookieOf(req);
  if (raw) {
    const id = await verifyId(secret, raw);
    if (id) return { id };
  }
  const id = crypto.randomUUID();
  return { id, header: setCookie(await signId(secret, id)) };
}
```

- [ ] **Step 4: Declare the secret**

In `worker/jev.ts`, in the `Env` type, change the line

```ts
  BUILDS: DurableObjectNamespace<import("./db").BuildsDO>; DAILY_BUILD_CAP: string; DAILY_GAME_CAP: string;
```

to

```ts
  BUILDS: DurableObjectNamespace<import("./db").BuildsDO>; DAILY_BUILD_CAP: string; DAILY_GAME_CAP: string;
  DAILY_SECRET: string;
```

Append one line to `.dev.vars`, which is gitignored (`.gitignore:2`) and is never staged:

```
DAILY_SECRET=dev-only-daily-secret-change-me
```

- [ ] **Step 5: Run the tests**

Run: `bun test worker/identity.test.ts && bunx tsc -b --force`
Expected: `4 pass, 0 fail`, then no output from `tsc`.

- [ ] **Step 6: Commit**

```bash
git add worker/identity.ts worker/identity.test.ts worker/jev.ts
git commit -m "A signed cookie tells one daily player from another"
```

---

### Task 3: The game remembers it is a daily, and its run log

**Files:**
- Modify: `worker/engine.ts` (`Game`, `newGame`)
- Modify: `worker/game.ts` (`migrate`, `create`)
- Modify: `worker/game.test.ts` (one new test)

**Interfaces:**
- Consumes: Stage A's `Game`, `newGame(id, code, pack, faction, promises, calendar)`, `LedgerV4`, `migrate(game)`.
- Produces: `Game.mode: "daily" | "free"`, `Game.day: string | null`, `Game.log: RunRow[]`, `type Square = LedgerV4 | "quiet"`, `type RunRow = { turn: number; ledger: Square; delta: number; cause: string }`, and `newGame(id, code, pack, faction, promises, calendar, daily?: { day: string })`.

- [ ] **Step 1: Write the failing test**

Append to `worker/game.test.ts`:

```ts
test("a game saved before the daily existed loads as free play with an empty log", async () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 9 });
  const game: Game = newGame("g-old", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  delete (game as Partial<Game>).mode;
  delete (game as Partial<Game>).day;
  delete (game as Partial<Game>).log;
  const rows = [{ v: JSON.stringify({ game, prose: {} }) }];
  const ctx = { storage: { sql: { exec: () => ({ toArray: () => rows }) } } };
  const do_ = new (GameDO as any)(ctx, {});
  do_.ctx = ctx;
  const loaded = await do_.load();
  expect(loaded.game.mode).toBe("free");
  expect(loaded.game.day).toBeNull();
  expect(loaded.game.log).toEqual([]);
});

test("newGame marks a daily run with its day and starts the log empty", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 9 });
  const free = newGame("g-f", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  expect(free.mode).toBe("free");
  expect(free.day).toBeNull();
  const daily = newGame("g-d", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar, { day: "2026-09-22" });
  expect(daily.mode).toBe("daily");
  expect(daily.day).toBe("2026-09-22");
  expect(daily.log).toEqual([]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/game.test.ts -t "daily"`
Expected: FAIL, `expect(received).toBe("free")`, received `undefined`.

- [ ] **Step 3: Widen `Game` and `newGame`**

In `worker/engine.ts`, add three fields to the `Game` interface, beside `streak` and `bestStreak`:

```ts
  mode: "daily" | "free";
  day: string | null;          // the daily's day key; null in free play and in an archive replay
  log: RunRow[];               // one row a finished turn: the share grid, the style line, the decisive turns
```

Above `Game`, add the two types:

```ts
export type Square = LedgerV4 | "quiet";
export type RunRow = { turn: number; ledger: Square; delta: number; cause: string };
```

Change `newGame`'s signature and its returned object. The signature becomes:

```ts
export function newGame(id: string, code: string, pack: Pack, faction: string, promises: string[], calendar: Calendar, daily?: { day: string }): Game {
```

and inside the `const game: Game = { ... }` literal, add after `streak: 0, bestStreak: 0,`:

```ts
    mode: daily ? "daily" : "free", day: daily?.day ?? null, log: [],
```

- [ ] **Step 4: Migrate old saves and pass the day through**

In `worker/game.ts`, in `migrate(game)`, beside the defaults Stage A and Stage B already set there, add:

```ts
  game.mode ??= "free";       // a game saved before the daily existed is free play
  game.day ??= null;
  game.log ??= [];
```

`load()` is not touched: `migrate(game)` is the one save-migration site, which is where Stage A put it.

In `create()`, change the `newGame` call to pass the day the edge sent:

```ts
    const day = typeof body.day === "string" ? body.day : null;
    const game = newGame(id, code, pack, start.faction, promises.map((p) => pack.promises[p].tag), pack.calendar, day ? { day } : undefined);
```

- [ ] **Step 5: Run the tests**

Run: `bun test worker src && bunx tsc -b --force`
Expected: `0 fail`, then no output from `tsc`.

- [ ] **Step 6: Commit**

```bash
git add worker/engine.ts worker/game.ts worker/game.test.ts
git commit -m "A run knows whether it is today's daily and keeps a row a turn"
```

---

### Task 4: The run log, the grid and the style line, in the engine

**Files:**
- Modify: `worker/engine.ts` (append after `record`; `endTurn`; `continueTerm`)
- Modify: `worker/game.ts` (`view`)
- Modify: `worker/engine.test.ts`

**Interfaces:**
- Consumes: Stage A's `WireLine` (`{ kind, ledger?, id?, delta, cause }`), `TurnEnd`, `endTurn(pack, game)`, `continueTerm(pack, game)`, `Game.test?: TestResult`, `Game.result`; Task 3's `Square`, `RunRow`, `Game.log`.
- Produces: `type RunStyle = { line: string; decisive: { turn: number; line: string }[]; grid: { ledger: Square; won?: boolean }[] }`, `STYLE_LINES: Record<Square, string>`, `DECISIVE: number`, `biggestMove(wire: WireLine[], turn: number): RunRow`, `runStyle(pack: Pack, game: Game): RunStyle`. `view()` merges `runStyle` into `game.result`, so a finished run answers `result.line`, `result.decisive[]` and `result.grid[]`, which is what Stage C's Over screen and Stage C's landing read.

- [ ] **Step 1: Write the failing test**

Append to `worker/engine.test.ts`:

```ts
import { biggestMove, runStyle, STYLE_LINES } from "./engine";

test("the turn's row is the ledger that moved most, and a resistance line is not a ledger move", () => {
  expect(biggestMove([
    { kind: "ledger", ledger: "treasury", delta: -4, cause: "upkeep" },
    { kind: "ledger", ledger: "popularity", id: "r1", delta: 6, cause: "relief" },
    { kind: "ledger", ledger: "popularity", id: "r2", delta: 3, cause: "relief" },
  ], 4)).toEqual({ turn: 4, ledger: "popularity", delta: 9, cause: "relief" });
  expect(biggestMove([{ kind: "resistance", id: "army", delta: 30, cause: "the curfew" }], 2).ledger).toBe("quiet");
  expect(biggestMove([], 1)).toEqual({ turn: 1, ledger: "quiet", delta: 0, cause: "a still turn" });
});

test("the style line names the ledger that led the most turns, and the decisive turns are the two largest", () => {
  const g = game();
  g.log = [
    { turn: 1, ledger: "authority", delta: 3, cause: "a decree" },
    { turn: 2, ledger: "authority", delta: 12, cause: "the army was bought off" },
    { turn: 3, ledger: "treasury", delta: 30, cause: "the harbour works" },
  ];
  g.test = { won: true } as never;
  const r = runStyle(pack, g);
  expect(r.line).toBe(STYLE_LINES.authority);
  expect(r.decisive.map((d) => d.turn)).toEqual([2, 3]);
  expect(r.decisive[1].line).toContain("the harbour works");
  expect(r.grid.map((x) => x.ledger)).toEqual(["authority", "authority", "treasury"]);
  expect(r.grid[2].won).toBe(true);
  expect(r.grid[0].won).toBeUndefined();
});

test("a run with no finished turn has a grid with no rows and no decisive turn", () => {
  const g = game();
  expect(runStyle(pack, g)).toEqual({ line: STYLE_LINES.quiet, decisive: [], grid: [] });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/engine.test.ts -t "decisive"`
Expected: FAIL, `export 'biggestMove' not found in './engine'`.

- [ ] **Step 3: Write the log reader**

Append to `worker/engine.ts`, after `record`:

```ts
export type RunStyle = { line: string; decisive: { turn: number; line: string }[]; grid: { ledger: Square; won?: boolean }[] };

export const DECISIVE = 2;   // TUNE: turns R22 prints back

// R22: one sentence for the ledger that led the most turns. The engine states it; the client prints it.
export const STYLE_LINES: Record<Square, string> = {
  treasury: "You ruled from the treasury. The money decided more turns than anything else did.",
  authority: "You ruled by authority. You spent standing to get your way, turn after turn.",
  chest: "You ruled from the private chest. What you paid for quietly moved more than the budget did.",
  loyalty: "You ruled by loyalty. You kept the people around you close and paid for it elsewhere.",
  popularity: "You ruled by popularity. The country's mood led and the rest of it followed.",
  quiet: "You ruled quietly. Very little moved far in either direction.",
};

/** The row for one finished turn: the ledger whose absolute movement was largest across the turn's wire. */
export function biggestMove(wire: WireLine[], turn: number): RunRow {
  const sums = new Map<LedgerV4, { delta: number; cause: string; top: number }>();
  for (const l of wire) {
    if (l.kind !== "ledger" || !l.ledger) continue;
    const size = Math.abs(l.delta);
    const cur = sums.get(l.ledger) ?? { delta: 0, cause: l.cause, top: 0 };
    cur.delta += size;
    if (size > cur.top) { cur.top = size; cur.cause = l.cause; }
    sums.set(l.ledger, cur);
  }
  let row: RunRow = { turn, ledger: "quiet", delta: 0, cause: "a still turn" };
  for (const [ledger, v] of sums) if (v.delta > row.delta) row = { turn, ledger, delta: v.delta, cause: v.cause };
  return row;
}

/** R22 and spec §10, read off the run log. Pure, so `view()` may call it on every read of a finished run. */
export function runStyle(pack: Pack, game: Game): RunStyle {
  const log = game.log ?? [];
  const counts = new Map<Square, number>();
  for (const r of log) counts.set(r.ledger, (counts.get(r.ledger) ?? 0) + 1);
  let lead: Square = "quiet", most = 0;
  for (const [s, n] of counts) if (n > most) { most = n; lead = s; }
  const name = (s: Square) => (s === "quiet" ? "nothing" : pack.constitution?.ledgers[s].name ?? s);
  const decisive = [...log].sort((a, b) => b.delta - a.delta).slice(0, DECISIVE).sort((a, b) => a.turn - b.turn)
    .map((r) => ({ turn: r.turn, line: `${r.cause}. ${name(r.ledger)} moved ${Math.round(r.delta)}.` }));
  const grid: RunStyle["grid"] = log.map((r) => ({ ledger: r.ledger }));
  if (grid.length && typeof game.test?.won === "boolean") grid[grid.length - 1].won = game.test.won;
  return { line: STYLE_LINES[lead], decisive, grid };
}
```

- [ ] **Step 4: Append the row at the turn boundary, and clear it between terms**

In `worker/engine.ts`, inside `endTurn(pack, game)`, find the `return` that hands back the `TurnEnd`. Bind it
and push the row before returning, so the object the caller sees and the row the log keeps are built from
the same wire:

```ts
  const out: TurnEnd = { wire, warned, fired, event, pending };
  game.log.push(biggestMove(out.wire, game.log.length + 1));
  return out;
```

If the existing `return` already names a bound variable, add only the `game.log.push(...)` line above it.
The turn number is the log's own length, so it does not matter whether `game.turn` has advanced yet.

In `continueTerm(pack, game)`, beside the existing `game.bills = [];`, add:

```ts
  game.log = [];
```

so a grid is one term's turns, which is what the Over screen and the daily both print.

- [ ] **Step 5: Merge the three fields into the result the client reads**

In `worker/game.ts`, add `runStyle` to the import from `./engine`, and in `view()`, immediately after the line

```ts
    ...rest, ...extra,
```

add:

```ts
    // R22 and the share grid are read off the run log, because five places write game.result and none of them own this.
    ...(game.result ? { result: { ...game.result, ...runStyle(pack, game) } } : {}),
```

- [ ] **Step 6: Test the append**

Append to `worker/engine.test.ts`:

```ts
test("every finished turn adds one row to the log, and a new term starts an empty one", () => {
  const g = game();
  endTurn(pack, g);
  expect(g.log).toHaveLength(1);
  expect(g.log[0].turn).toBe(1);
  endTurn(pack, g);
  expect(g.log).toHaveLength(2);
  continueTerm(pack, g);
  expect(g.log).toEqual([]);
});
```

`game()` is the file's own fixture (`worker/engine.test.ts:26`), and `endTurn` and `continueTerm` are
already imported there.

- [ ] **Step 7: Run the tests**

Run: `bun test worker/engine.test.ts worker/game.test.ts && bunx tsc -b --force`
Expected: `0 fail`, then no output from `tsc`.

- [ ] **Step 8: Commit**

```bash
git add worker/engine.ts worker/game.ts worker/engine.test.ts
git commit -m "The engine keeps a run log, and a finished run states how it was ruled"
```

---

### Task 5: Daily mode on the seat route, with the attempt lock

**Files:**
- Modify: `worker/index.ts` (imports, the `Seat` type, `POST /api/games`)
- Create: `worker/index.test.ts`

**Interfaces:**
- Consumes: Task 1's `dayKey`, `getDaily`, `getPlay`, `takeAttempt`, `dropAttempt`; Task 2's `identity`; `hash` from `worker/engine.ts`.
- Produces: `POST /api/games` accepts `mode?: "daily" | "free"`; `dailySeed(day: string): number` exported from `worker/index.ts`.

| Method | Path | Body | Answers |
|---|---|---|---|
| POST | `/api/games` | `{ mode: "daily", faction, promises }` | 200 the view plus `Set-Cookie` when the identity is new; 409 `{ error: "You have played today's term.", game }` on a second attempt; 503 `"Today's term is still being written. Try again in a few minutes."` when no ready daily exists; 503 `"The daily is not set up yet."` when `DAILY_SECRET` is missing |

- [ ] **Step 1: Write the failing test**

Create `worker/index.test.ts`. It mocks the two modules only workerd resolves and imports `./index`
dynamically after them, exactly as `worker/game.test.ts:4-6` does, because `index.ts` re-exports `GameDO`,
`BuildsDO` and both Workflows:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/index.test.ts`
Expected: FAIL, `TypeError: dailySeed is not a function`. The module resolves, because the two mocks are in
place; the export does not exist yet.

- [ ] **Step 3: Add the imports and the seed**

In `worker/index.ts`, change the two import lines:

```ts
import { decodeCode, hash, scenarioTag } from "./engine";
import { dayKey, dropAttempt, failScenario, getDaily, getPlay, getScenario, newScenario, takeAttempt } from "./db";
```

and add after `const badJson = { error: "bad json" };`:

```ts
// One scenario and one seed a day for everyone (R12): the day key is the only input.
export const dailySeed = (day: string) => hash(day) & 0x7fffffff;
```

- [ ] **Step 4: Take the daily branch in `POST /api/games`**

In `worker/index.ts`, widen the `Seat` type:

```ts
type Seat = { scenario?: string; faction?: string | number; promises?: number[]; seed?: number; code?: string; platform?: string; mode?: "daily" | "free" };
```

That is the final shape of the type. `platform` is the Seat screen's oath sentence, which every branch
below forwards to the Durable Object; the daily forwards it too, so a daily player's oath is not dropped.

Replace the body of `app.post("/api/games", ...)` from `let seat: Seat;` down to `return r;` with:

```ts
  let seat: Seat;
  let attempt: { id: string; day: string; header?: string } | null = null;
  if (body.mode === "daily") {
    if (!c.env.DAILY_SECRET) return c.json({ error: "The daily is not set up yet." }, 503);
    const day = dayKey();
    const row = await getDaily(c.env, day);
    if (!row?.scenario || row.status !== "ready") return c.json({ error: "Today's term is still being written. Try again in a few minutes." }, 503);
    const who = await identity(c.env.DAILY_SECRET, c.req.raw);
    const head = who.header ? { "set-cookie": who.header } : undefined;
    const played = await getPlay(c.env, who.id, day);
    if (played) return c.json({ error: "You have played today's term.", game: played.game }, 409, head);
    seat = { scenario: row.scenario, faction: body.faction, promises: body.promises, seed: dailySeed(day), platform: body.platform };
    attempt = { id: who.id, day, header: who.header };
  } else if (body.code) {
    let code;
    try { code = decodeCode(body.code); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
    const found = await scenariosFromTag(c.env, code.scenario);
    if (found.length === 0) return c.json({ error: "That code names a scenario this archive does not have." }, 404);
    if (found.length > 1) return c.json({ error: "That code names more than one scenario. Load it from the archive." }, 409);
    seat = { scenario: found[0], faction: code.faction, promises: code.promises, seed: code.seed };
  } else {
    if (typeof body.scenario !== "string") return c.json({ error: "Name a scenario." }, 400);
    seat = { scenario: body.scenario, faction: body.faction, promises: body.promises, seed: body.seed, platform: body.platform };
  }
  const builds = buildsDO(c.env);
  if (!(await builds.takeGame())) return c.json({ error: "Today's games are used up. Try again tomorrow." }, 429);
  const id = crypto.randomUUID();
  // The lock is taken before the game exists, because that is what a lock is for; a failed create gives it back.
  if (attempt && !(await takeAttempt(c.env, attempt.id, attempt.day, id))) {
    // Two clicks at once: the loser is told the same thing as a second visit, with the same link back.
    const raced = await getPlay(c.env, attempt.id, attempt.day);
    return c.json({ error: "You have played today's term.", game: raced?.game ?? null }, 409,
      attempt.header ? { "set-cookie": attempt.header } : undefined);
  }
  const r = await forward(c, id, "new", { id, ...seat, day: attempt?.day ?? null });
  if (r.ok) await c.env.DB.prepare("UPDATE scenarios SET builds = builds + 1 WHERE id = ?").bind(seat.scenario).run();
  else if (attempt) await dropAttempt(c.env, attempt.id, attempt.day);
  if (r.ok && attempt?.header) {
    const out = new Response(r.body, r);
    out.headers.append("set-cookie", attempt.header);
    return out;
  }
  return r;
```

Add the identity import at the top of the file:

```ts
import { identity } from "./identity";
```

- [ ] **Step 5: Run the tests**

Run: `bun test worker src && bunx tsc -b --force`
Expected: `0 fail`, then no output from `tsc`.

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts worker/index.test.ts
git commit -m "Today's term seats one run for each player and no more"
```

---

### Task 6: The finished daily writes its grid back

**Files:**
- Modify: `worker/game.ts` (`epilogue`)
- Modify: `worker/game.test.ts`

**Interfaces:**
- Consumes: Task 1's `endPlay`; Task 4's `runStyle`; Stage A's `epilogue(s, pack)`, `game.result` and `game.test`.
- Produces: no new export. After a daily run ends, its `daily_plays` row carries `grid` (the JSON of `RunStyle["grid"]`, the same rows `GET /api/daily` answers), `won` and `ended = 1`.

- [ ] **Step 1: Write the failing test**

Append to `worker/game.test.ts`:

```ts
test("a daily run writes its grid to the play row exactly once, and a free run writes nothing", async () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 11 });
  const writes: unknown[][] = [];
  const env = { DB: { prepare: (sql: string) => ({ bind: (...a: unknown[]) => ({ run: async () => { writes.push([sql, ...a]); return { meta: { changes: 1 } }; } }) }) } } as never;

  const run = async (mode: "daily" | "free") => {
    const game: Game = newGame("g-" + mode, code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar,
      mode === "daily" ? { day: "2026-09-22" } : undefined);
    game.log = [{ turn: 1, ledger: "authority", delta: 6, cause: "a decree" }, { turn: 2, ledger: "treasury", delta: 9, cause: "the works" }];
    game.result = { ending: "reelected", score: 10 };
    game.test = { won: true } as never;
    const do_ = new (GameDO as any)({ storage: {} }, env);
    do_.env = env;
    // The prose is already written, so `epilogue` closes the play row and returns before it calls Luna.
    await do_.epilogue({ game, prose: { ending: { title: "t", body: "b" } } }, pack);
  };

  await run("free");
  expect(writes).toHaveLength(0);
  await run("daily");
  expect(writes).toHaveLength(1);
  expect(String(writes[0][0])).toContain("UPDATE daily_plays");
  expect(JSON.parse(String(writes[0][1])).map((r: { ledger: string }) => r.ledger)).toEqual(["authority", "treasury"]);
  expect(writes[0][2]).toBe(1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/game.test.ts -t "play row"`
Expected: FAIL, `expect(received).toHaveLength(1)`, received length 0.

- [ ] **Step 3: Write the grid back**

In `worker/game.ts`, add to the import from `./db`:

```ts
import { endPlay, getScenario } from "./db";
```

and to the import from `./engine`, add `runStyle`.

`epilogue` opens with one combined guard over a destructured game (`worker/game.ts:386`):

```ts
    const { game } = s;
    if (!game.result || s.prose.ending) return;
```

Split that guard in two and put the write between the halves. A run whose prose was written on an earlier
request still has to close its play row, and the `UPDATE` is idempotent, so a second pass costs one write
and changes nothing:

```ts
    const { game } = s;
    if (!game.result) return;
    // The row exists from the moment the seat was taken; this is the write that closes it. Idempotent.
    if (game.mode === "daily") await endPlay(this.env, game.id, JSON.stringify(runStyle(pack, game).grid), game.test?.won ?? false);
    if (s.prose.ending) return;
```

- [ ] **Step 4: Run the tests**

Run: `bun test worker src && bunx tsc -b --force`
Expected: `0 fail`, then no output from `tsc`.

- [ ] **Step 5: Commit**

```bash
git add worker/game.ts worker/game.test.ts
git commit -m "A finished daily leaves its grid in the play row"
```

---

### Task 7: The two daily reads

**Files:**
- Modify: `worker/index.ts` (two new routes)
- Modify: `worker/index.test.ts`

**Interfaces:**
- Consumes: Task 1's `dailyMeta`, `listDailies`, `getPlay`, `playCount`, `streakOf`, `dayKey`, `STREAK_LOOKBACK`, `ARCHIVE_LIMIT`; Task 2's `identity`.
- Produces:

| Method | Path | Answers |
|---|---|---|
| GET | `/api/daily` | 200 Stage C's `Daily` (below) plus `Set-Cookie` when the identity is new; 503 `"The daily is not set up yet."` without `DAILY_SECRET`; 503 `"Today's term is still being written. Try again in a few minutes."` when today's row is missing, still building or failed |
| GET | `/api/daily/archive` | 200 `{ day, scenario, title, era, place }[]`, newest first, at most `ARCHIVE_LIMIT` |

The 200 body is Stage C's `Daily` type (`src/api.ts`), field for field, and this stage never restates it:

```ts
type Daily = {
  day: string; scenario: string; title: string; era: string; place: string;
  played: boolean; streak: number; plays: number;
  grid?: { ledger: string; won?: boolean }[];
};
```

A day with nothing ready answers 503 rather than a half-empty 200, because Stage C's landing catches the
rejection and prints "Today's term is not up yet". That is also the honest answer for a day whose build
failed: there is no term to play until the next cron.

- [ ] **Step 1: Write the failing test**

Append to `worker/index.test.ts`, with the app taken from the same dynamic import the file already uses
(add this line directly under the existing `const { dailySeed } = await import("./index");`):

```ts
const app = (await import("./index")).default;
```

Then the tests:

```ts
const env = (rows: Record<string, unknown>) => ({
  DAILY_SECRET: "test-secret",
  RL: { limit: async () => ({ success: true }) },
  DB: {
    prepare: (sql: string) => ({
      bind: () => ({
        first: async () => (sql.includes("FROM dailies d") ? rows.daily : sql.includes("COUNT(*)") ? { n: rows.plays ?? 0 } : sql.includes("daily_plays") ? rows.play : null),
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/index.test.ts -t "daily route"`
Expected: FAIL, 404 rather than 200.

- [ ] **Step 3: Write the routes**

In `worker/index.ts`, extend the `./db` import with `ARCHIVE_LIMIT, dailyMeta, listDailies, playCount, STREAK_LOOKBACK, streakOf`. Add both routes directly above `app.get("/api/games/:id", ...)`:

```ts
// The body is Stage C's `Daily` type, field for field. A day with nothing ready is a 503, not a blank card.
app.get("/api/daily", async (c) => {
  if (!c.env.DAILY_SECRET) return c.json({ error: "The daily is not set up yet." }, 503);
  const day = dayKey();
  const [row, who] = await Promise.all([dailyMeta(c.env, day), identity(c.env.DAILY_SECRET, c.req.raw)]);
  const head = who.header ? { "set-cookie": who.header } : undefined;
  if (!row?.scenario || row.status !== "ready") {
    return c.json({ error: "Today's term is still being written. Try again in a few minutes." }, 503, head);
  }
  const [play, plays, streak] = await Promise.all([
    getPlay(c.env, who.id, day), playCount(c.env, day), streakOf(c.env, who.id, day, STREAK_LOOKBACK),
  ]);
  return c.json({
    day, scenario: row.scenario, title: row.title ?? day, era: row.era ?? "", place: row.place ?? "",
    played: !!play, streak, plays,
    ...(play?.grid ? { grid: JSON.parse(play.grid) } : {}),
  }, 200, head);
});

// Replaying an archived daily is ordinary free play: it takes the scenario route and never touches daily_plays.
app.get("/api/daily/archive", async (c) => c.json(
  (await listDailies(c.env, ARCHIVE_LIMIT)).map((d) => ({ day: d.day, scenario: d.scenario, title: d.title, era: d.era, place: d.place })),
));
```

- [ ] **Step 4: Run the tests**

Run: `bun test worker src && bunx tsc -b --force`
Expected: `0 fail`, then no output from `tsc`.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts worker/index.test.ts
git commit -m "The landing can ask what today's term is and how the streak stands"
```

---

### Task 8: Luna proposes tomorrow's scenario

**Files:**
- Create: `worker/gen/daily-prompt.ts`
- Create: `worker/gen/daily-prompt.test.ts`

**Interfaces:**
- Consumes: `luna` from `worker/luna.ts`, `HISTORIAN` and `CONTENT_RULE` from `worker/gen/prompts.ts`, Task 1's `DailyMeta`.
- Produces: `PROMPT_CHARS: number`, `DAILY_SYSTEM: string`, `dailyPrompt(env, past: DailyMeta[]): Promise<string>`, `duplicate(prompt: string, past: { place: string | null }[]): boolean`.

- [ ] **Step 1: Write the failing test**

Create `worker/gen/daily-prompt.test.ts`:

```ts
import { test, expect } from "bun:test";
import { DAILY_SYSTEM, duplicate } from "./daily-prompt";

test("the proposer is told to pick one place, one year, and no repeat", () => {
  expect(DAILY_SYSTEM).toContain("executive head");
  expect(DAILY_SYSTEM).toContain("at most 120 characters");
  expect(DAILY_SYSTEM).toContain("must not repeat any of the past dailies");
  expect(DAILY_SYSTEM).not.toContain("—");
});

test("a prompt naming a place a recent daily already used is a duplicate", () => {
  const past = [{ place: "Egypt" }, { place: "Chile" }];
  expect(duplicate("Egypt after the 2011 revolution", past)).toBe(true);
  expect(duplicate("egypt in 1952", past)).toBe(true);
  expect(duplicate("Bohemia in 1618", past)).toBe(false);
});

test("words that every prompt carries never make a duplicate", () => {
  expect(duplicate("The Roman republic after Sulla", [{ place: "Dutch Republic" }])).toBe(false);
  expect(duplicate("Prussia under Bismarck", [{ place: "Bavaria" }])).toBe(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/gen/daily-prompt.test.ts`
Expected: FAIL, `Cannot find module './daily-prompt'`.

- [ ] **Step 3: Write the proposer**

Create `worker/gen/daily-prompt.ts`:

```ts
import { z } from "zod";
import type { Env } from "../jev";
import type { DailyMeta } from "../db";
import { luna } from "../luna";
import { CONTENT_RULE, HISTORIAN } from "./prompts";

const DailyPromptSchema = z.object({ prompt: z.string(), why: z.string() });

export const PROMPT_CHARS = 120;   // TUNE: the prompt the model is asked for, and the clip code applies

export const DAILY_SYSTEM = `${HISTORIAN}

You pick the scenario for today's daily term. Every player gets the same place, the same year and the same seed, and runs it for 20 turns as its executive head.

Write one prompt, and follow all of these:
- One sentence, at most ${PROMPT_CHARS} characters, in English. It names a place and a year or a short period, and nothing else.
- Pick a year where a named person held executive power and could be removed inside about ten years: an election, a vote of no confidence, a coup, a succession, or the end of a term.
- It must not repeat any of the past dailies you are given, and must not name the same polity as any of them, whatever the year.
- Spread the map and the calendar. Do not put three of the last ten in one century, and do not put two of the last five on one continent.
- Half of them are places a reader has never played: a sultanate, a republic that lasted four years, a city state, a party congress, a colonial assembly.
Then write "why" in one sentence: what the player will be deciding.
${CONTENT_RULE}`;

/** The past dailies are the duplicate check the model sees; `duplicate` below is the check code repeats after. */
export async function dailyPrompt(env: Env, past: DailyMeta[]): Promise<string> {
  const d = await luna(env, DailyPromptSchema, "daily_prompt", DAILY_SYSTEM,
    JSON.stringify({
      past_dailies: past.map((p) => ({ day: p.day, title: p.title, era: p.era, place: p.place, prompt: p.prompt })),
    }), 300);
  return d.prompt.trim().slice(0, PROMPT_CHARS);
}

// Words every other prompt carries too, so a match on one of them says nothing about the polity.
const COMMON = new Set([
  "after", "under", "during", "before", "republic", "kingdom", "empire", "state", "states", "union",
  "early", "late", "year", "years", "revolution", "government", "council", "assembly", "province", "city",
]);
const words = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !COMMON.has(w));

export function duplicate(prompt: string, past: { place: string | null }[]): boolean {
  const mine = new Set(words(prompt));
  return past.some((p) => words(p.place ?? "").some((w) => mine.has(w)));
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test worker/gen && bunx tsc -b --force`
Expected: `0 fail`, then no output from `tsc`.

- [ ] **Step 5: Commit**

```bash
git add worker/gen/daily-prompt.ts worker/gen/daily-prompt.test.ts
git commit -m "Luna proposes a daily scenario the archive has not seen"
```

---

### Task 9: The cron and the daily Workflow

**Files:**
- Create: `worker/daily.ts`
- Modify: `wrangler.jsonc`
- Modify: `worker/index.ts` (the export and the `scheduled` handler)
- Modify: `worker/daily.test.ts`

**Interfaces:**
- Consumes: Task 1's `dayKey`, `getDaily`, `getScenario`, `listDailies`, `newScenario`, `putDaily`, `takeDaily`; Task 8's `dailyPrompt`, `duplicate`; the existing `ScenarioBuild` through `env.BUILD`.
- Produces: `class DailyBuild` with `DailyParams = { day: string }`, `PAST_DAILIES: number`, `BUILD_POLLS: number`, `POLL_SECONDS: string`, and the `DAILY` Workflow binding. `worker/index.ts` default export becomes `{ fetch, scheduled }` and re-exports `DailyBuild`. `Env` gains `DAILY: Workflow`.

- [ ] **Step 1: Write the failing test**

Append to `worker/daily.test.ts`:

```ts
const { DailyBuild, BUILD_POLLS, PAST_DAILIES } = await import("./daily");

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

test("the poll budget is bounded and the model sees a bounded history", () => {
  expect(BUILD_POLLS).toBeLessThanOrEqual(40);
  expect(PAST_DAILIES).toBeLessThanOrEqual(30);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/daily.test.ts`
Expected: FAIL, `Cannot find module './daily'`.

- [ ] **Step 3: Write the Workflow**

Create `worker/daily.ts`:

```ts
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "./jev";
import { getDaily, getScenario, listDailies, newScenario, putDaily, takeDaily } from "./db";
import { dailyPrompt, duplicate } from "./gen/daily-prompt";

export type DailyParams = { day: string };

const RETRY = { retries: { limit: 2, delay: "30 seconds", backoff: "exponential" }, timeout: "5 minutes" } as const;
export const PAST_DAILIES = 30;        // TUNE: past dailies the proposer is shown
export const BUILD_POLLS = 40;         // TUNE: 40 polls is 20 minutes; a build measures 60 to 120 seconds
export const POLL_SECONDS = "30 seconds";   // TUNE
const PROPOSE_TRIES = 2;               // TUNE: rerolls before a duplicate is accepted anyway

const scenarioId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => (b % 36).toString(36)).join("");

export class DailyBuild extends WorkflowEntrypoint<Env, DailyParams> {
  async run(event: WorkflowEvent<DailyParams>, step: WorkflowStep) {
    const env = this.env;
    const { day } = event.payload;

    const mine = await step.do("claim", RETRY, async () => {
      if (await takeDaily(env, day)) return true;
      // A retry after our own INSERT committed sees changes = 0. The row is still ours until it names a scenario.
      const row = await getDaily(env, day);
      return row?.status === "building" && !row.scenario;
    });
    if (!mine) return;

    const prompt = await step.do("propose", RETRY, async () => {
      const past = await listDailies(env, PAST_DAILIES);
      let last = "";
      for (let i = 0; i < PROPOSE_TRIES; i++) {
        last = await dailyPrompt(env, past);
        if (!duplicate(last, past)) return last;
      }
      // Two duplicates running means the model has run out of room, not that today has no term.
      return last;
    });

    // The id is minted in its own step, so a retry of the build reuses it instead of starting a second pack.
    const id = await step.do("id", RETRY, async () => scenarioId());
    const scenario = await step.do("build", RETRY, async () => {
      if (!(await getScenario(env, id))) {
        await newScenario(env, id, prompt);
        await env.BUILD.create({ id, params: { id, prompt } });
      }
      await putDaily(env, day, prompt, id, "building");
      return id;
    });

    for (let i = 0; i < BUILD_POLLS; i++) {
      await step.sleep(`wait-${i}`, POLL_SECONDS);
      const status = await step.do(`check-${i}`, RETRY, async () => (await getScenario(env, scenario))?.status ?? "missing");
      if (status === "ready") {
        await step.do("publish", RETRY, () => putDaily(env, day, prompt, scenario, "ready"));
        return;
      }
      if (status === "failed") break;
    }
    await step.do("failed", RETRY, () => putDaily(env, day, prompt, scenario, "failed"));
  }
}
```

A day written `failed` gets no second build: `GET /api/daily` answers 503 for it and the landing says the
term is still being written until the next cron claims the next day.

- [ ] **Step 4: Declare the trigger and the binding**

In `wrangler.jsonc`, replace the `workflows` line and add a `triggers` line after it:

```jsonc
  "workflows": [
    { "name": "build", "binding": "BUILD", "class_name": "ScenarioBuild" },
    { "name": "daily", "binding": "DAILY", "class_name": "DailyBuild" }
  ],
  // 03:07 UTC: a build takes 1 to 20 minutes and the first players of the day are hours away.
  "triggers": { "crons": ["7 3 * * *"] },
```

In `worker/jev.ts`, add `DAILY: Workflow;` to the `Env` type beside `BUILD: Workflow;`.

- [ ] **Step 5: Start the Workflow from the cron**

In `worker/index.ts`, add the export beside the others at the top:

```ts
export { DailyBuild } from "./daily";
```

and replace the last line, `export default app;`, with:

```ts
// The instance id is the day, so a cron that fires twice for one minute starts one Workflow.
const scheduled: ExportedHandlerScheduledHandler<Env> = async (event, env, ctx) => {
  const day = dayKey(event.scheduledTime);
  ctx.waitUntil(env.DAILY.create({ id: `daily-${day}`, params: { day } }).then(() => {}, (e) => console.error("daily", day, e)));
};

export default { fetch: app.fetch, scheduled };
```

- [ ] **Step 6: Run the tests and regenerate the types**

Run: `bunx wrangler types && bun test worker src && bunx tsc -b --force`
Expected: `worker-configuration.d.ts` rewritten, `0 fail`, no output from `tsc`. That file is gitignored
(`.gitignore:6`) and is never staged; it is regenerated because `tsc` reads the new `DAILY` binding from it.

- [ ] **Step 7: Commit**

```bash
git add worker/daily.ts worker/daily.test.ts worker/index.ts worker/jev.ts wrangler.jsonc
git commit -m "A cron writes tomorrow's term while nobody is playing"
```

---

### Task 10: The daily's play path, and the grid you can copy

Stage C owns the landing. It already renders today's card from its own `Daily` type, which Task 7 now
answers field for field, so this task writes no screen. It does two things: it makes the card's first
play carry `mode: "daily"`, so the attempt lock and the streak are exercised, and it adds the copy
button spec §10 asks for.

**Files:**
- Modify: `src/api.ts` (one call)
- Modify: `src/rules.ts`, `src/rules.test.ts`
- Modify: `src/App.tsx` (the `onPlayDaily` handler and `takeSeat`)
- Modify: `src/Landing.tsx` (one button)

**Interfaces:**
- Consumes: Task 7's `GET /api/daily`; Task 5's `mode: "daily"` on `POST /api/games`; Stage C's `Daily` type, `api.daily`, `src/Landing.tsx`, `hueClass`, and `takeSeat(faction, promises, seed, platform)` in `src/App.tsx`.
- Produces: `api.playDaily(faction, promises, platform)` in `src/api.ts`; `GRID_WIDTH`, `GRID_SQUARES` and `shareText(title, day, grid, streak)` in `src/rules.ts`.

Stage C's `Daily` type and its `daily()` call are used exactly as they stand. This task adds no second
`daily:` key, no `DailyState`, and no `src/Daily.tsx`.

- [ ] **Step 1: Add the one client call**

In `src/api.ts`, inside the `api` object, directly under the `seat:` line, add:

```ts
  playDaily: (faction: string, promises: number[], platform?: string) => call<GameView>("/games", { mode: "daily", faction, promises, platform }),
```

Nothing else in `src/api.ts` changes: `daily()`, the `Daily` type and `GameView` are Stage C's.

- [ ] **Step 2: Write the failing test**

Append to `src/rules.test.ts`:

```ts
import { shareText } from "./rules";

test("the copied grid is rows of five squares, then the verdict row", () => {
  const grid = [
    { ledger: "authority" }, { ledger: "popularity" }, { ledger: "quiet" }, { ledger: "treasury" },
    { ledger: "chest" }, { ledger: "loyalty", won: true },
  ];
  const lines = shareText("Rome, 44 BC", "2026-09-22", grid, 3).split("\n");
  expect(lines[0]).toBe("United States of Jev, Rome, 44 BC");
  expect(lines[1]).toBe("Daily 2026-09-22, streak 3");
  expect(lines[2]).toBe("🟪🟧⬜🟩🟨");
  expect(lines[3]).toBe("🟦");
  expect(lines[4]).toBe("✅✅✅✅");
  expect(lines[5]).toBe("unitedstatesofjev.deadpackets.pw");
});

test("a run with no verdict copies no verdict row", () => {
  const lines = shareText("Rome, 44 BC", "2026-09-22", [{ ledger: "authority" }], 0).split("\n");
  expect(lines[3]).toBe("unitedstatesofjev.deadpackets.pw");
  expect(shareText("Rome, 44 BC", "2026-09-22", [{ ledger: "treasury", won: false }], 0)).toContain("🟥🟥🟥🟥");
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bun test src/rules.test.ts -t "copied grid"`
Expected: FAIL, `export 'shareText' not found in './rules'`.

- [ ] **Step 4: Write the share text**

Append to `src/rules.ts`, beside `hueClass`:

```ts
export const GRID_WIDTH = 5;   // TUNE: squares a row, so a 20 turn term copies as four rows

// A message box carries characters and not CSS, so the copied grid uses the nearest square to each §9 hue.
export const GRID_SQUARES: Record<string, string> = {
  treasury: "🟩", authority: "🟪", chest: "🟨", loyalty: "🟦", popularity: "🟧", quiet: "⬜",
};

/** The streak changes every day, so the text is built at the moment it is copied and never stored. */
export function shareText(title: string, day: string, grid: { ledger: string; won?: boolean }[], streak: number): string {
  const rows: string[] = [];
  for (let i = 0; i < grid.length; i += GRID_WIDTH) {
    rows.push(grid.slice(i, i + GRID_WIDTH).map((g) => GRID_SQUARES[g.ledger] ?? "⬜").join(""));
  }
  const last = grid.at(-1);
  if (typeof last?.won === "boolean") rows.push((last.won ? "✅" : "🟥").repeat(4));
  return [
    `United States of Jev, ${title}`,
    `Daily ${day}, streak ${streak}`,
    ...rows,
    "unitedstatesofjev.deadpackets.pw",
  ].join("\n");
}
```

The verdict row is `✅` or `🟥`, never `🟩`, so a pasted grid cannot read a kept term as four treasury turns.

- [ ] **Step 5: Make the card's first play a daily play**

Stage C's landing has one button on the card. It reads "Take the seat" while `daily.played` is false and
"Play it again as practice" after that, and both call `onPlayDaily(daily.scenario)`. **The "Take the seat"
label is the one that must carry `mode: "daily"`**; the practice label stays the ordinary scenario path.
Stage C wires the prop straight to `open`, so neither label sends the mode today.

In `src/App.tsx`, beside the other state, add:

```tsx
  const [dailySeat, setDailySeat] = useState(false);
```

Above the return, add the handler:

```tsx
  // "Take the seat" on an unplayed day is the one path that spends the attempt; the replay is practice.
  const playDaily = useCallback(async (id: string) => {
    setDailySeat(!daily?.played);
    await open(id);
  }, [daily, open]);
```

Change the landing's prop from `onPlayDaily={open}` to:

```tsx
onPlayDaily={playDaily}
```

and change `takeSeat` so the seat call follows the flag:

```tsx
  const takeSeat = async (faction: string, promises: number[], seed: number, platform: string) => {
    const ok = await act(() => (dailySeat ? api.playDaily(faction, promises, platform) : api.seat(scenario!, faction, promises, seed, platform)));
    if (ok) go("/", true);
    return ok;
  };
```

The daily sends no seed: `POST /api/games` sets it from the day, which is what makes the draw the same
for everyone.

- [ ] **Step 6: Add the copy button**

In `src/Landing.tsx`, extend the rules import to `import { hueClass, shareText, type LedgerKey } from "./rules";`,
add `const [copied, setCopied] = useState(false);` beside the existing `text` and `code` state, and directly
after the `<div className="sharecard" ...>` block add:

```tsx
          {daily.played && daily.grid ? (
            <button className="btn ghost" disabled={busy} onClick={() => {
              navigator.clipboard.writeText(shareText(daily.title, daily.day, daily.grid!, daily.streak)).then(() => setCopied(true), () => setCopied(false));
            }}>{copied ? "Copied" : "Copy the grid"}</button>
          ) : null}
```

- [ ] **Step 7: Run the tests and the build**

Run: `bun test worker src && bunx tsc -b --force && bun run build && grep -c scandal_season dist/client/assets/*.js`
Expected: `0 fail`, no output from `tsc`, a clean Vite build, and `0` from `grep`.

- [ ] **Step 8: Commit**

```bash
git add src/api.ts src/rules.ts src/rules.test.ts src/App.tsx src/Landing.tsx
git commit -m "The daily card seats a daily run, and its grid can be copied"
```

---

### Task 11: Jev usage the bots can read

**Files:**
- Modify: `worker/jev.ts` (the meter)
- Modify: `worker/game.ts` (`Extra`, `fetch`, `reply`)
- Modify: `worker/jev.test.ts`

**Interfaces:**
- Consumes: the existing `jev(env, state, questions)`.
- Produces: `export const meter: { tokens: number; cost: number; calls: number; worst: number; reset(): void }` in `worker/jev.ts`; the view gains `usage?: { tokens: number; cost: number; calls: number; worst: number }`, present only when `env.BOTS === "1"`; `Env` gains `BOTS?: string`. `tokens` and `worst` are input tokens, which is the number the 64k request cap and the 20k per-holder budget are measured against; `cost` is the dollars the balance pass budgets with.

- [ ] **Step 1: Write the failing test**

Append to `worker/jev.test.ts`:

```ts
import { meter } from "./jev";

test("the meter counts one request's Jev tokens, its cost and its largest single call", () => {
  meter.reset();
  expect([meter.tokens, meter.cost, meter.calls, meter.worst]).toEqual([0, 0, 0, 0]);
  meter.tokens += 1200; meter.cost += 0.004; meter.calls++; meter.worst = Math.max(meter.worst, 1200);
  meter.tokens += 800; meter.calls++; meter.worst = Math.max(meter.worst, 800);
  expect(meter.tokens).toBe(2000);
  expect(meter.cost).toBeCloseTo(0.004, 5);
  expect(meter.calls).toBe(2);
  expect(meter.worst).toBe(1200);
  meter.reset();
  expect([meter.tokens, meter.cost, meter.calls, meter.worst]).toEqual([0, 0, 0, 0]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/jev.test.ts -t "meter"`
Expected: FAIL, `export 'meter' not found in './jev'`.

- [ ] **Step 3: Add the meter**

In `worker/jev.ts`, add `BOTS?: string;` to the `Env` type beside `MODEL?: string;`, and add above `export async function jev(`:

```ts
// Spec §11 wants tokens, cost and the largest single call a turn. One GameDO instance answers one request
// at a time and run.ts is sequential, so reset then read is safe; a shared isolate would need per-DO state.
export const meter = {
  tokens: 0, cost: 0, calls: 0, worst: 0,
  reset() { this.tokens = 0; this.cost = 0; this.calls = 0; this.worst = 0; },
};
```

Inside `jev()`, on the line that returns `{ answers: r.answers, usage: r.usage }`, add before it:

```ts
  // jev() is typed `usage: { input_tokens: number; cost?: number }`; there is no total_tokens on this response.
  const used = Number(r.usage?.input_tokens ?? 0);
  meter.tokens += used;
  meter.cost += Number(r.usage?.cost ?? 0);
  meter.worst = Math.max(meter.worst, used);
  meter.calls++;
```

`r` is the local the function already uses for the response body.

- [ ] **Step 4: Ship it behind the flag**

In `worker/game.ts`, add `meter` to the import from `./jev`, widen `Extra`:

```ts
type Extra = { deltas?: Record<string, number>; usage?: { tokens: number; cost: number; calls: number; worst: number } };
```

In `GameDO.fetch`, on the line right after the busy guard sets `busy = true`, add:

```ts
    meter.reset();
```

and in `reply`, before the `Response.json(...)`:

```ts
    // Off in production: BOTS is set only by the measurement config, so no player ever sees a token count.
    if (this.env.BOTS === "1") extra = { ...extra, usage: { tokens: meter.tokens, cost: meter.cost, calls: meter.calls, worst: meter.worst } };
```

- [ ] **Step 5: Run the tests**

Run: `bun test worker src && bunx tsc -b --force`
Expected: `0 fail`, then no output from `tsc`.

- [ ] **Step 6: Commit**

```bash
git add worker/jev.ts worker/game.ts worker/jev.test.ts
git commit -m "A measurement run can read the Jev tokens a turn spent"
```

---

### Task 12: The bot's client, and a tsconfig for the scripts

**Files:**
- Create: `scripts/bots/api.ts`
- Create: `tsconfig.scripts.json`
- Modify: `tsconfig.json`, `package.json`

**Interfaces:**
- Consumes: `GameView` from `src/api.ts`; Stage B's act routes `POST /api/games/:id/acts/price { turn, text, verb?, memberId? }` and `POST /api/games/:id/acts { turn }`, the bill routes `POST /api/games/:id/bills/:b/whip` and `/vote`, and Stage A's `POST /api/games/:id/turn/end`, `/midterm`, `/test`, `/continue`, `/stop`, `/events/:i`.
- Produces: `type Verb`, `type BotAct = { verb: Verb; text: string; memberId?: string }`, `type Whip`, `class Bot` with `seat`, `act`, `law`, `card`, `midterm`, `end`, `test`, `cont`, `stop`, and the fields `calls`, `ms`, `whip`. A `tsconfig.scripts.json` project, referenced from `tsconfig.json`, so `bunx tsc -b --force` type-checks `scripts/bots`.

Stage B deletes `POST /bills` (the draft route), `POST /post` and every campaign route, so no method here
touches them. A law and a proclamation are both ordinary priced acts.

- [ ] **Step 1: Write the client**

Create `scripts/bots/api.ts`:

```ts
// The bot drives the same HTTP API a player's browser does. Nothing here imports the worker.
import type { GameView } from "../../src/api";

export type Verb = "decree" | "law" | "appoint" | "spend" | "proclaim" | "favour" | "force";
export type BotAct = { verb: Verb; text: string; memberId?: string };
export type Whip = { expected: number; needed: number; yes: number; size: number };

export class Bot {
  calls = 0;
  ms = 0;
  whip: Whip | null = null;

  constructor(readonly base: string) {}

  async api(path: string, body?: unknown): Promise<GameView> {
    for (let attempt = 0; ; attempt++) {
      this.calls++;
      const t0 = performance.now();
      const r = await fetch(`${this.base}/api${path}`,
        body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      this.ms += performance.now() - t0;
      if (r.ok) return r.json() as Promise<GameView>;
      const text = await r.text();
      // wrangler.bots.jsonc allows 240 requests a minute and one bot turn is 6 to 12; back off rather than end the run.
      if (r.status === 429 && attempt < 5) { await new Promise((res) => setTimeout(res, 3000)); continue; }
      throw new Error(`${r.status} ${path}: ${text.slice(0, 300)}`);
    }
  }

  seat(scenario: string, faction: string | number, promises: number[], seed: number) {
    return this.api("/games", { scenario, faction, promises, seed });
  }

  /** Stage B's two call flow: price the text, then commit the tag. A refusal is priced, costs 1 authority and commits nothing. */
  async act(g: GameView, a: BotAct): Promise<GameView> {
    const turn = g.turn;
    const priced = await this.api(`/games/${g.id}/acts/price`, { turn, text: a.text, verb: a.verb, memberId: a.memberId });
    if (!priced.tag) return priced;
    return this.api(`/games/${g.id}/acts`, { turn });
  }

  /**
   * A law is that same act, which lands a bill on the floor, and then the vote.
   * The forecast is captured here because a voted bill comes back without `expected`.
   */
  async law(g: GameView, text: string): Promise<GameView> {
    const turn = g.turn;
    let view = await this.act(g, { verb: "law", text });
    let bill = view.bills.at(-1);
    if (!bill || bill.votes) return view;
    if (bill.expected === undefined) {
      const id = bill.id;
      view = await this.api(`/games/${view.id}/bills/${id}/whip`, { turn });
      bill = view.bills.find((b) => b.id === id);
    }
    if (!bill) return view;
    this.whip = { expected: bill.expected ?? 0, needed: bill.needed ?? bill.threshold ?? 0, yes: 0, size: view.pack.chamber.size };
    const voted = await this.api(`/games/${view.id}/bills/${bill.id}/vote`, { turn });
    this.whip.yes = voted.bills.find((b) => b.id === bill!.id)?.yes ?? 0;
    return voted;
  }

  /** Answer the first open card with the given stance, so a card never blocks the turn boundary. */
  async card(g: GameView, stance = 0): Promise<GameView> {
    const i = g.events.findIndex((e) => e.stance === undefined);
    return i < 0 ? g : this.api(`/games/${g.id}/events/${i}`, { turn: g.turn, stance });
  }

  midterm(g: GameView) { return this.api(`/games/${g.id}/midterm`, {}); }
  end(g: GameView) { return this.api(`/games/${g.id}/turn/end`, { turn: g.turn }); }
  test(g: GameView) { return this.api(`/games/${g.id}/test`, {}); }
  cont(g: GameView) { return this.api(`/games/${g.id}/continue`, {}); }
  stop(g: GameView) { return this.api(`/games/${g.id}/stop`, {}); }
}
```

- [ ] **Step 2: Give the scripts a tsconfig project**

`scripts/` is in no tsconfig project today, so a loose `bunx tsc --noEmit scripts/bots/*.ts` reports
`TS2580 Cannot find name 'process'` and cannot resolve `bun:test`. Install the types:

```bash
bun add -d @types/bun
```

Create `tsconfig.scripts.json`:

```jsonc
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.scripts.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "include": ["scripts/bots"]
}
```

`scripts/term.ts` stays outside the project: it is the route contract's hand-run script, not part of the
measurement harness. In `tsconfig.json`, add the third reference:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.worker.json" }, { "path": "./tsconfig.scripts.json" }]
}
```

- [ ] **Step 3: Check it type-checks**

Run: `bunx tsc -b --force`
Expected: no output. Every later task in this stage checks the scripts with this one command.

- [ ] **Step 4: Commit**

```bash
git add scripts/bots/api.ts tsconfig.scripts.json tsconfig.json package.json bun.lock
git commit -m "The bots get one client for the whole game API, and a tsconfig of their own"
```

---

### Task 13: The six policies

**Files:**
- Create: `scripts/bots/policies.ts`
- Create: `scripts/bots/policies.test.ts`

**Interfaces:**
- Consumes: Task 12's `BotAct` (`{ verb, text, memberId? }`), `Verb`; Stage A's view fields `ledgers`, `holders`, `instruments`, `promises`, `bar`, and the view's `members` and `pack.regions`.
- Produces: `type Policy = { name: string; style: boolean; acts(g: GameView, rnd: () => number): BotAct[] }`, `POLICIES: Policy[]`, `STYLES: string[]`, `OWN_FAILURE: Record<string, string[]>`, `mulberry(seed: number): () => number`.

- [ ] **Step 1: Write the failing test**

Create `scripts/bots/policies.test.ts`:

```ts
import { test, expect } from "bun:test";
import { OWN_FAILURE, POLICIES, STYLES, mulberry } from "./policies";

const view = (over: Record<string, unknown> = {}) => ({
  id: "g", turn: 3, term: 1, stage: "session", bar: 0.53,
  ledgers: { treasury: 40, authority: 9, chest: 12, loyalty: 60, popularity: { r1: 44, r2: 61 } },
  holders: [
    { id: "army", name: "the legions", stance: 0.4, resistance: 55, line: 60, weight: 0, levers: ["force", "favour"], where: "home" },
    { id: "senate", name: "the senate", stance: 0.5, resistance: 20, line: 70, weight: 0.4, levers: ["law"], where: "home" },
  ],
  instruments: {
    decree: { name: "decree", available: true, affordable: true }, law: { name: "law", available: true, affordable: true },
    appoint: { name: "appoint", available: true, affordable: true }, spend: { name: "spend", available: true, affordable: true },
    proclaim: { name: "post", available: true, affordable: true }, favour: { name: "favour", available: true, affordable: true },
    force: { name: "force", available: true, affordable: true },
  },
  promises: { grain: { label: "cheap grain", state: "pending", window: 12, passed: 0, share: 0.02, authored: false } },
  members: [{ id: "m1", name: "Vela" }, { id: "m2", name: "Otho" }],
  pack: { regions: [{ id: "r1", name: "the harbour" }, { id: "r2", name: "the hills" }], chamber: { size: 60 } },
  ...over,
}) as never;

test("there are six policies and four of them are the styles", () => {
  expect(POLICIES).toHaveLength(6);
  expect(POLICIES.map((p) => p.name).sort()).toEqual(["broker", "greedy", "idealist", "populist", "random", "strongman"]);
  expect(STYLES).toEqual(["strongman", "populist", "broker", "idealist"]);
  expect(Object.keys(OWN_FAILURE).sort()).toEqual(STYLES.slice().sort());
});

test("every policy returns at least one affordable act and never an empty text", () => {
  for (const p of POLICIES) {
    const acts = p.acts(view(), mulberry(7));
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      expect(a.text.length).toBeGreaterThan(11);
      expect(view().instruments[a.verb].available).toBe(true);
    }
  }
});

test("a favour names the member it is offered to, because that is what the price call takes", () => {
  const acts = POLICIES.find((p) => p.name === "broker")!.acts(view(), mulberry(1));
  expect(acts.some((a) => a.verb === "favour" && a.memberId === "m1")).toBe(true);
  for (const p of POLICIES) for (const a of p.acts(view(), mulberry(3))) expect(a).not.toHaveProperty("target");
});

test("each style reaches for its own verb", () => {
  const of = (name: string) => POLICIES.find((p) => p.name === name)!.acts(view(), mulberry(1)).map((a) => a.verb);
  expect(of("strongman")).toContain("decree");
  expect(of("populist")).toContain("proclaim");
  expect(of("broker")).toContain("law");
  expect(of("idealist")).toContain("law");
  expect(of("idealist")).not.toContain("force");
  expect(of("idealist")).not.toContain("decree");
});

test("a policy takes no verb the pack priced out of reach", () => {
  const priced = view({ instruments: { ...(view() as any).instruments, decree: { name: "decree", available: false, affordable: false } } });
  expect(POLICIES.find((p) => p.name === "strongman")!.acts(priced, mulberry(1)).map((a) => a.verb)).not.toContain("decree");
});

test("the same seed draws the same sequence", () => {
  const a = mulberry(42), b = mulberry(42);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test scripts/bots/policies.test.ts`
Expected: FAIL, `Cannot find module './policies'`.

- [ ] **Step 3: Write the policies**

Create `scripts/bots/policies.ts`:

```ts
import type { GameView } from "../../src/api";
import type { BotAct, Verb } from "./api";

export type Policy = { name: string; style: boolean; acts(g: GameView, rnd: () => number): BotAct[] };

export const STYLES = ["strongman", "populist", "broker", "idealist"];

// R23: the median run of a style must end by that style's own failure, not by a shared one.
export const OWN_FAILURE: Record<string, string[]> = {
  strongman: ["coup", "impeached"],
  populist: ["defeated", "lame_duck"],
  broker: ["defeated"],
  idealist: ["impeached", "defeated"],
};

/** A seeded generator, so a bot run with the same seed replays act for act. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Era-neutral and place-neutral, so the plausibility gate takes them in any polity. Three of each, cycled.
const WORKS = [
  "Repair the roads, the water supply and the public buildings, and publish the accounts of the works each month.",
  "Fund the supply of food and fuel for the coming year out of the treasury, and fix the duties charged on what is brought in.",
  "Set new rules for the officials who govern: fixed terms, published accounts, and a court that hears claims of extortion.",
];
const ORDERS = [
  "Order the public granaries opened and the price of bread held at last year's figure until the harvest is in.",
  "Order every office of the government to publish its accounts within the month, and suspend any officer who does not.",
  "Order a general levy on the largest estates to pay for the repair of the roads and the water supply.",
];
const POSTS = [
  "The roads, the water and the public buildings get fixed this year, and the accounts of every work go up in public each month. Read them.",
  "Food and fuel for the coming year are paid for out of the treasury, and the duties are fixed. No family here eats worse because a merchant found a price.",
  "An official who robs the public will answer for it in a court, with a fixed term and published books. The people who fear that rule are telling you who they are.",
];
const pick = <T,>(xs: T[], n: number) => xs[Math.abs(n) % xs.length];

const can = (g: GameView, v: Verb) => {
  const i = (g as never as { instruments?: Partial<Record<Verb, { available: boolean; affordable?: boolean }>> }).instruments?.[v];
  return !!i?.available && i.affordable !== false;
};
const holders = (g: GameView) => (g as never as { holders?: { id: string; name: string; resistance: number; line: number; weight: number }[] }).holders ?? [];
const nearestLine = (g: GameView) => holders(g).slice().sort((a, b) => (b.resistance - b.line) - (a.resistance - a.line))[0];
const heaviest = (g: GameView) => holders(g).slice().sort((a, b) => b.weight - a.weight)[0];
const weakestRegion = (g: GameView) => {
  const pop = (g.ledgers as never as { popularity?: Record<string, number> }).popularity ?? {};
  return Object.entries(pop).sort((a, b) => a[1] - b[1])[0]?.[0];
};
// Stage B's price call takes a memberId and nothing else: every other target is named in the text itself.
const regionName = (g: GameView, id: string | undefined) => g.pack.regions.find((r) => r.id === id)?.name ?? "the region that needs it most";
const firstMember = (g: GameView) => g.members[0]?.id;
const firstAvailable = (g: GameView, vs: Verb[]) => vs.find((v) => can(g, v));

export const POLICIES: Policy[] = [
  {
    name: "random", style: false,
    acts(g, rnd) {
      const open: Verb[] = (["decree", "law", "appoint", "spend", "proclaim", "favour", "force"] as Verb[]).filter((v) => can(g, v));
      const verb = open[Math.floor(rnd() * open.length)] ?? "proclaim";
      const text = verb === "proclaim" ? pick(POSTS, Math.floor(rnd() * 3)) : verb === "law" ? pick(WORKS, Math.floor(rnd() * 3)) : pick(ORDERS, Math.floor(rnd() * 3));
      return [{ verb, text }];
    },
  },
  {
    name: "greedy", style: false,
    // One step of popularity and nothing else: no promise tracking, no holder tracking (challenge-design §4).
    acts(g) {
      const out: BotAct[] = [];
      if (can(g, "proclaim")) out.push({ verb: "proclaim", text: pick(POSTS, g.turn) });
      const region = weakestRegion(g);
      if (can(g, "spend") && region) out.push({ verb: "spend", text: `Send relief to ${regionName(g, region)}, where the need is plainest.` });
      return out.length ? out : [{ verb: firstAvailable(g, ["law", "decree"]) ?? "law", text: pick(WORKS, g.turn) }];
    },
  },
  {
    name: "strongman", style: true,
    acts(g) {
      const out: BotAct[] = [];
      if (can(g, "appoint") && g.turn === 1) out.push({ verb: "appoint", text: "Put a loyal officer at the head of the security service." });
      if (can(g, "decree")) out.push({ verb: "decree", text: pick(ORDERS, g.turn) });
      const over = holders(g).find((h) => h.resistance >= h.line);
      if (over && can(g, "force")) out.push({ verb: "force", text: `Put a curfew on the districts where ${over.name} will not settle.` });
      return out.length ? out : [{ verb: firstAvailable(g, ["law", "proclaim"]) ?? "law", text: pick(WORKS, g.turn) }];
    },
  },
  {
    name: "populist", style: true,
    acts(g) {
      const out: BotAct[] = [];
      if (can(g, "proclaim")) out.push({ verb: "proclaim", text: pick(POSTS, g.turn) });
      const region = weakestRegion(g);
      if (can(g, "spend") && region) out.push({ verb: "spend", text: `Pay relief straight to the households of ${regionName(g, region)}.` });
      if (can(g, "decree") && g.turn % 4 === 0) out.push({ verb: "decree", text: pick(ORDERS, g.turn) });
      return out.length ? out : [{ verb: "law", text: pick(WORKS, g.turn) }];
    },
  },
  {
    name: "broker", style: true,
    acts(g) {
      const out: BotAct[] = [];
      const near = nearestLine(g);
      const member = firstMember(g);
      if (near && member && can(g, "favour")) out.push({ verb: "favour", text: `A place at the table and a share of the works, for a vote with ${near.name}.`, memberId: member });
      if (can(g, "law")) out.push({ verb: "law", text: pick(WORKS, g.turn) });
      const big = heaviest(g);
      if (big && can(g, "appoint") && g.turn % 6 === 0) out.push({ verb: "appoint", text: `Give the post to ${big.name}, which holds the most weight of any of them.` });
      return out.length ? out : [{ verb: "proclaim", text: pick(POSTS, g.turn) }];
    },
  },
  {
    name: "idealist", style: true,
    // Keeps the promises, never takes the two verbs that buy consent by force.
    acts(g) {
      const pending = Object.entries(g.promises ?? {}).find(([, p]) => (p as { state: string }).state === "pending");
      const out: BotAct[] = [];
      if (can(g, "law")) out.push({ verb: "law", text: pending ? `Write into law what was promised: ${(pending[1] as { label: string }).label}.` : pick(WORKS, g.turn) });
      if (can(g, "proclaim")) out.push({ verb: "proclaim", text: pick(POSTS, g.turn) });
      return out.length ? out : [{ verb: "spend", text: `Send relief to ${regionName(g, weakestRegion(g))}, where the need is plainest.` }];
    },
  },
];
```

- [ ] **Step 4: Run the tests**

Run: `bun test scripts/bots/policies.test.ts && bunx tsc -b --force`
Expected: `6 pass, 0 fail`, then no output from `tsc`.

- [ ] **Step 5: Commit**

```bash
git add scripts/bots/policies.ts scripts/bots/policies.test.ts
git commit -m "Six scripted policies, four of them the styles the balance gate measures"
```

---

### Task 14: The runner and the per-turn log

**Files:**
- Create: `scripts/bots/run.ts`
- Create: `wrangler.bots.jsonc`

**Interfaces:**
- Consumes: Task 12's `Bot` and its `whip`; Task 13's `POLICIES`, `mulberry`; Task 11's `usage` on the view.
- Produces: `type TurnLog`, `type RunLog`, `TERM_USD`, `BUDGET_USD`, `MAX_TERMS`, `TURNS_PER_TERM`, `HARD_STOP`, `TERM_MS`, `runTerm(bot: Bot, policy: Policy, g: GameView, log: TurnLog[], seed: number, run: string): Promise<GameView>`, and the CLI `bun scripts/bots/run.ts`.

- [ ] **Step 1: Write the bots config**

Create `wrangler.bots.jsonc`. It is `wrangler.jsonc` with six changes, listed here so drift between the two
files is visible: a different `name`, the rate limit raised from 40 to 240 a minute, `DAILY_GAME_CAP`
raised from 200 to 2000, `BOTS` set, `GOLDEN` set, and no `routes` and no `upload_source_maps` (it never
deploys).

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "unitedstatesofjev-bots",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "assets": { "directory": "./dist/client", "not_found_handling": "single-page-application" },
  "durable_objects": { "bindings": [{ "name": "GAME", "class_name": "GameDO" }, { "name": "BUILDS", "class_name": "BuildsDO" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["GameDO"] }, { "tag": "v2", "new_sqlite_classes": ["BuildsDO"] }],
  "ratelimits": [{ "name": "RL", "namespace_id": "1001", "simple": { "limit": 240, "period": 60 } }],
  "d1_databases": [{ "binding": "DB", "database_name": "usoj", "database_id": "f0792d84-dc66-4444-8f8d-8f3db4e94c36" }],
  "vectorize": [{ "binding": "VEC", "index_name": "usoj-scenarios" }],
  "r2_buckets": [{ "binding": "ART", "bucket_name": "usoj-art" }],
  "ai": { "binding": "AI" },
  "workflows": [
    { "name": "build", "binding": "BUILD", "class_name": "ScenarioBuild" },
    { "name": "daily", "binding": "DAILY", "class_name": "DailyBuild" }
  ],
  // BOTS puts the Jev token count on the view; GOLDEN records every model call. Both are off in production.
  "vars": { "DAILY_BUILD_CAP": "50", "DAILY_GAME_CAP": "2000", "BOTS": "1", "GOLDEN": "1" }
}
```

- [ ] **Step 2: Write the runner**

Create `scripts/bots/run.ts`:

```ts
// One measurement run: every policy against every seed, one JSONL line a turn.
// Run: bunx wrangler dev --config ./wrangler.bots.jsonc --port 8799
//      bun scripts/bots/run.ts --scenario v3nj3k --seeds 8 --terms 1 --out docs/bots/2026-09-22
import { mkdir, writeFile } from "node:fs/promises";
import type { GameView } from "../../src/api";
import { Bot, type BotAct, type Whip } from "./api";
import { POLICIES, mulberry, type Policy } from "./policies";

export const TERM_USD = 0.25;    // TUNE: a v3 term measured $0.2153. Task 16 replaces this with a measured v4 term.
export const BUDGET_USD = 25;    // TUNE: the most one balance pass may spend
export const MAX_TERMS = 100;    // TUNE: the hard stop, whatever the budget arithmetic says
export const TURNS_PER_TERM = 20;   // mirrors worker/engine.ts
export const HARD_STOP = 8;      // TUNE: steps a term may take beyond its turns before it is called stuck
export const TERM_MS = 1_200_000;   // TUNE: 20 minutes, the wall clock a single term may take

export type TurnLog = {
  run: string; policy: string; seed: number; term: number; turn: number; bar: number;
  ledgers: unknown; holders: { id: string; stance: number; resistance: number; line: number; weight: number }[];
  acts: { verb: string; expected: Record<string, number>; realised: Record<string, number> }[];
  whip: Whip | null;
  jev: { tokens: number; cost: number; calls: number; worst: number; ms: number };
  pending: string | null; wire: unknown[];
};
export type RunLog = { run: string; game: string; policy: string; seed: number; terms: number; ending: string | null; won: boolean | null; term1Won: boolean | null; mandate: number | null; bar: number | null; turns: TurnLog[] };

const num = (o: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((o ?? {}) as Record<string, unknown>)) {
    if (typeof v === "number") out[k] = v;
    else if (v && typeof v === "object") for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) if (typeof v2 === "number") out[`${k}.${k2}`] = v2;
  }
  return out;
};
const diff = (before: Record<string, number>, after: Record<string, number>) => {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const d = (after[k] ?? 0) - (before[k] ?? 0);
    if (d !== 0) out[k] = Math.round(d * 1000) / 1000;
  }
  return out;
};
const holdersOf = (g: GameView) => ((g as never as { holders?: TurnLog["holders"] }).holders ?? [])
  .map((h) => ({ id: h.id, stance: h.stance, resistance: h.resistance, line: h.line, weight: h.weight }));
const usageOf = (g: GameView) => (g as never as { usage?: { tokens: number; cost: number; calls: number; worst: number } }).usage
  ?? { tokens: 0, cost: 0, calls: 0, worst: 0 };
// The expected effect at commit time is the pack's own price for that verb, which the view prices per turn.
const priceOf = (g: GameView, verb: string): Record<string, number> => {
  const p = (g as never as { instruments?: Record<string, { price?: Record<string, number> }> }).instruments?.[verb]?.price ?? {};
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, -v]));
};

/** Drives one term to its test. Every stage the engine can be in is handled, and the loop is capped twice. */
export async function runTerm(bot: Bot, policy: Policy, g: GameView, log: TurnLog[], seed: number, run: string): Promise<GameView> {
  const rnd = mulberry(seed ^ 0x5eed);
  const cap = TURNS_PER_TERM + HARD_STOP;
  const started = performance.now();
  let steps = 0;
  while (g.stage === "session" || g.stage === "midterm") {
    if (++steps > cap) throw new Error(`the term took more than ${cap} steps and never reached the test`);
    if (performance.now() - started > TERM_MS) throw new Error(`the term took over ${Math.round(TERM_MS / 60_000)} minutes`);
    if (g.stage === "midterm") { g = await bot.midterm(g); continue; }

    const turn = g.turn, term = g.term, before = bot.ms;
    bot.whip = null;
    const rows: TurnLog["acts"] = [];
    for (const a of policy.acts(g, rnd) as BotAct[]) {
      const pre = num(g.ledgers), expected = priceOf(g, a.verb);
      try { g = a.verb === "law" ? await bot.law(g, a.text) : await bot.act(g, a); }
      catch { rows.push({ verb: a.verb, expected, realised: { refused: 1 } }); continue; }
      rows.push({ verb: a.verb, expected, realised: diff(pre, num(g.ledgers)) });
      if (g.stage !== "session") break;
    }
    g = await bot.card(g);
    if (g.stage === "session") g = await bot.end(g);
    log.push({
      run, policy: policy.name, seed, term, turn,
      bar: (g as never as { bar?: number }).bar ?? 0,
      ledgers: g.ledgers, holders: holdersOf(g), acts: rows, whip: bot.whip,
      jev: { ...usageOf(g), ms: Math.round(bot.ms - before) },
      pending: (g as never as { pending?: string | null }).pending ?? null,
      wire: (g as never as { wire?: unknown[] }).wire ?? [],
    });
    if (g.turn === turn && g.stage === "session") throw new Error(`turn ${turn} did not advance`);
  }
  if (g.stage === "test") g = await bot.test(g);
  return g;
}

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const base = arg("base", "http://127.0.0.1:8799");
const scenario = arg("scenario", "v3nj3k");
const faction = arg("faction", "0");
const seeds = Number(arg("seeds", "8"));
const maxTerms = Number(arg("terms", "1"));
const only = arg("policies", "all");
const out = arg("out", `docs/bots/${new Date().toISOString().slice(0, 10)}`);

const chosen = only === "all" ? POLICIES : POLICIES.filter((p) => only.split(",").includes(p.name));
const planned = chosen.length * seeds * maxTerms;
if (planned > MAX_TERMS || planned * TERM_USD > BUDGET_USD) {
  console.error(`FAIL: ${planned} terms is about $${(planned * TERM_USD).toFixed(2)}, over the cap of ${MAX_TERMS} terms / $${BUDGET_USD}.`);
  process.exit(1);
}
console.log(`${chosen.length} policies x ${seeds} seeds x up to ${maxTerms} terms = at most ${planned} terms, about $${(planned * TERM_USD).toFixed(2)}`);

await mkdir(out, { recursive: true });
const runs: RunLog[] = [];
const turns: TurnLog[] = [];
let spent = 0;

for (const policy of chosen) {
  for (let s = 0; s < seeds; s++) {
    const seed = 20260922 + s;
    const run = `${policy.name}-${seed}`;
    const bot = new Bot(base);
    let g = await bot.seat(scenario, faction, [0, 1, 2], seed);
    let terms = 0;
    let term1Won: boolean | null = null;
    try {
      while (terms < maxTerms) {
        const from = turns.length;
        g = await runTerm(bot, policy, g, turns, seed, run);
        terms++;
        // The meter's own cost is the truth; TERM_USD is only the estimate the plan was budgeted with.
        const measured = turns.slice(from).reduce((a, t) => a + t.jev.cost, 0);
        spent += measured > 0 ? measured : TERM_USD;
        if (terms === 1) term1Won = (g.test as never as { won?: boolean } | undefined)?.won ?? null;
        if (spent > BUDGET_USD) throw new Error("budget");
        if (g.stage !== "won" || terms >= maxTerms) break;
        g = await bot.cont(g);
      }
      if (g.stage === "won") g = await bot.stop(g);
    } catch (e) {
      console.error(`  ${run}: ${(e as Error).message}`);
    }
    const t = g.test as never as { mandate?: number; bar?: number; won?: boolean } | undefined;
    runs.push({ run, game: g.id, policy: policy.name, seed, terms, ending: g.result?.ending ?? null, won: t?.won ?? null, term1Won, mandate: t?.mandate ?? null, bar: t?.bar ?? null, turns: [] });
    console.log(`${run}: ${terms} term(s), ${g.result?.ending ?? "unfinished"}, mandate ${t?.mandate?.toFixed(3) ?? "n/a"} vs bar ${t?.bar?.toFixed(3) ?? "n/a"}, ${bot.calls} calls`);
    if (spent > BUDGET_USD) { console.error(`stopping: $${spent.toFixed(2)} spent`); break; }
  }
  if (spent > BUDGET_USD) break;
}

await writeFile(`${out}/turns.jsonl`, turns.map((t) => JSON.stringify(t)).join("\n") + "\n");
await writeFile(`${out}/runs.json`, JSON.stringify(runs, null, 2));
console.log(`\n${runs.length} runs, ${turns.length} turns, about $${spent.toFixed(2)}. Wrote ${out}/turns.jsonl and ${out}/runs.json`);
```

`--out` is always given a fresh directory: the term-1 spread and the multi-term own-failure runs must not
pool, and `docs/balance.md` names one directory for each.

- [ ] **Step 3: Check it type-checks**

Run: `bunx tsc -b --force`
Expected: no output.

- [ ] **Step 4: Prove the budget guard refuses an over-cap pass**

Run: `bun scripts/bots/run.ts --seeds 40 --terms 3`
Expected: exit 1 with `FAIL: 720 terms is about $180.00, over the cap of 100 terms / $25.`

This is arithmetic on the constants, so it needs no worker and spends nothing. Task 16 re-measures
`TERM_USD`, and both numbers in this line move with it.

- [ ] **Step 5: Commit**

```bash
git add scripts/bots/run.ts wrangler.bots.jsonc
git commit -m "One runner plays every policy on every seed inside a money cap"
```

---

### Task 15: The report and the four checks

**Files:**
- Create: `scripts/bots/report.ts`
- Create: `scripts/bots/report.test.ts`

**Interfaces:**
- Consumes: Task 14's `TurnLog`, `RunLog`, `turns.jsonl`, `runs.json`; Task 13's `STYLES`, `OWN_FAILURE`.
- Produces: `SKILL_GAP`, `BRIER_LIMIT`, `DRAW_SHARE`, `WIN_SPREAD`, `GAP_SCALE`, `brier(turns)`, `winRates(runs)`, `drawShare(runs)`, `flippable(runs, turns)`, `ownFailure(runs)`, `report(runs, turns): { rows: Check[]; ok: boolean }`, `type Check = { name: string; value: number; target: string; ok: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/bots/report.test.ts`:

```ts
import { test, expect } from "bun:test";
import { BRIER_LIMIT, DRAW_SHARE, GAP_SCALE, SKILL_GAP, WIN_SPREAD, brier, drawShare, ownFailure, report, winRates } from "./report";
import type { RunLog, TurnLog } from "./run";

const turn = (over: Partial<TurnLog> = {}): TurnLog => ({
  run: "r", policy: "broker", seed: 1, term: 1, turn: 1, bar: 0.5,
  ledgers: {}, holders: [], acts: [], whip: null, jev: { tokens: 0, cost: 0, calls: 0, worst: 0, ms: 0 }, pending: null, wire: [], ...over,
});
const run = (over: Partial<RunLog> = {}): RunLog => ({
  run: "r", game: "g", policy: "broker", seed: 1, terms: 1, ending: "reelected", won: true, term1Won: true, mandate: 0.6, bar: 0.5, turns: [], ...over,
});

test("a perfect forecast scores zero and a backwards one scores one", () => {
  expect(brier([turn({ whip: { expected: 60, needed: 31, yes: 60, size: 60 } })])).toBeCloseTo(0, 5);
  expect(brier([turn({ whip: { expected: 0, needed: 31, yes: 60, size: 60 } })])).toBeCloseTo(1, 5);
  expect(brier([turn()])).toBe(0);
});

test("win rates are the first term only, per policy, in points", () => {
  const rates = winRates([
    run({ policy: "greedy", term1Won: true }), run({ policy: "greedy", term1Won: false }),
    run({ policy: "broker", term1Won: true }),
    // A three term run that lost its third test still counts as the first term it won.
    run({ policy: "broker", terms: 3, won: false, term1Won: true }),
  ]);
  expect(rates.greedy).toBe(50);
  expect(rates.broker).toBe(100);
});

test("the draw share is the spread inside one policy over the spread across all of them", () => {
  const same = [run({ policy: "a", mandate: 0.5 }), run({ policy: "a", mandate: 0.5 }), run({ policy: "b", mandate: 0.7 }), run({ policy: "b", mandate: 0.7 })];
  expect(drawShare(same)).toBe(0);
  const oneOnly = [run({ policy: "a", mandate: 0.2 }), run({ policy: "a", mandate: 0.8 })];
  expect(drawShare(oneOnly)).toBe(1);
  // Each policy spreads 0.2 wide around its own mean, the four runs spread 0.6 wide: 0.01 / 0.05.
  const mixed = [run({ policy: "a", mandate: 0.2 }), run({ policy: "a", mandate: 0.4 }), run({ policy: "b", mandate: 0.6 }), run({ policy: "b", mandate: 0.8 })];
  expect(drawShare(mixed)).toBeCloseTo(0.2, 3);
});

test("a style whose losses are its own failure passes R23's second half", () => {
  expect(ownFailure([run({ policy: "strongman", won: false, ending: "coup" }), run({ policy: "strongman", won: false, ending: "coup" })]).strongman).toBe(true);
  expect(ownFailure([run({ policy: "strongman", won: false, ending: "defeated" }), run({ policy: "strongman", won: false, ending: "defeated" })]).strongman).toBe(false);
});

test("the report fails when a check misses its target", () => {
  const bad = report([run({ policy: "greedy", term1Won: true }), run({ policy: "broker", term1Won: true })], [turn()]);
  expect(bad.ok).toBe(false);
  expect(bad.rows.find((r) => r.name === "skill separation")!.ok).toBe(false);
  expect(SKILL_GAP).toBe(30);
  expect(BRIER_LIMIT).toBe(0.15);
  expect(DRAW_SHARE).toBe(0.2);
  expect(WIN_SPREAD).toBe(10);
  expect(GAP_SCALE).toBe(100);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test scripts/bots/report.test.ts`
Expected: FAIL, `Cannot find module './report'`.

- [ ] **Step 3: Write the report**

Create `scripts/bots/report.ts`:

```ts
// The four checks of spec §11 plus R23's two targets, over one run of scripts/bots/run.ts.
// Run: bun scripts/bots/report.ts docs/bots/2026-09-22
import { readFile } from "node:fs/promises";
import { OWN_FAILURE, STYLES } from "./policies";
import type { RunLog, TurnLog } from "./run";

export const SKILL_GAP = 30;      // TUNE: points the styles must beat greedy by (synthesis "Measuring it")
export const BRIER_LIMIT = 0.15;  // TUNE: whip-band Brier
export const DRAW_SHARE = 0.2;    // TUNE: share of the final mandate the draws may explain
export const WIN_SPREAD = 10;     // TUNE: points the four styles' term-1 win rates may differ by (R23)
export const GAP_SCALE = 100;     // TUNE: ledger points that count as one point of mandate

export type Check = { name: string; value: number; target: string; ok: boolean };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const variance = (xs: number[]) => { const m = mean(xs); return mean(xs.map((x) => (x - m) ** 2)); };

/** One forecast a law: the whip's expected share against the share that voted yes. */
export function brier(turns: TurnLog[]): number {
  const pairs = turns.filter((t) => t.whip && t.whip.size > 0)
    .map((t) => [(t.whip!.expected) / t.whip!.size, t.whip!.yes / t.whip!.size] as const);
  return pairs.length ? mean(pairs.map(([p, o]) => (p - o) ** 2)) : 0;
}

/** R23 and §11 both mean the first term. A run continued to three terms still counts once, for term 1. */
export function winRates(runs: RunLog[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const policy of new Set(runs.map((r) => r.policy))) {
    const firsts = runs.filter((r) => r.policy === policy && r.term1Won !== null);
    out[policy] = firsts.length ? Math.round((firsts.filter((r) => r.term1Won).length / firsts.length) * 100) : 0;
  }
  return out;
}

/**
 * The share of the final mandate's spread that the policy does not explain (challenge-design §4).
 * Hold the policy fixed and the rest is the live unseeded draws: mean within-policy variance over the
 * variance of every run. 0 means the policy decides the mandate, 1 means the draws do.
 */
export function drawShare(runs: RunLog[]): number {
  const usable = runs.filter((r) => typeof r.mandate === "number");
  if (usable.length < 2) return 0;
  const total = variance(usable.map((r) => r.mandate as number));
  if (total === 0) return 0;
  const within: number[] = [];
  for (const policy of new Set(usable.map((r) => r.policy))) {
    const m = usable.filter((r) => r.policy === policy).map((r) => r.mandate as number);
    if (m.length > 1) within.push(variance(m));
  }
  return within.length ? Math.round((mean(within) / total) * 1000) / 1000 : 0;
}

/** A loss is flippable when one act's own realised ledger movement, undone, covers the gap to the bar. */
export function flippable(runs: RunLog[], turns: TurnLog[]): number {
  const losses = runs.filter((r) => r.won === false && r.mandate !== null && r.bar !== null);
  if (!losses.length) return 1;
  const hit = losses.filter((r) => {
    const gap = (r.bar as number) - (r.mandate as number);
    const mine = turns.filter((t) => t.run === r.run).flatMap((t) => t.acts);
    const worst = Math.max(0, ...mine.map((a) => Math.max(0, ...Object.values(a.realised).map((v) => -v))));
    return worst >= gap * GAP_SCALE;
  });
  return Math.round((hit.length / losses.length) * 1000) / 1000;
}

/** R23: the median losing run of a style ends by that style's own failure. */
export function ownFailure(runs: RunLog[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const style of STYLES) {
    const lost = runs.filter((r) => r.policy === style && r.won === false && r.ending);
    const own = lost.filter((r) => OWN_FAILURE[style].includes(r.ending as string));
    out[style] = lost.length === 0 ? false : own.length * 2 >= lost.length;
  }
  return out;
}

export function report(runs: RunLog[], turns: TurnLog[]): { rows: Check[]; ok: boolean } {
  const rates = winRates(runs);
  const styleRate = mean(STYLES.map((s) => rates[s] ?? 0));
  const spread = Math.max(...STYLES.map((s) => rates[s] ?? 0)) - Math.min(...STYLES.map((s) => rates[s] ?? 0));
  const b = brier(turns), d = drawShare(runs), f = flippable(runs, turns);
  const own = ownFailure(runs);
  const rows: Check[] = [
    { name: "skill separation", value: Math.round(styleRate - (rates.greedy ?? 0)), target: `over ${SKILL_GAP} points`, ok: styleRate - (rates.greedy ?? 0) > SKILL_GAP },
    { name: "forecast calibration", value: Math.round(b * 1000) / 1000, target: `Brier under ${BRIER_LIMIT}`, ok: b < BRIER_LIMIT },
    { name: "lever identifiability", value: f, target: "every loss flippable", ok: f >= 1 },
    { name: "variance share", value: d, target: `under ${DRAW_SHARE}`, ok: d < DRAW_SHARE },
    { name: "style win spread", value: spread, target: `within ${WIN_SPREAD} points`, ok: spread <= WIN_SPREAD },
    { name: "own failure", value: Object.values(own).filter(Boolean).length, target: `${STYLES.length} of ${STYLES.length} styles`, ok: Object.values(own).every(Boolean) },
  ];
  return { rows, ok: rows.every((r) => r.ok) };
}

if (import.meta.main) {
  const dir = process.argv[2] ?? `docs/bots/${new Date().toISOString().slice(0, 10)}`;
  const runs: RunLog[] = JSON.parse(await readFile(`${dir}/runs.json`, "utf8"));
  const turns: TurnLog[] = (await readFile(`${dir}/turns.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const rates = winRates(runs);

  console.log(`\n${dir}: ${runs.length} runs, ${turns.length} turns\n`);
  console.log("| Policy | Term-1 win rate | Runs |");
  console.log("|---|---|---|");
  for (const [policy, rate] of Object.entries(rates)) {
    console.log(`| ${policy} | ${rate}% | ${runs.filter((r) => r.policy === policy).length} |`);
  }
  const { rows, ok } = report(runs, turns);
  console.log("\n| Check | Value | Target | |");
  console.log("|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.name} | ${r.value} | ${r.target} | ${r.ok ? "pass" : "FAIL"} |`);
  const per = (pick: (t: TurnLog) => number) => Math.round(turns.reduce((a, t) => a + pick(t), 0) / Math.max(1, turns.length));
  const spent = turns.reduce((a, t) => a + t.jev.cost, 0);
  console.log(`\nJev: ${per((t) => t.jev.tokens)} input tokens and ${per((t) => t.jev.ms)} ms the average turn, largest single call ${Math.max(0, ...turns.map((t) => t.jev.worst))} tokens`);
  console.log(`Cost: $${spent.toFixed(4)} over ${runs.length} runs, $${(spent / Math.max(1, runs.reduce((a, r) => a + r.terms, 0))).toFixed(4)} a term`);
  process.exit(ok ? 0 : 1);
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test scripts/bots/report.test.ts && bunx tsc -b --force`
Expected: `5 pass, 0 fail`, then no output from `tsc`.

- [ ] **Step 5: Commit**

```bash
git add scripts/bots/report.ts scripts/bots/report.test.ts
git commit -m "One report turns a bot run into the four checks and R23's targets"
```

---

### Task 16: One measured v4 term, and the numbers that come off it

Every cost number in this stage so far is the v3 term measured before the Ruler existed. A v4 turn adds a
Luna price call for each act and a Jev holder read for each moved holder, so the real figure has to be
measured before a pass is budgeted against it. One term does that, and the same term answers brief ruling
6 (re-measure `RECORD_TOKENS` and the per-holder read budget on a live 72 seat pack) and Stage B's open
`POST_BASELINE`.

**Files:**
- Modify: `scripts/bots/run.ts` (`TERM_USD`, `MAX_TERMS`)
- Modify: `worker/engine.ts` (`RECORD_TOKENS`, `POST_BASELINE`)
- Modify: `docs/experiments.md`

**Interfaces:**
- Consumes: Task 14's runner and `wrangler.bots.jsonc`; Task 15's `report.ts`; Task 11's `usage.worst`; Stage A's `RECORD_TOKENS`; Stage B's `POST_BASELINE`.
- Produces: no new export. `TERM_USD` and `MAX_TERMS` become measured values, `RECORD_TOKENS` is re-measured against the 20,000 token per-holder ceiling, `POST_BASELINE` is re-measured on real reactions, and all of it is written into `docs/experiments.md`.

- [ ] **Step 1: Find the largest live pack**

Run:

```bash
bunx wrangler d1 execute usoj --local --config ./wrangler.bots.jsonc --json \
  --command "SELECT id, title, json_extract(pack, '$.chamber.size') AS seats FROM scenarios WHERE status = 'ready' ORDER BY seats DESC LIMIT 5;"
```

Expected: up to five rows with a `seats` column. Take the id with the most seats; 72 is the largest the
generator writes. If no row has 60 seats or more, build one first and wait for it:

```bash
bunx wrangler dev --config ./wrangler.bots.jsonc --port 8799
curl -s -X POST localhost:8799/api/scenarios -H 'content-type: application/json' -d '{"prompt":"France in 1958"}'
curl -s localhost:8799/api/scenarios/<id>          # repeat until "status":"ready"
```

- [ ] **Step 2: Play one term on it**

With the bots worker running on port 8799:

```bash
bun scripts/bots/run.ts --scenario <id> --policies populist --seeds 1 --terms 1 --out docs/bots/<date>-measure
```

Expected: `1 policies x 1 seeds x up to 1 terms`, one run line, and `1 runs, 20 turns, about $N`.
The populist proclaims most turns, which is what the `POST_BASELINE` step needs.

- [ ] **Step 3: Read the three measurements off it**

Run: `bun scripts/bots/report.ts docs/bots/<date>-measure`
Expected: the `Jev:` line prints the average input tokens a turn and the largest single call, and the
`Cost:` line prints the dollars spent and the dollars a term. Both must be above zero: a zero says the
meter is reading the wrong field and Task 11 is wrong.

- [ ] **Step 4: Set the cost constants from it**

In `scripts/bots/run.ts`, replace the two constants with the measured term, rounded up to the next cent,
and the cap derived from it:

```ts
export const TERM_USD = <dollars a term from Step 3>;      // TUNE: measured, one 20 turn v4 term on a 72 seat pack, <date>
export const MAX_TERMS = <floor(BUDGET_USD / TERM_USD)>;   // TUNE: the hard stop, derived from the measured term
```

Run: `bun scripts/bots/run.ts --seeds 40 --terms 3`
Expected: exit 1, and the refusal line now prints the new arithmetic (`720 terms is about $...`).

- [ ] **Step 5: Check the per-holder read against the 64k cap**

The largest single Jev request of the term is the `largest single call` figure from Step 3. The check is:
**it prints under 20,000 input tokens.** If it is 18,000 or more, the per-holder record is too fat: scale
the budget by the ratio, in `worker/engine.ts`:

```ts
export const RECORD_TOKENS = <old value x 18000 / largest single call, rounded down>;   // TUNE: re-measured <date>
```

then repeat Step 2 and Step 3 once and check the new figure is under 20,000. If it was already under
18,000, leave the constant and change only its comment to record the measurement:

```ts
export const RECORD_TOKENS = 1200;   // TUNE: largest holder read measured <N> tokens on a 72 seat pack, <date>
```

- [ ] **Step 6: Re-measure the post baseline**

`POST_BASELINE` is what an average notice already earns before the post's own work: the share of reactions
that liked or passed it on, less twice the share that booed it. Read it off the term that was just played:

```bash
bun -e 'const runs = await Bun.file("docs/bots/<date>-measure/runs.json").json();
const g = await (await fetch(`http://127.0.0.1:8799/api/games/${runs[0].game}`)).json();
const v = g.posts.map((p) => (p.likes + p.shares - 2 * p.boos) / Math.max(1, p.likes + p.boos + p.shares + p.ignores));
console.log(v.length, (v.reduce((a, b) => a + b, 0) / v.length).toFixed(3));'
```

Expected: the number of posts in the term and one figure. If the term has fewer than five posts, run Step 2
again with `--policies greedy` and take the two terms together. Then in `worker/engine.ts`:

```ts
export const POST_BASELINE = <the measured figure>;   // TUNE: re-measured over <N> live posts, <date>
```

Stage B's own test asserts `POST_BASELINE` to two decimal places. Update that assertion in the same commit
if the measured figure moved it.

- [ ] **Step 7: Write the measurements down**

Append to `docs/experiments.md`:

```markdown
## One v4 term, measured, <date>

One 20 turn term, the populist policy, one seed, on a <N> seat pack, through `wrangler.bots.jsonc`.

| Measurement | Value | Where it went |
|---|---|---|
| Cost of one term | $<from Step 3> | `TERM_USD` in `scripts/bots/run.ts` |
| Terms one pass buys | <MAX_TERMS> | `MAX_TERMS` in `scripts/bots/run.ts` |
| Average Jev input tokens a turn | <from Step 3> | the §11 token column |
| Largest single Jev request | <from Step 3> | under the 20,000 per-holder ceiling and the 64k request cap |
| Per-holder record budget | <RECORD_TOKENS> | `RECORD_TOKENS` in `worker/engine.ts` |
| An average notice, before its own work | <from Step 6> | `POST_BASELINE` in `worker/engine.ts` |

The v3 figure of $0.2153 a term measured the game before the Ruler: it has no price call and no holder
reads, so it is not comparable and is not used anywhere after this.
```

- [ ] **Step 8: Run the tests and commit**

Run: `bun test worker src scripts && bunx tsc -b --force`
Expected: `0 fail` and no output from `tsc`.

```bash
git add scripts/bots/run.ts worker/engine.ts worker/engine.test.ts docs/experiments.md docs/bots
git commit -m "One measured v4 term sets the cost, the record budget and the post baseline"
```

---

### Task 17: The golden prompt set

**Files:**
- Create: `migrations/0003_golden.sql`
- Create: `worker/golden.ts`
- Create: `worker/golden.test.ts`
- Modify: `worker/jev.ts` (`post`, the recorder call)
- Create: `scripts/bots/golden.ts`

**Interfaces:**
- Consumes: `post(env, path, body)` in `worker/jev.ts`; `env.GOLDEN`.
- Produces: `recordGolden(env, kind, request, answer): Promise<void>` and `listGolden(env, limit)` in a new `worker/golden.ts`, `GOLDEN_N`, `GOLDEN_SHIFT`, and the CLI `bun scripts/bots/golden.ts export|replay`.

`worker/db.ts` is not touched: it imports `DurableObject` from `cloudflare:workers`, and `worker/jev.ts`
is imported without a mock by `worker/jev.test.ts`, `worker/engine.test.ts` and `worker/match.test.ts`.
The new module imports `type { Env }` and nothing else, so no test needs a new mock.

- [ ] **Step 1: Write the migration**

Create `migrations/0003_golden.sql`:

```sql
CREATE TABLE golden (id TEXT PRIMARY KEY, kind TEXT, request TEXT, answer TEXT, created INTEGER);
```

- [ ] **Step 2: Write the failing test**

Create `worker/golden.test.ts`. It needs no module mock, because `worker/golden.ts` imports only a type:

```ts
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
  await recordGolden(env, "luna", {}, {});   // resolves
  expect(true).toBe(true);
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bun test worker/golden.test.ts`
Expected: FAIL, `Cannot find module './golden'`.

- [ ] **Step 4: Write the recorder**

Create `worker/golden.ts`:

```ts
import type { Env } from "./jev";

/** Off unless GOLDEN is "1". A recording that fails is a lost sample, never a lost turn. */
export async function recordGolden(env: Env, kind: string, request: unknown, answer: unknown): Promise<void> {
  if (env.GOLDEN !== "1") return;
  try {
    // Stored whole: one Jev request is about 240,000 characters and a clipped one cannot be parsed back.
    const req = JSON.stringify(request);
    const id = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kind + req)))]
      .slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT OR IGNORE INTO golden (id, kind, request, answer, created) VALUES (?, ?, ?, ?, ?)")
      .bind(id, kind, req, JSON.stringify(answer), Date.now()).run();
  } catch (e) {
    console.warn("golden", String(e).slice(0, 120));
  }
}

export async function listGolden(env: Env, limit: number): Promise<{ id: string; kind: string; request: string; answer: string }[]> {
  const { results } = await env.DB.prepare("SELECT id, kind, request, answer FROM golden ORDER BY created DESC LIMIT ?")
    .bind(limit).all<{ id: string; kind: string; request: string; answer: string }>();
  return results;
}
```

In `worker/jev.ts`, add `GOLDEN?: string;` to `Env` beside `BOTS?: string;`, add the import

```ts
import { recordGolden } from "./golden";
```

and inside `post()`, on the success branch, replace `if (r.ok) return r.json();` with:

```ts
    if (r.ok) {
      const answer = await r.json();
      // Only the two model endpoints are a prompt set. worker/art.ts:34 posts image bodies through this
      // same function, and a base64 sheet is not a prompt.
      if (path === "systemone" || path === "chat/completions") {
        await recordGolden(env, path === "systemone" ? "jev" : "luna", body, answer);
      }
      return answer;
    }
```

- [ ] **Step 5: Write the export and replay script**

Create `scripts/bots/golden.ts`:

```ts
// The frozen prompt set of spec §8: export what a measurement run recorded, then replay it after a
// model or prompt change and print how far the distributions moved.
// Run: bun scripts/bots/golden.ts export docs/golden/2026-09-22.jsonl
//      bun scripts/bots/golden.ts replay docs/golden/2026-09-22.jsonl
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { $ } from "bun";

export const GOLDEN_N = 300;        // TUNE: prompts in the frozen set, and the cap on one replay
export const GOLDEN_SHIFT = 0.05;   // TUNE: mean absolute probability move that counts as drift

type Row = { id: string; kind: string; request: string; answer: string };

const probs = (answer: unknown): number[] => {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number" && v >= 0 && v <= 1) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(answer);
  return out;
};

const mode = process.argv[2] ?? "export";
const file = process.argv[3] ?? `docs/golden/${new Date().toISOString().slice(0, 10)}.jsonl`;

if (mode === "export") {
  // The rows are written by `wrangler dev --config ./wrangler.bots.jsonc`, which is local; production never sets GOLDEN.
  const sql = `SELECT id, kind, request, answer FROM golden ORDER BY created DESC LIMIT ${GOLDEN_N};`;
  const raw = await $`bunx wrangler d1 execute usoj --local --config ./wrangler.bots.jsonc --json --command ${sql}`.text();
  const rows: Row[] = JSON.parse(raw)[0]?.results ?? [];
  await mkdir(file.split("/").slice(0, -1).join("/"), { recursive: true });
  await writeFile(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`${rows.length} prompts written to ${file}`);
  console.log(`  jev ${rows.filter((r) => r.kind === "jev").length}, luna ${rows.filter((r) => r.kind === "luna").length}`);
  process.exit(0);
}

const key = process.env.OPENROUTER_API_KEY ?? (await readFile(".dev.vars", "utf8")).match(/OPENROUTER_API_KEY=(.*)/)?.[1]?.trim();
if (!key) { console.error("FAIL: set OPENROUTER_API_KEY or put it in .dev.vars"); process.exit(1); }

const rows: Row[] = (await readFile(file, "utf8")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
if (rows.length > GOLDEN_N) {
  console.error(`FAIL: ${rows.length} prompts in ${file}, over the cap of ${GOLDEN_N}. Split the file and replay one part.`);
  process.exit(1);
}
console.log(`replaying ${rows.length} prompts from ${file}`);

const shifts: number[] = [];
let failed = 0;
for (const row of rows) {
  let body: unknown;
  try { body = JSON.parse(row.request); } catch { failed++; continue; }
  const path = row.kind === "jev" ? "systemone" : "chat/completions";
  const r = await fetch(`https://openrouter.ai/api/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { failed++; continue; }
  const now = probs(await r.json()), then = probs(JSON.parse(row.answer));
  const n = Math.min(now.length, then.length);
  if (n) shifts.push(now.slice(0, n).reduce((a, v, i) => a + Math.abs(v - then[i]), 0) / n);
}

const mean = shifts.length ? shifts.reduce((a, b) => a + b, 0) / shifts.length : 0;
const worst = shifts.length ? Math.max(...shifts) : 0;
console.log(`\nmean shift ${mean.toFixed(4)}, worst ${worst.toFixed(4)}, ${failed} calls refused`);
console.log(mean < GOLDEN_SHIFT ? "pass: the models grade the frozen set as they did" : `FAIL: over ${GOLDEN_SHIFT}. Treat this as a balance change and re-measure.`);
process.exit(mean < GOLDEN_SHIFT ? 0 : 1);
```

- [ ] **Step 6: Run the tests and apply the migration**

Run: `bunx wrangler d1 migrations apply usoj --local && bun test worker src && bunx tsc -b --force`
Expected: `0003_golden.sql` applied, `0 fail`, no output from `tsc`.

- [ ] **Step 7: Commit**

```bash
git add migrations/0003_golden.sql worker/golden.ts worker/golden.test.ts worker/jev.ts scripts/bots/golden.ts
git commit -m "A measurement run freezes the prompt set it graded on"
```

---

### Task 18: The bias audit

**Files:**
- Create: `scripts/bots/bias.ts`
- Create: `scripts/bots/bias.test.ts`

**Interfaces:**
- Consumes: Task 12's `Bot`.
- Produces: `PAIRS: { a: string; b: string }[]`, `BIAS_LIMIT: number`, `SHARE_USD: number`, `biasOf(deltas: number[]): { mean: number; worst: number }`, and the CLI `bun scripts/bots/bias.ts`.

- [ ] **Step 1: Write the failing test**

Create `scripts/bots/bias.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test scripts/bots/bias.test.ts`
Expected: FAIL, `Cannot find module './bias'`.

- [ ] **Step 3: Write the audit**

Create `scripts/bots/bias.ts`:

```ts
// Spec §8's bias audit: the same act in two framings, and the whip's expected yes share for each.
// Run: bunx wrangler dev --config ./wrangler.bots.jsonc --port 8799
//      bun scripts/bots/bias.ts --scenario v3nj3k
import { Bot } from "./api";

export const BIAS_LIMIT = 0.05;   // TUNE: mean absolute shift in expected yes share that counts as bias
export const SHARE_USD = 0.02;    // TUNE: one seat, one priced act and one whip. The seat runs the whole pipeline.

/** Six acts, each written twice: the same money and the same rule, framed from either side. */
export const PAIRS: { a: string; b: string }[] = [
  {
    a: "Raise the duty on goods brought through the harbour by a tenth, and put the money into the repair of the roads.",
    b: "Pay for the repair of the roads out of a tenth added to the duty on goods brought through the harbour.",
  },
  {
    a: "Cut the payment made to the great estates by a fifth, and hold the saving in the treasury.",
    b: "Hold a fifth of the payment made to the great estates in the treasury instead of sending it out.",
  },
  {
    a: "Give every household in the poorest districts a month of free grain, paid from the treasury.",
    b: "Spend a month of the treasury's grain on the households of the poorest districts, free of charge.",
  },
  {
    a: "Fix the terms of the officials who govern at three years, and publish their accounts every month.",
    b: "Publish the accounts of every governing official each month, and end their term after three years.",
  },
  {
    a: "Take a levy on the largest fortunes to pay for the water supply the city has gone without.",
    b: "Pay for the water supply the city has gone without by a levy on the largest fortunes.",
  },
  {
    a: "Forgive the debts owed by the smallest farms, and pay their lenders half out of the treasury.",
    b: "Pay the lenders of the smallest farms half from the treasury, and cancel what those farms still owe.",
  },
];

export function biasOf(deltas: number[]): { mean: number; worst: number } {
  if (!deltas.length) return { mean: 0, worst: 0 };
  const abs = deltas.map(Math.abs);
  return {
    mean: Math.round((abs.reduce((a, b) => a + b, 0) / abs.length) * 1000) / 1000,
    worst: Math.round(Math.max(...abs) * 1000) / 1000,
  };
}

if (import.meta.main) {
  const arg = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
  };
  const base = arg("base", "http://127.0.0.1:8799");
  const scenario = arg("scenario", "v3nj3k");
  const bot = new Bot(base);
  const deltas: number[] = [];

  // Each reading is a whole seat as well as the priced act, and the seat runs the pipeline that costs the money.
  console.log(`${PAIRS.length} pairs, ${PAIRS.length * 2} seats and priced acts, about $${(PAIRS.length * 2 * SHARE_USD).toFixed(2)}\n`);
  for (const [i, pair] of PAIRS.entries()) {
    const share = async (text: string) => {
      // A fresh seat each time, so neither framing is judged after the other.
      let g = await bot.seat(scenario, 0, [0, 1, 2], 20260922 + i);
      // Stage B's flow: the priced act tables the bill. The vote is never cast, only the forecast is read.
      g = await bot.act(g, { verb: "law", text });
      const b = g.bills.at(-1);
      if (!b) return 0;
      if (b.expected === undefined) g = await bot.api(`/games/${g.id}/bills/${b.id}/whip`, { turn: g.turn });
      return (g.bills.at(-1)?.expected ?? 0) / g.pack.chamber.size;
    };
    const [a, b] = [await share(pair.a), await share(pair.b)];
    deltas.push(a - b);
    console.log(`pair ${i + 1}: ${(a * 100).toFixed(1)}% vs ${(b * 100).toFixed(1)}%, shift ${((a - b) * 100).toFixed(1)} points`);
  }

  const { mean, worst } = biasOf(deltas);
  console.log(`\nmean shift ${mean.toFixed(3)}, worst ${worst.toFixed(3)}, ${bot.calls} calls`);
  console.log(mean < BIAS_LIMIT ? "pass: the framing does not decide the vote" : `FAIL: over ${BIAS_LIMIT}. The whip reads the wording, not the act.`);
  process.exit(mean < BIAS_LIMIT ? 0 : 1);
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test scripts/bots && bunx tsc -b --force`
Expected: `0 fail`, then no output from `tsc`.

- [ ] **Step 5: Commit**

```bash
git add scripts/bots/bias.ts scripts/bots/bias.test.ts
git commit -m "The bias audit asks the whip the same act in two framings"
```

---

### Task 19: The balance pass, and the docs

**Files:**
- Create: `docs/balance.md`
- Modify: `README.md`
- Modify: `DESIGN.md`
- Modify: `docs/experiments.md`
- Modify: `package.json`, `scripts/term.ts`

**Interfaces:**
- Consumes: every earlier task's commands and constants.
- Produces: no code. `docs/balance.md` is the procedure every later retune follows.

- [ ] **Step 1: Write the procedure**

Create `docs/balance.md`:

````markdown
# The balance pass

The loop that turns the measurement bots into tuned numbers. One pass is `MAX_TERMS` terms and at most
`BUDGET_USD`, both in `scripts/bots/run.ts`; the cost of one term is the measured figure in
`docs/experiments.md`, "One v4 term, measured". Nothing here runs against production: it takes
`wrangler.bots.jsonc`, which raises the rate limit and sets `BOTS` and `GOLDEN`.

## The loop

1. **Start the worker.** `bunx wrangler dev --config ./wrangler.bots.jsonc --port 8799`
   Check: `curl -s localhost:8799/api/health` prints `{"ok":true}`.
2. **Run the term-1 spread.** `bun scripts/bots/run.ts --scenario <id> --seeds <N> --terms 1 --out docs/bots/<date>-spread`
   `N` is `MAX_TERMS / 6` rounded down, because six policies play every seed; the runner refuses anything
   larger before it spends. Check: `docs/bots/<date>-spread/runs.json` has `6 x N` rows.
3. **Read the report.** `bun scripts/bots/report.ts docs/bots/<date>-spread`
   Check: six rows print and the exit code says pass or fail.
4. **Run the own-failure terms separately.**
   `bun scripts/bots/run.ts --scenario <id> --policies strongman,populist,broker,idealist --seeds 4 --terms 3 --out docs/bots/<date>-terms`
   A different directory on purpose: these runs continue while they win, so pooling them into the spread
   would count one style several times. Read them with their own `report.ts` call.
5. **Change one constant.** Pick the first failing check in the table below, change the one constant it
   names in `worker/engine.ts`, and commit it on its own.
6. **Re-run steps 2 to 4.** A pass that changed two constants cannot say which one worked.

Stop when all six rows pass, or after four loops: a check that will not move in four loops is a design
question, not a number.

## Which constant a failed check names

| Failing check | Change first | Then |
|---|---|---|
| skill separation under 30 points | `RESIST_BYPASS`, `RESIST_SERVE`, so the styles' levers bite harder than the greedy post | `PROMISE_SHARE` |
| Brier over 0.15 | nothing in the engine: the whip prompt is the lever (`worker/jev.ts` `whipQuestions`) | re-run the golden set first |
| a loss not flippable | `LEDGER_LINES`, because a failure line reached by drift and not by an act is not teachable | `RESIST_DECAY` |
| variance share over 0.2 | the Jev swing cap, then `EARLY_WEIGHT` | `BAR.step` |
| style win spread over 10 points | the instrument prices in the pack's constitution, not the engine | `BAR.start` |
| a style not ending by its own failure | that style's response in the pack, then `WARN_TURNS` | `RESIST_HIT` |

## The extra terms, and what they cost

The cost column is `terms x TERM_USD`, with `TERM_USD` as measured in `docs/experiments.md`. Recompute it
whenever that constant moves.

| Check | Runs | Terms |
|---|---|---|
| Term-1 win rates and skill separation | 6 policies x N seeds x 1 term, into `<date>-spread` | 6N |
| Own failure over several terms | 4 styles x 4 seeds, continued while they win, capped at 3, into `<date>-terms` | up to 48 |
| Forecast calibration, variance share, flippability | from the same logs | 0 |
| Bias audit | 6 pairs x 2 seats and priced acts | 0 |
| Golden set replay | up to 300 recorded prompts | 0 |

`scripts/bots/run.ts` refuses a plan over `MAX_TERMS` or `BUDGET_USD` before it spends anything, and stops
mid-pass when the running total of the meter's own cost passes the budget. `scripts/bots/golden.ts replay`
refuses a file longer than `GOLDEN_N`.

## After a model or a prompt change

1. `bun scripts/bots/golden.ts export docs/golden/<date>.jsonl` right after a pass, while the recordings
   are fresh. Check: the file has up to 300 lines.
2. After the change, `bun scripts/bots/golden.ts replay docs/golden/<date>.jsonl`.
   Check: mean shift under 0.05. Over it, the change is a balance change: run the whole loop again.
3. `bun scripts/bots/bias.ts --scenario <id>`. Check: mean shift under 0.05.
````

- [ ] **Step 2: Write the README sections**

In `README.md`, add a section immediately before `## Cloudflare bindings`:

````markdown
## The daily

One scenario and one seed a day, for everyone. A cron at 03:07 UTC starts the `daily` Workflow: Luna
reads the last 30 dailies and proposes a scenario that repeats none of them, the ordinary build
pipeline runs it, and the `dailies` row is published when the scenario turns ready.

| Method | Path | What it answers |
|---|---|---|
| GET | `/api/daily` | today's scenario, whether this player has played it, the grid, the streak and the played count |
| GET | `/api/daily/archive` | the last 30 dailies, newest first; opening one is ordinary practice and never counts |
| POST | `/api/games` `{ mode: "daily" }` | seats today's term once per player, 409 after that |
| POST | `/api/games/:id/turn/end` | the turn boundary every run uses |

A player is a signed HttpOnly cookie, `usoj_id`, kept for 400 days and signed with the `DAILY_SECRET`
secret. One row in `daily_plays` per identity per day is both the attempt lock and the streak record.
Clearing cookies loses the streak; there is no account and no leaderboard.

Set the secret once: `bunx wrangler secret put DAILY_SECRET`.

## Measuring and balancing

```
bunx wrangler dev --config ./wrangler.bots.jsonc --port 8799
bun scripts/bots/run.ts --scenario <id> --seeds <N> --terms 1 --out docs/bots/<date>-spread
bun scripts/bots/report.ts docs/bots/<date>-spread
bun scripts/bots/bias.ts --scenario <id>
bun scripts/bots/golden.ts export docs/golden/<date>.jsonl
```

Six policies: `random`, `greedy` and the four styles `strongman`, `populist`, `broker`, `idealist`.
One pass is `MAX_TERMS` terms and at most `BUDGET_USD`, both in `scripts/bots/run.ts`; the runner refuses
a plan over either before it spends anything. The cost of one term is measured in `docs/experiments.md`
and the loop is in `docs/balance.md`.
````

In the `## Cloudflare bindings` section, add three rows to the table, matching its existing format:

```markdown
| `DAILY` | Workflow | `daily`, the cron-started build of today's term |
| `DAILY_SECRET` | secret | signs the `usoj_id` cookie |
| cron | trigger | `7 3 * * *`, one run a day |
```

- [ ] **Step 3: Write the share grid into DESIGN.md**

Append to `DESIGN.md`:

```markdown
## The share grid

One square a turn, in the hue of the ledger that moved most that turn, five to a row, and the test as
a final row of four. The hues are the five fixed resource hues, so a grid reads the same on every pack:

| Square | Light | Copied as |
|---|---|---|
| Treasury | `#227f53` | 🟩 |
| Authority | `#623e96` | 🟪 |
| Chest | `#a98738` | 🟨 |
| Loyalty | `#2b7592` | 🟦 |
| Popularity | `#a5417f` | 🟧 |
| A still turn | transparent | ⬜ |
| The test, kept | `#227f53` | ✅ |
| The test, lost | `#bb0916` | 🟥 |

The verdict row is not a green square: a copied 🟩 row would read as four treasury turns. The card draws
the hues from the CSS tokens, which carry a dark variant, and the copy button writes the characters,
because a message box carries characters and not CSS. A run that ended before its test has no final row.
```

- [ ] **Step 4: Write the Stage D budget into experiments**

Append to `docs/experiments.md`:

```markdown
## Stage D measurement budget

Terms per check, priced at the `TERM_USD` measured in "One v4 term, measured". Write the arithmetic out:
each cost is that figure times the terms in the row, and `N` is `MAX_TERMS / 6` rounded down.

| Check | Terms | Cost |
|---|---|---|
| Term-1 win rates, six policies, N seeds | 6N | 6N x TERM_USD |
| Own failure, four styles continued while winning, capped at three terms | up to 48 | 48 x TERM_USD |
| Forecast calibration, variance share, flippability | 0, from the same logs | $0.00 |
| Bias audit, six pairs | 0 | 12 seats and priced acts |
| Golden set replay, up to 300 prompts | 0 | one call a prompt |

Caps in code: `MAX_TERMS` and `BUDGET_USD` in `scripts/bots/run.ts`, checked before the first request and
again after every finished term, against the meter's own cost rather than the estimate.
```

- [ ] **Step 5: Put the bot tests in the test script, and run the stage gate**

In `package.json`, change the `test` script so the bot tests are not left to be remembered:

```json
    "test": "bun test worker src scripts",
```

`scripts/term.ts` still names a config that is not on `main`. Change its header line to the one config
this stage ships:

```ts
// Run: bunx wrangler dev --config ./wrangler.bots.jsonc --port 8799
```

Run: `bun test worker src scripts && bunx tsc -b --force && bun run build && grep -c scandal_season dist/client/assets/*.js`
Expected: `0 fail`, no output from `tsc` (which now type-checks `scripts/bots` through
`tsconfig.scripts.json`), a clean Vite build, and `0` from `grep`.

- [ ] **Step 6: Commit**

```bash
git add docs/balance.md README.md DESIGN.md docs/experiments.md package.json scripts/term.ts
git commit -m "The balance pass is written down, with what each loop costs"
```

---

## Self-review

**1. Spec coverage for Stage D (§12 row D, plus §10, §11, R12, R15, R22, R23).**

| Requirement | Task |
|---|---|
| The daily as a cron trigger (`triggers.crons`, a `scheduled` handler) | 9 |
| The cron starts a Workflow | 9 |
| Luna sees the past dailies (title, era, place, prompt) | 8, 9 |
| Luna proposes a non-duplicate prompt, code re-checks | 8 |
| The existing build pipeline runs it | 9 |
| A `dailies` table with day key, scenario id, status | 1 |
| It becomes today's daily | 7, 9 |
| The landing's daily card | Stage C ships it; 7 answers it, 10 makes its first play a daily play |
| The one-attempt lock per player identity, identity decided and documented with its trade-off | Decisions table, 1, 2, 5 |
| The streak and the played count | 1, 7 |
| The archive route, listing and replaying as practice, never the attempt | 7, Decisions table |
| The share grid: a square a turn in the hue of the ledger that moved most | 4 |
| The test as the final row | 4, 10 |
| Copied as text | 10 |
| Its engine-side data | 3, 4, 6 |
| R22's style line and the two decisive turns | 4 |
| Four style bots plus random and greedy, in `scripts/bots/` | 13 |
| Each a small policy over Stage B's act flow and the turn boundary | 12, 13, 14 |
| The per-turn log: five ledgers, each act's expected and realised effect, holder stances and resistance, whip band and vote, Jev tokens, cost and latency, Director state | 11, 12, 14 |
| The four checks: skill separation, Brier, flippability, draw share | 15 |
| R23's targets: term-1 win rates within 10 points, each style ends by its own failure | 13, 15 |
| Brief ruling 6: `RECORD_TOKENS` and the per-holder budget re-measured on a live 72 seat pack | 16 |
| A v4 term measured before the pass is budgeted, and `POST_BASELINE` re-measured | 16 |
| The balance pass as a documented loop over the TUNE constants | 19 |
| The golden prompt set, re-run on model or prompt change | 17 |
| The bias audit: same act, opposite framing, the vote delta | 18 |
| Docs: README, DESIGN.md, docs/experiments.md | 16, 19 |
| Cost: terms per check, and a cap | 14, 16, 19 |

Two spec lines are answered by a decision rather than a task, and both are stated in the Decisions
table: "Director state" in the per-turn log ships as `pending` plus `wire`, because `game.director` is
stripped from the view by the secrecy contract and Stage D does not widen it; and the §11 "expert" bot is
the four style bots pooled, so six policies exist, not seven. One more is a deliberate omission: no
archive list is added to the landing, because Stage C owns that screen and its props. The route is there
for whoever wants it.

**2. Placeholder scan.** No `TBD`, no "similar to Task N", no "add error handling", no step that names a
behaviour without its code. Four steps edit code an earlier stage writes and each quotes the line it lands
beside: Task 4 Step 4 (the `endTurn` return and `continueTerm`), Task 4 Step 5 (`view()`'s `...rest, ...extra,`),
Task 6 Step 3 (the combined guard at `worker/game.ts:386`, split in two with the write between the halves)
and Task 11 Step 3 (the `jev()` response local, `r`). Task 16 is a measurement task: its four numbers are
written by the implementer from the commands in its steps, and every step names the command, the shape of
the output and the check the number has to pass.

**2b. Command coverage.** Task 19 Step 5 moves `scripts` into the `package.json` `test` script, so the six
bot test files run with every later `bun test`. Until then Tasks 13, 15 and 18 run their own files. The
type check is one command for the whole repo from Task 12 onward, because `tsconfig.scripts.json` is a
referenced project: `bunx tsc -b --force`.

**3. Type consistency.** `Square` and `RunRow` are defined once, in `worker/engine.ts` (Task 3). The client
never restates them: Stage C's `Daily` and `GameView["result"]` type the grid rows as
`{ ledger: string; won?: boolean }[]`, and `src/rules.ts` takes that shape as its argument. `Verb` is
declared again in `scripts/bots/api.ts`, and that duplication is for `scripts/bots/`, which must not import
worker code at all; `src/api.ts` does import types from `../worker/engine`, so "the client never imports the
engine" would be false. The two unions have the same seven members, and `scripts/bots/policies.test.ts`
asserts every act's verb against the view's own instruments. `dayKey` has one definition, in `worker/db.ts`,
used by `index.ts` and `daily.ts`. `TurnLog`, `RunLog` and `Whip` are defined once, in `scripts/bots/run.ts`
and `scripts/bots/api.ts`, and imported by `report.ts` and the tests. `Env` gains exactly four fields across
the stage: `DAILY_SECRET` (Task 2), `DAILY` (Task 9), `BOTS` (Task 11), `GOLDEN` (Task 17).

**4. Cross-stage reads.** Every name this stage takes from another stage is quoted where it is used:
Stage A's `endTurn`, `continueTerm`, `WireLine.kind`, `migrate`, `RECORD_TOKENS` and the `/turn/end`,
`/test`, `/stop`, `/midterm` routes; Stage B's `POST /acts/price` then `POST /acts`, the vote route,
`POST_BASELINE`, and the removal of `/bills` (draft), `/post` and the campaign; Stage C's `Daily`,
`api.daily`, `src/Landing.tsx`, `hueClass`, `takeSeat(faction, promises, seed, platform)` and the
`onPlayDaily` prop. Stage C's "Assumed from Stage D" table names three shapes, and Tasks 4 and 7 produce
all three: `GET /api/daily` in Stage C's shape, `game.result.line` with `result.decisive[]`, and
`game.result.grid[]` with one entry a turn.

---

## Interfaces produced

Everything below is Stage D's contract.

### `worker/db.ts`

```ts
export type DailyRow = { day: string; scenario: string | null; status: string; prompt: string | null; created: number };
export type DailyMeta = DailyRow & { title: string | null; era: string | null; place: string | null };
export type PlayRow = { id: string; day: string; game: string; grid: string | null; won: number | null; ended: number };

export const STREAK_LOOKBACK: number;   // 60 TUNE
export const ARCHIVE_LIMIT: number;     // 30 TUNE

export const dayKey: (at?: number) => string;                    // UTC calendar day, "YYYY-MM-DD"
export const shiftDay: (day: string, by: number) => string;

export function getDaily(env: Env, day: string): Promise<DailyRow | null>;
export function dailyMeta(env: Env, day: string): Promise<DailyMeta | null>;
export function takeDaily(env: Env, day: string): Promise<boolean>;
export function putDaily(env: Env, day: string, prompt: string, scenario: string | null, status: string): Promise<void>;
export function listDailies(env: Env, limit: number): Promise<DailyMeta[]>;
export function takeAttempt(env: Env, id: string, day: string, game: string): Promise<boolean>;
export function dropAttempt(env: Env, id: string, day: string): Promise<void>;
export function getPlay(env: Env, id: string, day: string): Promise<PlayRow | null>;
export function playCount(env: Env, day: string): Promise<number>;
export function endPlay(env: Env, game: string, grid: string, won: boolean): Promise<void>;
export function streakOf(env: Env, id: string, today: string, lookback: number): Promise<number>;
```

Tables, `migrations/0002_daily.sql` and `migrations/0003_golden.sql`:

```sql
dailies      (day TEXT PRIMARY KEY, scenario TEXT, status TEXT, prompt TEXT, created INTEGER)
daily_plays  (id TEXT, day TEXT, game TEXT, grid TEXT, won INTEGER, ended INTEGER DEFAULT 0, created INTEGER, PRIMARY KEY (id, day))
golden       (id TEXT PRIMARY KEY, kind TEXT, request TEXT, answer TEXT, created INTEGER)
```

`dailies.status` is one of `"building" | "ready" | "failed"`. `daily_plays.grid` holds the JSON of
`RunStyle["grid"]`, which is what `GET /api/daily` answers as `grid`.

### `worker/golden.ts` (new)

```ts
// Imports `type { Env }` and nothing else, so no test of worker/jev.ts needs a cloudflare:workers mock.
export function recordGolden(env: Env, kind: string, request: unknown, answer: unknown): Promise<void>;
export function listGolden(env: Env, limit: number): Promise<{ id: string; kind: string; request: string; answer: string }[]>;
```

The request and the answer are stored whole. There is no clip: one Jev request is about 240,000 characters
and a clipped one cannot be parsed back, which is the whole point of a frozen prompt set.

### `worker/identity.ts`

```ts
export const IDENTITY_COOKIE: string;                                   // "usoj_id"
export function signId(secret: string, id: string): Promise<string>;    // `<uuid>.<HMAC-SHA256 base64url>`
export function verifyId(secret: string, value: string): Promise<string | null>;
export function cookieOf(req: Request): string | null;
export const setCookie: (signed: string) => string;                     // Path=/; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax
export function identity(secret: string, req: Request): Promise<{ id: string; header?: string }>;
```

### `worker/engine.ts`

```ts
export type Square = LedgerV4 | "quiet";
export type RunRow = { turn: number; ledger: Square; delta: number; cause: string };
export type RunStyle = { line: string; decisive: { turn: number; line: string }[]; grid: { ledger: Square; won?: boolean }[] };

export const DECISIVE: number;                      // 2 TUNE, the turns R22 prints back
export const STYLE_LINES: Record<Square, string>;   // one sentence a ledger, R22's style line

export function biggestMove(wire: WireLine[], turn: number): RunRow;   // reads only lines with kind === "ledger"
export function runStyle(pack: Pack, game: Game): RunStyle;            // pure, read off game.log

// Game gains, beside streak and bestStreak:
//   mode: "daily" | "free";
//   day: string | null;
//   log: RunRow[];
// newGame gains a seventh argument:
export function newGame(id: string, code: string, pack: Pack, faction: string, promises: string[], calendar: Calendar, daily?: { day: string }): Game;
// endTurn additionally pushes biggestMove(wire, game.log.length + 1) onto game.log before it returns.
// continueTerm additionally clears game.log, so a grid is one term's turns.
// RECORD_TOKENS and POST_BASELINE keep their names and are re-measured in Task 16.
```

### `worker/game.ts`

```ts
// migrate(game) additionally defaults mode, day and log, so a save from before the daily loads as free play.
// view() merges runStyle(pack, game) into game.result on a finished run, so the client reads
//   result.line, result.decisive[] and result.grid[] without the engine writing them five times over.
// epilogue closes a finished daily's play row through endPlay before it returns on already written prose.
```

### `worker/gen/daily-prompt.ts`

```ts
export const PROMPT_CHARS: number;   // 120 TUNE, in the system text and in the clip
export const DAILY_SYSTEM: string;
export function dailyPrompt(env: Env, past: DailyMeta[]): Promise<string>;
export function duplicate(prompt: string, past: { place: string | null }[]): boolean;
```

### `worker/daily.ts`

```ts
export type DailyParams = { day: string };
export const PAST_DAILIES: number;    // 30 TUNE
export const BUILD_POLLS: number;     // 40 TUNE
export const POLL_SECONDS: string;    // "30 seconds" TUNE
export class DailyBuild extends WorkflowEntrypoint<Env, DailyParams> {}
// Steps in order: claim, propose, id, build, wait-N / check-N (N < BUILD_POLLS), then publish or failed.
// claim reads the row back, and id is its own step, so a retry never starts a second pack build.
```

### `worker/jev.ts`

```ts
export const meter: { tokens: number; cost: number; calls: number; worst: number; reset(): void };
// tokens and worst are input tokens, from usage.input_tokens; cost is usage.cost.
// post() records through recordGolden when env.GOLDEN === "1", and only for path "systemone" and
//   "chat/completions", so the image route's base64 answers are never filed as prompts.
// Env gains: DAILY_SECRET: string; DAILY: Workflow; BOTS?: string; GOLDEN?: string;
```

### `worker/index.ts`

```ts
export const dailySeed: (day: string) => number;      // hash(day) & 0x7fffffff
export { DailyBuild } from "./daily";
export default { fetch, scheduled };                  // scheduled starts DAILY with id `daily-<day>`
```

### Routes

| Method | Path | Body | Answers |
|---|---|---|---|
| GET | `/api/daily` | none | 200 Stage C's `Daily`, plus `Set-Cookie: usoj_id=...` when the identity is new; 503 `"Today's term is still being written. Try again in a few minutes."` when no term is ready; 503 `"The daily is not set up yet."` without `DAILY_SECRET` |
| GET | `/api/daily/archive` | none | 200 `{ day, scenario, title, era, place }[]`, newest first, at most `ARCHIVE_LIMIT` |
| POST | `/api/games` | `{ mode: "daily", faction, promises, platform? }` | 200 the full view plus `Set-Cookie` when new; 409 `{ error: "You have played today's term.", game }`; 503 `"Today's term is still being written. Try again in a few minutes."`; 503 `"The daily is not set up yet."`; 429 `"Today's games are used up. Try again tomorrow."` |
| POST | `/api/games` | `{ scenario, faction, promises, seed?, platform? }` | unchanged. An archived daily replays here, as practice, and never touches `daily_plays` |

`POST /api/games` forwards `day` and `platform` to the DO's `new` handler; the DO passes the day to `newGame`.

### View fields

```ts
{
  // everything Stage A, B and C ship, plus:
  mode: "daily" | "free";
  day: string | null;
  log: RunRow[];
  result?: { ending; score } & RunStyle;        // line, decisive[] and grid[] on a finished run
  usage?: { tokens: number; cost: number; calls: number; worst: number };   // only when env.BOTS === "1"
}
```

### `GET /api/daily` body

Stage C's `Daily` type, field for field. Stage D does not restate it and does not add to it.

```ts
type Daily = {
  day: string; scenario: string; title: string; era: string; place: string;
  played: boolean; streak: number; plays: number;
  grid?: { ledger: string; won?: boolean }[];
};
```

### `src/api.ts`

```ts
// api gains one call. `daily()`, the `Daily` type and `GameView` are Stage C's and are unchanged.
  playDaily: (faction: string, promises: number[], platform?: string) => Promise<GameView>;   // POST /api/games { mode: "daily" }
```

### `src/rules.ts`

```ts
export const GRID_WIDTH: number;                    // 5 TUNE, squares a row in the copied grid
export const GRID_SQUARES: Record<string, string>;  // 🟩 🟪 🟨 🟦 🟧 ⬜, and ✅ or 🟥 for the verdict row
export function shareText(title: string, day: string, grid: { ledger: string; won?: boolean }[], streak: number): string;
```

### `src/App.tsx` and `src/Landing.tsx`

`App` keeps a `dailySeat` flag, sets it in the `onPlayDaily` handler when the day is unplayed, and
`takeSeat` calls `api.playDaily` instead of `api.seat` while it is set. `Landing` gains one button, which
copies `shareText(...)` when the card is showing a finished run. Nothing else on either screen changes,
and `src/Write.tsx` is not touched: Stage C deleted it.

### `scripts/bots/`

```ts
// api.ts
export type Verb = "decree" | "law" | "appoint" | "spend" | "proclaim" | "favour" | "force";
export type BotAct = { verb: Verb; text: string; memberId?: string };
export type Whip = { expected: number; needed: number; yes: number; size: number };
export class Bot {
  calls: number; ms: number; whip: Whip | null;
  constructor(base: string);
  api(path: string, body?: unknown): Promise<GameView>;
  seat(scenario: string, faction: string | number, promises: number[], seed: number): Promise<GameView>;
  act(g: GameView, a: BotAct): Promise<GameView>;     // POST /acts/price then POST /acts
  law(g: GameView, text: string): Promise<GameView>;  // the same act, then the vote; captures this.whip
  card(g: GameView, stance?: number): Promise<GameView>;
  midterm(g: GameView): Promise<GameView>;
  end(g: GameView): Promise<GameView>;                // POST /api/games/:id/turn/end
  test(g: GameView): Promise<GameView>;
  cont(g: GameView): Promise<GameView>;
  stop(g: GameView): Promise<GameView>;
}

// policies.ts
export type Policy = { name: string; style: boolean; acts(g: GameView, rnd: () => number): BotAct[] };
export const POLICIES: Policy[];                      // random, greedy, strongman, populist, broker, idealist
export const STYLES: string[];                        // strongman, populist, broker, idealist
export const OWN_FAILURE: Record<string, string[]>;
export function mulberry(seed: number): () => number;

// run.ts
export const TERM_USD: number;      // measured in Task 16
export const BUDGET_USD: number;    // 25 TUNE
export const MAX_TERMS: number;     // derived from the two above in Task 16
export const TURNS_PER_TERM: number;// 20, mirrors worker/engine.ts
export const HARD_STOP: number;     // 8 TUNE, steps beyond the turns before a run is called stuck
export const TERM_MS: number;       // 1_200_000 TUNE, the wall clock one term may take
export type TurnLog = { run; policy; seed; term; turn; bar; ledgers; holders; acts; whip: Whip | null; jev: { tokens; cost; calls; worst; ms }; pending; wire };
export type RunLog = { run; game; policy; seed; terms; ending; won; term1Won; mandate; bar; turns };
export function runTerm(bot: Bot, policy: Policy, g: GameView, log: TurnLog[], seed: number, run: string): Promise<GameView>;
// CLI: bun scripts/bots/run.ts --base --scenario --faction --seeds --terms --policies --out
// Writes <out>/turns.jsonl (one TurnLog a line) and <out>/runs.json (RunLog[]). One directory a pass.

// report.ts
export const SKILL_GAP: number;     // 30 TUNE
export const BRIER_LIMIT: number;   // 0.15 TUNE
export const DRAW_SHARE: number;    // 0.2 TUNE
export const WIN_SPREAD: number;    // 10 TUNE
export const GAP_SCALE: number;     // 100 TUNE
export type Check = { name: string; value: number; target: string; ok: boolean };
export function brier(turns: TurnLog[]): number;
export function winRates(runs: RunLog[]): Record<string, number>;   // term 1 only, from RunLog.term1Won
export function drawShare(runs: RunLog[]): number;                  // mean within-policy variance over total variance
export function flippable(runs: RunLog[], turns: TurnLog[]): number;
export function ownFailure(runs: RunLog[]): Record<string, boolean>;
export function report(runs: RunLog[], turns: TurnLog[]): { rows: Check[]; ok: boolean };
// CLI: bun scripts/bots/report.ts <dir>   exit 0 when every check passes, 1 otherwise.

// golden.ts
export const GOLDEN_N: number;      // 300 TUNE, the cap on both the export and the replay
export const GOLDEN_SHIFT: number;  // 0.05 TUNE
// CLI: bun scripts/bots/golden.ts export|replay <file>   export reads the local bots database.

// bias.ts
export const BIAS_LIMIT: number;    // 0.05 TUNE
export const SHARE_USD: number;     // 0.02 TUNE, one seat with one priced act and one whip
export const PAIRS: { a: string; b: string }[];   // 6 acts, each in two framings
export function biasOf(deltas: number[]): { mean: number; worst: number };
// CLI: bun scripts/bots/bias.ts --base --scenario
```

### Config

```jsonc
// wrangler.jsonc
"workflows": [{ "name": "build", "binding": "BUILD", "class_name": "ScenarioBuild" },
              { "name": "daily", "binding": "DAILY", "class_name": "DailyBuild" }],
"triggers": { "crons": ["7 3 * * *"] }
// secret: DAILY_SECRET

// wrangler.bots.jsonc: the same worker with six changes, a different name, the rate limit at 240 a minute,
// DAILY_GAME_CAP 2000, BOTS "1", GOLDEN "1", and no routes and no upload_source_maps.

// tsconfig.scripts.json: a third referenced project, "include": ["scripts/bots"], "types": ["bun"],
//   so one `bunx tsc -b --force` checks the client, the worker and the bots.
// package.json: devDependency @types/bun; "test": "bun test worker src scripts".
```
