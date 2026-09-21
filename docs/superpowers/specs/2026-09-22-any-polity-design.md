# Any Polity: USJ v3 design spec

Date: 2026-09-22. Status: awaiting review. Supersedes `2026-09-22-the-term-design.md` (v2),
whose game rules carry over unchanged unless a section here says otherwise. Research in
`docs/fun.md`. Interview decisions of 2026-09-22 are folded in.

United States of Jev is a one-sitting political roguelike. The player writes any scenario
that ever existed or never did: Germany in 2021, Rome in 44 BC, Egypt after 2011, the
first Mars colony. The game finds it in a shared archive or builds it from sources, seats
the player in any faction they choose, and runs one term of 20 turns, a midterm, a
campaign, and a test. Re-election is the win. The player can stop or push into harder
terms until they lose. Nothing carries over between runs. No two runs are alike.

Governing constraint: **code proposes options, Jev judges, Luna narrates, the generator
fills a fixed schema.** The engine never sees a country name. Every number is code's.

## 0. Decisions

| Decision | Choice |
|---|---|
| One body | Every polity is one chamber of 24 to 100 power holders plus a public of 250 citizens. Armies, courts and clergy sit in the chamber as seats with flags |
| Factions | 2 to 12, historically accurate names and colors, each with a fill pattern as well as its color |
| Player seat | Any faction. The pack ships one start variant per faction with a premise and a coalition that adds up |
| Members | Real parties, regions and structures. Fictional members in the seats. Real leaders named in premises and headlines only. No generated likeness of a living person |
| Size | Chambers scale proportionally to at most 100 seats; small bodies keep their size |
| Pace | Fixed: 20 turns, midterm after 10, 4 campaign turns, the test. The pack names the units |
| History | Dated events fire on their turn. Exogenous ones fire regardless. Government-linked ones need their conditions. Generic storylets are themed to the era |
| The test | α blends public intent and chamber loyalty. The reveal walks regions when α is high, seats when α is low, both when mixed |
| Escalation | 20 fixed mechanics, era-named by the generator, two added per extra term |
| Generator | Luna by default. Astra when review finds more than 3 errors. Grok as retry for benign refusals only. Atrocity content excluded by schema on every model |
| Grounding | Generator plans lookups, Worker fetches Wikipedia extracts and Wikidata facts, generator writes with sources, a light review checks names and dates |
| Matching | Workers AI embeddings into Vectorize find top 20, Jev picks with probabilities: ≥ 0.95 load, 0.85 to 0.95 offer, else build |
| Archive | Public by default, prompt stored as description, no author |
| Art | muse-image contact sheets via `/api/v1/images`, 16 distinct faces per call at about $0.004; one masthead; one crest per faction. No eye bar. Faces: 16-color dither in a seat coin at seat and hover size, newsprint halftone plate in ink at drawer size. All at build, cached in R2 |
| Palette | Faces are full-color dither, plates are ink. Generator picks page tones from the palette experiment's schema (contrast passed 3 of 3 at 13:1 or better) |
| Layouts | Six presets: hemicycle, opposing benches, horseshoe, circle, classroom, court |
| Build guards | One new build per IP per 10 minutes, a global daily cap, matching unlimited |
| Language | One text box, any language. The pack records it. Luna writes in it. Persona fields stay English for Jev |
| Sound | Unchanged from v1 |

## 1. Player flow

| Screen | What happens |
|---|---|
| Write | One text box: "Egypt after the 2011 revolution". Submit |
| Match | Under 2 s. ≥ 0.95: load. 0.85 to 0.95: up to 3 cards with masthead, era, faction crests, "Play this" or "Build mine". Else: build |
| Build | 60 to 120 s. Steps tick off and fragments land as they finish: sources read, factions and crests, the chamber seated with portraits appearing, society problems, the deck, the theme applied live. Polled every 2 s |
| Seat | Pick a faction (crest, seats, premise line, start difficulty). Pick 3 promises from the pack's list of 8. Code shown |
| Term | The v2 week loop, themed |
| Midterm, campaign, test | v2 §7 to §9 with the pack's names and the α reveal |
| Won | Score, "Stop here" or "Another term" with the next two escalations named |
| Over | Ending, score per term, share card, "Run it back", "New scenario" |

Setup has no slider. The pack fixes the chamber. Difficulty is the faction the player picks
and the three promises.

