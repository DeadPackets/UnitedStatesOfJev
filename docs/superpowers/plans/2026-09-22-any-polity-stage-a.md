# Any Polity, Stage A: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player types any scenario, the game finds or builds a polity pack, seats them in any faction, and runs one term with ledgers, a Director, era storylets, quotes, the α test, endings and endless terms.

**Architecture:** The engine becomes pack-driven: every name, faction, region, threshold and vocabulary comes from a `Pack` JSON validated by Zod. A Cloudflare Workflow builds packs with Luna, grounded on Wikipedia and Wikidata, with code-owned identity assignment, validators, calendar and Jev dedupe. Matching is Workers AI embeddings into Vectorize plus one Jev Choice. The client maps `pack.theme` onto the existing token system and renders six chamber layouts with faction colors and fill patterns.

**Tech Stack:** Cloudflare Workers, Workflows, Durable Objects, D1, Vectorize, R2, Workers AI; Hono; TypeScript; Zod 4; Vite + React 19; Bun for scripts and tests; muse-image via OpenRouter `/api/v1/images`; `@cf-wasm/photon` for image ops.

**Spec:** `docs/superpowers/specs/2026-09-22-any-polity-design.md` (v3), with `2026-09-22-the-term-design.md` (v2) for the term rules it inherits. Experiments: `docs/experiments.md`, `docs/combos-2026-09-22.md`.

## Global constraints

- Code proposes, Jev judges, Luna narrates, the generator fills a fixed schema. No Luna call decides a number.
- Luna: `openai/gpt-5.6-luna`, `reasoning: { effort: "none" }`, `provider: { sort: "latency" }`, strict `json_schema` from `z.toJSONSchema`, STYLE block appended. Jev: `typesafe/jev-1.13`, state ≤ 32k tokens, request ≤ 64k.
- Pack generation stack is K4: Wikipedia lead plus sections, Wikidata dates with the 100-year birth guard, facts sheet, frame, validators with one retry reading the alive flag, code-set calendar with `start_date = anchor − 15 units`. No self-review. Astra only when validation fails after the retry.
- Seeds fix the start; votes, Director rolls and the test use `crypto.getRandomValues`.
- Fixed pace: 20 turns, midterm after 10 (Stage B), 4 campaign turns (Stage B), the test. Stage A runs turns 1 to 20 then the test directly.
- No persistent progression. Share code `J3-<scenario6>-<f>-<ppp>-<seed6>`.
- Content rule in every generation prompt (spec §4). Grok retry only for benign refusals.
- Surgical diffs, no comments unless a constraint cannot be read from the code, tests only where logic branches: calendar, validators, scaling, matching thresholds, ledger math, Director.
- Every task ends with `bunx tsc -b && bun test worker` green, a commit, and for tasks that touch the Worker a `bun run deploy` (pre-authorized) plus a curl check against production.

## File map

| File | Responsibility |
|---|---|
| `worker/pack.ts` | `Pack` Zod schema and types, `FONT_PAIRS`, `FILLS`, `LAYOUTS`, `ESCALATION_KEYS`, `scaleSeats`, `packView` (strips personas) |
| `worker/sources.ts` | Wikipedia lead + sections, Wikidata person and party lookups with guards, `Sources` type |
| `worker/gen/prompts.ts` | system prompts: content rule, STYLE, role lines |
| `worker/gen/plan.ts`, `facts.ts`, `frame.ts`, `assign.ts`, `personas.ts`, `deck.ts`, `dedupe.ts` | one step each, `(env, ctx) => partial` |
| `worker/gen/validate.ts` | reference, alive, seated-leader, faction-count, window checks; `calendar()` |
| `worker/build.ts` | `ScenarioBuild` Workflow: steps, D1 status writes, art and portraits |
| `worker/art.ts` | muse-image call, contact sheet crop, dither, plate, R2 put |
| `worker/match.ts` | embed, Vectorize query, Jev Choice, thresholds |
| `worker/db.ts` | D1 helpers: `scenarios` table, `builds` counter DO |
| `worker/engine.ts` | pack-driven game: state, whip, vote, ledgers, promises, Director, storylets, escalations, test, endings, continue |
| `worker/jev.ts` | generalized criteria, member questions, citizen questions, dedupe questions |
| `worker/luna.ts` | parse, amend, headline, quotes, card, ending; `lang` and vocabulary aware |
| `worker/game.ts` | GameDO: loads pack from D1, routes new actions |
| `worker/index.ts` | routes for scenarios, art passthrough, games |
| `src/api.ts` | scenario and game calls |
| `src/theme.ts` | pack theme to CSS variables, font link, fill pattern defs |
| `src/layouts.ts` | six point generators |
| `src/Write.tsx`, `Match.tsx`, `Build.tsx`, `Seat.tsx` | the new front door |
| `src/Chamber.tsx`, `Hemicycle.tsx`, `Drawer.tsx`, `Ledger.tsx`, `Card.tsx`, `Test.tsx`, `Won.tsx`, `Over.tsx` | the term, themed |
| `scripts/build.ts`, `scripts/term.ts` | build a pack against prod, play a term by curl |

