# Design synthesis: the ruler's desk

2026-09-22. Built on the owner's brief (a ruler struggling to stay in power; every action costs
one resource and pays another; free-typed laws and posts are the unique part; tough but fair,
skill lasts longer but not forever; resource costs only), three research digests in
`docs/research/`, `docs/fun.md`, and the measured numbers in `docs/gameplay-analysis-2026-09-22.md`.
Nothing here is applied until the owner rules.

## The sentence that survives every source

**Code owns the bar, Jev owns the direction, Luna owns the words.** The economy is the game;
Jev decides which way a number moves and Luna says why. The moment the model sets the size of
a swing or the height of the bar, the world becomes a rubber wall (AI Dungeon) or an invisible
prior players learn to write to (Democracy 4's reception).

## Ten rules

| # | Rule | Source | What it costs us today |
|---|---|---|---|
| 1 | Every action spends one resource and pays a different one; nothing is free | Meier, Reigns (10 min of interest became 2 h once every swipe hit a meter) | A post is free and pays +1.3 approval; amend is a free re-roll |
| 2 | Every resource has a source and a sink each turn and a visible failure line | Frostpunk, Balatro antes | Mood only falls; the chest has one 0.01 sink; treasury has no income bill |
| 3 | The cost is shown before the commit, as a band, never after | Into the Breach, Suzerain's top complaint (opacity) | The test ignores the ledger; canvass levers are unpriced in mandate |
| 4 | The verdict is decided on the means; draws are the reveal only | Burgun, Garfield: late output randomness destroys skill | 0.070 of noise at the last moment vs levers worth 0.01 |
| 5 | Difficulty is announced: escalations by name, rivals by number, bars by schedule | Slay the Spire ascension, Civ difficulty, Mario Kart's blue shell as the anti-pattern | `rival_surge` changes an unlabelled integer |
| 6 | Hidden adjustment only for flavour (which card), never for odds, bars or rates | Left 4 Dead vs Resident Evil 4 | Director is already code; keep it that way |
| 7 | A loss names the lever that was missed | GMTK, Dwarf Fortress | Mandate 0.496 with nothing on screen saying which 0.004 was buyable |
| 8 | Each extra term adds a pattern, not a number | Koster's chunking | Some escalations are only counters |
| 9 | Five ledgers is the ceiling; new quantities go in the rail | Reigns' four meters, Nielsen's two disclosure levels | Holds |
| 10 | Luna never blocks the turn; verdict first, words streamed after | LLM app complaint surveys (latency, repetition) | Posts take 4.1 s; the verdict and the headline arrive together |

## The turn economy

One turn is one bill, about 90 seconds. Every row is a source or a sink; a resource missing
either is a timer, not a decision.

| Resource | Sources | Sinks | Failure line |
|---|---|---|---|
| Treasury | Revenue bills (Luna prices them), tribute events | Spending bills, crisis answers, debt service escalation | 0 → crisis card, no spending bills until a revenue bill passes |
| Political capital | A bill passed (+), a promise kept (+), a favour repaid | Amend (1), lobby (pork 10, favour 15), a lost vote | 0 → no floor levers |
| Party chest | Patron mood each verdict (capped), donor bills | Post reach (2 per post), canvass, buying a floor vote in session (2 chest = 1 capital, decision 6a) | 0 → no paid reach, rivals outspend |
| Party mood | Party-line bill passed (+3), promise kept (+5) | Bill failed (−2), crossing the aisle as a share of caucus (decision 5a), boo wave on a post | < 20 → revolt: the whip stops working for one turn |
| Approval (per region) | Bills that serve a region, posts a bloc likes, relief | Bills that hit a region, posts a bloc boos, broken promises (countdown shown) | < 30 national → impeachment vote |

Posting costs 1 attention of 2 a turn plus chest for reach, and pays approval only above a
measured neutral baseline (decision 3a), so a bland post is worth 0 and a partisan one splits the
blocs. The price tag is the new object: Luna returns `{cost, revenue, serves, hits, keeps}` for a
typed bill the way it already returns tags and a summary; the code applies the numbers, Jev
judges the vote.

## What Jev and Luna add that no game on the list can

- **Authorship as the core verb.** Democracy 4 gives a policy list, Reigns two swipes; here the
  player writes the law and still gets a vote count in half a second. Autonomy is the strongest
  predictor of enjoyment in the self-determination research.
- **A chamber that reads intent.** 60 to 100 named legislators with traits and grudges react to
  a bill nobody wrote in advance, at the cost of one call.
- **Narration that quotes the player.** A hostile columnist citing the player's own post cannot
  be pre-written. King of Dragon Pass built its attachment from short advisor lines alone; two or
  three disagreeing legislator lines before each vote is cheap and does the same.

Guardrails, all in code:

1. Hard invariants the model cannot overrule: an empty treasury fails a spending bill; a
   threshold is a threshold; the mandate bar is printed on the term card.
2. Jev's contribution is capped as a share of any turn's swing, after the call.
3. A measured baseline is subtracted so an average post or bill scores 0 (3,807 likes in 5,000
   reactions is the rubber wall).
4. Player text is data: never in the system prompt, and every returned value is range-checked.
5. A frozen golden set of a few hundred prompts with recorded distributions; a model or prompt
   change is a balance change and re-runs it.
6. A bias audit before launch: the same bill under opposite framings, the vote delta published to
   ourselves.

## Difficulty architecture

Weight of each source, so a run ends by ratchet and not by a die:

| Source | Share | Form |
|---|---|---|
| Economy tightening | 50% | Income falls behind cost as the term goes on and as escalations stack |
| Escalations | 25% | Two per term from the fixed 20, each on a card with its number, each a new pattern |
| Rivals | 15% | A named opposition with a visible poll and a stated per-term bonus; they act before the player commits |
| Jev's judgment | 10% | Direction and texture, never the size of the swing or the bar |

Always visible: the mandate bar and estimate with its band; `threshold − ownSeats` on Seat; the
whip band before every vote; per-region approval; the two active escalations in numbers;
promise countdowns; next term's bar.

A skilled run should end around term 4 to 6: the stacked escalations make one resource
unholdable, the player sees it two or three turns out, spends the endgame choosing which failure
to take, and loses the test by a readable margin. The feeling to aim for is "I know which two
turns cost me that."

Asymmetric starts: warn (`threshold − ownSeats` and a label on Seat), handicap at start and
printed (Twilight Struggle), and score differently (Root): a minority government wins by surviving
the term or building a coalition above the threshold, on its own bar. The mood spiral (−6 on
every bill a minority passes) must go first or no handicap survives it.

## The Desk

The owner chose the Desk (one page, no scrolling) in its "two surfaces" colour treatment
(`docs/mocks/desk/desk-b.html`): a dark stage under the floor and the whip count, paper for the
bill and the rail, a coloured HUD strip across both.

Three tiers of attention, two of navigation (Nielsen's ceiling):

| Tier | What | Rule |
|---|---|---|
| Glance | Five ledgers, the whip count, one hot action | Only the ledger that just changed animates; fixed hue and slot per ledger |
| Peek | Hover or tap: sources and sinks, room to the failure line, a seat's file, the wire entry's cause | Read-only overlay; never a modal; the page never scrolls |
| Keep | Pin any peek into the rail's Pinned tab | A pinned item may show its delta in the strip area; the unread is a mark on a tab, never a third level |

Colour: one fixed hue per resource across every pack (owner ruling), verified colour-blind safe
(Delta E 2000 ≥ 9 under protanopia and deuteranopia), lightness spread so greyscale still ranks
them. The hue paints the rule, the icon and the delta; numerals stay ink. Red is one token with
one meaning: a failure line crossed or about to be, always with the word and a rule, never for a
decrease, a party or an enemy bloc.

| Ledger | Light | Dark stage |
|---|---|---|
| Treasury | `oklch(53% 0.11 158)` `#227f53` | `#6dc393` |
| Political capital | `oklch(45% 0.14 300)` `#623e96` | `#a37fde` |
| Party chest | `oklch(64% 0.105 85)` `#a98738` | `#f1cc7e` |
| Party mood | `oklch(53% 0.085 228)` `#2b7592` | `#71b9d8` |
| Approval | `oklch(53% 0.15 345)` `#a5417f` | `#f084c4` |
| Danger | `oklch(50% 0.20 27)` `#bb0916` | same |

The mock used a different set (gold treasury, orange mood); the palette above replaces it because
it was verified under colour-vision simulation and avoids the yellow-green confusion band.

Phone (390 px): strip as five compact cells, floor without per-seat hover (tap a bloc for a
half-height sheet), the bill desk as a bottom sheet with the price tag docked above the keyboard,
rail tabs at the bottom in the thumb zone, the wire pinned above them.

Five HUD mistakes to avoid: animating the whole strip; red for a decrease; a third disclosure
level; Democracy 4's icon field; an unordered feed.

## Measuring it

Three bots on the same seeds, scripted terms:

| Bot | Target win rate, term 1 |
|---|---|
| Random | under 10% |
| Greedy (one-step approval) | 40 to 55% |
| Expert (scripted from known levers) | 80 to 90%, dropping 10 to 15 points per term |

Checks: expert minus greedy over 30 points; whip-band Brier score under 0.15; every loss
flippable by one replayed action; draws explain under 20% of the final mandate (today the draw
alone is worth 0.070). Log per turn: the five resources, each action's expected and realised
effect, the whip band and the vote, per-region approval, escalations, Jev tokens and latency.

## What this settles among the 18 decisions

1a, 2a, 3a, 4 reword, 5a, 6a, 7a plus a second win path, 8 re-base, 9a, 10a, 11a, 12a, 13 drop
`motion`, 15a, 16b, 17 hide the preview, 18 add a confirm. Item 14 (the preview worker secret)
stays with the owner.

## Still open

1. Is the daily seeded term in v1? It changes save format, sharing and leaderboards.
2. Which metagame do we want players to find: rhetoric, policy realism, or coalition arithmetic?
   Jev's prompt is tuned toward one of them.
3. How much of the price tag is shown before the vote: cost and serves/hits (proposed), or the
   whip estimate too?
4. Is Jev deterministic within a run (same state, same grade)?
5. Which laws are permanent for the term (Frostpunk's ratchet)?
