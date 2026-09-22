# Jev experiments, 2026-09-21

Model `typesafe/jev-1.13-20260917` via OpenRouter `POST /api/v1/systemone`. Throwaway scripts, not kept.

## Context limits (measured)

| State tokens | Result |
|---|---|
| 32,149 | 200 OK, 836 ms |
| 33,000 | 400 `max_tokens_exceeded` |

State cap is 32k. Total budget: 28k state + 1,200 questions = 55,709 tokens returned 200 in 2.5 s.

## Numbers, counting, dates

- `Is president_approval below 50%?` for 30..70%: P(yes) 0.99 at 49%, 0.02 at 50%, 0.01 at 51%. Correct at every value.
- Worded buckets: very unpopular 0.98, unpopular 0.99, slightly unpopular 0.76, evenly split 0.16, slightly popular 0.13, popular 0.02. Monotonic.
- 12 items, 5 fruits: "more than 4" 0.82, "more than 6" 0.06, "exactly 5" 0.92. Per-item Nouls: 5 of 12 above 0.5, all correct.
- Dates: 3 of 4 pairs correct at 0.96+ confidence. "Q3 2026 before August 2026" gave 0.55, which is ambiguous by construction.

## Irrelevant-state drift

Same senator question, filler added to state: 0 tokens 0.08-0.10, 5k 0.10-0.11, 15k 0.10-0.11, 25k 0.10, 30k 0.11. No drift beyond 0.03.

## Whip count, 100 senators + filibuster, one call, run 3 times

| Metric | Value |
|---|---|
| Input tokens | 18,341 |
| Latency | 473, 550, 549 ms |
| Cost | $0.00077 per call |
| Expected yes (carbon fee bill, Dem president) | 33.1, 32.9, 33.2 |
| Mean P(yes) Democrats / Republicans | 0.54 / 0.16 |
| Max per-senator change across runs | 0.04 |

Personas steer the answer: CA Democrat, tech donors 0.83; WV Republican, coal state 0.09.

## Latency vs size

10k tokens 523 ms, 20k 618 ms, 28k 768 ms, 32k 836 ms, 55k with 1,200 questions 2.5 s.


## Portrait generation, 2026-09-22

Same prompt to every model: 4×4 sheet of 16 different Roman senators, passport framing, eyes on one line. Cost from the response usage field.

| Model | Per sheet | Seconds | Result |
|---|---|---|---|
| meta/muse-image (`/api/v1/images`) | $0.003 to $0.004 | 15 to 22 | 16 distinct faces, cells aligned, eye line within 4 px of 128 |
| @cf/flux-1-schnell | neurons | 11 | drew 5×4 with borders, crops cut 3 of 6 faces |
| black-forest-labs/flux.2-klein-4b | $0.014 | 4 | one man repeated, two faces per cell |
| krea/krea-2-medium-turbo | $0.015 | 19 | aligned, one man repeated 16 times |
| qwen/qwen-image-3 | $0.030 | 76 | 16 distinct faces, aligned, quality above muse |
| sourceful/riverflow-v2.5-fast | $0.040 | 160 | distinct, picture frames in every cell |
| bytedance-seed/seedream-5-0-lite | rejects 1K, needs 2K or 4K | | |

Decision: muse default, qwen fallback. Dither at 48 px: 16-color Floyd-Steinberg keeps the face; 4-tone ordered ink dither loses the outline on 5 of 16 cells. Chosen treatment: color dither in a seat coin at seat size, ink halftone plate (o8x8, 3 levels) at drawer size, no eye bar. Luna page palettes for Rome, Mars and Egypt passed contrast at 13.1:1 to 14.6:1 without correction.

## Pack generator, 2026-09-22

Frame step of the polity pack (spec §3), three scenarios, Wikipedia and Wikidata grounding for the two historical ones, strict JSON schema. Cost from usage. Spend $1.17.

| Model | Scenario | Schema first try | Seconds | Cost | Reference errors | Factual errors |
|---|---|---|---|---|---|---|
| gpt-5.6-luna | Germany 2021 | yes | 28 | $0.006 | 11 | 0 |
| gpt-5.6-luna | Rome 44 BC | yes | 22 | $0.005 | 34 (one tag-spelling bug) | 2: Pompey alive, Ides at turn 5 of 20 |
| gpt-5.6-luna | Mars 2091 | yes | 22 | $0.005 | leader seated as member | |
| gpt-6-astra | Germany 2021 | yes | 112 | $0.34 | 0 | 0, but 4 meta disclaimers in player text |
| gpt-6-astra | Rome 44 BC | yes | 97 | $0.27 | 0 | 1: two factions only, no Brutus, Cassius or Antony; 11 meta disclaimers |
| gpt-6-astra | Mars 2091 | yes | 99 | $0.27 | 0 | |
| grok-4.7 | Germany 2021 | yes | 197 | $0.09 | 0 | 0; CDU/CSU split, 16 Länder |
| grok-4.7 | Rome 44 BC | no, second try | 259 | $0.10 | 0 | 1: dated storylet is not the Ides |
| grok-4.7 | Mars 2091 | failed twice (region lean below −1) | 202 | $0.09 | | |

