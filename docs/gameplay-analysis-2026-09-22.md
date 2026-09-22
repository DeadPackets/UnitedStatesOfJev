# Gameplay analysis, v3 Any Polity

2026-09-22. Nothing here is applied without the owner. Principles from `docs/fun.md`.

## What the numbers say

| Fact | Number | Source (task reports, `docs/experiments.md`) |
|---|---|---|
| Stage B terms at the test | 3, **0 wins**; 0.451 / 0.487 / 0.496 | task-9, task-4 |
| Stage A terms (no Feed, no canvass) | 3, **2 wins**; 0.344 / 0.543 / 0.598 | task-9, task-13 |
| Approval: a post every turn / 3 posts in 17 turns | 58 → 90, 58 → 86 / **56 → 22** | Exp 1 |
| Jev reactions, 5,000 | 3,807 like, 271 boo, **0 share**, 922 ignore | same |
| 10-unit canvass spend | +0.048 intent; 4 turns ≈ **0.01 mandate** | Exp 2 |
| Forecast band | 12.3 points wide; held the drawn share 2 of 2, the test's estimate 1 of 2 | Exp 4 |
| Test Jev call, turn 20 | 59,758 tokens, 310 questions, **93% of the 64k cap** | experiments.md |
| Party mood / chest, one term | 68 → 26 / 388 with no session sink | task-9 |
| Events per term | 4.07 to 5.68 crises in the dry run; live 11 (6 crisis, 5 relief) | task-8 |

## Problems

### 1. The test does not read the term

`testQuestions` (jev.ts:155) puts the persona in the question; `testState` sends only `record()`:
promises, streak, one national approval number, three headlines. Per-region approval, every
`applyCitizens` answer and every Feed reaction are dropped, and three terms at approval 86 to 90
returned public intent 0.42 to 0.53. The ledger is the game and never reaches the verdict: the
world pushes back in neither direction.

Fix, one line: add `approval_here` to each `intent_` question, as `voteQuestions` already carries
`spend_here`; risk is Jev anchoring on one number. Larger: cache each citizen's last `approve`.

### 2. Mandate is a coin flip by construction

`runTest` draws one Bernoulli per region and per seat, then counts weight, not mean. Six Rome
regions at p near 0.5 give `sqrt(6 × (1/6)² × 0.25) = 0.102` of noise and 60 seats 0.065, so at
α 0.65 the mandate carries `sqrt((0.65 × 0.102)² + (0.35 × 0.065)²) = 0.070` of its own.
Winning 8 in 10 needs a mean near 0.56; the mean has never left 0.42 to 0.53. The odds are not
visible either: the band forecasts the public share, not the mandate.

Fix: win on the means, already computed, and keep the draws as the reveal, re-basing the walk.

### 3. "Re-election is the win" has never happened

Three tests, three near misses, no win, so `continueTerm`, "Another term", the stacked escalations
and the ×1.5 multiplier have never run live. Stage A won 2 of 3 on the same test code, so the test
alone is not the cause: Stage B added a Feed that lifts the approval the test ignores. A near miss
hooks only when the player can name the lever they missed.

### 4. The Feed is the rubber wall, and it is optional

76% like an average post, so `applyPost` gives `((0.76 − 2 × 0.054) / 1) × 2 = +1.30` per region
per turn, about +26 over 20 posts. It has no equivalent of `applyCitizens`'s 0.05 gate, so the Feed
always fires and bills usually do not. Whatever you write, it works: the AI Dungeon failure
`fun.md` names, on an optional button that is really mandatory, at 4.1 s a turn.

Fix, one line: subtract a baseline, e.g. `(like − ignore − 2 × boo) / n`, so a bland post is worth
0 and a partisan one keeps its 0.34 to 0.54 split.

### 5. `share` is never chosen, so `hot` is dead code

0 of 5,000. `reactQuestions` offers `["like","boo","share","ignore"]` and `choices()` takes the
argmax, but liking and sharing are not exclusive for a reader. The `+2 × share` term, the `hot`
list and `feedMemory` are therefore dead, and `feedMemory` is the only path from the public into a
whip persona.

Fix, one line: exclusive wording, e.g. `["pass it on", "like it and move on", "boo it", "scroll
past"]`. Or treat `p(share) ≥ 0.25` as a share.

### 6. Party mood only falls, and a minority is punished for winning

