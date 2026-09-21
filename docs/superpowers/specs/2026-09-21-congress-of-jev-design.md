# Congress of Jev — design spec

Date: 2026-09-21. Status: awaiting review.

United States of Jev is a political game built on Jev 1.13, TypeSafe's System One model.
The player is the President. They write bills in plain words; 100 senators, each a fixed
persona, are judged by Jev in one call; the chamber lights up with every senator's
yes-probability; the player lobbies, amends, and calls the vote.

Governing constraint: **code proposes options, Jev judges, Luna narrates.** Jev returns
typed answers (Choice, Score, Noul) with probabilities and cannot write text. Luna
(`openai/gpt-5.6-luna`) is the only text generator and is called at most twice a turn.

Evidence behind the numbers in this spec: `docs/experiments.md`. Idea backlog: `docs/ideas.md`.

## 1. Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Cloudflare Worker, TypeScript, Hono | ~5 ms cold start, first-class Durable Objects. Python Workers measured at ~1 s cold start by Cloudflare |
| State | One Durable Object per game, SQLite-backed | Serializes mutations, paid plan covers it |
| Jev | `fetch` to `https://openrouter.ai/api/v1/systemone`, model pinned to `typesafe/jev-1.13` | One OpenRouter key for Jev and Luna. Pinned so tuned thresholds do not drift |
| Luna | OpenRouter chat completions, JSON schema response format, Zod on the Worker | Structured bills, amendments, headlines |
| Front end | Vite, React, Motion, Cloudflare Vite plugin, static assets | Polish lives here; assets are free and unmetered |
| Tooling | Bun for install and scripts, wrangler for deploy, Vitest | |

Measured: a 100-senator whip count is 18,341 input tokens, 473 to 550 ms, $0.00077.
State cap is exactly 32k tokens; 55k total with 1,200 questions succeeds.

## 2. Modes and setup

One engine, three modes as parameters.

| Mode | Bills per term | Election at end | Preset agenda |
|---|---|---|---|
| Term | 40 | Yes | No |
| Sandbox | unlimited | No | No |
| Agenda | 10 | No | Yes |

