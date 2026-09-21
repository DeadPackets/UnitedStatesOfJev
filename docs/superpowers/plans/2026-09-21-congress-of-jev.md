# Congress of Jev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of Congress of Jev at https://unitedstatesofjev.deadpackets.pw.

**Architecture:** One Cloudflare Worker (Hono) forwards game routes to a Durable Object per game. The DO runs the turn loop, calls Jev (OpenRouter System One) and Luna (OpenRouter chat), and persists `Game`. A Vite + React SPA is served as static assets. Pure game math lives in `worker/engine.ts` and is imported by both sides.

**Tech Stack:** Bun, TypeScript, Hono, Cloudflare Workers + Durable Objects, `@cloudflare/vite-plugin`, React 19, Motion, d3-geo + us-atlas, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-congress-of-jev-design.md`

## Global Constraints

- Jev model pinned: `typesafe/jev-1.13`. Luna: `openai/gpt-5.6-luna`.
- Whip count under 20k input tokens; persona under 150 tokens each.
- Luna `max_tokens`: parse 400, amend 900, narrate 160.
- Rate limit 20 req/min/IP; 200 turns per game.
- Ponytail: fewest files, no speculative abstractions, one check per non-trivial unit.
- Comments only for constraints code cannot show.

## Shared types (`worker/engine.ts`, imported by client too)

```ts
type Party = "D" | "R"; type Mode = "term" | "sandbox" | "agenda";
interface Settings { v: 1; party: Party; seats: number; mode: Mode; lobby: boolean; amend: boolean; agenda: number; seed: number }
interface RosterSenator { id: string; seat: string; state: string; party: Party; name: string; bio: string; core_issues: string[]; temperament: string; tell: string; donors: string[]; years_in_office: "new" | "mid" | "long" }
interface Senator extends RosterSenator { situation?: string; memory: string[] }
interface BillDraft { title: string; summary: string; tags: string[] }
interface Bill extends BillDraft { id: number; text: string; whip?: Record<string, number>; filibuster?: number; blocs?: Record<string, number>; constitutional?: number; offers: Record<string, string>; amendments?: BillDraft[]; votes?: Record<string, boolean>; passed?: boolean; struck?: boolean; headline?: { title: string; lede: string } }
interface Game { id: string; code: string; settings: Settings; turn: number; capital: number; approval: Record<string, number>; seated: Senator[]; bills: Bill[]; phase: "draft" | "whip" | "over"; result?: { reelected: boolean; score: number } }
```

Code format `J1-D55TLA-7Q2XK9`: version, party, 2-digit seats, mode letter (T/S/A), flags `L`/`A` or `-`, agenda index 0-9 or `-`, dash, 6 Crockford-base32 chars of a 30-bit seed.

Engine decisions: capital starts 100; lobby costs pork 10, favor 15, threat 20; passed bill +5, failed -5. Filibuster if `filibuster >= 0.5` (needs 60). Struck if `constitutional >= 0.7` (passes, no approval gain, -5 capital). State approval delta on pass: `(mean p of that state's 2 senators - 0.5) * 10`, on fail `-2`, clamped 0..100. Re-election: electoral-vote-weighted approval >= 50.

---

### Task 1: Scaffold and first deploy
**Files:** `package.json`, `wrangler.jsonc`, `vite.config.ts`, `worker/index.ts`, `worker/game.ts` (empty DO), `src/main.tsx`, `index.html`.
- [ ] `bun create cloudflare@latest` with the React + Vite template into a temp dir, copy in, add Hono, DO binding + sqlite migration, ratelimit binding, custom domain route.
- [ ] `GET /api/health` returns `{ok:true}` through the DO (proves the binding).
- [ ] `wrangler secret put OPENROUTER_API_KEY`; `.dev.vars` locally.
- [ ] Check: `curl https://unitedstatesofjev.deadpackets.pw/api/health` → `{"ok":true}`. Commit.

### Task 2: Engine
**Files:** `worker/engine.ts`, `worker/engine.test.ts`, `worker/states.ts` (lean order + electoral votes).
**Produces:** `encodeCode(s: Settings): string`, `decodeCode(code: string): Settings`, `rng(seed: number): () => number` (mulberry32), `seatChamber(roster: RosterSenator[], s: Settings): Senator[]`, `drawVotes(whip, seed, billId): Record<string, boolean>`, `applyVote(game, bill): void` (mutates approval, capital, memory), `expectedYes(whip): number`, `passThreshold(bill): 51 | 60`, `endTerm(game): {reelected, score}`.
- [ ] Tests: code round-trip; same code same chamber; `seats` respected exactly; draws reproduce; approval and capital stay bounded.
- [ ] Check: `bun test` green. Commit.

### Task 3: Jev and Luna clients + smoke
**Files:** `worker/jev.ts`, `worker/luna.ts`, `scripts/smoke.ts`.
**Produces:** `jev(env, state, questions)` → `{answers, usage}`; `senatorQuestion(s: Senator)`; `whipQuestions(seated)`; `gateQuestion()`; `luna<T>(env, schema: ZodType<T>, system, user, maxTokens)`; schemas `BillDraftSchema`, `AmendmentsSchema`, `HeadlineSchema`.
- [ ] Retry once on 429/5xx after 300 ms. Errors throw `UpstreamError`.
- [ ] Check: `bun scripts/smoke.ts` prints whip count ms/tokens/cost under 20k tokens and 1 s; Luna parses one bill. Commit.

### Task 4: Roster
**Files:** `scripts/roster.ts`, `worker/roster.json`.
- [ ] Party per seat code-assigned: 200 senators = both parties for each of 100 seats. Luna fills batches of 10 states, Zod-validated against closed sets; failing batch regenerated.
- [ ] Check: 200 entries, all valid; whip count with 100 seated ≤ 20k tokens (smoke). Commit.

### Task 5: Game DO and routes
**Files:** `worker/game.ts`, `worker/index.ts`, `worker/agendas.json` (10 agendas × 10 pre-parsed `BillDraft`).
- [ ] Routes per spec §7. Turn number in every mutating body; stale → 409. State written after outbound success only.
- [ ] Agenda mode uses pre-parsed drafts: no Luna parse cost.
- [ ] Check: `scripts/turn.sh` against `wrangler dev` plays one full turn by curl. Commit, deploy.

### Task 6: UI, no animation
**Files:** `src/App.tsx`, `src/api.ts`, `src/Setup.tsx`, `src/Chamber.tsx`, `src/Hemicycle.tsx`, `src/Drawer.tsx`, `src/Ledger.tsx`, `src/Over.tsx`, `src/Map.tsx`, `src/styles.css`.
- [ ] Setup (6 controls, live code), Chamber (hemicycle, whip bar, bill pad, ledger, drawer, map toggle), Over screen.
- [ ] Check: full Term game in `bun run dev`. Commit, deploy.

### Task 7: Animation, sound, tour
**Files:** `src/sound.ts`, `src/Tour.tsx`, edits to Chamber/Hemicycle.
- [ ] Five beats per spec §8 with Motion; reduced-motion fallback; Web Audio sounds + gavel sample; 3-step state-driven tour.
- [ ] Check: reduced motion and mute both work in browser. Commit, deploy.

### Task 8: Portraits
**Files:** `scripts/portraits.ts`, `public/portraits/*.webp`.
- [ ] Generate 200 with an image model, posterize duotone, 256 px WebP. SVG fallback in Drawer.
- [ ] Check: total under 4 MB. Commit, deploy.

### Task 9: Daily code, polish, final deploy
- [ ] Daily code = Agenda mode, Divided, seed from date hash; Setup prefills it. Share/copy on Over screen.
- [ ] Check: two browsers, same code, same chamber. Final deploy. Commit, push.