## 2. Matching

1. Embed the prompt with Workers AI `@cf/baai/bge-m3` (multilingual).
2. Vectorize query, top 20 scenario ids with cosine scores.
3. Jev Choice, one call: state `{ prompt }`, options are the 20 candidates' `{ title, era, place, description }` plus `none_of_these`. Probabilities decide: top ≥ 0.95 load; 0.85 to 0.95 offer up to 3 with probability ≥ 0.5; else build.
4. Fewer than 3 candidates from Vectorize (cosine < 0.6): skip Jev, build.

Jev never sees more than 21 options and the prompt, so the call is under 3k tokens.

## 3. The polity pack

One JSON document per scenario, validated with Zod at every step. Stored in D1 as text
with images in R2. The engine reads only this.

```ts
interface Pack {
  v: 1; id: string; lang: string; prompt: string;
  title: string; era: string; place: string; description: string;     // description ≤ 60 words, shown on match cards
  fiction: boolean; sources: { title: string; url: string }[];
  content_note?: string;                                              // what the generator excluded or reframed, shown once

  vocabulary: { seat: string; chamber: string; member: string; bill: string; pass: string; fail: string; capital: string;
    turn: string; midterm: string; campaign: string; test: string; feed: string; post: string; whip: string; lobby: string;
    promise: string; patron: string; approval: string };
  theme: { fonts: FontPair; ink: string; paper: string; accent: string; texture: "newsprint" | "parchment" | "concrete" | "steel" | "none";
    ornament: "laurel" | "eagle" | "star" | "crescent" | "cross" | "gear" | "rule" | "none"; layout: Layout };

  chamber: { size: number; threshold: number; supermajority: number; alpha: number;  // alpha: public weight in the test, 0..1
    veto?: { flag: SeatFlag; text: string } };                        // e.g. a tribune or the generals can freeze a bill
  factions: Faction[];                                                // 2..12
  regions: Region[];                                                  // 6..60, with weight summing to 1
  blocs: Bloc[];                                                      // exactly 5
  patrons: Patron[];                                                  // exactly 10
  members: Member[];                                                  // chamber.size
  citizens: Citizen[];                                                // 250: 50 per bloc, spread over regions by weight
  starts: Start[];                                                    // one per faction
  problems: string[];                                                 // 8..12, one line each, feed the Director's economy line and Luna
  promises: { tag: Tag; label: string }[];                            // 8 options, player picks 3
  tags: Tag[];                                                        // 16..24 era-appropriate policy tags
  deck: Storylet[];                                                   // 20 generic themed + 5..8 dated
  escalations: { key: EscalationKey; name: string; headline: string }[];   // all 20, era-named
  test: { name: string; win: string; lose: string; reveal: "regions" | "seats" | "both" };
  endings: { reelected: string; defeated: string; lame_duck: string; impeached: string };   // titles only; Luna writes bodies at run time
  lobby: { pork: LobbyText; favor: LobbyText; threat: LobbyText };   // era texts and costs 10/15/20
  art: { masthead: string; crests: Record<string, string> };         // R2 keys
}

interface Faction { id: string; name: string; short: string; color: string; fill: Fill; ideology: string; leader: string }  // leader: real name, not seated
type Fill = "solid" | "hatch" | "hatch2" | "cross" | "dots" | "rings" | "hollow" | "half" | "wave" | "grid" | "brick" | "check";
interface Region { id: string; name: string; weight: number; lean: Record<string, number> }   // lean per faction −1..1
interface Bloc { id: string; name: string; description: string }
interface Patron { id: string; name: string; wants: Tag[]; hates: Tag[] }
interface Member { id: string; seat: string; region: string; faction: string; name: string; bio: string; core_issues: Tag[];
  temperament: Temperament; tell: string; patrons: string[]; years: "new" | "mid" | "long"; flags: SeatFlag[]; portrait: string }
type SeatFlag = "veto" | "army" | "clergy" | "court" | "crown";
interface Citizen { id: string; region: string; bloc: string; name: string; age: number; job: string; town: string;
  worldview: string; issues: [Tag, Tag]; weight: number }
interface Start { faction: string; seat_title: string; coalition: string[]; premise: string; party: number; capital: number;
  hostile?: string[] }                                                // factions in the coalition that start hostile
interface Storylet { id: string; kind: "generic" | "dated"; turn?: number; exogenous?: boolean;
  needs?: Condition[]; weight: number; title_hint: string; stances: string[]; scored: ("blocs" | "patrons" | "none")[];
  results: Effect[]; memory?: string }
type Condition = { ledger: "approval" | "capital" | "party" | "chest" | "bloc" | "patron" | "streak" | "turn"; id?: string; op: "<" | ">"; value: number };
type Effect = { ledger: Condition["ledger"] | "seat"; id?: string; delta?: number; set?: string; chance?: number };
```

