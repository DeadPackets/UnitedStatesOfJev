# United States of Jev v1, Track D (React port of the desk) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved desk mock (`docs/mocks/v4/feel/desk.html`) as the game's React desk on engine v2, wired to the existing public API through Stage 0's `worker/desk.ts` view, with every other screen restyled to the new tokens, fonts and scale.

**Architecture:** The worker computes one `DeskView` per read (`deskView(pack, game, previous?)` in `worker/desk.ts`): rim rows, chamber factions, resources, the final vote, the priced act's receipt (simulated on a clone of the game, so it lands exactly as shown), the vote's calling order, and the review of what the last request moved. React draws the mock's DOM (same classes, ids and data attributes) from that view. The mock's moments (printing, Sign, count, verdict, couriers) are ported as plain DOM and canvas code that animates what React drew, by ref, and hands the new view back to React only when a moment ends, so nothing re-renders while anything moves.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7 (+ Cloudflare plugin), `motion` 13 (vanilla `animate`/`stagger`), native CSS nesting and `rem` from one root scale, bun:test, Cloudflare Workers + Durable Objects + local D1, Playwright (via `uv run --with playwright`) driving real Chrome for the end-to-end check.

**Spec:** `docs/superpowers/specs/2026-09-22-the-ruler-design.md` (R24 to R36; R36 is the glance card). The approved mock is the design source of truth: `docs/mocks/v4/feel/desk.html` (untracked; Task 1 commits a copy as `docs/design/mock/desk.html`). Stage 0 contracts: `docs/superpowers/plans/2026-09-24-v1-stage-0-contracts.md`, section "Interfaces produced", as amended by the built code on branch `v1` (see Global Constraints).

**Order:** Task 1 and Task 2 in parallel. Then Task 3. Then Task 4 and Task 5 in parallel. Then Task 6. Six tasks.

| Task | What | Needs | Parallel with |
|---|---|---|---|
| 1 | Foundations: reference copy, `motion`, root scale, tokens applier, icon sprite, motion toolkit, desk CSS, code-split | branch `v1` | 2 |
| 2 | `deskView` in the worker, view wiring, `src/api.ts` | branch `v1` | 1 |
| 3 | The desk up to Sign: shell, rims, chamber, file, sheet, event card, composer, receipt printing, Negotiate; old desk deleted | 1, 2 | none |
| 4 | The moments from Sign on: shockwave, count, verdict, couriers, review, End turn, card answers, Withdraw, failure recovery | 3 | 5 |
| 5 | The other screens restyled (tokens, fonts, rem, no logos or stamps) | 3 | 4 |
| 6 | End-to-end in real Chrome: one Biden term and one Westeros act, screenshots, fps log, budgets | 4, 5 | none |

## Global Constraints

Copied from the v1 build brief (lead, 2026-09-24), the lines that bind Track D; every task's requirements include this section.

- The UI is docs/mocks/v4/feel/desk.html, approved "absolutely perfect, ship it". Port it exactly: layout, tokens, motion values, copy, the flow (receipt pricing with no threads, Sign shockwave, seat-by-seat count, verdict with the court dimmed to 12%, P1-B couriers, review that stays until "Back to the desk"), rims (P1-B rows, tint wash, fixed height), glance card (R36), resources side sheet (stat cards), ballot chip with tooltip, and screen scaling (every size = px x --k, k = min(w/1440, h/900) clamped 1 to 1.8; in React use rem from one root scale, not per-component math).
- No logos, stamps or crests anywhere (world level). Faction emblems ship in placement A: the emblem replaces the rim-row line icon and shows in the card's icon disc; the line icon is the fallback for any missing, failed or filtered emblem.
- Add the `motion` npm package (owner approved). No other new runtime dependency without asking.
- Scope: the desk is ported exactly; the other screens (landing, build wait, briefing, end screen, daily, archive) get the new tokens, fonts, scaling and no logos, but no redesign (redesign at CP4).
- D and E run in parallel after Stage 0. Old stored packs must keep loading: the desk shows them through a fallback.
- No pictures: image generation is removed (commit 866a2e4). Nothing may reintroduce it.
- Own party is one row: when the ruler's party sits in the chamber, ownGroup is that chamber party; pledges may target it; no duplicate holder.
- Code standard: whole-word names, a short module header saying what the file owns, comments only for the why, no dense one-liners. Match the surrounding style. Biome formats on commit.
- Performance: 60 fps floor on a normal laptop during every desk moment; no React re-renders during animation (animate refs/Motion, not state); code-split by screen; JS under 200 KB gzipped; no long task over 50 ms; load only the world's 2 to 3 fonts.
- Tests (owner's CLAUDE.md): behaviour at the public boundary, parametrised, extend existing test files; no tests of getters or mock calls; test code no longer than the code under test except parsers, money, security. Prefer an end-to-end check that leaves a repeatable artifact. Gates per commit: `bun test worker src scripts` green, `bunx tsc -b` clean, `bunx vite build` succeeds.
- Testing of the UI: Chrome spot checks and the owner tests; no heavy Playwright matrices.
- Never commit or print the OpenRouter key (.env, .dev.vars). The repo is PUBLIC: nothing from .superpowers/ (private planning) goes into committed files.

Track D adds these:

- **Base branch is `v1`** (Stage 0, built and reviewed; worktree `/Users/deadpackets/workspace/UnitedStatesOfJev/.worktrees/v1`). Where the Stage 0 plan text and the code on `v1` differ, the code wins. Two such differences bind this track: `fitContrast(foreground, backgrounds, minimum?)` returns `string | null` (null: no colour of that hue reads, or an input is not six-digit hex; the caller keeps its default colour); and an emblem's shapes have no coordinate bounds, so every emblem `<svg>` sets its `viewBox` and `overflow="hidden"` so a shape never draws outside its disc.
- **File ownership.** Track D may edit `src/**`, `public/icons.svg`, `worker/desk.ts`, `worker/desk.test.ts`, `worker/game.ts` (the view wiring only), `worker/game.test.ts` (new tests only), `worker/index.ts` (routes only; none are expected), `package.json`, `bun.lock`, `vite.config.ts`, `index.html`, `scripts/desk-e2e.py`, `docs/design/**`. It may NOT edit `worker/gen/*`, `worker/build.ts`, `worker/pack.ts`, `worker/engine.ts`, `worker/acts.ts`, `worker/luna.ts`, `worker/emblem.ts`, `worker/tokens.ts`; a needed change there goes to "Cross-track requests" at the end of this plan.
- **Client imports from `worker/`** are `import type` only, except `worker/tokens.ts` and `worker/emblem.ts` (value imports allowed: the desk needs `fitContrast`, `DEFAULT_THEME_TOKENS`, `checkEmblem`, `emblemShapes`). Never a value import of `engine.ts`, `acts.ts` or `pack.ts` into `src/` (it would pull the engine into the bundle).
- **No markup from data.** No `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `dangerouslySetInnerHTML` anywhere in `src/`. Every text that came from the server (names, titles, reasons, causes, vocabulary) reaches the page through JSX children or `textContent`. The gate: `grep -rnE "innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML" src` prints nothing.
- **Moment rule.** During a desk moment React state changes only at the moment's start and at its end. Moments write the DOM through the paint helpers (`src/desk/paint.ts`, `src/desk/flow.ts`), which React's layout effects also call with the same arguments, so React and a moment always agree on the finished state. Numbers and status text that a moment rolls are drawn with `<Live>` (textContent owned by the element), never as a React text child.
- **Where the mock lives.** `docs/mocks/v4` is not in git. Task 1 commits `docs/design/mock/desk.html` and `docs/design/eras/{biden-2021,westeros}.json`; every later task reads the mock from `docs/design/mock/desk.html`. The mock's reference screenshots (14 MB) stay uncommitted at `/Users/deadpackets/workspace/UnitedStatesOfJev/docs/mocks/v4/feel/desk-shots/`.
- **Local dev in a worktree** (for every Chrome check):

```bash
cp /Users/deadpackets/workspace/UnitedStatesOfJev/.dev.vars .dev.vars   # the key; never print or commit it
bun install
bun scripts/era-fixture.ts /Users/deadpackets/workspace/UnitedStatesOfJev/docs/mocks/v4
yes | bunx wrangler d1 migrations apply usoj --local && bunx wrangler d1 execute usoj --local --file .wrangler/fixtures.sql
git status --short   # the fixture regeneration must leave worker/fixtures unchanged
bun run dev          # http://localhost:5173
```

  Seat a fixture game from the page's DevTools console, then reload:

```js
fetch("/api/games",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({scenario:"biden-2021",faction:"dem",promises:[0,1,2]})}).then(r=>r.json()).then(g=>{localStorage.setItem("usoj:game",g.id);location.reload()})
```

  (`westeros` with faction `baratheon` for the other world.)
- **Commit messages** follow the repo: one plain sentence, no `feat:` prefix.

## Lead rulings (binding; they override the Decisions table and every task below where they differ)

1. **Keep every engine v2 mechanic reachable. Nothing the engine offers is dropped from the UI.** Build what the mock never drew from the mock's own atoms (the glance-card shell, receipt buttons, chamber highlights), as Decision 4 already does.
2. **Seats are clickable.** A hemicycle seat opens that member's glance card (R36: members get the same card; draw the member's glance when present, else name, faction, seat and years in the same shell). The member card carries the member actions the engine has: Lobby (the `lobby` route) and Do a favour (the favour act priced with that member).
3. **A favour never ends in a 400.** When the clerk prices a favour and no seat is chosen, the desk asks the player to pick one: the chamber dims every seat but the eligible ones, a one-line prompt says "Pick the member this favour is for", and a click re-prices the act with that member. Cancel returns to the composer.
4. **Amendments stay.** On a priced law whose count is short of the need, the receipt shows "Amend" (the existing `amend` route: 3 clerk calls, once per bill). The drafts show as small receipt stubs; adopting one re-prices the law. The button is hidden once a bill has been amended.
5. **Dropped and accepted:** the tour (onboarding returns in pre-production), the escalation and warning popups (the rim warn state and the review carry that information), the wire strip and the side-panel tabs.
6. **Tie beat:** none, as in Decision 3, until the engine has a tie-breaker (logged for the owner).

## Decisions (the lead should confirm; each is reversible)

| # | Decision | Why |
|---|---|---|
| 1 | **The receipt follows engine v2, not the mock's numbers.** Support moves land at signing for every verb (`commit` runs `touch`), so the third stub reads "Support, when you sign"; a law adds "If it passes" and "If it fails", computed by running the real `applyVote` on a clone with the hesitant seats forced one way; per-turn rates show as "Every turn while it stands" lines. The whole receipt is computed by running `commit` on a clone of the game, so it lands exactly as shown (tested). | The owner's rule: "the price tag lands at signing exactly as shown". Simulating the engine keeps one source of truth; no engine constant is copied. |
| 2 | **A non-law act has no count and no verdict word.** Sign plays the shockwave, then every change travels, then the review. Westeros's act is force, which the engine does not vote on, so the mock's Westeros seat count cannot be reproduced. | Engine truth; showing a count the engine never took would lie. |
| 3 | **No tie beat.** `Count.tie` and `Verdict.tieBrokenBy` are always null: the engine has no tie-breaker (Biden's Vice President). The mock's tie code is not ported. | Ponytail: dead code otherwise. Cross-track request 3 if wanted. |
| 4 | **What the mock never drew is built from the mock's own atoms, not designed:** an event card in the glance-card shell with its stances as buttons and "Decline it"; Negotiate terms as small buttons in the chamber legend after pricing; an "In force" block at the foot of the resources sheet with Withdraw; three text controls at the right of the top bar (Dark/Light, Sound, Leave); the clerk's time left in the turn line ("clerk 4 of 6", the port requirement's visible budget); the next-turn `pending` line under the receipt placeholder; a "Call the vote" line when a signed law's vote failed. Dropped from the old desk: the tour, the escalation notice popup, the warning popup (the rim's warn state carries it), the member drawer and lobby, amendments, the wire strip, the rail tabs. | The brief says port the desk exactly; these are the minimum the game needs to stay playable. The owner redesigns at CP4. |
| 5 | **Resource history is `[value]`** until the engine records closing values per turn (cross-track request 1); the trend shows one bar and "1 turn ±0". | `deskView` cannot recover past turns from the game state. |
| 6 | **Root scale is pure CSS:** `html { font-size: clamp(16px, min(100vw / 90, 100dvh / 56.25), 28.8px) }` (1rem = 16px x k). Every `calc(Npx*var(--k))` in the mock becomes `N/16 rem`; the old screens' stylesheet is converted px to rem the same way. Canvas code reads k from the root font size. | One root scale, no resize listener, no JS before first paint. |
| 7 | **The desk CSS is scoped under `.desk` with native nesting** (esbuild lowers it for the build target); old-screen selectors that collide (`.stage`, `.head`, `.sub`, `.bar`, `.led`, `.top`, `.big`, `.red`, `.vs`) get `:not(.desk *)`. | Both stylesheets stay loaded after the first desk visit; unscoped, each would restyle the other. |
| 8 | **Three fonts only:** the receipt head uses the world's mono (`var(--mono)`) instead of the mock's hard-coded IBM Plex Mono; the old stylesheet's Big Shoulders/Public Sans import is removed. The default world (Biden tokens) is Libre Caslon Display, Public Sans, IBM Plex Mono. | The 2 to 3 font budget. |
| 9 | **The instrument chip** shows the verb the clerk picked once priced; before, it shows `rules.settleVerb`'s guess as you type. The verb is never sent: the clerk decides. A favour needs a seat and the new desk has no seat picker, so a favour the clerk picks returns the server's 400 as a toast. | The mock's chip is static; the game needs something truthful there. |
| 10 | **The icon sprite is a static file** (`public/icons.svg`, the mock's symbols minus the two stamp glyphs `o-seal`, `o-star`), used with `<use href="/icons.svg#id">`. | Zero JS, cached once, same markup as the mock. |
| 11 | **A rim emblem draws at 28 px** in the 36 px disc (the legibility gate's size); in the file's 48 px disc it draws at 36 px. | Placement A at the size the guard checked. |
| 12 | **The courier token shapes the courier's head** (dot and coin: the mock's circle; shard: a triangle; fleck: a paper fleck). Bursts keep the mock's shapes. | The Biden default (`dot`) is then the approved look exactly. |

## Review Focus

1. **A card answered, or a veto group moved, after the act was priced:** the receipt must follow the game as it is now (who refuses, what moves), not as it was at price time. `deskView` recomputes the receipt from `game.tag` on every read with fresh veto rows. Pinned in Task 2 ("the blocked veto follows the veto group's support after pricing").
2. **A pack stored before R36** (no theme tokens, no glance cards, no icons, no emblems, no tints): the desk loads with the default theme, a line icon on every row and a tint on every row. Pinned in Task 2 (the mini pack test in `worker/game.test.ts`).
3. **A stored emblem that no longer passes `checkEmblem`, or a shape drawn far outside its box:** the row shows its line icon; a passing emblem is clipped to its own box. Pinned in Task 2 ("an emblem that fails the check draws the line icon") and in Task 3's `Mark` (viewBox plus `overflow="hidden"`).
4. **Server text carrying markup** (a group, an act title or a cause containing `<img onerror=...>`): shown as text, never parsed. Pinned by the `innerHTML` grep gate in Tasks 3, 4 and 6.
5. **A request that fails mid-moment** (the vote returns 503 after the act was signed; the network drops during End turn): the moment stops, the toast says why, the desk reloads the server's game, and a signed law whose vote failed shows "Call the vote". Pinned in Task 4 (the recovery path) and Task 6 (a forced 503 on one vote in real Chrome).

## Files

| Path | Task | Owns |
|---|---|---|
| `docs/design/mock/desk.html`, `docs/design/eras/{biden-2021,westeros}.json` | 1 | The committed reference copy of the approved mock |
| `public/icons.svg` | 1 | The line-icon sprite |
| `src/base.css` | 1 | Root scale, fixed colour tokens, paper and hatch, shared atoms (`.btn`, `.kicker`, `.num`, `.ic`, `.sf`) |
| `src/desk/desk.css` | 1 (3 appends) | The mock's desk CSS in rem, scoped under `.desk` |
| `src/desk/fx.ts` | 1 | Motion toolkit: canvas layer, couriers, bursts, rings, shockwave, shake, rolls, springs, fps meter, sound hooks |
| `src/desk/Icon.tsx` | 1 | `Icon` and the icon maps (line, resource, verb) |
| `src/theme.tsx` | 1 (5 prunes) | `applyTokens`, `resetTokens`, `themeMode`, `setThemeMode` |
| `src/main.tsx`, `src/App.tsx` | 1, 3 | Boot (theme mode, reduced motion, default tokens); lazy screens; the review hold |
| `worker/desk.ts` | 2 | `deskView` |
| `worker/desk.test.ts` | 2 | `deskView` on the two fixtures |
| `worker/game.ts`, `worker/game.test.ts` | 2 | `desk` on every view; the receipt-lands-as-shown test |
| `src/api.ts` | 2, 3 | `GameView.desk`, `negotiate`, `decline`; prune the old desk's calls |
| `src/Desk.tsx` | 3, 4 | The desk shell and its phases |
| `src/desk/{Live,Emblem,Rim,Chamber,Receipt,GroupFile,Sheet,EventCard,Composer}.tsx`, `src/desk/paint.ts` | 3 | The desk's parts and the shared paint helpers |
| `src/desk/flow.ts`, `src/desk/Review.tsx` | 4 | The moments from Sign on; the review |
| `src/styles.css`, `src/{Landing,Match,Build,Seat,Midterm,Test,Won,Over}.tsx` | 5 | The other screens |
| `scripts/desk-e2e.py`, `docs/design/e2e/.gitignore` | 6 | The end-to-end check and its artifact folder |

---

### Task 1: Foundations

**Files:**
- Create: `docs/design/mock/desk.html`, `docs/design/eras/biden-2021.json`, `docs/design/eras/westeros.json` (copies)
- Create: `public/icons.svg`, `src/base.css`, `src/desk/desk.css`, `src/desk/fx.ts`, `src/desk/Icon.tsx`
- Modify: `src/theme.tsx` (add only), `src/main.tsx`, `src/App.tsx`, `src/styles.css` (de-conflict only), `index.html`, `package.json`, `bun.lock`

**Interfaces:**
- Consumes: `worker/tokens.ts` (`ThemeTokens`, `Palette`, `Tint`, `DEFAULT_THEME_TOKENS`, `fitContrast(): string | null`), `worker/pack.ts` types `LineIcon`, `ResourceIcon`, `Verb`.
- Produces (later tasks rely on these exact names):
  - `src/theme.tsx`: `applyTokens(tokens: ThemeTokens, tints?: Tint[]): void`, `resetTokens(): void`, `themeMode(): "light" | "dark"`, `setThemeMode(mode: "light" | "dark"): void`, `mix(from: string, to: string, share: number): string`.
  - `src/desk/Icon.tsx`: `Icon({ id, className? })`, `LINE_ICON: Record<LineIcon, string>`, `RESOURCE_ICON: Record<ResourceIcon, string>`, `VERB_ICON: Record<Verb, string>`.
  - `src/desk/fx.ts`: `Stale`, `beginMoment()`, `cancelMoments()`, `reduced()`, `pace()`, `scale()`, `token(name)`, `signed(delta)`, `centre(el)`, `type Point`, `sleep(ms)`, `play(target, keyframes, options?)`, `roll(el, from, to, ms?)`, `shake(amplitude?, ms?, direction?, el?)`, `mountLayer(canvas): () => void`, `addToLayer(item)`, `burst(x, y, options)`, `fly(courier): Promise<void>`, `ring(x, y, colour, radius?, width?, duration?)`, `wave(originX, originY, options): Promise<void>`, `spring(stiffness?, damping?): { easing: string; duration: number }`, `meter(name, ms)`, `fpsStart(name)`, `fpsStop()`, `sfx(name, pitch?)`.
  - CSS: every class, id and data attribute of the mock under `.desk`; the atoms in `src/base.css`; custom properties `--gl`/`--gd` (a group's tint, light and dark) resolve to `--gc`, `--pl`/`--pd` resolve to `--pc`.

- [ ] **Step 1: Commit the reference copy of the mock**

```bash
mkdir -p docs/design/mock docs/design/eras
cp /Users/deadpackets/workspace/UnitedStatesOfJev/docs/mocks/v4/feel/desk.html docs/design/mock/desk.html
cp /Users/deadpackets/workspace/UnitedStatesOfJev/docs/mocks/v4/eras/biden-2021.json docs/design/eras/
cp /Users/deadpackets/workspace/UnitedStatesOfJev/docs/mocks/v4/eras/westeros.json docs/design/eras/
grep -c "OPENROUTER\|sk-or-" docs/design/mock/desk.html docs/design/eras/*.json   # expect 0 for each
```

The mock fetches `../eras/<world>.json`, so `docs/design/mock/desk.html` served from `docs/design` still runs (`python3 -m http.server -d docs/design 8741`, then `http://localhost:8741/mock/desk.html`).

- [ ] **Step 2: Add `motion` at the mock's version**

```bash
bun add motion@13.4.2
```

Expected: `package.json` gains `"motion": "13.4.2"` under dependencies; `bun.lock` changes.

- [ ] **Step 3: Extract the icon sprite and convert the mock's CSS**

Run this once from the repo root (a throwaway script in the scratchpad, not committed):

```ts
// extract.ts: run with `bun extract.ts`
const html = await Bun.file("docs/design/mock/desk.html").text();
const defs = html.match(/<defs>([\s\S]*?)<\/defs>/)![1]
  .replace(/<symbol id="o-seal"[\s\S]*?<\/symbol>/, "")
  .replace(/<symbol id="o-star"[\s\S]*?<\/symbol>/, "");
await Bun.write("public/icons.svg", `<svg xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs></svg>\n`);
const rem = (css: string) =>
  css.replace(/calc\((-?\d*\.?\d+)px\*var\(--k\)\)/g, (_, px) => `${+(Number(px) / 16).toFixed(4)}rem`);
const blocks = [...html.matchAll(/css\.textContent=`([\s\S]*?)`;/g)].map((match) => match[1]);
const style = html.match(/<style>([\s\S]*?)<\/style>/)![1];
await Bun.write("desk-raw.css", [blocks[0], blocks[1], style].map(rem).join("\n/* ---------- */\n"));
```

Expected: `public/icons.svg` holds 37 `<symbol>`s (the mock's 39 minus the two stamps); `desk-raw.css` holds three sections: the core look (mock lines 215 to 279), the flow (434 to 461), the receipt, rims, file and sheet (467 to 574), with no `var(--k)` left inside a `calc(Npx*...)`.

- [ ] **Step 4: Write `src/base.css`** (the shared part of the mock, in rem)

```css
/* The look every screen shares: the root scale, the fixed colour tokens, the paper and its hatch, and the atoms
   (buttons, kickers, icons, surfaces). applyTokens (src/theme.tsx) writes each world's palette, fonts, radius and
   texture scale over these, and fits the fixed colours to that palette. Values from docs/design/mock/desk.html. */