Deleted: `worker/roster.json`, `worker/agendas.json` stays (unused, daily later), `worker/states.ts` stays only until Task 9 removes the last import, `src/Setup.tsx`, `src/Map.tsx` (Stage B brings a region map back).

---

### Task 1: Pack schema and fixtures

**Files:** Create `worker/pack.ts`, `worker/fixtures/mini.json`, `worker/pack.test.ts`.

**Interfaces produced:** `Pack`, `PackSchema`, `Member`, `Citizen`, `Faction`, `Region`, `Storylet`, `Start`, `FONT_PAIRS` (8 names), `FILLS` (12), `LAYOUTS` (6), `ESCALATION_KEYS` (20, spec §7 order), `scaleSeats(shares: Record<string, number>, size: number): Record<string, number>` largest remainder with minimum 1 per faction that held any, `packView(pack)`.

- [ ] Write `PackSchema` exactly as spec §3, strict mode friendly: no `Record` fields, use arrays of `{ id, value }` for `Region.lean`, optional fields nullable. Storylet `date` is an ISO-like string allowing negative years (`^-?\d{1,6}-\d{2}-\d{2}$`); `turn` is set by code.
- [ ] Write `worker/fixtures/mini.json`: a 24-seat fictional "Harbor Council", 3 factions, 6 regions, 5 blocs, 10 patrons, 24 members, 250 citizens generated by a tiny loop in the test (not stored), 8 problems, 8 promises, 16 tags, 20 generic + 2 dated storylets, all 20 escalations, test with α 0.5. Keep members' prose one line each.
- [ ] Test: fixture parses; `scaleSeats({SPD:206, CDU:197, Greens:118, FDP:92, AfD:83, Linke:39, SSW:1}, 100)` returns 28, 27, 16, 12, 11, 5, 1; `packView` has no `bio`, `tell`, `worldview`.
- [ ] Run `bun test worker/pack.test.ts`, commit `Pack schema and fixture`.

### Task 2: Cloudflare bindings

**Files:** Modify `wrangler.jsonc`, `package.json`; create `worker/db.ts`, `migrations/0001_scenarios.sql`.

- [ ] Create resources with wrangler (authenticated, pre-authorized): `wrangler d1 create usoj`, `wrangler vectorize create usoj-scenarios --dimensions=1024 --metric=cosine`, `wrangler r2 bucket create usoj-art`. Paste ids into `wrangler.jsonc`.
- [ ] Add bindings: `d1_databases [{ binding: "DB", database_name: "usoj", database_id }]`, `vectorize [{ binding: "VEC", index_name: "usoj-scenarios" }]`, `r2_buckets [{ binding: "ART", bucket_name: "usoj-art" }]`, `ai { binding: "AI" }`, `workflows [{ name: "build", binding: "BUILD", class_name: "ScenarioBuild" }]`, durable object `BUILDS` class `BuildsDO` in a `v2` migration, a second ratelimit `RLB` namespace 1002 `{ limit: 1, period: 600 }`, vars `DAILY_BUILD_CAP: 50`.
- [ ] `migrations/0001_scenarios.sql`: `CREATE TABLE scenarios (id TEXT PRIMARY KEY, status TEXT, step TEXT, lang TEXT, title TEXT, era TEXT, place TEXT, description TEXT, prompt TEXT, pack TEXT, fragments TEXT, error TEXT, created INTEGER, builds INTEGER DEFAULT 0)`. Apply with `wrangler d1 migrations apply usoj --remote`.
- [ ] `worker/db.ts`: `getScenario(env, id)`, `putStatus(env, id, step, fragment?)`, `putPack(env, id, pack)`, `listReady(env, ids)`. `BuildsDO` with `take(): Promise<boolean>` that increments a per-UTC-day counter in `ctx.storage` and returns false at the cap.
- [ ] `Env` in `worker/jev.ts` gains the bindings; run `bun run types`, `bunx tsc -b`, `wrangler deploy --dry-run`. Commit `Bindings for scenarios`.