Plus: a pass +3, a kept promise +5. Minus: each fail −2, the deck about −35 a term, and
`applyVote`'s −6 when opposition yes votes outnumber own ones. A 12 of 60 faction needing 31 finds
19 opposition votes against at most 12 of its own, so **every bill it passes scores −6**. Measured
68 → 26. Under 30, `whipState` sends `party_leadership: "hostile"`, worth −6 to −10 on
co-factionals, so more bills fail. That is the spiral.

Fix, one line: make the −6 a share test against caucus size, not a raw count.

### 7. The chest has one sink, worth 0.01

Income is `Σ max(0, patron mood)` every verdict, uncapped, and it reached 388. The canvass spends
at most two regions × 10 × 4 turns = 80 and moves the mandate about 0.01: four screens of money
that cannot change the result, with more screen time than the whip count.

Fix: let the chest fund floor lobbying in session (2 chest per 1 capital), reusing `applyLobby`;
risk is a rich government stronger on the floor too.

### 8. A small start is unwinnable, and nothing says so

Liberators, 12 of 60 needing 31: 0 of 16 passed, treasury 0 from turn 4, impeached turn 16, twice.
SPD, 7 of 25 needing 13: impeached turn 17, lame duck turn 18. Lobby costs 10/15/20 against +5 a
pass, so a minority cannot buy the votes once a turn. Losing is fun when a run tells a story; a
start that cannot reach turn 20 tells the same one every time.

Fix: print `threshold − ownSeats` on Seat and mark a start hard above 6.

### 9. The midterm cannot reward a popular government, and wipeout punishes only the strong

`holdP = 0.5 × sigmoid((approval − 50) / 8) + 0.5 × regionIntent`. Jev's intent reads about 0.45,
so a seat's ceiling is `0.5 + 0.225 = 0.725` at any approval, and a government at 57 loses about
30% of its class; the live draw lost 9 of 20. Wipeout is `lostOwn × 5 ≥ class × 2`: own-side losses
at 40% of the **whole** class, so a 24 of 60 government must lose all 8 of its class seats and a
12-seat start cannot trigger it. The rule that ends a run is reachable only by winners.

Fix, two lines: widen the sigmoid divisor to 5, and base wipeout on own-side seats in the class.

### 10. The Director fires too often, repeats relief, and half its cards have no choice

11 events in 20 turns, 5 of them relief. Relief templates carry `stances: 1`, so those turns are a
card with one button, and every crisis costs a 250-citizen Jev call. Two relief cards fired twice,
because the recency window is 6 turns in a 20-turn term. A dilemma needs a cost either way.

Fix: filter relief on `director.seen` for the term, and give relief cards two stances.

### 11. Escalations that are live but invisible

`loud_opposition` (boos × 1.5) is worth `2 × 0.054 × 0.5 × 2 = 0.11` approval a turn at the 5.4%
boo rate. `rival_surge` only changes an unlabelled integer in `rival_spend_here`, inside a canvass
worth 0.01. `split_chamber` forces 8 class seats, but Germany's class is 8, so it takes the whole
class and ends the term at the half way point with no draw.

Fix, one line: clamp `split_chamber` to `min(8, round(class / 3))`.

### 12. Smaller findings

- **Amend is a free re-roll**: no capital cost, once per bill, each draft showing its `expected`
  count (game.ts:226), so the play is always "amend, take the highest", at 5.7 s a turn.
- **Adopting an amendment deletes paid-for offers**: game.ts:234 clears `offers` and `acts` after
  the capital is charged. `threat` is also dominated: 20 capital against pork 10 and favour 15.
- **Promise deadlines are a cliff**: turn 12 with zero passes is −6 in every region per promise, so
  three broken are −18 national, with no partial credit and no countdown.
- **Memory does reach the whip** through `persona()`; only `feedMemory` never fires (problem 5).
- **α is unconstrained** (prompts.ts:26): Rome chose 0.65, the fixture 0.4.
- **`marks.midterm` is seeded once**, so every term puts the same third of the seats up. The
  identical replayed start is intended, and draws are already `crypto`.

## Too easy, too hard

| Start | Floor | Test |
|---|---|---|
| Majority | **Too easy.** Everything passes, capital +5 a turn; wipeout is the only risk, and only this class can trigger it | Coin flip |
| Plurality, 24 of 60 | **About right.** 4 to 8 passes with amends, capital tight, mood spirals | Coin flip |
| Minority, 12 of 60 or 7 of 25 | **Unwinnable.** 0 of 16 passed, impeached by turn 16; every pass costs −6 mood | Never reached |

