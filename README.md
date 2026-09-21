# United States of Jev

Congress of Jev: a political game where you are the President and 100 fictional senators are judged by [Jev](https://docs.typesafe.ai), TypeSafe's System One model, in one call. Write a bill, count the votes, lobby a seat, call the roll.

Live: https://unitedstatesofjev.deadpackets.pw

## How it works

Jev cannot write text. It answers typed questions with probabilities. So code proposes options, Jev judges, and Luna (`openai/gpt-5.6-luna`) narrates.

- One whip count is one request: 100 senator personas as Noul questions plus filibuster, bloc, and constitutionality questions. About 21k tokens, 0.5 to 0.8 s, $0.0009.
- Luna parses your prose into a bill, drafts amendments, and writes one headline per vote. Reasoning effort is off; a parse is about 1.4 s.
- Floor votes are seeded Bernoulli draws from each senator's probability. Approval, capital, and grudges are plain arithmetic in `worker/engine.ts`.
- A share code (`J1-D55TPLAX-2N4V7S`) carries every setting and the seed, so two people with the same code get the same chamber.

Experiments that shaped the design are in `docs/experiments.md`. Spec and plan are in `docs/superpowers/`.

## Stack

Cloudflare Worker (Hono) with one Durable Object per game, Vite + React front end served as static assets, Bun for tooling.

```
worker/engine.ts   pure game math, shared with the client
worker/game.ts     GameDO: turn loop and state
worker/jev.ts      Jev client and question builders
worker/luna.ts     Luna client and Zod schemas
worker/roster.json 200 senators, generated once by scripts/roster.ts
worker/agendas.json 10 pre-parsed agendas for Agenda mode
src/               React app
scripts/           one-off generators and live checks
```

## Run

```
bun install
echo "OPENROUTER_API_KEY=sk-or-..." > .dev.vars
bun run dev            # http://localhost:5173, worker runs in workerd
bun test               # engine tests
bun scripts/smoke.ts   # one live whip count, needs OPENROUTER_API_KEY in .env
bun run deploy         # vite build + wrangler deploy
```

The OpenRouter key lives in `wrangler secret put OPENROUTER_API_KEY` for production.
