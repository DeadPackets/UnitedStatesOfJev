# The Ruler: v4 design

2026-09-22. Supersedes the play sections of `2026-09-22-any-polity-design.md` (§7, §8) and
`2026-09-22-the-term-design.md`. Matching, the build pipeline, art and the theme system (§2 to
§6 of the v3 spec) stay, and the pack gains a constitution (§3 below). Grounded in the owner's
brief, `docs/design-synthesis-2026-09-22.md`, the three digests in `docs/research/`, and the
measured numbers in `docs/gameplay-analysis-2026-09-22.md`.

## 0. Rulings

Owner rulings from the 2026-09-22 interview, in the order made:

| # | Ruling |
|---|---|
| R1 | The player is the executive head (consul, president, king, general secretary), never a legislator. The chamber is one power holder among several. |
| R2 | Budget model: resource costs only. No action points. |
| R3 | Consent is soft everywhere and priced. Every bypass raises the bypassed holder's resistance; every holder has a line; a crossed line is that holder's response, including an early retention test for the holders who can remove the ruler. No separate legitimacy meter. |
| R4 | A run can end mid-term: a holder over its line plays a warning card with the number; two turns later, if still over, its response fires. |
| R5 | One retention formula for every polity: a weighted vote of holders, pack-set weights between 0.15 and 0.6, every counted holder has a lever, uncounted holders keep their lines. No veto at the test. |
| R6 | Seven fixed instruments, pack-named and pack-priced: decree, law, appoint, spend, proclaim, favour, force. A pack may price a verb out of reach, never invent one. Force is strategic only (content rule). |
| R7 | A turn ends on "End turn" after any affordable acts; each act resolves at once; the world ticks at the boundary. |
| R8 | Plausibility: power and era block (refused before any holder judges, 1 authority, the clerk says why); scale is tabled and discounted by a printed credibility factor 0.6 to 1.0. |
| R9 | The seed fixes the start (scenario, seats, deck order, half-term class). Jev judges live. |
| R10 | Price tag: laws show the whip band; decrees show code-priced cost, the resistance rise and the holder's last stance; posts show cost and targets and reveal their reaction on send. |
| R11 | Permanence: laws stay in force until a repeal passes the same consent; decrees can be withdrawn for authority; a sunset written into the text is priced as temporary; appointments hold until replaced; the Record shows everything in force with its per-turn effect. |
| R12 | Daily seeded term in v4: one scenario and seed a day, one attempt, share grid, streak; practice runs separate. |
| R13 | Metagame: coalition arithmetic decides verdicts; credibility is a bounded visible multiplier. |
| R14 | UI: the Desk, one page, no scrolling, in its era-palette treatment (`docs/mocks/desk/desk-c.html`), with five fixed resource hues across every pack. |

Owner rulings from the walkthrough, later the same day:

| # | Ruling |
|---|---|
| R15 | The daily is produced by a 24-hour cron Workflow: Luna receives the list of past dailies, proposes a scenario that is not a duplicate, the build pipeline runs it, and it becomes the daily. Every daily is archived and replayable as practice. |
| R16 | Promises: pick-three stays, and authored promises are added: an optional platform sentence at the Seat (Luna extracts up to three tagged promises with windows) and any claim in a proclamation Luna reads as a commitment. Missed promises decay popularity by a share per turn past the window, never a cliff. |
| R17 | The Seat is a three-page briefing (the situation, the room, you) the player can page back and forth through, with the oath button on every page; Luna writes it at build in plain humanized language for a reader who has never heard of the place. |
| R18 | Abroad is in Stage A: one to three foreign powers plus the international community as holders with weight 0, each with a persona, wants, red lines, what they give (treasury and chest sources), era-scaled responses, and the seven verbs read as diplomacy. |
| R19 | Any kind of ruler may win: the test asks whether the room keeps you, never how. Three priced templates inside the existing verbs make the authoritarian path real: bloc drift (a base that grows and hardens with partisan posts while the middle empties), state media (an appointment plus spend that biases reach and damps boos while Feed trust falls and the court and patrons resist), emergency powers (a decree template that suspends the chamber's consent for N turns at a large authority price, held only while the army's stance allows). Stage B, after the baseline is measured. |
| R20 | Events: dated events from the calendar, Director-paced crisis storylets with two costed stances, foreign moves from the abroad holders' state, and one unweighted black swan roll per term from a short era-true list, bounded and always with a decision. A card fired in an earlier term never fires again; Luna writes two fresh templates per extra term. |
| R21 | Another term carries every law in force, appointment, favour, resistance (decayed), and persona memory; reseeds the half-term class; deals two escalations on cards at turn 1; Luna writes a one-page "the years between" briefing. The next real period's dated events become state-weighted storylets, because the run has diverged. Stop here is a real ending: an epilogue from the record, the score banked, the daily counted as kept. |
| R22 | The Over screen names the two turns that decided the run and the style the run played ("ruled by decree 14 of 20 turns"). |
| R23 | Balance gate: four style bots (strongman, populist, broker, idealist) on the same seeds; term-1 win rates within 10 points; each style's median run ends by its own failure. |
| R24 | (2026-09-23, after two blind comprehension tests) One number per group. Three resources remain: treasury, authority, chest. Popularity becomes the public holder's support (by region, averaged by weight) and loyalty becomes the ruler's own party holder's support. Each holder has one number, support 0 to 100, and a line: below the line it warns, two turns later it strikes (its response); resistance is removed. The chamber holder's support is the share of its seats backing the ruler, so seats and its final-vote share agree. The final vote is the sum of each voting holder's support times its weight. Supersedes C1's five ledgers and §1's resistance and line fields. |
| R25 | (2026-09-23) Content rule: a historical simulation of power in the manner of Hearts of Iron. The real office of that year whatever the regime; real names and symbols; atrocities stated as history; war, purges, repression and discriminatory laws are playable; every holder reacts by its real interests, never moralised. The clerk refuses only orders of mass killing of civilians, ethnic cleansing or the expulsion of a population. Supersedes R6. |
| R26 | (2026-09-23) UI: the State Papers direction (docs/mocks/v4, latest bN-eras.html is the reference): one focal stage (chamber, country, world, feed), zero scroll at any size, briefing of up to 8 pages with one plain-sentence answer each, a pledge ceremony, an oath that waits for a click, members addressable on the desk, readability floors (16px body, 13px labels), and theme v2 (docs/mocks/v4/eras/THEME.md) as the frame's theme schema. Supersedes §9's layout and §14's Seat. |

Controller rulings (routine, reversible, marked so the owner can veto):

| # | Ruling |
|---|---|
| C1 | Five ledgers stay: treasury, authority (was capital), chest, loyalty (was party mood; the ruler's own faction or court), popularity (was approval; per region). The pack names them. |
| C2 | Resistance is a 0 to 100 number per holder with a pack-set line; it rises on bypasses and hits, falls on favours and service, decays 1 a turn toward 0. |
| C3 | A term is 20 turns, a half-term event at turn 10, a 4-turn campaign, the test. Session target 20 to 40 minutes; measured after the first live terms and retuned. |
| C4 | The half-term event and the campaign are pack-defined instances of the same engine: the half-term is one holder's scheduled draw (a midterm for citizens, a court session, a synod); the campaign is the last four turns, when acts aimed at the test holders cost 25% less. |
| C5 | Cost guard: a turn may not spend more than 6 Jev calls; the seventh act waits for the next turn. Posts are chest-priced, so the guard is rarely reached. |

## 1. The model

Every polity is the same five objects.

```
Ruler        the player; a role name, a faction (their party or court faction)
Holder       a named body with a stance, a resistance line, a response, and members or blocs
Instrument   one of seven verbs, with a pack name, a price, and a consent rule
Ledger       one of five resources with sources, sinks and a failure line
Test         a weighted vote of holders on a printed bar, at term end
```

Holders in every pack: at home (2 to 6) the chamber (if one exists), the army or security
service, the court, the clergy where it holds power, the street (citizens by region and bloc),
the ruler's own faction or court, the patrons (donors, guilds, magnates); and abroad (1 to 3
plus the international community) the powers that mattered to that polity in that year. Each
holder has:

| Field | Meaning |
|---|---|
| `stance` | 0 to 1, Jev-read from its members or blocs, shown as the holder's mood |
| `resistance` | 0 to 100, code-owned, raised by bypasses and hits |
| `line` | the resistance at which it warns; its response fires two turns later if still over |
| `response` | one of: early test, coup (run ends), strike a decree, refuse a levy (treasury), riot (popularity), excommunicate (loyalty), embargo (treasury) |
| `weight` | its share of the test, 0 (not counted) or 0.15 to 0.6 |
| `levers` | which instruments move it (at least one when counted) |

Examples:

| Polity | Ruler | Holders (weight, response) |
|---|---|---|
| Rome 44 BC | Consul | Senate (0.3, early test), legions (0, coup), plebs by region (0.5, riot), patricians (0.2, refuse levy) |
| America 2023 | President | Congress (0.25, early test), courts (0, strike), citizens by region (0.6, none), the base (0.15, primary: early test), donors (0, embargo on the chest) |
| A kingdom | King | Nobles' assembly (0.4, early test), army (0.4, coup), church (0.2, excommunicate), peasants (0, riot), guilds (0, refuse levy) |
| Egypt 2012 | President | People's Assembly (0.3, early test), SCAF (0, coup), the street (0.5, riot), the Guidance Bureau (0.2, early test), judiciary (0, strike), Al-Azhar (0, ruling), Gulf patrons (0, embargo); abroad: USA (aid), Israel (Sinai, the treaty), IMF (the loan), the UN |

Abroad holders add four fields: `wants` (three tags), `redLines` (tags that hit resistance hard
when a law or decree carries them), `gives` (treasury or chest per turn while served, or once),
and `responses` scaled to the era (what that power actually did in that period: an aid freeze,
a border incident card, a resolution, an invasion only where history had one). Their persona
is one figure (an ambassador, a foreign minister, a mission chief) that Jev judges like a
member. The seven verbs read as diplomacy toward them: favour is a concession, spend a deal,
proclaim a statement, force an incident, appoint an envoy. The Director gains a "foreign move"
card type weighted by their state.

## 2. Instruments

| Verb | What it is | Consent | Price (base; the pack scales) | Moves |
|---|---|---|---|---|
| Decree | The ruler acts alone | None; every holder it hits gains resistance, the chamber gains extra if the act was theirs to make | Authority 3 | The ledgers on the price tag |
| Law | A bill to the chamber | Chamber majority (or supermajority per pack) | Authority 1 to table; amend 1; the price tag's treasury | Same, plus loyalty and the chamber's stance |
| Appoint | Put a member in a post (minister, general, judge, governor) | Per pack: none, or chamber confirmation | Authority 2 | The post's holder: a loyal general lowers army resistance 10 |
| Spend | Move treasury or chest to a holder or region | None | The sum | Popularity or a holder's resistance |
| Proclaim | A post to the Feed | None | Chest 2 for reach; free without reach | Popularity by bloc, above a neutral baseline; loyalty on a boo wave |
| Favour | A promise or gift to one member | None | Authority or chest, priced by the member | That member's loyalty; a favour owed is a lever later |
| Force | Deploy, curfew, martial law, arrest a member | Per pack: none, or the army's stance ≥ 0.5 | Authority 4, army resistance −5 (they like being used) or +10 (they do not) | Street resistance up, a holder's stance down, popularity down in the region |

Every act carries a price tag before the commit (R10): cost, revenue, serves, hits, keeps, the
credibility factor, and the verdict band where the act has one. Luna prices; code applies; Jev
judges.

## 3. The constitution in the pack

`pack.constitution`:

```ts
{
  ruler: { role: string; faction: string },
  holders: Holder[],                       // §1 fields, 2 to 6
  instruments: Record<Verb, { name: string; consent: Consent; price: Price; available: boolean }>,
  test: { name: string; bar: number[]; reveal: HolderId[] },   // bar per term, e.g. [0.50, 0.53, 0.56, ...]
  halfTerm: { holder: HolderId; name: string },
  ledgers: Record<Ledger, { name: string; line: number }>,
}
```

Validator rules: weights sum to 1 among counted holders, each between 0.15 and 0.6; every
counted holder appears in at least one instrument's `moves`; at least one holder has the coup or
early-test response; `bar` is non-decreasing; the chamber exists if any instrument's consent
names it.

The generator writes the constitution in the frame step from the facts sheet (who held power in
that year, how a ruler could act alone, who could remove them). It is the one new Luna call in
the build.

## 4. The economy

| Ledger | Sources | Sinks | Failure line and effect |
|---|---|---|---|
| Treasury | Revenue laws (in force, per turn), tribute events, spend from chest | Spending laws (in force, per turn), decrees, crisis answers, upkeep escalations | 0: no spending act until revenue passes; a crisis card |
| Authority | A law passed +2, a promise kept +3, a favour repaid +1, a holder served | Every act's price; a struck decree −3; a lost vote −2 | 0: only proclaim and spend are available |
| Chest | Patrons each verdict (capped at 20 a turn), donor laws | Proclaim reach, campaign spend, spend, buying a floor vote (2 chest = 1 authority, in session) | 0: no reach; rivals outspend |
| Loyalty | Faction-line act +3, promise kept +5, a favour to a co-factional | Act failed −2, crossing the faction as a share of its size, a boo wave, hostile leadership escalation | < 20: revolt, the faction votes as opposition for one turn and the half-term class doubles |
| Popularity (per region) | Laws that serve the region, posts a bloc likes above baseline, relief, spend | Laws that hit the region, posts a bloc boos, broken promises (countdown shown), riots | < 30 national: the chamber (or the army where no chamber) calls an early test |

