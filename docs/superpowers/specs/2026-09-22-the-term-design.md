# The Term: USJ v2 design spec

Date: 2026-09-22. Status: awaiting review. Builds on `2026-09-21-congress-of-jev-design.md`
(v1, shipped) and `docs/fun.md` (research). Daily mode and leaderboards are deferred to a
later spec; nothing here blocks them.

The player is President for one term: 20 legislative weeks, a midterm that reshuffles the
Senate at week 10, a 4-week campaign, and an election night. Every run starts from a seed
and then goes its own way. Runs end in re-election, defeat, or impeachment, each with a
story worth sharing.

Governing constraint, unchanged: **code proposes options, Jev judges, Luna narrates.**
Luna never decides an outcome. Jev never counts. Code owns every number.

## 0. Decisions

| Decision | Choice | Why |
|---|---|---|
| Seed scope | Seeds fix the starting state only: Senate, modifiers, promises, citizen bloc weights, midterm class. Every draw after setup is true random | Input randomness reads as fair, output randomness reads as exciting, and Luna is non-deterministic anyway. `docs/fun.md` §1 |
| Length | 20 bill weeks + midterm + 4 campaign weeks + election night, about 35 minutes | Long enough for arcs and grudges, short enough to replay tonight |
| Modes | Term (the game) and Sandbox (no clock, no election). Agenda mode stays in the engine, hidden, for the deferred daily | One product, not three |
| Levers | Lobby and amend always on; toggles removed from setup | A roguelike needs its levers. Difficulty comes from modifiers instead |
| Tension source | Five ledgers that pull apart: voters, Senate, base, donors, party | Sid Meier's interesting decision; Papers, Please's contradicting rewards |
| Source of truth for public opinion | 250 Jev-judged citizens replace the hand-coded approval delta | The world pushes back on its own. Same roster powers the Feed, midterm, campaign and election |
| Drama | A code-only Director draws from a weighted storylet deck | Authored beats, never the same order, no model call to decide pacing |
| Failure | Impeachment (capital 0 and party mood under 20), midterm wipeout, election loss. Each has its own ending | Losing must be a story |
| Progression | Horizontal: modifiers unlock after a win and multiply score | Hades Heat, not Rogue Legacy stat grind |

## 1. Data model

Additions to `Game` in `worker/engine.ts`. v1 fields stay.

```ts
interface Settings { v: 2; party: Party; seats: number; pop: -1 | 0 | 1; mode: "term" | "sandbox" | "agenda";
  promises: [Tag, Tag, Tag]; modifiers: Modifier[]; agenda: number; seed: number }

interface Game {
  // v1
  id; code; settings; turn; capital; approval; seated; bills; phase; result;
  // v2
  week: number;                       // 1..24, turn stays the bill index
  stage: "session" | "midterm" | "campaign" | "election" | "over";
  ledgers: { party: number; chest: number };            // party mood 0..100, war chest in $M
  donors: Record<Donor, number>;                        // mood -2..2 per donor group
  promises: Record<Tag, { passed: number; state: "pending" | "kept" | "broken" }>;
  citizens: Citizen[];                                  // 250, seeded bloc weights
  director: { intensity: number; lastCrisis: number; seen: string[] };
  events: Event[];                                      // crisis cards drawn, with the stance taken
  posts: Post[];                                        // one per week at most
  midterm?: { seats: string[]; flipped: string[] };     // seat ids up, seat ids that changed party
  campaign?: { weeks: CampaignWeek[]; intent: Record<string, number>; rival: string[] };
  election?: { order: string[]; won: Record<string, boolean>; ev: number };
  streak: number;                                       // consecutive passed bills
}

interface Citizen { id: string; state: string; bloc: Bloc; name: string; age: number; job: string; town: string;
  worldview: string; issues: [Tag, Tag]; weight: number }   // weight: this bloc's share of the state's vote, seeded

interface Event { id: string; week: number; card: { title: string; body: string; stances: string[] };
  stance?: number; scores?: Record<Bloc, number>; outcome?: string }

interface Post { week: number; text: string; reactions: Record<"like" | "boo" | "share" | "ignore", number>;
  hot: string[]; replies: { name: string; text: string }[]; rival?: { text: string; won: boolean } }

interface CampaignWeek { message: string; states: string[]; spend: number; intent: Record<string, number> }
```

`Bill` gains `donors?: Record<Donor, number>` (Jev scores per donor group) and
`quotes?: { name: string; text: string }[]` (Luna, up to two, on defection or a flip).

## 2. Seed and share code