### Task 3: Sources

**Files:** Create `worker/sources.ts`, `worker/sources.test.ts`, `scripts/sources.ts`.

**Interfaces produced:** `fetchWikipedia(lang, title): Promise<{ title, url, lead, sections: { heading, text }[] }>` using `action=query&prop=extracts&exintro=1` for the lead and `action=parse&prop=sections` then `action=parse&section=N&prop=wikitext` for the 3 sections whose headings best match a keyword list passed in, stripped of markup, capped 6,000 chars each. `lookupPerson(label, startDate): Promise<{ label, qid, born, died } | null>` via `wbsearchentities` then `wbgetentities` for P31, P569, P570, requiring P31 Q5 and `born` within 100 years before `startDate`, trying the first 5 hits. `lookupParty(label): Promise<{ label, qid, color?, seats? } | null>` P465 and P1410 or P1342. User-Agent `USOJ/1.0 (youssef@ctf.ae)` on every call.

- [ ] Write the functions; wikitext stripping: drop `{{...}}` templates, `[[a|b]]` to `b`, refs, tables.
- [ ] Test with recorded fixtures (two small JSON responses saved under `worker/fixtures/wiki-*.json`): stripping and the birth guard (a person born 1996 with start 44 BC is rejected; Lepidus born −89 accepted, born −230 rejected).
- [ ] `scripts/sources.ts`: live run for "Rome 44 BC" printing chars per section and the person table. Commit `Wikipedia and Wikidata sources`.

### Task 4: Generation steps

**Files:** Create `worker/gen/prompts.ts`, `plan.ts`, `facts.ts`, `frame.ts`, `assign.ts`, `personas.ts`, `deck.ts`, `dedupe.ts`, `validate.ts`, `worker/gen/validate.test.ts`, `worker/gen/assign.test.ts`.

**Interfaces produced:** each step is `async (env: Env, ctx: GenCtx) => Partial<GenCtx>` where `GenCtx = { prompt, lang, fiction, sources, facts, frame, calendar, members, citizens, deck }`.

