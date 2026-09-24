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

## Lever combinations, 2026-09-22

Six stacks, full sections for every condition, Rome and Egypt twice, Iran 1979 once with its checklist frozen first. Full tables in `docs/combos-2026-09-22.md`. Spend $0.37.

| Stack | Factual errors, mean | Rome | Egypt | Iran | Reference errors | Cost | Seconds |
|---|---|---|---|---|---|---|---|
| B full sections only | 3.0 | 3.0 | 4.5 | 0 | 8.8 | $0.006 | 32 |
| K1 Wikidata dates and colors | 2.2 | 2.5 | 3.0 | 0 | 15.4 | $0.007 | 34 |
| K2 + facts sheet | 2.2 | 3.0 | 2.0 | 1 | 10.0 | $0.010 | 41 |
| K3 + reduced validators, one retry | 2.0 | 2.0 | 2.5 | 1 | 5.0 | $0.017 | 63 |
| K4 + code calendar | **1.2** | 2.0 | **0.5** | 1 | **2.6** | $0.015 | 59 |
| K5 K4 without Wikidata | 1.8 | 2.0 | 2.0 | 1 | 4.6 | $0.016 | 63 |

K4 is the stack: the only zero-error Egypt pack, reference errors down from 8.8 to 2.6, and Wikidata inside the stack is free (K4 beats K5 by 0.6 errors at lower cost). K1 alone is the cost-constrained choice at $0.0001 over baseline for 0.8 errors removed.

Three defects found and fixed in the spec: (1) the facts sheet made Iran worse by listing Mosaddegh (d. 1967) as a person, and the frame took "use only people on the sheet" as license to seat him; the sheet flagged him not alive but with no death date, and the validator read only the date. Validator now reads the alive flag, and the frame prompt says leaders must be alive on the start date. (2) The Ides failed in 12 of 12 Rome runs because the model chose a start date 22 days before it and no unit lands day 22 on turn 16 to 18; code now sets start_date as anchor minus 15 turn units, which lands all four saved Rome runs on turn 16. (3) The Wikidata guard let through a Lepidus dead 108 years before the era and an Octavian born in 1996; the guard now requires a birth date within 100 years before start_date.

## Matching, 2026-09-22

`POST /api/scenarios/match` against the live archive (`v3nj3k` Rome, `1wybd8` Germany, 2 ready scenarios; `MIN_CANDIDATES = 3`, cosine cutoff 0.6). Jev probabilities below are from a temporary bypass of both the 0.6 cosine filter and the `MIN_CANDIDATES` gate, to see what Jev would have said; the committed code path is unchanged.

| Prompt | Cosine (v3nj3k, 1wybd8) | Jev probabilities (none_of_these, v3nj3k, 1wybd8) | Decision |
|---|---|---|---|
| "Rome 44 BC before the Ides" | 0.542, 0.215 | 0.48, 0.52, 0 | `{build:true}` |
| "Bundestag 2021" | 0.261, 0.621 | 0, 0, 1.00 | `{load:"1wybd8"}` |
| "Mars colony 2091" | 0.269, 0.333 | 1.00, 0, 0 | `{build:true}` |

Rome's own pack scores 0.542 against its own prompt, under the 0.6 cosine cutoff, so in the shipped code it never reaches Jev at all — that alone accounts for `build:true`. Forcing the Jev call anyway shows it would not have changed the outcome: 0.52 on `v3nj3k` clears neither the 0.85 offer nor 0.95 load bar. Bundestag clears cosine (0.621) and Jev alone (1.00 on `1wybd8`) — matches expected `load`. Mars scores under cosine on both and Jev puts `none_of_these` at 1.00 — matches expected `build`. All three match the brief's expected shape; Rome's `build` is archive size (2 ready scenarios, one prompt short of even a confident cosine match), not a bug.

(The cosine floor was later lowered to 0.45 once the archive held real vectors — `worker/match.ts`.)

