# United States of Jev

A political roguelike where you write any polity into existence and [Jev](https://docs.typesafe.ai), TypeSafe's System One model, judges it in one call. Code proposes options, Jev judges, Luna narrates.

Live: https://unitedstatesofjev.deadpackets.pw (v3, "Any Polity": player-written scenarios, generated packs, any faction). Stage B — the Feed, midterm night, campaign turns and the region reveal — is implemented on branch `stage-b` (2026-09-22); merge and deploy pending review.

## v3: Any Polity

Write a scenario that ever existed or never did — Rome in 44 BC, Germany after the 2021 election, Egypt after 2011, the first Mars colony. The archive matches it or the generator builds it, you take any faction, and you run one term.

| Screen | What happens |
|---|---|
| Write | one text box, any language |
| Match | Vectorize + Jev, under 2 s: a close pack loads, a near one is offered, otherwise build |
| Build | a Cloudflare Workflow builds the pack — sources, factions, chamber, deck, art — polled every 2 s |
| Seat | pick a faction and 3 of 8 promises; get a share code |
| Term | 20 turns: draft a bill, whip, lobby, amend, post to the feed, vote, resolve the week's crisis |
| Feed | one post a turn, 240 characters, optional: every citizen reacts, three answer, the rival answers back, 50 citizens judge the duel |
| Midterm | a third of the seats are up at turn 11: a true-random draw seat by seat, replacements written on the spot, one half-term headline |
| Campaign | the four closing turns: one message of three, then one lever — up to two regions at 0/5/10, or a favour to one seat |
| Test | the re-election reveal: regions as a weighted treemap, seats walking to the verdict |
| Won/Over | continue to another term, or the ending page and score |

## The term's routes

Every one is `POST /api/games/:id/...`, guarded by the same stale-turn check and the DO's one-move-at-a-time lock.

| Route | Body | When |
|---|---|---|
| `post` | `{ turn, text }` | `session`, before the vote, one per turn, 1 to 240 characters |
| `midterm` | `{ turn }` | `midterm`, once; the screen calls it on its own |
| `campaign/drafts` | `{}` | `campaign`; returns early once three drafts exist |
| `campaign` | `{ message, lever }` | `campaign`, four times; `lever` is `{kind:"spend",regions:[{id,amount}]}` (two at most, 0/5/10) or `{kind:"favor",memberId}` |

## The daily

One scenario and one seed a day, for everyone. A cron at 03:07 UTC starts the `daily` Workflow for tomorrow: Luna
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

## Cloudflare bindings

| Binding | Resource | Notes |
|---|---|---|
| `DB` | D1 `usoj` | scenarios table: id, status, pack JSON, builds count |
| `VEC` | Vectorize `usoj-scenarios` | 1024-dim, cosine, one vector per ready scenario |
| `ART` | R2 `usoj-art` | mastheads, crests, portraits, immutable cache |
| `AI` | Workers AI | `@cf/baai/bge-m3` embeddings for matching |
| `BUILD` | Workflow `ScenarioBuild` (`worker/build.ts`) | one step per pack row, status written to D1 after each |
| `GAME` | Durable Object `GameDO` | one per game, unchanged shape plus `scenarioId` |
| `BUILDS` | Durable Object `BuildsDO` | daily build counter |
| `RL` | ratelimit `RL` | 40 req/min on `/api/*`, `/api/*/art/*` exempt |
| `DAILY` | Workflow | `daily`, the cron-started build of tomorrow's term |
| `DAILY_SECRET` | secret | signs the `usoj_id` cookie |
| cron | trigger | `7 3 * * *`, one run a day |

## Models

| Model | Role |
|---|---|
| `openai/gpt-5.6-luna` | default generator: plan, facts, frame, names, members, citizens, deck; parses bills, narrates |
| `openai/gpt-6-astra` | repair pass when validation still fails after one retry (no `reasoning: none`, it 400s) |
| `x-ai/grok-4.7` | retried once on a benign refusal from Luna, per step |
| `typesafe/jev-1.13` | judges whip counts, matching probabilities, semantic dedupe |
| `meta/muse-image` | contact sheets (16 faces/call), masthead, crests |

## Costs

Measured 2026-09-22 (`.superpowers/sdd/2026-09-22-any-polity-stage-a/task-6-report.md`, `task-9-report.md`):

- **Build: ~$0.12** on the Luna path (OpenRouter usage figures), of which art is ~$0.05 at build time; portraits generate in the background after the pack is ready and never block play.
- **Term: $0.215, 145 requests, 349 s** for 20 turns, the midterm, four campaign turns and the test (`bun scripts/term.ts`), all 2xx. Stage B's own routes are 28% of that: a post is 4.1 s and $0.0024, the midterm 13.1 s and $0.0036, a campaign turn 1.6 s and $0.0023.

Full step-by-step timings for both proof builds (Rome `v3nj3k`, Germany `1wybd8`) and the term's per-route latencies are in `docs/experiments.md`.

## Stack

Cloudflare Worker (Hono) with Durable Objects, a Workflow, D1, Vectorize, R2 and Workers AI. Vite + React front end served as static assets. Bun for tooling.

```
worker/engine.ts     pure game math, shared with the client
worker/game.ts       GameDO: turn loop and state
worker/build.ts      ScenarioBuild Workflow: the generation pipeline
worker/gen/          plan, facts, frame, names, personas, deck, dedupe, validate
worker/art.ts        dithering: seat coin, plate, crest, masthead
worker/match.ts      Vectorize + Jev scenario matching
worker/jev.ts         Jev client and question builders
worker/luna.ts        Luna client and Zod schemas
worker/db.ts          D1 reads and writes
worker/pack.ts         Pack schema, FONT_PAIRS, FILLS, LAYOUTS
src/                  React app: Write, Match, Build, Seat, Chamber (term + Feed tab), Midterm, Campaign, Test (Tiles), Won, Over
scripts/              one-off generators and live checks
```

## Run

```
bun install
echo "OPENROUTER_API_KEY=sk-or-..." > .dev.vars
bun run dev             # http://localhost:5173, worker runs in workerd
bun test worker src     # unit tests
bun scripts/build.ts <baseUrl> <prompt>          # live: post a scenario, poll, print step timings
bun scripts/term.ts <baseUrl> [scenario] [faction] [p,p,p]  # live: one full term, feed and midterm and campaign and test
bun scripts/sources.ts                           # live check against Wikipedia/Wikidata
bun scripts/luna-latency.ts                      # Luna latency by reasoning effort and provider routing
bun run deploy           # tsc -b && vite build + wrangler deploy
```

### Local verification with remote bindings

`wrangler versions upload` refuses while `BuildsDO`'s migration is pending, and `wrangler dev --remote` no longer exists for Durable Objects. To exercise the Workflow and both DOs locally against the real D1, Vectorize, R2 and AI:

1. Copy `wrangler.jsonc` to an **uncommitted** `wrangler.dev.jsonc`: drop `routes`, add `"remote": true` to the D1, Vectorize, R2 and AI bindings, and set the port to 8799.
2. `bunx wrangler dev --config ./wrangler.dev.jsonc --port 8799`
3. Point `scripts/build.ts` / `scripts/term.ts` at `http://127.0.0.1:8799`.
4. Delete `wrangler.dev.jsonc` before committing. Nothing is deployed; the custom domain is untouched.

Do not run `bun run dev` in the same worktree while a live check is in flight: the Vite plugin reloads the Worker on
every file write, and a reload mid-request answers `Your worker restarted mid-request` and ends the run. For the
front end against this Worker, `bun run build` and let `wrangler dev` serve `dist/client` at the same port.

The first `wrangler deploy` applies the pending DO migration and unblocks `versions upload` for everyone after.

## v1: Congress of Jev

- One whip count is one Jev request: 100 senator personas plus filibuster, bloc, and constitutionality questions. About 21k tokens, 0.5 to 0.8 s, $0.0009.
- Luna parses your prose into a bill, drafts amendments, and writes one headline per vote.
- Floor votes are seeded Bernoulli draws from each senator's probability. Approval, capital, and grudges are plain arithmetic in `worker/engine.ts`.
- A share code carries every setting and the seed, so two people with the same code get the same chamber.

Experiments that shaped the design are in `docs/experiments.md`. Spec and plan are in `docs/superpowers/`.