:root {
  /* The one root scale: 1rem = 16px x k, k = min(width / 1440, height / 900) clamped to 1..1.8 */
  font-size: clamp(16px, min(100vw / 90, 100dvh / 56.25), 28.8px);
  --tre: #227f53;
  --aut: #623e96;
  --che: #8a6d24;
  --danger: #bb0916;
  --up: #1d7a4a;
  --dn: #c2410c;
  --on-up: #fff;
  --on-dn: #fff;
  --on-danger: #fff;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --rev: 0px;
  color-scheme: light;
}
:root[data-theme="dark"] {
  --tre: #6dc393;
  --aut: #a37fde;
  --che: #f1cc7e;
  --danger: #ff7b72;
  --up: #6dc393;
  --dn: #ff9d5c;
  --on-up: #0b1a12;
  --on-dn: #1d0d02;
  --on-danger: #1a0508;
  color-scheme: dark;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
html,
body {
  margin: 0;
  min-height: 100%;
}
body {
  font: 400 1.0625rem/1.45 var(--ui);
  background: var(--paper);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
:root:has(.dk) body {
  height: 100%;
  overflow: hidden;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.5;
  background:
    repeating-linear-gradient(45deg, color-mix(in srgb, var(--ink) 6%, transparent) 0 0.0625rem, transparent 0.0625rem calc(0.4375rem * var(--tex))),
    repeating-linear-gradient(-45deg, color-mix(in srgb, var(--ink) 4%, transparent) 0 0.0625rem, transparent 0.0625rem calc(0.4375rem * var(--tex)));
  -webkit-mask: radial-gradient(120% 90% at 50% 50%, transparent 45%, #000 100%);
  mask: radial-gradient(120% 90% at 50% 50%, transparent 45%, #000 100%);
}
:root[data-texture="none"] body::before {
  display: none;
}
button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}
:focus-visible {
  outline: 0.125rem solid var(--accent);
  outline-offset: 0.1875rem;
}
.num {
  font-variant-numeric: lining-nums tabular-nums;
}
.ic {
  width: 1.125rem;
  height: 1.125rem;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.kicker {
  font: 700 0.875rem/1.2 var(--ui);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-2);
}
.sf {
  background-color: color-mix(in srgb, var(--card) 94%, transparent);
  border-radius: var(--r);
  box-shadow:
    0 0 0 0.0625rem var(--rule),
    inset 0 0 0 0.1875rem var(--card),
    inset 0 0 0 0.25rem color-mix(in srgb, var(--rule) 70%, transparent),
    0 1.125rem 2.5rem -34px var(--sh);
}
:root[data-material="linen"] .sf {
  background-image:
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--ink) 3%, transparent) 0 0.0625rem, transparent 0.0625rem 0.1875rem),
    repeating-linear-gradient(90deg, color-mix(in srgb, var(--ink) 3%, transparent) 0 0.0625rem, transparent 0.0625rem 0.1875rem);
}
:root[data-material="parchment"] .sf {
  background-image: radial-gradient(130% 150% at 50% 42%, transparent 58%, color-mix(in srgb, var(--navy) 9%, transparent));
}
.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0 1.125rem;
  border: 0.09375rem solid var(--ink);
  border-radius: calc(var(--r) + 0.125rem);
  background: var(--card);
  color: var(--ink);
  font: 700 0.9375rem/1 var(--ui);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0.1875rem 0.1875rem 0 var(--ink);
  transition: transform 0.16s var(--ease), box-shadow 0.16s var(--ease), opacity 0.25s;
  white-space: nowrap;
}
.btn:hover:not(:disabled) {
  transform: translate(-1px, -1px);
  box-shadow: 0.25rem 0.25rem 0 var(--ink);
}
.btn:active:not(:disabled) {
  transform: translate(0.125rem, 0.125rem) scale(0.97);
  box-shadow: 0 0 0 var(--ink);
}
.btn.accent {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
:root[data-theme="dark"] .btn.accent {
  color: #12070a;
}
.btn.ink {
  background: var(--ink);
  color: var(--paper);
}
.btn:disabled {
  opacity: 0.4;
  box-shadow: none;
  cursor: default;
}
.btn .ic {
  width: 1rem;
  height: 1rem;
}
```

- [ ] **Step 5: Assemble `src/desk/desk.css` from `desk-raw.css`**

Start the file with this header, then paste every rule of `desk-raw.css` inside one `.desk { ... }` block, applying the edits below in order. Nesting is native CSS; esbuild lowers it for the build.

```css
/* The desk's own look, ported from docs/design/mock/desk.html with every calc(Npx*var(--k)) turned into N/16 rem.
   Scoped under .desk (the wrapper Desk.tsx renders) so no old-screen rule and no desk rule reach each other. */
```

1. Leave out (now in `src/base.css`): both `:root{--tre...}` token lines, `*,*::before,*::after`, `html,body`, `body{...}`, `body::before`, `button{...}`, `:focus-visible`, `.num`, `.ic`, `.kicker`, `.sf`, both `body[data-material=...] .sf`, all four `.btn` lines, and `:root{--on-danger:#fff}:root[data-theme=dark]{--on-danger:#1a0508}`.
2. Delete: every `#rev` rule, `.crest{...}`, `.vpt{...}` (unused).
3. In `.rc .head`, replace `"IBM Plex Mono",monospace` with `var(--mono)` (Decision 8).
4. Rewrite, inside the wrapper: `:root[data-theme=dark] .paper` to `:root[data-theme=dark] & .paper`; `:root[data-theme=dark] .sweep` to `:root[data-theme=dark] & .sweep`; `.rm .hm,.rm .hm .bar>i:first-child{...}` to `:root.rm & .hm, :root.rm & .hm .bar>i:first-child{...}`; `.rm .hm.warn .hi::after` to `:root.rm & .hm.warn .hi::after`.
5. Move `@keyframes fl` and `@keyframes warnp` out of the wrapper, after it. Keep every `@media` block nested where it is.
6. Append inside the wrapper, after every mock rule (the group colours, which the mock set by id, are now the row's own tint):

```css
  /* a group's tint: the row, file and seat carry both modes, the theme picks one */
  .hm,
  .fcard {
    --gc: var(--gl, var(--ink-2));
  }
  :root[data-theme="dark"] & .hm,
  :root[data-theme="dark"] & .fcard {
    --gc: var(--gd, var(--ink-2));
  }
  .seat,
  .gleg i {
    --pc: var(--pl);
  }
  :root[data-theme="dark"] & .seat,
  :root[data-theme="dark"] & .gleg i {
    --pc: var(--pd);
  }
  /* placement A: an emblem in the rim disc at the 28 px gate's size, 36 px in the file's disc; clipped to its box */
  .em {
    width: 1.75rem;
    height: 1.75rem;
    flex: none;
    overflow: hidden;
  }
  .fc-i .em {
    width: 2.25rem;
    height: 2.25rem;
  }
```

Check: `grep -c "var(--k)" src/desk/desk.css` prints `0`; `grep -c "#rev" src/desk/desk.css` prints `0`.

- [ ] **Step 6: Write `src/desk/Icon.tsx`**

```tsx
// The desk's line icons: one static sprite (public/icons.svg, the approved mock's symbols), drawn by id.
import type { LineIcon, ResourceIcon, Verb } from "../../worker/pack";

export const LINE_ICON: Record<LineIcon, string> = {
  chamber: "i-cap",
  court: "i-court",
  army: "i-army",
  clergy: "i-clergy",
  street: "i-pop",
  party: "i-flag",
  patrons: "i-coins",
  press: "i-news",
  foreign: "i-globe",
  market: "i-chart",
  crown: "i-crown",
  council: "i-council",
};

// The mock drew six resource icons; the other nine take the nearest symbol the sprite has.
export const RESOURCE_ICON: Record<ResourceIcon, string> = {
  bank: "i-tre",
  gavel: "i-aut",
  note: "i-che",
  coins: "i-coins",
  crown: "i-crown",
  crate: "i-crate",
  people: "i-pop",
  scroll: "i-scroll",
  flag: "i-flag",
  sword: "i-army",
  faith: "i-clergy",
  medal: "i-star",
  drop: "i-tre",
  grain: "i-tre",
  house: "i-tre",
};

export const VERB_ICON: Record<Verb, string> = {
  law: "i-cap",
  decree: "i-scroll",
  appoint: "i-council",
  spend: "i-coins",
  proclaim: "i-news",
  favour: "i-hand",
  force: "i-army",
};

export function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ? `ic ${className}` : "ic"} aria-hidden="true">
      <use href={`/icons.svg#${id}`} />
    </svg>
  );
}
```

- [ ] **Step 7: Write `src/desk/fx.ts`** (the mock's P toolkit with whole-word names)

```ts
// The desk's motion toolkit, ported from the approved mock (docs/design/mock/desk.html): one canvas layer for couriers,
// rings, bursts and the shockwave; number rolls; the desk shake; springs as native easing; the frame meter; sound hooks.
// Everything here moves the DOM or the canvas directly, never React state, so a moment never re-renders.
import { animate, type AnimationOptions, type DOMKeyframesDefinition } from "motion";
import { sound } from "../sound";

export class Stale extends Error {}
let run = 0;
/** Starts a moment. Every sleep and play of an older moment rejects with Stale from here on. */
export const beginMoment = () => ++run;
export const cancelMoments = () => {
  run++;
  layer.items = [];
};

export const reduced = () => document.documentElement.classList.contains("rm");
const MOTION_FACTOR: Record<string, number> = { stately: 1.18, brisk: 0.9, mechanical: 1, fluid: 1 };
/** The world's motion personality: sleeps and couriers run this much longer or shorter. */
export const pace = () => MOTION_FACTOR[document.documentElement.dataset.motion ?? ""] ?? 1;
/** The root scale k (1 to 1.8): 1rem is 16px when k is 1. */
export const scale = () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
export const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const signed = (delta: number) => (delta > 0 ? "+" : delta < 0 ? "−" : "") + Math.abs(delta);
export type Point = { x: number; y: number };
export const centre = (el: Element) => {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, box };
};

export function sleep(ms: number): Promise<void> {
  const mine = run;
  return new Promise((resolve, reject) =>
    setTimeout(
      () => (mine === run ? resolve() : reject(new Stale())),
      ms * (reduced() ? 0.4 : pace()),
    ),
  );
}

/** Motion's animate; under reduced motion a short fade with no delay unless `keep`. Rejects with Stale when cancelled. */
export async function play(
  target: Element | Element[],
  keyframes: DOMKeyframesDefinition,
  options: AnimationOptions & { keep?: boolean } = {},
): Promise<void> {
  const mine = run;
  const { keep, ...rest } = options;
  const settings =
    reduced() && !keep
      ? { ...rest, duration: Math.min(Number(rest.duration ?? 0.3), 0.18), type: undefined, delay: 0 }
      : rest;
  await animate(target, keyframes, settings);
  if (mine !== run) throw new Stale();
}

/** Counts a number from one value to another on screen, easing out. */
export function roll(el: Element, from: number, to: number, ms = 600): Promise<void> {
  return new Promise((resolve) => {
    if (reduced() || ms <= 0 || from === to) {
      el.textContent = String(to);
      return resolve();
    }
    const start = performance.now();
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / ms);
      el.textContent = String(Math.round(from + (to - from) * (1 - (1 - progress) ** 3)));
      progress < 1 ? requestAnimationFrame(frame) : resolve();
    };
    requestAnimationFrame(frame);
  });
}

/** Decaying noise on the whole desk (Vlambeer), never on the numbers alone. */
export function shake(amplitude = 8, ms = 380, direction: [number, number] | null = null, el?: HTMLElement) {
  const target = el ?? document.getElementById("dk");
  if (reduced() || !target) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const progress = (now - start) / ms;
      if (progress >= 1) {
        target.style.transform = "";
        return resolve();
      }
      const size = amplitude * (1 - progress) * (1 - progress);
      const x = direction ? direction[0] * size * Math.cos(progress * 28) : (Math.random() * 2 - 1) * size;
      const y = direction ? direction[1] * size * Math.cos(progress * 28) : (Math.random() * 2 - 1) * size;
      target.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/* ---------- the canvas layer: items step and draw until they return false ---------- */
export type LayerItem = {
  step(seconds: number, context: CanvasRenderingContext2D, now: number): boolean | void;
};
const layer = {
  items: [] as LayerItem[],
  running: false,
  last: 0,
  ratio: 1,
  canvas: null as HTMLCanvasElement | null,
  context: null as CanvasRenderingContext2D | null,
};
function sizeLayer() {
  if (!layer.canvas) return;
  layer.ratio = Math.min(2, devicePixelRatio || 1);
  layer.canvas.width = innerWidth * layer.ratio;
  layer.canvas.height = innerHeight * layer.ratio;
}
/** Binds the desk's canvas; returns the unbinding. */
export function mountLayer(canvas: HTMLCanvasElement): () => void {
  layer.canvas = canvas;
  layer.context = canvas.getContext("2d");
  sizeLayer();
  addEventListener("resize", sizeLayer);
  return () => {
    removeEventListener("resize", sizeLayer);
    layer.items = [];
    layer.canvas = null;
    layer.context = null;
  };
}
function tick(now: number) {
  const context = layer.context;
  if (!context) {
    layer.running = false;
    return;
  }
  const seconds = Math.min(0.05, (now - layer.last) / 1000);
  layer.last = now;
  context.setTransform(layer.ratio, 0, 0, layer.ratio, 0, 0);
  context.clearRect(0, 0, innerWidth, innerHeight);
  layer.items = layer.items.filter((item) => item.step(seconds, context, now) !== false);
  if (layer.items.length) requestAnimationFrame(tick);
  else {
    layer.running = false;
    context.clearRect(0, 0, innerWidth, innerHeight);
  }
}
export function addToLayer(item: LayerItem, evenWhenReduced = false) {
  if (reduced() && !evenWhenReduced) return;
  layer.items.push(item);
  if (layer.running) return;
  layer.running = true;
  layer.last = performance.now();
  requestAnimationFrame(tick);
}

/* ---------- particles: dots, shards and paper flecks, with gravity and drag per burst ---------- */
export type BurstOptions = {
  colours: string[];
  count?: number;
  direction?: number;
  spread?: number;
  speed?: number;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  shape?: "dot" | "shard" | "fleck";
  shrink?: boolean;
};
export function burst(x: number, y: number, options: BurstOptions) {
  const { colours, count = 24, direction = 0, spread = Math.PI * 2, speed = 260, life = 0.9 } = options;
  const { size = 4, gravity = 600, drag = 0.12, shape = "dot", shrink = false } = options;
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = direction + spread * (Math.random() - 0.5);
    const velocity = speed * (0.35 + Math.random() * 0.9);
    return {
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: life * (0.6 + Math.random() * 0.6),
      age: 0,
      size: size * (0.5 + Math.random()),
      colour: colours[i % colours.length],
      turn: Math.random() * 6,
      spin: (Math.random() - 0.5) * 12,
    };
  });
  addToLayer({
    step(seconds, context) {
      let alive = 0;
      for (const particle of particles) {
        particle.age += seconds;
        if (particle.age > particle.life) continue;
        alive++;
        particle.vy += gravity * seconds;
        const slow = drag ** seconds;
        particle.vx *= slow;
        particle.vy *= slow;
        particle.x += particle.vx * seconds;
        particle.y += particle.vy * seconds;
        particle.turn += particle.spin * seconds;
        const left = 1 - particle.age / particle.life;
        context.globalAlpha = Math.min(1, left * 1.6);
        context.fillStyle = particle.colour;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.turn);
        context.beginPath();
        if (shape === "shard") {
          context.moveTo(-particle.size, -particle.size * 0.4);
          context.lineTo(particle.size, 0);
          context.lineTo(-particle.size * 0.6, particle.size * 0.5);
        } else if (shape === "fleck") {
          context.scale(1, Math.cos(particle.turn * 1.7));
          context.rect(-particle.size, -particle.size * 0.6, particle.size * 2, particle.size * 1.2);
        } else context.arc(0, 0, particle.size * (shrink ? left : 1), 0, 7);
        context.fill();
        context.restore();
      }
      context.globalAlpha = 1;
      return alive > 0;
    },
  });
}

/* ---------- couriers (P1-B): a head, a fading trail, a label; the landing is the change ---------- */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export type Courier = {
  from: Point;
  to: Point;
  colour: string;
  label?: string | null;
  radius?: number;
  duration?: number;
  arc?: number;
  delay?: number;
  coin?: boolean;
  onLand?: () => void;
};
// The world's courier token shapes the head; dot and coin are the mock's circle.
function head(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const shape = document.documentElement.dataset.courier;
  context.beginPath();
  if (shape === "shard") {
    context.moveTo(x - radius, y - radius * 0.4);
    context.lineTo(x + radius, y);
    context.lineTo(x - radius * 0.6, y + radius * 0.5);
  } else if (shape === "fleck") context.rect(x - radius, y - radius * 0.6, radius * 2, radius * 1.2);
  else context.arc(x, y, radius, 0, 7);
  context.fill();
}
export function fly(courier: Courier): Promise<void> {
  const { from, to, colour, label = null, radius = 7, duration = 0.7, arc = 0.28, delay = 0 } = courier;
  const { coin = false, onLand } = courier;
  return new Promise((resolve) => {
    const land = () => {
      onLand?.();
      resolve();
    };
    if (reduced()) return land();
    const dx = to.x - from.x,
      dy = to.y - from.y,
      distance = Math.hypot(dx, dy) || 1;
    let px = -dy / distance,
      py = dx / distance;
    if (py > 0) {
      px = -px;
      py = -py;
    }
    const control = { x: from.x + dx / 2 + px * distance * arc, y: from.y + dy / 2 + py * distance * arc };
    const total = duration * pace(),
      mono = token("--mono"),
      card = token("--card"),
      k = scale();
    const at = (q: number): [number, number] => {
      const u = 1 - q;
      return [
        u * u * from.x + 2 * u * q * control.x + q * q * to.x,
        u * u * from.y + 2 * u * q * control.y + q * q * to.y,
      ];
    };
    let time = -delay * pace();
    addToLayer({
      step(seconds, context) {
        time += seconds;
        if (time < 0) return true;
        const progress = time / total;
        if (progress >= 1) {
          land();
          return false;
        }
        const eased = easeInOut(progress),
          tail = Math.max(0, eased - (coin ? 0.12 : 0.22));
        context.lineCap = "round";
        for (let i = 0; i < 10; i++) {
          const [ax, ay] = at(tail + ((eased - tail) * i) / 10);
          const [bx, by] = at(tail + ((eased - tail) * (i + 1)) / 10);
          context.strokeStyle = colour;
          context.globalAlpha = ((i + 1) / 10) * (coin ? 0.35 : 0.55);
          context.lineWidth = (radius * 1.3 * (i + 1)) / 10;
          context.beginPath();
          context.moveTo(ax, ay);
          context.lineTo(bx, by);
          context.stroke();
        }
        const [hx, hy] = at(eased);
        context.globalAlpha = 1;
        context.fillStyle = colour;
        head(context, hx, hy, radius);
        context.fillStyle = "rgba(255,255,255,.55)";
        context.beginPath();
        context.arc(hx - radius * 0.3, hy - radius * 0.3, radius * 0.38, 0, 7);
        context.fill();
        if (label) {
          context.font = `700 ${Math.round(15 * k)}px ${mono}`;
          const width = context.measureText(label).width + 14 * k,
            left = hx + radius + 5 * k,
            top = hy - 11.5 * k;
          context.fillStyle = card;
          context.strokeStyle = colour;
          context.lineWidth = 1.5;
          context.beginPath();
          context.roundRect(left, top, width, 23 * k, 6 * k);
          context.fill();
          context.stroke();
          context.fillStyle = colour;
          context.textBaseline = "middle";
          context.fillText(label, left + 7 * k, top + 12 * k);
        }
      },
    });
  });
}

export function ring(x: number, y: number, colour: string, radius = 34, width = 2.5, duration = 0.52) {
  let time = 0;
  addToLayer({
    step(seconds, context) {
      time += seconds;
      const progress = time / duration;
      if (progress >= 1) return false;
      context.globalAlpha = 1 - progress;
      context.strokeStyle = colour;
      context.lineWidth = width * (1 - progress) + 0.5;
      context.beginPath();
      context.arc(x, y, 6 + radius * (1 - (1 - progress) ** 3), 0, 7);
      context.stroke();
      context.globalAlpha = 1;
    },
  });
}

/* ---------- the shockwave: a ring that runs out from a point and hits each target as it passes ---------- */
function ringDraw(context: CanvasRenderingContext2D, x: number, y: number, radius: number, colour: string, alpha: number, width: number) {
  context.globalAlpha = alpha * 0.22;
  context.strokeStyle = colour;
  context.lineWidth = width * 3.2;
  context.beginPath();
  context.arc(x, y, Math.max(1, radius - width), 0, 7);
  context.stroke();
  context.globalAlpha = alpha;
  context.lineWidth = width * 0.5;
  context.beginPath();
  context.arc(x, y, radius, 0, 7);
  context.stroke();
  context.globalAlpha = 1;
}
export type WaveTarget = { el: Element; x: number; y: number; distance: number; done?: boolean };
export function wave(
  originX: number,
  originY: number,
  options: { colour: string; targets: Element[]; hit: (target: WaveTarget) => void; duration?: number; width?: number },
): Promise<void> {
  const { colour, targets, hit, duration = 0.9, width = 30 } = options;
  const reach = Math.hypot(Math.max(originX, innerWidth - originX), Math.max(originY, innerHeight - originY));
  const marks: WaveTarget[] = targets.map((el) => {
    const point = centre(el);
    return { el, x: point.x, y: point.y, distance: Math.hypot(point.x - originX, point.y - originY) };
  });
  if (reduced()) return sleep(100);
  return new Promise((resolve) => {
    let time = 0;
    addToLayer({
      step(seconds, context) {
        time += seconds;
        const progress = Math.min(1, time / duration),
          radius = (1 - (1 - progress) ** 2.2) * reach;
        ringDraw(context, originX, originY, radius, colour, 1 - progress * 0.7, width * (1 - progress * 0.5));
        for (const mark of marks)
          if (!mark.done && mark.distance <= radius) {
            mark.done = true;
            hit(mark);
          }
        if (progress >= 1) {
          resolve();
          return false;
        }
      },
    });
  });
}

/** A spring as a native easing: simulated once and handed to WAAPI as linear(), so it runs on the compositor. */
export function spring(stiffness = 170, damping = 18): { easing: string; duration: number } {
  let x = 0,
    velocity = 0,
    time = 0;
  const step = 1 / 240,
    points = [0];
  while (time < 2.5) {
    const force = -stiffness * (x - 1) - damping * velocity;
    velocity += force * step;
    x += velocity * step;
    time += step;
    if (Math.round(time * 240) % 4 === 0) points.push(+x.toFixed(4));
    if (time > 0.25 && Math.abs(x - 1) < 0.002 && Math.abs(velocity) < 0.02) break;
  }
  points.push(1);
  return { easing: `linear(${points.join(",")})`, duration: Math.round(time * 1000) };
}