Germany seat shares within ±2 of the 736-seat proportions and Wikidata P465 colors exact for all three. Reference errors are ids or tags that pass the schema but point nowhere; a cross-check after parse with the violation list fed back on retry covers all of Luna's. Astra narrates caveats into game text ("its 40 seats are a design allocation") and needs a prompt rule. Grok writes best and slowest, 10k+ reasoning tokens per call.

Wikidata QIDs that carry P465 for 2021: SPD Q49768, CDU Q49762, CSU Q49763, Greens Q49766, FDP Q13124, AfD Q6721203, Linke Q49764, SSW Q161545. `prop=extracts` returns lead sections only; seat tables need `action=parse` on the results section.

## Accuracy levers for Luna, 2026-09-22

Ablation on Rome 44 BC (two runs each) and Egypt 2012 (one run), Luna only, fixed checklists frozen before the runs. Full tables in `docs/ablation-2026-09-22.md`. Spend $0.23.

| Condition | Factual errors, mean | Reference errors | Seconds | Cost |
|---|---|---|---|---|
| C0 baseline, lead sections only | 3.0 | 9 | 28 | $0.005 |
| L1 model dates, code maps turns | 3.0 | 34 | 25 | $0.006 |
| L2 facts sheet before the frame | 2.3 | 6 | 36 | $0.009 |
| L3 validators with one retry | 3.3 | 5 | 46 | $0.012 |
| L4 Wikidata birth, death, colors | 1.7 | 3 | 31 | $0.006 |
| L5 Luna self-review and repair | 3.3 | 3 | 58 | $0.016 |
| ALL | 1.7 | 7 | 76 | $0.022 |

Findings: L4 removed every dead leader (Pompey, Crassus) and was the only single lever that produced Wikidata party colors for Egypt, for $0.0006. L2 removed dead leaders too and made Egypt name Morsi in the start. L5 made things worse: 32 to 52 claims per review, mostly seat counts the sources cannot confirm, and the repair hedged into disclaimers (11 in one ALL run) and duplicated leaders. L1's calendar chosen by the model put the Ides on turn 6 or 15; code must set the calendar. L3's "leader appears in sources" check rejected two real Egyptian leaders the lead sections never name. Wikidata label search needs a disambiguation guard: it returned a Lepidus who died in 152 BC and a 1996-born Octavian, which Luna ignored.

Decision: fetch full sections, not leads; L4 plus L2 in the pipeline; L3 reduced to alive-on-start-date, seated-leader, and reference checks; code sets the calendar from the facts sheet's dated events so the last one lands near turn 18; no self-review; Astra only when the validators still fail after one retry. Expected cost per build about $0.01 for the frame path.

## Jev duplicate detection, 2026-09-22

95 v1 senators plus 5 planted twins (Luna paraphrase of bio and tell under a new name, same state, party, issues, donors), two shuffles. Spend $0.03.

| Step | Shape | Tokens | Cost | Wall |
|---|---|---|---|---|
| 1 | Choice per member, "which other member is most like this one, ignoring the name", 99 options; 2 calls of 50 because 100 × 99 options exceed the 64k request cap | 55k each | $0.0023 each | 1.2 s each |
| 2, by id | Noul "are members a and b the same person" referencing the state | 17k | $0.0007 | 0.6 s |
| 2, inline | same Noul with both records pasted into the question | 30k | $0.0013 | 0.7 s |

| Variant | Sample 1 | Sample 2 | False pairs | Controls flagged |
|---|---|---|---|---|
| step 1 alone at 0.5 | 5 of 5 | 5 of 5 | 18 to 22 | some |
| step 1 then Noul by id | 4 of 5 | 2 of 5 | 0 | 0 |
| step 1 then Noul inline | **5 of 5** | **5 of 5** | 0 | 0 |

Twins were the top choice in 19 of 20 directions. By-id Noul ranks right but calibrates low (twins 0.34 to 0.70). Inline Noul puts twins at 0.83 to 0.93 and the worst non-twin at 0.24, so 0.5 has margin both ways. Same finding as the lobby-offer calibration: put the thing to judge inside the question, not in the state. Decision: step 1 Choice at 0.5, union of both directions, step 2 inline Noul at 0.5, never step 1 alone. About $0.006 and 4.5 s per 100 personas. Bound: 10 planted pairs and 2 seeds, recall at least 0.7 at 95%; twins with a changed region or edited issues untested.
