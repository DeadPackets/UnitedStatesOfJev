# United States of Jev — idea backlog

Researched 2026-09-21 against the Jev 1.13 docs. Core constraint that shapes every
idea: **code proposes options, Jev judges, an LLM (Luna) narrates.** Jev cannot
write text. It returns Choice / Score / Noul answers with probabilities in ~230 ms,
and evaluates 100+ questions per call against one shared state.

## Jev facts

| Fact | Value |
|---|---|
| Output types | Choice (<=255 options), Score (2-10 levels), Noul (yes-probability) |
| Fan-out | 1 state, N questions, parallel |
| Latency | P50 0.23 s, P99 0.52 s |
| Price | $0.042 / 1M input, output free |
| Limits | 64k tokens/request, 32k state, 1,200 req/min |
| Weak at | counting, math, dates, double negatives, large noisy state |
| OpenRouter | Python `openrouter.system_one.create`, JS `alpha.decisions.create` |

Luna (`openai/gpt-5.6-luna`): $0.20 in / $1.20 out per 1M.

## Ideas, ranked

1. **Congress of Jev** (CHOSEN). Player is President, types a bill in plain words.
   Luna compresses it to a summary. 100 Jev senators, each a persona (state, party,
   donors, pet issue), vote in one call. Chamber lights up seat by seat with each
   senator's yes-probability. Filibusters, defections, lobbying are more Jev questions.
2. **The Living Nation.** Ambient Democracy-4-style sim. 5,000 citizen personas.
   Player pulls levers (tax, border, min wage). Monthly tick: Jev scores every
   citizen's approval, protest, migrate, vote intent. Code aggregates. Luna writes
   the month's headline.
3. **Election Night.** Campaign manager. Pick message, state, budget per week. Jev
   is 50 states x 6 demographic blocs. Forecast needle moves live. Ends in animated
   map reveal.
4. **The Feed.** Fake social network. Player posts as a politician. 500 Jev citizens
   react in one call (like, boo, share, unfollow). Trending emerges from aggregation.
   Luna writes 3 reply comments from the loudest personas.
5. **Swipe Republic.** Reigns-style cards. Luna generates a crisis card, Jev scores
   faction reactions (military, press, workers, church) to left/right swipe.
