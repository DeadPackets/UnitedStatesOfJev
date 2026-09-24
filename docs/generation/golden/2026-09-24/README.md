# Golden run 2026-09-24

Three prompts built end to end by generation v2 through the local worker (`bun scripts/golden-builds.ts <baseUrl>`), all three at once.
Targets: total 220 s (the plan estimates 250 to 290 s), first readable about 90 s from the world step's start, about $0.9 a world.
"First readable" is the roster fragment, counted from the build's start; "bible" is also counted from the world step's start, as SPEED.md did.
Dollars per build are the ledger (Opus and Grok only). The key meter for the whole run (Opus, Grok and Luna, three builds) was **$4.913**.

| world | status | total s | first readable s (roster) | bible s (build / world start) | briefing s | ledger $ | calls (Grok) | checks before / after repair | holders / factions | emblems kept | lint left |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [ottoman-1908](ottoman-1908.md) | ready | 392.1 | 194.1 | 263.6 / 60.8 | 304.7 | 2.227 | 15 (0) | 1 / 0 | 10 / 8 | 0/17 | 16 |
| [westeros-298](westeros-298.md) | ready | 229.3 | 71.3 | 126.1 / 54.8 | 156.5 | 1.353 | 14 (0) | 0 / 0 | 9 / 6 | 7/9 | 0 |
| [fridge-parliament](fridge-parliament.md) | ready | 274.6 | 86.7 | 143.4 / 46.9 | 174.5 | 1.193 | 14 (0) | 1 / 0 | 8 / 4 | 0/11 | 0 |

Each world's sheet has its calls, holders, factions, acts, pledges and every check; `<world>.pack.json` is the pack as stored.

## Against the targets

| measure | target | ottoman-1908 | westeros-298 | fridge-parliament | verdict |
|---|---|---|---|---|---|
| total | 220 s (estimate 250 to 290 s) | 392 s | 229 s | 275 s | Westeros and the fridge are inside the estimate; **Ottoman misses by 100 s** |
| first readable (roster, from build start) | about 85 s | 194 s | 71 s | 87 s | **Ottoman misses**: its roster call alone took 142 s |
| bible, from the world step's start | about 90 s | 61 s | 55 s | 47 s | met |
| briefing, from the world step's start | | 102 s | 85 s | 78 s | |
| Opus and Grok dollars (ledger) | about $0.90 | $2.23 | $1.35 | $1.19 | **missed on all three, by 33% to 147%** |
| key meter, all three with Luna | | | | | $4.91 of the $6 cap (Luna about $0.14) |

Where the time and money go:
- The roster call is the biggest single cost: $0.70 and 142 s for Ottoman (90k input tokens, not cached, 17.6k out); $0.30 to $0.33 for the other two.
- The bible writes the cache ($0.24 to $0.34). Every part after it reads 25k to 39k cached tokens and costs $0.03 to $0.16.
- The Ottoman emblem call took 102 s and $0.22 for 17 emblems; the people steps (Luna) add about 60 to 90 s after the systems part.

Things to know when reading the sheets:
- **Ottoman ran past this run's $2 build cap** (`BUILD_COST_CAP=2` in `.dev.vars`; production defaults to $3). The cap refused the emblem review and the style rewrite, so all 17 emblems fell back to line icons ("not reviewed") and 16 lint findings stay in the prose. The build still finished, as designed.
- The fridge emblem call and its names-only resend both came back `content_filter`, so the fridge has line icons only.
- Westeros: the review kept 7 of 9 emblems (Lannister and Targaryen failed the 28 px check).
- No world has a seat's backer, so no holder gives authority; the backer rule was not exercised.
- Westeros has no chamber, so it seats a court of 24 whose factions share ids with their holders (Decision 4). House Stark is both a holder and the player's faction there.
- The fridge's C3 repair renamed the FDA "The Silver Spring Food and Drug Administration" to give it a proper noun.
- Ottoman's lint flags "Macedonia" as an alias of "Ottoman Macedonia"; that is a lint false positive, not a prose fault.

`bun scripts/golden-builds.ts --sheets 2026-09-24` writes the sheets and the table above this section again from `runs.csv` (it replaces this README).
