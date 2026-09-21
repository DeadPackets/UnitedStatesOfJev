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