- [ ] `prompts.ts`: `CONTENT_RULE`, `HISTORIAN` role, the "leaders must be alive on the start date; never seat a named leader as a member; factions are the groupings a contemporary would recognize, named as historians name them, at least three for chambers over 30" rule, "never mention the game, its design, or that anything is fictional".
- [ ] `plan.ts`: Luna → `{ fiction, lang, lookups: string[], people: string[], parties: string[], keywords: string[] }`.
- [ ] `facts.ts`: Luna with sources → the sheet `{ people: [{ name, role, born, died, alive_on_start_date }], bodies, groupings, dated_events: [{ date, title }] }`. Merge Wikidata dates over the sheet's where present.
- [ ] `frame.ts`: Luna → frame fields of `Pack` plus `start_date` and `factions[].seats` shares. Then `validate.frame()`; on violations, one retry with the list and the previous JSON; still failing, throw `NeedsRepair` (Workflow catches, runs Astra with the same prompt plus the meta rule).
- [ ] `validate.ts`: `frame(frame, facts)` returns violations: unknown tag or id references, leader not alive per sheet flag or Wikidata death, leader name found in members later (`members()` check), fewer than 3 factions with size > 30, dated event outside the window. `calendar(start_date, sheetEvents, deckDates)`: anchor = latest fully dated event within 365 days after `start_date`, else the latest deck date, else none; unit = the one of day/week/month/season that puts anchor closest to turn 17 within 20; `start = anchor − 15 units`; returns `{ start_date, unit, turnOf(date) }`. Test with the saved Rome and Egypt dates: Ides (−0044-03-15) with anchor itself lands turn 16; Egypt anchor 2012-12-15 with month unit lands turn 16; no dates gives week and turn 1 for start.
- [ ] `assign.ts`: pure. Members: `scaleSeats` then round-robin regions by weight, temperaments from `TEMPERAMENTS` cycled with a seeded shuffle, years 30/40/30; flags from `chamber.veto` and frame hints. Citizens: 50 per bloc, regions by weight, age bands. Test: 100 members sum per faction equals `scaleSeats`, every region gets at least one when size ≥ regions.
- [ ] `personas.ts`: `names()` one Luna call → `{ members: string[], citizens: string[] }` deduped by code, top-up call for shortfall; `members(rows)` 25 per call in parallel; `citizens(rows)` 50 per call.
- [ ] `deck.ts`: Luna → 20 generic storylets themed from `TEMPLATES` (port the v2 §6 table into `worker/gen/templates.ts` with `needs`, `results`, `scored` fixed; Luna only writes `title_hint`, `stances`, `memory`) plus 5 to 8 dated storylets with `date`, `exogenous`, `needs`, `results` chosen from the same effect grammar. Code maps `date` to `turn` with `calendar.turnOf`.
- [ ] `dedupe.ts`: Jev step 1 Choice per persona in batches of 50 with the other ids as options, pairs ≥ 0.5 either direction, step 2 inline Noul ≥ 0.5, regenerate the lower seat's row through `personas.members([row])` with `must_differ_from`. Same for citizens in batches of 50.
- [ ] Commit `Generation steps`.

### Task 5: Art

**Files:** Create `worker/art.ts`, `worker/art.test.ts`; add `@cf-wasm/photon` dependency.

- [ ] Spike first: a `wrangler dev` route that decodes a 64×64 PNG with photon and returns its size. If photon fails in workerd, switch to the Images binding for crop plus `upng-js` for pixels and note it in the plan under Deviations.
- [ ] `muse(env, prompt, aspect): Promise<Uint8Array>` via `POST /api/v1/images` `{ model: "meta/muse-image", prompt, aspect_ratio, resolution: "1K" }`, reading `data[0].b64_json`.
- [ ] `sheet(env, prompt): Promise<Uint8Array[]>` crops 4×4 cells; `face(cell)` 128 px Floyd-Steinberg to a 16-color palette computed by median cut on the cell; `plate(cell, ink, paper)` 256 px grayscale, normalize, levels 10%–85%, ordered 8×8 dither at 3 levels, mapped to ink and paper; `crest(bytes, color, paper)` plate with color as ink; `masthead(bytes, ink, paper)` 1600×400 plate. All return PNG bytes.
- [ ] `alignment(cells)`: estimate the eye row per cell as the darkest 8-row band in the upper 60%; fail if more than 2 cells deviate over 12 px from the median.
- [ ] Test on `worker/fixtures/sheet.webp` (copy `scratchpad/art/rome4.webp`): 16 cells, alignment passes, `face` output is 128×128 PNG.
- [ ] Commit `Art pipeline`.

### Task 6: Build Workflow and scenario API

**Files:** Create `worker/build.ts`; modify `worker/index.ts`, `worker/db.ts`.