Temperaments, blocs count, patrons count, lobby costs, promise rules, Director thresholds,
and ledger ranges stay the v2 constants. The generator fills names and relations, never
rules.

Dated storylets: `exogenous: true` fires on its turn whatever the ledgers say (a flood, a
foreign war, a comet). `exogenous: false` fires on its turn only if `needs` hold (the
army's ultimatum needs `army loyalty < 0.5`, computed as the mean whip of `army`-flagged
seats on the last bill). Generic storylets are the v2 twenty, rewritten in era terms with
the same `needs` and `results` shapes. The generator may not add effect types.

Seat scaling: real seat shares are scaled to `chamber.size` with largest remainder, minimum
one seat per faction that held any. Regions get members in proportion to weight.

## 4. Generation pipeline

A Cloudflare Workflow, one step per row, each retried up to twice. Status and fragments are
written to D1 after every step for the build screen.

| Step | Model | Output | Time |
|---|---|---|---|
| plan | Luna | `{ fiction, lang, lookups: string[] (≤ 10 Wikipedia titles, any edition), wikidata: string[] (entity labels) }` | 3 s |
| fetch | none | Wikipedia `prop=extracts&explaintext` for each title, 1.2k tokens each; Wikidata SPARQL for parties (P465 color, seats), heads of government (P6), election results. Fiction skips | 5 s |
| frame | Luna | title, era, place, description, vocabulary, theme, chamber, factions, regions, blocs, patrons, tags, problems, promises, starts, test, endings, lobby, escalations | 20 s |
| members | Luna | `chamber.size` members, 25 per call in parallel | 15 s |
| citizens | Luna | 250 citizens, 50 per call in parallel | 15 s |
| deck | Luna | 20 generic themed plus 5 to 8 dated storylets | 20 s |
| review | Astra | `{ errors: { path, wrong, right, source }[] }` on names, dates, seat shares, colors, leaders. Under 4 errors: patch and continue. 4 or more: rerun frame and deck with Astra | 15 s |
| art | muse-image | contact sheets (size ÷ 16 calls), masthead, one crest per faction; crop, dither, eye bar, R2 | 30 s |
| index | Workers AI | embed `title + era + place + description + prompt`, upsert to Vectorize, mark ready | 2 s |

Cost per build: Luna path about $0.10, Astra fallback about $2.50, art about $0.15. The
content rule sits in every generation prompt: no depiction, planning or reward of
atrocities in bills, storylets, headlines or quotes; when a prompt seats the player in a
regime defined by them, the generator keeps the period and seats the player in the nearest
governing seat that can be played at the strategic level, and writes `content_note`. A
model refusal on a benign step retries once on Grok, then fails the build with a message.

Guards: the ratelimit binding gates `POST /api/scenarios` at one build per IP per 10
minutes; a Durable Object counts builds per UTC day against a cap set in `wrangler.jsonc`
(default 50); matching and loading are unlimited.

## 5. Art pipeline

Measured 2026-09-22 (`docs/experiments.md`): muse-image draws 16 distinct, aligned faces per
4×4 sheet for $0.003 to $0.004 in 15 to 22 s, eye line within 4 px. Flux schnell, flux.2
klein and krea repeat one face; qwen-image-3 matches muse on quality at 10× the price and
4× the time and is the fallback when a sheet fails the alignment check.

| Asset | Prompt shape | Post |
|---|---|---|
| Contact sheet | "4×4 grid of 16 different [era] [member noun], passport framing, head and shoulders, same face size, eyes on one horizontal line, plain wall, no text, no borders" | crop 4×4, then two renders per member: `face`, 128 px, 16-color Floyd-Steinberg dither; `plate`, 256 px, grayscale, normalize, level 10% to 85%, ordered dither o8x8 at 3 levels, printed in the pack's ink on its paper |
| Masthead | "wide [era] engraving of [place landmark], no text" | resize 1600×400, same plate treatment |
| Crest | "[faction] emblem, flat, centered, [ornament], no text" | resize 96, plate treatment with the faction color as ink |