## Stage A live numbers, 2026-09-22

Two proof builds against the real Workflow, D1, Vectorize, R2 and Workers AI (`.superpowers/sdd/2026-09-22-any-polity-stage-a/task-6-report.md`), and one full term against a running Worker (`task-9-report.md`).

### Build, seconds per step

`assign` and `calendar` are pure and finish inside one 2 s poll, so `scripts/build.ts` does not print them.

| Step | Rome `v3nj3k` | Germany `1wybd8` | Spec §4 |
|---|---|---|---|
| plan | 5.1 s | 2.4 s | 3 s |
| fetch | 2.4 s | 4.8 s | 6 s |
| facts | 21.6 s | 19.2 s | 8 s |
| frame | 28.8 s | 128.5 s | 20 s |
| names | 272.3 s | 26.6 s | 6 s |
| personas | 31.7 s | 24.3 s | 30 s |
| dedupe | 4.7 s | 2.2 s | 5 s |
| deck | 19.2 s | 22.3 s | 20 s |
| art | 36.7 s | 36.3 s | 10 s |
| index | 2.9 s | 2.9 s | 2 s |
| **total** | **427.8 s** | **271.7 s** | ~110 s |
| portraits (after ready, background) | ~90 s, 4 sheets | ~50 s, 2 sheets | 20 s |

Cost about $0.12 per successful build by OpenRouter's own usage figures. `names` (one call for 60 member plus
250 citizen names) and `frame` were the two steps that blew the spec's ~110 s target; `names` was since split
into parallel per-category batches (`7ceb475`, `worker/gen/personas.ts`), not re-measured against a live build.

### Term, `bun scripts/term.ts`

Rome `v3nj3k`, Caesarians (24 of 60 seats, threshold 31), 20 turns plus the test: **213.7 s, 113 requests, all
200**. Two runs: one `reelected` (score 189), one `defeated` (score 79).

Model calls per route, one term (20 bill turns, up to 18 amends, 20 votes, 11 crisis cards, 1 test):

| Route | n | Luna calls | Jev calls | Median wall |
|---|---|---|---|---|
| `.../bills` (gate + parse) | 20 | 1 (`parseBill`) | 0 | 1812 ms |
| `.../bills/:b/whip` | 20 | 0 | 1 | 639 ms |
| `.../bills/:b/amend` | 18 | 1 (`amendBill`) | 3 (parallel re-whip) | 4382 ms |
| `.../bills/:b/amend/:i` | 18 | 0 | 0 | 8 ms |
| `.../bills/:b/lobby` | 2 | 0 | 0 | 436 ms |
| `.../bills/:b/vote` | 20 | 2 (`narrate`, `quotes`) | 1 (250-citizen call) | 3570 ms |
| `.../events/:i` | 11 | 1 (`outcome`) | up to 2 (`eventQuestions`, crisis citizens) | 1354 ms |
| `.../test` | 1 | 0 | 1 (310 questions: 60 loyalty + 250 intent) | 2628 ms |

The test's one Jev call answered in 2.6 s.

## Stage B live numbers, 2026-09-22

Three scripted terms (`bun scripts/term.ts`) and one term played in Chrome, all against a local `wrangler dev` with
remote D1, Vectorize, R2 and Workers AI. **391 requests, every one 200, no 5xx.** Costs are OpenRouter's own
`usage.cost`, logged per call in a temporary instrumentation pass and removed again.

| Run | Pack | Seat | Reached | Ending | Wall | Requests |
|---|---|---|---|---|---|---|
| 1 | Rome `v3nj3k`, 60 seats, 6 regions | Caesarians | turn 20, midterm, 4 campaign turns, the test | `defeated`, score 210, mandate 0.451 | 349.4 s | 145 |
| 2 | Germany `1wybd8`, 25 seats, 7 regions | SPD | turn 17, midterm | `impeached`, score 35 | 264.0 s | 115 |
| 3 | Germany `1wybd8` | SPD, pledges matched to the bills | turn 18, midterm | `lame_duck`, score 73 | 299.6 s | 125 |

