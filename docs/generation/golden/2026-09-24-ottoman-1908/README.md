# Golden run 2026-09-24

The golden prompts built end to end by generation v2 through the local worker (`bun scripts/golden-builds.ts <baseUrl> [slug ...]`), 1 at once.
Targets: total 220 s (the plan estimates 250 to 290 s), first readable about 90 s from the world step's start, about $0.9 a world.
"First readable" is the roster fragment, counted from the build's start; "bible" is also counted from the world step's start, as SPEED.md did.
Dollars per build are the ledger (Opus and Grok only). The key meter for the whole run (Opus, Grok and Luna, every build) was **$1.549**.

| world | status | total s | first readable s (roster) | bible s (build / world start) | briefing s | ledger $ | calls (Grok) | checks before / after repair | holders / factions | emblems kept | lint left |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [ottoman-1908](ottoman-1908.md) | ready | 440.7 | 130.7 | 195.7 / 65 | 227.3 | 1.511 | 14 (0) | 0 / 0 | 10 / 2 | 9/11 | 0 |

Each world's sheet has its calls, holders, factions, acts, pledges and every check; `<world>.pack.json` is the pack as stored.

## Against the first golden run (same prompt, 2026-09-24)

Rebuilt after the Track E review fixes: the sweep keeps bodies only in short lines, the world calls drop it, the parts read the bible from the cache, and the lint skips short forms of a term.
The first run had a $2 dev cap; this one had the production $3.

| call | before $ | after $ | before in (cached) | after in (cached) | note |
|---|---|---|---|---|---|
| plan | 0.056 | 0.054 | 4038 (0) | 4038 (0) | |
| roster | 0.704 | 0.437 | 89894 (0) | 55532 (0) | checklist 158 to 48 names; output 17578 to 10969 tokens |
| roster-repair | 0.158 | none | 36816 (0) | | no check failed this time |
| bible | 0.343 | 0.313 | 41045 (0, 39387 written) | 33194 (0, 31536 written) | |
| parts | 0.744 (10) | 0.521 (9) | 5.6k uncached each | 1.1k uncached each | 7 parts read the bible from the cache (35262 cached) |
| emblems | 0.222 (17) | 0.147 (11) | | | |
| emblem review | refused by the cap | 0.039 | | | 9 of 11 kept |
| rewrite | refused by the cap | none needed | | | lint 16 to 0 |
| **total** | **2.227** | **1.511** | 625697 (393870) | 428048 (309906) | key meter $1.549 with Luna |

Time: 392 s before, 441 s after. The Opus calls end 88 s sooner (278 s against 366 s), but the Luna names step took 144 s and is now the long pole.
This roster seats the Committee of Union and Progress as one bloc of 71 of 72 (the record's result), where the first run split the deputies by community; the chamber backs the ruler at 5%. The roster rule asks for the split, but no check holds it.