Presentation, all CSS, nothing baked into the image:

| Size | Form |
|---|---|
| Seat and hover, 44 to 96 px | seat coin: the `face` in a round crop, a ring in the faction color, a 1 px ink rule outside it. Selected seat gets a thicker ring |
| Drawer, 256 px | the `plate` on the pack's paper, ink rule top and bottom, faction color only in the name line |

Alignment check per sheet: the crop's 16 cells are sampled at the expected eye row; if
more than 2 cells fall outside a 12 px band, the sheet is regenerated once, then the build
falls back to qwen-image-3. Files go to R2 under
`scenarios/<id>/{members/<memberId>.png, members/<memberId>-plate.png, masthead.png,
crests/<factionId>.png}`, served through the Worker with immutable cache headers.

## 6. Theme

Page tokens are a schema, not CSS. The client maps the pack's theme onto the existing
custom properties: `--ink`, `--paper`, `--accent`, `--display`, `--sans`, a texture class on
`body`, and an ornament SVG used in the masthead rule and stamps. Font pairs come from
eight curated Google Fonts pairs preloaded by name. Contrast is enforced at build: ink on
paper must reach 4.5:1 or the reviewer resets to the default.

Factions: color from Wikidata P465 when the party exists, else the generator's choice from
a 12-color set with pairwise distance enforced; fill from the 12 patterns, unique per
faction. Seats render `fill: color` with the pattern overlaid in ink, so color-blind
players read the pattern and everyone else reads the color.

Layouts: six point generators, all producing `{x, y, angle}` per seat in a 600×340 box.

| Layout | Used by |
|---|---|
| hemicycle | continental parliaments, US Senate |
| benches | Westminster family |
| horseshoe | Commonwealth hybrids |
| circle | councils, curia, round tables |
| classroom | mass assemblies, party congresses |
| court | monarchies, juntas, politburos: an arc facing a single chair |

## 7. Game rules

v2 sections 3 to 12 apply with these changes:

- Names come from `pack.vocabulary`. "Bill" is a decree in Rome and a directive on Mars.
- Threshold and supermajority come from `pack.chamber`. A `veto` seat flag adds one Noul per
  flagged seat: "would this member use their veto", and any yes at ≥ 0.6 sends the bill to
  a second round at the supermajority.
- Party mood applies to the player's faction. Coalition partners each carry a loyalty number
  from their start hostility; a partner under 30 votes as opposition on the next whip.
- Approval is per region. The test's public term uses region weights.
- The Feed is named by the pack; mechanics unchanged.
- Midterm: the pack's midterm name; the class is a seeded third of seats.
- The test: `mandate = α × public_intent + (1 − α) × chamber_loyalty`, where
  `chamber_loyalty` is the mean whip of all seats on a synthetic "confidence" question at
  term end. Win at mandate ≥ 0.5. The reveal follows `pack.test.reveal`.
- Escalations: two per extra term from the twenty, in the order below, era-named.

| # | Mechanic | Effect |
|---|---|---|
| 1 | hostile press | approval −1 in every region on every verdict |
| 2 | supermajority era | threshold becomes the supermajority on every bill |
| 3 | recession | economy line set, two patrons start at −1 |
| 4 | scandal season | four seats gain an investigation situation |
| 5 | short fuse | Director thresholds 20 and 60 |
| 6 | split chamber | midterm flips 8 seats against the player before the draw |
| 7 | costly favors | lobby costs × 1.5 |
| 8 | fickle base | promise deadlines at turns 8 and 16 |
| 9 | empty chest | patron contributions halved |
| 10 | hostile court | constitutional strike at 0.5 instead of 0.7 |
| 11 | rival surge | rival campaign spend doubled |
| 12 | apathy | turnout multiplier 0.8 in the player's base blocs |
| 13 | defections | co-faction whip −0.05 on every bill |
| 14 | loud opposition | Feed boos count 1.5× |
| 15 | crisis fatigue | Director never draws relief cards |
| 16 | leaks | each lobby offer has a 30% chance to become a headline, approval −2 nationally |
| 17 | war footing | defense and security tags always face the supermajority; capital −2 per turn |
| 18 | famine | approval −2 in 10 seeded regions at term start, −0.5 per turn in 3 of them |
| 19 | succession crisis | party mood starts at 35 |
| 20 | foreign meddling | two seeded regions lose 0.05 intent in the test |

