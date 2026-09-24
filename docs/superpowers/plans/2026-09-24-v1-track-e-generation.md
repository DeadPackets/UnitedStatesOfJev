# United States of Jev v1, Track E (generation v2 into production) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the production world build (`worker/build.ts` and `worker/gen/*`) with the generation v2 pipeline proven in the prototype: plan, gather, a checked and repaired roster, a world bible, parallel world parts on a cached source block, emblems with two guards, code-built structure, and a pack with every Stage 0 field, written progressively so the build wait screen shows readable parts early.

**Architecture:** One transport (`worker/gen/openrouter.ts`) makes every Opus and Grok call: strict `json_schema` for small answers, schema-in-prompt after a cached source block for every call that shares the documents, no retry after a `content_filter` or `length` stop, every answer's usage written to a per-build D1 ledger. The Workflow (`worker/build.ts`) runs plan, gather, roster, check, bible, then the world parts and the emblems as parallel steps; each part is checked by code and re-run alone when it fails. Code builds all structure from the roster (`worker/gen/assemble.ts`); the existing Luna steps (names, personas, dedupe, deck) write the members, citizens and deck from a frame that code derives from the world.

**Tech Stack:** TypeScript 5.9, zod 4, bun:test, Cloudflare Workers, Workflows, D1, Vectorize, Workers AI (bge-m3), OpenRouter (Opus 5.5, Grok 4.7, Luna, Jev).

**Spec:** Owner brief `.superpowers/ruler/port-brief.md` (binding decisions), the Ruler spec `docs/superpowers/specs/2026-09-22-the-ruler-design.md` (R24 to R36), the 26 lessons `.superpowers/ruler/gen2-lessons.md`, the speed results `docs/mocks/v4/gen2/SPEED.md`, and the Stage 0 plan's "Interfaces produced" (`docs/superpowers/plans/2026-09-24-v1-stage-0-contracts.md`), read against the final Stage 0 code on branch `v1`.

**Base:** Branch `v1` (Stage 0 built and reviewed, head `f493604`, worktree `/Users/deadpackets/workspace/UnitedStatesOfJev/.worktrees/v1`). Track E branches from it and runs beside Track D (the React port). `docs/mocks/v4` and `.superpowers` are not in git: read them from the main checkout by absolute path, `/Users/deadpackets/workspace/UnitedStatesOfJev/...`.

**Measured before writing:** nothing of the new code has run. The code blocks are ported from the prototype (`docs/mocks/v4/gen2/*.ts`, `docs/mocks/v4/feel/emblem-gen.ts`) and written against the Stage 0 exports as they are on `v1` (`fitContrast` returns `string | null`; `sanitizeEmblem(raw)` takes `{ viewBox, elements }`; `GlanceSchema` uses `redLine`). Each task's own tests are the first run. Timings and costs quoted from the prototype are marked as such.

**Order and parallel waves (9 tasks):**

| Wave | Tasks | Why together |
|---|---|---|
| 1 | Task 1 | The contracts every other task imports: transport, schemas, prompts, ledger. |
| 2 | Task 2, Task 5, Task 8 in parallel | Sources, emblems and matching share no files. |
| 3 | Task 3, Task 6 in parallel | The roster stage and the assembler share only Task 1's types. |
| 4 | Task 4 | The world stage needs Task 3's checks and Task 2's document block. |
| 5 | Task 7 | The Workflow wires everything and retires the old path. |
| 6 | Task 9 | The end-to-end golden run and its artifact. |

## Global Constraints

Every task's requirements include this section.

From the owner brief (verbatim where quoted):
- Build model: "anthropic/claude-opus-5.5, reasoning effort medium." "Luna (openai/gpt-5.6-luna) stays for in-game calls; Jev (typesafe/jev-1.13) for typed judgements." The existing Luna persona and deck steps keep writing members, citizens and the deck.
- "Content-filter fallback: x-ai/grok-4.7 for a world call Opus refuses (fetch wait at least 15 min)." A `content_filter` or `length` stop ends a call; it is never retried (lesson 4). A filtered emblem call may be resent once with names only ("that is a new call, not a retry").
- "Themes: the world call writes design tokens ... plus one emblem per faction as sanitized SVG. Never CSS or JS from a model. zod schema, OKLCH contrast auto-fix to 4.5:1, SVG allowlist sanitizer, default theme on any failure." Use `worker/tokens.ts` and `worker/emblem.ts` as they are; never edit them.
- "Emblem guards: (1) 28 px legibility gate in a second pass, (2) canon check for known-story and historical worlds, (3) line-icon fallback."
- "No logos, stamps or crests anywhere (world level)." "No pictures: image generation is removed (commit 866a2e4). Nothing may reintroduce it."
- "Own party is one row: when the ruler's party sits in the chamber, ownGroup is that chamber party; pledges may target it; no duplicate holder."
- "Pledge rule for grounded worlds: at least half the pledges are ones the real ruler made, quoted from sources. Bible `aliases` field. W9 counts move to roster checks; world repair never fixes roster-level counts."
- "world reuse = bge-m3 cosine top 10 to 20 then Jev, no 0.45 floor, refuse a new build at 90% or more confidence, suggest matches above 80%."
- "the world call gives the seat's backer an authority `gives` of about 3 a turn."
- "Stored packs must keep parsing: every new pack field is optional or has a default." (Stage 0 made them optional; this track only writes them.)
- "Code standard: whole-word names, a short module header saying what the file owns, comments only for the why, no dense one-liners. Match the surrounding style. Biome formats on commit."
- "Tests (owner's CLAUDE.md): behaviour at the public boundary, parametrised, extend existing test files; no tests of getters or mock calls; test code no longer than the code under test except parsers, money, security ... Prefer an end-to-end check that leaves a repeatable artifact. Gates per commit: `bun test worker src scripts` green, `bunx tsc -b` clean, `bunx vite build` succeeds."
- "Never commit or print the OpenRouter key (.env, .dev.vars). The repo is PUBLIC: nothing from .superpowers/ (private planning) goes into committed files." The one exception is Decision 1 (two prompt texts).

Track E's own:
- **File ownership.** Edit only `worker/gen/*`, `worker/build.ts`, `worker/db.ts`, `worker/jev.ts`, `worker/luna.ts`, `worker/match.ts` and `worker/match.test.ts`, `scripts/`, `migrations/`, `docs/generation/`, and the one constant in `worker/daily.ts` (Decision 17). Never edit `src/*`, `worker/desk.ts`, `worker/game.ts`, `worker/pack.ts`, `worker/engine.ts`, `worker/emblem.ts`, `worker/tokens.ts`, `package.json`, `wrangler.jsonc`.
- **No new dependency.** zod is present. No rasteriser, no SVG library.
- **No live model calls in the test suite.** Tests pass a fake `fetch` or a fake `Caller`.
- **Workflows cap a step's result at 1 MiB.** Step results stay small (the largest, the gathered sources, is under about 300 KB: 120,000 characters of pages, the sweep's 180 lines and the Wikidata facts). The pack is written to D1 inside its step and the step returns only its size. The only storage binding is D1 (`DB`); there is no R2 or KV.
- **English only** (Decision 16): `lang` is `"en"`.
- **Commit messages** follow the repo: one plain sentence, no `feat:` prefix.


## Lead rulings (binding; they override the Decisions table and the tasks where they differ)

1. D1 accepted: the style guide and kinds table become product prompt text in `worker/gen/writing.ts`.
2. The 90% reuse rule is enforced on the server too, not only in `/api/scenarios/match`: the route that starts a build refuses a new build when the best match is at p >= 0.9 and answers with that world's id (confine the `worker/index.ts` edit to that route and the match route).
3. Track E owns `worker/daily.ts` (the cross-track item at its line 13).
4. D9: a failed or unparseable review call drops every emblem to its line icon; a review that runs drops only the emblems it fails.
5. Everything else in the Decisions table is accepted as written, including the stop rules in Task 7 and the $3 per-build cap.

## Decisions (the lead should confirm; each is reversible)

| # | Decision | Why |
|---|---|---|
| 1 | **Two prompt texts are copied from `.superpowers/ruler/research/` into `worker/gen/writing.ts`:** the style guide with its six voice exemplars (`prompting.md` lines 113 to 180) and the 14-row kinds table (`prompt-kinds.md`). Both are product prompt text with no names, paths or plans. | The prototype read them from the private folder at run time; a Worker cannot. The alternative is a paraphrase, which the lessons did not measure. |
| 2 | **Oath, sample act, refusal, handling notes, `youAre` and outside powers are not written.** | Stage 0's pack has no field for them, so the words would be paid for and dropped. Add them with the screen that shows them. |
| 3 | **The chamber is a code-built holder** (`the_chamber`, `members: "seats"`, icon `chamber`), its weight the sum of its blocs' `vote_share`, its day-one support the share of seats that back the ruler. The ruler's party is a chamber faction and never a holder. | The approved desk (Biden fixture) shows the chamber as a rim row; R24 makes its support its share of seats. One row per party keeps the ruling "no duplicate holder". |
| 4 | **A world with no chamber seats a court of 24** from its home actor groups (their ids shared with their holders), with `law` unavailable. | The pack needs 2 or more factions and members equal to the chamber size; the Westeros fixture's "Voices at court" does the same. |
| 5 | **`constitution.ruler.faction`** is the own group when it sits in the chamber (or the court); otherwise the faction with the highest day-one support. | The game seats the player in a pack faction; a Grand Vizier whose own group has no seats plays through the bloc that backs him most. |
| 6 | **The roster marks the seat's backer** (`ruler.backer`, a home group without seats, or null). Code gives it `{ ledger: "authority", amount: 3, per: "turn" }` (`BACKER_AUTHORITY`, TUNE). | The engine pays `gives` only for a home holder; a party in the chamber cannot give, so its backer is null. |
| 7 | **The drawn chamber is at most 72 seats** (`MAX_CHAMBER`), with seats scaled by largest remainder and the threshold scaled from the real one (lesson 12). | The Jev test call measured 59.8k of its 64k cap at 60 seats (v3). The Stage 0 fixtures use 100; generation keeps the measured cap until the lead lifts it. Lesson 16's "each seat is about N" has no pack field: Track D or the lead adds one if wanted. |
| 8 | **The grounded pledge rule applies to kinds 1 to 5 with a documented ruler** (`ruler.name` and `ruler.wiki` set): the briefing part asks for 5 quoted real promises, and at least 4 of 8 must pass code's quote check against the documents, or the briefing part is re-run once. | "Half" of 8 is 4; asking for 5 leaves room for one quote that fails verification. Canon (kind 7) quotes are thin on Fandom, so canon is not held to it. |
| 9 | **The 28 px gate and the canon check are one Opus review call** over the sanitized emblems (shapes as JSON with the group name and motif). An emblem ships only when the review says it reads at 28 px and, for kinds 1 to 7, does not contradict a known device. A failed or filtered review drops every emblem to its line icon. | No rasteriser is allowed (no dependency), and the lab (`emblems-report.md`) asks for "the model or a vision check". A text model reading coordinates is the check this stack can run; the line icon is the safe default. |
| 10 | **Member glance cards come from the Luna persona call** (three more fields on its existing rows), not from Opus. | Decision 8 of Stage 0: the engine never reads a member card. Luna is already writing each member; Opus for 24 to 72 members would cost more than the world parts. |
| 11 | **Matching loads at p ≥ 0.9 and offers the match above p = 0.8**, from the cosine top 20 with no floor. Enforced in `/api/scenarios/match` only; `POST /api/scenarios` is unchanged. | Owner rule, experiment 6. A server-side refusal needs `worker/index.ts`, outside this track. |
| 12 | **A failed index step no longer fails a build**: it logs and the world stays ready (loadable by id and by the daily, not matchable). | Local dev has no Vectorize; a finished, paid world should not be thrown away for its search entry. |
| 13 | **C3's proper-noun test reads the gathered documents as its dictionary**: a capitalised word the documents also use in lower case is a common word. | The prototype read `/usr/share/dict/words`, which a Worker does not have. |
| 14 | **The seven verbs' base prices are fixed in code** (the approved fixtures' prices). | The clerk prices each act; the base price is a design constant, not a world fact. |
| 15 | **Per-build cost cap $3** (`BUILD_COST_CAP`, env override). The ledger records Opus and Grok answers; the Luna steps (about $0.02 to $0.10) are not in it. The golden run reads the key meter for the true total. | Lesson 20. Luna calls go through `post()`, whose meter is shared across a whole isolate. |
| 16 | **English only.** | Every prompt, the style guide and the checks were measured in English. |
| 17 | **`worker/daily.ts` `BUILD_POLLS` 40 → 60** (30 minutes). | A Grok fallback world can pass the old 20 minutes. `daily.ts` is outside the listed files; the lead may prefer to own this line. |
| 18 | **Opus is routed `provider: { order: ["anthropic"], allow_fallbacks: true }`.** | The speed runs pinned Anthropic (prompt caching measured there); a fallback provider keeps the build alive at a cache cost. |
| 19 | **"First readable at about 90 s"** is measured as SPEED.md did, from the start of the world step. From the build's start, the roster fragment (group names, sides, wants) is the first readable one at about 85 s (prototype: plan 6 to 20 s, roster 45 to 112 s), the bible at about 150 s, the briefing at about 190 s. The golden run reports both clocks. | The world step cannot start before the roster exists. |
| 20 | **The people steps start as soon as the bible, the systems part and the briefing part are checked**, beside the other parts and the emblems. Estimated total: about 250 to 290 s, over the 220 s target; the Luna tail (about 60 s) is the new long pole. | It has to exist (the engine reads members, citizens and the deck), and it needs words only those three parts write. The golden run measures it. |

## Review Focus

1. **A model-chosen canon host that is not a Fandom wiki** (`evil.com`, `en.wikipedia.org.evil.com`, a metadata IP): nothing is fetched. Pinned in Task 2 (`allowedHost` table and "a page on a host outside the allowlist is never fetched").
2. **A prompt that names the seat** ("Genghis Khan rules modern Mongolia"): the plan that seats his chief minister goes back once with the rule. Pinned in Task 3 (`checkPlanSeat` table).
3. **A premise Opus filters**: the world call goes once to Grok with a 20-minute wait; a `length` stop is not resent; a filtered emblem call is resent once with names only. Pinned in Task 4 ("a filtered world call goes once to Grok") and Task 5 ("a filtered emblem call is resent once with names only").
4. **A roster with too many groups, or the public named as one camp** ("Leave voters"): C15 and C14 fail, the repair can move the least important group out, code trims what is left, and a world that still cannot hold together stops with a plain sentence. Pinned in Task 3 (the C-table and `fitHolderCount`).
5. **A chunk that writes rows it was not given, or misses its own**: each row comes from the chunk that owns it, a missing row fails that part, and only that part is re-run. Pinned in Task 4 (`mergeWorld` ownership and the `checkPart` table).

---

## Files

| File | Task | Owns |
|---|---|---|
| `migrations/0004_build_ledger.sql` | 1 | `build_calls` (one row per paid answer) and `build_parts` (a build's checks and reports). |
| `worker/gen/openrouter.ts` (+ test) | 1 | Every Opus and Grok call: strict or schema-in-prompt, the cached prefix, stops, usage. |
| `worker/gen/schemas.ts` | 1 | Every model answer's zod shape, the merged `World`, `Fail`, and two helpers that read them. |
| `worker/gen/writing.ts` | 1 | The system prompts, the style guide and the kinds table. |
| `worker/gen/fixtures/fridge-roster.json` | 1 | The prototype's fridge plan and roster, in the new shape: the tests' fixture. |
| `worker/db.ts`, `worker/jev.ts` | 1 | Ledger helpers; `BUILD_COST_CAP` on `Env`. |
| `worker/gen/wikipedia.ts`, `worker/gen/wikidata.ts`, `worker/gen/gather.ts` (+ `wikipedia.test.ts`) | 2 | Sources: pages, the category sweep, Wikidata facts, the document block. |
| `worker/gen/checks.ts`, `worker/gen/roster.ts` (+ `checks.test.ts`) | 3 | Plan and roster checks C1 to C15, the plan and roster calls, the repair. |
| `worker/gen/world.ts`, `worker/gen/lint.ts` (+ tests) | 4 | Bible, parts, part checks and part repair, merge; lint and rewrite. |
| `worker/gen/emblems.ts` (+ test) | 5 | Emblem call, names-only resend, sanitizer, review, keep. |
| `worker/gen/assemble.ts` (+ test) | 6 | Calendar, facts, frame and pack from the parts. |
| `worker/build.ts`, `worker/gen/personas.ts`, retirements, `worker/daily.ts` | 7 | The Workflow; member glance cards; removal of the orphaned old path. |
| `worker/match.ts` (+ test) | 8 | World reuse. |
| `scripts/golden-builds.ts`, `docs/generation/golden/` | 9 | The end-to-end run and its artifact. |

---
### Task 1: The contracts: transport, schemas, prompts and the cost ledger

**Files:**
- Create: `migrations/0004_build_ledger.sql`
- Create: `worker/gen/openrouter.ts`, `worker/gen/openrouter.test.ts`
- Create: `worker/gen/schemas.ts`
- Create: `worker/gen/writing.ts`
- Create: `worker/gen/fixtures/fridge-roster.json` (generated in Step 6)
- Modify: `worker/db.ts` (append three functions and one import)
- Modify: `worker/jev.ts` (one field on `Env`)

**Interfaces:**
- Consumes: `GlanceSchema`, `type Glance`, `ESCALATION_KEYS`, `HOLDER_RESPONSES`, `LINE_ICONS`, `RESOURCE_ICONS`, `VERBS` from `worker/pack.ts`; `ColourSchema`, `ThemeTokensSchema` from `worker/tokens.ts`; `CONTENT_RULE` from `worker/gen/prompts.ts`.
- Produces:
  - `worker/gen/openrouter.ts`: `OPUS`, `GROK`, `type Usage`, `type StopReason`, `class ModelStop { reason }`, `type CallRequest<T> = { name; schema; system; user; maxTokens; prefix?; strict?; model? }`, `type Caller = <T>(request: CallRequest<T>) => Promise<T>`, `type Transport = { key; onUsage; fetcher? }`, `callModel<T>(transport, request): Promise<T>`, `promptSchema(schema)`, `extractJson(raw)`.
  - `worker/gen/schemas.ts`: `PlanSchema`/`Plan`, `GroupSchema`/`Group`, `RosterSchema`/`Roster`, `RosterPatchSchema`/`RosterPatch`, `BibleSchema`/`Bible`, `GroupRowSchema`/`GroupRow`, `FactionRowSchema`/`FactionRow`, `PartSchemas`, `type PartKind`, `type Parts`, `type World`, `type Fail`, `EmblemReplySchema`, `EmblemReviewSchema`, `RewriteSchema`, `hasChamber(roster)`, `factionIds(roster)`, `toGlance(row, face?)`.
  - `worker/gen/writing.ts`: `KINDS_TABLE`, `STYLE_GUIDE`, `PLAN_SYSTEM`, `ROSTER_SYSTEM`, `WORLD_SYSTEM`, `REWRITE_SYSTEM`, `EMBLEM_SYSTEM`, `REVIEW_SYSTEM`.
  - `worker/db.ts`: `recordCall(env, scenario, usage)`, `buildSpend(env, scenario): Promise<number>`, `putPart(env, scenario, part, body)`.
  - `worker/jev.ts`: `Env.BUILD_COST_CAP?: string`.
  - `worker/gen/fixtures/fridge-roster.json`: `{ prompt, plan: Plan, roster: Roster }` (kind 14, 11 groups, 5 with seats).

- [ ] **Step 1: Write the migration**

`migrations/0004_build_ledger.sql`:

```sql
CREATE TABLE build_calls (scenario TEXT, name TEXT, model TEXT, at INTEGER, seconds REAL, cost REAL, input INTEGER, output INTEGER, reasoning INTEGER, cached INTEGER, cache_write INTEGER, finish TEXT);
CREATE INDEX build_calls_scenario ON build_calls (scenario);
CREATE TABLE build_parts (scenario TEXT, part TEXT, body TEXT, at INTEGER, PRIMARY KEY (scenario, part));
```

Run: `yes | bunx wrangler d1 migrations apply usoj --local`
Expected: `0004_build_ledger.sql` listed as applied.

- [ ] **Step 2: Write the failing transport test**

`worker/gen/openrouter.test.ts`:

```ts
import { expect, test } from "bun:test";
import { z } from "zod";
import { ModelStop, callModel, type Usage } from "./openrouter";

// A fake OpenRouter: each request takes the next canned answer, and every request body is kept.
function server(answers: { content: string; finish?: string }[]) {
  const bodies: any[] = [];
  const usages: Usage[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const answer = answers[bodies.length - 1];
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: answer.content }, finish_reason: answer.finish ?? "stop" }],
        usage: { cost: 0.01, prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 80 } },
      }),
    );
  }) as unknown as typeof fetch;
  return { bodies, usages, transport: { key: "test", onUsage: (usage: Usage) => void usages.push(usage), fetcher } };
}
const Answer = z.object({ title: z.string(), seats: z.number().int().min(1) });
const request = { name: "test", schema: Answer, system: "system", user: "user", maxTokens: 100 };

test.each([
  ["plain JSON", '{"title":"A","seats":3}'],
  ["JSON in code fences", '```json\n{"title":"A","seats":3}\n```'],
  ["JSON after a sentence", 'Here it is: {"title":"A","seats":3} Done.'],
])("an answer as %s parses and its usage is recorded", async (_label, content) => {
  const fake = server([{ content }]);
  expect(await callModel(fake.transport, request)).toEqual({ title: "A", seats: 3 });
  expect(fake.usages.map((usage) => [usage.cost, usage.cached])).toEqual([[0.01, 80]]);
});

test("an answer that fails zod gets one corrective turn naming the error, and both answers are paid", async () => {
  const fake = server([{ content: '{"title":"A","seats":0}' }, { content: '{"title":"A","seats":2}' }]);
  expect(await callModel(fake.transport, request)).toEqual({ title: "A", seats: 2 });
  expect(fake.usages).toHaveLength(2);
  expect(JSON.stringify(fake.bodies[1].messages.at(-1))).toContain("seats");
});

test("two invalid answers stop the call as invalid", async () => {
  const fake = server([{ content: "no json" }, { content: '{"title":"A"}' }]);
  const error = await callModel(fake.transport, request).catch((caught) => caught);
  expect(error).toBeInstanceOf(ModelStop);
  expect(error.reason).toBe("invalid");
});

test.each(["content_filter", "length"])("a %s stop ends the call after one request", async (finish) => {
  const fake = server([{ content: "", finish }, { content: '{"title":"A","seats":2}' }]);
  const error = await callModel(fake.transport, request).catch((caught) => caught);
  expect(error).toBeInstanceOf(ModelStop);
  expect(error.reason).toBe(finish);
  expect(fake.bodies).toHaveLength(1);
  expect(fake.usages).toHaveLength(1);
});

test("a strict call sends nullable scalars as plain types and reads empty values back as null", async () => {
  const Nullable = z.object({ holder: z.string().nullable(), size: z.number().nullable() });
  const fake = server([{ content: '{"holder":"","size":0}' }]);
  expect(await callModel(fake.transport, { ...request, schema: Nullable, strict: true })).toEqual({
    holder: null,
    size: null,
  });
  expect(fake.bodies[0].response_format.json_schema.schema.properties.holder.type).toBe("string");
});

// Lesson 23: a response_format sits in front of the cached block and breaks the cache.
test("a call with a shared prefix caches it and carries its schema in the prompt, never as a response_format", async () => {
  const fake = server([{ content: '{"title":"A","seats":3}' }]);
  await callModel(fake.transport, { ...request, prefix: "documents", strict: true });
  const [cached, tail] = fake.bodies[0].messages[1].content;
  expect(cached).toEqual({ type: "text", text: "documents", cache_control: { type: "ephemeral" } });
  expect(tail.text).toContain("JSON Schema");
  expect(fake.bodies[0].response_format).toBeUndefined();
  expect(fake.bodies[0].messages[0].content).toBe("system");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun test worker/gen/openrouter.test.ts`
Expected: FAIL, `Cannot find module './openrouter'`.

- [ ] **Step 4: Write the transport**

`worker/gen/openrouter.ts`:

```ts
// Every generation call to OpenRouter. Small answers use a strict json_schema; any call that shares the cached block of
// documents carries its schema in the prompt instead, because a response_format sits in front of the cache and breaks
// it (lesson 23). A content_filter or length stop ends the call (lesson 4). Every answer's usage goes to the caller's
// ledger, including the ones that fail.
import { z } from "zod";

export const OPUS = "anthropic/claude-opus-5.5";
export const GROK = "x-ai/grok-4.7";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// Opus world parts take 14 to 160 s; Grok's one-call world took 674 s, so its wait is at least 15 minutes (lesson 6).
const WAIT_SECONDS: Record<string, number> = { [OPUS]: 600, [GROK]: 1200 };

export type Usage = {
  name: string;
  model: string;
  seconds: number;
  cost: number;
  input: number;
  output: number;
  reasoning: number;
  cached: number;
  cacheWrite: number;
  finish: string;
};

export type StopReason = "content_filter" | "length" | "invalid" | "upstream";
export class ModelStop extends Error {
  constructor(
    public reason: StopReason,
    message: string,
  ) {
    super(message);
    this.name = "ModelStop";
  }
}

export type CallRequest<T> = {
  name: string;
  schema: z.ZodType<T>;
  system: string;
  user: string;
  maxTokens: number;
  prefix?: string; // the shared block of documents and roster, sent first with a cache breakpoint
  strict?: boolean; // a json_schema response format; ignored when prefix is set
  model?: string;
};
export type Caller = <T>(request: CallRequest<T>) => Promise<T>;
export type Transport = {
  key: string;
  onUsage: (usage: Usage) => Promise<void> | void;
  fetcher?: typeof fetch;
};

type JsonSchema = Record<string, any>;
// Anthropic's strict outputs refuse length and count limits, so the sent schema drops them; zod still checks them.
const DROPPED = new Set([
  "minLength",
  "maxLength",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "$schema",
  "pattern",
  "format",
]);
function strip(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strip);
  if (!schema || typeof schema !== "object") return schema;
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (DROPPED.has(key)) continue;
    out[key] = key === "minItems" && typeof value === "number" && value > 1 ? 1 : strip(value);
  }
  if (out.type === "object" && out.properties && out.additionalProperties === undefined)
    out.additionalProperties = false;
  return out;
}

const SCALARS = new Set(["string", "number", "integer", "boolean"]);
// The scalar type of a nullable scalar, which zod writes as anyOf [x, null] or type [x, "null"]; else null.
function nullableScalar(schema: JsonSchema | undefined): string | null {
  if (Array.isArray(schema?.type) && schema.type.length === 2 && schema.type.includes("null")) {
    const type = schema.type.find((item: string) => item !== "null");
    return SCALARS.has(type) && !schema.enum ? type : null;
  }
  if (
    Array.isArray(schema?.anyOf) &&
    schema.anyOf.length === 2 &&
    schema.anyOf.some((item: JsonSchema) => item.type === "null")
  ) {
    const other = schema.anyOf.find((item: JsonSchema) => item.type !== "null");
    return SCALARS.has(other.type) && !other.enum ? other.type : null;
  }
  return null;
}
// Anthropic allows at most 16 union-typed parameters (lesson 1), so a nullable scalar travels as "" or 0.
function wire(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(wire);
  if (!schema || typeof schema !== "object") return schema;
  const type = nullableScalar(schema as JsonSchema);
  if (type) {
    const none = type === "string" ? "empty string when none" : "0 when none";
    const about = (schema as JsonSchema).description;
    return { type, description: about ? `${about} (${none})` : none };
  }
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, wire(value)]));
}
function unwire(schema: JsonSchema | undefined, data: any): any {
  if (data === null || data === undefined) return data;
  if (nullableScalar(schema)) return data === "" || data === 0 ? null : data;
  if (Array.isArray(schema?.anyOf))
    return unwire(
      schema.anyOf.find((item: JsonSchema) => item.type !== "null"),
      data,
    );
  if (schema?.type === "array" && Array.isArray(data))
    return data.map((item) => unwire(schema.items, item));
  if (schema?.type === "object" && typeof data === "object")
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, unwire(schema.properties?.[key], value)]),
    );
  return data;
}

export const promptSchema = (schema: z.ZodType): JsonSchema =>
  strip(z.toJSONSchema(schema, { io: "input" })) as JsonSchema;

// Anthropic ignores json_object and wraps answers in code fences (lesson 3): the object is between the first { and last }.
export function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON object in the answer");
    return JSON.parse(raw.slice(start, end + 1));
  }
}

type Reply = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: {
    cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string };
};

// One request. A 429, a 5xx or a dropped connection is sent once more; a timeout is not, since the model already ran
// for the whole wait and a second one doubles the build.
async function send(
  transport: Transport,
  body: unknown,
  waitSeconds: number,
): Promise<{ reply: Reply; seconds: number }> {
  const fetcher = transport.fetcher ?? fetch;
  let problem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      const response = await fetcher(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${transport.key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://unitedstatesofjev.deadpackets.pw",
          "X-Title": "United States of Jev",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(waitSeconds * 1000),
      });
      if (response.ok)
        return { reply: (await response.json()) as Reply, seconds: (Date.now() - started) / 1000 };
      problem = `${response.status} ${(await response.text()).slice(0, 300)}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      problem = String(error);
      if ((error as Error)?.name === "TimeoutError") break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new ModelStop("upstream", problem);
}

export async function callModel<T>(transport: Transport, request: CallRequest<T>): Promise<T> {
  const model = request.model ?? OPUS;
  const strict = !!request.strict && !request.prefix;
  const ask = `Return only one JSON object, with no code fences and no text before or after it. It must match this JSON Schema, with the properties in the order listed:\n${JSON.stringify(promptSchema(request.schema))}`;
  const tail = request.prefix ? `${request.user}\n\n${ask}` : request.user;
  const messages: unknown[] = [
    // The system prompt stays the same across every part call, so the cache sees one prefix.
    { role: "system", content: strict || request.prefix ? request.system : `${request.system}\n\n${ask}` },
    {
      role: "user",
      content: request.prefix
        ? [
            { type: "text", text: request.prefix, cache_control: { type: "ephemeral" } },
            { type: "text", text: tail },
          ]
        : tail,
    },
  ];
  const body = {
    model,
    max_tokens: request.maxTokens,
    reasoning: { effort: "medium" },
    usage: { include: true },
    ...(model === OPUS ? { provider: { order: ["anthropic"], allow_fallbacks: true } } : {}),
    ...(strict
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: request.name, strict: true, schema: wire(promptSchema(request.schema)) },
          },
        }
      : {}),
    messages,
  };
  let problem = "";
  for (let answer = 0; answer < 2; answer++) {
    const { reply, seconds } = await send(transport, body, WAIT_SECONDS[model] ?? 600);
    const choice = reply.choices?.[0];
    const usage = reply.usage ?? {};
    const finish = String(choice?.finish_reason ?? (reply.error ? "error" : ""));
    await transport.onUsage({
      name: request.name,
      model,
      seconds,
      cost: Number(usage.cost ?? 0),
      input: Number(usage.prompt_tokens ?? 0),
      output: Number(usage.completion_tokens ?? 0),
      reasoning: Number(usage.completion_tokens_details?.reasoning_tokens ?? 0),
      cached: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
      cacheWrite: Number(usage.prompt_tokens_details?.cache_write_tokens ?? 0),
      finish,
    });
    if (reply.error) throw new ModelStop("upstream", `${request.name}: ${reply.error.message ?? "error"}`);
    // The same request would cost the same and stop the same way, so a stop is never sent again.
    if (finish === "content_filter")
      throw new ModelStop("content_filter", `${request.name}: blocked by the content filter`);
    if (finish === "length")
      throw new ModelStop("length", `${request.name}: hit max_tokens ${request.maxTokens}`);
    const raw = typeof choice?.message?.content === "string" ? choice.message.content : "";
    let json: unknown;
    try {
      json = extractJson(raw);
    } catch {
      problem = `unparseable answer of ${raw.length} characters`;
    }
    if (json !== undefined) {
      // unwire walks the unwired schema: only there is a nullable scalar still an anyOf with null.
      const parsed = request.schema.safeParse(
        strict ? unwire(promptSchema(request.schema), json) : json,
      );
      if (parsed.success) return parsed.data;
      problem = parsed.error.issues
        .slice(0, 12)
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ");
    }
    messages.push(
      { role: "assistant", content: raw },
      { role: "user", content: `That object failed validation: ${problem}. Return the corrected full object.` },
    );
  }
  throw new ModelStop("invalid", `${request.name}: ${problem}`);
}
```

- [ ] **Step 5: Run the transport test**

Run: `bun test worker/gen/openrouter.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Write the schemas and the fixture**

`worker/gen/schemas.ts`:

```ts
// What every generation call returns and the merged world those answers build: the research plan, the roster and its
// repair patch, the world bible, each world part, the lint rewrite and the emblem calls. zod checks every answer before
// code reads it, and .describe() carries a field's rule into the JSON Schema the model sees. Two small helpers read the
// roster and a card row the same way in every stage.
import { z } from "zod";
import {
  ESCALATION_KEYS,
  GlanceSchema,
  HOLDER_RESPONSES,
  LINE_ICONS,
  RESOURCE_ICONS,
  type Glance,
} from "../pack";
import { ColourSchema, ThemeTokensSchema } from "../tokens";

const phrase = z.string();
const whole = z.number().int();

export const PlanSchema = z.object({
  kind: whole.min(1).max(14),
  prompt_seat: phrase
    .nullable()
    .describe("The seat, office or person the prompt names as the player's, copied from the prompt; null when it names none."),
  seat: z.object({ office: phrase, holder: phrase.nullable(), holder_wiki: phrase.nullable() }),
  start_date: phrase,
  turn_length: phrase,
  term_end: phrase,
  above: z.array(z.object({ name: phrase, power: phrase })),
  grounding_line: phrase,
  divergence: phrase.nullable(),
  home_places: z.array(phrase),
  lookups: z.array(phrase),
  conflicts: z.array(phrase),
  categories: z.array(phrase),
  canon: z.object({ host: phrase, titles: z.array(phrase) }).nullable(),
  analogues: z.array(phrase),
  people: z.array(phrase),
  keywords: z.array(phrase),
});
export type Plan = z.infer<typeof PlanSchema>;

export const GROUP_TYPES = ["party", "armed", "body", "foreign", "bloc", "crown", "clergy", "people", "caste", "kin", "role"] as const;
export const GROUNDINGS = ["record", "canon", "analogue", "biology", "anthropology", "divergent", "premise"] as const;

export const GroupSchema = z.object({
  id: phrase,
  name: phrase,
  kind: z.enum(["actor", "public"]),
  wiki: phrase.nullable(),
  type: z.enum(GROUP_TYPES),
  doc: whole.nullable(),
  quote: phrase.nullable(),
  grounding: z.enum(GROUNDINGS),
  descends_from: phrase.nullable(),
  founded: phrase.nullable(),
  dissolved: phrase.nullable(),
  sits: z.enum(["home", "abroad"]),
  sits_where: phrase,
  seats: whole.nullable(),
  seats_doc: whole.nullable(),
  seats_quote: phrase.nullable(),
  vote_share: z.number(),
  veto: z.boolean(),
  can_dismiss: z.boolean(),
  support: whole,
  support_why: phrase,
  wants: phrase,
  rival: phrase,
});
export type Group = z.infer<typeof GroupSchema>;

export const RosterSchema = z.object({
  grounding_line: phrase,
  ruler: z.object({
    name: phrase.nullable(),
    office: phrase,
    wiki: phrase.nullable(),
    start_date: phrase,
    doc: whole.nullable(),
    quote: phrase.nullable(),
    above: phrase.nullable(),
    removed_by: phrase,
    own_group: phrase.describe("The id of the player's own side; when that party sits in the chamber, its bloc's row."),
    backer: phrase
      .nullable()
      .describe("The id of the home group without seats whose backing keeps the ruler in the seat day to day, or null."),
  }),
  fall: z.object({ date: phrase, what: phrase, doc: whole.nullable(), quote: phrase.nullable() }).nullable(),
  chamber: z
    .object({ name: phrase, real_size: whole, as_of: phrase, doc: whole.nullable(), quote: phrase.nullable() })
    .nullable(),
  groups: z.array(GroupSchema),
  excluded: z.array(z.object({ name: phrase, why: phrase })),
});
export type Roster = z.infer<typeof RosterSchema>;

export const RosterPatchSchema = z.object({
  groups: z.array(GroupSchema),
  remove: z
    .array(phrase)
    .describe("Ids of groups to take out, only to fix a C15 failure; add each one to excluded with its reason."),
  excluded: RosterSchema.shape.excluded,
  ruler: RosterSchema.shape.ruler.nullable(),
  fall: RosterSchema.shape.fall,
  fall_clear: z.boolean(),
  chamber: RosterSchema.shape.chamber,
  chamber_clear: z.boolean(),
});
export type RosterPatch = z.infer<typeof RosterPatchSchema>;

export const VocabularySchema = z.object({
  seat: phrase.describe("the player's office as a noun: President, King, Grand Vizier"),
  chamber: phrase.describe("the body that votes on laws, or the court when none does"),
  member: phrase,
  bill: phrase,
  pass: phrase,
  fail: phrase,
  capital: phrase.describe("political capital: authority, favour, standing"),
  turn: phrase.describe("one turn: week, moon, day"),
  midterm: phrase.describe("the half-term test's name"),
  campaign: phrase,
  test: phrase.describe("the end-of-term test: an election, a confidence vote, the clear-out"),
  feed: phrase.describe("where public talk happens: the press, the forum, the market square"),
  post: phrase.describe("one public message the player sends"),
  whip: phrase,
  lobby: phrase,
  promise: phrase,
  patron: phrase,
  approval: phrase.describe("public support"),
  file: phrase.describe("what this world calls a file on a group, at most 18 characters: Senate file, Herald's roll"),
  abroad: phrase
    .nullable()
    .describe("this world's own words for abroad, lower case, at most 22 characters (beyond the domes); null when abroad fits"),
});

export const BibleSchema = z.object({
  house_voice: phrase,
  tone: z.array(phrase),
  grounding: phrase,
  title: phrase,
  era: phrase,
  place: phrase,
  year: z.number(),
  vocabulary: VocabularySchema,
  terms: z.array(
    z.object({
      term: phrase,
      meaning: phrase,
      aliases: z.array(phrase).describe("other names the documents use for it; every part writes the term, never an alias"),
    }),
  ),
  history: z.array(z.object({ date: phrase, beat: phrase })),
  groups: z.array(
    z.object({ id: phrase, name: phrase, short: phrase, identity: phrase, face: phrase, face_role: phrase }),
  ),
  regions: z.array(z.object({ id: phrase, name: phrase })),
});
export type Bible = z.infer<typeof BibleSchema>;

const Tag = phrase.describe("1 to 3 words an act would do, decidable from its text: Relief checks, Tax the lords");
const CardFields = {
  wants: z.array(Tag).describe("2 or 3 acts the group wants"),
  hates: z
    .array(z.object({ tag: Tag, red_line: z.boolean() }))
    .describe("2 or 3 acts it fights, exactly one with red_line true; the tag Bribes for a group that takes no money"),
  strike: phrase.describe("what it does when it turns on the player, one short line in the third person"),
};
export const GroupRowSchema = z.object({
  id: phrase,
  icon: z.enum(LINE_ICONS),
  color: ColourSchema,
  line: whole,
  response: z.enum(HOLDER_RESPONSES),
  ...CardFields,
});
export type GroupRow = z.infer<typeof GroupRowSchema>;
export const FactionRowSchema = z.object({ id: phrase, color: ColourSchema, with_you: z.boolean(), ...CardFields });
export type FactionRow = z.infer<typeof FactionRowSchema>;

const ResourceSchema = z.object({
  name: phrase,
  start: z.number(),
  line: z.number(),
  for: phrase,
  earn: z.array(phrase),
  spend: z.array(phrase),
  fails: phrase,
  icon: z.enum(RESOURCE_ICONS),
});
const MeterSchema = z.object({ name: phrase, start: z.number(), line: z.number() });
const InstrumentSchema = z.object({ name: phrase, available: z.boolean(), vetoes: z.array(phrase) });
const OfferSchema = z.object({ label: phrase, text: phrase });

export const PartSchemas = {
  groups: z.object({ groups: z.array(GroupRowSchema) }),
  chamber: z.object({
    chamber: z.object({
      name: phrase,
      shape: z.enum(["hemicycle", "rows", "ring", "court"]),
      threshold: whole,
      tie: phrase.nullable(),
      factions: z.array(FactionRowSchema),
    }),
  }),
  factions: z.object({ factions: z.array(FactionRowSchema) }),
  briefing: z.object({
    ruler: z.object({ role: phrase, removed_by: phrase }),
    briefing: z.object({ situation: phrase, room: phrase, you: phrase }),
    problems: z.array(phrase),
    pledges: z.array(
      z.object({ text: phrase, tag: phrase, for: phrase, quote: phrase.nullable(), doc: whole.nullable() }),
    ),
  }),
  ledgers: z.object({
    ledgers: z.object({
      treasury: ResourceSchema,
      authority: ResourceSchema,
      chest: ResourceSchema,
      loyalty: MeterSchema,
      popularity: MeterSchema,
    }),
  }),
  instruments: z.object({
    instruments: z.object({
      decree: InstrumentSchema,
      law: InstrumentSchema,
      appoint: InstrumentSchema,
      spend: InstrumentSchema,
      proclaim: InstrumentSchema,
      favour: InstrumentSchema,
      force: InstrumentSchema,
    }),
  }),
  systems: z.object({
    tags: z.array(phrase),
    blocs: z.array(z.object({ id: phrase, name: phrase, description: phrase })),
    patrons: z.array(z.object({ id: phrase, name: phrase, wants: z.array(phrase), hates: z.array(phrase) })),
    regions: z.array(
      z.object({ id: phrase, weight: z.number(), lean: z.array(z.object({ faction: phrase, value: z.number() })) }),
    ),
    test: z.object({ name: phrase, win: phrase, lose: phrase, reveal: z.enum(["regions", "seats", "both"]) }),
    endings: z.object({
      reelected: phrase,
      defeated: phrase,
      lame_duck: phrase,
      impeached: phrase,
      coup: phrase.nullable(),
      stopped: phrase.nullable(),
      dismissed: phrase.nullable(),
    }),
    lobby: z.object({ pork: OfferSchema, favor: OfferSchema, threat: OfferSchema }),
    escalations: z.array(z.object({ key: z.enum(ESCALATION_KEYS), name: phrase, headline: phrase })),
  }),
  theme: z.object({ theme: ThemeTokensSchema }),
};
export type PartKind = keyof typeof PartSchemas;
export type Parts = { [Kind in PartKind]: z.infer<(typeof PartSchemas)[Kind]> };

// The world after merge: one row per roster group without seats and one faction row per chamber bloc (either list may
// miss a row a part never wrote), then the other parts as written. theme is whatever the theme part returned, or null.
export type World = {
  bible: Bible;
  groups: GroupRow[];
  chamber: (Omit<Parts["chamber"]["chamber"], "factions"> & { factions: FactionRow[] }) | null;
  briefing: Parts["briefing"];
  ledgers: Parts["ledgers"]["ledgers"];
  instruments: Parts["instruments"]["instruments"];
  systems: Parts["systems"];
  theme: unknown;
};

export type Fail = {
  check: string;
  row: string;
  message: string;
  docs?: number[]; // the document indexes a repair should read
  job?: string; // the world part that fails, for a part-scoped repair
  blocking?: boolean; // the pack cannot be assembled around it
};

export const EmblemReplySchema = z.object({
  emblems: z.array(
    z.object({
      id: phrase,
      motif: phrase,
      viewBox: phrase,
      elements: z.array(z.object({ tag: phrase }).catchall(z.union([phrase, z.number()]))),
    }),
  ),
});
export const EmblemReviewSchema = z.object({
  emblems: z.array(z.object({ id: phrase, legible: z.boolean(), canon: z.enum(["fits", "wrong", "none"]) })),
});
export const RewriteSchema = z.object({ fields: z.array(z.object({ path: phrase, text: phrase })) });

// A chamber exists when the roster names one and at least one group holds seats in it.
export const hasChamber = (roster: Roster): boolean =>
  !!roster.chamber && roster.groups.some((group) => group.seats !== null);

// The pack's factions: the chamber blocs, or, with no chamber, the court of home groups that act (Decision 4).
export const factionIds = (roster: Roster): string[] =>
  hasChamber(roster)
    ? roster.groups.filter((group) => group.seats !== null).map((group) => group.id)
    : roster.groups
        .filter((group) => group.seats === null && group.sits === "home" && group.kind === "actor")
        .map((group) => group.id);

// A card row as the model writes it (red_line) to the pack's glance card (redLine), or null when it breaks R36.
export function toGlance(
  row: { wants?: string[]; hates?: { tag: string; red_line: boolean }[]; strike?: string },
  face?: { name: string; role: string },
): Glance | null {
  if (!row.wants || !row.hates || typeof row.strike !== "string") return null;
  const parsed = GlanceSchema.safeParse({
    ...(face ? { face } : {}),
    wants: row.wants,
    hates: row.hates.map((hate) => ({ tag: hate.tag, redLine: hate.red_line })),
    strike: row.strike,
  });
  return parsed.success ? parsed.data : null;
}
```

Generate the fixture from the prototype's fridge roster, adding the new fields:

```bash
bun -e '
const source = await Bun.file("/Users/deadpackets/workspace/UnitedStatesOfJev/docs/mocks/v4/gen2/out/fridge-parliament.roster.json").json();
const plan = { ...source.plan, prompt_seat: null };
const roster = { ...source.roster, ruler: { ...source.roster.ruler, own_group: "freshfood", backer: null } };
await Bun.write("worker/gen/fixtures/fridge-roster.json", JSON.stringify({ prompt: "The Parliament of the Fridge", plan, roster }, null, 1) + "\n");
'
bun -e '
import { PlanSchema, RosterSchema } from "./worker/gen/schemas";
const fixture = await Bun.file("worker/gen/fixtures/fridge-roster.json").json();
PlanSchema.parse(fixture.plan);
const roster = RosterSchema.parse(fixture.roster);
console.log("fixture ok", roster.groups.length, roster.groups.filter((group) => group.seats !== null).length);
'
```

Expected: `fixture ok 11 5`.

- [ ] **Step 7: Write the prompts**

`worker/gen/writing.ts`. Write the file below as it stands, with the two markers `<<KINDS>>` and `<<STYLE>>`; Step 7b fills them. `KINDS_TABLE` becomes the 14 table rows of `/Users/deadpackets/workspace/UnitedStatesOfJev/.superpowers/ruler/research/prompt-kinds.md` (the lines that start with `| <number> |`), and `STYLE_GUIDE` lines 113 to 180 of `/Users/deadpackets/workspace/UnitedStatesOfJev/.superpowers/ruler/research/prompting.md` (from `<style_guide>` to `</voice_examples>`), both verbatim (Decision 1).

```ts
// The system prompts of generation v2, and the two texts every writer shares: the style guide with its six voice
// exemplars (voice only; their facts are invented) and the table of the fourteen prompt kinds with what each is
// grounded in. The tasks of the world parts live beside their calls in world.ts.
import { CONTENT_RULE } from "./prompts";

export const KINDS_TABLE = `<<KINDS>>`;

export const STYLE_GUIDE = `<<STYLE>>`;

const ROLE = `You are a historian and editor preparing a world for a strategy game of power in the manner of Hearts of Iron and Crusader Kings. The player holds one office for a term of 20 turns and acts through decrees, laws, appointments, spending, proclamations, favours and force. Several groups keep the player in office, some must agree to certain acts, and some can remove the player.`;
const WHY = `Players check names, dates, seat counts and placements against Wikipedia and the canon. One wrong seat count or a group in the wrong place loses their trust, so every fact comes from the documents when the documents have it. When a document and your memory disagree, the document wins.`;
// The Genghis build: the prompt named Temujin and the plan seated his chief minister.
const SEAT = `The seat: when the prompt names the seat or the person, the player holds exactly that seat, as that person. Otherwise the player holds the office that governed day to day in that polity at that date (the Grand Vizier under a sultan, the High Commissioner of a mandate, the Prime Minister under a king). Whoever sat above that office is a group in the world: it has a share of the final vote, a veto where it really had one, and the power to dismiss the player where it really had it.`;

export const PLAN_SYSTEM = `${ROLE}
${SEAT}
You plan the research for one prompt. Return one object:
- kind: the number of the prompt kind in this table (the grounding column says what the world must be faithful to):
${KINDS_TABLE}
- prompt_seat: the seat, office or person the prompt itself names as the player's, copied from the prompt ("Genghis Khan", "the Pope"); null when the prompt names none.
- seat: the office the player holds, the real holder's name on the start date (null for invented worlds or when nobody holds it), and the holder's exact English Wikipedia title (or null). When prompt_seat is set, the seat is that seat and that person.
- start_date: YYYY-MM-DD (negative year for BC; for invented calendars the in-world year with -01-01). For recorded history, the date the real holder took the seat, or the date the prompt implies if later.
- turn_length: a real duration for one turn, chosen so 20 turns cover the dramatic stretch, e.g. "about a month". term_end: start_date plus 20 turns, YYYY-MM-DD.
- above: who sits above the seat and what power they hold over it (dismiss, veto, recall), one row each; empty when nobody does.
- grounding_line: one line naming what the world is faithful to, e.g. "Grounded in the 1908 election results and Wikidata office dates" or "Grounded in ant biology: castes, the queen's pheromones, colony budding".
- divergence: for kinds 2, 4 and 5, the date the real record stops being followed (YYYY-MM-DD); else null.
- home_places: exact English Wikipedia titles of the polity itself (the country, mandate, empire, colony or city), used to decide which bodies sit at home. Empty for invented worlds.
- lookups: at most 10 exact English Wikipedia titles to read. For real polities: the polity article, the election that set the chamber, the legislature, the cabinet or government, the head of the seat's office, the main parties and armed groups, the foreign powers' governing body of that date (e.g. "Attlee ministry"), and, for kinds 1 to 5 with a real seat holder, the page that records the holder's promises (a manifesto, a programme, an accession speech). For kinds 2 to 5 the real period's pages. For kind 6 the myth's pages. For invented kinds, real institution pages the world copies.
- conflicts: exact Wikipedia titles of wars, insurgencies or revolutions active on the start date or just before; their infobox combatants are checked. Empty when none.
- categories: up to 4 exact Wikipedia category names (without "Category:") that list the parties, organisations or armed groups of that polity at that date, e.g. "Organisations based in Mandatory Palestine", "Political parties in the Ottoman Empire". Empty for invented worlds.
- canon: for kind 7, the book canon's Fandom wiki host (a name ending in .fandom.com, e.g. "iceandfire.fandom.com") with up to 6 exact page titles on it; null otherwise. Book canon wins over screen canon.
- analogues: for kind 4 the folklore page of the fantastic element, and for kinds 8 to 14, 3 to 5 exact Wikipedia titles of the real institutions, biology or anthropology the world will copy (e.g. "Pirate code", "Ant colony", "Seniority in the United States Senate"). For kinds 1 to 3 and 6, 7, empty.
- people: exact Wikipedia titles of the seat holder, whoever sits above, and up to 10 leaders who matter on the start date.
- keywords: up to 10 section-heading words that pick the useful sections (composition, results, government, factions, organisation).`;

export const ROSTER_SYSTEM = `${ROLE}
${WHY}
${SEAT}
You write the roster: every group that matters to the player on the start date, and every bloc of the chamber, each with evidence. Code checks every row against the documents and Wikidata, so copy quotes exactly.
What a group is:
- A group is an actor: an organisation or person that can decide and act as one (strike, vote, fund, fight). kind is "actor" for all of them except one.
- Exactly one group has kind "public": the people at large, named for the whole population as the period would ("the people of Palestine", "the British public"), never for one side of a divide ("Leave voters", "the loyalists"). A community or population is never a group of its own when an organisation speaks for it; its mood is the public group's support by region, and the regions may be split by community.
- Merge bodies under one command into one group named for both, at most two names ("The Jewish Agency and the Haganah": a body and the armed force that takes its orders; the Attlee Cabinet and the Colonial Office, which sits inside it). Split bodies that act against each other even on the same side (the Irgun and Lehi defied the Agency; the Najjada rivalled the Husseinis' Futuwwa).
- Count every constituency once: no group duplicates another's constituency.
Rules for each group row:
- name: the name historians or the canon use (the Irgun, the Lehi, the Haganah, the Committee of Union and Progress, House Tyrell), joining at most two bodies. Never a generic collective ("the undergrounds", "the garrison", "the street", "the Compact", "Life Support Guild"). In invented worlds each invented group's name contains a proper noun from the world (a founder, a place, a document, a ship), never only its job.
- wiki: its exact English Wikipedia title when it has one, else null.
- type, founded, dissolved (YYYY or YYYY-MM-DD from the documents or Wikidata; null when unknown or invented).
- sits: home or abroad, and sits_where: the place its leadership sits (the Attlee Cabinet sits in London, abroad for a Palestine seat). A sponsor, patron, company board or foreign government sits abroad.
- seats: its seats in the chamber (real numbers from the source, summing to the chamber's real_size), with seats_doc and seats_quote; null when it holds no seats. A bloc of the chamber is a row with seats. When one label holds nearly every seat but deputies voted along other lines (community, region, wing), the blocs are the sourced split along those lines, with the source's numbers; a party with seats of its own, even one, keeps its own row. When the sourced numbers do not add up exactly, keep them as sourced.
- vote_share: its share of the final test that keeps the player (0 when it has no vote); the voting shares sum to 1, each between 0.15 and 0.6. The chamber's share is the sum over its blocs.
- veto: true when an act needs its agreement (an upper house, a sovereign's sanction, a colonial office's approval, a war council). can_dismiss: true when it can remove the player without a coup.
- support: its support for this ruler on day one, 30 to 70 (30 is open hostility, 50 is neutral, 70 is firm loyalty), and support_why: one sentence on why this number for this ruler at this date, from the record where it has one. Judge each group on its own: no more than two groups share a value, and the values span at least 25 points.
- wants: one sentence, what it wants from the player. rival: the id of the group whose want conflicts with this one (must be another row's id).
- doc and quote: the document index and a quote of at most 25 words copied exactly from that document that shows the group existed or belongs in this world. grounding: record (history), canon (text or canon wiki), analogue, biology or anthropology (the real institution, animal or society it copies, quoting that page), divergent (after the divergence date: descends_from names the sourced group it came from), premise (the one fantastic or absurd element of the prompt; quote may be null).
Closed worlds (kinds 1, 6, 7, and the real period in kinds 2 to 5): every group is record or canon with a quote. Open worlds (kinds 8 to 14): invented groups are allowed, each tied to one scenario fact and one analogue page it quotes. Kinds 11 and 12 use no words like party, parliament, election or senate in group names.
- ruler: the seat, its real holder (null for invented), wiki title, start_date, the quote that shows the holder in office, above: the id of the group row that sits above the seat (or null), removed_by: one sentence naming who can remove the player and how, e.g. "The Sultan can dismiss you; the Chamber can vote you out." own_group: the id of the player's own side (the ruler's party, house or faction); when that party sits in the chamber, it is that bloc's row; never the public group. backer: the id of the home group without seats whose backing keeps the ruler in the seat day to day (the army that made him, the guard, the Politburo); null when the ruler's base is a party in the chamber or nobody plays that part.
- fall: when the real holder of the seat fell or was removed within the term (before term_end), the date and one line on what happened, with a quote; else null.
- chamber: the body that votes on laws, with its real size and the date of the composition used (on or before the start date, or the chamber elected and seated during the term when none sits on the start date); null when no assembly votes on laws in the term.
- excluded: every name in the checklist that you leave out, with one short reason (not active on the date, no political role, merged into another row).
Every militia, paramilitary or armed youth movement active on the date is named in a row: its own row, or joined to the body whose orders it takes; a unit inside another armed row (a strike force, a corps) merges into that row.
How many: 4 to 9 groups without seats, plus one row per chamber bloc. Of the groups without seats, at most 7 sit at home (the chamber is an eighth home group) and 1 to 5 abroad. Always include the body above the seat, the player's own side, the main rivals, the armed groups active on the date, the foreign powers that matter, and the one public group. At least two groups without seats, or one and the chamber, have a vote_share above 0.
${CONTENT_RULE}`;

export const WORLD_SYSTEM = `${ROLE}
${WHY}
You write one part of a world file for the game. The roster in the documents block is checked and closed: use exactly its groups, names and seats. A bible fixes this world's voice, words, names, faces and terms; every part keeps to it.
${CONTENT_RULE}
Rules for every part:
- Player copy is second person ("You sit on the Iron Throne", never "the king must choose"), keeps proper nouns in their case, and gives every number its scale ("52 of 100").
- Player copy never uses the game's own words: instrument, priced, consent, stance, weight, response, resistance, template or holder. Say support, anger, agree, votes, the clerk's price.
- A card (wants, hates, strike) is about 20 words. Its tags are 1 to 3 words an act would do, decidable from the act's text alone. Exactly one hate is the red line. A group that will not take money for its support has the hate tag "Bribes".
- Absurd worlds are played straight.
${STYLE_GUIDE}`;

export const REWRITE_SYSTEM = `You edit prose fields of a game world file. Each field has a flagged problem. Rewrite each one so it keeps every fact, name and number, keeps roughly its length and the world's house voice, and fixes the problem. Player copy never uses the words instrument, priced, consent, stance, weight, response, resistance, template or holder. Return every field with its path.
${STYLE_GUIDE}`;

export const EMBLEM_SYSTEM = `You design faction emblems for a political strategy game. You write design data, never code: each emblem is a short list of SVG shape elements as JSON.
Rules:
- viewBox is "0 0 24 24" or "0 0 64 64" (prefer 64 for heraldic detail).
- Allowed tags: path, circle, ellipse, rect, polygon, line. Allowed attributes: d, cx, cy, r, rx, ry, x, y, width, height, x1, y1, x2, y2, points, fill, stroke, stroke-width, transform, fill-rule. Nothing else: no text, no style, no href, no gradients, no url().
- Colours: fill and stroke take only "ink" (the group's own hue on the game desk), "accent" (the world's accent colour), "paper" (the background, for cut-outs) or "none". Mostly ink; accent for at most one small detail.
- At most 10 elements; 12 is the hard limit.
- It must read at 28 px: one bold silhouette that fills most of the viewBox, strokes at least 2.5 units in a 64 box (1.2 in a 24 box), no detail smaller than 1/12 of the box, no thin hairlines. Every emblem in a world must differ in silhouette so they tell apart at a glance.
- Use the devices this world itself would use (heraldic sigils for a feudal court, party symbols and seals for a modern state, packaging marks for a fridge) and keep every emblem in that idiom. Where a group has a known device in history or canon (House Lannister's lion, the Ottoman crescent), draw that device.
- No lettering or real script. No real trademarked logo copied exactly. No crests or stamps for the world itself: one emblem per group only.
Return only one JSON object, no code fences: {"emblems":[{"id":"<group id>","motif":"<one line: what it shows>","viewBox":"0 0 64 64","elements":[{"tag":"path","d":"...","fill":"ink"}]}]}`;

export const REVIEW_SYSTEM = `You check faction emblems for a strategy game before they ship. Each emblem is a list of SVG shapes in a 24 or 64 unit box; the game draws it at 28 pixels in one colour. For each emblem return:
- legible: true when a player would recognise the named motif at 28 pixels: one bold silhouette that fills most of the box, no stroke under 2.5 units in a 64 box (1.2 in a 24 box), no part smaller than a twelfth of the box, and a silhouette that tells it apart from the other emblems in the list. When in doubt, false.
- canon: for a group with a known device in its history or canon, "fits" when the emblem shows that device and "wrong" when it shows something else or reads as something else (a lion drawn so it reads as a sun is wrong); "none" when the group has no known device. In an invented world, always "none".`;
```

- [ ] **Step 7b: Fill the two copied texts**

```bash
bun -e '
const root = "/Users/deadpackets/workspace/UnitedStatesOfJev/.superpowers/ruler/research/";
const kinds = (await Bun.file(root + "prompt-kinds.md").text()).split("\n").filter((line) => /^\| \d+ \|/.test(line)).join("\n");
const style = (await Bun.file(root + "prompting.md").text()).split("\n").slice(112, 180).join("\n");
if (kinds.split("\n").length !== 14) throw new Error("the kinds table moved: find its 14 rows by hand");
if (!style.startsWith("<style_guide>") || !style.trimEnd().endsWith("</voice_examples>")) throw new Error("the style guide moved: find it by hand");
if (/`|\$\{/.test(kinds + style)) throw new Error("a backtick or ${ would break the template literal");
const path = "worker/gen/writing.ts";
const file = await Bun.file(path).text();
await Bun.write(path, file.replace("<<KINDS>>", kinds).replace("<<STYLE>>", style));
console.log("texts filled");
'
grep -c "voice_examples" worker/gen/writing.ts
```

Expected: `texts filled`, then `2`.

Run: `bunx tsc -b`
Expected: no output.

- [ ] **Step 8: Add the ledger helpers and the cap field**

In `worker/jev.ts`, add to `Env` after `DAILY_SECRET: string;`:

```ts
  BUILD_COST_CAP?: string; // dollars one build may spend on Opus and Grok; worker/build.ts defaults it to 3
```

Append to `worker/db.ts` (and add `import type { Usage } from "./gen/openrouter";` beside the other imports):

```ts
// One row per paid model answer of a build: the per-build cost ledger (lesson 20) and the golden runs' timings.
export async function recordCall(env: Env, scenario: string, usage: Usage) {
  await env.DB.prepare(
    "INSERT INTO build_calls (scenario, name, model, at, seconds, cost, input, output, reasoning, cached, cache_write, finish) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      scenario,
      usage.name,
      usage.model,
      Date.now(),
      usage.seconds,
      usage.cost,
      usage.input,
      usage.output,
      usage.reasoning,
      usage.cached,
      usage.cacheWrite,
      usage.finish,
    )
    .run();
}

export async function buildSpend(env: Env, scenario: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(cost), 0) AS spent FROM build_calls WHERE scenario = ?",
  )
    .bind(scenario)
    .first<{ spent: number }>();
  return row?.spent ?? 0;
}

// A build's own record for its data sheet (checks, lint, emblem report). Step results stay small; this is the store.
export async function putPart(env: Env, scenario: string, part: string, body: unknown) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO build_parts (scenario, part, body, at) VALUES (?, ?, ?, ?)",
  )
    .bind(scenario, part, JSON.stringify(body), Date.now())
    .run();
}
```

- [ ] **Step 9: Run the gates**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all tests pass (the 9 new ones included), no type errors, the build succeeds.

- [ ] **Step 10: Commit**

```bash
git add migrations/0004_build_ledger.sql worker/gen/openrouter.ts worker/gen/openrouter.test.ts worker/gen/schemas.ts worker/gen/writing.ts worker/gen/fixtures/fridge-roster.json worker/db.ts worker/jev.ts
git commit -m "Generation v2 contracts: one OpenRouter transport, the answer schemas, the prompts and a per-build cost ledger"
```

---

### Task 2: Sources: Wikipedia and Fandom pages, the category sweep, Wikidata

**Files:**
- Create: `worker/gen/wikipedia.ts`, `worker/gen/wikidata.ts`, `worker/gen/gather.ts`
- Test: `worker/gen/wikipedia.test.ts`

**Interfaces:**
- Consumes: `type Plan` from `worker/gen/schemas.ts` (Task 1).
- Produces:
  - `worker/gen/wikipedia.ts`: `type Doc = { index: number; source: string; title: string; text: string; combatants?: string[]; categories?: string[] }`, `getJson(url): Promise<any>`, `allowedHost(host): boolean`, `cleanWikitext(wikitext): string`, `infoboxes(wikitext)`, `pageSections(wikitext)`, `fetchPage(host, title, keywords, cap?): Promise<Omit<Doc, "index"> | null>`.
  - `worker/gen/wikidata.ts`: `type WikidataFacts = { qid; label; founded; dissolved; born; died; places: string[]; jurisdiction: string[]; positions: { position: string; from: string | null; to: string | null }[] }`, `qidsOf(titles)`, `formatTime(value)`, `wikidataFacts(qids)`, `compareDates(first, second): number`, `sweepCategories(categories): Promise<{ categories: string[]; titles: string[] }>`, `intros(titles)`.
  - `worker/gen/gather.ts`: `type Gathered = { docs: Doc[]; qids: Record<string, string | null>; facts: Record<string, WikidataFacts>; homeQids: string[]; spans: Record<string, [string, string]>; checklist: string[]; wikidataTable: string; sweepCategories: string[] }`, `gather(plan): Promise<Gathered>`, `docBlock(docs, cap?): string`. `Gathered` is plain JSON (no Map), so a Workflow step can return it.

- [ ] **Step 1: Write the failing test**

`worker/gen/wikipedia.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test";
import { compareDates, formatTime, sweepCategories } from "./wikidata";
import { allowedHost, cleanWikitext, fetchPage, infoboxes, pageSections } from "./wikipedia";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test.each([
  ["[[Rome|the city]] and [[Senate]]", "the city and Senate"],
  ["Born<ref name=a>cite</ref> here<ref/>.", "Born here."],
  ["{{start date|1908|07|24}}", "1908-07-24"],
  ["{{lang|tr|Meclis-i Mebusan}}", "Meclis-i Mebusan"],
  ["{{convert|5|km}}", "5 km"],
  ["{{ubl|Talaat|Enver}}", "Talaat; Enver"],
  ["'''Bold''' and ''italic''", "Bold and italic"],
  ["Text {|\n|a||b\n|} after", "Text after"],
  ["{{cite web|url=x}}Kept", "Kept"],
  ["Before [[File:Map.png|thumb|A [[map]]]] after", "Before after"],
  ["a<br/>b", "a; b"],
])("wikitext %p reads as %p", (wikitext, text) => {
  expect(cleanWikitext(wikitext)).toBe(text);
});

test("an infobox keeps its fields as text and its links, and drops image fields", () => {
  const [box] = infoboxes(
    "{{Infobox political party\n| name = Committee of Union and Progress\n| founded = {{start date|1889}}\n| leader = [[Talaat Pasha]]\n| image = CUP.png\n}}\nLead text.",
  );
  expect(box.type).toBe("political party");
  expect(box.fields).toEqual([
    ["name", "Committee of Union and Progress"],
    ["founded", "1889"],
    ["leader", "Talaat Pasha"],
  ]);
  expect(box.links.leader).toEqual(["Talaat Pasha"]);
});

test("sections keep the lead and drop the reference sections", () => {
  expect(pageSections("Lead\n==History==\nA\n==References==\nB").map((section) => section.heading)).toEqual([
    "Lead",
    "History",
  ]);
});

// Security: the canon host comes from the model (the v3 bug hunt found an SSRF through a model-chosen language).
test.each([
  ["en.wikipedia.org", true],
  ["iceandfire.fandom.com", true],
  ["de.wikipedia.org", false],
  ["evil.com", false],
  ["en.wikipedia.org.evil.com", false],
  ["fandom.com", false],
  ["x.fandom.com@evil.com", false],
  ["iceandfire.fandom.com/../x", false],
  ["169.254.169.254", false],
  ["localhost", false],
])("host %p is allowed: %p", (host, allowed) => {
  expect(allowedHost(host)).toBe(allowed);
});

test("a page on a host outside the allowlist is never fetched", async () => {
  let fetched = 0;
  globalThis.fetch = (async () => {
    fetched++;
    return new Response("{}");
  }) as unknown as typeof fetch;
  expect(await fetchPage("evil.com", "Anything", [])).toBeNull();
  expect(fetched).toBe(0);
});

