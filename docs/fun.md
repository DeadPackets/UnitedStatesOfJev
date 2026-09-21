# What makes USJ fun

Research digest, 2026-09-22, and how each finding lands in the game. The rule that
survives every source: **the world must push back on its own.** Code owns state, Jev
judges, Luna only narrates. The moment the narrator decides outcomes, stakes vanish.

## 1. The seed question

Seed the start, not the fate. Input randomness (the Senate you are dealt) is what
players call fair. Output randomness (how the vote lands) is what players call
exciting, as long as three conditions hold:

| Condition | Why | In USJ |
|---|---|---|
| Odds are visible before the commit | Output randomness only feels like cheating when it was hidden | Whip count stays mandatory, and shows a confidence band, not a point |
| The player can buy variance down | Risk management turns luck into a decision | Lobby, amend, delay a vote a week, trade a favor |
| A loss produces a story, not a shrug | Crusader Kings and Dwarf Fortress players stay for the disasters | Every failed vote names who flipped and why, in a quote |

Current code draws votes from the seeded rng, so a replayed code with identical
inputs gives identical votes. Change: votes draw from `crypto.getRandomValues`, only
seating and modifiers come from the seed. Two players on the same daily code start at
the same table and get different hands, like a poker tournament. Scoring must then
credit skill, not only outcome: expected yes at the moment of the call counts toward
score alongside the actual result.

## 2. Findings and where they land

### Interesting decisions (Meier)
A decision is interesting when the right answer is unclear because several
considerations pull apart. Today a bill only trades approval against capital. Papers,
Please gets its grip from five reward layers that contradict each other. USJ needs
five too:

| Layer | Resource | Fed by | Starved by |
|---|---|---|---|
| Voters | approval by state | popular bills, keeping promises | unpopular bills, scandals |
| Senate | capital | passing bills, favors returned | lobbying, losses, struck laws |
| Base | promise progress, 3 picked at setup | bills tagged with a promise | ignoring promises for 4 weeks |
| Donors | war chest | bills their industries like | bills that hit them, and they say so in the Feed |
| Party | leadership mood | party-line bills | crossing the aisle, even when it wins |

A bill that wins the Senate can lose a donor. A post that pleases the base can anger
leadership. No single optimal play, so every week is a judgment call.

### The world pushes back (AI Dungeon post-mortems)
LLM games die from the "rubber wall": whatever you do, a scene appears that works.
USJ is safe as long as Jev judges before Luna writes, capital can hit zero, promises
can be broken, and an election can be lost. Never add a Luna call that decides a
result. Luna gets the result and explains it.

### Emergent narrative (Crusader Kings II, Reigns)
Players invent links between events the designer never connected. Reigns found that
when a minority of cards track prior choices, the whole game feels authored. Cheap
version: senators already keep 5 memory lines. Give Luna those lines for every
headline and quote, and have one in five headlines reference a past bill by name.
Named characters with grudges do the rest.

### Pacing (Left 4 Dead's Director)
Intensity is measured, then shaped into build, peak, relax. USJ adds a Director in
code, no model call: it tracks a stress score from recent losses, approval slope, and
capital. Two losses in a row, and the next agenda bill is softer and a senator
offers a favor. Three wins in a row, and a crisis lands. Crises come from a storylet
deck (see 4), weighted like a Reigns bag, never at random.

### Losing is fun (Dwarf Fortress)
A run must be able to end badly in a way worth telling. Impeachment, a lost
midterm, a landslide defeat on election night, each with its own Luna obituary and a
share card. The Over screen is a story, not a scoreboard.

### Juice (Balatro)
Feedback is the product. Balatro stacks five channels on every score: motion,
rolling digits, shake scaled to magnitude, particles, rising pitch. USJ has the roll
call. Add: the last five votes of a close call slow down, shake scales with margin,
pitch climbs per yes, the stamp hits harder on an upset. A near miss (49 or 50 on
51 needed) is a legitimate hook here because the player had a lever: one more
lobby would have done it, and the Over screen says so.

### Habit (Wordle)
One daily code, one attempt, a spoiler-free share grid, a streak counter. USJ has the
daily code. Add the one-attempt rule for the daily, a share grid of vote squares
(filled and hollow, one row per bill), and a streak of days played.