Rules that make it a decision and not a timer:

- Every ledger moves both ways every turn; the wire prints each move with its cause.
- Loyalty's cross-vote penalty is a share test against the faction's size (analysis §6), so a
  minority ruler is not docked for winning.
- Posting pays above a measured neutral baseline (analysis §4): an average post is worth 0.
- The chest buys floor votes in session (analysis §7), so it has a sink every turn.
- Laws in force are the rate sheet: a tax collects each turn, a subsidy pays each turn, and the
  Record tab lists them with their per-turn effect and the repeal consent.

## 5. The turn

1. The Desk shows the five ledgers, each holder's stance and resistance, the acts in force, the
   pending item (a countdown, a warning card, the rival's move).
2. The player performs any affordable acts. Each resolves at once: Luna prices, the price tag
   shows, the player commits, Jev judges where a verdict is due, code applies, the wire prints.
3. "End turn": laws in force apply their rates; resistance decays; holders over their line play
   or advance their warning; the Director draws (crisis, relief, rival move, quiet) weighted by
   state; the rival acts and is reported; the pending item for next turn prints.
4. Turn 10: the half-term event. Turns 17 to 20: the campaign discount. Turn 20: the test.

The one-more-turn hook is the pending item printed at the boundary.

## 6. The test

```
mandate = Σ weight_h × stance_h          over counted holders
win     = mandate ≥ bar[term]            decided on the means
reveal  = holders in pack order; citizens by region, the chamber by seat, others as one
```

`stance_h` is Jev's reading of the holder at term end with that holder's own numbers in the
question (per-region popularity to regions, the whip to seats, the army's resistance to the
army); never one national number for all. The bar climbs per term on the printed schedule, so a
skilled run ends by ratchet around term 4 to 6 and the player sees it coming.

A holder's early test uses the same formula with the bar of the current term and only that
holder's weight renormalised with the others; a coup ends the run with an obituary.

Minority starts: the Seat screen prints `threshold − ownSeats` and a difficulty label; a start
above 6 gets a printed authority handicap; a start above 15 gets the survival win path (reach the
test without an early test firing) scored on its own bar.

## 7. Plausibility (R8)

Luna classifies every typed act on two tests before pricing: power (can this ruler and body do
this) and era (does the mechanism exist). A failure is refused with the clerk's one line, costs
1 authority, and never reaches Jev. Scale is a credibility factor 0.6 to 1.0 on the price tag
that multiplies revenue and popularity gains. The rubric is printed in the Record tab.

## 8. Jev and Luna

| Call | Model | When | Notes |
|---|---|---|---|
| Classify and price | Luna | Every typed act | Power, era, credibility, cost, revenue, serves, hits, keeps, targets for a post |
| Whip | Jev | A law tabled, and after each amend or favour | Per-seat probabilities; the band |
| Verdict | Jev | A law's vote, a post's reactions, a decree's holder reaction, force | Direction and texture; code caps Jev's share of any turn's swing |
| Holder read | Jev | End of turn for holders that moved; end of term for all | Each holder gets its own numbers |
| Narrate | Luna | After every verdict, streamed | Headline, quote, the rival's reply; never blocks the turn |
| Cards | Luna | When the Director fires | Two stances, each with a cost |

Guardrails in code: hard invariants (an empty treasury fails a spending act; a bar is a bar);
Jev's cap; the neutral baseline; player text as data, never in a system prompt; range checks on
every returned value; a frozen golden prompt set re-run on every model or prompt change; a bias
audit (same act, opposite framing) before launch.

## 9. The Desk (R14)

| Zone | Content |
|---|---|
| Strip | Five ledgers: value, delta, failure line tick, fixed hue and icon |
| Stage | The holders: the chamber as the floor when one exists; the other holders as a row of plates with stance and resistance, the one nearest its line marked; the whip count on the floor |
| Desk | The act composer: the verb tabs (seven, greyed when unaffordable), the text box, the price tag, the commit button; "End turn" beneath |
| Rail | Feed, Country (regions as tiles), Holders (members and blocs), Record (acts in force, promises, escalations, the rubric), Pinned |
| Wire | One line per ledger move with its cause, hue-coded, clickable to peek |

Glance, peek, keep (two navigation levels). Era palette on paper, rules and motif; resource hues
fixed:

| Ledger | Light | On the stage |
|---|---|---|
| Treasury | `#227f53` | `#6dc393` |
| Authority | `#623e96` | `#a37fde` |
| Chest | `#a98738` | `#f1cc7e` |
| Loyalty | `#2b7592` | `#71b9d8` |
| Popularity | `#a5417f` | `#f084c4` |
| Danger | `#bb0916` | same |

Phone: strip as five cells, stage tap-to-peek, the composer as a bottom sheet with the price tag
above the keyboard, rail tabs in the thumb zone, the wire above them.

## 10. The daily (R12)

One scenario and seed a day for everyone, one attempt, a share grid (one square per turn: the
ledger that moved most, in its hue; the test as a final row), a streak. Practice runs are free
play on any scenario. The save format carries `mode: "daily" | "free"`, the day key, and the
attempt lock.

## 11. Measurement

Before the first balance pass, three bots on the same seeds (random, greedy, expert) with the
targets in the synthesis: expert minus greedy over 30 points; whip-band Brier under 0.15; every
loss flippable by one replayed act; draws under 20% of the final mandate. Per-turn log: the five
ledgers, each act's expected and realised effect, holder stances and resistance, Jev tokens and
latency.

## 12. Stages

| Stage | Delivers |
|---|---|
| A | Constitution in the pack and generator (home and abroad holders, instruments, test, half-term, ledgers, the briefing pages, the black-swan list); holders, resistance, lines, warnings and responses in the engine; the five ledgers with sources and sinks; laws in force as rates; promises (pick-three plus authored); the test on the means with the climbing bar; another term and stop here |
| B | The seven instruments with price tags and the plausibility gate; posts with the neutral baseline and authored promises; the turn with End turn; the Director weighted by state with crisis, relief, foreign move and black swan; the three authoritarian templates (bloc drift, state media, emergency powers) |
| C | The Desk (era palette, fixed hues, glance/peek/keep); the three-page Seat; the cards; the half-term and campaign stage views; the test reveal by holder; Won, Over, the epilogue; the wire; the Record; phone layout |
| D | The daily cron Workflow and archive; the share grid; the style bots and the measurement log; the balance pass |

## 14. Screens, from the walkthrough

| Screen | Content |
|---|---|
| Landing | Today's term (hot when unplayed; streak, played count), Any polity (prompt + Find it), Resume (hot when a game exists), A friend's code; the daily's result grid replaces its card once played |
| Match | Archive hit opens the Seat; two near hits show both mastheads; none starts the build |
| Build | Steps and fragments as today, plus Constitution; the content note; theme on by the second minute |
| Seat | Three pages: the situation (premise, the goal, the regions as tiles with what matters there), the room (your faction in three lines, each party in three lines: wants, sees you as, votes with you on; each holder with power, response, line and today's number; abroad the same), you (each ledger's meaning here, the test and its weights, difficulty label and handicap, pick-three, the platform sentence). Oath button on every page |
| Oath | The press wipe, the pack's stamp, the gavel |
| Desk | Strip, stage (floor when a chamber exists; home and abroad holder rows with resistance/line; the nearest to its line marked), the composer with seven verb tabs that settle from the text, the price tag, Commit, End turn, the rail (Feed, Country, Room, Record, Pinned), the wire; three coach marks on first run |
| Cards | Warning (two turns, the number, stances including Hold), crisis (two costed stances), foreign move (no Hold), black swan, escalation (turn 1 of a new term) |
| Half-term | The pack's holder draw, walked seat by seat; wipeout re-based on own side's share |
| Campaign | Turns 17 to 20: 25% discount on acts aimed at test holders; the live test arithmetic per holder with its lever and the band; the rival's spend printed per region |
| Test | Decided on the means; walked by holder in pack order; the pack's verdict sentence |
| Won | Score, the record line, another term (bar and the two conditions printed) or stop here (epilogue) or share |
| Over | Obituary from the record, the scorecard with ×1.5 per term, the style line, the two turns that decided it, share, replay the seed as practice |

## 13. Out of scope

Multiplayer, leaderboards beyond the daily share, a map with geometry, voice, and any force
mechanic beyond the strategic level.