Germany proves the small chamber: 25 seats, 13 to pass, 17 for a supermajority, a class of 8 at the half term.
It has **7 regions, not 16** — the plan's figure was wrong, and the treemap is drawn from `pack.regions`
either way.

### Seconds and cost per route, one full Rome term

The Chrome term, whose log carries every call's usage. One term is **$0.2153**, of which Stage B's three new
routes are **$0.060 (28%)**.

| Route | n | Median | Median cost | Model calls |
|---|---|---|---|---|
| `bills` | 20 | 2.1 s | $0.00018 | Jev gate (1 q), Luna `bill` |
| `bills/:b/whip` | 20 | 0.6 s | $0.00079 | Jev 83 q, 18.7k tokens |
| `bills/:b/amend` | 17 | 5.7 s | $0.00285 | Luna `amendments`, 3 parallel Jev re-whips |
| `bills/:b/vote` | 20 | 4.4 s | $0.00281 | Jev 250 q / 54.0k, Luna `quotes`, `headline`, `card` |
| `events/:i` | 12 | 1.6 s | $0.00245 | Jev 15 q, Jev 250 q / 54.8k, Luna `outcome` |
| **`post`** | 20 | **4.1 s** | **$0.00238** | Jev 250 q / 41.7k, Luna `replies`, Jev 50 q / 8.2k |
| **`midterm`** | 1 | **13.1 s** | **$0.00355** | Jev 250 q / 53.7k, Luna `newMembers`, `halfTerm` |
| **`campaign/drafts`** | 4 | 1.6 s | $0.00015 | Luna `messages` |
| **`campaign`** | 4 | **1.6 s** | **$0.00226** | Jev 250 q / 53.7k |
| `test` | 1 | 2.6 s | $0.00267 | Jev 310 q / 59.8k, Luna `ending` |

The midterm is the slowest single call in the game because it chains three: the draw, the replacements and the
headline. On Germany's 25 seats it is 7.0 to 7.9 s; on Rome's 60 it is 11.2 to 13.1 s. The portrait sheets for
flipped seats run in `waitUntil` and never hold the response: the 12 replacement faces of the Chrome term were
served from R2 about two minutes later.

**The largest Jev request measured is the test at turn 20: 59,758 tokens, 93% of the 64k cap.** The state carries
`record(pack, game)`, which grows with the term, so the headroom shrinks as the run goes on. A pack with more than
250 citizens, or a longer record, will hit the cap in the last turns before it hits it anywhere else.

### Experiment 1: do blocs split on a partisan post?

v2 §16's target is bloc means at least 0.2 apart on a partisan post. Each of the 250 citizens answers one Choice
(`like`, `boo`, `share`, `ignore`); the bloc mean below scores like and share as +1, boo as −1, ignore as 0, over
the 50 citizens of each of Rome's five blocs. The term script cycles three fixed texts, so each was measured six
or seven times in one term.