### Mastery (Koster)
Fun is learning a pattern. The pattern in USJ is the Senate: which temperaments
break, which states punish which tags, when the filibuster bites. Never print the
rule. Let the whip count teach it. Difficulty after a win comes from modifiers, the
way Hades uses Heat: hostile press, a recession, a filibuster-happy minority.
Progression is horizontal, new agendas and modifiers, never stat grinding.

### Motivation (self-determination theory)
Autonomy: free-text bills are the most autonomous input in the genre. Keep it.
Competence: forecast next to outcome every week, so skill is visible. Relatedness:
portraits, quotes, a rival who posts against you, a code to send a friend.

### Dilemmas (Frostpunk)
Choices tied to mechanics, with a cost either way, and the consequence shown later,
not now. Crisis cards do this: a strike, a hurricane, a leak. Pick a stance, Jev
scores five blocs, the ledger shows the bill a week later.

## 3. Structure: one term

| Beat | What happens | Model calls |
|---|---|---|
| Setup | party, seats, popularity, pick 3 promises, seed | none |
| Week, 20 of them | post (optional), bill, whip, lobby or amend, roll call, ledger | Luna parse, Jev senators, Jev citizens for the post |
| Director | every week, code decides: crisis, favor, rival move, or quiet | Luna writes the card when one fires |
| Midterm, week 10 | 33 seats reseated by state approval | Jev citizens |
| Campaign, 4 weeks | message, state, spend from the war chest, needle moves live | Jev citizens |
| Election night | state by state reveal, electoral count, red only on a flip | none |
| Over | obituary or inaugural, score breakdown, share grid, unlocks | Luna |

Session about 35 minutes. The daily is a 5-week sprint of the same loop, 8 minutes.

## 4. The storylet deck

Events are storylets: a template with prerequisites and results, in code. Luna
writes the prose from the template and the game state. Jev scores reactions.

```
{ id: "strike", needs: { labor: "<40", week: ">3" }, weight: 3,
  stances: ["side with workers", "back the owners", "stay out"],
  scores: ["labor", "business", "party"], memory: "sided with the strikers" }
```

Twenty templates cover a term. Weight rises when prerequisites are barely met and
drops for anything shown in the last 6 weeks, the Reigns bag. The Director picks
from the deck, so drama is authored and no two runs draw the same cards in the same
order.

## 5. Cost

Per week about $0.006 with the citizen roster, about $0.15 per term, under a cent for
a daily. Latency stays under 1.5 s because the senator call and the citizen call run
in parallel.

## Sources

- Balatro feedback stack: https://blakecrosley.com/guides/design/balatro
- Balatro variable rewards: https://mechanicsofmagic.com/2026/05/22/critical-play-on-games-of-chance-and-addiction-balatro/
- Reigns adaptive narrative: https://www.gamedeveloper.com/design/game-design-deep-dive-creating-an-adaptive-narrative-in-i-reigns-i-
- Papers, Please engagement layers: https://www.gamedeveloper.com/design/what-games-can-learn-from-the-engagement-layers-of-papers-please
- Crusader Kings II emergent narrative: https://link.springer.com/chapter/10.1007/978-3-319-27036-4_25
- Left 4 Dead Director: https://left4dead.fandom.com/wiki/The_Director
- Sid Meier, interesting decisions: https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions
- Input vs output randomness: https://www.gamedeveloper.com/design/randomness-and-game-design
- AI Dungeon, the rubber wall: https://fables.gg/blog/why-ai-dungeon-is-not-the-ai-dungeon-master-youre-looking-for and https://arcanumrpgs.com/blog/ai-rpg-difficulty/
- Wordle psychology: https://uxmag.com/articles/the-fascinating-psychology-tricks-that-make-wordle-so-addictive
- Self-determination theory in games: https://www.gamedeveloper.com/design/a-quick-breakdown-of-self-determination-theory
- Near-miss effect: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7214505/
- Koster, A Theory of Fun: https://bumblingthroughdungeons.com/theory-fun-game-design-raph-koster/
- Dwarf Fortress, losing is fun: https://en.wikipedia.org/wiki/Dwarf_Fortress
- Frostpunk moral choices: https://www.gamepressure.com/editorials/fifth-dont-kill-on-moral-dilemmas-in-video-games/zf4b9
- Meta-progression critique: https://www.resetera.com/threads/im-starting-to-feel-that-stat-based-meta-progression-is-starting-to-ruin-roguelites-generally-speaking.1509337/
- Storylets and quality-based narrative: https://emshort.blog/2019/11/29/storylets-you-want-them/
