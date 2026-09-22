# The balance pass

The loop that turns the measurement bots into tuned numbers. One pass is `MAX_TERMS` terms and at most
`BUDGET_USD`, both in `scripts/bots/run.ts`; the cost of one term is the measured figure in
`docs/experiments.md`, "One v4 term, measured". Nothing here runs against production: it takes
`wrangler.bots.jsonc`, which raises the rate limit and sets `BOTS` and `GOLDEN`.

## The loop

1. **Start the worker.** `bunx wrangler dev --config ./wrangler.bots.jsonc --port 8799`
   Check: `curl -s localhost:8799/api/health` prints `{"ok":true}`.
2. **Run the term-1 spread.** `bun scripts/bots/run.ts --scenario <id> --seeds <N> --terms 1 --out docs/bots/<date>-spread`
   `N` is `MAX_TERMS / 6` rounded down, because six policies play every seed; the runner refuses anything
   larger before it spends. Check: `docs/bots/<date>-spread/runs.json` has `6 x N` rows.
3. **Read the report.** `bun scripts/bots/report.ts docs/bots/<date>-spread`
   Check: six rows print and the exit code says pass or fail.
4. **Run the own-failure terms separately.**
   `bun scripts/bots/run.ts --scenario <id> --policies strongman,populist,broker,idealist --seeds 4 --terms 3 --out docs/bots/<date>-terms`
   A different directory on purpose: these runs continue while they win, so pooling them into the spread
   would count one style several times. Read them with their own `report.ts` call.
5. **Change one constant.** Pick the first failing check in the table below, change the one constant it
   names in `worker/engine.ts`, and commit it on its own.
6. **Re-run steps 2 to 4.** A pass that changed two constants cannot say which one worked.

Stop when all six rows pass, or after four loops: a check that will not move in four loops is a design
question, not a number.

## Which constant a failed check names

| Failing check | Change first | Then |
|---|---|---|
| skill separation under 30 points | `RESIST_BYPASS`, `RESIST_SERVE`, so the styles' levers bite harder than the greedy post | `PROMISE_SHARE` |
| Brier over 0.15 | nothing in the engine: the whip prompt is the lever (`worker/jev.ts` `whipQuestions`) | re-run the golden set first |
| a loss not flippable | `LEDGER_LINES`, because a failure line reached by drift and not by an act is not teachable | `RESIST_DECAY` |
| variance share over 0.2 | the Jev swing cap, then `EARLY_WEIGHT` | `BAR.step` |
| style win spread over 10 points | the instrument prices in the pack's constitution, not the engine | `BAR.start` |
| a style not ending by its own failure | that style's response in the pack, then `WARN_TURNS` | `RESIST_HIT` |

## The extra terms, and what they cost

The cost column is `terms x TERM_USD`, with `TERM_USD` as measured in `docs/experiments.md`. Recompute it
whenever that constant moves.

| Check | Runs | Terms |
|---|---|---|
| Term-1 win rates and skill separation | 6 policies x N seeds x 1 term, into `<date>-spread` | 6N |
| Own failure over several terms | 4 styles x 4 seeds, continued while they win, capped at 3, into `<date>-terms` | up to 48 |
| Forecast calibration, variance share, flippability | from the same logs | 0 |
| Bias audit | 6 pairs x 2 seats and priced acts | 0 |
| Golden set replay | up to 300 recorded prompts | 0 |

`scripts/bots/run.ts` refuses a plan over `MAX_TERMS` or `BUDGET_USD` before it spends anything, and stops
mid-pass when the running total of the meter's own cost passes the budget. `scripts/bots/golden.ts replay`
refuses a file longer than `GOLDEN_N`.

## After a model or a prompt change

1. `bun scripts/bots/golden.ts export docs/golden/<date>.jsonl` right after a pass, while the recordings
   are fresh. Check: the file has up to 300 lines.
2. After the change, `bun scripts/bots/golden.ts replay docs/golden/<date>.jsonl`.
   Check: mean shift under 0.05. Over it, the change is a balance change: run the whole loop again.
3. `bun scripts/bots/bias.ts --scenario <id>`. Check: mean shift under 0.05.