| Post | Character | Bloc-mean spread, min / median / max |
|---|---|---|
| "Food and fuel ... no family here eats worse because a merchant found a new price" | **partisan**: names a winner (the city's bread) and a loser (merchants) | **0.34 / 0.54 / 0.54** |
| "The roads, the water and the public buildings get fixed ... read the accounts" | **neutral**: works and published accounts | 0.12 / 0.24 / 0.26 |
| "An official who robs the public will answer for it in a court" | reads partisan, is not | 0.02 / 0.12 / 0.28 |

The partisan post clears 0.2 in **6 of 6** posts and splits the same way every time: `urban_plebs` 0.90 to 0.94,
`italian_landholders` or `equestrians` 0.36 to 0.58. The neutral post clears 0.2 in 5 of 7, so "neutral" is not
flat, only narrower. The anti-corruption text is the interesting negative: partisan in tone, near-unanimous in
reaction, because nobody's bloc loses by it.

**Jev never picks `share`.** Across 5,000 reactions (20 posts x 250 citizens) the tally is 3,807 like, 271 boo,
**0 share**, 922 ignore. `share` is only ever the second-most-likely option, and `choices()` takes the argmax, so
`applyPost`'s `hot` list is always empty: no region ever writes a feed memory line into its members, and the
`+2 x share` term in the approval delta is dead code in practice. The option wording is the suspect (`like` and
`share` are not exclusive to a reader); nothing else is wrong.

The same tally explains the balance: 76% of citizens like an average post, so the per-region delta is almost
always positive. Twenty posts carried national approval from 58 to 90 in run 1 and from 58 to 86 in the Chrome
term, while 17 turns with three posts fell from 56 to 22. The Feed is the strongest approval lever in the game by
a distance, and it is optional.

### Experiment 2: what does a 10-unit spend move?

v2 §16's target is 0.03 to 0.06 of region intent. Measured as the spent region's intent change minus the mean
change of the regions with no money that turn, which cancels the drift every campaign turn has.

| Turn | Spend | Spent region | Unspent mean | **Net** |
|---|---|---|---|---|
| Chrome, canvass 2 | 10 on `east` (no rival) | +0.009 | −0.039 | **+0.048** |
| Chrome, canvass 3 | 5 on `latium` (no rival) | +0.034 | +0.001 | **+0.033** |
| Chrome, canvass 4 | 10 on `gaul` (rival works it) | +0.080 | +0.005 | +0.075 |
| Run 1, canvass 3 | 5 on `italy` (rival works it) | +0.058 | +0.002 | +0.056 |

The clean 10-unit number is **+0.048**, inside the target. A contested region reads higher because the money also
lifts the drag the rival's own 5 units put there the turn before. The first canvass is not measurable: its
"before" is `startCampaign`'s seed from the approval ledger, and Jev's first read of citizen intent drops every
region by 0.3 to 0.6.

**The four canvass turns cannot rescue a term.** One region at 10 is worth `alpha x weight x 0.048` of the
mandate, about 0.006; four turns of the best play available are worth about 0.01. The mandate is decided by the
term's record, which is what the campaign is a summary of.

### Experiment 4: the forecast band against the drawn share

The band is ±1.96 standard errors of the weighted intent, from the citizen sample, not the per-region draw.

| Run | Last canvass point | Band | Test `public` | Test `drawnPublic` |
|---|---|---|---|---|
| 1 (Rome, scripted) | 45.5% | 39.4% to 51.7% | 53.1% | **47.0%**, inside |
| Chrome (Rome) | 47.3% | 41.2% to 53.5% | 42.8% | **48.0%**, inside |

The band is 12.3 points wide and contained the drawn share in both runs. It contained the test's own point
estimate in one of the two: the campaign and the test ask Jev different questions (`voteQuestions` with the
canvass messages against `testQuestions` with the whole record), and in run 1 they disagreed by 7.6 points.
The band is an honest read of sampling error, not of that disagreement.

## One v4 term, measured, 2026-09-23

One 20 turn term, the populist policy, one seed, on a 72 seat pack ("France in 1958", built locally for this),
through `wrangler.bots.jsonc`. The run is in `docs/bots/2026-09-23-measure`.

| Measurement | Value | Where it went |
|---|---|---|
| Cost of one term | $0.0903 | `TERM_USD` in `scripts/bots/run.ts`, rounded up to $0.10 |
| Terms one pass buys | 250 | `MAX_TERMS` in `scripts/bots/run.ts` |
| Average Jev input tokens a turn | 59,257 | the §11 token column |
| Largest single Jev request | 53,314 | a 250 citizen read, not a holder read; 83% of the 64k request cap |
| Largest per-holder read | 14,503 | the 72 seat holder at the test, under the 20,000 per-holder ceiling |
| Per-holder record budget | 1200 | `RECORD_TOKENS` in `worker/engine.ts`, unchanged |
| An average notice, before its own work | 0.670 over 8 posts | `POST_BASELINE` in `worker/engine.ts` |

The report's `Cost:` line reads the Jev meter only, which printed $0.0498 for this term. Luna and the portrait
sheets are not on that meter, so the term's cost is the OpenRouter key's spend before and after the run: $0.0903.
An earlier run of the same term spent $0.0543 by the same count, so `TERM_USD` takes the higher figure.

The largest request of the term is a citizen read, which the per-holder budget does not touch. The per-holder
read was measured on its own, with a log line in `jev()` that was not committed.

The v3 figure of $0.2153 a term measured the game before the Ruler: it has no price call and no holder
reads, so it is not comparable and is not used anywhere after this.

## Stage D measurement budget

Terms per check, priced at the `TERM_USD` of $0.10 measured in "One v4 term, measured". Each cost is that
figure times the terms in the row, and `N` is `(MAX_TERMS - 48) / 6` rounded down: 202 / 6 gives 33, so the
spread and the own-failure runs fit one budget together.

| Check | Terms | Cost |
|---|---|---|
| Term-1 win rates, six policies, N seeds | 6N = 198 | 198 x $0.10 = $19.80 |
| Own failure, four styles continued while winning, capped at three terms | up to 48 | 48 x $0.10 = $4.80 |
| Forecast calibration, variance share, flippability | 0, from the same logs | $0.00 |
| Bias audit, six pairs | 0 | 12 seats and priced acts, 12 x $0.02 (`SHARE_USD`) = $0.24 |
| Golden set replay, up to 300 prompts | 0 | one call a prompt |

Caps in code: `MAX_TERMS` and `BUDGET_USD` in `scripts/bots/run.ts`, checked before the first request and
again after every finished term, where a term counts at its metered Jev cost or `TERM_USD`, whichever is
higher. The caps hold per runner call; the spread and the own-failure runs are two calls and together
spend at most $24.60.

## Engine v2 balance pass, 2026-09-24

The four R23 style bots, 3 seeds a round (20260922-24, confirmed on 20260925-27), on two production packs run
locally: `fzzln5` Zanzibar sultanate (court, ruler `palace`, a minority start on the survival bar) and `74shk3`
Biden presidency (democracy, ruler `democrats`, the pack's own 0.50 bar). Run summaries are in
`docs/bots/2026-09-24-balance/*/runs.json`; the round log is `.superpowers/ruler/balance-progress.md`.

| Style | Before (6 runs) | After (12 runs) | Median losing ending after |
|---|---|---|---|
| strongman | 50% | 50% | defeated (Biden) |
| populist | 67% (2 coups) | 50% | defeated (Biden) |
| broker | 100% | 50% | defeated (Biden) |
| idealist | 83% (1 coup) | 50% | defeated (Biden) |

Constants: `SUPPORT_SERVE` 10 to 2, `SUPPORT_HIT` 8 to 5, `SURVIVAL_BAR` 0.40 to 0.45. Engine v2 was too easy:
support gains are permanent, and at 10 a served group one act could add +0.33 to +0.39 of mandate by turn 8.
After the pass every style wins Zanzibar and loses Biden, so the 50% comes from the packs, not from play inside
one pack. The strongman bot spends its authority on decrees by turn 5 and idles; no constant pays authority back
for coercion, so its mandate stays near each pack's opening number whatever the constants.

One term's model cost, measured solo (the meter is per isolate and races when bots run in parallel):

| Model | Tokens | Cost |
|---|---|---|
| Jev | 1,558,624 input | $0.0655 |
| Luna | 89,304 | $0.0195 |
| Total | | $0.085 |