test.each([
  [{ time: "+1908-07-24T00:00:00Z", precision: 11 }, "1908-07-24"],
  [{ time: "+1908-07-00T00:00:00Z", precision: 10 }, "1908-07"],
  [{ time: "+00000001908-00-00T00:00:00Z", precision: 9 }, "1908"],
  [{ time: "-0044-03-15T00:00:00Z", precision: 11 }, "-0044-03-15"],
  [undefined, null],
])("Wikidata time %p reads as %p", (value, text) => {
  expect(formatTime(value)).toBe(text);
});

test.each([
  ["1908", "1908-08-05", 0],
  ["1908-07-24", "1908-08-05", -1],
  ["1909", "1908-12-31", 1],
  ["-0044-03-15", "0001-01-01", -1],
])("comparing %p with %p at the coarser precision gives %p", (first, second, sign) => {
  expect(Math.sign(compareDates(first, second))).toBe(sign);
});

// Lesson 9: 50 titles per category and 180 in all, or small groups are starved.
test("the sweep takes at most 50 members a category, skips lists and stops at 180 titles", async () => {
  globalThis.fetch = (async (url: string) => {
    const category = new URL(url).searchParams.get("cmtitle") ?? "";
    const members = Array.from({ length: 60 }, (_, i) => ({
      ns: 0,
      title: i === 0 ? `List of ${category}` : `${category} member ${i}`,
    }));
    return new Response(JSON.stringify({ query: { categorymembers: members } }));
  }) as unknown as typeof fetch;
  const sweep = await sweepCategories(["A", "B", "C", "D"]);
  expect(sweep.categories).toEqual(["Category:A", "Category:B", "Category:C", "Category:D"]);
  expect(sweep.titles).toHaveLength(180);
  expect(sweep.titles.some((title) => title.startsWith("List of"))).toBe(false);
  expect(sweep.titles.filter((title) => title.startsWith("Category:A ")).length).toBe(49);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test worker/gen/wikipedia.test.ts`
Expected: FAIL, `Cannot find module './wikidata'`.

- [ ] **Step 3: Write the Wikipedia module**

`worker/gen/wikipedia.ts`:

```ts
// Wikipedia and Fandom pages as source documents: infoboxes kept as "key: value" lines, the lead, then the sections that
// best match the plan's keywords, up to a cap. Only en.wikipedia.org and a *.fandom.com wiki are ever fetched, because
// the canon host is the model's choice.
const USER_AGENT = "USOJ/1.0 (youssef@ctf.ae)";
const WIKIPEDIA = "en.wikipedia.org";

export type Doc = {
  index: number;
  source: string;
  title: string;
  text: string;
  combatants?: string[];
  categories?: string[];
};

export const allowedHost = (host: string): boolean =>
  host === WIKIPEDIA || /^[a-z0-9-]+\.fandom\.com$/.test(host);

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Wikipedia answers a burst with 429; waits of 0.8, 1.6 and 2.4 s cover it. Any other 4xx is final.
export async function getJson(url: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt >= 3) throw error;
    }
    if (response?.ok) return response.json();
    if (response && response.status < 500 && response.status !== 429)
      throw new Error(`${url} answered ${response.status}`);
    if (attempt >= 3) throw new Error(`${url} answered ${response?.status ?? "nothing"}`);
    await sleep(800 * (attempt + 1));
  }
}

const DROPPED_TEMPLATES =
  /^(efn|refn|sfn|harv|cite|citation|flagicon|flagdeco|ref|reflist|clear|legend|color box|colour box|party color|party colour|increase|decrease|steady|dts|ntsh|cn|citation needed|when|who|which|dubious|failed verification|short description|use |pp|infobox|sidebar|navbox|portal|main|see also|further|about|redirect|good article|featured article|coord|image|multiple image|campaignbox|historical populations|quote box|blockquote)/i;
const LIST_TEMPLATES =
  /^(plainlist|plain list|ubl|unbulleted list|flatlist|hlist|collapsible list|bulleted list|marriage)$/i;
const FIRST_ARGUMENT_TEMPLATES =
  /^(nowrap|small|big|nobold|sup|nobr|flag|flagcountry|flagu|flagdeco|abbr|lang-..|transl|tooltip|sortname|nbsp|ill|interlanguage link|anchor|sclass|ship|hms|uss|awrap)$/i;

// One template's text: dates as YYYY-MM-DD, lists joined by "; ", wrappers as their first argument, the rest dropped.
function templateText(inner: string): string {
  const parts = inner.split("|");
  const name = parts[0].trim();
  const positional = parts
    .slice(1)
    .filter((part) => !/^\s*[\w ]+=/.test(part))
    .map((part) => part.trim());
  if (/^lang$/i.test(name) || /^lang-/i.test(name)) return positional[positional.length - 1] ?? "";
  if (/(start|end|birth|death) date|^date$/i.test(name))
    return positional.filter((part) => /^\d+$/.test(part)).join("-");
  if (/^convert$/i.test(name)) return positional.slice(0, 2).join(" ");
  if (LIST_TEMPLATES.test(name))
    return positional
      .join("; ")
      .replace(/\n\s*\*\s*/g, "; ")
      .replace(/^;\s*/, "");
  if (FIRST_ARGUMENT_TEMPLATES.test(name)) return positional[0] ?? "";
  return "";
}