## 8. Jev and Luna at run time

Unchanged from v2 §13 in shape. Persona fields (`bio`, `core_issues`, `temperament`,
`tell`, `patrons`, `situation`, `memory`) stay English in the pack so the calibrated
criteria hold. Criteria text generalizes: "their faction's leadership backs it". Luna's
run-time prompts get `pack.lang` and write bills, quotes, headlines, cards and endings in
it, and `pack.vocabulary` so the parliamentarian says decree when the era does.

## 9. Storage and API

| Store | Holds |
|---|---|
| D1 `scenarios` | id, status, lang, title, era, place, description, prompt, pack JSON, created, builds count |
| Vectorize `scenarios` | one vector per ready scenario, metadata `{ title, era, place }` |
| R2 `usoj-art` | portraits, mastheads, crests |
| Durable Object `Builds` | daily counter |
| Durable Object `GameDO` | unchanged, plus `scenarioId` |

| Method, path | Body | Effect |
|---|---|---|
| POST `/api/scenarios/match` | `{ prompt }` | `{ load?: id, offer?: Card[], build?: true }` |
| POST `/api/scenarios` | `{ prompt }` | starts a Workflow, returns `{ id }`; 429 on guards |
| GET `/api/scenarios/:id` | | `{ status, step, fragments, pack? }` (pack without citizens and member personas) |
| GET `/api/scenarios/:id/art/*` | | R2 passthrough, immutable |
| POST `/api/games` | `{ scenario, faction, promises, seed? }` | new game; code is `J3-<scenario6>-<f>-<ppp>-<seed6>` |

Game endpoints from v1 and v2 unchanged.

## 10. Experiments before implementation

Results go to `docs/experiments.md`. Each has a pass condition.

| # | Experiment | Pass |
|---|---|---|
| 1 | Generator: Luna, Astra, Grok write Germany 2021, Rome 44 BC, Mars 2091 with grounding | Zod on first try; under 2 factual errors per historical pack; the owner ranks the Rome packs blind. Cheapest model that passes wins the default |
| 2 | Contact sheets: muse-image and Flux 4×4 and 3×3 | cells evenly aligned, eye line spread under 12 px, cost per 16 faces |
| 3 | Dither: ink 4-tone vs 16-color, with eye bar, at 64 px | owner picks by eye; the choice becomes `dither` in §5 |
| 4 | Page palette: Luna proposes ink, paper, accent, font pair for three eras | contrast ≥ 4.5 in 3 of 3 without correction; owner decides whether packs pick page tones |
| 5 | Matching: 30 prompts including near-duplicates and translations against a 40-scenario archive | ≥ 0.95 only on true duplicates; translations land in the offer band |
| 6 | Citizens calibration, vote-intent sensitivity, Director dry run, test variance | v2 §16 targets |

Experiments 2 to 4 are running as of this spec. Experiment 1 needs §3's schema and runs
next.

## 11. Stages

| Stage | Contents | Estimate |
|---|---|---|
| A | schema, matching, Workflow pipeline with grounding and review, art pipeline, archive, build screen, theme mapping, six layouts, faction picker, promises, the v2 loop with ledgers, promises, Director, era deck and dated events, quotes, endings, escalations, keep going, the α test with the seat walk | 8 days |
| B | the Feed, midterm night, campaign turns, election-style region reveal | 5 days |

Stage A ships a complete roguelike in any polity. Stage B adds spectacle.

## 12. Out of scope

Daily mode, leaderboards, private scenarios, a second chamber, live model-written rules,
multiplayer, voice, generated likenesses of living people, and any state that outlives a
run beyond the last code in localStorage.

## 13. Self-review

Placeholders: none; `dither` in §5 is decided by experiment 3 before the plan. Consistency:
v2's slider and seats-per-party setup is replaced by the faction picker; the share code
gains a scenario id and drops seats and popularity. Ambiguities resolved: `alpha` is public
weight, `chamber_loyalty` is measured by one synthetic whip at term end, and dated events
use the same `needs` grammar as generic ones. Scope: two plans, one per stage.
