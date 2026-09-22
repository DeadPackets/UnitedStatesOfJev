# United States of Jev

A political roguelike where you write any polity into existence and [Jev](https://docs.typesafe.ai), TypeSafe's System One model, judges it in one call. Code proposes options, Jev judges, Luna narrates.

Live: https://unitedstatesofjev.deadpackets.pw (v1, "Congress of Jev": 100 fixed US senators). v3, "Any Polity", is Stage A complete on branch `any-polity` (2026-09-22): player-written scenarios, generated packs, any faction. Merge and deploy pending review.

## v3: Any Polity

Write a scenario that ever existed or never did — Rome in 44 BC, Germany after the 2021 election, Egypt after 2011, the first Mars colony. The archive matches it or the generator builds it, you take any faction, and you run one term.

| Screen | What happens |
|---|---|
| Write | one text box, any language |
| Match | Vectorize + Jev, under 2 s: a close pack loads, a near one is offered, otherwise build |
| Build | a Cloudflare Workflow builds the pack — sources, factions, chamber, deck, art — polled every 2 s |
| Seat | pick a faction and 3 of 8 promises; get a share code |
| Term | 20 turns: draft a bill, whip, lobby, amend, vote, resolve the week's crisis |
| Test | the re-election reveal, regions and/or seats walking to the verdict |
| Won/Over | continue to another term, or the ending page and score |

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
- **Term: 113 requests, 213.7 s** for 20 turns plus the test (`bun scripts/term.ts`), all 2xx.

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
src/                  React app: Write, Match, Build, Seat, Chamber (term), Test, Won, Over
scripts/              one-off generators and live checks
```

## Run

```
bun install
echo "OPENROUTER_API_KEY=sk-or-..." > .dev.vars
bun run dev             # http://localhost:5173, worker runs in workerd
bun test worker src     # unit tests
bun scripts/build.ts <baseUrl> <prompt>          # live: post a scenario, poll, print step timings
bun scripts/term.ts <baseUrl> [scenario] [faction]  # live: one full 20-turn term against a running Worker
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

The first `wrangler deploy` applies the pending DO migration and unblocks `versions upload` for everyone after.

## v1: Congress of Jev

- One whip count is one Jev request: 100 senator personas plus filibuster, bloc, and constitutionality questions. About 21k tokens, 0.5 to 0.8 s, $0.0009.
- Luna parses your prose into a bill, drafts amendments, and writes one headline per vote.
- Floor votes are seeded Bernoulli draws from each senator's probability. Approval, capital, and grudges are plain arithmetic in `worker/engine.ts`.
- A share code carries every setting and the seed, so two people with the same code get the same chamber.

Experiments that shaped the design are in `docs/experiments.md`. Spec and plan are in `docs/superpowers/`.