α ≥ 0.7: the chamber is decoration, under 30% of the result. α 0.4 to 0.65 (both measured packs):
both halves matter, both sit at 0.5, neither has a lever. α ≤ 0.3: the Feed, citizens and canvass
are decoration. Nothing constrains the generator's choice.

## Decisions for the owner

1. **What decides the test?** (a) Feed region approval into every `intent_` question. (b) Keep the
   cold read, re-center the bar on 0.45. (c) Leave it. **Recommend (a)**, then re-measure: problems
   3, 4 and 7 all change size once the ledger counts.
2. **Should the mandate be drawn?** (a) Win on the means, draws become the reveal. (b) Keep drawn,
   win at 0.47. **Recommend (a)**: 0.070 of noise beats every lever.
3. **Feed mandatory or optional?** (a) Optional, with a neutral baseline. (b) Required, at a lower
   weight. **Recommend (a)**: the bloc split already rewards a partisan post.
4. **`share`: reword, threshold, or delete?** **Recommend rewording**: one line, and it turns on
   `feedMemory`.
5. **What stops the mood spiral?** (a) Share test against the caucus. (b) New plus sources.
   (c) Leave it. **Recommend (a)**.
6. **What is the chest for?** (a) Floor lobbying in session. (b) Two canvass turns at 25/50.
   (c) Nothing. **Recommend (a)**.
7. **A hopeless start?** (a) Show the cross-votes needed. (b) Handicap lobby costs. (c) Do not
   offer it. **Recommend (a)**: visible odds, not the game choosing.
8. **Wipeout: re-base, drop, or keep?** **Recommend re-basing** on own-side seats in the class;
   today it only ends runs that are going well.
9. **Relief cards: a decision or a beat?** (a) Two stances plus a term-long repeat filter.
   (b) Fewer draws. **Recommend (a)**.
10. **Clamp α?** (a) 0.35 to 0.65 in `PackSchema`. (b) Generator chooses, Seat warns.
    **Recommend (a)**, so no pack makes half its systems cosmetic.
11. **Chamber size.** The final review already caps generated chambers at 72 seats. (a) Keep 72.
    (b) Raise it by sampling citizens for the intent half. (c) Raise it by trimming `record()`.
    **Recommend (a) now**: a 400 at the test loses a 35-minute run.
12. **Region reveal: tiles or map?** Stage B shipped the weighted treemap (`src/Tiles.tsx`) as a
    ruling; the two demos you asked for were tiles and a schematic map. (a) Keep tiles. (b) Replace
    with the map: needs region geometry the pack does not carry, so Luna would have to place
    regions on a grid at build. **Recommend (a)**: no geometry, same reveal beat, works for a
    Senate and a city council alike.
13. **Chamber cap: 72 seats at build, or trim the test call?** The cap protects the 64k Jev
    request (93% at 60 seats). (a) Keep 72. (b) Drop `record()`'s headlines and streak from the
    test state to make room for 100. (c) Sample 120 of 250 citizens at the test. **Recommend
    (a)**; (b) is the cheapest raise if a 100-seat body matters to you.
14. **Preview worker.** A second Worker (`wrangler.preview.jsonc`, ignored) would let a branch run
    against production data without touching the domain. It needs its own secret and I cannot set
    one: run `bunx wrangler secret put OPENROUTER_API_KEY --config ./wrangler.preview.jsonc` and
    paste the key yourself, or say it is not wanted and the file goes.
15. **Favour target.** The campaign favour may go to any member (the whip count is over every
    seat). (a) Keep. (b) Own side only, so the lever reads as party discipline. **Recommend (a)**;
    the weakest-first list already makes the choice legible.
16. **Midterm class per term.** `marks.midterm` is seeded once, so "Another term" puts the same
    third of the seats up again. (a) Keep, the replay is intended. (b) Re-seed per term. **Recommend
    (b)**: a one-line change, and the second term should not be a rerun of the first.
17. **Drop `motion`?** The client uses two exports (`animate` for the rolling digits,
    `useReducedMotion`) and pays 23 kB gzip of 115 for them, measured by the React pass. About 15
    lines of rAF plus `matchMedia` replace both. (a) Replace and drop the dependency. (b) Keep it
    for the animations to come. **Recommend (a)** unless you plan spring physics; a one-hour job.