// Links first, so their pipes do not split templates; then templates innermost first, then tables and markup.
export function cleanWikitext(wikitext: string): string {
  let text = wikitext
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/\[\[(?:File|Image):(?:[^[\]]|\[\[[^\]]*\]\])*\]\]/gi, "");
  text = text.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1");
  text = text.replace(/\[https?:\/\/\S+\s([^\]]*)\]/g, "$1");
  let previous: string;
  do {
    previous = text;
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => templateText(inner));
  } while (text !== previous);
  text = text.replace(/\{\|[\s\S]*?\|\}/g, "");
  text = text
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<[^>]+>/g, "")
    .replace(/'''''|'''|''/g, "")
    .replace(/&nbsp;/g, " ");
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ ([.,;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Top-level {{Infobox ...}} blocks by brace depth, each as its type, text fields and the link targets of each field.
export function infoboxes(
  wikitext: string,
): { type: string; fields: [string, string][]; links: Record<string, string[]> }[] {
  const boxes = [];
  let rest = wikitext;
  let start: number;
  while ((start = rest.search(/\{\{\s*Infobox/i)) >= 0) {
    let depth = 0;
    let end = start;
    for (; end < rest.length; end++) {
      if (rest.startsWith("{{", end)) {
        depth++;
        end++;
      } else if (rest.startsWith("}}", end)) {
        depth--;
        end++;
        if (depth === 0) break;
      }
    }
    const inner = rest.slice(start + 2, end - 1);
    rest = rest.slice(end + 1);
    const parameters = inner.split(/\n\s*\|/);
    const type = parameters[0].replace(/^\s*Infobox\s*/i, "").split("|")[0].trim();
    const links: Record<string, string[]> = {};
    const fields: [string, string][] = [];
    for (const parameter of parameters.slice(1)) {
      const match = parameter.match(/^\s*([^=]+?)\s*=([\s\S]*)$/);
      if (!match) continue;
      links[match[1]] = [...match[2].matchAll(/\[\[([^\]|#]+)/g)]
        .map((link) => link[1].trim())
        .filter((target) => !/^(File|Image):/i.test(target));
      const value = cleanWikitext(match[2]).replace(/\n+/g, "; ");
      if (value && !/^(image|logo|flag|map|caption|alt|image_size|signature|symbol)/i.test(match[1]))
        fields.push([match[1], value.slice(0, 400)]);
    }
    boxes.push({ type, fields, links });
  }
  return boxes;
}

const SKIPPED_SECTIONS =
  /^(references|notes|see also|external links|further reading|bibliography|sources|citations|footnotes|gallery)$/i;

export function pageSections(wikitext: string): { heading: string; text: string }[] {
  const parts = wikitext.split(/^(==+)\s*([^=\n]+?)\s*\1\s*$/m);
  const sections = [{ heading: "Lead", text: parts[0] }];
  for (let i = 1; i < parts.length; i += 3) sections.push({ heading: parts[i + 1], text: parts[i + 2] ?? "" });
  return sections.filter((section) => !SKIPPED_SECTIONS.test(section.heading));
}

// One page as a document: infoboxes, the lead, then keyword-scored sections up to the cap.
export async function fetchPage(
  host: string,
  title: string,
  keywords: string[],
  cap = 16000,
): Promise<Omit<Doc, "index"> | null> {
  if (!allowedHost(host)) return null;
  const api = `https://${host}/${host === WIKIPEDIA ? "w/" : ""}api.php`;
  const reply = await getJson(
    `${api}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext|categories&format=json&formatversion=2&redirects=1`,
  ).catch(() => null);
  if (!reply?.parse) return null;
  const wikitext: string = reply.parse.wikitext;
  const boxes = infoboxes(wikitext);
  const boxText = boxes
    .map((box) => `[Infobox ${box.type}]\n${box.fields.map(([key, value]) => `${key}: ${value}`).join("\n")}`)
    .join("\n\n")
    .slice(0, 7000);
  const sections = pageSections(wikitext).map((section, order) => ({
    ...section,
    order,
    text: cleanWikitext(section.text),
    hits: keywords.filter((keyword) =>
      `${section.heading} ${section.text.slice(0, 3000)}`.toLowerCase().includes(keyword.toLowerCase()),
    ).length,
  }));
  const lead = sections[0]?.text.slice(0, 5000) ?? "";
  let body = "";
  let left = cap - lead.length - boxText.length;
  for (const section of sections.slice(1).sort((a, b) => b.hits - a.hits || a.order - b.order)) {
    if (left < 400) break;
    const text = section.text.slice(0, Math.min(6000, left));
    body += `\n\n### ${section.heading}\n${text}`;
    left -= text.length;
  }
  const combatants = boxes
    .filter((box) => /military conflict|civil conflict|war/i.test(box.type))
    .flatMap((box) =>
      Object.entries(box.links)
        .filter(([key]) => /^combatant\d/.test(key))
        .flatMap(([, targets]) => targets),
    );
  const categories = (reply.parse.categories ?? [])
    .filter((category: { hidden?: boolean }) => !category.hidden)
    .map((category: { category: string }) => category.category.replace(/_/g, " "));
  return {
    source: `${host === WIKIPEDIA ? "Wikipedia" : host}: ${reply.parse.title}`,
    title: reply.parse.title,
    text: `${boxText}\n\n${lead}${body}`.trim(),
    combatants: [...new Set(combatants)],
    categories,
  };
}
```

Note: `cleanWikitext` adds one rule the prototype lacked, `.replace(/ ([.,;:])/g, "$1")`, so a dropped `<ref/>` before a full stop leaves no stray space (the second test row).

- [ ] **Step 4: Write the Wikidata module**

`worker/gen/wikidata.ts`:

```ts
// Wikidata facts for the roster checks: a Wikipedia title's QID through pageprops (never a label search, which mixed up
// the Najjada and Najdat), founding and dissolution dates, birth and death, places, and the offices a person held. Also
// the capped category sweep and each swept title's intro with its short description, which carries its dates.
import { getJson } from "./wikipedia";

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php?format=json&formatversion=2&redirects=1";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php?format=json&languages=en";
const SWEEP_PER_CATEGORY = 50; // lesson 9
const SWEEP_TITLES = 180; // lesson 9
const SWEEP_CATEGORIES = 8;

export type WikidataFacts = {
  qid: string;
  label: string;
  founded: string | null;
  dissolved: string | null;
  born: string | null;
  died: string | null;
  places: string[];
  jurisdiction: string[];
  positions: { position: string; from: string | null; to: string | null }[];
};

const inChunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

export async function qidsOf(titles: string[]): Promise<Map<string, { title: string; qid: string | null }>> {
  const found = new Map<string, { title: string; qid: string | null }>();
  for (const batch of inChunks([...new Set(titles)], 50)) {
    const reply = await getJson(
      `${WIKIPEDIA_API}&action=query&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(batch.join("|"))}`,
    );
    const renamed = new Map<string, string>();
    for (const step of [...(reply.query?.normalized ?? []), ...(reply.query?.redirects ?? [])])
      renamed.set(step.from, step.to);
    const pages = new Map<string, any>((reply.query?.pages ?? []).map((page: any) => [page.title, page]));
    for (const title of batch) {
      let target = title;
      for (let hops = 0; hops < 3 && renamed.has(target); hops++) target = renamed.get(target)!;
      const page = pages.get(target);
      found.set(title, { title: target, qid: page && !page.missing ? (page.pageprops?.wikibase_item ?? null) : null });
    }
  }
  return found;
}

// A Wikidata time at its own precision: day (11), month (10) or year (9 and coarser). BC years keep their minus sign.
export function formatTime(value: { time?: string; precision?: number } | undefined): string | null {
  const match = value?.time?.match(/^([+-])(\d+)-(\d\d)-(\d\d)/);
  if (!match) return null;
  const year = (match[1] === "-" ? "-" : "") + match[2].replace(/^0+(?=\d{4})/, "");
  const precision = value?.precision ?? 9;
  return precision >= 11 ? `${year}-${match[3]}-${match[4]}` : precision === 10 ? `${year}-${match[3]}` : year;
}

async function entities(ids: string[]): Promise<Map<string, any>> {
  const found = new Map<string, any>();
  for (const batch of inChunks([...new Set(ids.filter(Boolean))], 50)) {
    const reply = await getJson(`${WIKIDATA_API}&action=wbgetentities&ids=${batch.join("|")}&props=claims|labels`);
    for (const [id, entity] of Object.entries(reply.entities ?? {})) found.set(id, entity);
  }
  return found;
}

const claimValues = (entity: any, property: string) =>
  (entity?.claims?.[property] ?? [])
    .filter((claim: any) => claim.rank !== "deprecated")
    .map((claim: any) => claim.mainsnak?.datavalue?.value);
const claimIds = (entity: any, property: string): string[] =>
  claimValues(entity, property)
    .map((value: any) => value?.id)
    .filter(Boolean);
const COUNTRY_CLASSES = new Set(["Q3624078", "Q6256", "Q3024240", "Q7275", "Q1763527", "Q417175", "Q48349"]);

// Dates, places (P1001, P17 and the country of the P159 seat) and offices held (P39), with labels.
export async function wikidataFacts(qids: string[]): Promise<Map<string, WikidataFacts>> {
  const main = await entities(qids);
  const seats = await entities([...main.values()].flatMap((entity) => claimIds(entity, "P159")));
  const labelled = await entities(
    [
      ...[...main.values()].flatMap((entity) => [
        ...claimIds(entity, "P39"),
        ...claimIds(entity, "P1001"),
        ...claimIds(entity, "P17"),
      ]),
      ...[...seats.values()].flatMap((entity) => claimIds(entity, "P17")),
    ].filter((qid) => !main.has(qid)),
  );
  const lookup = (qid: string) => main.get(qid) ?? labelled.get(qid) ?? seats.get(qid);
  const label = (qid: string): string => lookup(qid)?.labels?.en?.value ?? qid;
  const isCountry = (qid: string) => claimIds(lookup(qid), "P31").some((kind) => COUNTRY_CLASSES.has(kind));
  const found = new Map<string, WikidataFacts>();
  for (const [qid, entity] of main) {
    const places = [...claimIds(entity, "P1001"), ...claimIds(entity, "P17"), ...claimIds(entity, "P159")];
    found.set(qid, {
      qid,
      label: label(qid),
      founded: formatTime(claimValues(entity, "P571")[0]),
      dissolved: formatTime(claimValues(entity, "P576")[0]),
      born: formatTime(claimValues(entity, "P569")[0]),
      died: formatTime(claimValues(entity, "P570")[0]),
      places: [...new Set(places)].map((place) => `${place}:${label(place)}`),
      jurisdiction: claimIds(entity, "P1001").filter(isCountry),
      positions: (entity.claims?.P39 ?? []).map((claim: any) => ({
        position: label(claim.mainsnak?.datavalue?.value?.id),
        from: formatTime(claim.qualifiers?.P580?.[0]?.datavalue?.value),
        to: formatTime(claim.qualifiers?.P582?.[0]?.datavalue?.value),
      })),
    });
  }
  return found;
}

// Compares two dates at the coarser precision of the two, so "1908" equals "1908-08-05". Negative years are BC.
export function compareDates(first: string, second: string): number {
  const parts = (date: string) => date.replace(/^-/, "").split("-").length;
  const precision = Math.min(parts(first), parts(second));
  const key = (date: string) => {
    const negative = date.startsWith("-");
    const [year, month = 0, day = 0] = date.replace(/^-/, "").split("-").slice(0, precision).map(Number);
    return (negative ? -year : year) * 10000 + month * 100 + day;
  };
  return key(first) - key(second);
}

// The named categories plus one level of political or armed subcategories, 50 members each and 180 titles in all.
export async function sweepCategories(
  names: string[],
): Promise<{ categories: string[]; titles: string[] }> {
  const seen = new Set<string>();
  const titles = new Set<string>();
  const used: string[] = [];
  const queue = names.map((name) => (name.startsWith("Category:") ? name : `Category:${name}`));
  while (queue.length && used.length < SWEEP_CATEGORIES) {
    const category = queue.shift()!;
    if (seen.has(category)) continue;
    seen.add(category);
    const reply = await getJson(
      `${WIKIPEDIA_API}&action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=200&cmnamespace=0|14`,
    ).catch(() => null);
    const members = reply?.query?.categorymembers ?? [];
    if (!members.length) continue;
    used.push(category);
    for (const member of members.slice(0, SWEEP_PER_CATEGORY)) {
      if (member.ns === 14) {
        if (
          / (in|of) /.test(member.title) &&
          !/attack|member|people|operation|battle|history|by |incident|bombing|assassinat/i.test(member.title) &&
          /politic|militant|paramilitar|armed|insurg|rebel|resistance|guerr|youth organi|jewish organi|arab organi/i.test(
            member.title,
          ) &&
          names.length + used.length < 12
        )
          queue.push(member.title);
      } else if (!/^List of/.test(member.title)) titles.add(member.title);
    }
  }
  return { categories: used, titles: [...titles].slice(0, SWEEP_TITLES) };
}

// Each title's intro, led by its short description in brackets: "[Palestinian militant group, 1935–1948] ...".
export async function intros(titles: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const batch of inChunks(titles, 20)) {
    const reply = await getJson(
      `${WIKIPEDIA_API}&action=query&prop=extracts|pageprops&ppprop=wikibase-shortdesc&exintro=1&explaintext=1&exlimit=20&titles=${encodeURIComponent(batch.join("|"))}`,
    );
    for (const page of reply.query?.pages ?? []) {
      if (!page.extract) continue;
      const described = page.pageprops?.["wikibase-shortdesc"];
      found.set(page.title, `${described ? `[${described}] ` : ""}${page.extract.replace(/\s+/g, " ").slice(0, 500)}`);
    }
  }
  return found;
}
```

- [ ] **Step 5: Write the gather module**

`worker/gen/gather.ts`:

```ts
// Research for one prompt: the plan's Wikipedia (or Fandom canon) pages, a capped category sweep for the groups of the
// polity with each title's short description, and Wikidata dates and offices for every body and person found. The
// result is plain JSON so a Workflow step can return it.
import type { Plan } from "./schemas";
import { compareDates, intros, qidsOf, sweepCategories, wikidataFacts, type WikidataFacts } from "./wikidata";
import { allowedHost, fetchPage, getJson, type Doc } from "./wikipedia";

const WIKIPEDIA = "en.wikipedia.org";
const PAGE_CHARACTERS = 12000;
const TOTAL_CHARACTERS = 120000;

export type Gathered = {
  docs: Doc[];
  qids: Record<string, string | null>; // Wikipedia title to QID
  facts: Record<string, WikidataFacts>; // by QID
  homeQids: string[];
  spans: Record<string, [string, string]>; // a checklist title's active years
  checklist: string[]; // combatants and swept groups active on the start date: each a roster row or excluded
  wikidataTable: string;
  sweepCategories: string[];
};

// The page by its exact title, else the first search hit on the same wiki.
async function findPage(host: string, title: string, keywords: string[]) {
  const page = await fetchPage(host, title, keywords, PAGE_CHARACTERS);
  if (page || !allowedHost(host)) return page;
  const api = `https://${host}/${host === WIKIPEDIA ? "w/" : ""}api.php`;
  const search = await getJson(
    `${api}?action=query&list=search&srsearch=${encodeURIComponent(title)}&srlimit=1&format=json&formatversion=2`,
  ).catch(() => null);
  const hit = search?.query?.search?.[0]?.title;
  return hit ? fetchPage(host, hit, keywords, PAGE_CHARACTERS) : null;
}

export async function gather(plan: Plan): Promise<Gathered> {
  const wanted: [string, string][] = [
    ...[...plan.lookups, ...plan.conflicts, ...plan.analogues].map((title): [string, string] => [WIKIPEDIA, title]),
    ...(plan.canon?.titles ?? []).map((title): [string, string] => [plan.canon!.host, title]),
  ];
  const pages = (
    await Promise.all(wanted.map(([host, title]) => findPage(host, title, plan.keywords).catch(() => null)))
  ).filter((page): page is NonNullable<typeof page> => !!page);
  const docs: Doc[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const page of pages) {
    if (seen.has(page.source) || total > TOTAL_CHARACTERS) continue;
    seen.add(page.source);
    total += page.text.length;
    docs.push({ ...page, index: docs.length + 1 });
  }
  const conflictTitles = new Set(plan.conflicts.map((title) => title.toLowerCase()));
  const combatants = docs
    .filter((doc) => conflictTitles.has(doc.title.toLowerCase()) || (doc.combatants?.length ?? 0) > 0)
    .flatMap((doc) => doc.combatants ?? []);

  // The plan's categories plus the organisation categories found on the fetched pages of this polity.
  const homes = plan.home_places.map((place) => place.toLowerCase());
  const organisationCategories = [...new Set(docs.flatMap((doc) => doc.categories ?? []))].filter(
    (category) =>
      homes.some((home) => category.toLowerCase().includes(home)) &&
      /organi[sz]ations|parties|politic|militant|paramilitar|nationalis|insurg|resistance|youth/i.test(category),
  );
  const swept =
    plan.kind <= 5 && (plan.categories.length || organisationCategories.length)
      ? await sweepCategories([...plan.categories, ...organisationCategories].slice(0, 6))
      : { categories: [], titles: [] };

  const people = [...new Set([...(plan.seat.holder_wiki ? [plan.seat.holder_wiki] : []), ...plan.people])];
  const titles = [
    ...new Set([
      ...people,
      ...plan.home_places,
      ...swept.titles,
      ...combatants,
      ...docs.filter((doc) => doc.source.startsWith("Wikipedia")).map((doc) => doc.title),
    ]),
  ];
  const qids: Record<string, string | null> = {};
  for (const [title, found] of await qidsOf(titles)) qids[title] = found.qid;
  const facts: Record<string, WikidataFacts> = {};
  for (const [qid, fact] of await wikidataFacts([
    ...new Set(Object.values(qids).filter((qid): qid is string => !!qid)),
  ]))
    facts[qid] = fact;
  const factsOf = (title: string) => facts[qids[title] ?? ""];
  const homeQids = plan.home_places.map((place) => qids[place]).filter((qid): qid is string => !!qid);

  const active = (title: string) => {
    const fact = factsOf(title);
    return (
      !fact ||
      ((!fact.founded || compareDates(fact.founded, plan.start_date) <= 0) &&
        (!fact.dissolved || compareDates(fact.dissolved, plan.start_date) >= 0))
    );
  };
  const sweptActive = swept.titles.filter(active);
  const spans: Record<string, [string, string]> = {};
  if (sweptActive.length) {
    const intro = await intros(sweptActive);
    // Active years per checklist name: Wikidata first, else the short description's "1935–1948".
    for (const title of sweptActive) {
      const fact = factsOf(title);
      const described = intro.get(title)?.match(/^\[[^\]]*?\b(\d{4})\s*[–-]\s*(\d{4})\b/);
      if (fact?.founded && fact?.dissolved) spans[title] = [fact.founded, fact.dissolved];
      else if (described) spans[title] = [described[1], described[2]];
    }
    const lines = sweptActive.map((title) => {
      const fact = factsOf(title);
      return `- ${title} (${fact?.founded ?? "?"} to ${fact?.dissolved ?? "?"}): ${intro.get(title) ?? ""}`;
    });
    docs.push({
      index: docs.length + 1,
      source: `Wikipedia category sweep: ${swept.categories.join("; ")}`,
      title: "Category sweep",
      text: lines.join("\n"),
    });
  }
  const checklist = [...new Set([...combatants.filter(active), ...sweptActive])];

  const personLine = (title: string) => {
    const fact = factsOf(title);
    if (!fact) return `${title} | not found`;
    const offices = fact.positions
      .filter((position) => position.from)
      .map((position) => `${position.position} ${position.from} to ${position.to ?? "?"}`)
      .join("; ");
    return `${title} | ${fact.qid} | born ${fact.born ?? "?"} | died ${fact.died ?? "alive"} | offices: ${offices || "none listed"}`;
  };
  const bodyLine = (title: string) => {
    const fact = factsOf(title);
    return fact
      ? `${title} | ${fact.qid} | founded ${fact.founded ?? "?"} | dissolved ${fact.dissolved ?? "?"} | places ${fact.places.join(", ") || "?"}`
      : null;
  };
  const wikidataTable = [
    people.length ? `People (title | qid | born | died | offices):\n${people.map(personLine).join("\n")}` : "",
    `Bodies (title | qid | founded | dissolved | places):\n${[
      ...new Set([...combatants, ...docs.map((doc) => doc.title), ...sweptActive]),
    ]
      .map(bodyLine)
      .filter(Boolean)
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { docs, qids, facts, homeQids, spans, checklist, wikidataTable, sweepCategories: swept.categories };
}

// The documents block every roster and world call reads; cap cuts each document (the world calls read 6,000 each).
export const docBlock = (docs: Doc[], cap = Number.POSITIVE_INFINITY): string =>
  `<documents>\n${docs
    .map(
      (doc) =>
        `<document index="${doc.index}"><source>${doc.source}</source><document_content>\n${doc.text.slice(0, cap)}\n</document_content></document>`,
    )
    .join("\n")}\n</documents>`;
```

- [ ] **Step 6: Run the test**

Run: `bun test worker/gen/wikipedia.test.ts`
Expected: PASS, 34 tests. If the `Before [[File:...]] after` row leaves a double space, the `[ \t]+` rule collapses it; if a row fails on whitespace only, fix `cleanWikitext`, not the row.

- [ ] **Step 7: Run the gates and commit**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green.

```bash
git add worker/gen/wikipedia.ts worker/gen/wikidata.ts worker/gen/gather.ts worker/gen/wikipedia.test.ts
git commit -m "Generation v2 sources: Wikipedia and Fandom pages on an allowlist, the capped category sweep and Wikidata facts"
```

---

### Task 3: The roster stage: plan, roster, checks C1 to C15 and the repair

**Files:**
- Create: `worker/gen/checks.ts`, `worker/gen/roster.ts`
- Test: `worker/gen/checks.test.ts`

**Interfaces:**
- Consumes: `type Caller` (Task 1), `PlanSchema`, `RosterSchema`, `RosterPatchSchema`, `hasChamber`, `type Fail`, `type Plan`, `type Roster`, `type RosterPatch`, `type Group` (Task 1), `PLAN_SYSTEM`, `ROSTER_SYSTEM` (Task 1), `docBlock`, `type Gathered` (Task 2), `fetchPage`, `type Doc` (Task 2), `qidsOf`, `wikidataFacts`, `compareDates` (Task 2).
- Produces:
  - `worker/gen/checks.ts`: `type RosterContext = { plan: Plan; gathered: Gathered }`, `MAX_HOLDERS = 10`, `MAX_HOME = 8`, `MAX_ABROAD = 5`, `MIN_HOLDERS = 3`, `fold(text)`, `quoted(quote, doc, docs): boolean`, `lowerWordsOf(docs)`, `hasProperNoun(name, lower)`, `holderCounts(roster)`, `isGrounded(plan, roster): boolean`, `checkPlanSeat(prompt, plan): Fail[]`, `checkRoster(roster, context): Fail[]`, `fitHolderCount(roster): Roster`.
  - `worker/gen/roster.ts`: `writePlan(call, prompt, today): Promise<Plan>`, `writeRoster(call, prompt, plan, gathered): Promise<{ roster; gathered }>`, `resolveRoster(roster, gathered): Promise<Gathered>`, `applyRosterPatch(roster, patch): Roster`, `repairRoster(call, roster, fails, context): Promise<{ roster; gathered }>`, `settleRoster(call, roster, context): Promise<{ roster; gathered; before: Fail[]; after: Fail[] }>`.

- [ ] **Step 1: Write the failing test**

`worker/gen/checks.test.ts`:

```ts
import { expect, test } from "bun:test";
import { checkPlanSeat, checkRoster, fitHolderCount, hasProperNoun, holderCounts, quoted } from "./checks";
import fixture from "./fixtures/fridge-roster.json";
import type { Gathered } from "./gather";
import { applyRosterPatch } from "./roster";
import type { Group, Plan, Roster } from "./schemas";
import type { WikidataFacts } from "./wikidata";

const plan = fixture.plan as Plan;
const roster = fixture.roster as Roster;
// Each numbered document holds the quotes the fixture cites from it, and some lower-case words for the C3 row below.
const docs = Array.from({ length: 10 }, (_, i) => ({
  index: i + 1,
  source: `Wikipedia: Page ${i + 1}`,
  title: `Page ${i + 1}`,
  text: `${roster.groups
    .filter((group) => group.doc === i + 1)
    .map((group) => group.quote)
    .join(" ")} The crisper drawer vegetables sit in a humid drawer while the army marches.`,
}));
const gathered: Gathered = {
  docs,
  qids: {},
  facts: {},
  homeQids: [],
  spans: {},
  checklist: [],
  wikidataTable: "",
  sweepCategories: [],
};
const context = { plan, gathered };
const changed = (id: string, change: Partial<Group>): Roster => ({
  ...roster,
  groups: roster.groups.map((group) => (group.id === id ? { ...group, ...change } : group)),
});
const supports = (values: Record<string, number>): Roster => ({
  ...roster,
  groups: roster.groups.map((group) => ({ ...group, support: values[group.id] ?? group.support })),
});
const pantry = roster.groups.find((group) => group.id === "pantry")!;
const withAbroad = (count: number): Roster => ({
  ...roster,
  groups: [
    ...roster.groups,
    ...Array.from({ length: count }, (_, i) => ({ ...pantry, id: `extra${i}`, name: `The Kelvinator ${i} Pantry` })),
  ],
});

test("the fridge roster passes every check", () => {
  expect(checkRoster(roster, context)).toEqual([]);
});

test.each([
  ["a quote not in its document", changed("expiry", { quote: "Words no page holds." }), "C1"],
  ["an invented name with no proper noun", changed("crisper", { name: "The Crisper Drawer Vegetables" }), "C3"],
  ["a generic name", changed("mould", { name: "The Army" }), "C10"],
  ["a rival that is the group itself", changed("mould", { rival: "mould" }), "C12"],
  ["seats that miss the chamber's size", changed("freshfood", { seats: 30 }), "C12"],
  ["an own group that is the public", { ...roster, ruler: { ...roster.ruler, own_group: "public" } }, "C12"],
  ["a backer with seats", { ...roster, ruler: { ...roster.ruler, backer: "freshfood" } }, "C12"],
  ["four groups on one support", supports({ expiry: 44, mould: 44, botulinum: 44 }), "C13"],
  [
    "supports spanning under 25 points",
    supports({ householder: 50, expiry: 52, mould: 54, botulinum: 56, pantry: 58, public: 60 }),
    "C13",
  ],
  ["the public named as one camp", changed("public", { name: "The Leave voters of the Fridge" }), "C14"],
  ["two public groups", changed("pantry", { kind: "public" }), "C14"],
  ["a name joining three bodies", changed("mould", { name: "The Penicillium, Aspergillus and Rhizopus Moulds" }), "C14"],
  ["six groups abroad and eleven on the desk", withAbroad(4), "C15"],
])("%s fails %s", (_label, changedRoster, check) => {
  expect(checkRoster(changedRoster as Roster, context).map((fail) => fail.check)).toContain(check);
});

const facts = (qid: string, change: Partial<WikidataFacts>): WikidataFacts => ({
  qid,
  label: qid,
  founded: null,
  dissolved: null,
  born: null,
  died: null,
  places: [],
  jurisdiction: [],
  positions: [],
  ...change,
});
test("Wikidata wins: a body founded after the start fails C4, and a ruler out of office on the start date fails C8", () => {
  const recorded = {
    plan: { ...plan, kind: 1, start_date: "1908-07-24", term_end: "1909-03-01" },
    gathered: {
      ...gathered,
      qids: { "Late Body": "Q1", "Kamil Pasha": "Q2" },
      facts: {
        Q1: facts("Q1", { founded: "1912" }),
        Q2: facts("Q2", { positions: [{ position: "Grand Vizier", from: "1885-09-25", to: "1891-09-04" }] }),
      },
    },
  };
  const found = checkRoster(
    {
      ...changed("mould", { grounding: "record", wiki: "Late Body" }),
      ruler: { ...roster.ruler, name: "Kamil Pasha", wiki: "Kamil Pasha", office: "Grand Vizier" },
    },
    recorded,
  );
  expect(found.some((fail) => fail.check === "C4" && fail.row === "mould")).toBe(true);
  expect(found.some((fail) => fail.check === "C8" && fail.row === "ruler")).toBe(true);
});

// The Genghis build: the prompt named the man, the plan seated his chief minister.
test.each([
  ["Genghis Khan", "Prime Minister of Mongolia", "Luvsannamsrain Oyun-Erdene", ["P1"]],
  ["Genghis Khan", "Great Khan of Mongolia", "Genghis Khan", []],
  [null, "Prime Minister of Mongolia", "Luvsannamsrain Oyun-Erdene", []],
  ["Kublai", "Prime Minister of Mongolia", null, []],
])("prompt seat %p against seat %p held by %p", (promptSeat, office, holder, checks) => {
  const seated = { ...plan, prompt_seat: promptSeat, seat: { office, holder, holder_wiki: null } };
  expect(checkPlanSeat("Genghis Khan rules modern Mongolia", seated).map((fail) => fail.check)).toEqual(checks);
});

test.each([
  ["Frozen foods remain safe indefinitely", 2, true],
  ["“Frozen foods ... indefinitely”", 2, true],
  ["Frozen foods remain safe forever", 2, false],
  ["Frozen foods remain safe indefinitely", 9, false],
  ["...", 2, false],
])("quote %p in document %p is found: %p", (quote, doc, found) => {
  expect(quoted(quote, doc, docs)).toBe(found);
});

test.each([
  ["The Perkins Fresh Food Party", true],
  ["The Crisper Drawer", false],
  ["The FDA Expiry Date", true],
])("%p has a proper noun: %p", (name, proper) => {
  expect(hasProperNoun(name, new Set(["crisper", "drawer", "expiry", "date", "fresh", "food", "party"]))).toBe(proper);
});

test("fitting the desk moves the least important groups abroad out, and never the one above the seat", () => {
  const fitted = fitHolderCount(withAbroad(5));
  const counts = holderCounts(fitted);
  expect(counts.total).toBeLessThanOrEqual(10);
  expect(counts.abroad).toBeLessThanOrEqual(5);
  expect(fitted.groups.some((group) => group.id === "householder")).toBe(true);
  expect(fitted.excluded.filter((row) => row.why.startsWith("outside power"))).toHaveLength(2);
});

test("a repair patch replaces rows by id, takes out the rows it removes and can clear the fall", () => {
  const withFall = { ...roster, fall: { date: "0001-01-15", what: "Binned.", doc: null, quote: null } };
  const patched = applyRosterPatch(withFall, {
    groups: [{ ...pantry, name: "The Appert Tinned Goods" }],
    remove: ["botulinum"],
    excluded: [{ name: "The Clostridium Botulinum", why: "outside power" }],
    ruler: null,
    fall: null,
    fall_clear: true,
    chamber: null,
    chamber_clear: false,
  });
  expect(patched.groups.find((group) => group.id === "pantry")?.name).toBe("The Appert Tinned Goods");
  expect(patched.groups.some((group) => group.id === "botulinum")).toBe(false);
  expect(patched.fall).toBeNull();
  expect(patched.chamber).toEqual(roster.chamber);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test worker/gen/checks.test.ts`
Expected: FAIL, `Cannot find module './checks'`.

- [ ] **Step 3: Write the checks**

`worker/gen/checks.ts`:

```ts
// Code checks on the plan and the roster (lesson 11: code, not the model, catches the errors). Each failure names its
// check, its row and what to fix, in words the repair call reads. A blocking failure stops the build: the pack cannot
// be assembled around it.
import type { Gathered } from "./gather";
import { hasChamber, type Fail, type Plan, type Roster } from "./schemas";
import { compareDates } from "./wikidata";
import type { Doc } from "./wikipedia";

export type RosterContext = { plan: Plan; gathered: Gathered };

// Lesson 17 and the pack's own limit: at most 10 groups on the desk, the chamber included.
export const MAX_HOLDERS = 10;
export const MAX_HOME = 8;
export const MAX_ABROAD = 5;
export const MIN_HOLDERS = 3;

export const fold = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

// A quote passes when each piece between ellipses appears in the named document.
export function quoted(quote: string | null, doc: number | null, docs: Doc[]): boolean {
  const source = docs.find((candidate) => candidate.index === doc);
  if (!quote || !source) return false;
  const text = fold(source.text);
  const pieces = quote
    .split(/\.\.\.|…/)
    .map((piece) => fold(piece).replace(/^["']|["']$/g, "").trim())
    .filter((piece) => piece.length > 2);
  return pieces.length > 0 && pieces.every((piece) => text.includes(piece));
}

const SMALL_WORDS = new Set(["the", "of", "and", "de", "al", "el", "in", "for", "to", "on", "a", "an", "la", "le", "du", "von", "van"]);
// A Worker has no dictionary file (Decision 13), so the documents are the dictionary: a word they use in lower case is common.
export const lowerWordsOf = (docs: Doc[]): Set<string> =>
  new Set(docs.flatMap((doc) => doc.text.match(/\b[a-z][a-z']*\b/g) ?? []));
const isCommon = (word: string, lower: Set<string>) =>
  [word, word.replace(/s$/, ""), word.replace(/es$/, ""), word.replace(/ies$/, "y")].some((form) => lower.has(form));
export const hasProperNoun = (name: string, lower: Set<string>): boolean =>
  name
    .replace(/[(),'".]/g, " ")
    .split(/[\s-]+/)
    .some(
      (word) =>
        /^\p{Lu}/u.test(word) && !SMALL_WORDS.has(word.toLowerCase()) && !isCommon(word.toLowerCase(), lower),
    );

const GENERIC_NAME =
  /^(the )?(people|public|masses|street|garrison|caste|undergrounds|militias|army|military|nobles|nobility|clergy|merchants|peasants|workers|elders|court|palace|opposition|rebels|loyalists|moderates|radicals|hardliners|reformers|conservatives)$/i;
const JOB_WORD = /\b(guild|directorate|council|committee|caste)\b/i;
// The Brexit build named its public "Leave voters": one side of the divide, not the whole public.
const PUBLIC_CAMP = /\b(leave|remain|supporters|loyalists|camp|faction|wing|backers|opponents|partisans|voters)\b/i;
const CLOSED_KINDS = [1, 6, 7];

const bare = (value: string) =>
  fold(value)
    .replace(/\([^)]*\)/g, "")
    .replace(/^the /, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const covers = (group: { name: string; wiki?: string | null }, title: string) => {
  const target = bare(title);
  if (!target) return false;
  return [group.name, group.wiki ?? ""].some((name) => {
    const own = bare(name);
    return !!own && (own === target || own.includes(target) || target.includes(own));
  });
};

// How the roster fills the desk: one holder per group without seats, plus the chamber as one home holder.
export function holderCounts(roster: Roster) {
  const rows = roster.groups.filter((group) => group.seats === null);
  const chamber = hasChamber(roster) ? 1 : 0;
  const home = rows.filter((group) => group.sits === "home").length + chamber;
  const chamberVotes = roster.groups
    .filter((group) => group.seats !== null)
    .some((group) => group.vote_share > 0);
  return {
    total: rows.length + chamber,
    home,
    abroad: rows.length + chamber - home,
    voting: rows.filter((group) => group.vote_share > 0).length + (chamber && chamberVotes ? 1 : 0),
    court: rows.filter((group) => group.sits === "home" && group.kind === "actor").length,
  };
}

// Decision 8: the pledge rule holds for recorded and near-recorded kinds whose ruler is a documented person.
export const isGrounded = (plan: Plan, roster: Roster): boolean =>
  plan.kind <= 5 && !!roster.ruler.name && !!roster.ruler.wiki;

export function checkPlanSeat(prompt: string, plan: Plan): Fail[] {
  // A seat the prompt does not contain is the model's invention, not the player's words.
  if (!plan.prompt_seat || !fold(prompt).includes(fold(plan.prompt_seat))) return [];
  const words = (value: string) => fold(value).split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const named = words(plan.prompt_seat);
  const seat = new Set(words(`${plan.seat.office} ${plan.seat.holder ?? ""} ${plan.seat.holder_wiki ?? ""}`));
  if (!named.length || named.some((word) => seat.has(word))) return [];
  return [
    {
      check: "P1",
      row: "seat",
      message: `the prompt names "${plan.prompt_seat}" as the player's seat, but the plan seats ${plan.seat.office}${plan.seat.holder ? ` (${plan.seat.holder})` : ""}; the player holds exactly the seat the prompt names, as that person`,
    },
  ];
}

// One month after a date: a ruler whose start is a month before Wikidata's still counts (Cecil: 20 against 22 November 1558).
function monthLater(date: string): string {
  const negative = date.startsWith("-");
  const [year, month] = date.replace(/^-/, "").split("-").map(Number);
  if (!month) return date;
  const nextYear = month === 12 ? year + 1 : year;
  return `${negative ? "-" : ""}${nextYear}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}`;
}

export function checkRoster(roster: Roster, context: RosterContext): Fail[] {
  const { plan, gathered } = context;
  const kind = plan.kind;
  const start = plan.start_date;
  const fails: Fail[] = [];
  const fail = (check: string, row: string, message: string, extra: Partial<Fail> = {}) =>
    fails.push({ check, row, message, ...extra });
  const ids = new Set(roster.groups.map((group) => group.id));
  const factsOf = (wiki: string | null) => {
    const qid = wiki ? gathered.qids[wiki] : null;
    return qid ? gathered.facts[qid] : undefined;
  };
  const lower = lowerWordsOf(gathered.docs);
  const homeQids = new Set(gathered.homeQids);
  const seen = new Set<string>();

  for (const group of roster.groups) {
    if (seen.has(group.id)) fail("C12", group.id, "duplicate id");
    seen.add(group.id);
    // C1: quotes are copied word for word from the named document.
    if (group.grounding !== "premise" && group.grounding !== "divergent" && !quoted(group.quote, group.doc, gathered.docs))
      fail("C1", group.id, `quote not found word for word in document ${group.doc}: ${JSON.stringify(group.quote)}`, {
        docs: group.doc ? [group.doc] : [],
      });
    if (group.seats !== null && [1, 3].includes(kind) && !quoted(group.seats_quote, group.seats_doc, gathered.docs))
      fail("C1", group.id, `seats quote not found in document ${group.seats_doc}: ${JSON.stringify(group.seats_quote)}`, {
        docs: group.seats_doc ? [group.seats_doc] : [],
      });
    // C2: closed worlds are record or canon.
    if (CLOSED_KINDS.includes(kind) && !["record", "canon"].includes(group.grounding))
      fail("C2", group.id, `closed world (kind ${kind}): grounding must be record or canon, not ${group.grounding}`);
    if ([2, 3, 5].includes(kind) && !["record", "canon", "divergent"].includes(group.grounding))
      fail("C2", group.id, `grounding ${group.grounding} is not allowed in kind ${kind}: record, or divergent with descends_from`);
    if (kind === 4 && !["record", "premise"].includes(group.grounding))
      fail("C2", group.id, "kind 4: record, or premise for the fantastic element's own groups");
    // C3: an invented group in an open world is tied to an analogue and carries a proper noun of the world.
    if (kind >= 8 && !["record", "canon"].includes(group.grounding)) {
      if (!["analogue", "biology", "anthropology", "premise"].includes(group.grounding))
        fail("C3", group.id, "open world: an invented group's grounding is analogue, biology, anthropology or premise");
      if (!hasProperNoun(group.name, lower))
        fail("C3", group.id, `name "${group.name}" has no proper noun from the world (a founder, place, document or ship)`);
    }
    // C4: Wikidata's dates win over the model's.
    const facts = factsOf(group.wiki);
    const founded = facts?.founded ?? group.founded;
    const dissolved = facts?.dissolved ?? group.dissolved;
    const at = kind === 2 && plan.divergence ? plan.divergence : start;
    if ([1, 2, 3, 4].includes(kind) && group.grounding === "record") {
      if (founded && compareDates(founded, at) > 0)
        fail("C4", group.id, `founded ${founded}${facts?.founded ? " (Wikidata)" : ""} after ${at}`);
      // A quoted line dated in the start year outweighs a Wikidata dissolution (the Ottoman Senate, recalled in 1908).
      const year = at.replace(/^(-?\d+).*/, "$1");
      const datedQuote = !!group.quote && group.quote.includes(year) && quoted(group.quote, group.doc, gathered.docs);
      if (kind !== 2 && dissolved && compareDates(dissolved, at) < 0 && !datedQuote)
        fail("C4", group.id, `dissolved ${dissolved}${facts?.dissolved ? " (Wikidata)" : ""} before ${at}; fix the row, or quote a line dated ${year} that shows it active`);
    }
    // C7: only P1001 (applies to jurisdiction) decides; P17 and the seat's country carry modern and ancient states.
    if ([1, 2, 3, 4, 5].includes(kind) && facts && homeQids.size && group.sits === "home" && facts.jurisdiction.length && !facts.jurisdiction.some((qid) => homeQids.has(qid)))
      fail("C7", group.id, `sits home, but Wikidata gives its jurisdiction as ${facts.places.filter((place) => facts.jurisdiction.some((qid) => place.startsWith(`${qid}:`))).join(", ")}`);
    if ([8, 9, 13].includes(kind) && group.type === "foreign" && group.sits !== "abroad")
      fail("C7", group.id, "a sponsor or foreign power sits abroad");
    // C9: a divergent group descends from a sourced one.
    if (group.grounding === "divergent") {
      const from = group.descends_from;
      const parent = roster.groups.find((other) => other.id === from || (from && covers(other, from)));
      const sourced = !!from && gathered.docs.some((doc) => covers({ name: doc.title }, from));
      if (!sourced && (!parent || !["record", "canon"].includes(parent.grounding)))
        fail("C9", group.id, `descends_from ${JSON.stringify(from)} is neither a sourced group in the roster nor a fetched page`);
    }
    // C10, C11: names.
    const recorded = ["record", "canon"].includes(group.grounding) && !!group.wiki;
    if (GENERIC_NAME.test(group.name.trim()) || (JOB_WORD.test(group.name) && !hasProperNoun(group.name, lower) && !recorded))
      fail("C10", group.id, `generic name "${group.name}"`);
    if ([11, 12].includes(kind) && /\b(party|parliament|election|senate)\b/i.test(group.name))
      fail("C11", group.id, `era word in "${group.name}"`);
    // C12: links.
    if (!group.wants.trim()) fail("C12", group.id, "no wants");
    if (!ids.has(group.rival) || group.rival === group.id)
      fail("C12", group.id, `rival ${JSON.stringify(group.rival)} is not another group id`);
  }

  // C5: every active combatant and swept group is a row or excluded for a reason that is not its dates.
  if ([1, 2, 3, 4].includes(kind))
    for (const title of gathered.checklist) {
      const excluded = roster.excluded.find((row) => covers({ name: row.name }, title));
      const span = gathered.spans[title];
      if (!roster.groups.some((group) => covers(group, title)) && !excluded)
        fail("C5", title, `"${title}" (a combatant or category member active on the date) is neither a group nor excluded with a reason`);
      else if (excluded && span && compareDates(span[0], start) <= 0 && compareDates(span[1], start) >= 0 && /not active|inactive|defunct|dissolved|disbanded|ended|no longer|revolt-era|not yet|dormant|lapsed/i.test(excluded.why))
        fail("C5", title, `excluded as "${excluded.why}", but its dates (${span[0]} to ${span[1]}) cover ${start}; make it a group, or exclude it for a reason other than dates`);
    }

  // C6 and C12: the chamber's seats.
  const seatRows = roster.groups.filter((group) => group.seats !== null);
  if (roster.chamber) {
    const sum = seatRows.reduce((total, group) => total + (group.seats ?? 0), 0);
    // Sources' own splits may not add up (the 1908 Chamber's ethnic counts sum to 288 of 275): recorded kinds get 10%.
    const recordedKind = [1, 3].includes(kind);
    const allowed = recordedKind ? Math.floor(roster.chamber.real_size * 0.1) : 0;
    if (Math.abs(sum - roster.chamber.real_size) > allowed)
      fail(recordedKind ? "C6" : "C12", "chamber", `seats sum to ${sum}, chamber real_size is ${roster.chamber.real_size}${allowed ? ` (allowed within ${allowed})` : ""}`);
    if (recordedKind && compareDates(roster.chamber.as_of, plan.term_end) > 0)
      fail("C6", "chamber", `composition as_of ${roster.chamber.as_of} is after the term ends ${plan.term_end}`);
    if (recordedKind && !quoted(roster.chamber.quote, roster.chamber.doc, gathered.docs))
      fail("C1", "chamber", `chamber quote not found in document ${roster.chamber.doc}`, {
        docs: roster.chamber.doc ? [roster.chamber.doc] : [],
      });
    if (!seatRows.length) fail("C12", "chamber", "a chamber exists but no group has seats");
  } else if (seatRows.length) fail("C12", "chamber", "groups have seats but chamber is null");

  // C8: the ruler holds the seat on the start date, by Wikidata.
  const diverged = kind === 2 && !!plan.divergence && compareDates(start, plan.divergence) > 0;
  if ([1, 2, 3, 4].includes(kind) && roster.ruler.name && !diverged) {
    const facts = factsOf(roster.ruler.wiki);
    if (!facts) fail("C8", "ruler", `no Wikidata record for the ruler's wiki title ${JSON.stringify(roster.ruler.wiki)}`);
    else {
      if (facts.died && compareDates(facts.died, start) < 0) fail("C8", "ruler", `${facts.label} died ${facts.died}, before ${start}`);
      // Only offices that share a word with the seat count: Johnson's seat in the 57th Parliament is not his premiership.
      const words = (value: string) =>
        new Set(fold(value).split(/[^a-z]+/).filter((word) => word.length > 3 && !["united", "kingdom", "empire", "state", "states"].includes(word)));
      const seat = words(roster.ruler.office);
      const mine = facts.positions.filter((position) => [...words(position.position)].some((word) => seat.has(word)));
      const held = mine.filter(
        (position) => position.from && compareDates(position.from, monthLater(start)) <= 0 && (!position.to || compareDates(position.to, start) >= 0),
      );
      if (mine.some((position) => position.from) && !held.length)
        fail("C8", "ruler", `Wikidata shows the seat not held on ${start}: ${mine.map((position) => `${position.position} ${position.from}..${position.to}`).join("; ")}`);
      const falls = held.filter((position) => position.to && compareDates(position.to, plan.term_end) < 0);
      if (falls.length && !roster.fall)
        fail("C8", "fall", `Wikidata ends ${falls[0].position} on ${falls[0].to}, inside the term (to ${plan.term_end}); set fall`);
    }
  }

  // C12: the ruler's links.
  if (roster.ruler.above && !ids.has(roster.ruler.above))
    fail("C12", "ruler", `ruler.above ${roster.ruler.above} is not a group id`);
  const own = roster.groups.find((group) => group.id === roster.ruler.own_group);
  if (!own || own.kind === "public")
    fail("C12", "ruler", `own_group ${JSON.stringify(roster.ruler.own_group)} must be the id of the player's own side, never the public`, { blocking: true });
  if (roster.ruler.backer !== null) {
    const backer = roster.groups.find((group) => group.id === roster.ruler.backer);
    if (!backer || backer.seats !== null || backer.sits !== "home" || backer.kind === "public")
      fail("C12", "ruler", `backer ${JSON.stringify(roster.ruler.backer)} must be a home group without seats, or null`);
  }

  // C13: support judged per group (lesson 15).
  const unseated = roster.groups.filter((group) => group.seats === null);
  for (const group of unseated)
    if (group.support < 30 || group.support > 70) fail("C13", group.id, `support ${group.support} is outside 30 to 70`);
  const bySupport = new Map<number, string[]>();
  for (const group of unseated) bySupport.set(group.support, [...(bySupport.get(group.support) ?? []), group.id]);
  for (const [value, sharing] of bySupport)
    if (sharing.length > 2)
      fail("C13", sharing.join(","), `${sharing.length} groups share support ${value}; at most 2 may, so judge each one for this ruler at this date`);
  const values = unseated.map((group) => group.support);
  if (values.length && Math.max(...values) - Math.min(...values) < 25)
    fail("C13", "support", `support spans ${Math.max(...values) - Math.min(...values)} points; it must span at least 25`);

  // C14: actors and one public group, which is the whole public (lesson 14).
  const publicIds = roster.groups.filter((group) => group.kind === "public").map((group) => group.id);
  if (publicIds.length !== 1)
    fail("C14", publicIds.join(",") || "public", `${publicIds.length} public groups; exactly one group stands for the people at large`, { blocking: true });
  for (const group of roster.groups) {
    if ((group.name.match(/ and /g)?.length ?? 0) + (group.name.match(/, /g)?.length ?? 0) >= 2)
      fail("C14", group.id, `"${group.name}" joins 3 or more bodies; merge only bodies under one command, at most two names`);
    if (group.kind === "public" && PUBLIC_CAMP.test(group.name))
      fail("C14", group.id, `the public group "${group.name}" reads as one side; name the whole population as the period would ("the people of Palestine", "the British public")`);
  }

  // C15: the desk's counts (lesson 17; W9 moved here, since a world repair cannot fix them).
  const counts = holderCounts(roster);
  const tooMany = "merge bodies under one command, or remove the least important group and add it to excluded as an outside power";
  if (counts.total > MAX_HOLDERS)
    fail("C15", "groups", `${counts.total} groups would sit on the desk (the chamber counts as one); at most ${MAX_HOLDERS}: ${tooMany}`, { blocking: true });
  if (counts.home > MAX_HOME) fail("C15", "groups", `${counts.home} groups sit at home (the chamber counts as one); at most ${MAX_HOME}: ${tooMany}`);
  if (counts.abroad > MAX_ABROAD) fail("C15", "groups", `${counts.abroad} groups sit abroad; at most ${MAX_ABROAD}: ${tooMany}`);
  if (counts.abroad < 1) fail("C15", "groups", "no group sits abroad; add the foreign power, sponsor or neighbour that matters most");
  if (counts.total < MIN_HOLDERS)
    fail("C15", "groups", `${counts.total} groups on the desk; at least ${MIN_HOLDERS}`, { blocking: true });
  if (counts.voting < 2)
    fail("C15", "groups", "fewer than two groups vote in the final test; give vote_share to the groups that decide whether the player stays");
  if (!hasChamber(roster) && counts.court < 2)
    fail("C15", "groups", "no chamber votes, so the court is the home groups that act; at least two are needed", { blocking: true });
  // The pack holds 2 to 12 factions.
  if (hasChamber(roster) && (seatRows.length < 2 || seatRows.length > 12))
    fail("C15", "chamber", `${seatRows.length} chamber blocs; write 2 to 12 (split one label by the lines deputies voted on, or merge the smallest)`, { blocking: true });
  return fails;
}

// The last word on counts after the repair: move the least important groups out as outside powers, never the one above
// the seat, the backer, the player's own side, the public, or a group with a veto or the power to dismiss.
export function fitHolderCount(roster: Roster): Roster {
  const kept = new Set([roster.ruler.above, roster.ruler.backer, roster.ruler.own_group].filter(Boolean));
  let fitted = roster;
  for (;;) {
    const counts = holderCounts(fitted);
    const side =
      counts.abroad > MAX_ABROAD
        ? "abroad"
        : counts.home > MAX_HOME
          ? "home"
          : counts.total > MAX_HOLDERS
            ? counts.abroad > 1
              ? "abroad"
              : "home"
            : null;
    if (!side) return fitted;
    const movable = fitted.groups
      .map((group, order) => ({ group, order }))
      .filter(
        ({ group }) =>
          group.seats === null && group.sits === side && group.kind === "actor" && !kept.has(group.id) && !group.veto && !group.can_dismiss,
      )
      // The lowest vote goes first; on a tie, the later row, since the roster lists the groups that matter first.
      .sort((a, b) => a.group.vote_share - b.group.vote_share || b.order - a.order);
    const out = movable[0]?.group;
    if (!out) return fitted;
    fitted = {
      ...fitted,
      groups: fitted.groups.filter((group) => group.id !== out.id),
      excluded: [...fitted.excluded, { name: out.name, why: "outside power: the desk holds at most 10 groups" }],
    };
  }
}
```

- [ ] **Step 4: Write the roster stage**

`worker/gen/roster.ts`:

```ts
// The roster stage of generation v2: the research plan (held to the seat the prompt names), the roster of groups with
// evidence, and one repair round that reads each failing row's own page (lesson 10), then the desk's count fitted.
import { checkPlanSeat, checkRoster, fitHolderCount, fold, type RosterContext } from "./checks";
import { docBlock, type Gathered } from "./gather";
import type { Caller } from "./openrouter";
import {
  PlanSchema,
  RosterPatchSchema,
  RosterSchema,
  type Fail,
  type Plan,
  type Roster,
  type RosterPatch,
} from "./schemas";
import { qidsOf, wikidataFacts } from "./wikidata";
import { fetchPage } from "./wikipedia";
import { PLAN_SYSTEM, ROSTER_SYSTEM } from "./writing";

const REPAIR_DOC_CHARACTERS = 90000;

export async function writePlan(call: Caller, prompt: string, today: string): Promise<Plan> {
  const user = `Prompt: ${prompt}\nToday is ${today}.`;
  const plan = await call({ name: "plan", schema: PlanSchema, system: PLAN_SYSTEM, user, maxTokens: 8000, strict: true });
  const fails = checkPlanSeat(prompt, plan);
  if (!fails.length) return plan;
  // A new prompt with the broken rule in it, not a resend of the same one.
  return call({
    name: "plan-seat",
    schema: PlanSchema,
    system: PLAN_SYSTEM,
    user: `${user}\n\nAn earlier plan broke this rule: ${fails.map((fail) => fail.message).join(" ")}. Return the whole plan again with the seat fixed.`,
    maxTokens: 8000,
    strict: true,
  });
}

// QIDs and facts for the wiki titles the roster names that the gather step did not already look up.
export async function resolveRoster(roster: Roster, gathered: Gathered): Promise<Gathered> {
  const titles = [...roster.groups.map((group) => group.wiki), roster.ruler.wiki].filter(
    (title): title is string => !!title && !(title in gathered.qids),
  );
  if (!titles.length) return gathered;
  const qids = { ...gathered.qids };
  for (const [title, found] of await qidsOf(titles)) qids[title] = found.qid;
  const needed = titles.map((title) => qids[title]).filter((qid): qid is string => !!qid && !(qid in gathered.facts));
  const facts = { ...gathered.facts };
  for (const [qid, fact] of await wikidataFacts(needed)) facts[qid] = fact;
  return { ...gathered, qids, facts };
}

export async function writeRoster(
  call: Caller,
  prompt: string,
  plan: Plan,
  gathered: Gathered,
): Promise<{ roster: Roster; gathered: Gathered }> {
  const above = plan.above.map((row) => `${row.name} (${row.power})`).join("; ") || "nobody";
  const task = `<task>
Prompt: ${prompt}
Kind: ${plan.kind}. Seat: ${plan.seat.office}${plan.seat.holder ? `, held by ${plan.seat.holder}` : ""}. Start date: ${plan.start_date}. Term: 20 turns of ${plan.turn_length}, to ${plan.term_end}.${plan.divergence ? ` Divergence: ${plan.divergence}.` : ""}
Above the seat: ${above}.
Grounding: ${plan.grounding_line}
Checklist (each must be a group row or in excluded with a reason): ${gathered.checklist.join(" | ") || "none"}
Write the roster.
</task>`;
  const roster = await call({
    name: "roster",
    schema: RosterSchema,
    system: ROSTER_SYSTEM,
    user: `${docBlock(gathered.docs)}\n\n<wikidata>\n${gathered.wikidataTable}\n</wikidata>\n\n${task}`,
    maxTokens: 32000,
    strict: true,
  });
  return { roster, gathered: await resolveRoster(roster, gathered) };
}

export function applyRosterPatch(roster: Roster, patch: RosterPatch): Roster {
  const byId = new Map(roster.groups.map((group) => [group.id, group]));
  for (const group of patch.groups) byId.set(group.id, group);
  for (const id of patch.remove) byId.delete(id);
  return {
    ...roster,
    groups: [...byId.values()],
    excluded: [...roster.excluded, ...patch.excluded],
    ruler: patch.ruler ?? roster.ruler,
    fall: patch.fall_clear ? null : (patch.fall ?? roster.fall),
    chamber: patch.chamber_clear ? null : (patch.chamber ?? roster.chamber),
  };
}

// One repair call with only the failing rows and the documents they need, never the draft prose.
export async function repairRoster(
  call: Caller,
  roster: Roster,
  fails: Fail[],
  context: RosterContext,
): Promise<{ roster: Roster; gathered: Gathered }> {
  const rows = new Set(fails.map((fail) => fail.row));
  const failing = roster.groups.filter((group) => rows.has(group.id));
  const needed = new Set<number>(fails.flatMap((fail) => fail.docs ?? []));
  const docs = [...context.gathered.docs];
  const have = new Set(docs.map((doc) => doc.title));
  for (const group of failing.filter((group) => group.wiki && !have.has(group.wiki))) {
    const page = await fetchPage("en.wikipedia.org", group.wiki!, [], 5000).catch(() => null);
    if (page && !have.has(page.title)) {
      have.add(page.title);
      docs.push({ ...page, index: docs.length + 1 });
      needed.add(docs.length);
    }
  }
  for (const group of failing) if (group.doc) needed.add(group.doc);
  const names = [
    ...fails.filter((fail) => fail.check === "C5" || fail.check === "C1").map((fail) => fail.row),
    ...failing.map((group) => group.name),
  ].map((name) => fold(name.replace(/\s*\(.*\)$/, "")));
  for (const doc of docs) {
    const text = fold(doc.text);
    if (names.some((name) => text.includes(name))) needed.add(doc.index);
  }
  let shown = docs.filter((doc) => needed.has(doc.index));
  if (shown.reduce((total, doc) => total + doc.text.length, 0) > REPAIR_DOC_CHARACTERS) shown = shown.slice(0, 7);
  const plan = context.plan;
  const user = `${docBlock(shown)}

<roster_ids>${roster.groups.map((group) => `${group.id} (${group.name})`).join("; ")}</roster_ids>
<failing_rows>${JSON.stringify({
    groups: failing,
    ruler: rows.has("ruler") ? roster.ruler : undefined,
    fall: rows.has("fall") ? roster.fall : undefined,
    chamber: rows.has("chamber") ? roster.chamber : undefined,
  })}</failing_rows>
<failures>
${fails.map((fail) => `- ${fail.check} ${fail.row}: ${fail.message}`).join("\n")}
</failures>
<task>
Code checks found the failures above in a roster for: ${plan.start_date}, kind ${plan.kind}, seat ${plan.seat.office}.
Fix each one from the documents. Copy quotes exactly from the document you name. A checklist name goes in groups when it mattered on the date, or in excluded with a short reason.
Fix a failing row by correcting its fields; never drop a group to pass a check, except for C15: there, merge bodies under one command, or list the least important group in remove and add it to excluded with the reason "outside power". Return a patch: groups holds only the rows you change or add (whole rows, same ids for changed rows), remove the ids to take out, excluded the rows to add. Set ruler, fall or chamber only when you change them, else null; fall_clear or chamber_clear true to set them to null.
</task>`;
  const patch = await call({
    name: "roster-repair",
    schema: RosterPatchSchema,
    system: ROSTER_SYSTEM,
    user,
    maxTokens: 24000,
    strict: true,
  });
  return { roster: applyRosterPatch(roster, patch), gathered: { ...context.gathered, docs } };
}

// Check, one repair when anything fails, then fit the desk's count; the build stops on a blocking failure left after.
export async function settleRoster(
  call: Caller,
  roster: Roster,
  context: RosterContext,
): Promise<{ roster: Roster; gathered: Gathered; before: Fail[]; after: Fail[] }> {
  const before = checkRoster(roster, context);
  let settled = roster;
  let gathered = context.gathered;
  if (before.length) {
    ({ roster: settled, gathered } = await repairRoster(call, roster, before, context));
    gathered = await resolveRoster(settled, gathered);
  }
  settled = fitHolderCount(settled);
  return { roster: settled, gathered, before, after: checkRoster(settled, { plan: context.plan, gathered }) };
}
```

- [ ] **Step 5: Run the test**

Run: `bun test worker/gen/checks.test.ts`
Expected: PASS, 29 tests. If "the fridge roster passes every check" fails, print the failures: a failure on the fixture's own data means a fixture row is wrong (fix the row in `fridge-roster.json` and say so in the report); a failure caused by the check's logic means the port is wrong.

- [ ] **Step 6: Run the gates and commit**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green.

```bash
git add worker/gen/checks.ts worker/gen/roster.ts worker/gen/checks.test.ts
git commit -m "Generation v2 roster stage: the plan holds the seat the prompt names, checks C1 to C15, one repair that reads the failing rows' pages"
```

---

### Task 4: The world stage: bible, parallel parts, part checks and repair, merge, lint

**Files:**
- Create: `worker/gen/world.ts`, `worker/gen/lint.ts`
- Test: `worker/gen/world.test.ts`, `worker/gen/lint.test.ts`

**Interfaces:**
- Consumes: `OPUS`, `GROK`, `ModelStop`, `type Caller`, `type CallRequest` (Task 1); `BibleSchema`, `PartSchemas`, `RewriteSchema`, `VocabularySchema`, `factionIds`, `toGlance`, `type Bible`, `type Fail`, `type FactionRow`, `type GroupRow`, `type PartKind`, `type Parts`, `type Plan`, `type Roster`, `type World` (Task 1); `WORLD_SYSTEM`, `REWRITE_SYSTEM` (Task 1); `docBlock`, `type Gathered` (Task 2); `fold`, `quoted`, `isGrounded` (Task 3).
- Produces:
  - `worker/gen/world.ts`: `CHUNK = 4`, `type Job = { name: string; kind: PartKind; ids: string[] | null }`, `type WorldContext = { prefix; roster; bible; model; plan; gathered }`, `worldCall(call, request): Promise<{ data; model }>`, `worldPrefix(prompt, plan, roster, gathered): string`, `writeBible(call, prefix, earlier?): Promise<{ bible: Bible; model: string }>`, `checkBible(bible, roster): Fail[]`, `planJobs(roster): Job[]`, `jobTask(job, roster, bible, grounded?): string`, `runJob(call, job, context, earlier?): Promise<unknown>`, `checkPart(job, part, context): Fail[]`, `mergeWorld(roster, bible, parts, jobs): World`.
  - `worker/gen/lint.ts`: `type LintIssue = { path; text; issues: string[] }`, `strings(value)`, `lint(world): LintIssue[]`, `straighten(value)`, `setPath(object, path, text)`, `rewriteWorld(call, world, model): Promise<{ world: World; before: LintIssue[]; after: LintIssue[] }>`.

Part names: `groups1`, `groups2`, ... (chunks of 4 roster groups without seats), `chamber` (the first 4 chamber blocs plus the chamber's name, shape, threshold and tie), `factions2`, ... (the other blocs), then `briefing`, `ledgers`, `instruments`, `systems`, `theme`. Checks: `B1` bible, `W2` a row the part owns is missing, `W5` a veto no act lists, `W6` pledges and problems, `W7` a card that breaks R36, `W10` the grounded pledge rule, `W11` the systems part's counts.

- [ ] **Step 1: Write the failing tests**

`worker/gen/world.test.ts`:

```ts
import { expect, test } from "bun:test";
import { z } from "zod";
import { ESCALATION_KEYS, VERBS } from "../pack";
import fixture from "./fixtures/fridge-roster.json";
import { GROK, ModelStop, OPUS, type Caller, type CallRequest } from "./openrouter";
import { VocabularySchema, type Bible, type FactionRow, type GroupRow, type Plan, type Roster } from "./schemas";
import { checkBible, checkPart, mergeWorld, planJobs, worldCall, type Job, type WorldContext } from "./world";

const plan = fixture.plan as Plan;
const roster = fixture.roster as Roster;
const card = { wants: ["Cold shelves"], hates: [{ tag: "Warm nights", red_line: true }], strike: "Stops voting with you." };
const groupRow = (id: string, icon: GroupRow["icon"] = "council"): GroupRow => ({
  id,
  icon,
  color: "#224466",
  line: 30,
  response: "strike",
  ...card,
});
const factionRow = (id: string): FactionRow => ({ id, color: "#663322", with_you: false, ...card });
const bible = {
  vocabulary: Object.fromEntries(Object.keys(VocabularySchema.shape).map((key) => [key, key === "abroad" ? null : "word"])),
  terms: [],
  groups: roster.groups.map((group) => ({
    id: group.id,
    name: group.name,
    short: group.name.slice(0, 16),
    identity: group.wants,
    face: "A voice",
    face_role: "speaker, an invented voice",
  })),
  regions: ["top", "middle", "bottom", "door", "crisper", "freezer"].map((id) => ({ id, name: `The ${id} shelf` })),
} as unknown as Bible;
const context: WorldContext = {
  prefix: "",
  roster,
  bible,
  model: OPUS,
  plan,
  gathered: { docs: [], qids: {}, facts: {}, homeQids: [], spans: {}, checklist: [], wikidataTable: "", sweepCategories: [] },
};
const job = (name: string): Job => planJobs(roster).find((candidate) => candidate.name === name)!;

test("the parts are chunks of four groups and blocs, then one call per other part", () => {
  expect(planJobs(roster).map((part) => [part.name, part.ids?.length ?? 0])).toEqual([
    ["groups1", 4],
    ["groups2", 2],
    ["chamber", 4],
    ["factions2", 1],
    ["briefing", 0],
    ["ledgers", 0],
    ["instruments", 0],
    ["systems", 0],
    ["theme", 0],
  ]);
  expect(planJobs({ ...roster, chamber: null }).some((part) => part.kind === "chamber")).toBe(false);
});

// Lesson 25: a chunk wrote all 8 factions instead of its 4.
test.each([
  ["the owner's row wins over a row another chunk wrote", [groupRow("pantry", "army")], [groupRow("pantry", "foreign")], "foreign"],
  ["a row only another chunk wrote fills the gap", [groupRow("pantry", "army")], [], "army"],
])("%s", (_label, strayRows, ownRows, icon) => {
  const parts = {
    groups1: { groups: [...["householder", "expiry", "mould", "botulinum"].map((id) => groupRow(id)), ...strayRows] },
    groups2: { groups: ownRows },
    chamber: {
      chamber: { name: "Parliament", shape: "hemicycle", threshold: 31, tie: null, factions: ["freshfood", "crisper", "freezer", "door"].map(factionRow) },
    },
    factions2: { factions: [] },
    briefing: {},
    ledgers: { ledgers: {} },
    instruments: { instruments: {} },
    systems: {},
    theme: { theme: null },
  };
  const world = mergeWorld(roster, bible, parts, planJobs(roster));
  expect(world.groups.map((row) => row.id)).toEqual(["householder", "expiry", "mould", "botulinum", "pantry"]);
  expect(world.groups.find((row) => row.id === "pantry")?.icon).toBe(icon);
  expect(world.chamber?.factions.map((row) => row.id)).toEqual(["freshfood", "crisper", "freezer", "door"]);
});

const pledges = (count: number, change: Partial<{ for: string; tag: string }> = {}) =>
  Array.from({ length: count }, (_, i) => ({ text: `Pledge ${i}`, tag: `pledge-${i}`, for: "public", quote: null, doc: null, ...change }));
const briefing = (change: Record<string, unknown> = {}) => ({
  ruler: { role: "Prime Minister", removed_by: "The hand can bin you." },
  briefing: { situation: "The shop is in.", room: "The hand decides.", you: "You hold the shelf." },
  problems: Array.from({ length: 8 }, (_, i) => `Problem ${i}.`),
  pledges: pledges(8),
  ...change,
});
const instruments = (vetoes: string[]) => ({
  instruments: Object.fromEntries(VERBS.map((verb) => [verb, { name: verb, available: true, vetoes: verb === "decree" ? vetoes : [] }])),
});
const systems = (change: Record<string, unknown> = {}) => ({
  tags: Array.from({ length: 16 }, (_, i) => `policy-${i}`),
  blocs: Array.from({ length: 5 }, (_, i) => ({ id: `bloc${i}`, name: `Bloc ${i}`, description: "Eggs." })),
  patrons: Array.from({ length: 10 }, (_, i) => ({ id: `patron${i}`, name: `Patron ${i}`, wants: ["policy-1"], hates: ["policy-2"] })),
  regions: bible.regions.map((region) => ({ id: region.id, weight: 1, lean: [{ faction: "freshfood", value: 0.2 }] })),
  test: { name: "the clear-out", win: "You stay.", lose: "You go.", reveal: "both" },
  endings: { reelected: "Kept", defeated: "Binned", lame_duck: "Wilted", impeached: "Out", coup: null, stopped: null, dismissed: null },
  lobby: { pork: { label: "A", text: "A." }, favor: { label: "B", text: "B." }, threat: { label: "C", text: "C." } },
  escalations: ESCALATION_KEYS.map((key) => ({ key, name: key, headline: `${key}.` })),
  ...change,
});

test.each([
  ["a chunk that misses one of its rows", "groups2", { groups: [groupRow("pantry")] }, ["W2"]],
  [
    "a card with two red lines",
    "groups2",
    { groups: [groupRow("pantry"), { ...groupRow("public"), hates: [{ tag: "A", red_line: true }, { tag: "B", red_line: true }] }] },
    ["W7"],
  ],
  ["a clean chunk", "groups2", { groups: [groupRow("pantry"), groupRow("public")] }, []],
  ["seven pledges", "briefing", briefing({ pledges: pledges(7) }), ["W6"]],
  ["a pledge for nobody", "briefing", briefing({ pledges: [...pledges(7), ...pledges(1, { for: "nobody", tag: "odd" })] }), ["W6"]],
  ["a pledge to the own party in the chamber", "briefing", briefing({ pledges: [...pledges(7), ...pledges(1, { for: "freshfood", tag: "own" })] }), []],
  ["a veto no act lists", "instruments", instruments([]), ["W5"]],
  ["every veto listed", "instruments", instruments(["householder"]), []],
  ["nine patrons", "systems", systems({ patrons: systems().patrons.slice(0, 9) }), ["W11"]],
  ["a missing escalation", "systems", systems({ escalations: systems().escalations.slice(1) }), ["W11"]],
  ["a region with no weight", "systems", systems({ regions: systems().regions.slice(1) }), ["W11"]],
  ["a clean systems part", "systems", systems(), []],
])("%s", (_label, name, part, checks) => {
  expect(checkPart(job(name), part, context).map((fail) => fail.check)).toEqual(checks);
});

test("a grounded world needs 4 of 8 pledges quoted word for word from the documents", () => {
  const promises = ["to open the Chamber", "to free the press", "to pay the army", "to end the censor"];
  const grounded: WorldContext = {
    ...context,
    plan: { ...plan, kind: 1 },
    roster: { ...roster, ruler: { ...roster.ruler, name: "Kamil Pasha", wiki: "Kamil Pasha" } },
    gathered: {
      ...context.gathered,
      docs: [{ index: 1, source: "Wikipedia: Programme", title: "Programme", text: `He promised ${promises.join(", ")}.` }],
    },
  };
  const quotedPledges = (count: number) =>
    pledges(8).map((pledge, i) => (i < count ? { ...pledge, quote: promises[i], doc: 1 } : pledge));
  expect(checkPart(job("briefing"), briefing({ pledges: quotedPledges(3) }), grounded).map((fail) => fail.check)).toEqual(["W10"]);
  expect(checkPart(job("briefing"), briefing({ pledges: quotedPledges(4) }), grounded)).toEqual([]);
});

test.each([
  ["a bible with five regions", { ...bible, regions: bible.regions.slice(1) }],
  ["a bible missing a group", { ...bible, groups: bible.groups.slice(1) }],
])("%s fails B1", (_label, broken) => {
  expect(checkBible(broken as Bible, roster).map((fail) => fail.check)).toContain("B1");
});

// Lesson 6: Opus refuses some premises outright; a filtered world call goes once to Grok, a length stop does not.
test.each([
  ["content_filter", [OPUS, GROK], GROK],
  ["length", [OPUS], null],
])("a %s stop on Opus calls %p and answers from %p", async (reason, models, answeredBy) => {
  const seen: string[] = [];
  const call = (async (request: CallRequest<unknown>) => {
    seen.push(request.model!);
    if (request.model !== GROK) throw new ModelStop(reason as "length", "stopped");
    return { ok: true };
  }) as unknown as Caller;
  const result = await worldCall(call, { name: "bible", schema: z.object({ ok: z.boolean() }), system: "", user: "", maxTokens: 1 }).catch(() => null);
  expect(seen).toEqual(models);
  expect(result?.model ?? null).toBe(answeredBy);
});
```

`worker/gen/lint.test.ts`:

```ts
import { expect, test } from "bun:test";
import { lint, rewriteWorld, setPath } from "./lint";
import type { Caller } from "./openrouter";
import type { World } from "./schemas";

const world = () =>
  ({
    bible: {
      house_voice: "Hansard of the Fridge",
      terms: [{ term: "The Haganah", meaning: "The Agency's force.", aliases: ["Hebrew Rebellion Movement"] }],
      groups: [{ id: "a", short: "Shelf", identity: "They keep the shelves." }],
      history: [],
      vocabulary: { file: "Shelf record", abroad: "beyond the door" },
    },
    groups: [{ id: "a", strike: "Stops voting with you." }],
    chamber: null,
    briefing: {
      ruler: { role: "Prime Minister", removed_by: "The hand can bin you." },
      briefing: { situation: "The shop is in.", room: "The hand decides.", you: "You hold the shelf." },
      problems: ["The milk turns."],
      pledges: [{ text: "Keep the door shut", tag: "door", for: "public", quote: "a pivotal moment", doc: 1 }],
    },
    ledgers: {},
    instruments: {},
    systems: { test: { win: "You stay.", lose: "You go." }, escalations: [], blocs: [] },
    theme: null,
  }) as unknown as World;

test.each([
  ["briefing.briefing.situation", "The vote was pivotal.", "inflated"],
  ["briefing.problems[0]", "The army is restless \u2014 and hungry.", "dash"],
  ["groups[0].strike", "Raises the holder's price.", "holder"],
  ["bible.groups[0].short", "The Committee of Union", "at most 16"],
  ["briefing.briefing.room", "The Hebrew Rebellion Movement struck at dawn.", "The Haganah"],
  ["briefing.pledges[0].quote", "a pivotal moment \u2014 as sourced", null],
  ["briefing.briefing.you", "You hold the shelf and 40 police.", null],
])("%s set to %p is flagged for %p", (path, text, issue) => {
  const changed = world();
  setPath(changed, path, text);
  const found = lint(changed).find((entry) => entry.path === path);
  if (issue === null) expect(found).toBeUndefined();
  else expect(found?.issues.join(" ")).toContain(issue);
});

test("the rewrite changes only the flagged fields and straightens quotes", async () => {
  const changed = world();
  setPath(changed, "briefing.briefing.situation", "The vote was pivotal.");
  const call = (async () => ({
    fields: [
      { path: "briefing.briefing.situation", text: "The vote was \u201cclose\u201d." },
      { path: "briefing.briefing.room", text: "Rewritten without cause." },
    ],
  })) as unknown as Caller;
  const result = await rewriteWorld(call, changed, "anthropic/claude-opus-5.5");
  expect(result.world.briefing.briefing.situation).toBe('The vote was "close".');
  expect(result.world.briefing.briefing.room).toBe("The hand decides.");
  expect(result.before).toHaveLength(1);
  expect(result.after).toEqual([]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test worker/gen/world.test.ts worker/gen/lint.test.ts`
Expected: FAIL, `Cannot find module './world'`.

- [ ] **Step 3: Write the world stage**

`worker/gen/world.ts`:

```ts
// The world step of generation v2 (SPEED.md experiment 1): one bible call fixes the canon (voice, words, names, faces,
// terms and their aliases), then parallel part calls write the rest from the same cached block of documents and roster.
// Code gives each part its ids, checks each part, and re-runs only a part that fails; a part is never asked to fix a
// roster-level count (lesson 24). Each row comes from the chunk that owns it (lesson 25).
import type { z } from "zod";
import { ESCALATION_KEYS } from "../pack";
import { fold, isGrounded, quoted } from "./checks";
import { docBlock, type Gathered } from "./gather";
import { GROK, ModelStop, OPUS, type CallRequest, type Caller } from "./openrouter";
import {
  BibleSchema,
  PartSchemas,
  factionIds,
  hasChamber,
  toGlance,
  type Bible,
  type Fail,
  type FactionRow,
  type GroupRow,
  type PartKind,
  type Parts,
  type Plan,
  type Roster,
  type World,
} from "./schemas";
import { WORLD_SYSTEM } from "./writing";

const WORLD_DOC_CHARACTERS = 6000; // each document in the cached block; the roster call reads them whole
export const CHUNK = 4; // measured: one 11-group call took 151 s of a 193 s step; chunks of 4 cut it to 108 s

export type Job = { name: string; kind: PartKind; ids: string[] | null };
export type WorldContext = {
  prefix: string;
  roster: Roster;
  bible: Bible;
  model: string; // the model the bible came from: Grok after a filtered bible, so the parts skip the refusal
  plan: Plan;
  gathered: Gathered;
};

// Opus refuses some premises (lesson 6). A filtered world call goes once to Grok: a new call to another model, not a
// retry. A length stop is not resent, since the same call would stop the same way.
export async function worldCall<T>(call: Caller, request: CallRequest<T>): Promise<{ data: T; model: string }> {
  const model = request.model ?? OPUS;
  try {
    return { data: await call({ ...request, model }), model };
  } catch (error) {
    if (!(error instanceof ModelStop) || error.reason !== "content_filter" || model === GROK) throw error;
    return { data: await call({ ...request, model: GROK }), model: GROK };
  }
}

export function worldPrefix(prompt: string, plan: Plan, roster: Roster, gathered: Gathered): string {
  const table = JSON.stringify({
    grounding_line: roster.grounding_line,
    ruler: roster.ruler,
    fall: roster.fall,
    chamber: roster.chamber,
    groups: roster.groups.map(({ doc, quote, seats_doc, seats_quote, ...group }) => group),
  });
  return `${docBlock(gathered.docs, WORLD_DOC_CHARACTERS)}

<roster>
${table}
</roster>

<world>
Prompt: ${prompt}. Kind: ${plan.kind}. Start date: ${plan.start_date}; each turn is ${plan.turn_length}; the term ends ${plan.term_end}.
The roster is checked and closed: use exactly its groups, names, seats, rulers and the fall. Play every premise straight.
</world>`;
}

const failureBlock = (earlier: unknown, fails: Fail[]) => `
<earlier_answer>
${JSON.stringify(earlier)}
</earlier_answer>
<failures>
${fails.map((fail) => `- ${fail.check} ${fail.row}: ${fail.message}`).join("\n")}
</failures>
Code checks found the failures above in your earlier answer. Return the whole answer again with each one fixed and everything else kept.`;

const BIBLE_TASK = `Write the world bible: the canon every part copies from. Every other writer waits for it, so keep each field short.
- house_voice: one line naming the record this world keeps of itself (e.g. "district officer's memo, 1946"). tone: exactly 3 lines on how the prose sounds (sentence length, register, what it never does).
- grounding: the roster's grounding line. title: the masthead title. era: the span of the term in words ("Egypt, 2012 to 2013"). place: the seat of power. year: the start year (negative for BC; the in-world number for invented calendars).
- vocabulary: every key, in this world's own words.
- terms: 8 to 20 named things the parts may mention that are not roster groups (places, offices, documents, laws, events, objects, and people other than the faces), each with one line and its aliases: every other name the documents use for the same thing. The parts may use no other proper nouns, so include every name the briefing, pledges, problems and cards will need.
- history: 3 to 6 dated beats up to the start date, then the fall if the roster has one.
- groups: one row per roster group, in roster order: id, name (the roster name), short (at most 16 characters, no acronyms), identity (at most 20 words: who they are and what they want from the player now), face (the real leader or spokesperson on the start date where the record has one, else an invented voice named from the world), face_role (title and place; add "an invented voice" when invented).
- regions: 6 to 8 regions of the public (split by community where the country was divided that way): id (lower case) and name.`;

export async function writeBible(
  call: Caller,
  prefix: string,
  earlier?: { bible: Bible; fails: Fail[]; model: string },
): Promise<{ bible: Bible; model: string }> {
  const { data, model } = await worldCall(call, {
    name: earlier ? "bible-repair" : "bible",
    schema: BibleSchema,
    system: WORLD_SYSTEM,
    prefix,
    user: `<task>\n${BIBLE_TASK}\n</task>${earlier ? failureBlock(earlier.bible, earlier.fails) : ""}`,
    maxTokens: 32000,
    model: earlier?.model,
  });
  return { bible: data, model };
}

export function checkBible(bible: Bible, roster: Roster): Fail[] {
  const fails: Fail[] = [];
  const fail = (row: string, message: string) => fails.push({ check: "B1", row, message, job: "bible" });
  const written = new Set(bible.groups.map((group) => group.id));
  for (const group of roster.groups)
    if (!written.has(group.id)) fail(group.id, `no bible row for roster group ${group.id}; write one row per roster group, in roster order`);
  if (bible.regions.length < 6 || bible.regions.length > 8)
    fail("regions", `${bible.regions.length} regions; write 6 to 8`);
  for (const [key, value] of Object.entries(bible.vocabulary))
    if (key !== "abroad" && !String(value ?? "").trim()) fail("vocabulary", `vocabulary.${key} is empty`);
  return fails;
}

export function planJobs(roster: Roster): Job[] {
  const chunks = (ids: string[]) =>
    Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) => ids.slice(i * CHUNK, (i + 1) * CHUNK));
  const unseated = roster.groups.filter((group) => group.seats === null).map((group) => group.id);
  const seated = hasChamber(roster) ? roster.groups.filter((group) => group.seats !== null).map((group) => group.id) : [];
  return [
    ...chunks(unseated).map((ids, i): Job => ({ name: `groups${i + 1}`, kind: "groups", ids })),
    ...chunks(seated).map(
      (ids, i): Job => (i === 0 ? { name: "chamber", kind: "chamber", ids } : { name: `factions${i + 1}`, kind: "factions", ids }),
    ),
    ...(["briefing", "ledgers", "instruments", "systems", "theme"] as const).map(
      (kind): Job => ({ name: kind, kind, ids: null }),
    ),
  ];
}

const PART_RULES = `You write one part of the world file. Other writers write the other parts at the same time from the same roster and this bible.
The bible is canon: keep its house voice and tone, its vocabulary, its group names, faces and terms, and its history. Name no person, place, body, document or event that is not in the bible, the roster or the documents; when you need a name the bible lacks, describe the thing without naming it. Write a term by its bible name, never by one of its aliases. Describe each group only as itself: never give a group a second name, and never write a roster group into a part as if it were someone else.`;

const CARD_RULE = `wants: 2 or 3 tags of acts the group wants. hates: 2 or 3 tags of acts it fights, exactly one with red_line true; a group that will not take money for its support has the hate tag "Bribes". strike: one short line, third person, on what it does when it turns on the player. Each tag is 1 to 3 words a player's act would do ("Relief checks", "Tax the lords"), decidable from the act's text alone. The whole card is about 20 words.`;

export function jobTask(job: Job, roster: Roster, bible: Bible, grounded = false): string {
  const nameOf = (id: string) =>
    bible.groups.find((group) => group.id === id)?.name ?? roster.groups.find((group) => group.id === id)?.name ?? id;
  const unseated = roster.groups.filter((group) => group.seats === null);
  const seated = roster.groups.filter((group) => group.seats !== null);
  const mine = (id: string) => !job.ids || job.ids.includes(id);
  const factions = factionIds(roster);
  const ids = `${job.ids ? "Write only the rows listed above. " : ""}Ids you may refer to: groups ${unseated.map((group) => group.id).join(", ")}; chamber blocs ${seated.map((group) => group.id).join(", ") || "none"}; regions ${bible.regions.map((region) => region.id).join(", ")}.`;
  const groupLines = unseated
    .filter((group) => mine(group.id))
    .map(
      (group) =>
        `- ${group.id}: ${nameOf(group.id)}; ${group.sits}; support ${group.support}${group.can_dismiss ? "; can dismiss the player" : ""}${group.veto ? "; has a veto" : ""}; rival ${group.rival}`,
    )
    .join("\n");
  const seatLines = seated
    .filter((group) => mine(group.id))
    .map((group) => `- ${group.id}: ${nameOf(group.id)}; ${group.seats} seats; support ${group.support}; rival ${group.rival}`)
    .join("\n");
  const factionRule = `color: the party's own colour as #rrggbb where it has one, else one that suits it, distinct from the others. with_you: true for a bloc outside the player's own party that votes with the player. ${CARD_RULE}`;
  switch (job.kind) {
    case "groups":
      return `Write groups: exactly one row per id below, in this order, each with that id. icon: the line icon for its role. color: its colour as #rrggbb, distinct from the others. line: its warning line, 10 to 25 below its support. response: what it does when it strikes; a group that can dismiss the player has "dismiss". ${CARD_RULE}\n${groupLines}\n${ids}`;
    case "chamber":
      return `Write chamber (other writers write the blocs not listed below): name (the bible's vocabulary.chamber), shape, threshold (the votes needed to pass in the real chamber of ${roster.chamber?.real_size} seats), tie (who breaks a tied vote in the player's favour, or null), and factions: exactly one row per id below, in this order, each with that id. ${factionRule}\n${seatLines}\n${ids}`;
    case "factions":
      return `Write factions of the chamber (another writer writes the chamber's name and its other blocs): exactly one row per id below, in this order, each with that id. ${factionRule}\n${seatLines}\n${ids}`;
    case "briefing":
      return `Write ruler (role: the office in this world's words; removed_by: one sentence for the first page naming who can remove the player and how; the roster says: ${roster.ruler.removed_by}), briefing (situation: what is happening and what the player wants; room: who can stop the player and how; you: what the player holds and what ${bible.vocabulary.test} asks; each at most 90 words, second person), problems (8 one-line problems, the three most pressing first) and pledges: exactly 8 promises the player can make on day one. Each pledge: text (the promise, at most 8 words), tag (2 to 4 lower-case words joined by hyphens, unique), for (the id of the group, chamber bloc or region it is made to; the player's own party may be one), quote and doc. ${grounded ? `The ruler is ${roster.ruler.name}, a real person: at least 5 of the 8 pledges are promises ${roster.ruler.name} really made, each with quote (at most 25 words copied exactly from the numbered document that records the promise) and doc (that document's index). Code checks every quote against the documents. The other pledges have quote and doc null.` : "quote and doc are null."}\n${ids}`;
    case "ledgers":
      return `Write ledgers: the five fixed resources named in this world's words (name at most 13 characters, sentence case), each with start and line: treasury start 30 to 60, line 0; authority start 30 to 60, line 0; chest start 10 to 30, line 0; loyalty start 50 to 70, line 20; popularity start 40 to 60, line 30. Treasury, authority and chest also get for (one sentence: what it is in this world), earn (2 short lines: what fills it), spend (2 or 3 short lines: what drains it), fails (the words after "At 0", e.g. "the domes cannot pay for new air.") and icon. Every word comes from this world: no taxes in a world without money, no banks on Mars.`;
    case "instruments":
      return `Write instruments: one per verb (decree, law, appoint, spend, proclaim, favour, force), each named in this world's words, with available (false when this polity cannot use it${roster.chamber ? "" : "; law is false here, since no assembly votes on laws"}) and vetoes: who must agree before such an act lands, as group ids and/or "chamber" or "chamber_supermajority"; [] when no one can stop it in advance (a court that strikes later is not a veto). At most 2 per act, only veto players who would disagree with each other; force usually lists the group that commands the army. Each of these has a veto and appears in at least one act: ${unseated.filter((group) => group.veto).map((group) => group.id).join(", ") || "none"}.\n${groupLines}\n${ids}`;
    case "systems":
      return `Write the game's systems in this world's words:
- tags: 16 to 20 policy areas of this world, each 1 to 3 lower-case words joined by hyphens.
- blocs: exactly 5 groups of ordinary people (voters, subjects, workers, castes): id, name and a one-line description.
- patrons: exactly 10 lobbies or interests: id, name, and wants and hates as tags from your tags list.
- regions: one row per region id below: weight (its share of the population; the rows sum to 1) and lean, one entry per faction id below (value -1 to 1: how much the region favours it).
- test: the end-of-term test: name, win and lose (one sentence each), reveal (regions, seats or both).
- endings: a short title for each way the term ends (reelected, defeated, lame_duck, impeached, coup, stopped, dismissed; null for one this world cannot have).
- lobby: this world's words for a pork offer, a traded favour and a threat: label (at most 4 words) and text (one sentence).
- escalations: all 20 keys, in this order, each with a name and a one-line headline in this world's words: ${ESCALATION_KEYS.join(", ")}.
Regions: ${bible.regions.map((region) => `${region.id} (${region.name})`).join("; ")}. Faction ids: ${factions.map((id) => `${id} (${nameOf(id)})`).join("; ")}.`;
    case "theme":
      return `Write theme: the look of this world's own records, to match the bible's house voice, era and place. A display and body font from the lists, weight and case; a light and a dark palette (paper, surface, ink, muted, accent, accent2, rule as #rrggbb; ink, muted and accent must read at 4.5:1 on paper and surface); the material and texture of its paper; a radius; a rule style; a motion personality; and the courier shape that carries a change across the desk.`;
  }
}

export async function runJob(
  call: Caller,
  job: Job,
  context: WorldContext,
  earlier?: { part: unknown; fails: Fail[] },
): Promise<unknown> {
  const { data } = await worldCall(call, {
    name: earlier ? `${job.name}-repair` : job.name,
    schema: PartSchemas[job.kind] as z.ZodType<unknown>,
    system: WORLD_SYSTEM,
    prefix: context.prefix,
    user: `<bible>\n${JSON.stringify(context.bible)}\n</bible>\n<task>\n${PART_RULES}\n${jobTask(job, context.roster, context.bible, isGrounded(context.plan, context.roster))}\n</task>${earlier ? failureBlock(earlier.part, earlier.fails) : ""}`,
    maxTokens: 48000,
    model: context.model,
  });
  return data;
}

export function checkPart(job: Job, part: unknown, context: WorldContext): Fail[] {
  const { roster, bible } = context;
  const fails: Fail[] = [];
  // A count the pack cannot be built without blocks the build if the part's one repair does not fix it.
  const fail = (check: string, row: string, message: string, blocking = false) =>
    fails.push({ check, row, message, job: job.name, ...(blocking ? { blocking } : {}) });
  const cards = (rows: (GroupRow | FactionRow)[]) => {
    for (const id of job.ids ?? []) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) fail("W2", id, `no row for ${id}; write exactly one row for each id listed`);
      else if (!toGlance(row))
        fail("W7", id, "the card breaks its shape: 1 to 3 wants and 1 to 3 hates, each tag at most 48 characters, exactly one hate with red_line true, and a strike line");
    }
  };
  switch (job.kind) {
    case "groups":
      cards((part as Parts["groups"]).groups);
      break;
    case "chamber":
      cards((part as Parts["chamber"]).chamber.factions);
      break;
    case "factions":
      cards((part as Parts["factions"]).factions);
      break;
    case "briefing": {
      const written = part as Parts["briefing"];
      if (written.pledges.length !== 8) fail("W6", "pledges", `${written.pledges.length} pledges; write exactly 8`, true);
      if (written.problems.length < 8 || written.problems.length > 12)
        fail("W6", "problems", `${written.problems.length} problems; write 8 to 12`, true);
      const targets = new Set([...roster.groups.map((group) => group.id), ...bible.regions.map((region) => region.id)]);
      for (const pledge of written.pledges)
        if (!targets.has(pledge.for))
          fail("W6", "pledges", `pledge "${pledge.text}" is for ${pledge.for}, which is not a group, chamber bloc or region id`);
      const tags = written.pledges.map((pledge) => fold(pledge.tag));
      if (new Set(tags).size !== tags.length) fail("W6", "pledges", "two pledges share a tag; each tag is unique");
      if (isGrounded(context.plan, roster)) {
        const verified = written.pledges.filter((pledge) => quoted(pledge.quote, pledge.doc, context.gathered.docs)).length;
        if (verified < 4)
          fail("W10", "pledges", `${verified} of 8 pledges quote ${roster.ruler.name}'s own promise word for word from its numbered document; at least 4 must, so give 5 real promises with exact quotes`);
      }
      break;
    }
    case "instruments": {
      const listed = new Set(Object.values((part as Parts["instruments"]).instruments).flatMap((instrument) => instrument.vetoes));
      for (const group of roster.groups)
        if (group.seats === null && group.veto && !listed.has(group.id))
          fail("W5", group.id, `${group.id} has a veto in the roster but no act lists it`);
      break;
    }
    case "systems": {
      const written = part as Parts["systems"];
      if (written.blocs.length !== 5) fail("W11", "blocs", `${written.blocs.length} blocs; write exactly 5`, true);
      if (written.patrons.length !== 10) fail("W11", "patrons", `${written.patrons.length} patrons; write exactly 10`, true);
      const tags = new Set(written.tags.map(fold)).size;
      if (tags < 16) fail("W11", "tags", `${tags} different tags; write 16 to 20`, true);
      const keys = new Set(written.escalations.map((escalation) => escalation.key));
      const missing = ESCALATION_KEYS.filter((key) => !keys.has(key));
      if (missing.length) fail("W11", "escalations", `missing escalation keys: ${missing.join(", ")}`);
      const rows = new Set(written.regions.map((region) => region.id));
      const unwritten = bible.regions.filter((region) => !rows.has(region.id)).map((region) => region.id);
      if (unwritten.length) fail("W11", "regions", `no weight and lean for regions ${unwritten.join(", ")}`);
      break;
    }
  }
  return fails;
}

// Each id from the chunk that owns it; else from any chunk that wrote it (lesson 25); else missing.
export function mergeWorld(roster: Roster, bible: Bible, parts: Record<string, unknown>, jobs: Job[]): World {
  const rowFinder = <T extends { id: string }>(kinds: PartKind[], read: (part: any) => T[] | undefined) => {
    const owners = jobs.filter((job) => kinds.includes(job.kind));
    return (id: string): T | undefined => {
      const owner = owners.find((job) => job.ids?.includes(id));
      const own = owner ? read(parts[owner.name])?.find((row) => row.id === id) : undefined;
      return own ?? owners.map((job) => read(parts[job.name])?.find((row) => row.id === id)).find(Boolean);
    };
  };
  const groupRow = rowFinder<GroupRow>(["groups"], (part) => part?.groups);
  const factionRow = rowFinder<FactionRow>(["chamber", "factions"], (part) => part?.chamber?.factions ?? part?.factions);
  const present = <T>(row: T | undefined): row is T => !!row;
  const chamber = parts.chamber as Parts["chamber"] | undefined;
  return {
    bible,
    groups: roster.groups.filter((group) => group.seats === null).map((group) => groupRow(group.id)).filter(present),
    chamber: chamber
      ? {
          ...chamber.chamber,
          factions: roster.groups.filter((group) => group.seats !== null).map((group) => factionRow(group.id)).filter(present),
        }
      : null,
    briefing: parts.briefing as Parts["briefing"],
    ledgers: (parts.ledgers as Parts["ledgers"]).ledgers,
    instruments: (parts.instruments as Parts["instruments"]).instruments,
    systems: parts.systems as Parts["systems"],
    theme: (parts.theme as Parts["theme"] | undefined)?.theme ?? null,
  };
}
```

- [ ] **Step 4: Write the lint**

`worker/gen/lint.ts`:

```ts
// Style lint on the merged world (lesson 18): AI tells, the game's own words in player copy, length caps, and a bible
// alias written in place of its term. Every flagged field goes to one cheap rewrite call; straight quotes are code's job.
import { fold } from "./checks";
import type { Caller } from "./openrouter";
import { RewriteSchema, type World } from "./schemas";
import { worldCall } from "./world";
import { REWRITE_SYSTEM } from "./writing";

export type LintIssue = { path: string; text: string; issues: string[] };

const TELLS: [RegExp, string][] = [
  [/\u2014|\s\u2013\s|\s--\s/, "uses a dash as punctuation; use a comma, colon or full stop"],
  [/\bnot (just|only|merely)\b[^.]*\bbut\b/i, 'uses "not just X but Y"'],
  [
    /, (reflecting|ensuring|highlighting|underscoring|showcasing|signall?ing|cementing|fostering|marking|creating|contributing|emphasi[sz]ing|illustrating|demonstrating|solidifying)\b/i,
    'ends a clause on an -ing tail (", reflecting ...")',
  ],
  [
    /\b(pivotal|testament|tapestry|delves?|underscores?|crucial|vibrant|intricate|multifaceted|beacon|bustling|nestled|palpable|unwavering|meticulous|seamless|robust|moreover|additionally|furthermore|showcases?|stands as|serves as|a reminder that|in the heart of|rich history|ever-shifting|delicate balance|navigat(e|es|ing) the)\b/i,
    "uses an inflated or stock word",
  ],
  [/\b(observers|critics|experts|analysts|many) (say|believe|note|argue|warn)\b/i, "quotes unnamed observers"],
];
const ENGINE_WORDS = /\b(instruments?|priced|consent|stance|weights?|responses?|resistance|director|template|holders?)\b/i;
// The prose a player reads. Pledge quotes and all tags are sourced or matched text, never rewritten.
const PLAYER_COPY =
  /^(bible\.(groups\[\d+\]\.identity|history\[\d+\]\.beat)|briefing\.(ruler\.removed_by|briefing\.\w+|problems\[\d+\]|pledges\[\d+\]\.text)|ledgers\.\w+\.(for|earn\[\d+\]|spend\[\d+\]|fails)|systems\.(test\.(win|lose)|escalations\[\d+\]\.headline|blocs\[\d+\]\.description)|(groups|chamber\.factions)\[\d+\]\.strike)$/;
const wordCount = (text: string) => text.trim().split(/\s+/).length;
const CAPS: [RegExp, (text: string) => string | null][] = [
  [/^briefing\.briefing\.\w+$/, (text) => (wordCount(text) > 90 ? `${wordCount(text)} words; at most 90` : null)],
  [/^bible\.groups\[\d+\]\.short$/, (text) => (text.length > 16 ? `${text.length} characters; at most 16` : null)],
  [/^ledgers\.\w+\.name$/, (text) => (text.length > 13 ? `${text.length} characters; at most 13` : null)],
  [/^bible\.vocabulary\.file$/, (text) => (text.length > 18 ? `${text.length} characters; at most 18` : null)],
  [/^bible\.vocabulary\.abroad$/, (text) => (text.length > 22 ? `${text.length} characters; at most 22` : null)],
];
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
  return [];
}

export function lint(world: World): LintIssue[] {
  const aliases = world.bible.terms.flatMap((term) =>
    term.aliases
      .filter((alias) => alias.trim() && fold(alias) !== fold(term.term))
      .map((alias) => ({ alias, term: term.term, pattern: new RegExp(`\\b${escapePattern(alias)}\\b`, "i") })),
  );
  const found: LintIssue[] = [];
  for (const [path, text] of strings(world)) {
    const issues: string[] = [];
    if (PLAYER_COPY.test(path)) {
      if (text.includes(" ")) for (const [pattern, why] of TELLS) if (pattern.test(text)) issues.push(why);
      const engine = text.match(ENGINE_WORDS);
      if (engine) issues.push(`player copy uses the game's word "${engine[0]}"; say support, agree, votes or the clerk's price`);
      // The Palestine bible named the Jewish Resistance Movement; the briefing called it by another name (SPEED.md).
      for (const { alias, term, pattern } of aliases)
        if (pattern.test(text) && !text.includes(term)) issues.push(`uses "${alias}" for ${term}; write "${term}"`);
    }
    for (const [pattern, check] of CAPS)
      if (pattern.test(path)) {
        const problem = check(text);
        if (problem) issues.push(problem);
      }
    if (issues.length) found.push({ path, text, issues });
  }
  return found;
}

// Curly quotes are mechanical, so code straightens them rather than the model.
export const straighten = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value).replace(/[\u201c\u201d]/g, '\\"').replace(/[\u2018\u2019]/g, "'"));

export function setPath(target: unknown, path: string, text: string) {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let node: any = target;
  for (const key of keys.slice(0, -1)) node = node?.[key];
  const last = keys[keys.length - 1];
  if (node && typeof node[last] === "string") node[last] = text;
}

// One rewrite call for every flagged field. A rewrite that fails leaves the prose as written: it is style, not structure.
export async function rewriteWorld(
  call: Caller,
  world: World,
  model: string,
): Promise<{ world: World; before: LintIssue[]; after: LintIssue[] }> {
  const before = lint(world);
  if (!before.length) return { world: straighten(world), before, after: [] };
  const flagged = new Set(before.map((issue) => issue.path));
  const answer = await worldCall(call, {
    name: "rewrite",
    schema: RewriteSchema,
    system: REWRITE_SYSTEM,
    user: `House voice: ${world.bible.house_voice}\n\n${JSON.stringify(
      before.map((issue) => ({ path: issue.path, text: issue.text, problem: issue.issues.join("; ") })),
      null,
      1,
    )}\n\nReturn each field rewritten.`,
    maxTokens: 16000,
    strict: true,
    model,
  }).catch(() => null);
  if (!answer) return { world: straighten(world), before, after: before };
  const rewritten = structuredClone(world);
  for (const field of answer.data.fields) if (flagged.has(field.path)) setPath(rewritten, field.path, field.text);
  const fixed = straighten(rewritten);
  return { world: fixed, before, after: lint(fixed) };
}
```

- [ ] **Step 5: Run the tests**

Run: `bun test worker/gen/world.test.ts worker/gen/lint.test.ts`
Expected: PASS, 28 tests (20 in `world.test.ts`, 8 in `lint.test.ts`).

- [ ] **Step 6: Run the gates and commit**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green.

```bash
git add worker/gen/world.ts worker/gen/lint.ts worker/gen/world.test.ts worker/gen/lint.test.ts
git commit -m "Generation v2 world stage: a bible, parallel parts on a cached block, part checks with part-scoped repair, lint and one rewrite"
```

---

### Task 5: Emblems: one per group, the sanitizer, the 28 px and canon review, the line-icon fallback

**Files:**
- Create: `worker/gen/emblems.ts`
- Test: `worker/gen/emblems.test.ts`

**Interfaces:**
- Consumes: `sanitizeEmblem`, `type Emblem` from `worker/emblem.ts` (Stage 0: takes `{ viewBox, elements: [{ tag, ...attributes }] }`, reads only strings and numbers, returns `{ emblem, fixes }` or `{ emblem: null, reason, fixes }`); `ModelStop`, `type Caller` (Task 1); `EmblemReplySchema`, `EmblemReviewSchema` (Task 1); `EMBLEM_SYSTEM`, `REVIEW_SYSTEM` (Task 1).
- Produces: `type EmblemGroup = { id: string; name: string; identity: string }`, `type EmblemWorld = { title: string; era: string; place: string; houseVoice: string; kind: number }`, `type EmblemReport = { asked: number; drawn: number; kept: number; namesOnly: boolean; dropped: { id: string; reason: string }[] }`, `keepEmblems(drawn, review, kind)`, `emblemsFor(call, world, groups): Promise<{ emblems: Record<string, Emblem>; report: EmblemReport }>`. It never throws: every failure is a line icon and a reason in the report.

- [ ] **Step 1: Write the failing test**

`worker/gen/emblems.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { Emblem } from "../emblem";
import { emblemsFor, keepEmblems } from "./emblems";
import { ModelStop, type Caller, type CallRequest } from "./openrouter";

const disc: Emblem = { size: 64, elements: [{ tag: "circle", cx: 32, cy: 32, r: 26, fill: "ink" }] };
const verdict = (legible: boolean, canon: "fits" | "wrong" | "none") => [{ id: "lions", legible, canon }];

test.each([
  ["legible and fits its canon", verdict(true, "fits"), 7, true],
  ["legible, no known device", verdict(true, "none"), 14, true],
  ["unreadable at 28 px", verdict(false, "fits"), 7, false],
  ["the wrong device in a canon world", verdict(true, "wrong"), 7, false],
  ["the wrong device in an invented world, where canon is not checked", verdict(true, "wrong"), 14, true],
  ["never reviewed", null, 7, false],
])("an emblem that is %s ships: %p", (_label, review, kind, ships) => {
  const { kept } = keepEmblems({ lions: disc }, review, kind);
  expect("lions" in kept).toBe(ships);
});

const world = { title: "Westeros", era: "298 AC", place: "King's Landing", houseVoice: "Maester's chronicle", kind: 7 };
const groups = [
  { id: "lions", name: "House Lannister", identity: "The richest house in the realm." },
  { id: "stags", name: "House Baratheon", identity: "The king's own house." },
];
const drawn = (id: string, elements: unknown[]) => ({ id, motif: "a device", viewBox: "0 0 64 64", elements });
const circle = { tag: "circle", cx: 32, cy: 32, r: 26, fill: "ink" };

// A fake Opus: the first emblem call can be filtered; the review says every emblem it sees is legible and fits.
function fake(options: { filterFirst?: boolean; failReview?: boolean; emblems: unknown[] }) {
  const requests: CallRequest<unknown>[] = [];
  const call = (async (request: CallRequest<unknown>) => {
    requests.push(request);
    if (request.name === "emblems" && options.filterFirst) throw new ModelStop("content_filter", "filtered");
    if (request.name === "emblem-review") {
      if (options.failReview) throw new ModelStop("invalid", "bad review");
      const shown = JSON.parse(request.user.slice(request.user.indexOf("[")));
      return { emblems: shown.map((row: { id: string }) => ({ id: row.id, legible: true, canon: "fits" })) };
    }
    return { emblems: options.emblems };
  }) as unknown as Caller;
  return { call, requests };
}

test("a filtered emblem call is resent once with names only, and its emblems are sanitized and reviewed", async () => {
  const model = fake({ filterFirst: true, emblems: [drawn("lions", [circle]), drawn("stags", [circle])] });
  const { emblems, report } = await emblemsFor(model.call, world, groups);
  expect(model.requests.map((request) => request.name)).toEqual(["emblems", "emblems-names", "emblem-review"]);
  expect(model.requests[1].user).not.toContain("The richest house");
  expect(Object.keys(emblems)).toEqual(["lions", "stags"]);
  expect(report).toMatchObject({ asked: 2, drawn: 2, kept: 2, namesOnly: true });
});

test("an emblem the sanitizer refuses, or one never drawn, falls back to the line icon with its reason", async () => {
  const model = fake({ emblems: [drawn("lions", [{ tag: "script" }, { tag: "foreignObject" }])] });
  const { emblems, report } = await emblemsFor(model.call, world, groups);
  expect(emblems).toEqual({});
  expect(report.dropped).toEqual([
    { id: "lions", reason: "no element survived" },
    { id: "stags", reason: "not drawn" },
  ]);
});

test("a review that fails ships no emblem at all", async () => {
  const model = fake({ failReview: true, emblems: [drawn("lions", [circle])] });
  const { emblems, report } = await emblemsFor(model.call, world, groups);
  expect(emblems).toEqual({});
  expect(report.dropped.map((row) => row.reason)).toContain("not reviewed");
});

test("an emblem call that fails for another reason costs nothing more and ships no emblem", async () => {
  const call = (async () => {
    throw new ModelStop("length", "too long");
  }) as unknown as Caller;
  const { emblems, report } = await emblemsFor(call, world, groups);
  expect(emblems).toEqual({});
  expect(report.dropped).toHaveLength(2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test worker/gen/emblems.test.ts`
Expected: FAIL, `Cannot find module './emblems'`.

- [ ] **Step 3: Write the emblem stage**

`worker/gen/emblems.ts`:

```ts
// One emblem per group, drawn by the model as allowlisted SVG shapes, then three guards before any reaches the desk
// (owner, 2026-09-24): Stage 0's sanitizer; a second call that judges each emblem at 28 px and, in a known story or
// history, against its known device (Decision 9); and the line icon for every emblem that fails, is filtered or never
// arrives. Nothing here throws: emblems are decoration, and a build never fails for one.
import type { z } from "zod";
import { sanitizeEmblem, type Emblem } from "../emblem";
import { ModelStop, type Caller } from "./openrouter";
import { EmblemReplySchema, EmblemReviewSchema } from "./schemas";
import { EMBLEM_SYSTEM, REVIEW_SYSTEM } from "./writing";

export type EmblemGroup = { id: string; name: string; identity: string };
export type EmblemWorld = { title: string; era: string; place: string; houseVoice: string; kind: number };
export type EmblemReport = {
  asked: number;
  drawn: number;
  kept: number;
  namesOnly: boolean;
  dropped: { id: string; reason: string }[];
};
type Review = z.infer<typeof EmblemReviewSchema>["emblems"];

const CANON_KINDS = 7; // kinds 1 to 7: the record, a divergence from it, a myth or a canon, where devices are known

const brief = (world: EmblemWorld, groups: EmblemGroup[], namesOnly: boolean) =>
  `World: ${world.title} (${world.era}; ${world.place}). House voice: ${world.houseVoice}.
One emblem for each of these ${groups.length} groups, in this order:
${groups.map((group) => `- id "${group.id}": ${group.name}.${namesOnly ? "" : ` ${group.identity}`}`).join("\n")}`;

export function keepEmblems(
  drawn: Record<string, Emblem>,
  review: Review | null,
  kind: number,
): { kept: Record<string, Emblem>; dropped: { id: string; reason: string }[] } {
  const kept: Record<string, Emblem> = {};
  const dropped: { id: string; reason: string }[] = [];
  for (const [id, emblem] of Object.entries(drawn)) {
    const verdict = review?.find((row) => row.id === id);
    if (!verdict) dropped.push({ id, reason: "not reviewed" });
    else if (!verdict.legible) dropped.push({ id, reason: "does not read at 28 px" });
    else if (kind <= CANON_KINDS && verdict.canon === "wrong") dropped.push({ id, reason: "contradicts its known device" });
    else kept[id] = emblem;
  }
  return { kept, dropped };
}

export async function emblemsFor(
  call: Caller,
  world: EmblemWorld,
  groups: EmblemGroup[],
): Promise<{ emblems: Record<string, Emblem>; report: EmblemReport }> {
  const ask = (namesOnly: boolean) =>
    call({
      name: namesOnly ? "emblems-names" : "emblems",
      schema: EmblemReplySchema,
      system: EMBLEM_SYSTEM,
      user: brief(world, groups, namesOnly),
      maxTokens: 24000,
    });
  let namesOnly = false;
  let reply: z.infer<typeof EmblemReplySchema> | null = null;
  try {
    reply = await ask(false);
  } catch (error) {
    // The fridge brief tripped the filter on its botulinum text; the same call with names only passed (emblems-report.md).
    if (error instanceof ModelStop && error.reason === "content_filter") {
      namesOnly = true;
      reply = await ask(true).catch(() => null);
    }
  }
  const drawn: Record<string, Emblem> = {};
  const dropped: { id: string; reason: string }[] = [];
  const wanted = new Set(groups.map((group) => group.id));
  const motifs = new Map<string, string>();
  for (const raw of reply?.emblems ?? []) {
    if (!wanted.has(raw.id) || drawn[raw.id] || dropped.some((row) => row.id === raw.id)) continue;
    const clean = sanitizeEmblem(raw);
    if (clean.emblem) {
      drawn[raw.id] = clean.emblem;
      motifs.set(raw.id, raw.motif);
    } else dropped.push({ id: raw.id, reason: clean.reason });
  }
  for (const group of groups)
    if (!drawn[group.id] && !dropped.some((row) => row.id === group.id))
      dropped.push({ id: group.id, reason: "not drawn" });

  let review: Review | null = null;
  if (Object.keys(drawn).length) {
    const shown = Object.entries(drawn).map(([id, emblem]) => ({
      id,
      name: groups.find((group) => group.id === id)!.name,
      motif: motifs.get(id),
      emblem,
    }));
    review = await call({
      name: "emblem-review",
      schema: EmblemReviewSchema,
      system: REVIEW_SYSTEM,
      user: `World: ${world.title} (${world.era}), kind ${world.kind}: ${world.kind <= CANON_KINDS ? "a known history or story, so check each device against it" : "an invented world, so canon is always none"}.\nEmblems:\n${JSON.stringify(shown)}`,
      maxTokens: 8000,
      strict: true,
    })
      .then((answer) => answer.emblems)
      .catch(() => null);
  }
  const { kept, dropped: refused } = keepEmblems(drawn, review, world.kind);
  return {
    emblems: kept,
    report: {
      asked: groups.length,
      drawn: Object.keys(drawn).length,
      kept: Object.keys(kept).length,
      namesOnly,
      dropped: [...dropped, ...refused],
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test worker/gen/emblems.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the gates and commit**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green.

```bash
git add worker/gen/emblems.ts worker/gen/emblems.test.ts
git commit -m "Generation v2 emblems: one per group, sanitized, reviewed at 28 px and against known devices, line icon on any failure"
```

---

### Task 6: Assemble: calendar, facts, the people steps' frame, and the pack

**Files:**
- Create: `worker/gen/assemble.ts`
- Test: `worker/gen/assemble.test.ts`

**Interfaces:**
- Consumes: `PackSchema`, `ESCALATION_KEYS`, `FILLS`, `FONT_PAIRS`, `KINDS`, `VERBS`, `scaleSeats`, `type Pack`, `type Member`, `type Citizen`, `type Storylet` (`worker/pack.ts`); `parseThemeTokens`, `fitContrast` (returns `string | null`), `type ThemeTokens`, `type Tint`, `MATERIALS` (`worker/tokens.ts`); `type Emblem` (`worker/emblem.ts`); `STANCE_LO`, `STANCE_HI` (`worker/engine.ts`); `UNIT`, `days`, `ymd`, `type Calendar` (`worker/gen/calendar-math.ts`); `UNITS`, `fromDays` (`worker/gen/validate.ts`); `MAX_CHAMBER`, `type Frame` (`worker/gen/frame.ts`); `type Facts` (`worker/gen/facts.ts`); `type Gathered` (Task 2); `factionIds`, `hasChamber`, `toGlance`, `type Bible`, `type Plan`, `type Roster`, `type World` (Task 1); `assignMembers`, `assignCitizens` (`worker/gen/assign.ts`, test only).
- Produces: `COURT_SEATS = 24`, `BACKER_AUTHORITY = 3`, `CHAMBER_HOLDER = "the_chamber"`, `type BuildParts = { id; prompt; plan; gathered; roster; world: World; emblems: Record<string, Emblem> }`, `type FrameInput` (a `BuildParts` whose world needs only `bible`, `briefing` and `systems`), `type People = { members; citizens; deck }`, `calendarOf(plan): Calendar`, `factsOf(plan, roster, bible): Facts`, `rulerFaction(roster): string`, `frameOf(input): Frame`, `packOf(parts, people): Pack` (throws a `ZodError` when the pack does not parse).

- [ ] **Step 1: Write the failing test**

`worker/gen/assemble.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { Emblem } from "../emblem";
import { ESCALATION_KEYS, VERBS } from "../pack";
import { DEFAULT_THEME_TOKENS } from "../tokens";
import { BACKER_AUTHORITY, CHAMBER_HOLDER, calendarOf, frameOf, packOf, type BuildParts } from "./assemble";
import { assignCitizens, assignMembers } from "./assign";
import fixture from "./fixtures/fridge-roster.json";
import { factionIds, type Bible, type Plan, type Roster, type World } from "./schemas";

const plan = fixture.plan as Plan;
const roster = fixture.roster as Roster;
const card = { wants: ["Clean shelves", "Cold door"], hates: [{ tag: "Warm nights", red_line: true }, { tag: "Bribes", red_line: false }], strike: "Stops voting with you." };
const colour = (index: number) => `#${(0x224466 + index * 0x0a0a0a).toString(16).padStart(6, "0")}`;

function bibleFor(from: Roster): Bible {
  return {
    house_voice: "Hansard of the Parliament of the Fridge",
    tone: ["Short sentences.", "Solemn.", "Never winks."],
    grounding: from.grounding_line,
    title: "The Parliament of the Fridge",
    era: "Days 1 to 21 after the weekly shop",
    place: "The Middle Shelf",
    year: 1,
    vocabulary: {
      seat: "Prime Minister", chamber: "Parliament of the Fridge", member: "member", bill: "Shelf Bill", pass: "carried",
      fail: "left on the shelf", capital: "chill", turn: "day", midterm: "the sniff test", campaign: "the canvass",
      test: "the clear-out", feed: "the door log", post: "notice", whip: "whip", lobby: "lobby", promise: "pledge",
      patron: "backer", approval: "freshness", file: "Shelf record", abroad: "beyond the door",
    },
    terms: [],
    history: [{ date: "0001-01-01", beat: "The weekly shop restocks every shelf." }],
    groups: from.groups.map((group) => ({ id: group.id, name: group.name, short: group.name.slice(4, 20), identity: group.wants, face: `${group.name} speaker`, face_role: "spokesman, an invented voice" })),
    regions: ["top", "middle", "bottom", "door", "crisper", "freezer"].map((id) => ({ id, name: `The ${id} shelf` })),
  };
}

function worldFor(from: Roster, bible: Bible, change: Partial<World> = {}): World {
  const seats = from.groups.filter((group) => group.seats !== null);
  const tags = Array.from({ length: 16 }, (_, i) => `policy-${i + 1}`);
  const offer = { label: "An offer", text: "The Prime Minister offers a shelf." };
  const resource = (name: string) => ({ name, start: 40, line: 0, for: "What keeps the shelves cold.", earn: ["The weekly shop"], spend: ["An open door"], fails: "the milk turns.", icon: "drop" as const });
  return {
    bible,
    groups: from.groups.filter((group) => group.seats === null).map((group, i) => ({ id: group.id, icon: "council" as const, color: colour(i), line: group.support - 15, response: "strike" as const, ...card })),
    chamber: from.chamber && seats.length
      ? { name: "Parliament of the Fridge", shape: "hemicycle", threshold: 31, tie: null, factions: seats.map((group, i) => ({ id: group.id, color: colour(i + 8), with_you: group.id === "door", ...card })) }
      : null,
    briefing: {
      ruler: { role: "Prime Minister", removed_by: "The Householder can bin you at any time." },
      briefing: { situation: "The weekly shop is in. The milk is fresh. The mould waits in the corner.", room: "The Householder can bin you.", you: "You hold the Middle Shelf." },
      problems: Array.from({ length: 8 }, (_, i) => `Problem ${i + 1}.`),
      pledges: Array.from({ length: 8 }, (_, i) => ({ text: `Pledge ${i + 1}`, tag: `pledge-${i + 1}`, for: "public", quote: null, doc: null })),
    },
    ledgers: { treasury: resource("Larder"), authority: resource("Chill"), chest: resource("Tupper"), loyalty: { name: "Loyalty", start: 60, line: 20 }, popularity: { name: "Freshness", start: 50, line: 30 } },
    instruments: Object.fromEntries(VERBS.map((verb) => [verb, { name: `The ${verb}`, available: true, vetoes: verb === "law" ? ["chamber"] : verb === "decree" ? ["householder"] : verb === "force" ? ["mould"] : [] }])) as World["instruments"],
    systems: {
      tags,
      blocs: Array.from({ length: 5 }, (_, i) => ({ id: `bloc-${i}`, name: `Bloc ${i}`, description: "The eggs of the door." })),
      patrons: Array.from({ length: 10 }, (_, i) => ({ id: `patron-${i}`, name: `Patron ${i}`, wants: [tags[i]], hates: ["not-a-tag", tags[i + 1]] })),
      regions: bible.regions.map((region) => ({ id: region.id, weight: 2, lean: factionIds(from).map((faction) => ({ faction, value: 0.2 })) })),
      test: { name: "the clear-out", win: "You stay on the shelf.", lose: "You are binned.", reveal: "both" },
      endings: { reelected: "Kept", defeated: "Binned", lame_duck: "Wilted", impeached: "Thrown out", coup: null, stopped: null, dismissed: "Binned by the hand" },
      lobby: { pork: offer, favor: offer, threat: offer },
      escalations: ESCALATION_KEYS.map((key) => ({ key, name: key, headline: `${key} headline.` })),
    },
    theme: DEFAULT_THEME_TOKENS,
    ...change,
  };
}

const partsFor = (from: Roster, change: Partial<World> = {}, emblems: Record<string, Emblem> = {}): BuildParts => ({
  id: "fridge",
  prompt: fixture.prompt,
  plan,
  gathered: { docs: [], qids: {}, facts: {}, homeQids: [], spans: {}, checklist: [], wikidataTable: "", sweepCategories: [] },
  roster: from,
  world: worldFor(from, bibleFor(from), change),
  emblems,
});
const build = (parts: BuildParts) => {
  const frame = frameOf(parts);
  return packOf(parts, {
    members: assignMembers(frame).map((member, i) => ({ ...member, name: `Member ${i}` })),
    citizens: assignCitizens(frame).map((citizen, i) => ({ ...citizen, name: `Citizen ${i}` })),
    deck: Array.from({ length: 20 }, (_, i) => ({ id: `gen-${i + 1}`, kind: "generic" as const, weight: 1, title_hint: "A shelf matter", stances: ["Act", "Wait"], scored: ["none" as const], results: [] })),
  });
};

test("the fridge world assembles into a pack the game parses: one holder per group without seats, then the chamber", () => {
  const pack = build(partsFor(roster));
  expect(pack.constitution!.holders.map((holder) => holder.id)).toEqual(["householder", "expiry", "mould", "botulinum", "pantry", "public", CHAMBER_HOLDER]);
  expect(pack.factions.map((faction) => faction.id)).toEqual(["freshfood", "crisper", "freezer", "door", "tupperware"]);
  expect(pack.chamber).toMatchObject({ size: 60, threshold: 31 });
  expect(pack.constitution!.holders.find((holder) => holder.id === CHAMBER_HOLDER)).toMatchObject({ members: "seats", support: 62 });
});

test("own party is one row: the ruler's chamber party is a faction and the own group, never a holder", () => {
  const pack = build(partsFor(roster));
  expect(pack.constitution!.ownGroup).toBe("freshfood");
  expect(pack.constitution!.ruler.faction).toBe("freshfood");
  expect(pack.constitution!.holders.some((holder) => holder.id === "freshfood")).toBe(false);
  expect(pack.starts.find((start) => start.faction === "freshfood")?.coalition).toEqual(["freshfood", "door"]);
});

test("the public group is the public row's holder, read from the citizens", () => {
  const pack = build(partsFor(roster));
  expect(pack.constitution!.publicGroup).toBe("public");
  expect(pack.constitution!.holders.find((holder) => holder.id === "public")?.members).toBe("citizens");
});

test.each([
  ["expiry", "expiry"],
  ["householder", null],
  [null, null],
])("with backer %p, the holder that gives authority each turn is %p", (backer, giver) => {
  const pack = build(partsFor({ ...roster, ruler: { ...roster.ruler, backer } }));
  const givers = pack.constitution!.holders.filter((holder) => holder.gives);
  expect(givers.map((holder) => holder.id)).toEqual(giver ? [giver] : []);
  if (giver) expect(givers[0].gives).toEqual({ ledger: "authority", amount: BACKER_AUTHORITY, per: "turn" });
});

test("the holders that vote are banded between 0.15 and 0.6 and sum to 1; the chamber votes with its blocs' share", () => {
  const weights = build(partsFor(roster)).constitution!.retention.weights;
  expect(weights.map((weight) => weight.id)).toEqual(["householder", CHAMBER_HOLDER]);
  expect(weights.reduce((total, weight) => total + weight.value, 0)).toBeCloseTo(1, 2);
  expect(weights.every((weight) => weight.value >= 0.15 && weight.value <= 0.6)).toBe(true);
});

test("a chamber over 72 seats is drawn at 72 and its threshold scales from the real one", () => {
  const real = { freshfood: 147, crisper: 64, freezer: 37, door: 23, tupperware: 4 } as Record<string, number>;
  const big: Roster = {
    ...roster,
    chamber: { ...roster.chamber!, real_size: 275 },
    groups: roster.groups.map((group) => (group.seats === null ? group : { ...group, seats: real[group.id] })),
  };
  const parts = partsFor(big);
  parts.world.chamber!.threshold = 138;
  const pack = build(parts);
  expect(pack.chamber).toMatchObject({ size: 72, threshold: 36 });
  expect(pack.members).toHaveLength(72);
});

test("a world with no chamber seats a court of 24 from its home groups, and law is unavailable", () => {
  const court: Roster = {
    ...roster,
    chamber: null,
    ruler: { ...roster.ruler, own_group: "expiry" },
    groups: roster.groups.filter((group) => group.seats === null),
  };
  const pack = build(partsFor(court));
  expect(pack.factions.map((faction) => faction.id)).toEqual(["expiry", "mould", "botulinum"]);
  expect(pack.chamber.size).toBe(24);
  expect(pack.members).toHaveLength(24);
  expect(pack.constitution!.instruments.law.available).toBe(false);
  expect(pack.constitution!.holders.some((holder) => holder.id === CHAMBER_HOLDER)).toBe(false);
});

test("pledge tags join the tags, and a patron's tag outside them is dropped", () => {
  const pack = build(partsFor(roster));
  expect(pack.tags).toContain("pledge-1");
  expect(pack.tags.length).toBeLessThanOrEqual(24);
  expect(pack.patrons[0].hates).not.toContain("not-a-tag");
  expect(pack.promises[0]).toEqual({ tag: "pledge-1", label: "Pledge 1" });
});

test("a card that breaks R36 leaves its holder without a glance, and emblems and faces land on their rows", () => {
  const disc: Emblem = { size: 64, elements: [{ tag: "circle", cx: 32, cy: 32, r: 26, fill: "ink" }] };
  const parts = partsFor(roster, {}, { mould: disc });
  parts.world.groups[0].hates = [{ tag: "A", red_line: true }, { tag: "B", red_line: true }];
  const pack = build(parts);
  const holders = pack.constitution!.holders;
  expect(holders.find((holder) => holder.id === "householder")?.glance).toBeUndefined();
  expect(holders.find((holder) => holder.id === "mould")?.emblem).toEqual(disc);
  expect(holders.find((holder) => holder.id === "expiry")?.glance?.face?.name).toBe("The FDA Expiry Date speaker");
  expect(holders.find((holder) => holder.id === "expiry")?.tint?.light).toMatch(/^#[0-9a-f]{6}$/);
  expect(pack.themeTokens).toBeDefined();
});

test.each([
  ["0001-01-01", "0001-01-21", "day", "0001-01-01"],
  ["1908-07-24", "1908-12-11", "week", "1908-07-24"],
  ["2021-01-20", "2022-09-21", "month", "2021-01-20"],
  ["1789-05-05", "1794-05-05", "season", "1789-05-05"],
  ["-44-03-15", "-0044-08-02", "week", "-0044-03-15"],
])("a term from %p to %p runs in %ps from %p", (start, end, unit, first) => {
  expect(calendarOf({ ...plan, start_date: start, term_end: end })).toEqual({ start_date: first, unit });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test worker/gen/assemble.test.ts`
Expected: FAIL, `Cannot find module './assemble'`.

- [ ] **Step 3: Write the assembler**

`worker/gen/assemble.ts`:

```ts
// Generation v2's world to the game's pack. Code builds all structure from the checked roster (ids, holders, the chamber
// and its drawn seats, the chamber as a holder, weights, lines, the seat's backer, the own group, a court when no chamber
// votes) and takes only words and judgements from the world parts. Stage 0's optional fields (glance cards, emblems,
// tints, icons, theme tokens, resource words) are filled here.
import type { Emblem } from "../emblem";
import { STANCE_HI, STANCE_LO } from "../engine";
import {
  ESCALATION_KEYS,
  FILLS,
  FONT_PAIRS,
  KINDS,
  PackSchema,
  VERBS,
  scaleSeats,
  type Citizen,
  type Member,
  type Pack,
  type Storylet,
} from "../pack";
import { MATERIALS, fitContrast, parseThemeTokens, type ThemeTokens, type Tint } from "../tokens";
import { UNIT, days, ymd, type Calendar } from "./calendar-math";
import type { Facts } from "./facts";
import { MAX_CHAMBER, type Frame } from "./frame";
import type { Gathered } from "./gather";
import { factionIds, hasChamber, toGlance, type Bible, type Plan, type Roster, type World } from "./schemas";
import { UNITS, fromDays } from "./validate";

export const COURT_SEATS = 24; // Decision 4: the members and the vote need seats even where no chamber votes on laws
export const BACKER_AUTHORITY = 3; // TUNE: the seat's backer pays this much authority a turn while it agrees
export const CHAMBER_HOLDER = "the_chamber"; // not "chamber": that word in a veto list means the chamber's vote
const BASE_PRICES: Record<(typeof VERBS)[number], { authority?: number; treasury?: number; chest?: number }> = {
  decree: { authority: 3 },
  law: { authority: 1 },
  appoint: { authority: 2 },
  spend: {},
  proclaim: { chest: 2 },
  favour: { authority: 2 },
  force: { authority: 4 },
};
const LOBBY_COSTS = { pork: 10, favor: 15, threat: 20 } as const;
const PALETTE = ["#2e6f8e", "#8e3b2e", "#5a7d2e", "#6e4a8e", "#8e7a2e", "#2e8e7a", "#8e2e5f", "#4a5a6e", "#7a5a3a", "#3a7a5a", "#5f2e8e", "#8e5a2e"];
const TEXTURE_OF: Record<(typeof MATERIALS)[number], Pack["theme"]["texture"]> = {
  newsprint: "newsprint",
  vellum: "parchment",
  parchment: "parchment",
  linen: "parchment",
  papyrus: "parchment",
  stone: "concrete",
  clay: "concrete",
  brass: "steel",
  steel: "steel",
  terminal: "steel",
  silk: "none",
  glass: "none",
};
const LAYOUT_OF = { hemicycle: "hemicycle", rows: "benches", ring: "circle", court: "court" } as const;

export type BuildParts = {
  id: string;
  prompt: string;
  plan: Plan;
  gathered: Gathered;
  roster: Roster;
  world: World;
  emblems: Record<string, Emblem>;
};
// The people steps start before the other parts land, so their frame needs only the bible, briefing and systems.
export type FrameInput = Omit<BuildParts, "world" | "emblems"> & {
  world: Pick<World, "bible" | "briefing" | "systems"> & Partial<Pick<World, "groups" | "chamber" | "theme" | "ledgers">>;
};
export type People = { members: Member[]; citizens: Citizen[]; deck: Storylet[] };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const slug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// The unit whose 20 turns come closest to the plan's term; a week when the dates do not parse.
export function calendarOf(plan: Plan): Calendar {
  const start = ymd(plan.start_date);
  const end = ymd(plan.term_end);
  const span = start && end ? days(end) - days(start) : 20 * UNIT.week;
  const unit = UNITS.reduce((best, candidate) =>
    Math.abs(20 * UNIT[candidate] - span) < Math.abs(20 * UNIT[best] - span) ? candidate : best,
  );
  return { start_date: start ? fromDays(days(start)) : "0001-01-01", unit };
}

// The real people of the world, for the check that no invented member carries one of their names.
export function factsOf(plan: Plan, roster: Roster, bible: Bible): Facts {
  const names = [
    ...new Set(
      [roster.ruler.name, plan.seat.holder, ...plan.people, ...bible.groups.map((group) => group.face)].filter(
        (name): name is string => !!name?.trim(),
      ),
    ),
  ];
  return {
    people: names.map((name) => ({ name, role: "", born: null, died: null, alive_on_start_date: true })),
    bodies: [],
    groupings: [],
    dated_events: bible.history.map((beat) => ({ date: beat.date, title: beat.beat })),
    anchor: -1,
  };
}

// Decision 5: the own group when it sits in the chamber (or the court); else the faction with the most support.
export function rulerFaction(roster: Roster): string {
  const ids = factionIds(roster);
  if (ids.includes(roster.ruler.own_group)) return roster.ruler.own_group;
  const supportOf = (id: string) => roster.groups.find((group) => group.id === id)?.support ?? 0;
  return [...ids].sort((a, b) => supportOf(b) - supportOf(a))[0];
}

function chamberOf(roster: Roster, world: FrameInput["world"]) {
  if (hasChamber(roster)) {
    const rows = roster.groups.filter((group) => group.seats !== null);
    const real = Math.max(roster.chamber!.real_size, rows.length);
    const size = Math.min(MAX_CHAMBER, real);
    const seats = scaleSeats(Object.fromEntries(rows.map((group) => [group.id, Math.max(group.seats ?? 0, 0)])), size);
    const written = world.chamber?.threshold ?? Math.floor(real / 2) + 1;
    // Lesson 12: the threshold scales from the real chamber; a clamp once gave 100 of 100.
    const threshold = clamp(Math.round(real > size ? (written * size) / real : written), 1, size);
    return { size, threshold, seats };
  }
  const ids = new Set(factionIds(roster));
  const court = roster.groups.filter((group) => ids.has(group.id));
  const seats = scaleSeats(Object.fromEntries(court.map((group) => [group.id, Math.max(group.vote_share, 0.05)])), COURT_SEATS);
  return { size: COURT_SEATS, threshold: Math.floor(COURT_SEATS / 2) + 1, seats };
}

function tagsOf(world: FrameInput["world"]): string[] {
  const pledged = world.briefing.pledges.map((pledge) => slug(pledge.tag));
  return [...new Set([...pledged, ...world.systems.tags.map(slug)])].filter(Boolean).slice(0, 24);
}

function oldTheme(tokens: ThemeTokens, shape: keyof typeof LAYOUT_OF): Pack["theme"] {
  return {
    fonts: FONT_PAIRS.find((pair) => pair.startsWith(`${tokens.display} +`)) ?? "Fraunces + Inter",
    ink: tokens.light.ink,
    paper: tokens.light.paper,
    accent: tokens.light.accent,
    texture: TEXTURE_OF[tokens.material],
    ornament: "none", // no logos, stamps or crests at world level
    layout: LAYOUT_OF[shape],
  };
}

// The first two sentences of the situation, at most 60 words: the match card's description.
const describe = (situation: string) =>
  situation
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ")
    .split(/\s+/)
    .slice(0, 60)
    .join(" ");

export function frameOf(input: FrameInput): Frame {
  const { plan, roster, world } = input;
  const { bible, briefing, systems } = world;
  const chamber = chamberOf(roster, world);
  const tags = tagsOf(world);
  const known = (list: string[]) => list.map(slug).filter((tag) => tags.includes(tag)).slice(0, 3);
  const ruler = rulerFaction(roster);
  const withYou = (world.chamber?.factions ?? []).filter((row) => row.with_you).map((row) => row.id);
  const ownSupport = roster.groups.find((group) => group.id === roster.ruler.own_group)?.support ?? 50;
  const tokens = parseThemeTokens(world.theme ?? null).tokens;
  const factionIdsList = factionIds(roster);
  const factions = factionIdsList.map((id, index) => {
    const group = roster.groups.find((candidate) => candidate.id === id)!;
    const entry = bible.groups.find((candidate) => candidate.id === id);
    const written = world.chamber?.factions.find((row) => row.id === id) ?? world.groups?.find((row) => row.id === id);
    return {
      id,
      name: group.name,
      short: entry?.short || group.name,
      color: written?.color ?? PALETTE[index % PALETTE.length],
      fill: FILLS[index % FILLS.length],
      ideology: entry?.identity ?? group.wants,
      leader: entry?.face ?? "",
      seats: chamber.seats[id] ?? 0,
    };
  });
  const regionRows = new Map(systems.regions.map((region) => [region.id, region]));
  const regionWeights = bible.regions.map((region) => Math.max(regionRows.get(region.id)?.weight ?? 0, 0));
  const weightTotal = regionWeights.reduce((total, weight) => total + weight, 0);
  const vocabulary = bible.vocabulary;
  return {
    title: bible.title,
    era: bible.era,
    place: bible.place,
    description: describe(briefing.briefing.situation),
    content_note: null,
    vocabulary: {
      seat: vocabulary.seat,
      chamber: vocabulary.chamber,
      member: vocabulary.member,
      bill: vocabulary.bill,
      pass: vocabulary.pass,
      fail: vocabulary.fail,
      capital: vocabulary.capital,
      turn: vocabulary.turn,
      midterm: vocabulary.midterm,
      campaign: vocabulary.campaign,
      test: vocabulary.test,
      feed: vocabulary.feed,
      post: vocabulary.post,
      whip: vocabulary.whip,
      lobby: vocabulary.lobby,
      promise: vocabulary.promise,
      patron: vocabulary.patron,
      approval: vocabulary.approval,
    },
    theme: oldTheme(tokens, world.chamber?.shape ?? (hasChamber(roster) ? "hemicycle" : "court")),
    chamber: {
      size: chamber.size,
      threshold: chamber.threshold,
      supermajority: clamp(Math.ceil((chamber.size * 2) / 3), Math.min(chamber.threshold + 1, chamber.size), chamber.size),
      alpha: 0.5, // read only by packs without a constitution
      veto: null,
    },
    factions,
    regions: bible.regions.map((region, index) => ({
      id: region.id,
      name: region.name,
      weight: weightTotal > 0 ? regionWeights[index] / weightTotal : 1 / bible.regions.length,
      lean: factionIdsList.map((id) => ({
        id,
        value: clamp(regionRows.get(region.id)?.lean.find((lean) => lean.faction === id)?.value ?? 0, -1, 1),
      })),
    })),
    blocs: systems.blocs.slice(0, 5).map((bloc, index) => ({ id: slug(bloc.id) || `bloc-${index + 1}`, name: bloc.name, description: bloc.description })),
    patrons: systems.patrons.slice(0, 10).map((patron, index) => {
      const wants = known(patron.wants);
      const hates = known(patron.hates).filter((tag) => !wants.includes(tag));
      return {
        id: slug(patron.id) || `patron-${index + 1}`,
        name: patron.name,
        wants: wants.length ? wants : [tags[index % tags.length]],
        hates: hates.length ? hates : [tags[(index + 1) % tags.length]],
      };
    }),
    tags,
    problems: briefing.problems.slice(0, 12),
    promises: briefing.pledges.slice(0, 8).map((pledge) => ({ tag: slug(pledge.tag), label: pledge.text })),
    starts: factions.map((faction) => ({
      faction: faction.id,
      seat_title: vocabulary.seat,
      coalition: faction.id === ruler ? [faction.id, ...withYou.filter((id) => id !== faction.id)] : [faction.id],
      premise: faction.ideology,
      party: ownSupport,
      capital: clamp(Math.round(world.ledgers?.authority.start ?? 40), 0, 100),
      hostile: [],
    })),
    test: systems.test,
    endings: {
      reelected: systems.endings.reelected,
      defeated: systems.endings.defeated,
      lame_duck: systems.endings.lame_duck,
      impeached: systems.endings.impeached,
    },
    lobby: {
      pork: { cost: LOBBY_COSTS.pork, ...systems.lobby.pork },
      favor: { cost: LOBBY_COSTS.favor, ...systems.lobby.favor },
      threat: { cost: LOBBY_COSTS.threat, ...systems.lobby.threat },
    },
    escalations: ESCALATION_KEYS.map((key) => {
      const row = systems.escalations.find((escalation) => escalation.key === key);
      return { key, name: row?.name ?? key.replace(/_/g, " "), headline: row?.headline ?? "" };
    }),
    start_date: calendarOf(plan).start_date,
  };
}

// Scale, then clamp to the 0.15 to 0.6 band, the scale found by bisection so the weights sum to 1 (from constitution.ts).
function band(values: number[]): number[] {
  const LOW = 0.15;
  const HIGH = 0.6;
  if (!values.length) return [];
  if (values.length * LOW > 1 || values.length * HIGH < 1) {
    const total = values.reduce((sum, value) => sum + value, 0);
    return values.map((value) => value / total);
  }
  const at = (scale: number) => values.map((value) => Math.min(HIGH, Math.max(LOW, value * scale)));
  let low = 0;
  let high = HIGH / Math.min(...values);
  for (let i = 0; i < 100; i++) {
    const scale = (low + high) / 2;
    if (at(scale).reduce((sum, value) => sum + value, 0) < 1) low = scale;
    else high = scale;
  }
  return at(high);
}

function tintOf(color: string | undefined, tokens: ThemeTokens): Tint | undefined {
  if (!color) return undefined;
  const light = fitContrast(color, [tokens.light.paper, tokens.light.surface]);
  const dark = fitContrast(color, [tokens.dark.paper, tokens.dark.surface]);
  return light && dark ? { light, dark } : undefined;
}

export function packOf(parts: BuildParts, people: People): Pack {
  const { plan, roster, world, emblems, gathered } = parts;
  const { bible } = world;
  const frame = frameOf(parts);
  const tokens = parseThemeTokens(world.theme).tokens;
  const entryOf = (id: string) => bible.groups.find((group) => group.id === id);
  const faceOf = (id: string) => {
    const entry = entryOf(id);
    return entry ? { name: entry.face, role: entry.face_role } : undefined;
  };
  const groupRowOf = (id: string) => world.groups.find((row) => row.id === id);
  const factionRowOf = (id: string) => world.chamber?.factions.find((row) => row.id === id) ?? groupRowOf(id);
  const forceVetoes = new Set(world.instruments.force.vetoes);
  const unseated = roster.groups.filter((group) => group.seats === null);
  const holders: Record<string, unknown>[] = unseated.map((group) => {
    const row = groupRowOf(group.id);
    const face = faceOf(group.id);
    const glance = row ? toGlance(row, face) : null;
    return {
      id: group.id,
      name: group.name,
      short: entryOf(group.id)?.short,
      where: group.sits,
      persona: { name: face?.name ?? group.name, role: face?.role ?? "", bio: entryOf(group.id)?.identity ?? group.wants, tell: "" },
      members: group.kind === "public" ? "citizens" : "none",
      stance: clamp(group.support / 100, STANCE_LO, STANCE_HI),
      support: group.support,
      // Lesson 15: a line sits 10 to 25 below day-one support.
      line: clamp(row?.line ?? group.support - 15, Math.max(1, group.support - 25), Math.max(1, group.support - 10)),
      response: group.can_dismiss ? "dismiss" : (row?.response ?? "none"),
      levers: forceVetoes.has(group.id) ? ["force"] : [],
      wants: glance?.wants ?? [],
      redLines: glance?.hates.filter((hate) => hate.redLine).map((hate) => hate.tag) ?? [],
      gives:
        group.id === roster.ruler.backer && group.sits === "home"
          ? { ledger: "authority", amount: BACKER_AUTHORITY, per: "turn" }
          : null,
      responses: [],
      icon: row?.icon,
      glance: glance ?? undefined,
      emblem: emblems[group.id],
      tint: tintOf(row?.color, tokens),
    };
  });
  const chamberId = roster.groups.some((group) => group.id === CHAMBER_HOLDER) ? `${CHAMBER_HOLDER}_2` : CHAMBER_HOLDER;
  const withYou = new Set((world.chamber?.factions ?? []).filter((row) => row.with_you).map((row) => row.id));
  if (hasChamber(roster)) {
    const backing = frame.factions
      .filter((faction) => faction.id === roster.ruler.own_group || withYou.has(faction.id))
      .reduce((total, faction) => total + faction.seats, 0);
    const support = clamp(Math.round((100 * backing) / frame.chamber.size), 5, 95);
    const name = world.chamber?.name ?? bible.vocabulary.chamber;
    holders.push({
      id: chamberId,
      name,
      where: "home",
      persona: { name, role: bible.vocabulary.member, bio: "", tell: "" },
      members: "seats",
      stance: clamp(support / 100, STANCE_LO, STANCE_HI),
      support,
      line: Math.max(1, support - 15),
      response: "early_test",
      levers: [],
      wants: [],
      redLines: [],
      gives: null,
      responses: [],
      icon: "chamber",
    });
  }
  const seatShare = roster.groups
    .filter((group) => group.seats !== null)
    .reduce((total, group) => total + Math.max(group.vote_share, 0), 0);
  const voters: [string, number][] = [
    ...unseated.filter((group) => group.vote_share > 0).map((group): [string, number] => [group.id, group.vote_share]),
    ...(hasChamber(roster) && seatShare > 0 ? [[chamberId, seatShare] as [string, number]] : []),
  ];
  const banded = band(voters.map(([, share]) => share));
  const holderIds = new Set(holders.map((holder) => holder.id as string));
  const allowed = (veto: string) =>
    holderIds.has(veto) || (hasChamber(roster) && (veto === "chamber" || veto === "chamber_supermajority"));
  const instruments = Object.fromEntries(
    VERBS.map((verb) => {
      const written = world.instruments[verb];
      const vetoes = [...new Set(written.vetoes)].filter(allowed).slice(0, 2);
      const consent = vetoes.includes("chamber_supermajority")
        ? "chamber_supermajority"
        : vetoes.includes("chamber")
          ? "chamber"
          : vetoes.some((veto) => forceVetoes.has(veto))
            ? "army"
            : "none";
      return [
        verb,
        {
          name: written.name,
          consent,
          price: { authority: 0, treasury: 0, chest: 0, ...BASE_PRICES[verb] },
          available: verb === "law" && !hasChamber(roster) ? false : written.available,
          vetoes,
        },
      ];
    }),
  );
  const publicGroup = roster.groups.find((group) => group.kind === "public")!.id;
  const resource = (ledger: World["ledgers"]["treasury"]) => ({
    name: ledger.name,
    line: ledger.line,
    icon: ledger.icon,
    for: ledger.for,
    earn: ledger.earn,
    spend: ledger.spend,
    fails: ledger.fails,
  });
  return PackSchema.parse({
    ...frame,
    v: 1,
    id: parts.id,
    lang: "en",
    prompt: parts.prompt,
    fiction: plan.kind >= 6,
    kind: KINDS[plan.kind - 1],
    grounding: roster.grounding_line,
    history: { fall: roster.fall ? { date: roster.fall.date, what: roster.fall.what } : null },
    sources: gathered.docs
      .filter((doc) => doc.title !== "Category sweep")
      .map((doc) => {
        const host = doc.source.startsWith("Wikipedia") ? "en.wikipedia.org" : doc.source.split(":")[0];
        return { title: doc.title, url: `https://${host}/wiki/${encodeURIComponent(doc.title.replace(/ /g, "_"))}` };
      }),
    vocabulary: {
      ...frame.vocabulary,
      file: bible.vocabulary.file,
      ...(bible.vocabulary.abroad ? { abroad: bible.vocabulary.abroad } : {}),
    },
    factions: frame.factions.map((faction) => {
      const row = factionRowOf(faction.id);
      return {
        ...faction,
        glance: (row && toGlance(row, faceOf(faction.id))) ?? undefined,
        emblem: emblems[faction.id],
        tint: tintOf(faction.color, tokens),
      };
    }),
    calendar: calendarOf(plan),
    members: people.members,
    citizens: people.citizens,
    deck: people.deck,
    endings: world.systems.endings,
    constitution: {
      ruler: {
        role: world.briefing.ruler.role,
        faction: rulerFaction(roster),
        above: roster.ruler.above && holderIds.has(roster.ruler.above) ? roster.ruler.above : null,
        removedBy: world.briefing.ruler.removed_by,
      },
      holders,
      instruments,
      retention: {
        name: bible.vocabulary.test,
        weights: voters.map(([id], index) => ({ id, value: Math.round(banded[index] * 1000) / 1000 })),
      },
      halfTerm: { holder: publicGroup, name: bible.vocabulary.midterm },
      ledgers: {
        treasury: resource(world.ledgers.treasury),
        authority: resource(world.ledgers.authority),
        chest: resource(world.ledgers.chest),
        loyalty: { name: world.ledgers.loyalty.name, line: world.ledgers.loyalty.line },
        popularity: { name: world.ledgers.popularity.name, line: world.ledgers.popularity.line },
      },
      briefing: world.briefing.briefing,
      publicGroup,
      ownGroup: roster.ruler.own_group,
    },
    themeTokens: tokens,
  });
}
```

- [ ] **Step 4: Run the test**

Run: `bun test worker/gen/assemble.test.ts`
Expected: PASS, 16 tests. The chamber holder's support in the first test is 62: the own party (32 seats) and the bloc that votes with it (5) are 37 of 60.

- [ ] **Step 5: Run the gates and commit**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green.

```bash
git add worker/gen/assemble.ts worker/gen/assemble.test.ts
git commit -m "Generation v2 assembler: code builds the pack's structure from the roster and fills every Stage 0 field from the world"
```

---

### Task 7: The Workflow, member glance cards, and the retirement of the old path

**Files:**
- Modify: `worker/gen/personas.ts` (member glance cards), `worker/gen/personas.test.ts` (one parametrised test)
- Modify: `worker/db.ts` (`putFragment`)
- Rewrite: `worker/build.ts`
- Delete: `worker/gen/plan.ts`, `worker/gen/calendar.ts`, `worker/gen/constitution.ts`, `worker/gen/constitution.test.ts`, `worker/gen/frame.test.ts`
- Trim: `worker/gen/facts.ts`, `worker/gen/frame.ts`, `worker/gen/validate.ts`, `worker/gen/validate.test.ts`, `worker/gen/prompts.ts`, `worker/gen/prompts.test.ts`
- Modify: `worker/daily.ts:13` (Decision 17)

**Interfaces:**
- Consumes: everything Tasks 1 to 6 produce, by the names in their Interfaces blocks: `callModel`, `ModelStop`, `GROK`, `type Caller`, `type CallRequest`, `type StopReason`, `type Usage` (Task 1); `recordCall`, `buildSpend`, `putPart` (Task 1); `gather` (Task 2); `writePlan`, `writeRoster`, `settleRoster` (Task 3); `worldPrefix`, `writeBible`, `checkBible`, `planJobs`, `runJob`, `checkPart`, `mergeWorld`, `type Job`, `type WorldContext` (Task 4); `rewriteWorld` (Task 4); `emblemsFor` (Task 5); `calendarOf`, `factsOf`, `frameOf`, `packOf`, `type People` (Task 6); `parseThemeTokens` (`worker/tokens.ts`); `GlanceSchema`, `type Glance` (`worker/pack.ts`); the existing Luna steps `names`, `membersStep`, `citizensStep` (`worker/gen/personas.ts`), `dedupe` (`worker/gen/dedupe.ts`), `deck` (`worker/gen/deck.ts`), `assignMembers`, `assignCitizens` (`worker/gen/assign.ts`), `NeedsRepair`, `matchName`, `realNames` (`worker/gen/validate.ts`), `type GenCtx` (`worker/gen/prompts.ts`).
- Produces: `ScenarioBuild` and `type BuildParams` (same names and payload as today, so `worker/index.ts` and `worker/daily.ts` are unchanged); `putFragment(env, id, fragment)` in `worker/db.ts`; `glance` on members written by `membersStep`. The build's `step` column moves through `plan`, `gather`, `roster`, `check`, `bible`, `sections`, `people`, `finish`, then `ready` (written by `putPack`). The fragment kinds are listed under "Cross-track requests".

The Workflow's shape (every box is one `step.do`; boxes on one row run at the same time):

| Phase (`step` column) | Steps | Stops the build when |
|---|---|---|
| plan | `plan` | the plan call stops (filter, length) |
| gather | `gather` | never (a page that fails is skipped) |
| roster | `roster` | the roster call stops |
| check | `check` (checks, one repair, fit) | a blocking check is left after the repair |
| bible | `bible` (one repair) | a B1 failure is left after the repair |
| sections | `part-groups1` ... `part-theme` and `emblems`, all at once; `names` → `personas` → `dedupe`, and `deck`, start when `part-briefing` and `part-systems` land | a required part (briefing, ledgers, instruments, systems) stops or keeps a blocking failure |
| finish | `rewrite`, `index` (never fails the build), `assemble` | the pack does not parse |

- [ ] **Step 1: Extend the persona test (member glance cards)**

In `worker/gen/personas.test.ts`, add below the line `let rename: string | null = "Ossin Venn";`:

```ts
let hates: { tag: string; red_line: boolean }[] = [{ tag: "Bribes", red_line: true }];
```

In the mocked `luna`, replace

```ts
        tell: "Taps the bench twice.",
        patrons: [],
```

with

```ts
        tell: "Taps the bench twice.",
        patrons: [],
        wants: ["Dock wages"],
        hates,
        strike: "Votes against the harbour bill.",
```

Append at the end of the file:

```ts
describe("member glance cards", () => {
  test.each([
    [
      [{ tag: "Bribes", red_line: true }, { tag: "Harbour tax", red_line: false }],
      [{ tag: "Bribes", redLine: true }, { tag: "Harbour tax", redLine: false }],
    ],
    [[{ tag: "Bribes", red_line: true }, { tag: "Harbour tax", red_line: true }], undefined],
    [[{ tag: "Harbour tax", red_line: false }], undefined],
  ])("hates %j give the member card the hates %j", async (written, shown) => {
    hates = written;
    const { members } = await membersStep({} as never, ctx(["Kira Vance"]));
    expect(members![0].glance?.hates).toEqual(shown);
    if (shown) expect(members![0].glance).toMatchObject({ wants: ["Dock wages"], strike: "Votes against the harbour bill." });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test worker/gen/personas.test.ts`
Expected: the first new row FAILS (`glance` is undefined); the other two rows and the three old tests pass.

- [ ] **Step 3: Write the member card into the persona call**

In `worker/gen/personas.ts`:

1. Change the pack import to `import { GENDERS, GlanceSchema, type Citizen, type Glance, type Member } from "../pack";`.
2. Above `const MemberProse`, add:

```ts
// R36's card on each member (Decision 10): Luna writes it with the bio. The engine never reads it, so a card that
// breaks the one-red-line rule is dropped, not repaired.
const CardFields = {
  wants: z.array(z.string()),
  hates: z.array(z.object({ tag: z.string(), red_line: z.boolean() })),
  strike: z.string(),
};
```

3. Add `...CardFields,` as the last field of the row object in both `MemberProse` and `MemberRewrite`.
4. Add three optional fields to `type Prose`: `wants?: string[]; hates?: { tag: string; red_line: boolean }[]; strike?: string;`
5. Below `type Prose`, add:

```ts
function glanceOf(prose: Prose): Glance | undefined {
  if (!prose.wants || !prose.hates || !prose.strike) return undefined;
  const card = GlanceSchema.safeParse({
    wants: prose.wants.slice(0, 3),
    hates: prose.hates.slice(0, 3).map((hate) => ({ tag: hate.tag, redLine: hate.red_line })),
    strike: prose.strike,
  });
  return card.success ? card.data : undefined;
}
```

6. In `MEMBER_SYSTEM`, replace `Write only bio, core_issues, tell and patrons.` with `Write only bio, core_issues, tell, patrons, wants, hates and strike.` and add these three lines after the `patrons:` line:

```
- wants: 1 to 3 tags of acts this member wants from the ruler, each 1 to 3 words ("Dock wages").
- hates: 1 to 3 tags of acts this member fights, exactly one with red_line true: the act that turns them for good. A member who takes no money has the hate tag "Bribes".
- strike: one short line, third person, on what they do when they turn on the ruler.
```

7. In `members()`, change the token budget `600 + part.length * 160` to `600 + part.length * 200` (the card is about 40 more tokens a row), and in the `out.set(m.id, { ... })` object add, after `patrons: ...`:

```ts
          ...(glanceOf(p) ? { glance: glanceOf(p) } : {}),
```

- [ ] **Step 4: Run the test**

Run: `bun test worker/gen/personas.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add `putFragment` to `worker/db.ts`**

Below `putStatus`:

```ts
// A readable piece of the world for the build screen. Parallel steps each add theirs; the step column stays as it is.
export async function putFragment(env: Env, id: string, fragment: Record<string, unknown>) {
  await env.DB.prepare(
    "UPDATE scenarios SET fragments = json_insert(COALESCE(fragments, '[]'), '$[#]', json(?)) WHERE id = ?",
  )
    .bind(JSON.stringify(fragment), id)
    .run();
}
```

- [ ] **Step 6: Rewrite `worker/build.ts`**

Replace the whole file with:

```ts
// The scenario build, generation v2: plan, gather, roster, check and bible in order; then the world parts and the
// emblems as parallel steps, and the Luna people steps once the bible, briefing and systems have landed; then a style
// rewrite, the search index and the pack. Every step result stays under the Workflows 1 MiB cap: the pack is written
// to D1 inside its own step.
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { buildSpend, failScenario, putFragment, putMeta, putPack, putPart, putStatus, recordCall } from "./db";
import { UpstreamError, type Env } from "./jev";
import type { Member } from "./pack";
import { parseThemeTokens } from "./tokens";
import { calendarOf, factsOf, frameOf, packOf, type People } from "./gen/assemble";
import { assignCitizens, assignMembers } from "./gen/assign";
import { dedupe } from "./gen/dedupe";
import { deck } from "./gen/deck";
import { emblemsFor } from "./gen/emblems";
import { gather, type Gathered } from "./gen/gather";
import { rewriteWorld } from "./gen/lint";
import { GROK, ModelStop, callModel, type CallRequest, type Caller, type StopReason, type Usage } from "./gen/openrouter";
import { citizensStep, membersStep, names } from "./gen/personas";
import type { GenCtx } from "./gen/prompts";
import { settleRoster, writePlan, writeRoster } from "./gen/roster";
import type { Parts, Plan, World } from "./gen/schemas";
import { NeedsRepair, matchName, realNames } from "./gen/validate";
import {
  checkBible,
  checkPart,
  mergeWorld,
  planJobs,
  runJob,
  worldPrefix,
  writeBible,
  type Job,
  type WorldContext,
} from "./gen/world";

export type BuildParams = { id: string; prompt: string };

const DEFAULT_COST_CAP = 3; // Decision 15: dollars of Opus and Grok one build may spend
// A world call may wait 10 minutes on Opus, 20 on Grok after a filter, and its one repair as long again.
const MODEL_STEP: WorkflowStepConfig = {
  retries: { limit: 1, delay: "10 seconds", backoff: "constant" },
  timeout: "45 minutes",
};
// timeout: an OpenRouter call can stall with no answer; without it the step, and the build, hang forever.
const RETRY: WorkflowStepConfig = {
  retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
  timeout: "4 minutes",
};
const FETCH_STEP: WorkflowStepConfig = { ...RETRY, timeout: "10 minutes" };
// A Luna step already retries inside luna() and post(); a third layer multiplies the paid calls.
const LUNA_STEP: WorkflowStepConfig = { ...RETRY, retries: { limit: 1, delay: "5 seconds", backoff: "exponential" } };
// The parts the pack cannot be built without; a missing groups, chamber, factions or theme part leaves defaults.
const REQUIRED = new Set(["briefing", "ledgers", "instruments", "systems"]);

const plain = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

// ---- the model calls: one transport, the per-build ledger, the budget ----

function callerFor(env: Env, id: string): Caller {
  const cap = Number(env.BUILD_COST_CAP ?? DEFAULT_COST_CAP);
  const transport = { key: env.OPENROUTER_API_KEY, onUsage: (usage: Usage) => recordCall(env, id, usage) };
  return async <T>(request: CallRequest<T>): Promise<T> => {
    // Parallel parts can each start one call past the cap; the overshoot is at most one call per part.
    if ((await buildSpend(env, id)) >= cap)
      throw new NonRetryableError("This world ran past its build budget. Try a narrower prompt.");
    return callModel(transport, request);
  };
}

// Lesson 4: a filtered or cut-off answer is final. An upstream failure is left to the step's one retry.
const STOPPED: Record<Exclude<StopReason, "upstream">, string> = {
  content_filter: "The models would not write this world. Try a different prompt.",
  length: "Part of this world ran too long to finish. Try a narrower prompt.",
  invalid: "The generator returned an answer it could not read twice. Try again in a minute.",
};
function stopped(error: unknown): never {
  if (error instanceof ModelStop && error.reason !== "upstream") throw new NonRetryableError(STOPPED[error.reason]);
  throw error;
}

// ---- the Luna people steps: one retry of the whole step on Grok after a refusal, as before ----

// Narrow on purpose: a bare "content" or "policy" also matches an ordinary schema or content-type 400,
// which then costs a Grok retry and tells the player the models would not write their scenario.
const REFUSAL_MARKERS = [
  "refus",
  "content_policy",
  "content policy",
  "content_filter",
  "moderation",
  "safety",
  "cannot help",
  "can't help",
];
const refused = (e: unknown): e is UpstreamError =>
  e instanceof UpstreamError &&
  (e.status === 400 || e.status === 403) &&
  REFUSAL_MARKERS.some((m) => e.message.toLowerCase().includes(m));

async function onRefusal<T>(env: Env, step: string, fn: (env: Env) => Promise<T>): Promise<T> {
  try {
    return await fn(env);
  } catch (e) {
    if (!refused(e)) {
      if (e instanceof UpstreamError) {
        console.error(`upstream error at ${step}`, e.message);
        throw new NonRetryableError(`The generator failed at ${step}. Try again in a minute.`);
      }
      throw e;
    }
    try {
      return await fn({ ...env, MODEL: GROK });
    } catch {
      throw new NonRetryableError("The models would not write this scenario. Try a different prompt.");
    }
  }
}

// membersStep rejects a member carrying a real name of the period. Swapping in a surname the roster already
// holds clears most clashes for free, which beats paying for a rewrite round on a 72-seat chamber.
function renameClashes(members: Member[], real: string[]): Member[] {
  const surnames = [...new Set(members.map((m) => m.name.trim().split(/\s+/).pop() ?? "").filter(Boolean))];
  return members.map((m) => {
    if (!matchName(m.name, real)) return m;
    const parts = m.name.trim().split(/\s+/);
    const name = surnames.map((s) => [...parts.slice(0, -1), s].join(" ")).find((n) => n && !matchName(n, real));
    return name ? { ...m, name } : m;
  });
}

async function personasStep(env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  const real = realNames(ctx.frame, ctx.facts);
  const both = async (c: GenCtx) => {
    const [m, z] = await Promise.all([membersStep(env, c), citizensStep(env, c)]);
    return { ...m, ...z };
  };
  try {
    return await both({ ...ctx, members: renameClashes(ctx.members, real) });
  } catch (e) {
    if (!(e instanceof NeedsRepair)) throw e;
    const fresh = { ...ctx, ...(await names(env, ctx)) };
    try {
      return await both({ ...fresh, members: renameClashes(fresh.members, real) });
    } catch (e2) {
      if (!(e2 instanceof NeedsRepair)) throw e2;
      throw new NonRetryableError(
        `The roster kept naming real people of the period: ${e2.violations.slice(0, 2).join("; ")}`,
      );
    }
  }
}

// ---- fragments: what the build screen can show before the pack exists ----

function fragmentOf(job: Job, part: unknown): Record<string, unknown> | null {
  switch (job.kind) {
    case "groups":
      return {
        kind: "groups",
        rows: (part as Parts["groups"]).groups.map(({ id, icon, color, wants, hates, strike }) => ({
          id,
          icon,
          color,
          wants,
          hates,
          strike,
        })),
      };
    case "chamber": {
      const { chamber } = part as Parts["chamber"];
      return {
        kind: "chamber",
        name: chamber.name,
        shape: chamber.shape,
        factions: chamber.factions.map(({ id, color, with_you }) => ({ id, color, with_you })),
      };
    }
    case "briefing": {
      const written = part as Parts["briefing"];
      return {
        kind: "briefing",
        role: written.ruler.role,
        situation: written.briefing.situation,
        problems: written.problems.slice(0, 3),
        pledges: written.pledges.map((pledge) => pledge.text),
      };
    }
    case "theme":
      // Only validated tokens leave the worker; a palette the checks cannot fix is the default.
      return { kind: "theme", tokens: parseThemeTokens((part as Parts["theme"]).theme).tokens };
    default:
      return null;
  }
}

// ---- the search entry: a failure leaves the world loadable by id and by the daily, not matchable (Decision 12) ----

async function indexWorld(env: Env, id: string, text: string, metadata: Record<string, string>) {
  const r = (await env.AI.run("@cf/baai/bge-m3", { text: [text] } as never)) as any;
  const values: number[] | undefined = r?.data?.[0] ?? r?.response?.data?.[0];
  if (!Array.isArray(values)) throw new Error("bge-m3 returned no vector");
  await env.VEC.upsert([{ id, values, metadata }]);
}

// ---- the Workflow ----

export class ScenarioBuild extends WorkflowEntrypoint<Env, BuildParams> {
  async run(event: WorkflowEvent<BuildParams>, step: WorkflowStep) {
    const env = this.env;
    const { id, prompt } = event.payload;
    const started = event.timestamp.getTime();
    const call = callerFor(env, id);
    const show = (fragment: Record<string, unknown>) => putFragment(env, id, { ...fragment, at: Date.now() - started });
    // step.do types its result through Serializable<T>, which a generic T can never satisfy; every step here returns JSON.
    const run = <T>(name: string, fn: () => Promise<T>, config: WorkflowStepConfig = MODEL_STEP): Promise<T> =>
      step.do(name, config, async () => (await fn()) as never) as Promise<T>;

    try {
      const plan: Plan = await run("plan", async () => {
        await putStatus(env, id, "plan");
        const written = await writePlan(call, prompt, new Date(started).toISOString().slice(0, 10)).catch(stopped);
        await show({
          kind: "plan",
          seat: written.seat.office,
          holder: written.seat.holder,
          start: written.start_date,
          end: written.term_end,
          lookups: written.lookups,
        });
        return written;
      });

      const found: Gathered = await run(
        "gather",
        async () => {
          await putStatus(env, id, "gather");
          const gathered = await gather(plan);
          await show({ kind: "sources", pages: gathered.docs.map((doc) => doc.title) });
          return gathered;
        },
        FETCH_STEP,
      );

      const drafted = await run("roster", async () => {
        await putStatus(env, id, "roster");
        const written = await writeRoster(call, prompt, plan, found).catch(stopped);
        await show({
          kind: "roster",
          groups: written.roster.groups.map((group) => ({
            id: group.id,
            name: group.name,
            sits: group.sits,
            seats: group.seats,
            wants: group.wants,
          })),
        });
        return written;
      });

      const { roster, gathered } = await run("check", async () => {
        await putStatus(env, id, "check");
        const settled = await settleRoster(call, drafted.roster, { plan, gathered: drafted.gathered }).catch(stopped);
        await putPart(env, id, "roster-checks", { before: settled.before, after: settled.after });
        const blocking = settled.after.filter((fail) => fail.blocking);
        if (blocking.length)
          throw new NonRetryableError(
            `This world does not hold together (${blocking[0].message.slice(0, 120)}). Try a narrower prompt.`,
          );
        return { roster: settled.roster, gathered: settled.gathered };
      });

      const prefix = worldPrefix(prompt, plan, roster, gathered);
      const canon = await run("bible", async () => {
        await putStatus(env, id, "bible");
        let written = await writeBible(call, prefix).catch(stopped);
        const before = checkBible(written.bible, roster);
        if (before.length) written = await writeBible(call, prefix, { ...written, fails: before }).catch(stopped);
        const after = before.length ? checkBible(written.bible, roster) : [];
        await putPart(env, id, "bible-checks", { before, after });
        if (after.length)
          throw new NonRetryableError("The world's canon would not come out whole. Try again in a minute.");
        const { bible } = written;
        await show({
          kind: "bible",
          title: bible.title,
          era: bible.era,
          place: bible.place,
          voice: bible.house_voice,
          vocabulary: bible.vocabulary,
          groups: bible.groups.map(({ id: group, name, short, identity, face }) => ({ id: group, name, short, identity, face })),
        });
        await putStatus(env, id, "sections");
        return written;
      });

      const context: WorldContext = { prefix, roster, bible: canon.bible, model: canon.model, plan, gathered };
      const jobs = planJobs(roster);
      const partOf = (job: Job): Promise<unknown> =>
        run(`part-${job.name}`, async () => {
          let part: unknown;
          try {
            part = await runJob(call, job, context);
          } catch (error) {
            if (REQUIRED.has(job.name)) stopped(error);
            console.error(`part ${job.name} left out`, plain(error));
            return null;
          }
          const before = checkPart(job, part, context);
          let after = before;
          if (before.length) {
            // Section-scoped repair: only this part is written again, with its own failures.
            const again = await runJob(call, job, context, { part, fails: before }).catch(() => null);
            const recheck = again === null ? null : checkPart(job, again, context);
            if (recheck && recheck.length <= before.length) {
              part = again;
              after = recheck;
            }
          }
          await putPart(env, id, `checks-${job.name}`, { before, after });
          if (after.some((fail) => fail.blocking))
            throw new NonRetryableError(`Part of this world would not come out whole (${job.name}). Try again in a minute.`);
          const fragment = fragmentOf(job, part);
          if (fragment) await show(fragment);
          return part;
        });
      const partSteps = new Map(jobs.map((job) => [job.name, partOf(job)]));

      const emblemStep = run("emblems", async () => {
        const { bible } = canon;
        const result = await emblemsFor(
          call,
          { title: bible.title, era: bible.era, place: bible.place, houseVoice: bible.house_voice, kind: plan.kind },
          roster.groups.map((group) => ({
            id: group.id,
            name: group.name,
            identity: bible.groups.find((entry) => entry.id === group.id)?.identity ?? group.wants,
          })),
        );
        await putPart(env, id, "emblems", result.report);
        await show({ kind: "emblems", emblems: result.emblems });
        return result.emblems;
      });

      // Decision 20: the people need words only the bible, briefing and systems write, so they start when those land.
      const peopleStep = (async (): Promise<People> => {
        const [briefing, systems] = await Promise.all([partSteps.get("briefing")!, partSteps.get("systems")!]);
        const frame = frameOf({
          id,
          prompt,
          plan,
          gathered,
          roster,
          world: { bible: canon.bible, briefing: briefing as Parts["briefing"], systems: systems as Parts["systems"] },
        });
        const base: GenCtx = {
          prompt,
          lang: "en",
          fiction: plan.kind >= 6,
          sources: { wikipedia: [], people: [], parties: [] },
          facts: factsOf(plan, roster, canon.bible),
          frame,
          calendar: calendarOf(plan),
          constitution: null,
          members: assignMembers(frame),
          citizens: assignCitizens(frame),
          deck: [],
        };
        const luna = <T>(name: string, fn: (env: Env) => Promise<T>) =>
          run(name, () => onRefusal(env, name, fn), LUNA_STEP);
        const deckStep = luna("deck", (e) => deck(e, base));
        const named: GenCtx = {
          ...base,
          ...(await luna("names", async (e) => {
            await putStatus(env, id, "people");
            await putMeta(env, id, {
              lang: "en",
              title: frame.title,
              era: frame.era,
              place: frame.place,
              description: frame.description,
            });
            return names(e, base);
          })),
        };
        const written: GenCtx = { ...named, ...(await luna("personas", (e) => personasStep(e, named))) };
        const deduped: GenCtx = { ...written, ...(await luna("dedupe", (e) => dedupe(e, written))) };
        const { deck: cards } = await deckStep;
        return {
          // A dedupe rewrite hands out a new name after membersStep's real-name check has already run.
          members: renameClashes(deduped.members, realNames(deduped.frame, deduped.facts)),
          citizens: deduped.citizens,
          deck: cards ?? [],
        };
      })();

      const [parts, emblems, people] = await Promise.all([
        Promise.all(jobs.map((job) => partSteps.get(job.name)!)),
        emblemStep,
        peopleStep,
      ]);

      const world: World = await run("rewrite", async () => {
        await putStatus(env, id, "finish");
        const merged = mergeWorld(roster, canon.bible, Object.fromEntries(jobs.map((job, i) => [job.name, parts[i]])), jobs);
        const rewritten = await rewriteWorld(call, merged, canon.model);
        await putPart(env, id, "lint", { before: rewritten.before.length, after: rewritten.after });
        await putPart(env, id, "world", rewritten.world); // the golden sheet reads pledge quotes and targets here
        return rewritten.world;
      });

      await run(
        "index",
        async () => {
          const frame = frameOf({ id, prompt, plan, gathered, roster, world });
          const text = `${frame.title} ${frame.era} ${frame.place} ${frame.description} ${prompt}`;
          const metadata = { title: frame.title, era: frame.era, place: frame.place, description: frame.description };
          await indexWorld(env, id, text, metadata).catch((error) => console.error(`index ${id}`, plain(error)));
        },
        RETRY,
      );

      await run(
        "assemble",
        async () => {
          let pack;
          try {
            pack = packOf({ id, prompt, plan, gathered, roster, world, emblems }, people);
          } catch (error) {
            await putPart(env, id, "pack-error", plain(error));
            throw new NonRetryableError("The world's pieces did not fit together. Try again in a minute.");
          }
          // putPack writes status 'ready', so it is the last write of the build.
          await putPack(env, id, pack);
          return JSON.stringify(pack).length;
        },
        RETRY,
      );
    } catch (e) {
      // Only the sentences the build writes on purpose are for the player; everything else is a log line.
      const why = e instanceof NonRetryableError ? plain(e) : "The build failed. Try another prompt.";
      await step.do("failed", RETRY, () => failScenario(env, id, why));
      throw e;
    }
  }
}
```

`callModel` awaits `onUsage` before it returns (Task 1), so `buildSpend` sees every finished answer before the next call starts.

- [ ] **Step 7: Retire the old path**

Everything below was called only by the old `worker/build.ts` (checked with `grep -rn` over `worker src scripts` on `v1`: no other caller).

1. Delete `worker/gen/plan.ts`, `worker/gen/calendar.ts`, `worker/gen/constitution.ts`, `worker/gen/constitution.test.ts`, `worker/gen/frame.test.ts`.
2. `worker/gen/facts.ts`: keep only the `z` import, `FactsSchema` and `type Facts`; delete the `luna`, `Env` and `./prompts` imports, `last`, `facts()` and `mergeWikidata()`. Put this header on the first line: `// The shape of a facts sheet: the real people and dated events a build checks invented names against.`
3. `worker/gen/frame.ts`: keep `FrameSchema`, `type Frame` and `MAX_CHAMBER` with its comment; delete `SYSTEM`, `clampChamberSize`, `realChamberSize`, `clampChamber`, `settle` and `frame()`, and the imports only they used (`luna`, `Env`, `./prompts`, `./validate`, and `scaleSeats` from the `../pack` import).
4. `worker/gen/validate.ts`: delete `frame()`, `constitution()`, and the helpers only they used (`yearOf`, `words`, `calendarHasAnchor`), and the `Constitution` import. Keep `NeedsRepair`, `UNITS`, `fromDays`, `realNames`, `matchName`, `members` and the calendar re-exports.
5. `worker/gen/validate.test.ts`: replace the whole file with:

```ts
import { describe, expect, test } from "bun:test";
import { mkFrame } from "./fixture";
import { days, fromDays, members, ymd } from "./validate";

describe("members", () => {
  test("a leader seated as a member is a violation", () => {
    expect(members(mkFrame(), [{ id: "m1", name: "Bella Blue" }]).length).toBe(1);
    expect(members(mkFrame(), [{ id: "m1", name: "Ossin Venn" }])).toEqual([]);
  });
});

describe("signed dates", () => {
  test("BC dates round-trip through the day number", () => {
    for (const d of ["-0044-03-15", "0001-01-01", "1921-03-01", "2012-12-15"]) {
      expect(fromDays(days(ymd(d)!))).toBe(d);
    }
  });
});
```

6. `worker/gen/prompts.ts`: delete `FRAME_RULES`, `clip` and `sourceBlock`, and `FONT_PAIRS` and `ESCALATION_KEYS` from the `../pack` import. Keep `GenCtx`, `chunk`, `HISTORIAN`, `CONTENT_RULE`, `frameBrief`.
7. `worker/gen/prompts.test.ts`: delete the third test ("the build prompt is user data, not part of the facts system string") and its comment line, and `mock` from the `bun:test` import. The same guarantee now lives in every generation v2 call: the prompt goes in the user message and every system prompt is a constant (Task 1).

Then run: `grep -rnE "gen/(plan|calendar|constitution)\"|sourceBlock|FRAME_RULES|settle\(|pickCalendar|mergeWikidata" worker src scripts`
Expected: no output.

- [ ] **Step 8: Give the daily's wait more room (Decision 17)**

In `worker/daily.ts`, change line 13 to:

```ts
export const BUILD_POLLS = 60; // TUNE: 60 polls is 30 minutes; a v2 build is estimated at 250 to 290 s, a Grok part up to 20 minutes
```

- [ ] **Step 9: Run the gates**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green. The test count drops by the retired tests (constitution, frame, the frame and calendar blocks of validate, one prompts test) and rises by Tasks 1 to 6 and Step 1.

- [ ] **Step 10: Commit**

```bash
git add worker/build.ts worker/db.ts worker/daily.ts worker/gen/personas.ts worker/gen/personas.test.ts worker/gen/facts.ts worker/gen/frame.ts worker/gen/validate.ts worker/gen/validate.test.ts worker/gen/prompts.ts worker/gen/prompts.test.ts
git rm worker/gen/plan.ts worker/gen/calendar.ts worker/gen/constitution.ts worker/gen/constitution.test.ts worker/gen/frame.test.ts
git commit -m "The build runs generation v2: parallel world parts and emblems, people from the Luna steps with member cards, and the old frame path removed"
```

---
### Task 8: World reuse: bge-m3 top 20 to Jev, no floor, load at 90%, offer above 80%

**Files:**
- Modify: `worker/match.ts`
- Test: `worker/match.test.ts` (the existing four tests become one table)

**Interfaces:**
- Consumes: `jev`, `matchQuestion`, `type MatchCandidate` (`worker/jev.ts`), `listReady` (`worker/db.ts`), both unchanged.
- Produces: `match(env, prompt)` and `decide(candidates, probabilities)` with the same signatures and `MatchResult` shape; only the thresholds and the floor change. `worker/index.ts` is unchanged (Decision 11).

- [ ] **Step 1: Turn the test into a table with the new thresholds**

Replace the four `test(...)` blocks in `worker/match.test.ts` (keep the imports and `candidates`) with:

```ts
const rome = { ...candidates[0] };
const germany = { ...candidates[1] };

test.each([
  ["top at 0.96 loads it", { a: 0.96, b: 0.02, none_of_these: 0.02 }, { load: "a" }],
  ["top at exactly 0.9 loads it", { a: 0.9, b: 0.05, none_of_these: 0.05 }, { load: "a" }],
  ["top at 0.85 offers it", { a: 0.85, b: 0.1, none_of_these: 0.05 }, { offer: [{ ...rome, p: 0.85 }] }],
  ["top at 0.88 offers everyone at 0.5 or more, sorted", { a: 0.88, b: 0.6, none_of_these: 0.1 }, { offer: [{ ...rome, p: 0.88 }, { ...germany, p: 0.6 }] }],
  ["top at exactly 0.8 builds", { a: 0.8, b: 0.1, none_of_these: 0.1 }, { build: true }],
  ["top at 0.7 builds", { a: 0.7, b: 0.2, none_of_these: 0.1 }, { build: true }],
  ["none_of_these winning builds", { a: 0.4, b: 0.3, none_of_these: 0.9 }, { build: true }],
  ["no probabilities builds", {}, { build: true }],
])("%s", (_name, probabilities, expected) => {
  expect(decide(candidates, probabilities)).toEqual(expected as ReturnType<typeof decide>);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test worker/match.test.ts`
Expected: FAIL on "top at exactly 0.9 loads it" (today it offers); the other seven rows pass on today's code.

- [ ] **Step 3: Change the thresholds and drop the floor**

In `worker/match.ts`:

1. Replace the `COSINE_FLOOR` comment and constant with:

```ts
// Owner rule (experiment 6): Jev reads the cosine top 20 with no floor; a floor had cut Rome's own pack at 0.54.
const SHORTLIST = 20;
const LOAD_AT = 0.9; // at or above: the prompt is this world, so it loads instead of paying for a build
const OFFER_AT = 0.8; // above: the player is offered the match before a build
```

2. Replace the query and filter lines with:

```ts
  const q = await env.VEC.query(values, { topK: SHORTLIST, returnMetadata: "all" });
  const matches = [...q.matches].sort((a, b) => b.score - a.score);
```

3. In `decide`, replace `if (topP >= 0.95) return { load: topId };` with `if (topP >= LOAD_AT) return { load: topId };` and `if (topP >= 0.85) {` with `if (topP > OFFER_AT) {`.

- [ ] **Step 4: Run the test**

Run: `bun test worker/match.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the gates and commit**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green.

```bash
git add worker/match.ts worker/match.test.ts
git commit -m "World reuse reads the top 20 with no cosine floor, loads at 90% and offers above 80%"
```

---

### Task 9: The golden run: three prompts end to end through the local worker, and the artifact

**Files:**
- Create: `scripts/golden-builds.ts`
- Create (by running it): `docs/generation/golden/<YYYY-MM-DD>/` with `runs.csv`, one `<slug>.md` data sheet and one `<slug>.pack.json` per prompt

**Interfaces:**
- Consumes: `POST /api/scenarios`, `GET /api/scenarios/:id` (unchanged); the local D1 tables `scenarios`, `build_calls`, `build_parts` (Task 1, Task 7's parts: `roster-checks`, `bible-checks`, `checks-<part>`, `emblems`, `lint`, `world`, `pack-error`); `PackSchema` (`worker/pack.ts`).
- Produces: the repeatable artifact. The run is the E2E check for Tasks 1 to 8; there is no unit test for it.

Targets (owner brief, measured by the prototype, not yet by this code): total about 220 s, about $0.90 a world, first readable at about 90 s from the world step's start. The script reports each against its target and fails only on a build that does not finish or a pack that does not parse.

- [ ] **Step 1: Write the script**

`scripts/golden-builds.ts`:

```ts
// The golden run: three prompts through the local worker, each to a ready pack, then one data sheet and one packed
// world per prompt and one CSV row per build under docs/generation/golden/<day>/. Repeat it with the same command.
//   bun run dev            (another shell; the local D1 migrated first)
//   bun scripts/golden-builds.ts [baseUrl]
// Stops with exit 2 when the OpenRouter key's own meter passes the money cap; stop `bun run dev` then, since the
// Workflows run inside it.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PackSchema, type Pack } from "../worker/pack";

const BASE = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const MONEY_CAP = 6; // dollars for the whole run
const TARGETS = { seconds: 220, dollars: 0.9, firstReadable: 90 };
const PROMPTS: Record<string, string> = {
  "ottoman-1908": "The Ottoman Empire after the Young Turk Revolution, 1908",
  "westeros-298": "Westeros, 298 AC",
  "fridge-parliament": "The Parliament of the Fridge",
};
const DAY = new Date().toISOString().slice(0, 10);
const OUT = `docs/generation/golden/${DAY}`;

// The key is read only to ask OpenRouter for its meter; it is never printed or written.
const key = readFileSync(".dev.vars", "utf8").match(/^OPENROUTER_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1];
if (!key) throw new Error("OPENROUTER_API_KEY is missing from .dev.vars");
async function meter(): Promise<number> {
  const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`the key meter answered ${response.status}`);
  return Number((await response.json()).data.usage);
}

function d1<T = Record<string, any>>(sql: string): T[] {
  const run = Bun.spawnSync(["bunx", "wrangler", "d1", "execute", "usoj", "--local", "--json", "--command", sql]);
  if (run.exitCode !== 0) throw new Error(`wrangler d1: ${run.stderr.toString().slice(0, 400)}`);
  return JSON.parse(run.stdout.toString())[0].results as T[];
}
const quote = (id: string) => {
  if (!/^[\w-]+$/.test(id)) throw new Error(`odd scenario id ${id}`);
  return `'${id}'`;
};

type Fragment = { kind: string; at: number } & Record<string, unknown>;
type Run = { slug: string; prompt: string; id: string; status: string; error: string; seconds: number; fragments: Fragment[] };

async function start(prompt: string, ip: string): Promise<string> {
  // Each prompt claims its own address; the worker allows one build per address every 10 minutes.
  for (let tries = 0; tries < 25; tries++) {
    const response = await fetch(`${BASE}/api/scenarios`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({ prompt }),
    });
    if (response.status === 202) return ((await response.json()) as { id: string }).id;
    const body = await response.text();
    if (response.status !== 429) throw new Error(`${prompt}: ${response.status} ${body.slice(0, 200)}`);
    console.log(`${prompt}: ${body.slice(0, 120)}; waiting a minute`);
    await Bun.sleep(60_000);
  }
  throw new Error(`${prompt}: no build slot in 25 minutes`);
}

async function build(slug: string, prompt: string, index: number): Promise<Run> {
  const id = await start(prompt, `10.9.0.${index + 1}`);
  console.log(`${slug} -> ${id}`);
  const began = Date.now();
  for (;;) {
    await Bun.sleep(3000);
    const row = await fetch(`${BASE}/api/scenarios/${id}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    const seconds = (Date.now() - began) / 1000;
    if (row?.status === "ready" || row?.status === "failed" || seconds > 40 * 60)
      return { slug, prompt, id, status: row?.status ?? "timeout", error: row?.error ?? "", seconds, fragments: row?.fragments ?? [] };
  }
}

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const first = (fragments: Fragment[], kind: string) => {
  const at = fragments.filter((fragment) => fragment.kind === kind).map((fragment) => fragment.at);
  return at.length ? round(Math.min(...at) / 1000) : null;
};
const table = (head: string[], rows: unknown[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "/").replace(/\n/g, " ")).join(" | ")} |`)].join("\n");

function sheet(run: Run) {
  const calls = d1(`SELECT name, model, at, seconds, cost, input, output, reasoning, cached, cache_write, finish FROM build_calls WHERE scenario = ${quote(run.id)} ORDER BY at`);
  const parts = Object.fromEntries(
    d1<{ part: string; body: string }>(`SELECT part, body FROM build_parts WHERE scenario = ${quote(run.id)}`).map((row) => [row.part, JSON.parse(row.body)]),
  );
  const packText = d1<{ pack: string | null }>(`SELECT pack FROM scenarios WHERE id = ${quote(run.id)}`)[0]?.pack ?? null;
  let pack: Pack | null = null;
  let parseError = "";
  if (packText) {
    const parsed = PackSchema.safeParse(JSON.parse(packText));
    if (parsed.success) pack = parsed.data;
    else parseError = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ");
    writeFileSync(`${OUT}/${run.slug}.pack.json`, JSON.stringify(JSON.parse(packText), null, 1));
  }
  const dollars = calls.reduce((total, call) => total + call.cost, 0);
  const startOf = (name: string) => {
    const call = calls.find((row) => row.name === name);
    return call ? call.at - call.seconds * 1000 : null;
  };
  const buildStart = startOf("plan");
  const worldStart = startOf("bible");
  const fromWorld = (kind: string) => {
    const at = first(run.fragments, kind);
    return at !== null && buildStart !== null && worldStart !== null ? round(at - (worldStart - buildStart) / 1000) : null;
  };
  const row = {
    slug: run.slug,
    id: run.id,
    status: parseError ? "unparsed" : run.status,
    seconds: round(run.seconds),
    roster_s: first(run.fragments, "roster"),
    bible_s: first(run.fragments, "bible"),
    briefing_s: first(run.fragments, "briefing"),
    bible_from_world_s: fromWorld("bible"),
    briefing_from_world_s: fromWorld("briefing"),
    dollars: round(dollars, 3),
    calls: calls.length,
    grok_calls: calls.filter((call) => call.model.startsWith("x-ai/")).length,
    input: calls.reduce((total, call) => total + call.input, 0),
    cached: calls.reduce((total, call) => total + call.cached, 0),
    holders: pack?.constitution?.holders.length ?? "",
    factions: pack?.factions.length ?? "",
    chamber: pack ? `${pack.chamber.size}/${pack.chamber.threshold}` : "",
    emblems_kept: parts.emblems ? `${parts.emblems.kept}/${parts.emblems.asked}` : "",
    lint_left: parts.lint?.after?.length ?? "",
    error: (run.error || parseError).replace(/,/g, ";"),
  };
  const world = parts.world;
  const holders = pack?.constitution?.holders ?? [];
  const weights = new Map((pack?.constitution?.retention.weights ?? []).map((weight) => [weight.id, weight.value]));
  const card = (glance?: { wants: string[]; hates: { tag: string; redLine: boolean }[]; strike: string }) =>
    glance ? `wants ${glance.wants.join(", ")}; hates ${glance.hates.map((hate) => (hate.redLine ? `**${hate.tag}**` : hate.tag)).join(", ")}; ${glance.strike}` : "none";
  const checks = Object.entries(parts)
    .filter(([name]) => name.endsWith("checks") || name.startsWith("checks-"))
    .map(([name, body]: [string, any]) => [name, body.before.length, body.after.length, body.after.map((fail: any) => `${fail.check} ${fail.row}: ${fail.message}`).join("; ")]);
  const text = `# ${pack?.title ?? run.slug}

Prompt: "${run.prompt}". Scenario \`${run.id}\`. Status: ${row.status}${row.error ? ` (${row.error})` : ""}.
Run on ${DAY} with \`bun scripts/golden-builds.ts\` against the local worker.

## Time and money

${table(["measure", "value", "target"], [
    ["total seconds", row.seconds, TARGETS.seconds],
    ["roster fragment (s from build start)", row.roster_s, ""],
    ["bible fragment (s from build start / from world start)", `${row.bible_s} / ${row.bible_from_world_s}`, TARGETS.firstReadable],
    ["briefing fragment (s from build start / from world start)", `${row.briefing_s} / ${row.briefing_from_world_s}`, ""],
    ["Opus and Grok dollars (ledger)", row.dollars, TARGETS.dollars],
    ["calls (Grok)", `${row.calls} (${row.grok_calls})`, ""],
    ["input tokens (cached)", `${row.input} (${row.cached})`, ""],
  ])}

${table(["call", "model", "s", "$", "in", "out", "reasoning", "cached", "cache write", "finish"], calls.map((call) => [call.name, call.model, round(call.seconds), round(call.cost, 4), call.input, call.output, call.reasoning, call.cached, call.cache_write, call.finish]))}

## The world

${pack ? `${pack.era}; ${pack.place}. ${pack.grounding ?? ""}
Ruler: ${pack.constitution?.ruler.role} (faction ${pack.constitution?.ruler.faction}; own group ${pack.constitution?.ownGroup}; public ${pack.constitution?.publicGroup}). Removed by: ${pack.constitution?.ruler.removedBy}
Chamber: ${pack.vocabulary.chamber}, ${pack.chamber.size} seats, ${pack.chamber.threshold} to pass.

### Holders

${table(["id", "name", "where", "members", "support", "line", "weight", "gives", "icon", "emblem", "card"], holders.map((holder) => [holder.id, holder.name, holder.where, holder.members, holder.support, holder.line, weights.get(holder.id) ?? "", holder.gives ? `${holder.gives.amount} ${holder.gives.ledger}/${holder.gives.per}` : "", holder.icon ?? "", holder.emblem ? "yes" : "", card(holder.glance)]))}

### Factions

${table(["id", "name", "seats", "tint", "emblem", "card"], pack.factions.map((faction) => [faction.id, faction.name, faction.seats, faction.tint ? `${faction.tint.light} / ${faction.tint.dark}` : "", faction.emblem ? "yes" : "", card(faction.glance)]))}

### Acts

${table(["verb", "name", "consent", "vetoes", "available"], Object.entries(pack.constitution?.instruments ?? {}).map(([verb, act]) => [verb, act.name, act.consent, act.vetoes.join(", "), act.available]))}

### Pledges

${table(["pledge", "tag", "for", "quote", "doc"], (world?.briefing?.pledges ?? []).map((pledge: any) => [pledge.text, pledge.tag, pledge.for, pledge.quote ?? "", pledge.doc ?? ""]))}

Members ${pack.members.length} (with a card: ${pack.members.filter((member) => member.glance).length}); citizens ${pack.citizens.length}; deck ${pack.deck.length}; tags ${pack.tags.length}; sources ${pack.sources.length}. Theme: ${pack.themeTokens ? `${pack.themeTokens.display} on ${pack.themeTokens.material}` : "default"}.` : "No pack."}

## Checks

${table(["checks", "before", "after", "left"], checks)}

Emblems: ${JSON.stringify(parts.emblems ?? null)}
`;
  writeFileSync(`${OUT}/${run.slug}.md`, text);
  return row;
}

mkdirSync(OUT, { recursive: true });
const spentBefore = await meter();
const guard = setInterval(async () => {
  const spent = (await meter().catch(() => spentBefore)) - spentBefore;
  if (spent >= MONEY_CAP) {
    console.error(`money cap: $${round(spent, 2)} spent; stop bun run dev now`);
    process.exit(2);
  }
}, 30_000);
const runs = await Promise.all(Object.entries(PROMPTS).map(([slug, prompt], index) => build(slug, prompt, index)));
clearInterval(guard);
const spent = round((await meter()) - spentBefore, 3);
const rows = runs.map(sheet);
const csv = `${OUT}/runs.csv`;
const columns = Object.keys(rows[0]);
if (!existsSync(csv)) writeFileSync(csv, `${columns.join(",")},meter_dollars_for_run\n`);
for (const row of rows) appendFileSync(csv, `${columns.map((column) => (row as any)[column]).join(",")},${spent}\n`);
console.table(rows.map(({ slug, status, seconds, bible_from_world_s, dollars }) => ({ slug, status, seconds, bible_from_world_s, dollars })));
console.log(`key meter for the whole run: $${spent} (Opus, Grok and Luna); cap $${MONEY_CAP}`);
process.exit(rows.every((row) => row.status === "ready") ? 0 : 1);
```

- [ ] **Step 2: Prepare the local worker**

Run in the Track E worktree (never `cat` or print `.dev.vars`):

```bash
test -f .dev.vars || cp /Users/deadpackets/workspace/UnitedStatesOfJev/.dev.vars .dev.vars
grep -q '^BUILD_COST_CAP=' .dev.vars || printf 'BUILD_COST_CAP=2\n' >> .dev.vars
bunx wrangler d1 migrations apply usoj --local
bunx wrangler d1 execute usoj --local --command "SELECT COUNT(*) AS calls FROM build_calls"
```

Expected: the migration list ends with `0004_build_ledger.sql` applied, and the count query prints `0`. `BUILD_COST_CAP=2` keeps three builds inside the $6 cap before the script's own guard.

Then start the worker in a second shell: `bun run dev`, and wait for Vite's `Local: http://localhost:5173/`.

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/api/scenarios/none`
Expected: `404` (the worker answers).

- [ ] **Step 3: Run the golden builds**

Run: `bun scripts/golden-builds.ts http://localhost:5173`
Expected: three lines `<slug> -> <id>`, then after about 5 minutes (the estimate is 250 to 290 s; nothing has measured it) a table with three rows of status `ready` and a meter line under $6. Exit code 0.

If a row is `failed`, its sheet shows the player sentence and the checks that stopped it; read `docs/generation/golden/<day>/<slug>.md` before changing any code, and report the failure with the sheet. If the POSTs keep answering 429 "One build every 10 minutes", the local worker ignores the `cf-connecting-ip` header: the script then waits and runs the prompts one after another (about 30 minutes). If a build logs `index ... ` errors, that is Decision 12 in local dev (no Vectorize): the world is still ready.

- [ ] **Step 4: Read the sheets against the rulings**

For each sheet, check by eye and write the result in the report (one line each):
1. The own party is one row: `ownGroup` is a faction or a holder, never both.
2. The public group's holder has `members: citizens`, and no holder is a named slice of the public.
3. At most one holder gives authority, 3 a turn, and it is the seat's backer.
4. Ottoman 1908: at least 4 pledges carry a quote and a doc.
5. Every holder and faction card has exactly one bold (red line) hate.
6. The Westeros and Ottoman emblems either passed review or fell back; the fridge emblems came through (names-only resend allowed).

- [ ] **Step 5: Commit the script and the artifact**

```bash
git add scripts/golden-builds.ts docs/generation/golden/
git commit -m "Golden run of generation v2: three worlds end to end through the local worker, with data sheets, timings and costs"
```

---
## Cross-track requests

1. **Track D (`src/Build.tsx`, `src/api.ts`): the build screen reads new phases and fragments.** The `step` column moves through `plan`, `gather`, `roster`, `check`, `bible`, `sections`, `people`, `finish`, then `ready`; today's `STEPS` list (`fetch`, `facts`, `calendar`, `frame`, ...) matches none of them, so until Track D's port lands the old screen shows no step as done. Every fragment carries `at` (ms since the build started); a step that retries can add the same kind twice, so read the last of each kind (several `groups` fragments are normal, one per chunk of 4). Kinds and fields:
   - `plan`: `seat`, `holder`, `start`, `end`, `lookups: string[]`
   - `sources`: `pages: string[]`
   - `roster`: `groups: { id, name, sits: "home" | "abroad", seats: number | null, wants }[]` (the first readable, about 85 s)
   - `bible`: `title`, `era`, `place`, `voice`, `vocabulary` (the 18 pack keys plus `file`, `abroad`), `groups: { id, name, short, identity, face }[]` (about 150 s)
   - `groups`: `rows: { id, icon, color, wants, hates: { tag, red_line }[], strike }[]`
   - `chamber`: `name`, `shape`, `factions: { id, color, with_you }[]`
   - `briefing`: `role`, `situation`, `problems` (3), `pledges: string[]` (about 190 s)
   - `theme`: `tokens` (validated `ThemeTokens`; the default when the model's palette could not be fixed)
   - `emblems`: `emblems: Record<id, Emblem>` (sanitized; a missing id means the line icon)
   The old `frame` fragment is gone; its fields are in `bible` and `briefing`.
2. **Track D's request 2 (short, tint, icon), answered:** every holder built from a group gets `short` (the bible's, at most 16 characters), `icon` and `tint` when its part landed and its colour passes contrast; every faction gets `tint`. The code-built chamber holder has `icon: "chamber"` and no `short` or `tint` (its name is the chamber's own word), so the desk's fallbacks apply to that one row.
3. **Lead or Track D (`worker/index.ts`), optional: refuse a new build at p ≥ 0.9 on the server.** Today only `/api/scenarios/match` applies the owner's 90% rule (Decision 11); a client that posts straight to `POST /api/scenarios` still builds. The check is `match()` then `decide()` before `builds.claim`, returning the `load` id with a 409.
4. **Stage 0 owner or lead, only if wanted: a pack field for lesson 16's "each seat is about N people".** Generation knows the real size (`roster.chamber.real_size`) and the drawn size; `chamber.represents?: number` would carry it. Not written today (no field).
5. **Lead: `worker/daily.ts` line 13 (`BUILD_POLLS` 40 → 60) is outside this track's files.** Task 7 changes only that constant; take it into another track if preferred.
6. **Stage 0 owner, for later: `pledge.for` (the group a promise is made to) and the pledge quotes are not in the pack.** They live in the build's `world` part (D1 `build_parts`) and the golden sheets; a pack field is needed only if the desk should show them.