- [ ] `ScenarioBuild extends WorkflowEntrypoint<Env, { id, prompt }>`: steps in order plan, fetch, facts, frame (+validate, retry, Astra repair), assign, names, personas (members and citizens in parallel via `Promise.all` inside one step), deck, dedupe, art (masthead and crests in parallel), assemble (Zod full parse, `putPack`), index (Workers AI `@cf/baai/bge-m3` embed of `title era place description prompt`, `VEC.upsert`), ready. Then `portraits` step: all sheets at once, per sheet crop, face and plate to R2, `art.portraits[sheet] = "done" | "failed"` updated in D1. Each step writes `putStatus` with a fragment for the build screen: faction names and colors after frame, the first 8 member names after personas, 3 problems, the theme.
- [ ] Refusal handling: a Luna 4xx with a refusal body retries once with `x-ai/grok-4.7` for that step only; a second failure marks the scenario `failed` with a plain message.
- [ ] Routes: `POST /api/scenarios/match` (Task 7), `POST /api/scenarios` guarded by `RLB` and `BUILDS.take()`, inserting the row and `env.BUILD.create({ id, params })`; `GET /api/scenarios/:id` returns status, step, fragments, and `packView` when ready; `GET /api/scenarios/:id/art/*` streams from R2 with `Cache-Control: public, max-age=31536000, immutable`.
- [ ] `scripts/build.ts`: posts a prompt to prod, polls until ready, prints seconds per step and the pack summary. Run it for "Rome in 44 BC" and "Germany after the 2021 election"; both must reach `ready` under 150 s. Commit `Scenario build workflow`, deploy.

### Task 7: Matching

**Files:** Create `worker/match.ts`, `worker/match.test.ts`; modify `worker/index.ts`, `worker/jev.ts`.

- [ ] `match(env, prompt)`: embed, `VEC.query(vector, { topK: 20, returnMetadata: "all" })`, drop under cosine 0.6, fewer than 3 left → `{ build: true }`; else Jev Choice with state `{ prompt }` and options `{ id: { title, era, place, description } }` plus `none_of_these`; top ≥ 0.95 → `{ load }`, 0.85 to 0.95 → `{ offer: up to 3 with p ≥ 0.5 }`, else build.
- [ ] `jev.ts`: add `choice()` question type and `matchQuestion(candidates)`.
- [ ] Test the threshold function on synthetic probability maps.
- [ ] Route `POST /api/scenarios/match`. After Task 6's two builds exist, curl "Rome 44 BC before the Ides" must return `load` for the Rome scenario and "Bundestag 2021" must return `load` or `offer` for Germany; "Mars colony 2091" must return `build`. Log the three probabilities into `docs/experiments.md`. Commit `Scenario matching`.

### Task 8: Pack-driven engine

**Files:** Modify `worker/engine.ts`, `worker/engine.test.ts`, `worker/jev.ts`, `worker/luna.ts`; delete `worker/roster.json` usage.

**Interfaces produced:** `newGame(id, code, pack, faction, promises)`, `Game` per spec §1 of v2 with `pack: string` (scenario id), `faction`, `term`, `turn`, `stage`, `ledgers`, `patrons`, `promises`, `director`, `events`, `streak`, `escalations: EscalationKey[]`, `calendar`. `encodeCode/decodeCode` for `J3`. `whipState(pack, game, bill)`, `whipQuestions(pack, members)`, `citizenQuestions(pack, citizens, event)`, `applyVote`, `applyCitizens`, `director(game, pack)`, `resolveEvent`, `runTest(pack, game)`, `endTerm`, `continueTerm`.

- [ ] Replace `Party`, `STATES`, `SEATS`, `TAGS`, `BLOCS`, `DONORS` with pack lookups. `Senator` becomes `Member` with `memory`, `situation`, `party` → `faction`. Threshold: `pack.chamber.threshold`, supermajority on filibuster ≥ 0.5 or a veto seat ≥ 0.6, or escalation 2.
- [ ] Ledgers per v2 §4 with region approval replacing state approval; capital, party mood, chest, patron moods; promises with the turn 12 and turn 20 rules (turns 8 and 16 under escalation 8).
- [ ] Citizens: after each vote and each event, `citizenQuestions` (approve Noul, persona inside instructions, state with the bill or event and the record) → per-region delta `clamp((mean − 0.5) × 10, −6, 6)`, only when the region's mean moved over 0.05.
- [ ] Director per v2 §6 with the pack's deck; dated storylets fire on their turn when `exogenous` or `needs` hold; weights ×2 near-miss, ×0 seen in 6 turns. Generic relief cards when intensity > 70.
- [ ] Escalations: `ESCALATION_EFFECTS` table implementing the 20 keys of spec §7 as small functions on game or questions.
- [ ] The test: `chamber_loyalty` = mean of a synthetic whip on `{ question: "confidence in the President" }`; `public_intent` = mean citizen vote Noul weighted by region weight; `mandate = α × public + (1 − α) × loyalty`; win at ≥ 0.5; `reveal` order per `pack.test.reveal`: seats sorted by loyalty ascending for the walk, regions in weight order for the map. Each seat or region is one `crypto` draw against its own probability, so the reveal has real drama and the final tally is the drawn count, not the mean.
- [ ] Endings: `lame_duck` when approval < 35 at turn 18 or impeachment; score per spec §10 of v2 with the per-term multiplier; `continueTerm` keeps members, memory, ledgers, `director.seen`, adds two escalations.
- [ ] Tests: `scaleSeats` already; `decodeCode` round-trip; ledger deltas on a fixture bill; Director dry run of 200 simulated terms with random outcomes yields 4 to 7 crises per term and never two in a row before turn 17; `runTest` with α 1 and all citizens at 0.9 wins, α 0 and all seats at 0.1 loses.
- [ ] Commit `Pack-driven engine`.