Setup screen, six controls in order: party, preset or custom split, mode, lobby toggle,
amend toggle, share code (prefilled with today's daily code). Presets:

| Preset | Your party's seats | President popularity |
|---|---|---|
| Honeymoon | 55 | popular |
| Divided | 50 | evenly split |
| Lame duck | 45 | unpopular |
| Custom | 40 to 60 | player's pick |

### Share code

One string carries every setting. Decoded identically on client and server.

```
J1-D55TLA-7Q2XK9
 │  │││││  └ 32-bit random, base32: seat jitter, modifiers, vote draws
 │  ││││└ A: agenda index (Agenda mode only)
 │  │││└ L: lobby on, A: amend on
 │  ││└ T: mode (T term, S sandbox, A agenda)
 │  │└ 55: your party's seats
 │  └ D: your party
 └ format version
```

Given a code, the chamber, modifiers, starting approval and every floor-vote draw
reproduce. Term and Sandbox share the chamber, not the bills. Agenda mode is the fully
comparable run and is what the daily challenge uses.

## 3. Turn loop

Every bill passes through five phases.

1. **Draft.** Player types prose. Jev gate first: one Noul, "Is this text a proposal for a
   law or government policy?" Under 0.3 rejects in ~300 ms with no Luna spend. Otherwise
   Luna returns `Bill {title, summary, tags[]}`; tags from a closed set of 20.
2. **Whip count** (Jev, one call). State is the bill plus two word-bucketed context
   fields. Questions: one Noul per sitting senator (100), `filibuster` Noul, five bloc
   Scores (3 levels: indifferent, opposed, outraged), `constitutional` Noul.
3. **Persuade** (optional, toggles). Lobby: pick a senator and an action (pork project,
   trade a favor, threaten a primary), pay capital, Jev re-judges that senator with the
   offer appended to the state. Amend: Luna proposes 3 variants, 3 whip counts run in
   parallel, player adopts one.
4. **Floor vote.** Code. Each senator's vote is a Bernoulli draw from their final
   probability using the game seed and bill index. 51 passes; 60 if the filibuster Noul
   is at or above its threshold. The whip count is a forecast, not a promise.
5. **Consequences.** Code. Approval per state moves by tags × state leaning × pass/fail.
   Each senator involved (lobbied, defected, delivered) gets a memory line, last 5 kept,
   appended to their persona in later whip counts. Luna writes one headline and a
   two-sentence lede.

What code owns: all arithmetic, thresholds, capital, random draws, approval. What Jev
owns: every "would this person say yes" judgment. What Luna owns: prose in, `Bill` out;
amendments; headlines.

## 4. Jev question design

State, small and worded:

```json
{
  "bill": { "title": "...", "summary": "...", "tags": ["healthcare", "taxes"] },
  "president": { "party": "Democrat", "popularity": "unpopular" },
  "chamber": { "majority": "Republican", "session": "election year" }
}
```

Popularity is a word bucket computed in code. Measured: Jev handles simple numbers
correctly, so this is a readability choice, not an accuracy one.

One Noul per senator, persona inside the structured instructions:

```json
"s_TX_1": {
  "type": "noul",
  "instructions": {
    "senator": {
      "state": "Texas", "party": "Republican", "years_in_office": "long",
      "core_issues": ["energy", "border"],
      "temperament": "deal-maker",
      "tell": "votes against party when home-state jobs are on the line",
      "donors": ["oil and gas"],
      "situation": "up for re-election this year",
      "memory": ["The President promised a refinery grant last session and delivered it."]
    },
    "question": "Would this senator vote yes on `bill` on the floor?"
  },
  "criteria": {
    "true":  "The senator votes yes. The bill serves their core issues, donors, or state, or a favor is owed.",
    "false": "The senator votes no. The bill hurts their core issues, donors, or state, or their party opposes it and no favor is owed."
  }
}
```

About 150 tokens per senator. Persona text stays lean: latency scales with input
(10k tokens 520 ms, 32k 840 ms).

Lobby re-judge: same question, state gains `"offer": "..."`. One question, one call.

Noul has no confidence field. If "Jev is unsure" is wanted as a UI signal later, the
senator question becomes a two-option Choice and its confidence is read. Not now.

## 5. Luna's jobs

| Job | Input | Output | On failure |
|---|---|---|---|
| Parse bill | player text | `Bill` | retry once, then "could not read that bill" |
| Amend | bill, top 5 opposing senators, loudest bloc | 3 `Bill` variants | hide Amend this turn |
| Narrate | bill, result, 3 biggest defectors, bloc scores | headline + lede | skip the headline |

Tags, closed set of 20: taxes, spending, healthcare, guns, immigration, energy, climate,
farming, defense, veterans, education, labor, tech, trade, housing, crime, courts,
elections, infrastructure, civil-rights.

## 6. Roster and variety

Roster is generated once by a script and committed as `worker/roster.json`: 200
senators, one Republican and one Democrat per seat. Party and state are code-assigned.
Luna fills, in batches of 10 states: fictional full name, 2 core issues from the tag
set, 1 temperament from 6 (loyalist, deal-maker, populist, ideologue, institutionalist,
maverick), 1 to 2 donor groups from 10, a one-line bio, a one-line tell. Zod validates
every field against the closed sets; a failing batch is regenerated.

Per-game variety comes from the seed, on top of the fixed cast:

1. Which seat is filled: the split picks who sits, filling by a static state-lean table
   so swing states flip first.
2. Situation modifiers: 15 of the 100 sitting senators draw one line from a closed list
   of 12 (up for re-election, facing a primary, retiring, lost a major donor, home state
   hit by a disaster, ...).
3. Starting conditions: approval per state jittered by a few points; an opening crisis.

Regenerated rosters are a later settings toggle, not built now.

### Portraits

Generated once by a script, 200 images, one prompt template varied by age, temperament
and state. Post step for every image: 256 px, two-tone posterize in the accent color,
WebP at about 15 KB. Total about 3 MB of static assets. A seeded SVG fallback covers any
senator whose image fails review. Shown at full size in the seat drawer and at 24 px on
seat hover.

## 7. Worker API and Durable Object

Every game route forwards to the game's Durable Object. Mutating requests carry the turn
number; stale ones are rejected. State is written only after an outbound call succeeds.

| Route | Does | Calls out | Latency |
|---|---|---|---|
| `POST /api/games` `{code}` | decode, seat chamber, create DO | none | 50 ms |
| `GET /api/games/:id` | full state | none | 50 ms |
| `POST /api/games/:id/bills` `{text}` | Jev gate, Luna parse | Jev 1, Luna 1 | 0.3 s reject, else 1.8 s |
| `POST .../bills/:b/whip` | 100 senators + filibuster + blocs + constitutional | Jev 1 | 0.5 s |
| `POST .../bills/:b/lobby` `{senatorId, action}` | deduct capital, re-judge one | Jev 1 | 0.3 s |
| `POST .../bills/:b/amend` | 3 variants, 3 whip counts | Luna 1, Jev 3 | 2.5 s |
| `POST .../bills/:b/amend/:i` | adopt variant | none | 50 ms |
| `POST .../bills/:b/vote` | seeded draw, consequences, headline | Luna 1 | 1.3 s |

Bill submit and whip are separate routes so the UI shows two beats. The vote route
awaits narration because the roll-call animation outlasts it. No polling, no WebSockets.

Files:

```
worker/index.ts      Hono routes, rate limit, forwards to DO
worker/game.ts       GameDO: turn loop, state
worker/engine.ts     pure: decode code, seat chamber, vote draw, consequences
worker/jev.ts        typed fetch to /api/v1/systemone, question builders
worker/luna.ts       typed fetch to chat completions, Zod schemas
worker/roster.json   200 senators
scripts/roster.ts    generate roster (run by hand)
scripts/portraits.ts generate and posterize portraits (run by hand)
scripts/smoke.ts     one live whip count
src/                 React app
```

Data model:

```
Game    { id, code, mode, party, split, seed, turn, capital, approvalByState[50],
          bills[], settings{lobby, amend}, seated[100] }
Senator { id, seat, state, party, name, bio, core_issues[2], temperament, tell,
          donors[], situation?, memory[5] }
Bill    { title, summary, tags[], whip{senatorId: p}, filibuster, blocs{},
          votes{}, passed, amendments[], headline? }
```

Key protection: `OPENROUTER_API_KEY` as a wrangler secret; rate-limit binding at 20
requests per minute per IP; 200 turns per game. Errors: OpenRouter 429 or 5xx retries
once after 300 ms, then 503 shown as "The chamber is in recess".

## 8. UI

One page, three screens, no router. System font stack, one accent color, muted party
colors, light and dark from the OS.

**Setup.** Six controls, "Take office". Share code updates live; pasting one sets every
control.

**Chamber.** Four regions: hemicycle (100 seats, SVG, party as faint fill,
yes-probability as opacity and size), whip bar (expected yes with ticks at 51 and 60,
60 turns solid when filibuster risk is high), bill pad (text area, then the parsed bill
card with tag chips), ledger (capital, approval, turn n of N, last three headlines,
mute toggle). Tap a seat for a drawer: portrait, name, state, bio, tell, memory,
probability, the three lobby actions with costs. The approval map (us-atlas Albers,
d3-geo, 5-step sequential fill) sits behind a toggle.

**Term over.** Re-election map, final score, share code with copy.

Animation beats:

1. Bill parsed: text area collapses into the card; tag chips stagger in 40 ms apart.
2. Whip count: seats fade from grey to their probability in a wave from the center,
   8 ms per seat; whip bar fills alongside.
3. Lobby: one seat pulses and settles; capital digits roll.
4. Floor vote: roll call resolves seats one by one in random order, accelerating; whip
   bar becomes a hard count; bounce at 51 or 60; pass or fail stamp.
5. Headline slides up under the bill card; approval deltas tick.

`prefers-reduced-motion` swaps waves for a single 200 ms fade.

Sound, Web Audio, off until first interaction, mute persisted in localStorage: roll-call
tick with pitch rising with the yes count, two-note chime on parse, click on lobby,
recorded gavel (CC0, ~20 KB) on pass, low thud on fail, paper slide on headline. Five
synthesized, one sample.

Tour, state-driven coach marks, no library: first game locks Honeymoon and walks three
steps unlocked by game state: write a bill (suggested text prefilled), lobby the dimmest
seat on your side, call the vote. Skip always visible; `tourDone` in localStorage.

Responsive: phone stacks hemicycle, whip bar, bill pad, with the drawer as a bottom
sheet; desktop puts the hemicycle left two thirds.

## 9. Testing and deploy

| Layer | Tool | Proves |
|---|---|---|
| `engine.ts` | Vitest | code round-trip, deterministic seating and draws, bounds on capital and approval |
| `GameDO` with fake fetch | `@cloudflare/vitest-pool-workers` | state mutates only after success; stale turns rejected |
| Live smoke | `scripts/smoke.ts` | one real whip count under 20k tokens and 1 s |

One snapshot test pins one senator's question JSON. No UI unit tests; one full game in
the dev server before each deploy.

Deploy: one Worker with static assets via the Cloudflare Vite plugin. `wrangler.jsonc`
declares the DO binding and migration, rate-limit binding, assets. Key via
`wrangler secret put`; `.dev.vars` locally; both gitignored. First target `workers.dev`.

## 10. Build order

1. Scaffold, hello route, empty DO, deploy. Check: JSON from workers.dev; DO deploys. 1 h
2. `engine.ts` + tests. Check: Vitest green. 2 h
3. `jev.ts`, `luna.ts`, smoke. Check: live whip count under 700 ms. 1 h
4. Roster script, 200 senators. Check: Zod passes; whip count under 20k tokens. 2 h
5. `GameDO` + routes. Check: DO tests green; one full turn by curl. 4 h
6. UI screens, no animation. Check: full Term game in browser. 6 h
7. Animation, sound, tour. Check: reduced motion and mute work. 6 h
8. Portraits. Check: 200 WebP under 4 MB. 2 h
9. Daily seed, share polish, deploy. Check: two browsers, same code, same chamber. 2 h

## Not building now

Senator regeneration per game, leaderboard, multiplayer or spectators, custom domain,
onboarding beyond the three-step tour, Playwright tests.