```
J2-D55P-4H9-00-K7Q2XA
 │  │││ │   │  └ seed, 30 bits, Crockford base32
 │  │││ │   └ modifiers, 10-bit mask, 2 chars
 │  │││ └ three promise tags, one base32 char each (index into TAGS, 20 entries)
 │  ││└ popularity U E P
 │  │└ your party's seats 40..60
 │  └ party
 └ version
```

The seed drives, and only drives: seat parties and jitter, senator situations, starting
approval, citizen names and bloc weights, the midterm class (which 33 seats are up), and
the storylet deck's shuffle order. `drawVotes`, midterm draws, election draws, and Director
rolls use `crypto.getRandomValues`. Sandbox has no code; it is Term with the clock off.

## 3. One week

The v1 turn wrapped in a week. Beats in order, each one screen state.

| Beat | Player does | Calls | Time |
|---|---|---|---|
| Morning paper | Reads last week's ledger and any crisis card (see §6) | none, or Luna for the card | 10 s |
| Feed | Optional: posts once, sees reactions and 3 replies, rival's answer | Jev citizens (react), Luna replies and rival | 20 s |
| Floor | Writes a bill, whip count, lobby, amend, roll call, as in v1 | Jev senators, Luna parse and amend | 2 min |
| Verdict | Roll call plays; quotes from defectors; headline | Jev citizens (approve), Luna headline and quotes, parallel | 15 s |
| Ledger | Five ledgers animate; promises, streak, donors, party mood | none | 10 s |

The Director runs between Verdict and the next Morning paper (§6).
Weeks 1 to 20 are session. Week 10 ends with the midterm (§7). Weeks 21 to 24 are the
campaign (§8). Election night follows (§9).

## 4. The five ledgers

| Ledger | Range | Up | Down | Bites when |
|---|---|---|---|---|
| Voters | approval per state, national = EV-weighted | citizens approve of a passed bill; kept promise +4 in every state | citizens disapprove; broken promise −6 in every state; lost crisis | midterm and election |
| Senate | capital 0..200 | pass +5; favor returned +10 | lobby costs; fail −5; struck −5; capital 0 with party mood under 20 = impeachment | lobby unaffordable, impeachment |
| Base | promises, 3 tags | a passed bill tagged with a promise counts 1; two count = kept | week 12 with zero passed bills on a promise = broken; week 20 with fewer than two = broken | Feed turns hostile, election intent −5 in base blocs |
| Donors | mood −2..2 per donor group, 10 groups | passed bill they like; chest += Σ max(0, mood) per week, in $M | passed bill they hate; a donor at −2 funds the rival campaign in your weakest state | campaign budget |
| Party | mood 0..100, starts 60 | party-line pass +3; keeping a promise +5 | pass with more opposition than own-party yes votes −6; fail −2; crossing on a crisis −4 | under 30: Jev state gains `party_leadership: "hostile to the President"`, measured −6 to −10 on co-partisans; under 20 with capital 0: impeachment |

Voter delta per state after a vote: citizens in that state answer "do you approve of the
President after this vote" (Noul). `delta = (mean_approve − 0.5) × 10`, weighted by
citizen weight, clamped ±6, applied only to states whose mean moved from the prior week by
more than 0.05 so a quiet bill does not stir the map. Failed bills ask the same question
with `passed: false`; the citizens judge the attempt.

## 5. Citizens

250 personas, 50 states × 5 blocs (business, labor, seniors, youth, rural), generated
once by `scripts/citizens.ts` with Luna and committed as `worker/citizens.json`, like the
senator roster. Each persona is about 70 tokens: name, age, job, town, one-line
worldview, two issues, media diet. Per game the seed sets each citizen's `weight` (bloc
share of the state vote, drawn around the state's demographic lean, sum to 1 per state).

Citizens answer four question shapes, all with the persona inside `instructions`:

| Shape | Type | When |
|---|---|---|
| approve | Noul: does this citizen approve of the President after `event` | after every vote, after every crisis |
| react | Choice: like, boo, share, ignore, to `post` | Feed |
| vote | Noul: would this citizen vote to re-elect, given `record`, `messages`, `spend_here` | midterm (for their state's seat), each campaign week |
| turnout | Noul: would this citizen bother to vote | election night only, multiplies weight |

State object for citizen calls stays under 2k tokens: the bill or post, the President's
record (up to 8 lines: promises kept and broken, streak, last three headlines), and the
economy line from the Director. 250 questions at 90 tokens is 22.5k, inside the 64k
request cap and independent of the 32k state cap.

## 6. The Director and the storylet deck

Code only. After every Verdict:

```
intensity = clamp(intensity + (failed ? 25 : -10) + (crisis this week ? 20 : 0) + (streak >= 3 ? 10 : 0), 0, 100)
if week in 17..20 and no crisis since week 16: force a crisis
elif intensity < 30 and week - lastCrisis >= 2: crisis with p = 0.7
elif intensity > 70: relief card with p = 0.6, no crisis
else: crisis with p = 0.25
```

A crisis is a storylet drawn from the deck with Reigns-style weights: base weight × 2 if a
prerequisite is barely met (within 5 points), × 0 if seen in the last 6 weeks, × 0 if
prerequisites fail. Twenty templates ship. Luna writes the card's title, body (60 words)
and the three stance labels from the template plus game state. Jev scores the five blocs
and the ten donor groups on the chosen stance. Code applies the template's results.

| id | needs | stances | scored | results |
|---|---|---|---|---|
| strike | labor approve < 0.4 | side with workers / back the owners / stay out | blocs, donors | labor and unions move ±; party −4 if you cross |
| hurricane | week > 2 | federal aid / state handles it / aid with conditions | blocs | approval in 3 seeded states ±6; capital −5 on aid |
| leak | a senator with situation "ethics investigation" | release / bury / refer to committee | blocs | senator flips permanently if released; party −6 if buried and it surfaces later (40%) |
| favor-called | a favor lobby from 3+ weeks ago | honor / renege | none | honor: capital −10, senator memory "President kept their word"; renege: senator hostile, party −3 |
| primary-threat | party < 35 | make peace / fight | blocs (own party's) | peace: capital −15, party +15; fight: party −10, Feed base +, one co-partisan hostile |
| recession | week > 6, business approve < 0.45 | stimulus / austerity / blame the Fed | blocs, donors | economy line changes for 4 weeks; donors move |
| veto-bait | a passed bill with constitutional ≥ 0.5 | defend in court / let it go | blocs | 50%: struck later with capital −5; defend: chest −5 |
| scandal-ally | a co-partisan senator with situation "publicly feuding" | back them / cut them loose | blocs | back: party +4, approval −2; cut: party −4, senator hostile |
| foreign | week > 4 | sanctions / talks / troops | blocs, donors | defense donors move; approval ±3 nationally |
| shutdown | capital < 30 | cave / hold | blocs | cave: capital +15, party −8; hold: 50% approval −4 or +4 |
| endorsement | streak ≥ 3 | accept / decline | blocs | accept: chest +10, one bloc −; decline: base + |
| poll-shock | approval fell 4+ in a week | shake up staff / stay the course | none | staff: next whip count +3 on co-partisans; course: intensity −10 |
| relief: goodwill | intensity > 70 | one stance | none | a senator offers a favor: their whip on next bill set to 0.9 |
| relief: windfall | intensity > 70 | one stance | none | chest +8 or capital +10, seeded |
| relief: quiet | intensity > 70 | one stance | none | headline is soft, intensity −15 |
| rival-stunt | week > 3, a Feed loss last week | respond / ignore | blocs | respond: Feed rematch; ignore: rival gains one state by 2 |
| donor-ultimatum | any donor at −2 | comply / refuse | donors | comply: donor +2, one promise blocked this week; refuse: donor funds rival |
| whistleblower | week > 8 | protect / prosecute | blocs | approval youth ±, party ∓ |
| flip-offer | opposition senator whip > 0.6 on last bill | court them / no | none | court: capital −10, their memory "the President courted me", next whip +0.2 |
| lame-duck | week 18, approval < 42 | one stance | none | Luna writes the obituary early, intensity +20, no mechanical effect |

Prerequisites read the ledgers, so the deck is quality-based narrative: a run with an angry
labor bloc gets strikes, a run with a hostile party gets primary threats. Results write a
senator memory line where a senator is involved, and an `outcome` line Luna gets for the
next headline. One in five headlines and every crisis card reference an earlier event by
name, which is the Reigns finding: a minority of callbacks makes the whole run feel
authored.

## 7. Midterm, week 10

33 seats are up, chosen by the seed. For each, the holding party keeps the seat with
`p = 0.5 × sigmoid((approval[state] − 50) / 8) + 0.5 × mean(vote intent of that state's
citizens)`, sign flipped for the opposition's seats. Draws are true random. A lost seat
swaps in the roster's other-party persona for that seat, with empty memory. The chamber
animates the swaps one by one, east to west, with the whip bar recomputing live; a
wipeout (8+ lost) ends the run as a lame duck unless the player is in Sandbox. The
midterm sets a hard checkpoint for the story: Luna writes a half-term headline from the
ledgers.

## 8. Campaign, weeks 21 to 24

Each week the player picks one message from three Luna drafts (built from the record:
kept promises, biggest bill, best headline), up to two target states, and a spend per
state of 0, 5 or 10 $M from the chest. The rival auto-targets the player's two weakest
winnable states each week at 5 $M, funded by any donor at −2.

Jev asks every citizen `vote` with `messages` so far, `spend_here`, and `rival_spend_here`.
State intent = weight-mean of citizens. Forecast EV = Σ ev × P(win), with
`P(win) = sigmoid((intent − 0.5) × 12)`. The needle and the map move live after every
week. The forecast is honest: it shows the band, not a point.

## 9. Election night

States reveal in poll-close order (ET first, AK and HI last). Each state's result is one
draw against `P(win) × turnout`, true random. Electoral votes count up in the display
numeral; the map fills in ink; a flipped state (against forecast) prints red for one
beat. 270 wins. Sound: a low tick per state, a chord per 50 EV, gavel or thud at the end.
The whole reveal is 40 seconds and cannot be skipped the first time in a run.

## 10. Endings, score, unlocks

| Ending | Trigger | Luna writes |
|---|---|---|
| Re-elected | EV ≥ 270 | inaugural, 3 sentences |
| Defeated | EV < 270 | concession, 3 sentences, names the state that decided it |
| Lame duck | midterm wipeout or approval < 35 at week 18 | obituary of the presidency |
| Impeached | capital 0 and party mood < 20 at any Verdict | the vote in the Senate, using the actual whip |

Score = passed × 10 + kept promises × 25 − broken × 15 + EV ÷ 2 + capital ÷ 4 + best
streak × 5, × Π modifier multipliers. The Over screen shows the breakdown line by line
with rolling digits, the share card (seat grid of the term, one row per bill, filled and
hollow squares, no spoilers), and the code.

Modifiers, one unlock per win, each × 1.15 on score:

| Modifier | Effect |
|---|---|
| Hostile press | headlines harsher; approve deltas −1 on every state |
| Recession | economy line "recession" from week 1; business and labor start at −1 donor mood |
| Filibuster era | 60 needed on every bill |
| Split ticket | Senate is 45 for you regardless of slider; slider sets popularity only |
| Scandal season | four senators under investigation instead of one |
| Short fuse | Director intensity thresholds 20 and 60 instead of 30 and 70 |

## 11. Senators as characters

Existing: persona, situation, 5 memory lines, portraits. New:

- Luna quotes: after every vote, up to two quotes from the most surprising voters (largest
  |vote − whip|). One sentence each, in the senator's tell. Shown as a pull quote on the
  bill card and stored in `bill.quotes`.
- Grudges: a `threat` lobby that fails writes "the President threatened me" and adds a
  permanent −0.15 on that senator's whip until a favor is honored.
- Debts: a `favor` lobby creates a `favor-called` storylet three or more weeks later.
- Flips: `leak` released or `flip-offer` courted can change a senator's party mid-term. The
  seat animates, the roster persona stays, the party field changes.

## 12. The Feed

One post per week, 240 characters, optional. Jev citizens `react`. Aggregates: likes,
boos, shares, ignore. Effects: `approval += (likes + 2 × shares − 2 × boos) / 250 × 4`,
applied per state from that state's citizens; a state where shares lead becomes `hot`, and
its senators get the memory line "constituents are loud about `post topic`" for the next
whip count. Luna writes three replies from the three loudest personas (by weight × share)
and the rival's answer post; Jev asks 50 sampled citizens which of the two posts they
agree with; the winner is shown. A losing week is a Director prerequisite (`rival-stunt`).

## 13. Jev and Luna catalog

| Call | Where | Questions | Tokens | Latency | Cost |
|---|---|---|---|---|---|
| gate | draft | 1 Noul | 0.3k | 0.25 s | ~0 |
| whip | floor | 100 senators + filibuster + 5 blocs + 10 donors + constitutional | 21k | 0.6 s | $0.0009 |
| lobby | floor | 1 senator | 0.5k | 0.25 s | ~0 |
| approve | verdict, crisis | 250 citizens | 24k | 0.7 s | $0.0010 |
| react | feed | 250 citizens Choice | 24k | 0.7 s | $0.0010 |
| agree | feed | 50 citizens Choice | 5k | 0.3 s | $0.0002 |
| crisis-score | crisis | 5 blocs + 10 donors | 2k | 0.3 s | ~0 |
| vote | midterm, campaign | 250 citizens | 24k | 0.7 s | $0.0010 |

| Luna | Schema | Max tokens | Latency |
|---|---|---|---|
| parse, amend, headline | v1 | v1 | 1.4 s |
| quotes | `{ quotes: [{ name, text }] }` | 120 | 1.2 s, parallel with headline |
| card | `{ title, body, stances: [3] }` | 220 | 1.4 s |
| replies | `{ replies: [3 × { name, text }], rival: string }` | 240 | 1.4 s |
| messages | `{ messages: [3 strings] }` | 120 | 1.2 s |
| ending | `{ title, body }` | 200 | 1.4 s |

A full week with a post and a crisis is about $0.005; a term is about $0.12. Every Jev
call runs in parallel with the Luna call of the same beat, so no beat waits longer than
1.6 s.

## 14. API

Existing endpoints keep their shapes. New, all under `/api/games/:id/`:

| Method, path | Body | Effect |
|---|---|---|
| POST `post` | `{ turn, text }` | Feed post; returns the view with `posts[-1]` filled |
| POST `events/:i` | `{ turn, stance }` | resolve the open crisis card |
| POST `midterm` | `{ turn }` | run the midterm; view carries `midterm` |
| POST `campaign` | `{ turn, message, states, spend }` | one campaign week |
| POST `election` | `{ turn }` | draw the election; view carries `election` |

`view()` keeps stripping per-senator maps from old bills and strips citizens to
`{ id, state, bloc, name, weight }`; personas never leave the Worker.

## 15. Front end

| Screen | New or changed |
|---|---|
| Setup | promise picker: three chips from TAGS, headline updates ("Promises: healthcare, labor, housing"); modifier chips appear after the first win; toggles removed |
| Week | chamber left, rail right as today. Rail gains a Feed strip (post box, reactions, replies), the ledger panel becomes five meters, promises as three stamps (pending, kept, broken) |
| Crisis card | full-screen `<dialog>` in the poster style: title, body, three stance buttons, then bloc reactions as five small meters |
| Verdict | roll call as today plus: last five votes slow to 400 ms each when the count is within 3 of the threshold; shake tiers 2px, 4px, 6px by margin; pitch climbs per yes; pull quotes slide in after the stamp |
| Ledger | after the verdict, five meters animate in sequence with 100 ms stagger, rolling digits, promise stamps hit when they change |
| Midterm night | chamber only, seats swap one by one, whip bar recomputes live, half-term headline |
| Campaign | map left, rail right: message chips, state picker on the map, spend buttons, needle on top with the band |
| Election night | map full width, numeral counts up, red on a flip, no skip on first view |
| Over | ending text, score breakdown with rolling digits, share card, modifiers unlocked, "Run it back" with the same code and "New term" |

All enters stay CSS keyframes; the roll call, midterm swaps and election reveal are
rAF-clocked like v1's roll call. Reduced motion keeps every state and drops the clocks.

## 16. Experiments before tuning

Run with `scripts/`, results into `docs/experiments.md`.

1. Citizen calibration: 20 bills × 250 citizens; check approve means spread across blocs
   (target: bloc means differ by ≥ 0.2 on a partisan bill, ≤ 0.08 on a neutral one).
2. Vote-intent sensitivity: a 10 $M spend must move a state's intent 0.03 to 0.06, a
   kept promise 0.02 to 0.04 in base blocs. Adjust the criteria text until it does.
3. Director dry run: simulate 200 terms with random outcomes; crises per term must land
   between 4 and 7, never two in a row before week 17.
4. Election variance: with a forecast of 290 EV, the win rate must sit between 75% and 85%.
5. Luna card quality: 20 cards through the humanizer checklist; reject any with the
   listed AI patterns.

## 17. Out of scope

Daily mode, leaderboards, multiplayer, voice, a House of Representatives, and any Luna
call that decides a number. Agenda mode stays in code, unreachable from Setup.

## 18. Self-review

Placeholders: none. Contradictions: the v1 spec's 40-bill term is replaced by 20 weeks;
`BILLS_PER_TERM.term` becomes 20. Ambiguities resolved: Sandbox has no Director crises
(quiet by design), no midterm, no campaign; the Feed and ledgers still run. Scope: one
plan can carry this in five tasks: citizens and ledgers, Director and deck, Feed,
midterm and campaign and election, front end and juice.