### Task 9: GameDO and routes

**Files:** Modify `worker/game.ts`, `worker/index.ts`, `worker/luna.ts`, `src/api.ts`.

- [ ] `create({ scenario, faction, promises, seed? })` loads the pack from D1 (cached in the DO), validates faction and promises, builds the code, stores `scenarioId`. `load()` fetches the pack once per DO lifetime.
- [ ] Actions: existing draft, whip, lobby, amend, adopt, vote; new `events/:i` (stance → Jev bloc and patron scores → results applied → Luna `outcome` line), `test` (runs the test, stores the reveal order and draws), `continue`, `stop`.
- [ ] Luna: `parseBill` and `amendBill` get `lang` and vocabulary; `narrate` gets `lang`; new `quotes` (two, from the largest |vote − whip|), `card` (from a storylet template and state), `ending`.
- [ ] `view()` strips citizens to `{ id, region, bloc, name, weight }`, strips member prose except the current bill's quotes, includes `packView`.
- [ ] `scripts/term.ts`: creates a game on the Rome scenario as the Caesarians, plays 20 turns with three fixed bill texts cycling, one lobby per turn, resolves any event with stance 0, runs the test, prints ledgers per turn, crises drawn, the test result and score. Must complete under 6 minutes against prod with no 5xx. Commit `GameDO for packs`, deploy.

### Task 10: Front door: Write, Match, Build, Seat

**Files:** Create `src/Write.tsx`, `src/Match.tsx`, `src/Build.tsx`, `src/Seat.tsx`, `src/theme.ts`; modify `src/App.tsx`, `src/styles.css`, `src/api.ts`; delete `src/Setup.tsx`.

- [ ] `theme.ts`: `applyTheme(theme)` sets `--ink`, `--paper`, `--bg` (paper), `--accent`, `--display`, `--sans`, `data-texture`, `data-ornament` on `:root`; injects a Google Fonts link for the pair; `FILL_DEFS` returns 12 `<pattern>` elements parameterized by color; `fillFor(faction)`.
- [ ] `Write.tsx`: the masthead in the default theme, one textarea, "Find this era". Calls `match`; routes to Match, Build or straight to Seat.
- [ ] `Match.tsx`: up to 3 cards with masthead image, title, era, place, description, crests; "Play this" and "Build mine".
- [ ] `Build.tsx`: polls every 2 s; steps list with ticks; fragments render as they land: faction chips in their colors, crests, member names, problems; the theme applies live at the frame step (press wipe on the whole page). Failure state with the message and "Try another prompt".
- [ ] `Seat.tsx`: chamber preview in the pack's layout with faction fills, a faction picker (crest, seats, premise, start difficulty as party mood and hostile partners), promise chips (pick 3 of 8), the code, "Take the seat" with the stamp using `pack.vocabulary.seat`.
- [ ] Phone check via the 390 px iframe trick. Commit `Front door`, deploy.

### Task 11: Layouts and the chamber

**Files:** Create `src/layouts.ts`, `src/layouts.test.ts` (bun); modify `src/Hemicycle.tsx`, `src/Drawer.tsx`.

