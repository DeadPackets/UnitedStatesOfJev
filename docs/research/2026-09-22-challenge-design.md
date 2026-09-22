# Challenge that feels fair

Research digest for United States of Jev, 2026-09-22. Read with `docs/fun.md` and
`docs/gameplay-analysis-2026-09-22.md`; the measured numbers below come from those.

## 1. Principles and sources

| Source | Principle | Applies here |
|---|---|---|
| Jesse Schell, flow channel ([gamedeveloper.com](https://www.gamedeveloper.com/design/understanding-the-flow-channel-in-game-design)) | Keep difficulty rising with player skill, because skill above difficulty is boredom and difficulty above skill is anxiety. | The 20-turn term is one flow arc; escalations per term are the rise. A flat coin-flip test is neither, so the term reads as noise. |
| Raph Koster, *A Theory of Fun* ([summary](https://bumblingthroughdungeons.com/theory-fun-game-design-raph-koster/)) | Fun is learning a pattern, and it stops once the pattern is learned. | Each of the five resources must teach one lesson. A dominated lever (amend is a free re-roll, threat costs 20 against pork 10) is learned once and never revisited. |
| Mark Brown, GMTK ([gmtk.substack.com](https://gmtk.substack.com/p/whats-the-point-of-hard-games-anyway)) | Difficulty feels fair when the mistake is clearly the player's and improvement is visible. | Every loss must name the lever that was missed. A near miss at mandate 0.496 teaches nothing because nothing on screen said which 0.004 was buyable. |
| Keith Burgun, input vs output randomness ([gamedeveloper.com](https://www.gamedeveloper.com/design/luck-vs-skill-the-false-dichotomy)) | Randomness seen before deciding builds skill; randomness resolving after the decision removes it, and late is worse than early. | Seats and the opening deck are input randomness and are fine. The Bernoulli draw at the test is the worst case: 0.070 of noise at the last moment against levers worth 0.01. |
| Richard Garfield, luck and skill ([Board Game Design Lab](https://boardgamedesignlab.com/luck-vs-skill-with-richard-garfield/)) | Luck and skill are not a trade-off if the luck is spread over many decisions. | Keep per-vote variance, remove it from the event that ends the run. Twenty noisy votes reward skill; one noisy verdict does not. |
| Subset Games, *Into the Breach* ([Game Developer](https://www.gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-), [analysis](https://medium.com/@stiknork/design-thoughts-on-into-the-breach-9983d24ca62)) | Telegraph the next threat so every loss is the player's own fault. | The whip count is the telegraph: mandatory, a band rather than a point, and present at the midterm and the test too. |
| *Slay the Spire*, Ascension ([wiki](https://slay-the-spire.fandom.com/wiki/Ascension)) | Difficulty rises as named cumulative modifiers, not a multiplier. | The fixed list of 20 escalations is the right shape. It fails if a modifier is invisible in play, as `rival_surge` is today inside a canvass worth 0.01 mandate. |
| Supergiant, *Hades* ([Inverse interview](https://www.inverse.com/gaming/hades-god-mode-interview)) | Let the player set difficulty in named increments both ways, and show the setting. | God Mode is a stated, revocable assist. A hard start should be labelled hard, not silently compensated. |
| *Balatro*, ante scaling ([wiki](https://balatrowiki.org/w/Blinds_and_Antes)) | A fixed climbing bar against linear player growth guarantees the run ends, and the bar is visible. | The re-election bar should climb per term on a printed schedule. The run ends when the bar passes the player, not when a die lands wrong. |
| *Frostpunk*, book of laws ([analysis](https://www.gabrielchauri.com/frostpunk-decisions/)) | Choices are permanent and each narrows the next, so difficulty is a closing option space. | Laws passed in term 1 should still constrain term 3. A ratchet made of the player's own past is read as consequence, not as punishment. |
| Cliff Harris, *Democracy 4* ([Cliffski's blog](https://www.positech.co.uk/cliffsblog/2022/03/02/on-the-visualization-of-voter-approval-distribution-in-democracy-4/)) | Show the voter distribution, not just the mean, so the player sees who is angry. | Per-region approval already exists and is dropped at the test. Show the distribution on screen and feed it into the verdict. |
| Lucas Pope, *Papers, Please* ([Game Developer](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-)) | Add one new rule at a time to a task the player has already mastered. | Two escalations per term is one rule step per ten turns. Introduce each on a named turn with a card. |
| Tarn Adams, *Dwarf Fortress* ([Wikipedia](https://en.wikipedia.org/wiki/Dwarf_Fortress)) | Losing is fine when the loss produces a story worth retelling. | Impeachment at turn 16 with 0 of 16 bills passed is the same story every time. Failure must vary with the choices that caused it. |
| Valve, Left 4 Dead Director ([Game Developer](https://www.gamedeveloper.com/design/the-discomfort-zone-the-hidden-potential-of-valve-s-ai-director)) | Pace intensity against a measured tension curve: build, peak, relax. | The code Director fired 11 times in 20 turns with repeated relief cards. Pace the beats, do not adjust the odds. |
| Capcom, *Resident Evil 4* hidden DDA ([CBR](https://www.cbr.com/resident-evil-4-dynamic-difficulty-capcom/)) | Hidden adjustment works, and it also invalidates the player's read of their own skill. | Acceptable for flavour (which crisis card appears). Never acceptable for the vote threshold, the mandate bar, or a failure line. |
| Mario Kart blue shell ([Wikipedia](https://en.wikipedia.org/wiki/Blue_shell)) | Catch-up that punishes the leader at the last moment is the most resented part of a liked game. | No late swing may erase 20 turns of good play. The escalation ratchet is the fair version because it is announced in advance. |
| Civilization difficulty levels ([CivFanatics](https://forums.civfanatics.com/threads/does-the-ai-cheat-on-higher-levels.531671/)) | Difficulty is declared numeric bonuses to the opponent, tolerated because they are stated. | If rivals get stronger per term, print the number on the term card. |
| *Twilight Struggle* handicap bidding ([BGG](https://boardgamegeek.com/thread/612437/optional-rules-balance-and-handicap)) | Asymmetry is balanced by a stated handicap of a few units of starting resource. | A 12-of-60 start gets opening capital or favours, shown at start, not applied quietly mid-run. |
| Cole Wehrle, *Root* ([Space-Biff](https://spacebiff.com/2017/10/17/root/)) | Asymmetric sides balance through different win conditions, not the same one equalised. | A 12-seat faction should not win by passing bills. Give it a coalition or street win path with its own bar. |
| "One more turn" and compulsion loops ([mssv.net](https://mssv.net/2010/08/16/one-more-turn/)) | Session pull comes from an unresolved thread crossing the turn boundary. | End each turn with a named pending item: a vote scheduled, a promise counting down, a rival poll moving. |

## 2. Difficulty architecture

Challenge should come from four sources, in this order of weight.

**Economy tightening, about 50%.** The main engine. Difficulty is the rate at which income falls behind cost. Every resource needs a real sink and a real source: the chest reaches 388 with one sink worth 0.01 mandate, and party mood only falls, 68 to 26 in a term. A resource that moves one way is a timer, not a decision.

**Escalations, about 25%.** Two per term from the fixed 20, shown on a card, each moving a number the player watches. One that changes only an unlabelled integer is cost, not difficulty.

**Rivals, about 15%.** A named opposition with a visible poll number and a stated per-term bonus. Rivals act, and the act is reported before the player commits.

**Jev's judgment, about 10%.** Jev supplies direction and texture. It does not supply the size of the swing and never sets the bar.

Visible at all times: the mandate bar and the current estimate with its band; `threshold - ownSeats` on the seat screen; the whip count before every vote; per-region approval; the two active escalations and what each one does in numbers; promise countdowns; the term number and the next term's bar.

Never hidden: anything that moves a failure line, the vote threshold, the mandate bar, or a resource rate. Hidden adjustment is allowed only for which flavour card the Director draws and when, which is the Left 4 Dead use, not the Resident Evil 4 use.

A skilled run should end by the ratchet. Around term 4 to 6 the stacked escalations make one resource unholdable. The player sees it two or three turns out, spends the endgame choosing which failure to take, and loses the test by a readable margin such as 0.47 against a bar of 0.52. The feeling to aim for is "I know exactly which two turns cost me that", not "the coin came up tails".

## 3. Asymmetric starts

Warn, handicap, and score differently. Do not disallow.

1. **Warn.** Print `threshold - ownSeats` and a difficulty label on the start screen, derived from that gap. Above 6 is hard, above 15 is a different game.
2. **Handicap, stated at start.** Twilight Struggle style: a 12-of-60 start opens with extra capital or cross-bench favours proportional to the gap, printed on the card. Also make lobby costs scale with the gap, since 10/15/20 against +5 per pass makes minority floor play arithmetically impossible.
3. **Score differently.** Root style: a minority government should not be scored on bills passed. Give it a second win path, such as surviving 20 turns without a confidence loss, or building a coalition above the threshold, with its own bar. This is the change that matters most; the handicap alone only delays the same loss.
4. **Fix the mood spiral first.** The `applyVote` rule that subtracts 6 when opposition yes votes outnumber own ones means a 12-seat faction loses mood on every bill it passes. No handicap survives that. Make it a share test against caucus size.

## 4. Measuring fairness

Run scripted terms with three bots against the same seeds.

| Bot | Policy | Target win rate, term 1 |
|---|---|---|
| Random | Uniform over legal actions | under 10% |
| Greedy | One-step best expected approval, no promise tracking | 40 to 55% |
| Expert | Script written from the known optimal levers | 80 to 90% |

Per term, target a drop of roughly 10 to 15 points for the expert bot, so the median expert run is 4 to 6 terms and runs past term 8 are rare. If the three bots land within 10 points of each other, the game is decided by variance rather than play, which is the state today.

Log per turn: the five resources; every action with its expected effect at commit time and its realized effect; the whip band and the actual vote; per-region approval; active escalations; Jev call tokens and latency; Director state. Log per term: turn of each failure line crossed, mandate mean and drawn value, and the single largest contributor to the gap.

Four checks worth running:
- **Skill separation.** Expert minus greedy win rate, over 30 points.
- **Forecast calibration.** Brier score of the whip band against actual votes, under 0.15.
- **Lever identifiability.** For each loss, does a single named action, replayed, flip it? If no loss is flippable, no loss is teachable.
- **Variance share.** Fraction of the final mandate explained by draws rather than by the mean. Target under 20%; today the draw alone is worth 0.070 on a bar near 0.5.

## 5. Risks of an AI judge

An LLM as the source of difficulty adds failure modes a rules engine does not have.

**Sycophancy and compression.** Jev returned 3,807 likes and 271 boos in 5,000 reactions, and 0 shares. A judge that mostly approves is a rubber wall, which is the documented failure of AI Dungeon style systems. Fix by subtracting a measured baseline so an average action scores 0, and by making the choice set mutually exclusive in wording.

**Anchoring.** A single number in the prompt, such as national approval, will dominate 300 questions. Give per-region numbers to per-region questions and nothing else.

**Nondeterminism and drift.** The same state can grade differently across calls and across model versions. Keep a frozen golden set of a few hundred prompts with recorded distributions, re-run it on every model or prompt change, and treat a shift as a balance change that needs re-measuring.

**Unbounded influence.** Cap Jev's contribution as a fraction of any turn's total swing, in code, after the call. The code owns the bar; Jev owns the direction.

**Injection.** The player types laws and posts freely. Treat that text as data, keep it out of the system prompt, and validate that returned values are in range before applying them.

**Cost and truncation.** The test call already uses 93% of the 64k cap. A judge that silently truncates is a judge that silently rebalances the game.