/* ---------- the frame meter: every rAF delta while a moment runs, kept on window.deskFps for the end-to-end check ---------- */
type FpsRecord = { moment: string; avg: number; low1: number; frames: number };
declare global {
  interface Window {
    deskFps?: FpsRecord[];
  }
}
function record(name: string, deltas: number[]) {
  const sorted = deltas.slice(1).sort((a, b) => b - a);
  if (!sorted.length) return;
  (window.deskFps ??= []).push({
    moment: name,
    avg: Math.round(1000 / (sorted.reduce((a, b) => a + b) / sorted.length)),
    low1: Math.round(1000 / sorted[Math.floor(sorted.length * 0.01)]),
    frames: sorted.length,
  });
}
let current: { name: string; deltas: number[]; last: number; on: boolean } | null = null;
export function fpsStart(name: string) {
  const mine = (current = { name, deltas: [] as number[], last: performance.now(), on: true });
  const frame = (now: number) => {
    if (current !== mine || !mine.on) return;
    mine.deltas.push(now - mine.last);
    mine.last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
export function fpsStop() {
  if (!current) return;
  current.on = false;
  record(current.name, current.deltas);
  current = null;
}
/** A fixed-length meter for the desk's own moments (opening a file or the sheet). */
export function meter(name: string, ms: number) {
  let last = performance.now();
  const deltas: number[] = [],
    end = last + ms;
  const frame = (now: number) => {
    deltas.push(now - last);
    last = now;
    if (now < end) requestAnimationFrame(frame);
    else record(name, deltas);
  };
  requestAnimationFrame(frame);
}

// The mock's sound hooks were silent; three map to the cues the game already has, the rest stay silent (Track F).
const CUES: Record<string, Parameters<typeof sound.play>[0]> = {
  seat: "tick",
  "verdict-pass": "gavel",
  "verdict-fail": "thud",
};
export function sfx(name: string, pitch = 0) {
  const cue = CUES[name];
  if (cue) sound.play(cue, { pitch });
}
```

If the installed `motion` names its option types differently, use `Parameters<typeof animate>` with the element overload; do not widen to `any`.

- [ ] **Step 8: Add the tokens applier to `src/theme.tsx`** (append; the old exports stay until Task 5)

```tsx
// ---- world tokens (level B): the palette in both modes, the fonts, radius, texture scale, material, motion, courier ----
import { DEFAULT_THEME_TOKENS, fitContrast, type Palette, type ThemeTokens, type Tint } from "../worker/tokens";

// The fixed colours (resources, danger, change), fitted per world at 4.6:1 on its grounds, as the mock did.
const FIXED = [
  { tre: "#227f53", aut: "#623e96", che: "#8a6d24", danger: "#bb0916", up: "#1d7a4a", dn: "#c2410c" },
  { tre: "#6dc393", aut: "#a37fde", che: "#f1cc7e", danger: "#ff7b72", up: "#6dc393", dn: "#ff9d5c" },
];
const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** `from` moved `share` of the way to `to` in sRGB, as the mock's mix(). */
export const mix = (from: string, to: string, share: number) => {
  const target = hexToRgb(to);
  return `#${hexToRgb(from)
    .map((channel, i) => Math.round(channel + (target[i] - channel) * share).toString(16).padStart(2, "0"))
    .join("")}`;
};

function paletteRules(palette: Palette, dark: boolean, tints: Tint[]): string {
  const tone = mix(palette.ink, palette.paper, dark ? 0.9 : 0.92);
  const grounds = [palette.paper, palette.surface, tone];
  // Danger also sits on every rim row's deepest wash (16% of the group's hue), so it is fitted there too.
  const washes = tints.map((tint) => mix(palette.surface, dark ? tint.dark : tint.light, 0.16));
  const fixed = Object.entries(FIXED[dark ? 1 : 0]).map(
    ([key, colour]) =>
      `--${key}:${fitContrast(colour, key === "danger" ? [...grounds, ...washes] : grounds, 4.6) ?? colour}`,
  );
  return [
    `--paper:${palette.paper}`,
    `--card:${palette.surface}`,
    `--ink:${palette.ink}`,
    `--ink-2:${palette.muted}`,
    `--rule:${palette.rule}`,
    `--tone:${tone}`,
    `--accent:${palette.accent}`,
    `--navy:${palette.accent2}`,
    `--sh:${dark ? "rgba(0,0,0,.55)" : `${palette.ink}38`}`,
    ...fixed,
  ].join(";");
}

/** Paints a world: its palette (both modes), its two or three fonts, radius, texture scale, material, motion and courier. */
export function applyTokens(tokens: ThemeTokens, tints: Tint[] = []) {
  const root = document.documentElement;
  const families = [...new Set([tokens.display, tokens.body, tokens.mono].filter((f): f is string => !!f))];
  const href = `https://fonts.googleapis.com/css2?${families
    .map((family) => `family=${family.replace(/ /g, "+")}${family === tokens.display ? "" : ":wght@400;500;600;700"}`)
    .join("&")}&display=swap`;
  let fonts = document.getElementById("world-fonts") as HTMLLinkElement | null;
  if (!fonts) {
    fonts = Object.assign(document.createElement("link"), { id: "world-fonts", rel: "stylesheet" });
    document.head.append(fonts);
  }
  if (fonts.href !== href) fonts.href = href;
  // Blackletter and small-caps faces set poor figures, so numbers fall back to the body face there (the mock's rule).
  const numerals = /IM Fell| SC$|Unifraktur/.test(tokens.display) ? tokens.body : tokens.display;
  const shared = [
    `--disp:"${tokens.display}",Georgia,serif`,
    `--ui:"${tokens.body}",system-ui,sans-serif`,
    `--mono:"${tokens.mono ?? tokens.body}",ui-monospace,monospace`,
    `--numf:"${numerals}",Georgia,serif`,
    `--r:${tokens.radius / 16}rem`,
    `--tex:${tokens.textureScale}`,
    `--fs:${tokens.bodySize / 16}rem`,
  ].join(";");
  let style = document.getElementById("world-tokens");
  if (!style) {
    style = Object.assign(document.createElement("style"), { id: "world-tokens" });
    document.head.append(style);
  }
  style.textContent = `:root{${shared};${paletteRules(tokens.light, false, tints)}}:root[data-theme=dark]{${paletteRules(tokens.dark, true, tints)}}`;
  Object.assign(root.dataset, {
    material: tokens.material,
    texture: tokens.texture,
    motion: tokens.motion,
    courier: tokens.courier,
  });
}

/** Back to the default world, so the next pack never starts from the last one's look. */
export const resetTokens = () => applyTokens(DEFAULT_THEME_TOKENS);

const MODE_KEY = "usoj:theme";
export function themeMode(): "light" | "dark" {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* blocked storage: follow the system */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function setThemeMode(mode: "light" | "dark") {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* the choice lasts this visit */
  }
}
```

Move the new `import` line to the top of the file with the other imports.

- [ ] **Step 9: Boot in `src/main.tsx`**

```tsx
import "./base.css";
import { createRoot } from "react-dom/client";
import { DEFAULT_THEME_TOKENS } from "../worker/tokens";
import App from "./App";
import { applyTokens, themeMode } from "./theme";

document.documentElement.dataset.theme = themeMode();
applyTokens(DEFAULT_THEME_TOKENS);
// The desk's moments read the `rm` class, so reduced motion is one switch the page can also flip live.
const quiet = matchMedia("(prefers-reduced-motion: reduce)");
const syncMotion = () => document.documentElement.classList.toggle("rm", quiet.matches);
syncMotion();
quiet.addEventListener("change", syncMotion);

createRoot(document.getElementById("root")!).render(<App />);
```

In `index.html`, add inside `<head>` before `<title>`:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

- [ ] **Step 10: Split `src/App.tsx` by screen and switch it to tokens**

Replace the seven screen imports (`Build`, `Seat`, `Desk`, `Midterm`, `Test`, `Won`, `Over`) with lazy ones; keep `Landing` and `Match` eager (the first paint):

```tsx
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
// Each screen is its own chunk: the landing never downloads the desk.
const Build = lazy(() => import("./Build"));
const Seat = lazy(() => import("./Seat"));
const Desk = lazy(() => import("./Desk"));
const Midterm = lazy(() => import("./Midterm"));
const Test = lazy(() => import("./Test"));
const Won = lazy(() => import("./Won"));
const Over = lazy(() => import("./Over"));
```

Replace `import { applyTheme, resetTheme } from "./theme";` with `import { applyTokens, resetTokens } from "./theme";` and `import { DEFAULT_THEME_TOKENS } from "../worker/tokens";`. The game-load effect becomes `if (game) applyTokens(game.pack.themeTokens ?? DEFAULT_THEME_TOKENS);`; `restart` calls `resetTokens()` instead of `resetTheme()`. Wrap the whole returned screen switch (from `{booting ? null : game ? (` to the Landing branch's close) in `<Suspense fallback={null}>...</Suspense>`.

- [ ] **Step 11: De-conflict `src/styles.css`** (the old screens' sheet; Task 5 restyles it)

1. Delete line 1 (the Big Shoulders/Public Sans `@import`).
2. In the first `:root` block, delete `--paper`, `--ink`, `--accent`, `--tre`, `--aut`, `--che`, `--danger`, `--tone`, `--ink-2`, `--display`, `--sans`, `--bg`, `--line`, `color-scheme`, and add the aliases the old rules read:

```css
  /* the old screens read these names; the world tokens (src/base.css, applyTokens) own the values */
  --bg: var(--paper);
  --line: var(--ink);
  --display: var(--disp);
  --sans: var(--ui);
```

3. Delete the old base `.btn { ... }` rule, the old `.kicker { ... }`, `.num { ... }` and `.ic { ... }` rules (base.css owns them). Keep every modifier (`.btn.ghost`, `.btn.busy`, `[data-primary]` and the rest).
4. Guard the old selectors that share a class name with the desk: in every selector of `src/styles.css` that uses `.stage`, `.head`, `.sub`, `.bar`, `.led`, `.top`, `.big`, `.red` or `.vs` as a class, append `:not(.desk *)` to that compound (for example `.stage .x` becomes `.stage:not(.desk *) .x`). List them first: `grep -nE "\.(stage|head|sub|bar|led|top|big|red|vs)([^a-zA-Z0-9_-]|$)" src/styles.css`.

- [ ] **Step 12: Gates and a Chrome spot check**

```bash
bun test worker src scripts && bunx tsc -b && bunx vite build
```

Expected: all green; the build prints separate JS chunks for Desk, Seat, Build, Midterm, Test, Won and Over. Run `bun run dev`, open `http://localhost:5173`: the landing renders in Libre Caslon Display and Public Sans on the default paper with the quiet hatch; at a 1920x1080 window the text is 20% larger than at 1440x900 (DevTools: `getComputedStyle(document.documentElement).fontSize` is `19.2px`); DevTools Network shows only the world-fonts CSS request to Google Fonts (three families). The old desk still loads (it is replaced in Task 3) and may look off; that is expected.

- [ ] **Step 13: Commit**

```bash
git add docs/design public/icons.svg src/base.css src/desk src/theme.tsx src/main.tsx src/App.tsx src/styles.css index.html package.json bun.lock
git commit -m "Lay the desk's foundations: the mock's copy, motion, one root scale, world tokens, the icon sprite and the motion toolkit"
```

---

### Task 2: The desk view in the worker

**Files:**
- Modify: `worker/desk.ts` (add `deskView` and its helpers below the types)
- Create: `worker/desk.test.ts`
- Modify: `worker/game.ts` (`view()` and `reply()` signatures, one line in `fetch()`)
- Modify: `worker/game.test.ts` (two new tests at the end)
- Modify: `src/api.ts`

**Interfaces:**
- Consumes (from `v1`): `engine.ts`: `applyVote`, `actTokens`, `AGAINST_AT`, `FOR_AT`, `effectiveWhip`, `glanceOf`, `hash`, `holdersOf`, `RESOURCES`, `rng`, `testBar`, `WARN_TURNS`, `weightOf`, types `Game`, `PriceTag`, `Resource`, `WireLine`, `Veto`, `FactionCount`; `acts.ts`: `billOf`, `commit`, `instrumentOf`, `previewOf`, `vetoRows`; `emblem.ts`: `checkEmblem`; `tokens.ts`: `parseThemeTokens`, `Tint`; the types already in `worker/desk.ts`.
- Produces:
  - `worker/desk.ts`: `export function deskView(pack: Pack, game: Game, previous?: Game): DeskView`; `export function reasonOf(cause: string, title: string, fallback: string): string`.
  - Semantics Task 3 and Task 4 rely on: `receipt` is non-null exactly while `game.tag` is set; `receipt.now` holds the charge (negative resource lines, why `"Spent when you sign"`), for a non-law the rates (why starts `"Every "`) and the final vote line, and every group line signing moves; `receipt.pass`/`receipt.fail` (law only) hold what the vote itself moves plus the final vote line (and on pass the rates); `receipt.count` is non-null for a law priced with its whip count; `verdict` is non-null only in the turn a law was voted (`game.phase === "over"`), with `order` holding every member id once, sure seats first; `review` is null on a GET and, after a POST, lists every resource, group and the final vote that the request moved (`from`, `to`, `delta = to - from`, all integers).
  - `worker/game.ts`: `view(pack, saved, extra?, previous?)` adds `desk: deskView(pack, game, previous)`; every POST reply passes the game as the request found it.
  - `src/api.ts`: `GameView.desk: DeskView`; re-exports `DeskView`, `RimRow`, `ChamberFaction`, `ResourceCard`, `Receipt`, `ReceiptLine`, `Count`, `Verdict`, `ReviewLine`; new calls `api.negotiate(g, faction, term)` and `api.decline(g, i)`.

- [ ] **Step 1: Write the failing tests** in `worker/desk.test.ts`

```ts
import { expect, test } from "bun:test";
import { commit, priceTag } from "./acts";
import { deskView } from "./desk";
import { applyVote, encodeCode, newGame, scenarioTag, type Game, type Quote } from "./engine";
import { PackSchema, type Pack, type Verb } from "./pack";

const load = async (file: string) =>
  PackSchema.parse(await Bun.file(`${import.meta.dir}/fixtures/${file}.json`).json());
function seat(pack: Pack, ruler: string): Game {
  const code = encodeCode({
    scenario: scenarioTag(pack.id),
    faction: pack.factions.findIndex((faction) => faction.id === ruler),
    promises: [0, 1, 2],
    seed: 7,
  });
  const promises = pack.promises.slice(0, 3).map((promise) => promise.tag);
  return newGame("g", code, pack, ruler, promises, pack.calendar);
}
const quote = (verb: Verb, touches: string[] = []): Quote => ({
  verb,
  title: "The act",
  reading: "You act.",
  power: true,
  era: true,
  refusal: null,
  credibility: 1,
  cost: { authority: 0, treasury: 0, chest: 0 },
  revenue: [],
  serves: [],
  hits: [],
  keeps: [],
  targets: null,
  tags: [],
  touches,
  regions: [],
  promises: [],
  sunset: null,
  template: null,
});

for (const [file, ruler, verb, veto] of [
  ["westeros", "baratheon", "force", "houses"],
  ["biden-2021", "dem", "appoint", "congress"],
] as const) {
  test(`${file}: the blocked veto follows ${veto}'s support after the act was priced`, async () => {
    const pack = await load(file);
    const game = seat(pack, ruler);
    game.tag = priceTag(pack, game, quote(verb));
    game.holders[veto].support = 100;
    expect(deskView(pack, game).receipt!.blocked).toBeNull();
    game.holders[veto].support = 0;
    expect(deskView(pack, game).receipt!.blocked!.id).toBe(veto);
  });
}

test("an emblem that fails the check draws the line icon, and every row keeps one", async () => {
  const pack = await load("biden-2021");
  const game = seat(pack, "dem");
  pack.constitution!.holders[0].emblem = { size: 24, elements: [{ tag: "script" }] } as never;
  const rim = deskView(pack, game).rim;
  expect(rim[0].emblem).toBeNull();
  expect(rim.every((row) => row.icon)).toBe(true);
  expect(new Set(rim.map((row) => row.id)).size).toBe(pack.constitution!.holders.length); // own party once
  expect(deskView(pack, game).factions.find((faction) => faction.id === "ind")!.emblem).toBeNull();
});

test("a law's receipt counts every seat, names each hesitant one, and its defeat costs what its passage pays", async () => {
  const pack = await load("biden-2021");
  const game = seat(pack, "dem");
  for (const member of game.members) member.mood = 0; // the whip below alone decides who hesitates
  const tag = priceTag(pack, game, quote("law", ["relief checks"]));
  tag.count = {
    whip: Object.fromEntries(game.members.map((member, i) => [member.id, (i % 3) / 2])),
    blocs: {},
    patrons: {},
    vetoes: {},
    filibuster: 0,
    constitutional: 0,
  };
  game.tag = tag;
  const receipt = deskView(pack, game).receipt!;
  const count = receipt.count!;
  expect(count.factions.reduce((sum, f) => sum + f.for + f.against + f.hesitant, 0)).toBe(game.members.length);
  for (const faction of count.factions) expect(faction.hesitantNames).toHaveLength(faction.hesitant);
  const authority = (lines: typeof receipt.pass) => lines.find((line) => line.id === "authority")?.delta ?? 0;
  expect(authority(receipt.pass)).toBeGreaterThan(0);
  expect(authority(receipt.fail)).toBeLessThan(0);

  commit(pack, game, tag);
  applyVote(pack, game, game.bills.at(-1)!);
  const verdict = deskView(pack, game).verdict!;
  expect(new Set(verdict.order.map((seat) => seat.member)).size).toBe(game.members.length);
  const hesitant = verdict.order.map((seat) => seat.hesitant);
  expect(hesitant).toEqual([...hesitant].sort()); // every sure seat is called before any hesitant one
  expect(verdict.order.filter((seat) => seat.yes)).toHaveLength(verdict.yes);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test worker/desk.test.ts`
Expected: FAIL with `Export named 'deskView' not found in module`.

- [ ] **Step 3: Write `deskView`** (append to `worker/desk.ts`; change its header's second sentence to "Types, and deskView: the mapping from a pack and a game to what the desk draws.")

```ts
import { billOf, commit, instrumentOf, previewOf, vetoRows } from "./acts";
import { checkEmblem } from "./emblem";
import {
  AGAINST_AT,
  FOR_AT,
  RESOURCES,
  WARN_TURNS,
  actTokens,
  applyVote,
  effectiveWhip,
  glanceOf,
  hash,
  holdersOf,
  rng,
  testBar,
  weightOf,
  type Game,
  type PriceTag,
  type WireLine,
} from "./engine";
import type { Pack } from "./pack";
import { parseThemeTokens } from "./tokens";

type Holder = ReturnType<typeof holdersOf>[number];

const NEUTRAL: Tint = { light: "#596073", dark: "#aab1c2" };
const RESOURCE_WORDS: Record<Resource, { name: string; icon: ResourceIcon }> = {
  treasury: { name: "Treasury", icon: "bank" },
  authority: { name: "Authority", icon: "gavel" },
  chest: { name: "Chest", icon: "note" },
};

const resourceName = (pack: Pack, key: Resource) =>
  pack.constitution?.ledgers[key]?.name ?? RESOURCE_WORDS[key].name;
const shortName = (holder: Holder) => holder.short ?? holder.name;
// R24: the final vote is each voting group's support times its weight.
const finalVote = (game: Game) =>
  Math.round(Object.values(game.holders).reduce((sum, h) => sum + h.weight * h.support, 0));
const need = (pack: Pack, game: Game) => Math.round(testBar(pack, game) * 100);

/** The words after the act's own title in a wire cause, capitalised; the fallback when nothing is left. */
export function reasonOf(cause: string, title: string, fallback: string): string {
  const rest = (title && cause.startsWith(title) ? cause.slice(title.length).replace(/^[:,]\s*/, "") : cause).trim();
  return rest ? rest[0].toUpperCase() + rest.slice(1) : fallback;
}

// The pack's hints first; Stage 0's suggested fallback for a pack written before icons.
function iconOf(holder: Holder): LineIcon {
  if (holder.icon) return holder.icon;
  if (holder.members === "seats") return "chamber";
  if (holder.members === "citizens") return "street";
  return holder.levers.includes("force") ? "army" : "council";
}
function tintOf(pack: Pack, id: string, own?: Tint): Tint {
  if (own) return own;
  const faction = pack.factions.find((candidate) => candidate.id === id);
  return faction ? (faction.tint ?? { light: faction.color, dark: faction.color }) : NEUTRAL;
}

function rimRow(pack: Pack, game: Game, holder: Holder): RimRow {
  const state = game.holders[holder.id];
  const support = Math.round(state?.support ?? 50);
  const line = state?.line ?? holder.line;
  const warning = game.warnings.find((candidate) => candidate.holder === holder.id);
  return {
    id: holder.id,
    name: shortName(holder),
    where: holder.where,
    support,
    line,
    margin: support - line,
    strikesOn: warning ? warning.fires : support < line ? game.turn + WARN_TURNS : null,
    votes: Math.round((state?.weight ?? weightOf(pack, holder.id)) * 100),
    tint: tintOf(pack, holder.id, holder.tint),
    icon: iconOf(holder),
    emblem: checkEmblem(holder.emblem),
    glance: glanceOf(holder) ?? null,
  };
}

function resourceLine(pack: Pack, key: Resource, delta: number, why: string): ReceiptLine {
  return { target: "resource", id: key, name: resourceName(pack, key), delta, why };
}
function voteLine(pack: Pack, before: Game, after: Game): ReceiptLine {
  const bar = need(pack, before),
    to = finalVote(after);
  const why = to >= bar ? `${to - bar} above what you need` : `${bar - to} short of what you need`;
  return { target: "finalVote", id: "finalVote", name: "Final vote", delta: to - finalVote(before), why };
}
// Whole numbers on both ends, so a from, a to and their delta always agree on screen.
function groupLines(pack: Pack, before: Game, after: Game, wire: WireLine[], title: string, fallback?: string): ReceiptLine[] {
  return holdersOf(pack).flatMap((holder): ReceiptLine[] => {
    const from = Math.round(before.holders[holder.id]?.support ?? 0),
      to = Math.round(after.holders[holder.id]?.support ?? 0);
    if (from === to) return [];
    const cause = wire.find((line) => line.kind === "support" && line.id === holder.id)?.cause ?? "";
    const why = reasonOf(cause, title, fallback ?? (to > from ? "It serves them" : "It costs them"));
    return [{ target: "group", id: holder.id, name: shortName(holder), delta: to - from, why }];
  });
}
function resourceDiff(pack: Pack, before: Game, after: Game, wire: WireLine[], fallback: string): ReceiptLine[] {
  return RESOURCES.flatMap((key): ReceiptLine[] => {
    const from = Math.round(before.ledgers[key]),
      to = Math.round(after.ledgers[key]);
    if (from === to) return [];
    const cause = wire.find((line) => line.kind === "ledger" && line.ledger === key)?.cause ?? "";
    return [resourceLine(pack, key, to - from, reasonOf(cause, "", fallback))];
  });
}

// ponytail: ledgers are set deep enough that commit never refuses and a vote's +2 or -2 never clamps; the receipt
// reads resources off the tag, so these numbers never reach the player. Upgrade: an engine dry-run flag on commit.
const DEEP = { treasury: 5000, authority: 100, chest: 5000 };
function afterCommit(pack: Pack, game: Game, tag: PriceTag) {
  const clone = structuredClone(game);
  clone.ledgers = { ...DEEP };
  const mark = clone.wireTurn === clone.turn ? clone.wire.length : 0;
  commit(pack, clone, structuredClone(tag));
  return { game: clone, wire: clone.wire.slice(mark) };
}
// Seat by seat on the preview's own lines: a passage takes every hesitant seat, a defeat none of them. The whip is set
// far past 0 and 1 so the draw is certain whatever mood, shift or cap effectiveWhip adds.
function afterVote(pack: Pack, signed: Game, passed: boolean) {
  const clone = structuredClone(signed);
  const bill = clone.bills.at(-1)!;
  const chance = effectiveWhip(clone, bill);
  bill.whip = Object.fromEntries(
    Object.entries(chance).map(([id, p]) => [id, (passed ? p > AGAINST_AT : p >= FOR_AT) ? 5 : -5]),
  );
  const mark = clone.wire.length;
  applyVote(pack, clone, bill);
  return { game: clone, wire: clone.wire.slice(mark) };
}

function countOf(pack: Pack, game: Game, tag: PriceTag): Count | null {
  const preview = previewOf(pack, game, tag);
  if (!preview) return null;
  const chance = effectiveWhip(game, billOf(game, tag));
  const unsure = (id: string) => chance[id] > AGAINST_AT && chance[id] < FOR_AT;
  return {
    label: pack.vocabulary.chamber,
    need: preview.need,
    expected: preview.expected,
    tie: null,
    factions: preview.factions.map((faction) => ({
      ...faction,
      hesitantNames: game.members
        .filter((member) => member.faction === faction.id && unsure(member.id))
        .map((member) => member.name),
    })),
  };
}

function receiptOf(pack: Pack, game: Game, tag: PriceTag): Receipt {
  const words = pack.vocabulary;
  const law = tag.verb === "law";
  const vetoes = vetoRows(pack, game, tag.verb, actTokens(tag));
  const signed = afterCommit(pack, game, tag);
  const charge = RESOURCES.filter((key) => tag.charge[key] > 0).map((key) =>
    resourceLine(pack, key, -tag.charge[key], "Spent when you sign"),
  );
  const rates = tag.revenue.flatMap((rate) =>
    (RESOURCES as readonly string[]).includes(rate.ledger)
      ? [resourceLine(pack, rate.ledger as Resource, rate.delta, `Every ${words.turn} while it stands`)]
      : [],
  );
  const groups = groupLines(pack, game, signed.game, signed.wire, tag.title);
  const outcome = (passed: boolean) => {
    const voted = afterVote(pack, signed.game, passed);
    const verdictWords = `The ${words.bill} ${passed ? words.pass : words.fail}`;
    return [
      ...resourceDiff(pack, signed.game, voted.game, voted.wire, verdictWords),
      ...(passed ? rates : []),
      ...groupLines(pack, signed.game, voted.game, voted.wire, tag.title, verdictWords),
      voteLine(pack, game, voted.game),
    ];
  };
  return {
    verb: tag.verb,
    instrument: instrumentOf(pack, tag.verb)?.name ?? tag.verb,
    title: tag.title,
    reading: tag.reading,
    now: law ? [...charge, ...groups] : [...charge, ...rates, ...groups, voteLine(pack, game, signed.game)],
    pass: law ? outcome(true) : [],
    fail: law ? outcome(false) : [],
    vetoes,
    blocked: vetoes.find((veto) => !veto.agrees) ?? null,
    count: law ? countOf(pack, game, tag) : null,
  };
}

function verdictOf(pack: Pack, game: Game): Verdict | null {
  const bill = game.bills.at(-1);
  if (game.phase !== "over" || !bill?.votes || bill.id !== game.turn) return null;
  const votes = bill.votes;
  const chance = effectiveWhip(game, bill);
  const unsure = (id: string) => chance[id] > AGAINST_AT && chance[id] < FOR_AT;
  // The sure seats in a shuffle seeded by the bill, so a reload replays the same count; then each hesitant seat.
  const draw = rng(hash(`${game.seed}:${game.term}:${bill.id}:order`));
  const sure = game.members
    .filter((member) => !unsure(member.id))
    .map((member) => ({ member, key: draw() }))
    .sort((a, b) => a.key - b.key)
    .map(({ member }) => member);
  const hesitant = pack.factions.flatMap((faction) =>
    game.members.filter((member) => member.faction === faction.id && unsure(member.id)),
  );
  const yes = bill.yes ?? 0;
  return {
    passed: !!bill.passed && !bill.struck,
    yes,
    no: game.members.length - yes,
    need: bill.threshold ?? 0,
    tieBrokenBy: null,
    vetoedBy: null,
    order: [...sure, ...hesitant].map((member) => ({
      member: member.id,
      faction: member.faction,
      yes: !!votes[member.id],
      hesitant: unsure(member.id),
    })),
  };
}

function reviewOf(pack: Pack, game: Game, previous: Game): ReviewLine[] {
  // The wire is one turn's lines; a request that opened a new turn's wire wrote all of it.
  const wire = previous.wireTurn === game.wireTurn ? game.wire.slice(previous.wire.length) : game.wire;
  const title = previous.tag?.title ?? "";
  const resources = RESOURCES.flatMap((key): ReviewLine[] => {
    const from = Math.round(previous.ledgers[key]),
      to = Math.round(game.ledgers[key]);
    if (from === to) return [];
    const cause = wire.find((line) => line.kind === "ledger" && line.ledger === key)?.cause ?? "";
    const why = reasonOf(cause, title, to > from ? "Paid in" : "Spent");
    return [{ ...resourceLine(pack, key, to - from, why), from, to }];
  });
  const groups = groupLines(pack, previous, game, wire, title).map((line) => {
    const to = Math.round(game.holders[line.id].support);
    return { ...line, from: to - line.delta, to };
  });
  const vote = voteLine(pack, previous, game);
  const from = finalVote(previous);
  return [...resources, ...groups, ...(vote.delta ? [{ ...vote, from, to: from + vote.delta }] : [])];
}

/** Everything the desk draws for this game, from the pack's words and the game's numbers; the client derives nothing. */
export function deskView(pack: Pack, game: Game, previous?: Game): DeskView {
  const words = pack.vocabulary;
  return {
    theme: parseThemeTokens(pack.themeTokens).tokens,
    vocabulary: {
      file: words.file ?? "File",
      abroad: words.abroad ?? "abroad",
      turn: words.turn,
      pass: words.pass,
      fail: words.fail,
    },
    rim: holdersOf(pack).map((holder) => rimRow(pack, game, holder)),
    factions: pack.factions.flatMap((faction): ChamberFaction[] => {
      const seats = game.members.filter((member) => member.faction === faction.id).length;
      if (!seats) return [];
      return [
        {
          id: faction.id,
          name: faction.name,
          short: faction.short,
          seats,
          tint: tintOf(pack, faction.id, faction.tint),
          emblem: checkEmblem(faction.emblem),
          glance: glanceOf(faction) ?? null,
        },
      ];
    }),
    resources: RESOURCES.map((key) => {
      const ledger = pack.constitution?.ledgers[key];
      const value = Math.round(game.ledgers[key]);
      return {
        key,
        name: resourceName(pack, key),
        value,
        icon: ledger?.icon ?? RESOURCE_WORDS[key].icon,
        about: ledger?.for ?? null,
        earn: ledger?.earn ?? [],
        spend: ledger?.spend ?? [],
        fails: ledger?.fails ?? null,
        history: [value], // Cross-track request 1: the engine does not keep past turns' closing values yet
      };
    }),
    finalVote: { value: finalVote(game), need: need(pack, game) },
    receipt: game.tag ? receiptOf(pack, game, game.tag) : null,
    verdict: verdictOf(pack, game),
    review: previous ? reviewOf(pack, game, previous) : null,
  };
}
```

Change the file's existing `import type` lines so that `FactionCount`, `Resource`, `Veto` (engine), `Glance`, `LineIcon`, `ResourceIcon`, `Verb` (pack), `ThemeTokens`, `Tint` (tokens) and `Emblem` stay type imports, and merge the new value imports above them. If `pack.constitution?.ledgers[key]` or `holder.levers` does not type-check against the built `v1` schema, read the field's real shape in `worker/pack.ts` and adapt the access; do not add a field to the pack.

- [ ] **Step 4: Run the desk tests**

Run: `bun test worker/desk.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the view in `worker/game.ts`**

1. `view()`: `export function view(pack: Pack, { game, prose }: Saved, extra: Extra = {}, previous?: Game) {` and add `desk: deskView(pack, game, previous),` after `pack: pv,`. Import `deskView` from `./desk`.
2. `reply()`: `private async reply(s: Saved, pack?: Pack, extra: Extra = {}, previous?: Game) {` and pass `previous` as the fourth argument to `view(...)`.
3. `fetch()`: the POST path already takes `const before = structuredClone(s);` before the switch; change its final `return this.reply(s, pack, extra);` to `return this.reply(s, pack, extra, before.game);`.

- [ ] **Step 6: Write the failing boundary tests** (append to `worker/game.test.ts`)

```ts
import { DEFAULT_THEME_TOKENS } from "./tokens";

test("a pack stored before R36 gets the default theme and a line icon and tint on every rim row", () => {
  const { view } = seatedGame(80);
  const desk = view().desk;
  expect(desk.theme).toEqual(DEFAULT_THEME_TOKENS);
  for (const row of desk.rim) expect([row.icon, row.tint.light, row.tint.dark].every(Boolean)).toBe(true);
  expect(desk.rim.every((row) => row.emblem === null)).toBe(true);
});

// What the review of the signing request moved is what the receipt showed; per-turn rates wait for End turn and the
// final vote line is derived. A vote also reads the citizens (Jev), which moves the public group on its own line.
const moved = (lines: { target: string; id: string; delta: number; why: string }[], skip = "") =>
  lines
    .filter((line) => line.target !== "finalVote" && !line.why.startsWith("Every ") && line.id !== skip)
    .map((line) => `${line.target}:${line.id}:${line.delta}`)
    .sort();
for (const verb of ["decree", "law"] as const) {
  test(`a ${verb} lands at signing exactly as its receipt showed`, async () => {
    stubModels(0.9);
    const { game, post } = seatedGame(81);
    // Every seat sure, so the real draw is the simulated one (the receipt forces hesitant seats one way).
    for (const member of game.members) {
      member.mood = 1;
      member.loyalty = 100;
    }
    lawTag = verb === "law";
    const priced = await post("acts/price", { turn: 1, text: "Raise the harbour levy on the wharf." });
    const receipt = priced.body.desk.receipt;
    const signed = await post("acts", { turn: 1 });
    lawTag = false;
    expect(moved(receipt.now).length).toBeGreaterThan(0);
    expect(moved(signed.body.desk.review)).toEqual(moved(receipt.now));
    if (verb !== "law") return;
    const voted = await post("bills/1/vote", { turn: 1 });
    const bill = voted.body.bills[0];
    const street = publicHolder(pack)?.id ?? "";
    expect(moved(voted.body.desk.review, street)).toEqual(
      moved(bill.passed && !bill.struck ? receipt.pass : receipt.fail, street),
    );
    expect(voted.body.desk.verdict.order).toHaveLength(voted.body.members.length);
  });
}
```

Add `publicHolder` to the file's `./engine` import.

- [ ] **Step 7: Run the boundary tests**

Run: `bun test worker/game.test.ts`
Expected: PASS, including the three new tests. If the law case fails on a resource line, print both arrays and check the `DEEP` ledgers (a clamp at 0 or 200 shows as a smaller delta); if it fails on the chest, the patrons' payout differs between the clone and the real vote, which means `afterVote` ran on the wrong game.

- [ ] **Step 8: `src/api.ts`**

```ts
import type {
  ChamberFaction,
  Count,
  DeskView,
  Receipt,
  ReceiptLine,
  ResourceCard,
  ReviewLine,
  RimRow,
  Verdict,
} from "../worker/desk";
export type { ChamberFaction, Count, DeskView, Receipt, ReceiptLine, ResourceCard, ReviewLine, RimRow, Verdict };
```

Add `desk: DeskView;` to the `GameView` intersection (after `pack: PackView;`), and to `api`:

```ts
  negotiate: (g: GameView, faction: string, term: string) =>
    call<GameView>(`/games/${g.id}/acts/negotiate`, { turn: g.turn, faction, term }),
  decline: (g: GameView, i: number) =>
    call<GameView>(`/games/${g.id}/events/${i}/decline`, { turn: g.turn }),
```

- [ ] **Step 9: Gates**

```bash
bun test worker src scripts && bunx tsc -b && bunx vite build
```

Expected: green. With `bun run dev` and a seated Biden game, `fetch("/api/games/" + localStorage.getItem("usoj:game")).then(r => r.json()).then(g => g.desk)` in the console shows 9 rim rows, 3 factions, 3 resources and a final vote.

- [ ] **Step 10: Commit**

```bash
git add worker/desk.ts worker/desk.test.ts worker/game.ts worker/game.test.ts src/api.ts
git commit -m "Serve the desk view on every game read: rims, chamber, resources, a receipt simulated on a clone, the vote's calling order and what the request moved"
```

---

### Task 3: The desk, up to Sign

**Files:**
- Create: `src/desk/Live.tsx`, `src/desk/Emblem.tsx`, `src/desk/paint.ts`, `src/desk/Rim.tsx`, `src/desk/Chamber.tsx`, `src/desk/Receipt.tsx`, `src/desk/GroupFile.tsx`, `src/desk/Sheet.tsx`, `src/desk/EventCard.tsx`, `src/desk/Composer.tsx`
- Replace: `src/Desk.tsx`
- Modify: `src/desk/desk.css` (append the "not in the mock" section), `src/App.tsx`, `src/api.ts` (prune), `src/rules.ts`, `src/rules.test.ts`, `src/Ledger.tsx` (prune)
- Delete: `src/Compose.tsx`, `src/PriceTag.tsx`, `src/Strip.tsx`, `src/Peek.tsx`, `src/Wire.tsx`, `src/Holders.tsx`, `src/Rail.tsx`, `src/Panels.tsx`, `src/Feed.tsx`, `src/Drawer.tsx`, `src/Card.tsx`, `src/Tour.tsx`, `src/icons.tsx`

**Interfaces:**
- Consumes: Task 1's `fx.ts`, `Icon.tsx`, `applyTokens`, `setThemeMode`, `themeMode`; Task 2's `GameView.desk` and `api.negotiate`, `api.decline`.
- Produces (Task 4 relies on these):
  - `src/desk/paint.ts`: `RESOURCE_TOKEN: Record<Resource, "tre" | "aut" | "che">`, `heatOf(margin)`, `standing(row, turn, turnWord, short)`, `paintRow(el, row, support, turn, turnWord)`, `paintCentre(stage, big, sub)`, `paintTally(stage, yes, no, size)`, `paintKnot(target, delta, animate)`, `lockRow(row, refuses, animate)`, `clearMarks(root)`, `targetOf(main, line)`, `iconNode(id)`, `atStage(el)`.
  - `src/desk/Chamber.tsx`: `type SeatSpot = { x: number; y: number; angle: number; index: number; faction: ChamberFaction }`, `layoutSeats(factions): SeatSpot[]`, `type ChamberHandle = { reveal(): void; spots: SeatSpot[] }` via `ref`.
  - `src/desk/Sheet.tsx`: `paintSheet: ((line: ReviewLine) => void) | null` (set while the sheet is open).
  - `src/Desk.tsx`: phases `idle`, `pricing`, `printing`, `priced` and the refs `deskRef` (the `.desk` wrapper), `mainRef` (`#dk`), `chamberRef`; the `frozen` ref (while true, `shown` does not follow `game`); `sign`, `endTurn`, `answer`, `decline`, `withdraw` handlers that Task 4 replaces with moments.
  - `src/App.tsx`: `Desk` props `{ game, act, onGame(g), onError(e), onQuit(), onReview(active) }`; App keeps the desk mounted while `onReview(true)` is in force, whatever the stage.

- [ ] **Step 1: `src/desk/Live.tsx` and `src/desk/Emblem.tsx`**

```tsx
// Text the desk's moments also write by hand. React sets it only when the value changes, through textContent, so a
// roll in flight is never overwritten and React never loses its own text node to a moment.
import { createElement, useLayoutEffect, useRef } from "react";

export function Live({ as = "b", className, text }: { as?: "b" | "span"; className?: string; text: string | number }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = String(text);
  }, [text]);
  return createElement(as, { ref, className });
}
```

```tsx
// A group's mark (placement A): its emblem when it passes checkEmblem, drawn from allowlisted shapes with createElement
// and clipped to its own box; the line icon otherwise, which is also the fallback for any missing or filtered emblem.
import { createElement } from "react";
import { checkEmblem, emblemShapes } from "../../worker/emblem";
import { Icon } from "./Icon";

export function Mark({ emblem, icon }: { emblem: unknown; icon: string }) {
  const checked = checkEmblem(emblem);
  if (!checked) return <Icon id={icon} />;
  return (
    <svg className="em" viewBox={`0 0 ${checked.size} ${checked.size}`} overflow="hidden" aria-hidden="true">
      {emblemShapes(checked).map((shape, index) => createElement(shape.tag, { key: index, ...shape.props }))}
    </svg>
  );
}
```

- [ ] **Step 2: `src/desk/paint.ts`**

```ts
// Paint helpers shared by the desk's layout effects and its moments: each writes one part of the React-drawn desk by
// hand, so a moment can change it mid-flight and React can paint the same finished state when the moment ends.
import { animate } from "motion";
import type { ReceiptLine, RimRow } from "../../worker/desk";
import type { Resource } from "../../worker/engine";
import { reduced, sfx, signed } from "./fx";

export const RESOURCE_TOKEN: Record<Resource, "tre" | "aut" | "che"> = {
  treasury: "tre",
  authority: "aut",
  chest: "che",
};
const find = (root: ParentNode, selector: string) => root.querySelector<HTMLElement>(selector);

/** The rim row's wash deepens from 5% to 16% of its hue as support nears its line. */
export const heatOf = (margin: number) => Math.max(0, Math.min(1, 1 - margin / 25));

export function standing(row: Pick<RimRow, "margin" | "strikesOn">, turn: number, turnWord: string, short: boolean) {
  if (row.margin > 0) return `${row.margin} above its line`;
  if (row.margin === 0) return "On its line";
  const turns = Math.max(1, (row.strikesOn ?? turn + 2) - turn);
  return `${-row.margin} under${short ? "" : " its line"} · strikes in ${turns} ${turnWord}${turns === 1 ? "" : "s"}`;
}

export function paintRow(el: HTMLElement, row: RimRow, support: number, turn: number, turnWord: string) {
  const margin = support - row.line;
  el.style.setProperty("--heat", heatOf(margin).toFixed(2));
  el.classList.toggle("warn", margin < 0);
  const status = find(el, ".hs");
  if (status) status.textContent = standing({ margin, strikesOn: row.strikesOn }, turn, turnWord, true);
}

export function paintCentre(stage: ParentNode, big: number, sub: string) {
  const number = find(stage, "#hcN"),
    caption = find(stage, "#hcS");
  if (number) number.textContent = String(big);
  if (caption) caption.textContent = sub;
}
export function paintTally(stage: ParentNode, yes: number, no: number, size: number) {
  find(stage, "#tyF")!.textContent = String(yes);
  find(stage, "#tyA")!.textContent = String(no);
  find(stage, ".ty-bar .f")!.style.transform = `scaleX(${yes / size})`;
  find(stage, ".ty-bar .a")!.style.transform = `scaleX(${no / size})`;
}

/** The small tied tag with the amount, on the element a receipt line moves. */
export function paintKnot(target: Element, delta: number, animated: boolean) {
  const slot = target.querySelector(".dx");
  if (!slot) return;
  const knot = document.createElement("span");
  knot.className = `knot ${delta > 0 ? "up" : "dn"}`;
  knot.textContent = signed(delta);
  slot.replaceChildren(knot);
  if (!animated || reduced()) return;
  animate(knot, { scale: [1.6, 1] }, { type: "spring", stiffness: 600, damping: 12 });
  animate(target, { x: [0, 4, -3, 0] }, { duration: 0.3 });
  sfx("knot");
}

export function iconNode(id: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  svg.setAttribute("class", "ic");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", `/icons.svg#${id}`);
  svg.append(use);
  return svg;
}

/** The lock badge on a group that must agree; red when it refuses. */
export function lockRow(row: Element, refuses: boolean, animated: boolean) {
  const disc = row.querySelector(".hi");
  if (!disc || disc.querySelector(".lockb")) return;
  const badge = document.createElement("i");
  badge.className = refuses ? "lockb no" : "lockb";
  badge.append(iconNode("i-lock"));
  disc.append(badge);
  if (animated && !reduced()) animate(badge, { scale: [0, 1.4, 1] }, { duration: 0.35 });
}

export function clearMarks(root: ParentNode) {
  for (const mark of root.querySelectorAll(".knot, .gd, .lockb, .wtag, .sweep")) mark.remove();
}

export function targetOf(main: ParentNode, line: Pick<ReceiptLine, "target" | "id">): HTMLElement | null {
  if (line.target === "finalVote") return find(main, "#fv");
  return line.target === "resource"
    ? find(main, `.led[data-r="${CSS.escape(line.id)}"]`)
    : find(main, `.hm[data-h="${CSS.escape(line.id)}"]`);
}

/** Centres a fixed card on the chamber, as the mock's file and card open. */
export function atStage(el: HTMLElement) {
  const stage = document.getElementById("stage")?.getBoundingClientRect();
  if (!stage) return;
  el.style.left = `${stage.left + stage.width / 2}px`;
  el.style.top = `${stage.top + stage.height / 2}px`;
}
```

- [ ] **Step 3: `src/desk/Rim.tsx`**

```tsx
// The rims: one fixed-height row per group (P1-B), home on the left, abroad on the right, washed in the group's own hue.
import { memo, type CSSProperties, type KeyboardEvent } from "react";
import type { RimRow } from "../../worker/desk";
import { Mark } from "./Emblem";
import { Icon, LINE_ICON } from "./Icon";
import { Live } from "./Live";
import { heatOf, standing } from "./paint";

type Props = {
  side: "home" | "abroad";
  heading: string;
  rows: RimRow[];
  turn: number;
  turnWord: string;
  testWord: string;
  fileWord: string;
  open: string | null;
  onOpen: (id: string) => void;
};

export const Rim = memo(function Rim({ side, heading, rows, turn, turnWord, testWord, fileWord, open, onOpen }: Props) {
  return (
    <aside className={`rim rim-${side === "home" ? "l" : "r"} sf`}>
      <h4>{heading}</h4>
      {rows.map((row) => {
        const tip = `Votes on you at ${testWord}: ${row.votes} of 100`;
        const press = (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpen(row.id);
        };
        return (
          <div
            key={row.id}
            className={`hm${row.margin < 0 ? " warn" : ""}${open === row.id ? " on" : ""}`}
            data-h={row.id}
            role="button"
            tabIndex={0}
            style={{ "--gl": row.tint.light, "--gd": row.tint.dark, "--heat": heatOf(row.margin).toFixed(2) } as CSSProperties}
            aria-label={`${row.name}: support ${row.support}, ${standing(row, turn, turnWord, false)}${row.votes ? `. ${tip}` : ""}. Open the ${fileWord}.`}
            onClick={() => onOpen(row.id)}
            onKeyDown={press}
          >
            <span className="hi">
              <Mark emblem={row.emblem} icon={LINE_ICON[row.icon]} />
            </span>
            <span className="hb">
              <b className="hn">{row.name}</b>
              <span className="hr">
                <i className="bar">
                  <i style={{ width: `${row.support}%` }} />
                  <i className="ln" style={{ left: `${row.line}%` }} />
                </i>
                <span className="dx" />
                <Live className="n num" text={row.support} />
                {row.votes ? (
                  <span className="bal-w">
                    <Icon id="i-ballot" />
                    {row.votes}
                    <span className="bal-tip" role="tooltip">
                      {tip}
                    </span>
                  </span>
                ) : null}
              </span>
              <Live as="span" className="hs" text={standing(row, turn, turnWord, true)} />
            </span>
          </div>
        );
      })}
    </aside>
  );
});
```

- [ ] **Step 4: `src/desk/Chamber.tsx`**

```tsx
// The chamber: every seat in six rows, factions filling wedges left to right with hesitant seats at the edge nearest
// the centre; the tally, the legend and, once priced, the count and each faction's terms. Painted by hand (paintChamber)
// so the receipt can reveal the count mid-print and React repaints the same state after.
import { forwardRef, memo, useImperativeHandle, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import type { ChamberFaction, Count } from "../../worker/desk";
import { play, reduced } from "./fx";
import { paintCentre, paintTally } from "./paint";

export type SeatSpot = { x: number; y: number; angle: number; index: number; faction: ChamberFaction };
export type ChamberHandle = { reveal(): void; spots: SeatSpot[] };
export type TermHandler = (faction: string, term: string) => void;

const ROWS = [0.45, 0.56, 0.67, 0.78, 0.89, 1];
export function layoutSeats(factions: ChamberFaction[]): SeatSpot[] {
  const size = factions.reduce((sum, faction) => sum + faction.seats, 0);
  const total = ROWS.reduce((a, b) => a + b);
  const counts = ROWS.map((radius) => Math.round((size * radius) / total));
  counts[5] += size - counts.reduce((a, b) => a + b);
  const points = ROWS.flatMap((radius, row) =>
    Array.from({ length: counts[row] }, (_, j) => {
      const angle = Math.PI * (1 - (counts[row] > 1 ? j / (counts[row] - 1) : 0.5));
      return { x: radius * Math.cos(angle), y: -radius * Math.sin(angle), angle, row };
    }),
  ).sort((a, b) => b.angle - a.angle || a.row - b.row);
  let next = 0;
  return factions.flatMap((faction) =>
    points.slice(next, (next += faction.seats)).map((point, i) => ({
      x: point.x,
      y: point.y,
      angle: point.angle,
      index: next - faction.seats + i,
      faction,
    })),
  );
}

// Within each faction's wedge: sure seats on the far side, hesitant ones nearest the chamber's centre.
function leansOf(spots: SeatSpot[], count: Count): (string | null)[] {
  const leans: (string | null)[] = spots.map(() => null);
  for (const row of count.factions) {
    const wedge = spots.filter((spot) => spot.faction.id === row.id);
    if (!wedge.length) continue;
    const left = wedge.reduce((sum, spot) => sum + spot.angle, 0) / wedge.length > Math.PI / 2;
    const order = [
      ...Array(row.for).fill("for"),
      ...Array(row.against).fill("ag"),
      ...Array(row.hesitant).fill("hes"),
    ];
    if (!left) order.reverse();
    wedge.forEach((spot, i) => (leans[spot.index] = order[i] ?? null));
  }
  return leans;
}

function paintLegend(legend: HTMLElement, factions: ChamberFaction[], count: Count | null, costs: (term: { cost: Record<string, number> }) => string, onTerm?: TermHandler) {
  legend.replaceChildren(
    ...factions.map((faction) => {
      const item = document.createElement("span"),
        dot = document.createElement("i"),
        name = document.createElement("b");
      dot.style.setProperty("--pl", faction.tint.light);
      dot.style.setProperty("--pd", faction.tint.dark);
      const row = count?.factions.find((candidate) => candidate.id === faction.id);
      if (!row) {
        name.textContent = String(faction.seats);
        item.append(dot, `${faction.name} `, name);
        return item;
      }
      name.textContent = faction.name;
      const parts = [row.for && `${row.for} for`, row.hesitant && `${row.hesitant} hesitant`, row.against && `${row.against} against`];
      item.append(dot, name, ` ${parts.filter(Boolean).join(", ")}: ${row.reason}`);
      for (const term of row.terms ?? []) {
        const chip = document.createElement("button");
        chip.className = "btn term";
        chip.textContent = `${term.label} · ${costs(term)}`;
        chip.onclick = () => onTerm?.(faction.id, term.kind);
        item.append(chip);
      }
      return item;
    }),
  );
}

export function paintChamber(stage: HTMLElement, spots: SeatSpot[], count: Count | null, need: number, animated: boolean, costs: (term: { cost: Record<string, number> }) => string, onTerm?: TermHandler) {
  const size = spots.length;
  const leans = count ? leansOf(spots, count) : spots.map(() => null);
  stage.querySelectorAll<SVGCircleElement>("#hemi .seat").forEach((circle, i) => {
    const set = () => circle.setAttribute("class", leans[i] ? `seat p-${leans[i]}` : "seat");
    if (!animated || reduced()) return set();
    const delay = ((Math.PI - spots[i].angle) / Math.PI) * 0.4;
    setTimeout(set, delay * 1000);
    play(circle, { scaleX: [1, 0, 1] }, { duration: 0.22, delay }).catch(() => {});
  });
  const inFavour = count ? count.factions.reduce((sum, f) => sum + f.for, 0) : 0;
  const against = count ? count.factions.reduce((sum, f) => sum + f.against, 0) : 0;
  const hesitant = count ? count.factions.reduce((sum, f) => sum + f.hesitant, 0) : 0;
  paintCentre(stage, count ? inFavour : need, count ? `for · ${count.need} needed` : `needed of ${size}`);
  paintTally(stage, inFavour, against, size);
  const telltale = stage.querySelector("#stv")!;
  if (!count) telltale.replaceChildren();
  else {
    const chip = document.createElement("span");
    chip.className = "ctel";
    const bold = (value: number) => Object.assign(document.createElement("b"), { textContent: String(value) });
    chip.append(bold(inFavour), " for · ", bold(hesitant), " hesitant · ", bold(against), " against");
    telltale.replaceChildren(chip);
  }
  paintLegend(stage.querySelector(".gleg")!, [...new Map(spots.map((s) => [s.faction.id, s.faction])).values()], count, costs, onTerm);
}

type Props = {
  factions: ChamberFaction[];
  label: string;
  need: number;
  count: Count | null;
  costs: (term: { cost: Record<string, number> }) => string;
  onTerm: TermHandler;
};

export const Chamber = memo(
  forwardRef<ChamberHandle, Props>(function Chamber({ factions, label, need, count, costs, onTerm }, ref) {
    const spots = useMemo(() => layoutSeats(factions), [factions]);
    const stage = useRef<HTMLElement>(null);
    const radius = 0.041 * Math.min(1, Math.sqrt(100 / Math.max(1, spots.length)));
    useLayoutEffect(() => paintChamber(stage.current!, spots, count, need, false, costs, onTerm), [spots, count, need, costs, onTerm]);
    useImperativeHandle(ref, () => ({ spots, reveal: () => paintChamber(stage.current!, spots, count, need, true, costs, onTerm) }), [spots, count, need, costs, onTerm]);
    return (
      <section className="stage sf" id="stage" ref={stage}>
        <div className="st-h">
          <span className="kicker">
            {label} · {spots.length} seats
          </span>
          <span className="st-v" id="stv" />
        </div>
        <div className="hemi-w">
          <svg id="hemi" viewBox="-1.08 -1.1 2.16 1.2" preserveAspectRatio="xMidYMid meet" aria-label={label}>
            {spots.map((spot) => (
              <circle
                key={spot.index}
                className="seat"
                data-i={spot.index}
                cx={spot.x.toFixed(4)}
                cy={spot.y.toFixed(4)}
                r={radius}
                style={{ "--pl": spot.faction.tint.light, "--pd": spot.faction.tint.dark } as CSSProperties}
              />
            ))}
            <text className="big" id="hcN" x="0" y="-.06" />
            <text className="sub" id="hcS" x="0" y=".05" />
          </svg>
          <div className="st-fx" id="stfx" />
        </div>
        <div className="tly" id="tly">
          <span className="ty-f">
            <b id="tyF" className="num" /> for
          </span>
          <div className="ty-bar">
            <i className="f" />
            <i className="a" />
            <i className="ln" style={{ left: `${(need / Math.max(1, spots.length)) * 100}%` }} />
          </div>
          <span className="ty-a">
            <b id="tyA" className="num" /> against
          </span>
        </div>
        <div className="gleg" />
      </section>
    );
  }),
);
```

`count` here is the receipt's count when it exists (Desk passes `shown.desk.receipt?.count ?? null`).

- [ ] **Step 5: `src/desk/Receipt.tsx`** (the receipt and its printing)

```tsx
// The clerk's receipt: a printer head across the slot and three or four stubs that feed out line by line; each line's
// knot lands on the element it moves (no threads, desk feedback 1). The printing is the mock's price() moment.
import { useLayoutEffect, useMemo, useRef } from "react";
import type { Receipt as ReceiptView, ReceiptLine, DeskView } from "../../worker/desk";
import { fpsStart, fpsStop, play, reduced, scale, sfx, signed, sleep, Stale } from "./fx";
import { Icon } from "./Icon";
import { lockRow, paintKnot, targetOf } from "./paint";

type Props = {
  receipt: ReceiptView;
  words: DeskView["vocabulary"];
  chamberRow: string | null; // the group a law's chamber is on the rim, for its lock badge
  size: number;
  printing: boolean;
  signable: boolean;
  onPrinted: () => void;
  onReveal: () => void; // the count reaches the chamber
  onSign: () => void;
  onTear: () => void;
};

const keyOf = (stage: string, line: ReceiptLine) => `${stage}:${line.target}:${line.id}`;

async function print(box: HTMLElement, tie: (row: HTMLElement) => void) {
  const head = box.querySelector<HTMLElement>(".head")!,
    lights = [...head.querySelectorAll("i")];
  fpsStart("pricing");
  sfx("printer");
  if (!reduced()) await play(head, { y: [-18, 0], opacity: [0, 1] }, { duration: 0.22 });
  const papers = [...box.querySelectorAll<HTMLElement>(".paper")];
  const rows = papers.map((paper) => [...paper.children] as HTMLElement[]);
  const longest = Math.max(...rows.map((row) => row.length));
  for (let k = 1; k <= longest; k++) {
    lights.forEach((light, i) => light.classList.toggle("on", (k + i) % 2 === 0));
    papers.forEach((paper, j) => {
      if (k > rows[j].length) return;
      const line = rows[j][k - 1];
      const bottom = line.offsetTop + line.offsetHeight + (k === rows[j].length ? 14 * scale() : 0);
      paper.style.clipPath = `inset(0 0 calc(100% - ${bottom}px) 0)`;
      if (!reduced()) play(paper, { y: [-2, 0] }, { duration: 0.08 }).catch(() => {});
      if (line.dataset.tie) sleep(reduced() ? 0 : 220).then(() => tie(line), () => {});
    });
    sfx("feed");
    await sleep(reduced() ? 0 : 95);
  }
  for (const paper of papers) paper.style.clipPath = "none";
  for (const light of lights) light.classList.remove("on");
  await sleep(1100);
  fpsStop();
}

export function Receipt({ receipt, words, chamberRow, size, printing, signable, onPrinted, onReveal, onSign, onTear }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const law = receipt.verb === "law";
  const lines = useMemo(() => {
    const all = new Map<string, ReceiptLine>();
    for (const stage of ["now", "pass", "fail"] as const) for (const line of receipt[stage]) all.set(keyOf(stage, line), line);
    return all;
  }, [receipt]);

  useLayoutEffect(() => {
    const root = box.current!,
      main = root.closest<HTMLElement>(".dk")!;
    const tie = (row: HTMLElement, animated: boolean) => {
      const key = row.dataset.k!;
      if (key === "ch") return animated && onReveal();
      if (key === "veto") {
        const ids = law ? (chamberRow ? [chamberRow] : []) : receipt.vetoes.map((veto) => veto.id);
        for (const id of ids) {
          const target = targetOf(main, { target: "group", id });
          const refuses = !law && receipt.vetoes.some((veto) => veto.id === id && !veto.agrees);
          if (target) lockRow(target, refuses, animated);
        }
        return;
      }
      const line = lines.get(key),
        target = line && targetOf(main, line);
      if (line && target) paintKnot(target, line.delta, animated);
    };
    if (!printing) {
      for (const paper of root.querySelectorAll<HTMLElement>(".paper")) paper.style.clipPath = "none";
      for (const row of root.querySelectorAll<HTMLElement>("[data-tie]")) tie(row, false);
      return;
    }
    print(root, (row) => tie(row, true)).then(onPrinted, (error) => {
      if (!(error instanceof Stale)) throw error;
    });
  }, [receipt, printing]); // eslint-disable-line

  const passWord = words.pass === "passed" ? "passes" : `is ${words.pass}`;
  const failWord = words.fail === "failed" ? "fails" : `is ${words.fail}`;
  const row = (stage: string, line: ReceiptLine, tie: boolean) => (
    <div
      key={keyOf(stage, line)}
      className={`rl ${stage === "fail" ? "bad" : line.delta > 0 ? "up" : "dn"}`}
      data-k={keyOf(stage, line)}
      data-tie={tie ? "1" : undefined}
    >
      <span className="nm">{line.name}</span>
      <span className="ld" />
      <b>{signed(line.delta)}</b>
      {tie ? <i className="kn" /> : null}
    </div>
  );
  const charge = receipt.now.filter((line) => line.target === "resource" && line.delta < 0);
  const lands = receipt.now.filter((line) => !(line.target === "resource" && line.delta < 0) && line.target !== "group");
  const groups = receipt.now.filter((line) => line.target === "group");
  const count = receipt.count;
  const mustAgree = law ? (
    <div className="rl" data-k="veto" data-tie="1">
      <span className="nm">{count?.label ?? "The chamber"}</span>
      <span className="ld" />
      <b>
        {count?.need ?? "?"} of {size}
      </b>
      <i className="kn" />
    </div>
  ) : receipt.vetoes.length ? (
    receipt.vetoes.map((veto) => (
      <div key={veto.id} className={`rl${veto.agrees ? "" : " bad"}`} data-k="veto" data-tie="1">
        <span className="nm">{veto.name}</span>
        <span className="ld" />
        <b>{veto.agrees ? "agrees" : "refuses"}</b>
        <i className="kn" />
      </div>
    ))
  ) : (
    <div className="rl">
      <span className="nm">No one</span>
    </div>
  );

  return (
    <div className={law ? "rc" : "rc act"} id="pb" ref={box}>
      <div className="head">
        <i />
        <i />
        <span>The clerk's receipt · {receipt.title}</span>
      </div>
      <div className="stub">
        <div className="paper">
          <h5>Spent when you sign</h5>
          {charge.map((line) => row("now", line, false))}
          <h5>Must agree</h5>
          {mustAgree}
        </div>
      </div>
      <div className="stub">
        <div className="paper">
          {law ? (
            <>
              <h5>If it {passWord}</h5>
              {receipt.pass.filter((line) => line.target !== "group").map((line) => row("pass", line, true))}
              {count ? (
                <>
                  <h5>The chamber, need {count.need}</h5>
                  <div className="rl" data-k="ch" data-tie="1">
                    <span className="nm">
                      {count.factions.reduce((sum, f) => sum + f.for, 0)} for, {count.factions.reduce((sum, f) => sum + f.hesitant, 0)} hesitant
                    </span>
                    <span className="ld" />
                    <b>{count.factions.reduce((sum, f) => sum + f.against, 0)} against</b>
                    <i className="kn" />
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              <h5>When you sign</h5>
              {lands.map((line) => row("now", line, true))}
            </>
          )}
        </div>
      </div>
      <div className="stub">
        <div className="paper">
          <h5>Support, when you sign</h5>
          {groups.map((line) => row("now", line, true))}
          {law && receipt.pass.some((line) => line.target === "group") ? (
            <>
              <h5>Support, if it {passWord}</h5>
              {receipt.pass.filter((line) => line.target === "group").map((line) => row("pass", line, true))}
            </>
          ) : null}
        </div>
      </div>
      {law ? (
        <div className="stub">
          <div className="paper">
            <h5>If it {failWord}</h5>
            {receipt.fail.map((line) => row("fail", line, false))}
          </div>
        </div>
      ) : null}
      <div className="acts">
        <button
          className="btn accent"
          id="sign"
          disabled={!signable}
          title={receipt.blocked ? `${receipt.blocked.name}: ${receipt.blocked.reason}` : undefined}
          onClick={onSign}
        >
          <i className="chg" />
          <Icon id="i-pen" />
          Sign it
        </button>
        <button className="btn" id="tear" onClick={onTear}>
          Tear up
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `src/desk/GroupFile.tsx`** (the glance file)

```tsx
// The glance file (R36), opened from a rim row: it flies out of the row to the chamber's centre on a spring and back
// into it on close. Ported from the mock's openFile, closeFile and fileHTML.
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { RimRow } from "../../worker/desk";
import { meter, reduced, spring } from "./fx";
import { Mark } from "./Emblem";
import { Icon, LINE_ICON } from "./Icon";
import { atStage, standing } from "./paint";

type Props = { row: RimRow; fullName: string; kicker: string; turn: number; turnWord: string; onClose: () => void };

const flyFrom = (from: DOMRect, to: DOMRect) =>
  `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px,${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${Math.max(0.15, from.height / to.height).toFixed(3)})`;

export function GroupFile({ row, fullName, kicker, turn, turnWord, onClose }: Props) {
  const card = useRef<HTMLElement>(null),
    scrim = useRef<HTMLDivElement>(null),
    closing = useRef(false);
  const origin = () => document.querySelector<HTMLElement>(`.hm[data-h="${CSS.escape(row.id)}"]`);

  useLayoutEffect(() => {
    const el = card.current!;
    atStage(el);
    el.querySelector<HTMLElement>(".fc-x")!.focus({ preventScroll: true });
    const from = origin();
    if (reduced() || !from) return;
    scrim.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    meter("open a file", 1300);
    el.animate(
      [{ transform: flyFrom(from.getBoundingClientRect(), el.getBoundingClientRect()), opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "none", opacity: 1 }],
      spring(230, 24),
    );
    el.querySelectorAll(".st").forEach((part, i) =>
      part.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], {
        duration: 320,
        delay: 140 + i * 55,
        easing: "cubic-bezier(.22,1,.36,1)",
        fill: "backwards",
      }),
    );
    el.querySelector(".fc-bar i")?.animate([{ transform: "scaleX(0)" }, { transform: `scaleX(${row.support / 100})` }], {
      duration: 700,
      delay: 220,
      easing: "cubic-bezier(.22,1,.36,1)",
      fill: "backwards",
    });
    el.querySelector(".red")?.animate([{ transform: "scale(1)" }, { transform: "scale(1.07)" }, { transform: "scale(1)" }], {
      duration: 420,
      delay: 760,
      easing: "ease-out",
    });
  }, []); // eslint-disable-line

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = card.current!,
      from = origin();
    from?.focus({ preventScroll: true });
    if (reduced() || !from) return onClose();
    meter("close a file", 400);
    scrim.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" });
    el.animate([{ transform: "none", opacity: 1 }, { transform: flyFrom(from.getBoundingClientRect(), el.getBoundingClientRect()), opacity: 0 }], {
      duration: 260,
      easing: "cubic-bezier(.5,0,.75,0)",
      fill: "forwards",
    }).finished.then(onClose);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === "Escape" && close();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }); // eslint-disable-line

  const glance = row.glance;
  const red = glance?.hates.find((hate) => hate.redLine);
  const votes = row.votes ? `${row.votes} of 100 votes on you` : "No vote on you";
  return (
    <>
      <div className="scrim" ref={scrim} onClick={close} />
      <article
        ref={card}
        className={`fcard${row.margin < 0 ? " dn" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fc-n"
        style={{ "--gl": row.tint.light, "--gd": row.tint.dark } as CSSProperties}
      >
        <header className="fc-h">
          <span className="fc-i">
            <Mark emblem={row.emblem} icon={LINE_ICON[row.icon]} />
          </span>
          <div className="fc-hd">
            <p className="fc-k">{kicker}</p>
            <h2 id="fc-n">{fullName}</h2>
            {glance?.face ? (
              <p className="fc-r">
                <b>{glance.face.name}</b>, {glance.face.role.split(";")[0]}
              </p>
            ) : null}
          </div>
          <button className="fc-x" aria-label="Close the file" onClick={close}>
            <Icon id="i-x" />
          </button>
        </header>
        <div className="fc-b">
          <div className="fc-s st">
            <b className="fc-num num">{row.support}</b>
            <div className="fc-m">
              <span className="fc-bar">
                <i style={{ transform: `scaleX(${row.support / 100})` }} />
                <em style={{ left: `${row.line}%` }}>
                  <span className="num">line {row.line}</span>
                </em>
              </span>
              <p className="fc-st">
                {standing(row, turn, turnWord, false)} · {votes}
              </p>
            </div>
          </div>
          {glance ? (
            <>
              <div className="fc-t w st">
                <h3>Wants</h3>
                <ul>
                  {glance.wants.map((want) => (
                    <li key={want} className="tg tw">
                      <Icon id="i-check" />
                      <span>{want}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="fc-t h st">
                <h3>Hates</h3>
                <ul>
                  {glance.hates
                    .filter((hate) => !hate.redLine)
                    .map((hate) => (
                      <li key={hate.tag} className="tg th">
                        <Icon id="i-x" />
                        <span>{hate.tag}</span>
                      </li>
                    ))}
                  {red ? (
                    <li className="tg red">
                      <Icon id="i-flame" />
                      <span>{red.tag}</span>
                      <small>Red line</small>
                    </li>
                  ) : null}
                </ul>
              </div>
              <p className="fc-if st">
                <Icon id="i-bolt" />
                <span>
                  <b>If it strikes:</b> {glance.strike}
                </span>
              </p>
            </>
          ) : null}
        </div>
      </article>
    </>
  );
}
```

- [ ] **Step 7: `src/desk/Sheet.tsx`** (the resources sheet, plus the In force block)

```tsx
// The resources sheet: three stat cards (P3 round 1 A) that slide in from the right on a spring, pips counting up in
// blocks of five; a change landing while it is open lights what filled or drained it. The In force block (not in the
// mock) lists the acts still running, with Withdraw where no one must agree.
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { ResourceCard, ReviewLine } from "../../worker/desk";
import type { InForce } from "../api";
import { meter, reduced, roll, signed, spring } from "./fx";
import { Icon, RESOURCE_ICON } from "./Icon";
import { Live } from "./Live";
import { RESOURCE_TOKEN } from "./paint";

/** Set while the sheet is open: a resource line landing paints its card. */
export let paintSheet: ((line: ReviewLine) => void) | null = null;
const pipsOn = (value: number) => Math.min(20, Math.round(value / 5));
const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

function paintCard(sheet: HTMLElement, line: ReviewLine) {
  if (line.target !== "resource") return;
  const card = sheet.querySelector<HTMLElement>(`.rk[data-k="${CSS.escape(line.id)}"]`);
  if (!card) return;
  const delta = line.to - line.from,
    was = pipsOn(line.from),
    now = pipsOn(line.to),
    pips = [...card.querySelectorAll<HTMLElement>(".pips i")];
  card.classList.toggle("z", line.to === 0);
  pips.forEach((pip, j) => pip.style.setProperty("--d", String(delta >= 0 ? Math.max(0, j - was) : Math.max(0, was - 1 - j))));
  pips.forEach((pip, j) => pip.classList.toggle("on", j < now));
  roll(card.querySelector(".rk-h b")!, line.from, line.to, reduced() ? 0 : 200 + Math.abs(now - was) * 28);
  if (!delta) return;
  const change = card.querySelector<HTMLElement>(".rk-h .dlt")!;
  change.textContent = signed(delta);
  change.className = `dlt num ${delta > 0 ? "up" : "dn"}`;
  const column = card.querySelector<HTMLElement>(delta > 0 ? ".in" : ".out")!;
  if (reduced()) {
    change.style.opacity = "1";
    column.classList.add("lit");
    return;
  }
  change.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none", offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2200 });
  column.animate(
    [{ backgroundColor: "transparent" }, { backgroundColor: `color-mix(in srgb,var(--${delta > 0 ? "up" : "danger"}) 16%,transparent)`, offset: 0.2 }, { backgroundColor: "transparent" }],
    { duration: 1600, easing: "ease-out" },
  );
  card.animate(
    delta < 0
      ? [{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(4px)" }, { transform: "none" }]
      : [{ transform: "none" }, { transform: "translateY(-4px) scale(1.012)" }, { transform: "none" }],
    { duration: 380 },
  );
}

type Props = {
  resources: ResourceCard[];
  turnWord: string;
  inForce: InForce[];
  onWithdraw: (id: string, button: HTMLElement) => void;
  onClose: () => void;
};

export function Sheet({ resources, turnWord, inForce, onWithdraw, onClose }: Props) {
  const sheet = useRef<HTMLElement>(null),
    scrim = useRef<HTMLDivElement>(null),
    closing = useRef(false);
  useLayoutEffect(() => {
    const el = sheet.current!,
      cards = el.querySelector<HTMLElement>(".rks")!;
    el.querySelector<HTMLElement>("#rs-x")!.focus({ preventScroll: true });
    // A short screen tightens the cards step by step before any text drops under 16 px.
    const over = () => [...cards.querySelectorAll<HTMLElement>(".rk")].some((card) => card.scrollHeight > card.clientHeight + 1);
    for (const fit of ["f1", "f2", "f3", "f4"]) {
      if (!over()) break;
      cards.classList.add(fit);
    }
    paintSheet = (line) => paintCard(el, line);
    if (!reduced()) {
      scrim.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
      meter("open resources", 1500);
      el.animate([{ transform: "translateX(105%)" }, { transform: "none" }], spring(210, 24));
      el.querySelectorAll<HTMLElement>(".rk").forEach((card, i) => {
        const value = resources[i].value,
          on = pipsOn(value),
          pips = [...card.querySelectorAll<HTMLElement>(".pips i")];
        card.animate([{ transform: "translateX(60px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, delay: 120 + i * 90, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
        pips.forEach((pip, j) => {
          pip.classList.remove("on");
          pip.style.setProperty("--d", String(j));
        });
        setTimeout(() => {
          pips.forEach((pip, j) => pip.classList.toggle("on", j < on));
          roll(card.querySelector(".rk-h b")!, 0, value, on * 28 + 200);
        }, 260 + i * 90);
        card.querySelectorAll(".tr i").forEach((bar, j) =>
          bar.animate([{ transform: "scaleY(0)" }, { transform: "none" }], { duration: 480, delay: 380 + i * 90 + j * 40, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" }),
        );
      });
    }
    return () => {
      paintSheet = null;
    };
  }, []); // eslint-disable-line

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (reduced()) return onClose();
    scrim.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" });
    sheet.current!.animate([{ transform: "none" }, { transform: "translateX(105%)" }], { duration: 280, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }).finished.then(onClose);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === "Escape" && close();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }); // eslint-disable-line

  return (
    <>
      <div className="scrim" ref={scrim} onClick={close} />
      <section className="rsheet" role="dialog" aria-modal="true" aria-label="Resources" ref={sheet}>
        <header className="rs-h">
          <h2>Resources</h2>
          <button className="fc-x" id="rs-x" aria-label="Close resources" onClick={close}>
            <Icon id="i-x" />
          </button>
        </header>
        <div className="rks">
          {resources.map((card) => {
            const first = card.history[0],
              last = card.history.at(-1)!,
              top = Math.max(...card.history, 10),
              on = pipsOn(card.value);
            return (
              <article key={card.key} className={`rk${card.value === 0 ? " z" : ""}`} data-k={card.key} style={{ "--c": `var(--${RESOURCE_TOKEN[card.key]})` } as CSSProperties}>
                <div className="rk-h">
                  <span className="gem">
                    <Icon id={RESOURCE_ICON[card.icon]} />
                  </span>
                  <h3>{card.name}</h3>
                  <span className="dlt num" />
                  <Live className="num" text={card.value} />
                </div>
                <div className="rk-m">
                  <div>
                    <div className="pips" aria-hidden="true">
                      {Array.from({ length: 20 }, (_, i) => (
                        <i key={i} className={i < on ? "on" : ""} />
                      ))}
                    </div>
                    <div className="pk num">
                      <span>0</span>
                      <span>50</span>
                      <span>100</span>
                    </div>
                  </div>
                  <div>
                    <div className="tr" aria-label={`The last ${card.history.length} ${turnWord}s: ${card.history.join(", ")}`}>
                      {card.history.map((value, i) => (
                        <i key={i} style={{ "--h": Math.max(4, (value / top) * 100) } as CSSProperties} />
                      ))}
                    </div>
                    <div className="trc">
                      {card.history.length} {turnWord}s <b className="num">{signed(last - first) || "±0"}</b>
                    </div>
                  </div>
                </div>
                <div className="rk-g">
                  <div className="in">
                    <h4>
                      <Icon id="i-arrow" />
                      Fills it
                    </h4>
                    <ul>
                      {card.earn.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="out">
                    <h4>
                      <Icon id="i-lose" />
                      Drains it
                    </h4>
                    <ul>
                      {card.spend.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {card.fails ? (
                  <p className="zero">
                    <b>At 0</b>
                    <span>{capitalise(card.fails)}</span>
                  </p>
                ) : null}
              </article>
            );
          })}
          {inForce.length ? (
            <section className="rinf">
              <h4 className="kicker">In force</h4>
              <ul>
                {inForce.map((act) => (
                  <li key={act.id}>
                    <span>{act.title}</span>
                    {act.repealVetoes.length ? (
                      <small>needs a repeal</small>
                    ) : (
                      <button className="btn" onClick={(event) => onWithdraw(act.id, event.currentTarget)}>
                        Withdraw
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}
```

The React-rendered `.rk-h` number uses `Live` (no `className="n"`: the mock styles `.rk-h b`).

- [ ] **Step 8: `src/desk/EventCard.tsx` and `src/desk/Composer.tsx`**

```tsx
// A card on the desk (not in the mock): the glance file's shell with the card's text and its answers as buttons.
// It holds End turn until it is answered or declined (R33); a relief card cannot be declined.
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { ViewEvent } from "../api";
import { Icon } from "./Icon";
import { atStage } from "./paint";

const KIND: Record<string, { icon: string; word: string }> = {
  crisis: { icon: "i-alert", word: "A crisis" },
  relief: { icon: "i-hand", word: "Relief" },
  foreign: { icon: "i-globe", word: "From abroad" },
  swan: { icon: "i-bolt", word: "Out of nowhere" },
};

type Props = {
  event: ViewEvent;
  turnWord: string;
  busy: boolean;
  onAnswer: (stance: number, from: HTMLElement) => void;
  onDecline: (from: HTMLElement) => void;
};

export function EventCard({ event, turnWord, busy, onAnswer, onDecline }: Props) {
  const card = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    atStage(card.current!);
    card.current!.querySelector<HTMLElement>("[data-stance]")?.focus({ preventScroll: true });
  }, []);
  const kind = KIND[event.kind ?? "crisis"] ?? KIND.crisis;
  const stances = event.card?.stances ?? event.stances;
  return (
    <>
      <div className="scrim" />
      <article ref={card} className="fcard ev" role="dialog" aria-modal="true" aria-labelledby="ev-t" style={{ "--gl": "var(--accent)", "--gd": "var(--accent)" } as CSSProperties}>
        <header className="fc-h">
          <span className="fc-i">
            <Icon id={kind.icon} />
          </span>
          <div className="fc-hd">
            <p className="fc-k">
              {kind.word} · {turnWord[0].toUpperCase() + turnWord.slice(1)} {event.turn}
            </p>
            <h2 id="ev-t">{event.card?.title ?? "A card on the desk"}</h2>
          </div>
          <span />
        </header>
        <div className="fc-b">
          {event.card?.body ? <p className="ev-b">{event.card.body}</p> : null}
          <div className="ev-s">
            {stances.map((stance, i) => (
              <button key={i} className="btn" data-stance={i} disabled={busy} onClick={(e) => onAnswer(i, e.currentTarget)}>
                {stance}
              </button>
            ))}
          </div>
          {event.kind !== "relief" ? (
            <button className="btn ev-no" disabled={busy} onClick={(e) => onDecline(e.currentTarget)}>
              Decline it
            </button>
          ) : null}
        </div>
      </article>
    </>
  );
}
```

```tsx
// The composer: the instrument chip, the act typed in the player's own words, Price it, and End turn.
import { memo, useState } from "react";
import type { GameView } from "../api";
import { settleVerb, type VerbKey } from "../rules";
import { play } from "./fx";
import { Icon, VERB_ICON } from "./Icon";

type Props = {
  instruments: GameView["instruments"];
  priced: VerbKey | null;
  priceable: boolean;
  endLabel: string;
  endable: boolean;
  onPrice: (text: string) => void;
  onEnd: () => void;
};

export const Composer = memo(function Composer({ instruments, priced, priceable, endLabel, endable, onPrice, onEnd }: Props) {
  const [text, setText] = useState("");
  const verb = priced ?? settleVerb(text, instruments);
  const ready = priceable && text.trim().length >= 12;
  const go = (button: HTMLElement | null) => {
    if (!ready) return;
    if (button) play(button, { scale: [1, 0.94, 1] }, { duration: 0.18 }).catch(() => {});
    onPrice(text);
  };
  return (
    <div className="cmp">
      <div className="cbox sf">
        <span className="vpick">
          <Icon id={VERB_ICON[verb ?? "decree"]} />
          <span>{verb ? (instruments[verb]?.name ?? verb) : "Act"}</span>
        </span>
        <input
          className="actx"
          id="actx"
          aria-label="Your act"
          placeholder="Type an act, then price it"
          maxLength={1200}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && go(document.getElementById("go"))}
        />
        <button className="btn accent" id="go" disabled={!ready} onClick={(event) => go(event.currentTarget)}>
          <Icon id="i-ballot" />
          Price it
        </button>
      </div>
      <button className="btn endt" disabled={!endable} onClick={onEnd}>
        {endLabel}
      </button>
    </div>
  );
});
```

- [ ] **Step 9: Append the "not in the mock" CSS** inside the `.desk { }` wrapper of `src/desk/desk.css` (and the one keyframes after it)

```css
  /* ---- not in the mock: what the game needs that the mock never drew, built from the mock's own atoms ---- */
  .tools {
    display: flex;
    gap: 0.75rem;
    margin-left: auto;
  }
  .tools button {
    min-height: 2.75rem;
    font: 700 0.875rem/1 var(--ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .tools button:hover {
    color: var(--ink);
  }
  .tag0 {
    flex-direction: column;
  }
  .tag0 small {
    display: block;
    margin-top: 0.375rem;
    font: 500 0.9375rem/1.3 var(--ui);
    color: var(--ink-2);
    text-align: center;
  }
  .tag0.bad {
    color: var(--danger);
  }
  .rc.act {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.1fr) auto;
  }
  .rc.act .head {
    grid-column: 1/4;
  }
  .rc.act .acts {
    grid-column: 4;
  }
  .rc .head.wait i {
    animation: printing 0.5s steps(1) infinite alternate;
  }
  .rc .head.wait i:nth-child(2) {
    animation-delay: 0.25s;
  }
  .gleg .term {
    min-height: 1.75rem;
    margin-left: 0.375rem;
    padding: 0.125rem 0.625rem;
    font: 600 0.9375rem/1.2 var(--ui);
    letter-spacing: 0;
    text-transform: none;
  }
  .lockb.no {
    background: var(--danger);
  }
  .ev-b {
    margin: 0;
    font-size: 1.125rem;
    line-height: 1.45;
  }
  .ev-s {
    display: grid;
    gap: 0.5rem;
  }
  .ev-s .btn {
    justify-content: flex-start;
    min-height: 2.75rem;
    padding: 0.5rem 1rem;
    white-space: normal;
    text-align: left;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 600;
  }
  .ev-no {
    justify-self: start;
  }
  .rinf ul {
    list-style: none;
    margin: 0.375rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.375rem;
  }
  .rinf li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 1rem;
  }
  .rinf small {
    color: var(--ink-2);
  }
  .rinf .btn {
    min-height: 2.25rem;
    padding: 0 0.75rem;
  }
```

After the wrapper:

```css
@keyframes printing {
  to {
    background: #7fd6a3;
    box-shadow: 0 0 0.5rem #7fd6a3;
  }
}
```

- [ ] **Step 10: Write `src/Desk.tsx`** (replaces the old file entirely)

```tsx
// The desk: the approved mock (docs/design/mock/desk.html) in React. React draws the structure from the server's
// DeskView; the desk's moments (the receipt's printing here, the flows in src/desk/flow.ts) animate that DOM by ref
// and hand the new view back to React only when they end, so nothing re-renders while anything moves.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { applyTokens, setThemeMode, themeMode } from "./theme";
import { sound } from "./sound";
import type { VerbKey } from "./rules";
import { cancelMoments, mountLayer } from "./desk/fx";
import { Chamber, type ChamberHandle } from "./desk/Chamber";
import { Composer } from "./desk/Composer";
import { EventCard } from "./desk/EventCard";
import { GroupFile } from "./desk/GroupFile";
import { Icon, RESOURCE_ICON } from "./desk/Icon";
import { Live } from "./desk/Live";
import { clearMarks, RESOURCE_TOKEN } from "./desk/paint";
import { Receipt } from "./desk/Receipt";
import { Rim } from "./desk/Rim";
import { Sheet } from "./desk/Sheet";
import "./desk/desk.css";

type Props = {
  game: GameView;
  act: Act;
  onGame: (game: GameView) => void;
  onError: (error: unknown) => void;
  onQuit: () => void;
  onReview: (active: boolean) => void;
};
type Phase = { kind: "idle" } | { kind: "pricing" } | { kind: "printing"; next: GameView } | { kind: "priced" };

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
const press = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
};

export default function Desk({ game, act, onGame, onError, onQuit, onReview }: Props) {
  // `shown` is what the desk draws; it follows `game` except while a moment holds it (frozen).
  const [shown, setShown] = useState(game);
  const frozen = useRef(false);
  useEffect(() => {
    if (!frozen.current) setShown(game);
  }, [game]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [torn, setTorn] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [dark, setDark] = useState(() => themeMode() === "dark");
  const [muted, setMuted] = useState(sound.muted);
  const [composerKey, setComposerKey] = useState(0);
  const deskRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chamberRef = useRef<ChamberHandle>(null);

  const view = shown.desk;
  const pack = shown.pack;
  const words = view.vocabulary;
  const place = pack.place.replace(/,.*$/, "");
  const receipt = torn ? null : view.receipt;

  useLayoutEffect(() => {
    applyTokens(view.theme, [...view.rim.map((row) => row.tint), ...view.factions.map((faction) => faction.tint)]);
  }, [game.scenario]); // eslint-disable-line
  useEffect(() => {
    const unmount = mountLayer(canvasRef.current!);
    return () => {
      cancelMoments();
      unmount();
    };
  }, []);

  const resourceNames = new Map(view.resources.map((card) => [card.key, card.name]));
  const costs = useCallback(
    (term: { cost: Record<string, number> }) =>
      Object.entries(term.cost)
        .filter(([, amount]) => amount > 0)
        .map(([key, amount]) => `${amount} ${(resourceNames.get(key as never) ?? key).toLowerCase()}`)
        .join(", ") || "free",
    [view.resources], // eslint-disable-line
  );
  const negotiate = useCallback(
    (faction: string, term: string) => {
      if (!frozen.current) act(() => api.negotiate(game, faction, term));
    },
    [act, game],
  );

  const price = async (text: string) => {
    if (frozen.current) return;
    frozen.current = true;
    clearMarks(deskRef.current!);
    setTorn(false);
    setPhase({ kind: "pricing" });
    try {
      const next = await api.price(game, text);
      if (!next.desk.receipt) {
        frozen.current = false;
        setPhase({ kind: "idle" });
        onGame(next); // a refusal: the placeholder says why
        return;
      }
      setPhase({ kind: "printing", next });
    } catch (error) {
      frozen.current = false;
      setPhase({ kind: "idle" });
      onError(error);
    }
  };
  const printed = () => {
    if (phase.kind !== "printing") return;
    frozen.current = false;
    onGame(phase.next);
    setPhase({ kind: "priced" });
  };
  const tear = () => {
    clearMarks(deskRef.current!);
    setTorn(true);
    setPhase({ kind: "idle" });
  };

  // Task 4 replaces these four with moments; until then each lands the new view at once.
  const sign = async () => {
    const law = view.receipt?.verb === "law";
    clearMarks(deskRef.current!);
    await act(async () => {
      const signed = await api.act(game);
      return law ? api.vote(signed) : signed;
    });
    setPhase({ kind: "idle" });
    setComposerKey((key) => key + 1);
  };
  const endTurn = () => act(() => api.endTurn(game));
  const openEvent = game.events.findIndex((event) => event.stance === undefined && !event.declined);
  const answer = (stance: number) => act(() => api.resolve(game, openEvent, stance));
  const decline = () => act(() => api.decline(game, openEvent));
  const withdraw = (id: string) => act(() => api.withdraw(game, id));

  const signable =
    !!receipt &&
    !receipt.blocked &&
    receipt.now.every((line) => line.target !== "resource" || (view.resources.find((card) => card.key === line.id)?.value ?? 0) + line.delta >= 0);
  const busy = phase.kind === "pricing" || phase.kind === "printing";
  const chamberRow = pack.constitution?.holders.find((holder) => holder.members === "seats")?.id ?? null;
  const fileRow = file ? game.desk.rim.find((row) => row.id === file) : undefined;
  const event = openEvent >= 0 && !frozen.current ? game.events[openEvent] : undefined;

  return (
    <div className="desk" ref={deskRef}>
      <main id="dk" className="dk" ref={mainRef}>
        <header className="top sf">
          <div className="id">
            <div>
              <b className="dname">{pack.title}</b>
              <span className="turn">
                {capitalise(words.turn)} {shown.turn} of {shown.turnsPerTerm} · {pack.place} · clerk {shown.calls.cap - shown.calls.spent} of {shown.calls.cap}
              </span>
            </div>
            <span className="tools">
              <button
                onClick={() => {
                  setThemeMode(dark ? "light" : "dark");
                  setDark(!dark);
                }}
              >
                {dark ? "Light" : "Dark"}
              </button>
              <button
                aria-pressed={!muted}
                onClick={() => {
                  sound.muted = !muted;
                  setMuted(!muted);
                }}
              >
                {muted ? "Sound off" : "Sound on"}
              </button>
              <button onClick={onQuit}>Leave</button>
            </span>
          </div>
          <div className="leds">
            {view.resources.map((card) => (
              <div
                key={card.key}
                className="led"
                data-r={card.key}
                role="button"
                tabIndex={0}
                aria-label={`${card.name}: open resources`}
                style={{ "--c": `var(--${RESOURCE_TOKEN[card.key]})` } as CSSProperties}
                onClick={() => !frozen.current && setSheet(true)}
                onKeyDown={press(() => !frozen.current && setSheet(true))}
              >
                <Icon id={RESOURCE_ICON[card.icon]} />
                <span className="lk">{card.name}</span>
                <Live className="n num" text={card.value} />
                <span className="dx" />
              </div>
            ))}
          </div>
          <div id="fv" className={`fv ${view.finalVote.value >= view.finalVote.need ? "over" : "under"}`}>
            <span className="fk">Final vote</span>
            <Live className="n num" text={view.finalVote.value} />
            <span className="fo">of 100, need {view.finalVote.need}</span>
            <i className="bar">
              <i style={{ width: `${view.finalVote.value}%` }} />
              <i className="ln" style={{ left: `${view.finalVote.need}%` }} />
            </i>
            <span className="dx" />
          </div>
        </header>
        <Rim side="home" heading={`In ${place}`} rows={view.rim.filter((row) => row.where === "home")} turn={shown.turn} turnWord={words.turn} testWord={pack.vocabulary.test} fileWord={words.file} open={file} onOpen={(id) => setFile(id)} />
        <Chamber
          ref={chamberRef}
          factions={view.factions}
          label={capitalise(pack.vocabulary.chamber)}
          need={receipt?.count?.need ?? pack.chamber.threshold}
          count={receipt?.count ?? null}
          costs={costs}
          onTerm={negotiate}
        />
        <Rim side="abroad" heading={`Beyond ${place}`} rows={view.rim.filter((row) => row.where !== "home")} turn={shown.turn} turnWord={words.turn} testWord={pack.vocabulary.test} fileWord={words.file} open={file} onOpen={(id) => setFile(id)} />
        <div className="tagw" id="tagw">
          {phase.kind === "pricing" ? (
            <div className="rc" id="pb">
              <div className="head wait">
                <i />
                <i />
                <span>The clerk prices your act</span>
              </div>
            </div>
          ) : phase.kind === "printing" ? (
            <Receipt receipt={phase.next.desk.receipt!} words={words} chamberRow={chamberRow} size={pack.chamber.size} printing signable={false} onPrinted={printed} onReveal={() => chamberRef.current?.reveal()} onSign={() => {}} onTear={() => {}} />
          ) : receipt ? (
            <Receipt receipt={receipt} words={words} chamberRow={chamberRow} size={pack.chamber.size} printing={false} signable={signable} onPrinted={() => {}} onReveal={() => {}} onSign={sign} onTear={tear} />
          ) : (
            <div className={`tag0 sf${shown.refusal ? " bad" : ""}`} id="tag">
              <span>
                <Icon id="i-scroll" />
                {shown.refusal ? `The clerk will not price it: ${shown.refusal.line}` : "The clerk prices your act here. Nothing lands until you sign it."}
              </span>
              {shown.pending ? <small>{shown.pending}</small> : null}
            </div>
          )}
        </div>
        <Composer
          key={composerKey}
          instruments={shown.instruments}
          priced={(receipt?.verb as VerbKey | undefined) ?? null}
          priceable={!busy && !receipt}
          endLabel={`End ${words.turn} ${shown.turn}`}
          endable={!busy && openEvent < 0}
          onPrice={price}
          onEnd={endTurn}
        />
      </main>
      <canvas id="fx" ref={canvasRef} aria-hidden="true" />
      {fileRow ? (
        <GroupFile
          key={fileRow.id}
          row={fileRow}
          fullName={game.holders.find((holder) => holder.id === fileRow.id)?.name ?? fileRow.name}
          kicker={`${words.file} · ${fileRow.where === "home" ? "At home" : capitalise(words.abroad)}`}
          turn={game.turn}
          turnWord={words.turn}
          onClose={() => setFile(null)}
        />
      ) : null}
      {sheet ? <Sheet resources={game.desk.resources} turnWord={words.turn} inForce={game.inForce} onWithdraw={(id) => withdraw(id)} onClose={() => setSheet(false)} /> : null}
      {event && !file && !sheet ? <EventCard key={event.id} event={event} turnWord={words.turn} busy={busy} onAnswer={(stance) => answer(stance)} onDecline={() => decline()} /> : null}
    </div>
  );
}
```

`onReview` is used from Task 4; keep it in the props now (`void onReview;` is not needed: an unused destructured prop does not fail `tsc`). Wire the Tear up and Sign handlers exactly as above; Task 4 swaps `sign`, `endTurn`, `answer`, `decline`, `withdraw` for moments.

- [ ] **Step 11: `src/App.tsx`: the new Desk props and the review hold**

1. Delete the `rolled`/`onRolled`/`rollKey`/`showRoll` logic and the `usoj:rolled` storage key.
2. Add `const [reviewing, setReviewing] = useState(false);`.
3. Split `act`'s catch into a reusable `recover(error)` (toast; on a 409 reload the game) and add `keep`:

```tsx
  const keep = (next: GameView) => {
    setGame(next);
    store.set("usoj:game", next.id);
  };
  const recover = (error: unknown) => {
    fail(error);
    // A 409 means the screen argued with a game that already moved; any failure mid-moment reloads the server's word.
    if (game)
      api
        .load(game.id)
        .then(setGame)
        .catch(() => {});
  };
```

   `act`'s catch becomes `recover(e); return false;`.
4. The game branch becomes: `reviewing ? <Desk .../> : showTest ? ... : showMidterm ? ... : won ? ... : over ? ... : <Desk .../>` where both Desk elements are:

```tsx
<Desk key={game.term} game={game} act={act} onGame={keep} onError={recover} onQuit={quit} onReview={setReviewing} />
```

- [ ] **Step 12: Delete what the old desk leaves orphaned**

```bash
git rm src/Compose.tsx src/PriceTag.tsx src/Strip.tsx src/Peek.tsx src/Wire.tsx src/Holders.tsx src/Rail.tsx src/Panels.tsx src/Feed.tsx src/Drawer.tsx src/Card.tsx src/Tour.tsx src/icons.tsx
bunx tsc -b 2>&1 | head -40
```

Then, for each export of `src/rules.ts`, `src/Ledger.tsx` and `src/api.ts`, keep it only if something outside the deleted files imports it:

```bash
for name in $(grep -oE "^export (const|function|type) [A-Za-z_]+" src/rules.ts src/Ledger.tsx | awk '{print $3}'); do
  echo "$name: $(grep -rlw "$name" src --include=*.ts --include=*.tsx | grep -v -e "src/rules.ts" -e "src/Ledger.tsx" -e ".test.ts" | tr '\n' ' ')"
done
grep -rn "api\.\(whip\|lobby\|amend\|adopt\)" src
```

Delete every export whose line lists no file (expected: `hueClass`, `roomTo`, `danger`, `ledgerValue`, `ledgerDelta`, `wireLabel`, `wireHue`, `unreadTabs`, `mandateOf`, and `Meter` in `src/Ledger.tsx`; keep `settleVerb`, `VERBS`, `VerbKey`, `LEDGER_KEYS`, `barAt`, `difficulty`, `allRead`, `shareText`, `squareClass`, `GRID_*`), delete their tests in `src/rules.test.ts`, delete `whip`, `lobby`, `amend`, `adopt` from `api` in `src/api.ts` when the grep finds no caller, and delete any type in `src/api.ts` that then has no user (`tsc` and a grep tell). Do not touch `src/styles.css` (Task 5 prunes it).

- [ ] **Step 13: Gates, the no-markup gate, and a Chrome spot check**

```bash
bun test worker src scripts && bunx tsc -b && bunx vite build
grep -rnE "innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML" src   # prints nothing
```

With the dev server and a seated Biden game, at 1440x900, light, compare side by side with `docs/design/mock/desk.html?world=biden-2021&demo=0` served from `docs/design`: the top bar (title, turn line, three ledgers at 178 px, the final vote pill), two rims of fixed-height rows washed in their hue with the ballot chip and its tooltip on hover, the chamber of 100 seats in six rows, the tally and the legend, the placeholder line, the composer. Click a row: the file flies out of the row to the chamber's centre; Escape flies it back. Click a ledger: the sheet slides in, pips count up. Type an act and Price it: the printer head waits with blinking lights while the clerk works (2 to 4 s), then the stubs feed out line by line, each knot lands on its target, the seats flip to for, hesitant and against when the chamber line prints, and the legend shows each faction's reason and terms. Sign it (no moment yet): the view updates. Dark mode: every row, seat and card takes its dark tint. Check Westeros in dark: IM Fell English SC for the display, the force act's "Must agree: Great houses" with its lock badge.

- [ ] **Step 14: Commit**

```bash
git add -A src
git commit -m "Port the desk up to Sign: rims, chamber, glance file, resources sheet, card, composer and the printed receipt, and drop the old desk"
```

---

### Task 4: The moments from Sign on

**Files:**
- Create: `src/desk/flow.ts`, `src/desk/Review.tsx`
- Modify: `src/Desk.tsx`

**Interfaces:**
- Consumes: Task 1's `fx.ts`; Task 3's `paint.ts` (`targetOf`, `paintRow`, `paintCentre`, `paintTally`, `clearMarks`, `iconNode`, `RESOURCE_TOKEN`), `SeatSpot`, `ChamberHandle.spots`, `paintSheet`, the Desk's `frozen` ref and phases; Task 2's `Verdict`, `ReviewLine`, and `GameView.desk`.
- Produces: `flow.ts`: `type Scene`, `signWave(scene, button)`, `deliver(lines, source, scene)`, `countVotes(scene, verdict)`, `verdictMoment(scene, verdict, words)`, `dropKnots(scene)`, `waitFor(promise, scene, words)`, `lineSource(scene, stage, line)`, `mergeReview(...lists)`; `Review.tsx`: `Review({ kicker, title, failed, lines, rows, resources, onBack })`.

- [ ] **Step 1: Write `src/desk/flow.ts`**

```ts
// The desk's moments from Sign on, ported from the approved mock: the shockwave, the seat-by-seat count, the verdict,
// and the couriers that carry each change to its target with its reason (P1-B). Pure DOM and canvas over the desk React
// drew; the caller hands React the new view when a moment ends.
import { animate, stagger } from "motion";
import type { ReviewLine, RimRow, Verdict } from "../../worker/desk";
import type { SeatSpot } from "./Chamber";
import { burst, centre, fly, pace, play, reduced, ring, roll, sfx, shake, signed, sleep, token, wave, addToLayer, type Point } from "./fx";
import { iconNode, paintCentre, paintRow, paintTally, RESOURCE_TOKEN, targetOf } from "./paint";
import { paintSheet } from "./Sheet";

export type Scene = {
  desk: HTMLElement; // the .desk wrapper: why-tags and the sweep go here, outside the shaking #dk
  main: HTMLElement; // #dk
  spots: SeatSpot[];
  rows: Map<string, RimRow>;
  names: Map<string, string>; // member id to name, for the hesitant calls
  turn: number;
  turnWord: string;
  need: number; // the final vote's bar
};
const find = (root: ParentNode, selector: string) => root.querySelector<HTMLElement>(selector)!;

function whyTag(scene: Scene, el: HTMLElement, delta: number, why: string, colour: string) {
  const box = el.getBoundingClientRect(),
    tag = document.createElement("div"),
    amount = document.createElement("b"),
    words = document.createElement("span");
  tag.className = "wtag";
  tag.style.setProperty("--tc", colour);
  amount.className = "num";
  amount.textContent = signed(delta);
  words.textContent = why;
  tag.append(amount, words);
  const right = box.left < innerWidth / 2;
  if (el.classList.contains("hm")) {
    tag.style.top = `${box.top + 6}px`;
    if (right) tag.style.left = `${box.right + 12}px`;
    else tag.style.right = `${innerWidth - box.left + 12}px`;
  } else {
    tag.style.top = `${box.bottom + 8}px`;
    tag.style.left = `${Math.min(innerWidth - 250, box.left)}px`;
  }
  scene.desk.append(tag);
  if (!reduced()) animate(tag, { opacity: [0, 1], scale: [0.9, 1] }, { duration: 0.25 });
  setTimeout(() => {
    if (tag.isConnected) animate(tag, { opacity: 0 }, { duration: 0.4 }).then(() => tag.remove());
  }, 3200 * pace());
}
function changeTag(el: HTMLElement, delta: number, colour: string) {
  const slot = el.querySelector(".dx");
  if (!slot) return;
  const tag = document.createElement("span");
  tag.className = "gd";
  tag.style.setProperty("--c", colour);
  tag.textContent = signed(delta);
  slot.replaceChildren(tag);
}

/** Commits one change: the number rolls, the bar moves, the warn state follows the line; an open sheet counts too. */
function land(line: ReviewLine, scene: Scene, ms = 650): Promise<void> {
  const el = targetOf(scene.main, line)!;
  const bar = el.querySelector<HTMLElement>(".bar>i");
  if (bar) bar.style.width = `${Math.min(100, line.to)}%`;
  if (line.target === "group") {
    const row = scene.rows.get(line.id);
    if (row) paintRow(el, row, line.to, scene.turn, scene.turnWord);
  } else if (line.target === "finalVote") {
    el.classList.toggle("over", line.to >= scene.need);
    el.classList.toggle("under", line.to < scene.need);
  } else paintSheet?.(line);
  return roll(find(el, ".n"), line.from, line.to, ms);
}

// A resource: coins travel one by one and the counter ticks as each lands (a cost ticks as each leaves).
async function resource(line: ReviewLine, source: Point, scene: Scene) {
  const el = targetOf(scene.main, line)!,
    number = find(el, ".n"),
    end = centre(number);
  const colour = token(`--${RESOURCE_TOKEN[line.id as keyof typeof RESOURCE_TOKEN]}`),
    danger = token("--danger");
  const steps = Math.min(16, Math.max(1, Math.abs(line.delta))),
    gain = line.delta > 0,
    flights: Promise<void>[] = [];
  sfx(gain ? "coins-in" : "coins-out");
  for (let i = 0; i < steps; i++) {
    const value = line.from + Math.round((line.delta * (i + 1)) / steps);
    const jitter = { x: source.x + (Math.random() - 0.5) * 24, y: source.y + (Math.random() - 0.5) * 14 };
    if (!gain) number.textContent = String(value);
    flights.push(
      fly({
        from: gain ? jitter : end,
        to: gain ? end : jitter,
        colour,
        radius: 5,
        coin: true,
        duration: 0.55 + Math.random() * 0.15,
        arc: 0.18 + Math.random() * 0.12,
        delay: i * 0.045,
        label: i === steps - 1 ? signed(line.delta) : null,
        onLand: () => {
          if (gain) {
            number.textContent = String(value);
            if (!reduced()) animate(number, { scale: [1.12, 1] }, { duration: 0.18 });
          }
          burst(gain ? end.x : source.x, gain ? end.y : source.y, { count: 3, colours: [colour], speed: 90, gravity: 0, size: 1.8, life: 0.35 });
        },
      }),
    );
    if (!gain && !reduced()) await sleep(45);
  }
  await Promise.all(flights);
  land(line, scene, 0);
  changeTag(el, line.delta, gain ? colour : danger);
  if (Math.abs(line.delta) >= 10) ring(end.x, end.y, gain ? colour : danger, 46, 3);
  whyTag(scene, el, line.delta, line.why, gain ? colour : danger);
}

function landGroup(line: ReviewLine, scene: Scene) {
  const el = targetOf(scene.main, line)!,
    colour = line.delta > 0 ? token("--up") : token("--danger"),
    disc = centre(find(el, ".hi"));
  land(line, scene, 450);
  changeTag(el, line.delta, colour);
  el.style.setProperty("--fc", colour);
  el.classList.remove("flash");
  void el.offsetWidth; // restart the flash animation
  el.classList.add("flash");
  ring(disc.x, disc.y, colour, 34, 2.5);
  burst(disc.x, disc.y, { count: 8, colours: [colour], speed: 150, gravity: 0, size: 2.2, life: 0.45, shrink: true });
  whyTag(scene, el, line.delta, line.why, colour);
  sfx(line.delta > 0 ? "land-up" : "land-down");
}

/** One courier per change, from its source to its target; then the voting groups send their share to the final vote. */
export async function deliver(lines: ReviewLine[], source: (line: ReviewLine) => Point, scene: Scene) {
  const resources = lines.filter((line) => line.target === "resource");
  const groups = lines.filter((line) => line.target === "group" && targetOf(scene.main, line));
  const vote = lines.find((line) => line.target === "finalVote");
  await Promise.all(resources.map((line) => resource(line, source(line), scene)));
  await sleep(200);
  await Promise.all(
    groups.map((line, i) =>
      fly({
        from: source(line),
        to: centre(find(targetOf(scene.main, line)!, ".hi")),
        colour: line.delta > 0 ? token("--up") : token("--danger"),
        label: signed(line.delta),
        radius: 7,
        duration: 0.75,
        delay: i * 0.14,
        onLand: () => landGroup(line, scene),
      }),
    ),
  );
  await sleep(250);
  if (!vote) return;
  const pill = find(scene.main, "#fv"),
    point = centre(find(pill, ".n"));
  const movers = groups.filter((line) => (scene.rows.get(line.id)?.votes ?? 0) > 0);
  await Promise.all(
    movers.map((line, i) =>
      fly({ from: centre(find(targetOf(scene.main, line)!, ".hi")), to: point, colour: token("--ink"), radius: 4.5, coin: true, duration: 0.6, arc: 0.2, delay: i * 0.08 }),
    ),
  );
  const colour = vote.to >= vote.from ? token("--up") : token("--danger");
  const rolling = land(vote, scene, 500);
  changeTag(pill, vote.delta, colour);
  ring(point.x, point.y, colour, 40, 3);
  if (!reduced()) animate(pill, { scale: [1, 1.1, 1] }, { duration: 0.35 });
  whyTag(scene, pill, vote.delta, vote.why, colour);
  await rolling;
  await sleep(500);
}

/** Where a change starts: its line on the receipt when it has one, else the receipt, else the chamber. */
export function lineSource(scene: Scene, stage: "now" | "pass" | "fail", line: ReviewLine): Point {
  const row = scene.main.querySelector(`#pb [data-k="${CSS.escape(`${stage}:${line.target}:${line.id}`)}"]`);
  return centre(row ?? scene.main.querySelector("#pb") ?? find(scene.main, "#stage"));
}

/** Sign: the button charges, then the shockwave runs out from the pen and shoves every panel it passes. */
export async function signWave(scene: Scene, button: HTMLElement) {
  const charge = find(button, ".chg"),
    ink = token("--ink");
  let level = 0,
    charging = true;
  addToLayer({
    step(seconds, context) {
      level = charging ? Math.min(1, level + seconds / 0.75) : Math.max(0, level - seconds * 3);
      const glow = context.createRadialGradient(innerWidth / 2, innerHeight / 2, innerHeight * (0.62 - 0.2 * level), innerWidth / 2, innerHeight / 2, innerHeight);
      glow.addColorStop(0, "transparent");
      glow.addColorStop(1, ink);
      context.globalAlpha = 0.2 * level;
      context.fillStyle = glow;
      context.fillRect(0, 0, innerWidth, innerHeight);
      context.globalAlpha = 1;
      return charging || level > 0;
    },
  });
  sfx("charge");
  await play(charge, { scaleX: [0, 1] }, { duration: 0.75 * pace(), ease: "easeIn" });
  charging = false;
  sfx("release");
  const origin = centre(button),
    accent = token("--accent");
  let time = 0;
  addToLayer({
    step(seconds, context) {
      time += seconds;
      const progress = time / 0.3;
      if (progress > 1) return false;
      context.fillStyle = accent;
      context.globalAlpha = 0.14 * (1 - progress);
      context.fillRect(0, 0, innerWidth, innerHeight);
      context.globalAlpha = 1;
    },
  });
  burst(origin.x, origin.y, { count: 40, colours: [accent, token("--navy"), "#e9b949"], speed: 800, gravity: 150, drag: 0.3, size: 3, shape: "fleck", life: 1 });
  shake(8, 360);
  const targets = [...scene.main.querySelectorAll(".led, #fv, .hm, .st-h, .hemi-w, .tly, .gleg, .vpick")];
  await wave(origin.x, origin.y, {
    colour: accent,
    targets,
    hit(target) {
      if (reduced()) return;
      const dx = target.x - origin.x,
        dy = target.y - origin.y,
        distance = Math.hypot(dx, dy) || 1;
      animate(target.el, { x: [0, (dx / distance) * 12, 0], y: [0, (dy / distance) * 12, 0] }, { duration: 0.5, ease: [0.2, 0.9, 0.3, 1] });
    },
  });
}

/** Shows the call chip with a waiting line while a slow answer (the vote, End turn) is out; hides it when it lands. */
export async function waitFor<T>(pending: Promise<T>, scene: Scene, words: string): Promise<T> {
  const quick = await Promise.race([pending.then(() => true), sleep(150).then(() => false)]);
  if (quick) return pending;
  const call = document.createElement("div"),
    label = document.createElement("b");
  call.className = "call";
  label.textContent = words;
  call.append(iconNode("i-ballot"), label);
  find(scene.main, "#stfx").replaceChildren(call);
  const pulse = animate(call, { opacity: [0.55, 1] }, { duration: 0.8, repeat: Infinity, repeatType: "reverse" });
  try {
    return await pending;
  } finally {
    pulse.stop();
    call.remove();
  }
}

/** The count, seat by seat: sure votes speed up, then each hesitant seat is called by name. */
export async function countVotes(scene: Scene, verdict: Verdict) {
  const { main, spots } = scene,
    size = spots.length;
  main.classList.add("floor");
  if (!reduced()) animate(find(main, "#stage"), { scale: [1, 1.02] }, { duration: 0.6, ease: "easeOut" });
  const call = document.createElement("div");
  call.className = "call";
  find(main, "#stfx").replaceChildren(call);
  paintCentre(main, 0, `for · ${verdict.need} needed`);
  paintTally(main, 0, 0, size);
  const circles = [...main.querySelectorAll<SVGCircleElement>("#hemi .seat")];
  const seatOf = bindSeats(spots, verdict);
  circles.forEach((circle) => circle.setAttribute("class", "seat v-wait"));
  let yes = 0,
    no = 0;
  const mark = (seat: Verdict["order"][number]) => {
    seat.yes ? yes++ : no++;
    circles[seatOf.get(seat.member)!]?.setAttribute("class", seat.yes ? "seat v-yes" : "seat v-no");
  };
  const sure = verdict.order.filter((seat) => !seat.hesitant),
    unsure = verdict.order.filter((seat) => seat.hesitant);
  if (reduced()) {
    sure.forEach(mark);
    paintTally(main, yes, no, size);
    paintCentre(main, yes, `for · ${verdict.need} needed`);
    await sleep(300);
  } else {
    let owed = 0;
    for (let i = 0; i < sure.length; i++) {
      mark(sure[i]);
      animate(circles[seatOf.get(sure[i].member)!], { scale: [1.7, 1] }, { duration: 0.22 });
      paintTally(main, yes, no, size);
      paintCentre(main, yes, `for · ${verdict.need} needed`);
      sfx("seat", yes);
      owed += 45 + (10 - 45) * Math.min(1, i / (sure.length * 0.65));
      if (owed >= 16) {
        await sleep(owed);
        owed = 0;
      }
    }
  }
  const beat = Math.min(1, 3 / Math.max(1, unsure.length));
  for (const seat of unsure) {
    const circle = circles[seatOf.get(seat.member)!];
    const name = document.createElement("b");
    name.textContent = scene.names.get(seat.member) ?? seat.member;
    call.replaceChildren(iconNode("i-ballot"), name, document.createElement("span"));
    await play(call, { opacity: [0, 1], y: [-10, 0] }, { duration: 0.18 });
    circle?.setAttribute("class", "seat p-hes");
    if (circle && !reduced()) animate(circle, { scale: [1, 1.35, 1] }, { duration: 0.45 });
    await sleep(520 * beat);
    mark(seat);
    const answer = document.createElement("span");
    answer.className = seat.yes ? "vv" : "vv no";
    answer.textContent = seat.yes ? "Yes" : "No";
    call.append(answer);
    if (circle && !reduced()) animate(circle, { scale: [2, 1] }, { type: "spring", stiffness: 600, damping: 12 });
    paintTally(main, yes, no, size);
    paintCentre(main, yes, `for · ${verdict.need} needed`);
    shake(2.5, 160);
    await sleep(520 * beat);
    await play(call, { opacity: 0 }, { duration: 0.12 });
  }
}

// Each member gets a seat in its faction's wedge: sure seats on the far side (yes before no), hesitant ones nearest the
// centre, matching the preview's paint so a hesitant seat is called where it was shown.
function bindSeats(spots: SeatSpot[], verdict: Verdict): Map<string, number> {
  const bound = new Map<string, number>();
  for (const factionId of new Set(spots.map((spot) => spot.faction.id))) {
    const wedge = spots.filter((spot) => spot.faction.id === factionId);
    const left = wedge.reduce((sum, spot) => sum + spot.angle, 0) / wedge.length > Math.PI / 2;
    const members = verdict.order.filter((seat) => seat.faction === factionId);
    const order = [
      ...members.filter((seat) => !seat.hesitant && seat.yes),
      ...members.filter((seat) => !seat.hesitant && !seat.yes),
      ...members.filter((seat) => seat.hesitant),
    ];
    const seats = left ? wedge : [...wedge].reverse();
    order.forEach((seat, i) => seats[i] && bound.set(seat.member, seats[i].index));
  }
  return bound;
}

/** The verdict: the court dims to 12%, the word sets letter by letter, then the whole desk stands up or sinks. */
export async function verdictMoment(scene: Scene, verdict: Verdict, words: { pass: string; fail: string }) {
  const { main, desk, spots } = scene,
    pass = verdict.passed,
    word = pass ? words.pass : words.fail;
  main.classList.remove("floor");
  const box = document.createElement("div"),
    letters = document.createElement("div"),
    score = document.createElement("span");
  box.className = pass ? "vd" : "vd fail";
  letters.className = "vw";
  letters.setAttribute("aria-label", word);
  for (const character of word) letters.append(Object.assign(document.createElement("span"), { textContent: character }));
  score.className = "vs num";
  score.textContent = `${verdict.yes} to ${verdict.no}`;
  box.append(letters, score);
  find(main, "#stfx").append(box);
  find(main, ".hemi-w").classList.add("dim");
  const spans = [...letters.children] as HTMLElement[];
  const circles = [...main.querySelectorAll<SVGCircleElement>("#hemi .seat")];
  const yesSeats = circles.filter((circle) => circle.classList.contains("v-yes")).sort((a, b) => spots[Number(b.dataset.i)].angle - spots[Number(a.dataset.i)].angle);
  sfx(pass ? "verdict-pass" : "verdict-fail");
  if (pass) {
    yesSeats.forEach((circle, i) => !reduced() && animate(circle, { scale: [1, 1.7, 1] }, { duration: 0.36, delay: i * 0.007 }));
    if (!reduced()) animate(find(main, ".ty-bar .ln"), { scaleY: [1, 3, 1], scaleX: [1, 3, 1] }, { duration: 0.5 });
  } else yesSeats.forEach((circle, i) => setTimeout(() => circle.classList.add("v-dark"), reduced() ? 0 : i * 9));
  box.style.opacity = "1";
  if (!reduced()) {
    spans.forEach((_, i) => setTimeout(() => shake(pass ? 2.5 : 3.5, 90), (i * 0.05 + 0.2) * 1000));
    await play(spans, { y: [-70, 0], scale: [1.9, 1], opacity: [0, 1] }, { duration: 0.22, delay: stagger(0.05), ease: [0.6, 0, 1, 0.6] });
    animate(score, { opacity: [0, 1], y: [8, 0] }, { duration: 0.25 });
  }
  const stageCentre = centre(find(main, "#stage"));
  const panels = [".top", ".rim-l", ".rim-r", "#stage", "#tagw", ".cmp"]
    .map((selector) => find(main, selector))
    .map((el) => ({ el, distance: Math.hypot(centre(el).x - stageCentre.x, centre(el).y - stageCentre.y) }))
    .sort((a, b) => a.distance - b.distance);
  if (pass) {
    shake(9, 420);
    if (!reduced()) {
      panels.forEach((panel) => animate(panel.el, { y: [0, -9, 0], scale: [1, 1.012, 1] }, { duration: 0.75, delay: panel.distance / 1600, ease: [0.2, 0.9, 0.3, 1] }));
      const sweep = document.createElement("div");
      sweep.className = "sweep";
      desk.append(sweep);
      animate(sweep, { x: ["-60%", "160%"] }, { duration: 1.1, ease: [0.4, 0, 0.2, 1] }).then(() => sweep.remove());
      const colours = [token("--accent"), token("--navy"), "#e9b949", token("--card")];
      const confetti = { count: 70, spread: 0.9, speed: 1100, gravity: 520, drag: 0.35, size: 5, shape: "fleck" as const, life: 2.4, colours };
      burst(0, -10, { ...confetti, direction: Math.PI * 0.3 });
      burst(innerWidth, -10, { ...confetti, direction: Math.PI * 0.7 });
    }
  } else {
    shake(15, 520, [0, 1]);
    if (!reduced()) {
      panels.forEach((panel) => animate(panel.el, { y: [0, 8, 3] }, { duration: 0.55, delay: panel.distance / 2200, ease: [0.3, 0, 0.3, 1] }));
      main.animate([{ filter: "none" }, { filter: "saturate(.3) brightness(.96)", offset: 0.15 }, { filter: "saturate(.3) brightness(.96)", offset: 0.75 }, { filter: "none" }], { duration: 1700 });
      const ink = token("--ink");
      let time = 0;
      addToLayer({
        step(seconds, context) {
          time += seconds;
          const progress = time / 1.7;
          if (progress > 1) return false;
          const edge = context.createRadialGradient(innerWidth / 2, innerHeight / 2, innerHeight * 0.3, innerWidth / 2, innerHeight / 2, innerHeight);
          edge.addColorStop(0, "transparent");
          edge.addColorStop(1, ink);
          context.globalAlpha = 0.4 * Math.sin((Math.min(1, progress * 1.6) * Math.PI) / 2) * (1 - Math.max(0, progress - 0.7) / 0.3);
          context.fillStyle = edge;
          context.fillRect(0, 0, innerWidth, innerHeight);
          context.globalAlpha = 1;
        },
      });
      spans.slice(-3).forEach((letter, i) => animate(letter, { rotate: [0, (i + 1) * 5], y: [0, (i + 1) * 4] }, { duration: 0.6, delay: 0.15 + i * 0.08, ease: [0.5, 0, 0.7, 1] }));
    }
  }
  await sleep(1500);
  if (!reduced()) panels.forEach((panel) => animate(panel.el, { y: 0, scale: 1 }, { duration: 0.4 }));
  await play(box, { opacity: 0, scale: 0.7 }, { duration: 0.3 });
  box.remove();
  find(main, ".hemi-w").classList.remove("dim");
  const verdictMark = document.createElement("span");
  verdictMark.className = pass ? "vmark" : "vmark fail";
  verdictMark.textContent = `${word} · ${verdict.yes} to ${verdict.no}`;
  find(main, "#stv").replaceChildren(verdictMark);
  if (!reduced()) {
    animate(verdictMark, { scale: [1.6, 1] }, { type: "spring", stiffness: 500, damping: 14 });
    animate(find(main, "#stage"), { scale: 1 }, { duration: 0.4 });
  }
}

/** A defeat: the knots fall off what they were tied to. */
export async function dropKnots(scene: Scene) {
  scene.main.querySelectorAll<HTMLElement>(".knot").forEach((knot, i) =>
    reduced() ? knot.remove() : animate(knot, { y: [0, 28], opacity: [1, 0], rotate: [0, i % 2 ? 25 : -25] }, { duration: 0.45, delay: i * 0.03 }).then(() => knot.remove()),
  );
  await sleep(500);
}

/** Two requests' reviews as one: the same target keeps its first from and its last to, and both reasons. */
export function mergeReview(...lists: (ReviewLine[] | null | undefined)[]): ReviewLine[] {
  const merged = new Map<string, ReviewLine>();
  for (const line of lists.flatMap((list) => list ?? [])) {
    const key = `${line.target}:${line.id}`,
      earlier = merged.get(key);
    merged.set(key, earlier ? { ...line, from: earlier.from, delta: line.to - earlier.from, why: `${earlier.why}; ${line.why}` } : line);
  }
  return [...merged.values()].filter((line) => line.delta !== 0);
}
```

- [ ] **Step 2: Write `src/desk/Review.tsx`**

```tsx
// The review: every change of the last moment with its amount and reason, which stays until "Back to the desk".
import { useLayoutEffect, useRef } from "react";
import type { ResourceCard, ReviewLine, RimRow } from "../../worker/desk";
import { play, reduced, signed } from "./fx";
import { Icon, LINE_ICON, RESOURCE_ICON } from "./Icon";
import { stagger } from "motion";

type Props = {
  kicker: string;
  title: string;
  failed: boolean;
  lines: ReviewLine[];
  rows: RimRow[];
  resources: ResourceCard[];
  onBack: () => void;
};

export function Review({ kicker, title, failed, lines, rows, resources, onBack }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (reduced()) return;
    play(box.current!, { opacity: [0, 1], y: [14, 0] }, { duration: 0.3 }).catch(() => {});
    play([...box.current!.querySelectorAll("li")], { opacity: [0, 1], x: [-8, 0] }, { duration: 0.25, delay: stagger(0.05) }).catch(() => {});
  }, []);
  const iconOf = (line: ReviewLine) => {
    if (line.target === "finalVote") return "i-ballot";
    if (line.target === "resource") return RESOURCE_ICON[resources.find((card) => card.key === line.id)?.icon ?? "bank"];
    return LINE_ICON[rows.find((row) => row.id === line.id)?.icon ?? "council"];
  };
  return (
    <div className="rv sf" id="rv" ref={box}>
      <div className="rv-h">
        <span className="kicker">{kicker}</span>
        <h3>{title}</h3>
        {failed ? <p>Nothing it promised lands.</p> : null}
        <button className="btn" id="back" onClick={onBack}>
          Back to the desk
        </button>
      </div>
      <ol className="rv-l">
        {lines.length ? (
          lines.map((line) => (
            <li key={`${line.target}:${line.id}`} className={line.delta > 0 ? "up" : "dn"}>
              <Icon id={iconOf(line)} />
              <span className="nm">{line.name}</span>
              <span className="ft num">
                {line.from} → {line.to}
              </span>
              <b className="num">{signed(line.delta)}</b>
              <span className="wy">{line.why}</span>
            </li>
          ))
        ) : (
          <li>
            <span className="nm">Nothing moved.</span>
          </li>
        )}
      </ol>
    </div>
  );
}
```

- [ ] **Step 3: Turn Sign, End turn, a card's answer and Withdraw into moments in `src/Desk.tsx`**

1. Extend the phase type and imports:

```tsx
import { beginMoment, cancelMoments, centre, fpsStart, fpsStop, mountLayer, sleep, Stale } from "./desk/fx";
import { countVotes, deliver, dropKnots, lineSource, mergeReview, signWave, verdictMoment, waitFor, type Scene } from "./desk/flow";
import { Review } from "./desk/Review";
import type { ReviewLine } from "./api";

type Phase =
  | { kind: "idle" }
  | { kind: "pricing" }
  | { kind: "printing"; next: GameView }
  | { kind: "priced" }
  | { kind: "waiting"; words: string } // End turn is out with the clerks: the printer head waits
  | { kind: "moving" }
  | { kind: "review"; kicker: string; title: string; failed: boolean; lines: ReviewLine[] };
```

2. Add the scene builder and the shared start, finish and failure paths (inside the component):

```tsx
  const scene = (): Scene => ({
    desk: deskRef.current!,
    main: mainRef.current!,
    spots: chamberRef.current!.spots,
    rows: new Map(view.rim.map((row) => [row.id, row])),
    names: new Map(shown.members.map((member) => [member.id, member.name])),
    turn: shown.turn,
    turnWord: words.turn,
    need: view.finalVote.need,
  });
  const start = (phaseNow: Phase) => {
    frozen.current = true;
    beginMoment();
    onReview(true);
    setFile(null);
    setPhase(phaseNow);
  };
  // The moment is over but its marks stay: `shown` stays frozen until Back to the desk, the new game goes to App now.
  const finish = (next: GameView, review: Omit<Extract<Phase, { kind: "review" }>, "kind">) => {
    onGame(next);
    setPhase({ kind: "review", ...review });
  };
  const failed = (error: unknown) => {
    if (error instanceof Stale) return;
    fpsStop();
    cancelMoments();
    clearMarks(deskRef.current!);
    frozen.current = false;
    onReview(false);
    setPhase({ kind: "idle" });
    onError(error); // App toasts and reloads the server's game
  };
  const back = () => {
    clearMarks(deskRef.current!);
    mainRef.current!.classList.remove("floor");
    frozen.current = false;
    setShown(game);
    setPhase({ kind: "idle" });
    setComposerKey((key) => key + 1);
    onReview(false);
  };
```

3. Replace `sign`:

```tsx
  const sign = async () => {
    const button = document.getElementById("sign");
    if (frozen.current || !view.receipt || !button) return;
    const law = view.receipt.verb === "law";
    const title = view.receipt.title;
    start({ kind: "moving" });
    button.setAttribute("disabled", "");
    const signing = api.act(shown);
    const voting = law ? signing.then((signed) => api.vote(signed)) : null;
    voting?.catch(() => {}); // handled where it is awaited
    try {
      const stage = scene();
      fpsStart("sign: charge and shockwave");
      await signWave(stage, button);
      const signed = await signing;
      const pen = centre(button);
      await deliver(signed.desk.review ?? [], (line) => (line.target === "resource" ? pen : lineSource(stage, "now", line)), stage);
      fpsStop();
      await sleep(250);
      if (!voting) {
        finish(signed, { kicker: `${title} · signed`, title: "What it changed", failed: false, lines: mergeReview(signed.desk.review) });
        return;
      }
      const voted = await waitFor(voting, stage, "The clerk calls the roll");
      const verdict = voted.desk.verdict!;
      fpsStart("the count");
      await countVotes(stage, verdict);
      fpsStop();
      fpsStart("verdict");
      await verdictMoment(stage, verdict, words);
      fpsStop();
      fpsStart("couriers");
      if (!verdict.passed) await dropKnots(stage);
      await deliver(voted.desk.review ?? [], (line) => lineSource(stage, verdict.passed ? "pass" : "fail", line), stage);
      fpsStop();
      finish(voted, {
        kicker: `${title} · ${verdict.passed ? words.pass : words.fail} ${verdict.yes} to ${verdict.no}`,
        title: verdict.passed ? "What it changed" : "What the defeat cost you",
        failed: !verdict.passed,
        lines: mergeReview(signed.desk.review, voted.desk.review),
      });
    } catch (error) {
      failed(error);
    }
  };
```

4. Replace `endTurn`, `answer`, `decline`, `withdraw` with one generic moment:

```tsx
  // End turn, a card's answer or decline, a withdrawal: the request, then every change travels from where it began.
  const changes = async (request: () => Promise<GameView>, from: () => { x: number; y: number }, kicker: string, title: string, waiting: string | null) => {
    if (frozen.current) return;
    const origin = from();
    start(waiting ? { kind: "waiting", words: waiting } : { kind: "moving" });
    try {
      const next = await request();
      setPhase({ kind: "moving" });
      await sleep(0);
      fpsStart(kicker);
      await deliver(next.desk.review ?? [], () => origin, scene());
      fpsStop();
      finish(next, { kicker, title, failed: false, lines: mergeReview(next.desk.review) });
    } catch (error) {
      failed(error);
    }
  };
  const tagCentre = () => centre(document.getElementById("tagw")!);
  const endTurn = () =>
    changes(() => api.endTurn(shown), tagCentre, `End of ${words.turn} ${shown.turn}`, `What the ${words.turn} changed`, "The clerks read every group that moved");
  const answer = (stance: number, button: HTMLElement) => {
    const point = centre(button);
    return changes(() => api.resolve(shown, openEvent, stance), () => point, game.events[openEvent].card?.title ?? "A card", "What your answer changed", null);
  };
  const decline = (button: HTMLElement) => {
    const point = centre(button);
    return changes(() => api.decline(shown, openEvent), () => point, game.events[openEvent].card?.title ?? "A card", "What declining it cost", null);
  };
  const withdraw = (id: string, button: HTMLElement) => {
    const point = centre(button);
    const title = game.inForce.find((law) => law.id === id)?.title ?? "The act";
    return changes(() => api.withdraw(shown, id), () => point, `${title} · withdrawn`, "What withdrawing it changed", null);
  };
```

   The sheet stays open during a withdrawal, so `paintSheet` lights Drains it as authority lands. Pass the button through: `onWithdraw={(id, button) => withdraw(id, button)}`, `onAnswer={(stance, button) => answer(stance, button)}`, `onDecline={(button) => decline(button)}`.

5. A refusal's cost travels too: in `price`, when `!next.desk.receipt` and `next.desk.review?.length`, run `changes(async () => next, tagCentre, "The clerk refused", "What the refusal cost", null)` instead of `onGame(next)` directly (keep the frozen/phase reset before it).
6. A law signed but not voted (the vote failed, the page reloaded): compute `const tabled = shown.bills.at(-1); const unvoted = shown.phase === "whip" && tabled?.id === shown.turn && !tabled.votes;` and, in the tag slot, before the placeholder branch, render:

```tsx
          ) : unvoted ? (
            <div className="tag0 sf" id="tag">
              <span>
                <Icon id="i-ballot" />
                {tabled!.title} waits for its vote.
                <button className="btn accent" id="callvote" onClick={callVote}>
                  Call the vote
                </button>
              </span>
            </div>
```

   with

```tsx
  const callVote = async () => {
    const title = shown.bills.at(-1)?.title ?? "The act";
    start({ kind: "moving" });
    try {
      const stage = scene();
      const voted = await waitFor(api.vote(shown), stage, "The clerk calls the roll");
      const verdict = voted.desk.verdict!;
      fpsStart("the count");
      await countVotes(stage, verdict);
      fpsStop();
      await verdictMoment(stage, verdict, words);
      await deliver(voted.desk.review ?? [], () => tagCentre(), stage);
      finish(voted, {
        kicker: `${title} · ${verdict.passed ? words.pass : words.fail} ${verdict.yes} to ${verdict.no}`,
        title: verdict.passed ? "What it changed" : "What the defeat cost you",
        failed: !verdict.passed,
        lines: mergeReview(voted.desk.review),
      });
    } catch (error) {
      failed(error);
    }
  };
```

7. The tag slot gains two branches at its top: `phase.kind === "review"` renders `<Review {...phase} rows={view.rim} resources={view.resources} onBack={back} />`; `phase.kind === "waiting"` renders the waiting printer head with `phase.words`. While `phase.kind` is `moving` or `review`, the receipt branch still renders the frozen `shown` receipt (the couriers leave from its lines); `Composer` gets `priceable={phase.kind === "idle" || phase.kind === "priced" ? !busy && !receipt : false}` and `endable={phase.kind === "idle" && openEvent < 0 && !unvoted}`. The event card renders only when `phase.kind === "idle"`.

- [ ] **Step 4: Gates and the no-markup gate**

```bash
bun test worker src scripts && bunx tsc -b && bunx vite build
grep -rnE "innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML" src   # prints nothing
```

- [ ] **Step 5: Chrome spot check** (1440x900, Biden light, then Westeros dark), side by side with the mock served from `docs/design`

1. Price a law ("Send $1,400 checks and extend jobless aid through the summer."), Sign: the button charges, the shockwave shoves every panel it passes, the spend coins leave the pen, support couriers leave their receipt lines; if the vote is slow, "The clerk calls the roll" pulses in the chamber; the count goes seat by seat, speeding up, then each hesitant senator is called by name with Yes or No; the verdict word sets letter by letter with the court at 12%; pass: the desk stands, gold sweep, ballot flecks; the couriers carry each change with its why-tag; the final vote rolls; the review lists every change and stays until Back to the desk.
2. End turn: the printer head waits ("The clerks read every group that moved", about 2 s per moved group), then each change travels from the receipt slot to its target, then the review. A card, if drawn, opens after Back to the desk; answer it: its changes travel from the button you pressed.
3. Open the sheet, Withdraw an act in force: authority's card counts down and Drains it lights.
4. Westeros: a force act has no count and no verdict: shockwave, couriers, review.
5. DevTools, Rendering, Emulate `prefers-reduced-motion: reduce`: the same flow ends in the same state with no travel and short fades.
6. DevTools console after one law: `window.deskFps` lists `sign: charge and shockwave`, `the count`, `verdict`, `couriers` with `avg` at or near the display rate.
7. Block `**/bills/*/vote` once in DevTools (Network request blocking) and sign a law: the moment stops, the toast shows, the desk reloads and shows "Call the vote"; unblock and press it: count, verdict, couriers, review.

- [ ] **Step 6: Commit**

```bash
git add src/Desk.tsx src/desk/flow.ts src/desk/Review.tsx
git commit -m "Play the desk's moments from Sign on: shockwave, seat-by-seat count, verdict, couriers and the review that waits for Back to the desk"
```

---

### Task 5: The other screens, restyled

**Files:**
- Modify: `src/styles.css`, `src/theme.tsx` (prune), `src/Landing.tsx`, `src/Match.tsx`, `src/Build.tsx`, `src/Seat.tsx`, `src/Midterm.tsx`, `src/Test.tsx`, `src/Won.tsx`, `src/Over.tsx`

**Interfaces:**
- Consumes: Task 1's `applyTokens`, base atoms and aliases; `worker/tokens.ts` `DEFAULT_THEME_TOKENS`.
- Produces: no new exports. `src/theme.tsx` ends with `FILL_DEFS`, `fillFor`, `initials` (the Hemicycle's), `mix`, `applyTokens`, `resetTokens`, `themeMode`, `setThemeMode`; `Ornament`, `applyTheme`, `resetTheme` are gone.

- [ ] **Step 1: Convert the old sheet to rem** (a throwaway script in the scratchpad, run from the repo root)

```ts
// to-rem.ts: run with `bun to-rem.ts`
const path = "src/styles.css";
const css = await Bun.file(path).text();
// Every length except those in media queries (which read the viewport, not the root size) becomes N/16 rem.
const out = css
  .split("\n")
  .map((line) =>
    line.trimStart().startsWith("@media")
      ? line
      : line.replace(/(-?\d*\.?\d+)px\b/g, (_, px) => (Number(px) === 0 ? "0" : `${+(Number(px) / 16).toFixed(4)}rem`)),
  )
  .join("\n");
await Bun.write(path, out);
```

Check: `grep -c "px" src/styles.css` now counts only media-query lines (`grep -n "px" src/styles.css | grep -v "@media"` prints nothing).

- [ ] **Step 2: Prune what only the old desk used from `src/styles.css`**

For each class selector in the sheet, keep the rule only if some remaining `src/*.tsx` or `src/desk/*.tsx` uses the class:

```bash
grep -oE "\.[a-zA-Z][a-zA-Z0-9_-]*" src/styles.css | sort -u | sed 's/^\.//' | while read name; do
  grep -rqwE "(className=[^>]*\b$name\b|\"$name\"|'$name'|\b$name\b)" src --include=*.tsx || echo "$name"
done
```

Delete the rules whose every class is in that list (expected: the old desk's sections from "the Desk: one page, 100dvh" through the drawer, sheet, strip, peek, wire, rail, feed and tour rules; the texture, halftone, press sheen and press wipe layers that `src/base.css`'s hatch replaces; `.orn` and the ornament rules; `.stampsm`). A rule shared with a surviving screen stays. Then remove the `:not(.desk *)` guard from any selector whose class no longer exists.

- [ ] **Step 3: Drop logos, stamps and the old theme from the screens**

1. Remove every `<Ornament ... />` and its import from `Landing.tsx`, `Match.tsx`, `Build.tsx`, `Seat.tsx`, `Midterm.tsx`, `Test.tsx`, `Won.tsx`, `Over.tsx`.
2. `Seat.tsx`: remove the oath stamp element (`<div className={`stamp ${stamped ? "hit" : ""}`} ...>`) and its CSS; keep the `stamped` state (it drives the sworn-in line and the wipe). Replace `applyTheme(pack.theme)` with `applyTokens(pack.themeTokens ?? DEFAULT_THEME_TOKENS)`.
3. `Build.tsx`: replace `applyTheme(...)` calls with `applyTokens(state.pack?.themeTokens ?? DEFAULT_THEME_TOKENS)` once the pack is ready, and nothing while fragments arrive (the default world stays).
4. `src/theme.tsx`: delete `SERIF`, `WEIGHTS`, `famq`, `stack`, `applyTheme`, `resetTheme`, `ORNAMENTS`, `OrnamentKind`, `Ornament`.

- [ ] **Step 4: Gates**

```bash
bun test worker src scripts && bunx tsc -b && bunx vite build
grep -rn "Ornament\|applyTheme\|resetTheme\|stampsm" src   # prints nothing
```

- [ ] **Step 5: Chrome spot check, light and dark, 1440x900 and 1920x1080**

Landing (daily card, archive), Match, Build (the wait), Seat (the briefing pages), Midterm, Test, Won, Over: each renders in the world's (or the default) fonts and palette, the same button, kicker and surface style as the desk, no ornament, crest or stamp, text 20% larger at 1920x1080, no horizontal scroll at 390 px wide, readable in dark. Then open the desk: it still matches the Task 4 check (no old rule leaks into it).

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Restyle the screens around the desk with the world tokens, one root scale and no ornaments or stamps"
```

---

### Task 6: End to end in real Chrome

**Files:**
- Create: `scripts/desk-e2e.py`, `docs/design/e2e/.gitignore`

**Interfaces:**
- Consumes: everything above, through the browser only: selectors `.dk`, `.hm[data-h]`, `.led[data-r]`, `#actx`, `#go`, `#pb`, `.rc.act`, `#sign`, `#tear`, `.tag0.bad`, `.call`, `.vd`, `.wtag`, `#rv`, `#back`, `.endt`, `.fcard.ev [data-stance]`, `#callvote`, `.bal-w`; `window.deskFps`.
- Produces: `docs/design/e2e/latest/` with `*.png`, `report.json` (fps per moment, long tasks, fonts, JS gzip size, errors, turns played) and `compare.html` (each app shot beside the mock's shot of the same moment).

- [ ] **Step 1: Write `docs/design/e2e/.gitignore`**

```
*
!.gitignore
```

- [ ] **Step 2: Write `scripts/desk-e2e.py`**

```python
# The desk end to end in real Chrome: one Biden term (every turn priced, signed where it can be, ended, every card
# answered, the midterm and the final vote clicked through) and one Westeros act, at 1440x900, light and dark. Leaves
# screenshots, the frame-rate log of every moment, long tasks, loaded fonts and the JS size in OUT, and compare.html
# pairing each shot with the approved mock's shot of the same moment.
# Run with the dev server up and the fixtures seeded: uv run --with playwright python scripts/desk-e2e.py [OUT] [MOCK_SHOTS]
import asyncio, gzip, json, pathlib, shutil, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/design/e2e/latest"
MOCK = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else pathlib.Path("/Users/deadpackets/workspace/UnitedStatesOfJev/docs/mocks/v4/feel/desk-shots")
URL = "http://localhost:5173"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ACTS = [
    "Send $1,400 checks and extend jobless aid through the summer.",
    "Order every federal agency to buy American steel for new projects.",
    "Nominate a new chair of the Federal Reserve who backs full employment.",
    "Pass a bill to fund roads, bridges and broadband in every state.",
    "Address the nation on vaccines and ask every adult to get a shot.",
    "Send more troops to NATO's eastern flank to reassure the allies.",
    "Pass a bill to cap insulin at $35 a month for everyone.",
    "Order the Justice Department to review police use of force.",
    "Spend $20 billion to reopen schools safely this spring.",
    "Pass a bill to raise the corporate tax rate to 28 percent.",
    "Lift the tariffs on Chinese consumer goods to ease prices.",
    "Pass a voting rights bill that restores the preclearance rule.",
    "Order the EPA to set new limits on power plant emissions.",
    "Spend on child care so parents can return to work.",
    "Pass a bill to fund chip factories in the United States.",
    "Address the nation on the border and the asylum backlog.",
    "Nominate a new ambassador to China who will press on Taiwan.",
    "Pass a bill to extend the child tax credit for another year.",
    "Order a freeze on new oil leases on federal land.",
    "Spend on veterans' health care for burn pit exposure.",
]
INIT = "window.__long=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push({ms:Math.round(e.duration),at:Math.round(e.startTime)})}).observe({type:'longtask',buffered:true});"
report = {"fps": [], "long": [], "fonts": [], "errors": [], "turns": [], "js_gzip_kb": None, "shots": []}

async def shot(page, name):
    await page.screenshot(path=str(OUT / f"{name}.png"))
    report["shots"].append(name)

async def collect(page):
    report["fps"] += await page.evaluate("(()=>{const f=window.deskFps||[];window.deskFps=[];return f})()")
    report["long"] += await page.evaluate("(()=>{const l=window.__long||[];window.__long=[];return l})()")

async def seat(page, scenario, faction, theme):
    await page.goto(URL)
    await page.evaluate(
        """([s,f,t])=>fetch('/api/games',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scenario:s,faction:f,promises:[0,1,2]})})
        .then(r=>r.json()).then(g=>{localStorage.setItem('usoj:game',g.id);localStorage.setItem('usoj:theme',t)})""",
        [scenario, faction, theme],
    )
    await page.reload()
    await page.wait_for_selector(".dk .hm", timeout=30000)
    await page.wait_for_timeout(1500)

async def stage(page):
    return await page.evaluate("fetch('/api/games/'+localStorage.getItem('usoj:game')).then(r=>r.json()).then(g=>g.stage)")

async def back(page):
    await page.wait_for_selector("#rv", timeout=180000)
    await page.wait_for_timeout(800)
    await page.click("#back")
    await page.wait_for_timeout(600)

async def answer_cards(page):
    while await page.query_selector(".fcard.ev [data-stance]"):
        await page.click(".fcard.ev [data-stance]")
        await back(page)

async def act(page, text, prefix=None):
    await page.fill("#actx", text)
    await page.click("#go")
    try:
        await page.wait_for_selector("#pb .acts, .tag0.bad", timeout=60000)
    except Exception:
        report["errors"].append(f"price timed out: {text}")
        return "none"
    if await page.query_selector(".tag0.bad"):
        return "refused"
    await page.wait_for_timeout(3000)  # the printing
    if prefix:
        await shot(page, f"{prefix}-2a-receipt")
    if await page.is_disabled("#sign"):
        await page.click("#tear")
        return "blocked"
    law = not await page.query_selector(".rc.act")
    await page.click("#sign")
    if prefix and law:
        await page.wait_for_function("document.querySelectorAll('#hemi .v-yes,#hemi .v-no').length>30", timeout=180000)
        await shot(page, f"{prefix}-2b-count")
        await page.wait_for_selector(".vd", timeout=60000)
        await page.wait_for_timeout(500)
        await shot(page, f"{prefix}-2e-verdict")
    if prefix:
        await page.wait_for_selector(".wtag", timeout=180000)
        await shot(page, f"{prefix}-2c-couriers")
        await page.wait_for_selector("#rv", timeout=180000)
        await page.wait_for_timeout(1200)
        await shot(page, f"{prefix}-2d-review")
    await back(page)
    return "law" if law else "act"

async def screens_until_desk(page):
    for _ in range(20):
        now = await stage(page)
        if now == "session" and await page.query_selector(".dk"):
            return now
        if now in ("won", "over"):
            return now
        buttons = await page.query_selector_all(".btn:not(.ghost):not([disabled])")
        if buttons:
            await buttons[0].click()
        await page.wait_for_timeout(2500)
    return await stage(page)

async def statics(page, prefix, rows):
    await shot(page, f"{prefix}-1-desk")
    for row in rows:
        await page.click(f'.hm[data-h="{row}"]')
        await page.wait_for_timeout(1500)
        await shot(page, f"{prefix}-3-file-{row}")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)
    await page.click('.led[data-r="treasury"]')
    await page.wait_for_timeout(1800)
    await shot(page, f"{prefix}-4-resources")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(500)

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, headless=False)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        await context.add_init_script(INIT)
        page = await context.new_page()
        page.on("pageerror", lambda e: report["errors"].append(str(e)))
        page.on("console", lambda m: m.type == "error" and report["errors"].append(m.text))

        # One Biden term, light.
        await seat(page, "biden-2021", "dem", "light")
        await statics(page, "biden-light", ["gop", "nato"])
        await page.hover('.hm[data-h="congress"] .bal-w')
        await page.wait_for_timeout(200)
        await page.screenshot(path=str(OUT / "biden-light-5-vote-tooltip.png"), clip={"x": 0, "y": 80, "width": 620, "height": 260})
        report["fonts"] = await page.evaluate("[...new Set([...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family))]")
        forced = False
        for turn, text in enumerate(ACTS, start=1):
            now = await screens_until_desk(page)
            if now in ("won", "over"):
                break
            await answer_cards(page)
            if turn == 2 and not forced:  # Review Focus 5: a vote that fails after the act was signed
                await page.route("**/bills/*/vote", lambda route: route.fulfill(status=503, content_type="application/json", body='{"error":"The chamber is in recess. Try again."}'), times=1)
            result = await act(page, text, "biden-light" if turn == 1 else None)
            if turn == 2 and result == "none":
                forced = True
                await page.wait_for_selector("#callvote", timeout=30000)
                await page.click("#callvote")
                await back(page)
                result = "law (vote retried)"
            report["turns"].append({"turn": turn, "act": text, "result": result})
            await collect(page)
            await page.click(".endt")
            await back(page)
            await collect(page)
        await screens_until_desk(page)
        await shot(page, "biden-light-7-end")

        # One Westeros act, dark.
        await seat(page, "westeros", "baratheon", "dark")
        await statics(page, "westeros-dark", ["lannister", "ironbank"])
        report["turns"].append({"world": "westeros", "result": await act(page, "Call the banners to clear the kingsroad of outlaws.", "westeros-dark")})
        await collect(page)

        # The desk at 1920x1080 (k = 1.2), and reduced motion.
        wide = await browser.new_page(viewport={"width": 1920, "height": 1080})
        await seat(wide, "biden-2021", "dem", "light")
        await wide.screenshot(path=str(OUT / "viewport-fhd-16x9.png"))
        still = await browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
        quiet = await still.new_page()
        await seat(quiet, "biden-2021", "dem", "light")
        await act(quiet, ACTS[0], None)
        await quiet.screenshot(path=str(OUT / "biden-light-6-reduced-motion-end.png"))
        await browser.close()

    assets = ROOT / "dist/client/assets"
    if assets.exists():
        report["js_gzip_kb"] = round(sum(len(gzip.compress(f.read_bytes())) for f in assets.glob("*.js")) / 1024, 1)
    report["slow_moments"] = [f for f in report["fps"] if f["avg"] < 58]
    report["long_over_50ms"] = [t for t in report["long"] if t["ms"] > 50]
    (OUT / "report.json").write_text(json.dumps(report, indent=1))

    (OUT / "mock").mkdir(exist_ok=True)
    rows = []
    for name in sorted({*report["shots"], "biden-light-5-vote-tooltip", "viewport-fhd-16x9", "biden-light-6-reduced-motion-end"}):
        mock = next((m for m in [MOCK / f"{name}.png", MOCK / f"{name.replace('-4-resources', '-4-resources-change')}.png"] if m.exists()), None)
        if mock:
            shutil.copy(mock, OUT / "mock" / mock.name)
        cell = f'<img src="mock/{mock.name}">' if mock else "<p>no mock shot</p>"
        rows.append(f"<tr><th>{name}</th><td><img src='{name}.png'></td><td>{cell}</td></tr>")
    (OUT / "compare.html").write_text(
        "<!doctype html><meta charset=utf-8><title>Desk: app against mock</title><style>body{font:14px system-ui;margin:16px}"
        "img{width:100%;border:1px solid #ccc}td{width:48%;vertical-align:top}th{text-align:left;padding-top:24px}</style>"
        f"<h1>The desk: app (left) against the approved mock (right)</h1><p>JS {report['js_gzip_kb']} KB gzipped · "
        f"{len(report['slow_moments'])} moments under 58 fps · {len(report['long_over_50ms'])} long tasks over 50 ms · fonts {report['fonts']}</p>"
        f"<table>{''.join(rows)}</table>"
    )
    print(json.dumps({k: report[k] for k in ("js_gzip_kb", "fonts", "slow_moments", "long_over_50ms", "errors")}, indent=1))

asyncio.run(main())
```

- [ ] **Step 3: Run it**

```bash
bunx vite build
bun run dev &   # or in its own terminal; the fixtures seeded as in Global Constraints
uv run --with playwright python scripts/desk-e2e.py
open docs/design/e2e/latest/compare.html
```

Expected: the printed summary shows `js_gzip_kb` under 200, `fonts` with at most three families per world, `slow_moments` empty, `long_over_50ms` empty, `errors` empty; `report.json` lists 20 Biden turns (or fewer when the term ended early) and the Westeros act; `compare.html` shows every app shot beside its mock shot. It takes about 15 to 20 minutes and makes real Luna and Jev calls (the clerk, the counts, End turn reads).

- [ ] **Step 4: Fix what it finds, within Track D's files, and run it again**

For each difference between an app shot and its mock shot that is not listed in the Decisions table (spacing, size, colour, copy, a moment out of order), fix it in the task's files and re-run Step 3. For each slow moment, open a DevTools Performance trace of that moment and fix the cause (a layout read inside a frame loop, a filter on a large element, a React render during the moment). If the JS budget fails because zod ships in the client, file cross-track request 4 and report the measured size; do not replace zod.

- [ ] **Step 5: Gates and commit**

```bash
bun test worker src scripts && bunx tsc -b && bunx vite build
grep -rnE "innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML" src   # prints nothing
git add scripts/desk-e2e.py docs/design/e2e/.gitignore
git commit -m "Check the desk end to end in real Chrome: a Biden term and a Westeros act, screenshots against the mock, frame rates, long tasks, fonts and bundle size"
```

Report to the lead: the summary JSON, the path `docs/design/e2e/latest/compare.html`, and any Decisions-table item the shots argue against.

---

## Cross-track requests

1. **Engine (Stage 0 owner): keep each resource's closing value per turn.** In `endTurn`, append `game.ledgers[key]` to an optional `game.closes?: Record<Resource, number[]>` (last 7, oldest first; absent on old games). `deskView` then sends `history: game.closes?.[key] ?? [value]`, a one-line change in `worker/desk.ts`. Until then the sheet's trend shows one bar (Decision 5).
2. **Track E: write `short`, `tint`, `icon` for every holder and `tint` for every faction.** The desk falls back to the full name (long names truncate with an ellipsis in the 284 px rim), the faction's single `color` in both modes, and a guessed icon.
3. **Engine, only if the owner wants the mock's tie beat back:** a chamber tie-breaker (`chamber.tie?: string`, the ruler's side wins a tie) in `threshold`/`applyVote`. `deskView` then fills `Count.tie` and `Verdict.tieBrokenBy` and Task 4 ports the mock's tie beat (about 8 lines). Not needed for v1 (Decision 3).
4. **Stage 0 owner, only if Task 6 measures the client JS over 200 KB gzipped:** move the schema-free helpers the client uses (`fitContrast`, `DEFAULT_THEME_TOKENS`, `emblemShapes`, and a hand-written `checkEmblem` twin) into zod-free modules so the landing and desk chunks do not ship zod. Measured before this plan: 99.4 KB gzipped today, before `motion` and the desk.