- [ ] `layouts.ts`: `points(layout, n): { x, y, angle }[]` in a 600×340 box: hemicycle (rows of 12/16/20/24/28 scaled to n), benches (two banks facing, speaker chair), horseshoe, circle (rings), classroom (rows facing front), court (arc facing one chair). Test: n points, all inside the box, minimum pairwise distance ≥ 14 for n = 100 and ≥ 24 for n = 24.
- [ ] `Hemicycle.tsx` → `Chamber` rendering any layout; seats grouped by faction along the layout's order (own faction first, then coalition, then opposition by seats); fill = faction color with the pattern overlaid in ink; coins: portrait `face` clipped in the circle when the R2 file exists (`onError` falls back to initials in faction color); the roll call unchanged; hover label uses `pack.vocabulary.member` and region name.
- [ ] `Drawer.tsx`: plate image at 256 px on paper with ink rules, initials until it loads; faction name in its color; lobby buttons from `pack.lobby` texts and costs.
- [ ] Commit `Six layouts and faction fills`.

### Task 12: The term, themed

**Files:** Modify `src/Chamber.tsx`, `src/styles.css`; create `src/Ledger.tsx`, `src/Card.tsx`.

- [ ] Vocabulary everywhere: buttons, kicker, prompts, count labels from `pack.vocabulary`; headline card keeps its form.
- [ ] `Ledger.tsx`: five meters (voters, capital, base, patrons, party) animating in sequence with 100 ms stagger and rolling digits; promises as three stamps pending, kept, broken; streak.
- [ ] `Card.tsx`: crisis card as a native `<dialog>` in the poster style: title, body, three stance buttons; after the stance, five bloc meters and the outcome line; escalation announcements use the same dialog with the pack's headline.
- [ ] Quotes: two pull quotes slide in after the stamp. Roll call: last five votes slow to 400 ms each when within 3 of the threshold; shake tiers 2, 4, 6 px by margin.
- [ ] Commit `Term screens themed`.

### Task 13: The test, Won, Over, keep going

**Files:** Create `src/Test.tsx`, `src/Won.tsx`; modify `src/Over.tsx`, `src/App.tsx`.

- [ ] `Test.tsx`: `reveal: "seats"` walks the chamber, one seat per beat on a rAF clock, each declaring for or against with a tick and the mandate numeral counting; `"regions"` walks a region list ordered by weight with a bar filling (Stage B replaces with a map); `"both"` runs regions then seats. Cannot be skipped on the first view of a run; 40 s.
- [ ] `Won.tsx`: inaugural text, the term's score, "Stop here" and "Another term" with the next two escalations named from the pack.
- [ ] `Over.tsx`: ending title from the pack, Luna body, score per term with rolling digits, share card (one row per bill, filled and hollow squares in faction color), the code, "Run it back", "New scenario".
- [ ] Full run in Chrome on prod: build or load Rome, seat as the Liberators, play 20 turns with the tour, hit at least one crisis card, reach the test, continue one term, lose or stop. Fix what breaks. Commit `Test, Won, Over`, deploy.

### Task 14: Docs and memory

- [ ] `README.md`: the new flow, bindings, costs, scripts. `PRODUCT.md` register unchanged; `DESIGN.md`: theme schema, fills, layouts, coin and plate.
- [ ] `docs/experiments.md`: matching probabilities, build times per step from `scripts/build.ts`, a term's cost from `scripts/term.ts`.
- [ ] Memory: update the project memory file with the v3 ship date and the new dev gotchas (photon, Workflows status, Vectorize dims).
- [ ] Commit `Stage A docs`, deploy, push.

## Self-review

Spec coverage: matching §2 → Task 7; pack §3 → Task 1; pipeline §4 → Tasks 3, 4, 6; art §5 → Task 5 and 11; theme and layouts §6 → Tasks 10, 11; rules §7 → Task 8; run-time calls §8 → Tasks 8, 9; storage and API §9 → Tasks 2, 6, 9; front end §15 → Tasks 10 to 13; experiments §10 items 5 and 6 → Tasks 7 and 8 tests. Deferred to Stage B by spec §11: the Feed, midterm night, campaign turns, region map reveal. Type names match across tasks: `Pack`, `Member`, `Citizen`, `GenCtx`, `EscalationKey`, `packView`, `calendar`. No placeholders.
