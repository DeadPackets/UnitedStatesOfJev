# The Ruler, Stage C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every v3 screen with the Desk and the screens around it: one page at 100dvh with the strip, the stage, the composer, the rail and the wire, plus the landing, the three-page Seat, the five cards, the half-term and campaign views, the test walked by holder, Won and Over.

**Architecture:** `src/Desk.tsx` is the new play screen and owns five zones as five small components (`Strip`, `Holders`, `Compose`, `Rail`, `Wire`), each fed only from `GameView` fields Stage A and Stage B produce. Every pure rule the client needs lives in one tested module, `src/rules.ts`, so no screen does arithmetic in JSX. `motion` is dropped for a fifteen-line `src/motion.ts`. The five resource hues are `:root` tokens that `applyTheme` and `resetTheme` never touch, so a pack repaints the paper and never the ledgers.

**Tech Stack:** React 19, TypeScript, plain CSS custom properties, `bun:test` for the pure modules, Vite + Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-09-22-the-ruler-design.md` (v4, "The Ruler"), Stage C row of §12, with §9, §14, R14, R17, R22 and synthesis decision 13. Supporting: `.superpowers/ruler/planning-brief.md`, `.superpowers/ruler/maps/client.md`, `docs/mocks/desk/desk-c.html`, `docs/research/2026-09-22-hud-design.md` §2, §3, §5, `DESIGN.md`, `PRODUCT.md`, and the "Interfaces produced" sections of the Stage A and Stage B plans, which this stage consumes and never redefines.

**24 tasks**, each self-contained: its own files, its own code, its own test, its own commands and its own commit. Tasks run in order and a fresh agent sees only its own task, this header and the earlier stages' interfaces.

## Global Constraints

The first ten are Stage A's, carried verbatim. They hold for every stage.

- **Content rule** (spec §0 R6, `worker/gen/prompts.ts` `CONTENT_RULE`): no depiction, planning or reward of atrocities in bills, storylets, headlines or quotes. Force is strategic only: deploy, curfew, martial law, arrest a member, never below that level. Never mention the game, its design, the player, or that anything is fictional.
- **64k Jev cap** (`docs/experiments.md`, models map §1): one Jev request is capped at 64k tokens and the turn-20 test already measured 59,758 tokens, 93% of it. Every per-holder read is its own call and must stay under 20k tokens.
- **No engine numbers in the client bundle:** `grep -c scandal_season dist/client/assets/*.js` must print `0`. The Director, the deck and every persona stay in the Worker.
- **Tests green per commit:** every task ends with `bun test worker src` green and `bunx tsc -b --force` silent.
- **Comments: default none, cap two lines.** Write one only for a constraint the code cannot show.
- **No em dashes in copy** (`worker/luna.ts` `STYLE`): plain words, short sentences, no three-item lists, sentence case titles, straight quotes.
- **Stored packs must keep parsing:** `parseRow` (`worker/db.ts:11`) re-validates every stored pack on read, so **every new pack field is `.optional()` or `.default()`** and no existing required field changes shape.
- **Never reuse these identifiers:** `LEDGERS` (`worker/pack.ts:25`, storylet effect targets), `pack.test`, `vocabulary.midterm`. Add new names beside them.
- **Player text is data, never in a system prompt.**
- **Numbers to tune carry the literal tag `TUNE` with a default**, for example `export const REGION_MS = 14000;   // TUNE`.

Stage C adds these.

- **The client's ledger set is `LEDGER_KEYS` in `src/rules.ts`, never `LEDGERS`.** The worker's `LEDGERS` keeps its own meaning in its own file, and the rule above forbids a second one.
- **The client never imports a value (as opposed to a type) from the Worker**, and `src/api.ts` never imports `../worker/game` at all: `tsconfig.app.json` includes `worker/engine.ts` and cannot resolve `game.ts`'s `cloudflare:workers` import. `HolderView` and `InstrumentView` come from `../worker/engine`.
- **One red, one meaning** (spec §9, research §3): `--danger: #bb0916` is the only failure colour, and it means a number has crossed or is about to cross its failure line. Never a decrease, never a party, never an enemy. Danger prints the colour plus the word plus a rule. `--red` leaves `:root` in Task 3 and no rule written after it names `--red`.
- **Every CSS insertion after Task 3 names its anchor by selector text, never by line number.** Tasks 3 to 15 add about 200 lines to `src/styles.css`, so every absolute line number in it is stale by the time a later task runs.
- **Unread function parameters are written `_name`.** `noUnusedParameters` is on in both tsconfigs.
- **Vocabulary rule** (`DESIGN.md`): pack words print bare, as labels, buttons and kickers, never spliced into an English sentence frame. The seven instrument names are pack words and print only as tab labels and headings.
- **Visual language** (`DESIGN.md`, spec §9): no cards, no gradients, no side-stripe borders, square corners, Big Shoulders Display + Public Sans as the default pair, tabular numerals on every figure. A panel is a 2 px ink top rule. Party is never carried by hue alone.
- **The five resource hues are fixed across every pack** (spec §9) and live outside `applyTheme` and `resetTheme`. A pack may repaint `--ink --paper --bg --accent --display --sans` and nothing else.
- **Two navigation levels only** (research §2): glance and peek. A peek is an overlay, never a `<dialog>`, and no tab may open a panel that opens a modal. Anything unread surfaces as a mark on a tab.
- **The Desk is one page at 100dvh with no page scroll.** Only the rail body and the desk column scroll, through `.railbody` and `.deskcol`.
- **WCAG 2.2 AA** (`PRODUCT.md`): 44 px minimum touch targets, full keyboard play, roving tabindex wherever a role promises it, live regions for counts, reduced motion honoured.
- **The dev server for every visual check** is `bunx wrangler dev --config ./wrangler.dev.jsonc --port 8799`. That config file lives in the polish worktree; on `main` it is absent, so drop the flag and run `bunx wrangler dev --port 8799`.

## Decisions taken before the tasks

These close the ambiguities the client map flagged. Every task consumes them as written.

| Question | Decision |
|---|---|
| Where the pure client rules live | One module, `src/rules.ts`, with one test file, `src/rules.test.ts`. No screen computes a rule in JSX. |
| What replaces `Chamber.tsx` | `src/Desk.tsx`. Task 4 moves the floor, the roll call and the bill flow across and deletes `src/Chamber.tsx`, so the app is playable after every task. |
| Where a tabled law lives | The desk column, under the composer, in `.tabled`, shown only while `game.bills` holds an open bill. Task 11 moves the bill card, the amendments, the whip band, Adopt and Call the vote out of the two-tab rail before Task 12 replaces that rail, so `api.whip`, `api.amend`, `api.adopt` and `api.vote` keep a screen. |
| The five ledger ids | `treasury authority chest loyalty popularity`, shortened to `tre aut che loy pop` for the CSS classes `.r-tre .r-aut .r-che .r-loy .r-pop`. `danger` is the sixth hue and is not a ledger. The exported constant is `LEDGER_KEYS`. |
| Where a hue may print | The icon, the track fill, the delta arrow and the rule. Numerals and labels stay ink, because chest at `#a98738` is 3.10:1 on paper and passes the 3:1 graphic bar, not the 4.5:1 text bar (research §3). |
| The peek | An overlay absolutely positioned under the strip, opened on `pointerenter` for a mouse, on `focus` for the keyboard, toggled on click, held while the pointer is inside it. Never a `<dialog>`; `useSheet` stays for the cards and the member file only. |
| The campaign | Stage B deleted `stage: "campaign"`, both routes, `src/Campaign.tsx` and the App branch, and put C4's 25% discount on the last turns of the ordinary session. Stage C only writes the readout: a panel on the Desk's floor column that opens when `game.discount < 1` and prints the discount from that same field. No turn number is mirrored in the client. |
| The wire's line kinds | Stage A ships `WireLine` as `{ kind: "ledger" \| "resistance" \| "promise" \| "card"; ledger?: LedgerV4; id?: string \| null; delta; cause }` (brief ruling 7, Stage A's fix round) and Stage B sets `kind` on every line it writes. A resistance line carries **no** `ledger` and puts the holder id in `id`. Every local type in `src/rules.ts` mirrors that shape, and `wireLabel`, `wireHue`, `ledgerDelta` and `unreadTabs` all branch on `kind`. `wireHue` maps `ledger` and `promise` to that ledger's hue and everything else to `--danger`; only a `ledger` line opens a peek. |
| The price tag | Stage B keeps it on the save as `Game.tag`, with a refusal in `Game.refusal`, and clears both at the boundary. The client never sends a price, never discards, and never computes a charge. |
| The term script | Stage B's last task rewrote `scripts/term.ts` against the v4 routes, so it already drives `POST /acts/price`, `POST /acts`, `POST /turn/end` and the surviving whip, amend, lobby and vote block. Stage C does not rewrite it and adds a line to it only where a Stage C view field needs printing, which no task in this plan needs. |
| The faction picker | Gone. The planning brief sets the ruler's role and faction from the pack, so the Seat reads `pack.constitution.ruler.faction`, falls back to `pack.starts[0].faction` when no start matches, and passes the resolved start's faction id to `api.seat`. `src/keys.ts` loses its last caller with it and is deleted in the same task. |
| The bar the Seat and Won print | `barAt(pack, term)` reads `pack.constitution.retention.bar` (`{start, step, cap}`), which packView ships. That is printing the pack's own schedule, not repeating the engine's test. |
| The difficulty label | Before the oath the Seat computes `threshold - ownSeats` from the pack, because no game exists yet (brief ruling 10). After the oath the Record tab reads `game.shortfall` and `game.handicap` from the view and never recomputes them. |
| The unrounded floats | `TestResult.mandate` and `earlyTest`'s renormalised weights arrive as full floats (Stage A fix round, item 3). The test reveal rounds for display and nothing else re-clamps or re-rounds them. |
| The two decisive turns and the style line | Read from `game.result` only. When the field is absent the block does not render. Never derived in the client. They are listed under "## Required from Stage D" with their exact shapes. |
| The daily card | The landing takes a `daily: Daily | null` prop. `App` asks for it once and swallows every failure, so the landing works before Stage D lands the route. |
| Unread | Derived by `unreadTabs(game, seen)` in `src/rules.ts` from the turn each tab's content last changed against the turn the player last opened it. |

---

### Task 1: One motion helper, and `motion` leaves the bundle

**Files:**
- Create: `src/motion.ts`, `src/motion.test.ts`
- Modify: `src/Ledger.tsx:1-2,9,16`, `src/Drawer.tsx:1-2,12,17`, `src/Chamber.tsx:2,27`, `src/Midterm.tsx:2,21`, `src/Test.tsx:2,18`, `src/Tiles.tsx:2,136`, `package.json:14`

**Interfaces:**
- Consumes: nothing.
- Produces: `useReduced(): boolean`, `tween(from, to, ms, onUpdate, onDone?): () => void`, `ease(t: number): number`.

- [ ] **Step 1: Write the failing test**

Create `src/motion.test.ts`:

```ts
import { expect, test } from "bun:test";
import { ease } from "./motion";

test("the easing starts at 0, ends at 1 and never goes backwards", () => {
  expect(ease(0)).toBeCloseTo(0, 6);
  expect(ease(1)).toBeCloseTo(1, 6);
  let last = -1;
  for (let i = 0; i <= 100; i++) { const y = ease(i / 100); expect(y).toBeGreaterThanOrEqual(last); last = y; }
});

test("the easing is the same ease-out the stylesheet uses: fast at the start", () => {
  expect(ease(0.5)).toBeGreaterThan(0.8);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/motion.test.ts`
Expected: FAIL, `Cannot find module './motion'`.

- [ ] **Step 3: Write the helper**

Create `src/motion.ts`:

```ts
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** `false` on the first render, not `null`: every call site treated `null` as falsy already. */
export function useReduced(): boolean {
  const [on, setOn] = useState(() => (typeof matchMedia === "function" ? matchMedia(QUERY).matches : false));
  useEffect(() => {
    const m = matchMedia(QUERY);
    const read = () => setOn(m.matches);
    m.addEventListener("change", read);
    return () => m.removeEventListener("change", read);
  }, []);
  return on;
}

/** cubic-bezier(0.22, 1, 0.36, 1), sampled by bisection on x; `--ease-out` in the stylesheet. */
export function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const bez = (a: number, b: number, u: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 24; i++) { u = (lo + hi) / 2; if (bez(0.22, 0.36, u) < t) lo = u; else hi = u; }
  return bez(1, 1, u);
}

/** Returns the stopper. It cancels the frame and leaves whatever was last painted on screen. */
export function tween(from: number, to: number, ms: number, onUpdate: (v: number) => void, onDone?: () => void) {
  let raf = 0;
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    onUpdate(from + (to - from) * ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
    else onDone?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test src/motion.test.ts`
Expected: PASS, `2 pass`.

- [ ] **Step 5: Swap the six call sites**

In `src/Ledger.tsx`, delete line 2 (`import { animate, useReducedMotion } from "motion/react";`), add `import { tween, useReduced } from "./motion";`, change `const reduced = useReducedMotion();` to `const reduced = useReduced();`, and replace the `animate` call in `Num` with:

```ts
    const stop = tween(shown.current, value, 600, write, () => write(value));
    return stop;
```

In `src/Drawer.tsx`, delete line 2, add `import { tween, useReduced } from "./motion";`, change `useReducedMotion()` to `useReduced()`, and replace the `animate` call in `Pct` with:

```ts
    return tween(from * 100, value * 100, 900, (x) => { el.textContent = String(Math.round(x)); });
```

In `src/Chamber.tsx`, `src/Midterm.tsx`, `src/Test.tsx` and `src/Tiles.tsx`, delete the `motion/react` import line and add `import { useReduced } from "./motion";`, then change each `useReducedMotion()` call to `useReduced()`.

- [ ] **Step 6: Drop the dependency**

In `package.json`, delete the line `"motion": "^12.23.0",` from `dependencies`, then run `bun install`.

- [ ] **Step 7: Prove it is gone**

Run: `grep -rn "motion/react" src worker scripts; bun test worker src && bunx tsc -b --force && bun run build`
Expected: grep prints nothing, `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 8: Visual check**

Run `bun run build`, then `bunx wrangler dev --config ./wrangler.dev.jsonc --port 8799` (the command in the polish worktree's `.superpowers/polish/verify.md`; this worktree carries `wrangler.jsonc`, so drop the `--config` flag when the dev file is absent) and open `http://localhost:8799`. Load a saved game and look at the ledger meters in the rail: each number must roll to its new value over about 0.6 s rather than jumping, and the member drawer's yes percentage must still count when an offer lands. Turn on the operating system's reduce-motion setting and reload: both must print their final value at once.

- [ ] **Step 9: Commit**

```bash
git add src/motion.ts src/motion.test.ts src/Ledger.tsx src/Drawer.tsx src/Chamber.tsx src/Midterm.tsx src/Test.tsx src/Tiles.tsx package.json bun.lock
git commit -m "The client tweens on its own frames and drops the motion dependency"
```

---

### Task 2: The api.ts contract for v4, and the compatibility ledgers go

**Files:**
- Modify: `src/api.ts`, `worker/game.ts`, `src/Ledger.tsx`, `src/Chamber.tsx`, `src/Over.tsx`
- Test: `bunx tsc -b --force` is this task's check, and it must be silent at the end of it

**Interfaces:**
- Consumes: Stage A's view fields (`holders`, `instruments`, `bar`, `ruler`, `shortfall`, `handicap`, `wire`, `pending`, `inForce`, `warnings`, `promises`, `test`) with Stage A's routes `POST /api/games/:id/turn/end`, `POST /api/games/:id/test`, `POST /api/games/:id/stop`; Stage B's `PriceTag`, `Refusal`, `Act`, `RivalMove`, `Game.tag`, `Game.refusal`, `calls`, `discount` and the routes `POST /api/games/:id/acts/price`, `POST /api/games/:id/acts`, `POST /api/games/:id/acts/withdraw`; Stage B's `api` object, which already carries `price`, `act`, `withdraw` and `endTurn`.
- Produces: `api.daily` and a fifth `platform` argument on `api.seat`, which are the only two calls Stage C adds, plus the type `Daily` (`RunStyle` lands with Over in Task 23). Stage B's four act calls are left exactly as Stage B wrote them. The shapes no worker stage owns yet are listed under "## Required from Stage D" at the end of this plan.

Stage B already wrote `price`, `act`, `withdraw` and `endTurn` into `src/api.ts` and already deleted `draft`, `post`, `drafts` and `campaign` with the routes behind them. This task never re-adds any of those names and never renames `act`. It adds two things and takes three fields away.

- [ ] **Step 1: Add the daily type**

In `src/api.ts`, after the line `export type ViewEvent = Event;`, add:

Stage B owns `PriceTag`, `Refusal`, `Act` and `RivalMove` in `worker/engine.ts`, so the client imports them rather than restating them. Only the one shape no worker stage owns is written here:

```ts
/** Stage D writes this; the landing renders a practice card when it is null. */
export type Daily = {
  day: string; scenario: string; title: string; era: string; place: string;
  played: boolean; streak: number; plays: number; grid?: { ledger: string; won?: boolean }[];
};
```

Replace the type imports at the top with Stage A's and Stage B's own names:

```ts
import type { Act, Bill, BillDraft, Event, Game, HolderRow, InForce, LobbyAction, Member, PriceTag, Refusal, RivalMove, TestResult, Warning, WireLine } from "../worker/engine";
import type { HolderView, InstrumentView } from "../worker/engine";
import type { Citizen, Pack, PackView, Verb } from "../worker/pack";
```

`HolderView` and `InstrumentView` are declared in `worker/engine.ts`, not `worker/game.ts` (Stage A's fix round, item 2). `src/api.ts` must never import `../worker/game`: that file imports `cloudflare:workers`, which `tsconfig.app.json` cannot resolve. Fold the two type imports into one line if the linter prefers it.

- [ ] **Step 2: Narrow `GameView` and delete the compatibility ledgers**

Stage B's `GameView` carries `ledgers: Game["ledgers"] & { approval; capital; party }`, the compatibility set Stage A's view field block marks "the last three are Stage C's to delete". Delete them on both sides in this step, so nothing ships a field no screen reads.

In `worker/game.ts`, in `view()`, delete `approval`, `capital` and `party` from the `ledgers` object it returns. Delete whatever fed `approval` only if `bunx tsc -b --force` then reports it unused; leave every other field of the view alone.

In `src/api.ts`, replace Stage B's `GameView` with the same type minus that intersection:

```ts
/** What every `/api/games` route sends. The deck, the Director and every persona stay in the Worker. */
export type GameView = Omit<Game, "pack" | "director" | "members" | "bills" | "ledgers" | "holders" | "extra"> & {
  ledgers: Game["ledgers"];
  scenario: string;
  pack: PackView;
  members: ViewMember[];
  bills: ViewBill[];
  citizens: Pick<Citizen, "id" | "region" | "bloc" | "name" | "weight">[];
  lobbyCosts: Record<LobbyAction, number>;
  coalition: string[];
  seatTitle: string;
  turnsPerTerm: number;
  ending?: { title: string; body: string };
  deltas?: Record<string, number>;
  holders: HolderView[];
  instruments: Partial<Record<Verb, InstrumentView>>;
  bar: number;
  ruler: { role: string; faction: string };
  shortfall: number;
  handicap: number;
  calls: { spent: number; cap: number };
  discount: number;
  warnings: Warning[];
  inForce: InForce[];
  wire: WireLine[];
  pending: string | null;
  tag: PriceTag | null;
  refusal: Refusal | null;
  acts: Act[];
  rival: RivalMove | null;
  test?: TestResult;
};
export type { Act, HolderRow, InForce, PriceTag, Refusal, RivalMove, TestResult, Verb, WireLine };
```

`extra` is in the Omit because `view()` strips it. `calls` and `discount` are restated because `Game` types them as a bare number and as nothing at all. `ViewBill` keeps the `band: [number, number]` Stage B put on a counted bill row. `Gains`, `Lever`, `campaign`, `draft`, `post`, `drafts` and `campaign` are already gone from this file and none of them come back.

- [ ] **Step 3: Fix the three readers of the deleted fields**

Three live call sites read the fields Step 2 deleted, so `tsc` is loud until all three move. Fix them here, not in a later task:

- `src/Over.tsx`, in the `.ledger` block: `national(pack, game.ledgers.approval)` becomes `national(pack, game.ledgers.popularity)`.
- `src/Ledger.tsx`: delete the default `Ledger` component (lines 48 to 77) and the now unused `mean` helper (line 23), keeping `Num`, `Meter` and `national`. Then delete the `Ledger` default import and the `<Ledger game={game} />` line from `src/Chamber.tsx` (lines 7 and 176), leaving `import { Num } from "./Ledger";`.
- `src/Chamber.tsx`: `capital={game.ledgers.capital}` on `<MemberDrawer>` becomes `capital={game.ledgers.authority}`. `MemberDrawer` takes a plain `capital: number` and prints it beside `v.capital`, so the authority number is the one the offers are now paid from.

- [ ] **Step 4: Add the two calls Stage C owns**

In `src/api.ts`, give `seat` its fifth argument and add `daily` beside it. Leave `price`, `act`, `withdraw` and `endTurn` exactly as Stage B wrote them:

```ts
  seat: (scenario: string, faction: string, promises: number[], seed?: number, platform?: string) =>
    call<GameView>("/games", { scenario, faction, promises, seed, platform }),
  daily: () => call<Daily>("/daily"),
```

`api.price` writes the tag onto the save and `api.act` applies the tag the save holds, so the client never sends a price. There is no discard route and none is needed: pricing again replaces the tag, and `endTurn` clears it. There is no hold route either: holding a warning is a client-side dismissal, and Stage A's `advanceWarnings` fires the response two turns later with no call from the screen.

- [ ] **Step 5: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build; ! grep -q scandal_season dist/client/assets/*.js && echo clean`
Expected: `0 fail`, `tsc` silent, vite prints `built in`, the grep line prints `clean`.

- [ ] **Step 6: Visual check**

Nothing renders differently yet, and the rail loses the five v3 meters. Confirm the build output size fell by about 23 kB gzip against the previous build (decision 13 measured `motion` at 23 kB of 115), by reading the `dist/client/assets/*.js` line vite prints. Then run `scripts/term.ts`, which Stage B already rewrote against the v4 routes, end to end against a running Worker: `bunx wrangler dev --port 8799` in one shell and `bun scripts/term.ts http://127.0.0.1:8799` in another. It must still reach the test and print an ending, which proves the view kept every field the script reads.

- [ ] **Step 7: Commit**

```bash
git add src/api.ts worker/game.ts src/Ledger.tsx src/Chamber.tsx src/Over.tsx
git commit -m "The client contract follows the priced act and drops the v3 ledgers"
```

---

### Task 3: The five fixed resource hues and the icon sprite

**Files:**
- Create: `src/icons.tsx`
- Modify: `src/styles.css:4-12`, `src/rules.ts` (created here), `src/rules.test.ts` (created here)

**Interfaces:**
- Consumes: nothing.
- Produces: `src/rules.ts` with `LEDGER_KEYS: readonly LedgerKey[]`, `type LedgerKey`, `hueClass(k)`, `roomTo(value, line)`, `danger(value, line)`; `src/icons.tsx` with `<Icon name sm? />`.

The client constant is `LEDGER_KEYS`, never `LEDGERS`: the Global Constraints forbid a second `LEDGERS`, and the worker's one keeps its own meaning in `worker/pack.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/rules.test.ts`:

```ts
import { expect, test } from "bun:test";
import { LEDGER_KEYS, danger, hueClass, roomTo } from "./rules";

test("the five ledgers keep their order and their hue class", () => {
  expect(LEDGER_KEYS).toEqual(["treasury", "authority", "chest", "loyalty", "popularity"]);
  expect(LEDGER_KEYS.map(hueClass)).toEqual(["r-tre", "r-aut", "r-che", "r-loy", "r-pop"]);
});

test("the room to the failure line is never negative", () => {
  expect(roomTo(38, 0)).toBe(38);
  expect(roomTo(47, 20)).toBe(27);
  expect(roomTo(12, 20)).toBe(0);
});

test("danger fires at the line, not below it", () => {
  expect(danger(21, 20)).toBe(false);
  expect(danger(20, 20)).toBe(true);
  expect(danger(19, 20)).toBe(true);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/rules.test.ts`
Expected: FAIL, `Cannot find module './rules'`.

- [ ] **Step 3: Write the module**

Create `src/rules.ts`:

```ts
export const LEDGER_KEYS = ["treasury", "authority", "chest", "loyalty", "popularity"] as const;
export type LedgerKey = (typeof LEDGER_KEYS)[number];

const HUE: Record<LedgerKey, string> = {
  treasury: "r-tre", authority: "r-aut", chest: "r-che", loyalty: "r-loy", popularity: "r-pop",
};

export const hueClass = (k: LedgerKey) => HUE[k];
export const roomTo = (value: number, line: number) => Math.max(0, value - line);
/** A ledger at its line has already failed: spec §4 reads "0: no spending act until revenue passes". */
export const danger = (value: number, line: number) => value <= line;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test src/rules.test.ts`
Expected: PASS, `3 pass`.

- [ ] **Step 5: Add the tokens, and leave one red**

In `src/styles.css`, inside the `:root` block (line 5 today), delete the `--red: #d0001f;` declaration and, after the `--accent` declaration, add:

```css
  /* spec §9: fixed across every pack. applyTheme and resetTheme must never list these. */
  --tre: #227f53; --aut: #623e96; --che: #a98738; --loy: #2b7592; --pop: #a5417f; --danger: #bb0916;
  --tre-on: #6dc393; --aut-on: #a37fde; --che-on: #f1cc7e; --loy-on: #71b9d8; --pop-on: #f084c4;
  --head: 46px; --wire: 38px;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
```

`--danger` replaces `--red` for the whole file, so the failure mark, the danger cell, the failed stamp and the focus ring are one colour and mean one thing. Rename every remaining use in the same pass:

```bash
sed -i '' 's/var(--red)/var(--danger)/g' src/styles.css
grep -c -- "--red" src/styles.css
```

Expected: the grep prints `0`. `--accent` keeps `#d0001f` and stays the pack's to repaint.

Then, after the `:root` block closes (line 12 today), add the six hue classes:

```css
.r-tre { --c: var(--tre); --c-on: var(--tre-on); }
.r-aut { --c: var(--aut); --c-on: var(--aut-on); }
.r-che { --c: var(--che); --c-on: var(--che-on); }
.r-loy { --c: var(--loy); --c-on: var(--loy-on); }
.r-pop { --c: var(--pop); --c-on: var(--pop-on); }
.r-danger { --c: var(--danger); --c-on: var(--danger); }
/* chest is 3.10:1 on paper, so a hue paints the mark and never the text (research §3) */
.ic { width: 20px; height: 20px; flex: none; vertical-align: -4px; color: var(--c, currentColor); fill: none;
  stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.ic.sm { width: 15px; height: 15px; stroke-width: 2.2; vertical-align: -2px; }
.arrow { color: var(--c); font-style: normal; }
```

This task is the last one that may cite a line number in `src/styles.css`. Every step after it names its anchor by selector text.

- [ ] **Step 6: Write the sprite**

Create `src/icons.tsx`:

```tsx
const PATHS = {
  treasury: "M5 6a7 2.8 0 1 0 14 0a7 2.8 0 1 0-14 0M5 6v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 11v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5",
  authority: "m14.5 12.5-8 8a2.1 2.1 0 1 1-3-3l8-8M16 16l5.5-5.5M8 8l5.5-5.5M9 7l8 8M20.5 11.5l-8-8",
  chest: "M3 5h18v15H3zM12 9.5a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 9.5v-1M3 9h18",
  loyalty: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  popularity: "M12 4.7a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 1 0 0-5.6M7.5 19v-1a4.5 4.5 0 0 1 9 0v1M4.5 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4M1.5 18.5V18a3 3 0 0 1 3-3M19.5 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4M22.5 18.5V18a3 3 0 0 0-3-3",
  act: "M20 12.2a6 6 0 0 0-8.5-8.5L5 10.3V19h8.5zM16 8 3 21M17 15H9.5",
  post: "m3 11 17-5v12L3 14zM11.5 16.8a3 3 0 1 1-5.7-1.6M20 9.5h2M20 13.5h2",
  hand: "M12 7 9.5 4.5a2 2 0 0 0-3 0L2.8 8.2a2 2 0 0 0 0 3L7 15.5m5-8.5 2.5-2.5a2 2 0 0 1 3 0l3.7 3.7a2 2 0 0 1 0 3L17 15.5m-8-2.5 2 2m-1.5-4.5 4 4",
  vote: "M3 7h18v13H3zM8 7V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V7m-7 8.2 2.4 2.4 4.1-4.1",
  crisis: "M6 8.5a6 6 0 0 1 12 0c0 6.5 3 8.5 3 8.5H3s3-2 3-8.5zM10.4 20.5a1.9 1.9 0 0 0 3.2 0",
  region: "M20 10.2c0 5.8-8 11.8-8 11.8s-8-6-8-11.8a8 8 0 0 1 16 0zM12 7.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 1 0 0-5.6",
  seat: "M4 18.5v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2M6.5 18.5V21M17.5 18.5V21M8.5 12.5V8a3.5 3.5 0 0 1 7 0v4.5",
  pin: "M12 17v5M9 10.5V4h6v6.5l3 3.5H6z",
  wire: "M4 12h4l2.5-6 3 12L16 12h4",
  abroad: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3",
};

export type IconName = keyof typeof PATHS;

/** One glyph on a 24 px grid. Distinct silhouettes, because silhouette survives at 16 px (research §3). */
export function Icon({ name, sm = false }: { name: IconName; sm?: boolean }) {
  return <svg className={`ic ${sm ? "sm" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}
```

- [ ] **Step 7: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 8: Visual check**

Nothing on screen uses the tokens yet. Open `src/styles.css` and confirm `--tre` through `--danger` sit in `:root`, that `--red` is gone from the whole file, and that neither `applyTheme` (`src/theme.tsx:70-92`) nor `resetTheme` (`src/theme.tsx:95-101`) names any of the six, so a pack cannot repaint a ledger. Then load any screen and confirm the focus ring, the failed stamp and the lost headline all print the one red, `#bb0916`.

- [ ] **Step 9: Commit**

```bash
git add src/rules.ts src/rules.test.ts src/icons.tsx src/styles.css
git commit -m "The five resource hues and one icon per ledger"
```

---

### Task 4: The Desk shell, one page and no scrolling

**Files:**
- Create: `src/Desk.tsx`
- Delete: `src/Chamber.tsx`
- Modify: `src/App.tsx:7,154,160`, `src/styles.css`

**Interfaces:**
- Consumes: `GameView`, `Act`, `Chamber as ChamberFloor` and `RollHandle` from `src/Hemicycle.tsx`, `Num` from `src/Ledger.tsx`, `Feed` and `FeedLine`, `Card` and `Announce`, `MemberDrawer`, `Tour`.
- Produces: `export default function Desk({ game, act, busy, onQuit, onRolled })`, the same props `Chamber` took, and the CSS classes `.desk .mast .striprow .main .col .deskcol .floorcol .railcol .railbody`.

This is the single riskiest CSS change in the set, so it lands on its own before any zone is redrawn: the bill flow and the floor move across and every zone is replaced in a later task.

- [ ] **Step 1: Write the shell CSS**

In `src/styles.css`, after the `.chamber` block that opens with `.chamber { display: grid;`, add:

```css
/* the Desk: one page, 100dvh. Only the rail body and the desk column scroll (spec §9) */
body:has(.desk) { height: 100dvh; overflow: hidden; }
.desk { position: relative; height: 100dvh; max-width: 1400px; margin: 0 auto; padding: 0 20px var(--wire);
  display: grid; grid-template-rows: auto auto minmax(0, 1fr); }
.desk .mast { min-height: var(--head); padding: 7px 0; }
.striprow { position: relative; }
.main { display: grid; grid-template-columns: 330px minmax(0, 1fr) 320px; gap: var(--s5); padding-top: var(--s3); min-height: 0; }
.col { min-height: 0; display: flex; flex-direction: column; }
.deskcol, .floorcol { gap: var(--s2); }
/* the composer, the price tag, a tabled law and End turn can outrun a 700 px window together */
.deskcol { overflow: auto; scrollbar-width: thin; }
.floorbox { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; }
.desk .hemi { width: 100%; height: auto; max-height: 52vh; margin-inline: auto; }
.railbody { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; padding-right: 2px; }
.floorcol .prompt { font: 700 28px/1 var(--display); color: var(--ink-2); text-align: center; text-transform: uppercase; letter-spacing: 0.02em; }
```

The last rule re-homes the existing `.stage .prompt`, which stops matching once the floor lives in `.col.floorcol`. Leave `.stage .prompt` where it is: the Seat and the test still render inside `.stage`.

- [ ] **Step 2: Move the play screen across**

Read `src/Chamber.tsx` in full first. Create `src/Desk.tsx` as a copy of it with five changes and nothing else; everything named below is copied from the file you just read.

Stage B already repointed `Chamber.tsx`'s send handler from `api.draft` to `api.price` then `api.act`, and Task 2 already took the `<Ledger game={game} />` block out of the rail, so the file you are copying compiles as it stands.

1. The root element becomes `<main className="desk press" onPointerDown={sound.unlock}>`.
2. The header keeps `<header className="mast">` in place of `<header className="topbar">`, with `<b>{pack.title}</b>` in place of `<h1>`. The `<Ornament kind={pack.theme.ornament} />`, the turn counter, the sound toggle and Leave the seat all move across unchanged, so the pack's motif still carries the masthead and `applyTheme` still owns the paper, the rules and the two font stacks.
3. Between the header and the columns, add the placeholder row the strip fills in Task 5:

```tsx
      <div className="striprow"><div className="strip" role="group" aria-label="The ledgers" /></div>
```

4. The two `<section className="stage">` and `<aside className="rail">` elements are wrapped in the three columns:

```tsx
      <div className="main">
        <section className="col deskcol" aria-label="The desk">{/* the composer lands here in Task 9 */}</section>
        <section className="col floorcol" aria-label={v.chamber}>
          <div className="floorbox">
            <ChamberFloor ref={floor} pack={pack} members={game.members} own={game.faction} coalition={game.coalition}
              whip={bill?.whip} votes={bill?.votes} rolling={rolling} pulse={pulse} selected={sel?.id}
              hot={hotSeat} onPick={pickSeat} />
          </div>
          {/* the "Write a {bill}" prompt, the count and the whip bar, copied unchanged */}
        </section>
        <aside className="col railcol" aria-label="The rail">
          <div className="railbody">{/* the two tabs and their panel, copied unchanged */}</div>
        </aside>
      </div>
```

5. The `.billpad` block in the rail's turn panel, which is the label, the textarea and the Send button between `{!bill ? (` and `) : (`, and the `draft` handler above it that the button calls, are dropped on the way across. The composer in Task 9 replaces both, and leaving them would put two writing boxes on one screen. Everything else inside that panel, including the bill card, the amendments, `FeedLine`, the headline and the quotes, moves across untouched; Task 11 gives it its own home.

Every hook, effect, ref and handler in `Chamber.tsx:26-118` moves across byte for byte apart from `draft`, including `TOUR`, `TABS`, the roll call effect and the three `sound` effects. `text` and `setText` stay: the composer takes them over in Task 9.

- [ ] **Step 3: Route to it**

In `src/App.tsx`, change line 7 to `import Desk from "./Desk";` and replace both `<Chamber ... />` uses (lines 154 and 160) with `<Desk ... />`, keeping every prop and the `key={game.term}`.

- [ ] **Step 4: Delete the old screen**

```bash
git rm src/Chamber.tsx
```

- [ ] **Step 5: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build; ! grep -q scandal_season dist/client/assets/*.js && echo clean`
Expected: `0 fail`, `tsc` silent, vite prints `built in`, the grep line prints `clean`.

- [ ] **Step 6: Visual check**

Run `bun run build && bunx wrangler dev --port 8799` and open a saved game at `http://localhost:8799`. Look for five things: the page must not scroll at any window height (try 700 px tall), the masthead must sit on one line at the top, the floor must sit in the middle column and shrink rather than push the page down, the rail must scroll inside itself with the masthead and the floor staying put, and the desk column must scroll inside itself too, so nothing put in it later can be pushed off the bottom. Then play one bill end to end: count, tap a seat, vote. Every step must behave exactly as it did before this task, and the writing box is gone until Task 9 brings the composer.

- [ ] **Step 7: Commit**

```bash
git add src/Desk.tsx src/App.tsx src/styles.css
git commit -m "The Desk is one page at full height and never scrolls"
```

---

### Task 5: The strip, five ledgers at a glance

**Files:**
- Create: `src/Strip.tsx`
- Modify: `src/Desk.tsx`, `src/styles.css`, `src/rules.ts`, `src/rules.test.ts`

**Interfaces:**
- Consumes: `LEDGER_KEYS`, `hueClass`, `roomTo`, `danger` from `src/rules.ts`; `Icon` from `src/icons.tsx`; `Num` from `src/Ledger.tsx`; `game.ledgers`, `game.pack.constitution.ledgers`, `game.wire`.
- Produces: `export default function Strip({ game, open, onOpen })`, and `ledgerValue(game, k)` and `ledgerDelta(game, k)` in `src/rules.ts`.

- [ ] **Step 1: Write the failing test**

Append to `src/rules.test.ts`:

```ts
import { ledgerDelta, ledgerValue } from "./rules";

const game = {
  ledgers: { treasury: 38, authority: 14, chest: 120, loyalty: 47, popularity: { north: 60, south: 40 } },
  pack: { regions: [{ id: "north", weight: 3 }, { id: "south", weight: 1 }] },
  wire: [
    { kind: "ledger", ledger: "treasury", delta: -4, cause: "farm credit" },
    { kind: "ledger", ledger: "popularity", id: "north", delta: 2, cause: "the post" },
    { kind: "ledger", ledger: "treasury", delta: 1, cause: "the levy" },
    { kind: "resistance", id: "senate", delta: 12, cause: "the levy" },
  ],
} as never;

test("popularity reads as the weighted national number, the rest read straight", () => {
  expect(ledgerValue(game, "treasury")).toBe(38);
  expect(ledgerValue(game, "popularity")).toBe(55);
});

test("a ledger's delta sums only this turn's ledger lines, never a resistance move", () => {
  expect(ledgerDelta(game, "treasury")).toBe(-3);
  expect(ledgerDelta(game, "popularity")).toBe(2);
  expect(ledgerDelta(game, "chest")).toBe(0);
  expect(ledgerDelta(game, "authority")).toBe(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/rules.test.ts`
Expected: FAIL, `SyntaxError: Export named 'ledgerValue' not found in module`.

- [ ] **Step 3: Add the two readers**

Append to `src/rules.ts`:

```ts
// `ledger` is optional because a resistance line carries none (Stage A's WireLine).
type StripGame = {
  ledgers: Record<string, number | Record<string, number>>;
  pack: { regions: { id: string; weight: number }[] };
  wire: { kind: string; ledger?: string | null; id?: string | null; delta: number }[];
};

/** Popularity is per region, so the strip prints the same weighted sum the test's public half uses. */
export function ledgerValue(game: StripGame, k: LedgerKey): number {
  const v = game.ledgers[k];
  if (typeof v === "number") return v;
  let w = 0, sum = 0;
  for (const r of game.pack.regions) { w += r.weight; sum += r.weight * (v?.[r.id] ?? 50); }
  return w ? sum / w : 50;
}

/** Only `kind: "ledger"` counts: a resistance move borrows no ledger's arithmetic. */
export const ledgerDelta = (game: StripGame, k: LedgerKey) =>
  game.wire.reduce((a, l) => (l.kind === "ledger" && l.ledger === k ? a + l.delta : a), 0);
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test src/rules.test.ts`
Expected: PASS, `5 pass`.

- [ ] **Step 5: Write the strip**

Create `src/Strip.tsx`:

```tsx
import type { CSSProperties } from "react";
import type { GameView } from "./api";
import { Icon, type IconName } from "./icons";
import { Num } from "./Ledger";
import { LEDGER_KEYS, danger, hueClass, ledgerDelta, ledgerValue, roomTo, type LedgerKey } from "./rules";

// The strip bar needs a top for each ledger; the failure line is the only number that carries meaning.
const SCALE: Record<LedgerKey, number> = { treasury: 200, authority: 30, chest: 200, loyalty: 100, popularity: 100 };   // TUNE

/** Five slots, fixed order, fixed hue: the only tier that may be read in one second (research §2). */
export default function Strip({ game, open, onOpen }: {
  game: GameView; open: LedgerKey | null; onOpen: (k: LedgerKey | null) => void;
}) {
  const names = game.pack.constitution?.ledgers;
  return (
    <div className="strip" role="group" aria-label="The five ledgers">
      {LEDGER_KEYS.map((k) => {
        const value = ledgerValue(game, k);
        const line = names?.[k]?.line ?? 0;
        const delta = ledgerDelta(game, k);
        const hot = danger(value, line);
        const show = () => onOpen(k);
        return (
          <button key={k} className={`led ${hueClass(k)} ${hot ? "danger" : ""}`} aria-expanded={open === k}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") show(); }}
            onFocus={show} onClick={() => onOpen(open === k ? null : k)}>
            <span className="ledk"><Icon name={k as IconName} /><span className="kicker">{names?.[k]?.name ?? k}</span></span>
            <span className="top">
              <b className="v"><Num value={Math.round(value)} /></b>
              {delta ? <span className="d num"><i className="arrow" aria-hidden="true">{delta > 0 ? "▲" : "▼"}</i>{Math.abs(Math.round(delta))}</span> : null}
            </span>
            <span className="track" aria-hidden="true">
              <i style={{ "--w": `${Math.min(100, (value / SCALE[k]) * 100)}%` } as CSSProperties} />
              <b className="fail" style={{ "--x": `${Math.min(100, (line / SCALE[k]) * 100)}%` } as CSSProperties} />
            </span>
            <span className="room num">{hot ? `Failed at ${line}` : `${Math.round(roomTo(value, line))} to the line`}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Style it**

In `src/styles.css`, after the `.striprow` rule, add:

```css
.strip { display: grid; grid-template-columns: repeat(5, 1fr); border-bottom: 2px solid var(--ink); }
.led { text-align: left; padding: 9px 14px 11px; border-right: 1px solid var(--tone); display: grid; gap: 2px;
  min-height: 44px; transition: background var(--t-fast); }
.led:first-child { padding-left: 0; } .led:last-child { border-right: 0; padding-right: 0; }
.led:hover, .led[aria-expanded="true"] { background: color-mix(in oklab, var(--c) 9%, transparent); }
.ledk { display: flex; align-items: center; gap: 6px; }
.ledk .kicker { color: var(--ink-2); }
.led .top { display: flex; align-items: baseline; gap: var(--s2); }
.led .v { font: 800 38px/1 var(--display); letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.led .d { font: 800 15px/1 var(--display); }
.track { position: relative; display: block; height: 9px; background: color-mix(in oklab, var(--c) 20%, var(--bg)); margin-top: 5px; }
.track i { position: absolute; inset: 0 auto 0 0; width: var(--w); background: var(--c); transition: width 700ms var(--ease-expo); }
.track .fail { position: absolute; top: -4px; left: var(--x); width: 2px; height: 17px; background: var(--danger); }
.room { font: 600 11px/1.3 var(--sans); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-2); margin-top: 4px; }
.led.danger .room, .led.danger .v { color: var(--danger); }
.led.danger { box-shadow: inset 0 -3px 0 var(--danger); }
```

- [ ] **Step 7: Hang it on the Desk**

In `src/Desk.tsx`, add `import Strip from "./Strip";`, `import type { LedgerKey } from "./rules";`, a state `const [peek, setPeek] = useState<LedgerKey | null>(null);`, and replace the placeholder from Task 4 with:

```tsx
      <div className="striprow"><Strip game={game} open={peek} onOpen={setPeek} /></div>
```

Task 2 already deleted the default `Ledger` component and the rail's `<Ledger game={game} />` line, so nothing is removed here.

- [ ] **Step 8: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 9: Visual check**

Open a saved game. Look at the strip: five cells across the full width, each with its own icon and hue on the icon and the bar, the value in ink at poster size, the delta with a hue arrow, a red tick at the failure line, and the room to that line in small caps under it. Drive one ledger under its line in the worker fixture or by playing, and confirm the cell turns red in three channels at once: the number, the word, and the rule under the cell.

- [ ] **Step 10: Commit**

```bash
git add src/Strip.tsx src/Desk.tsx src/styles.css src/rules.ts src/rules.test.ts
git commit -m "The strip prints five ledgers with their failure lines"
```

---

### Task 6: The peek, an overlay and never a dialog

**Files:**
- Create: `src/Peek.tsx`
- Modify: `src/Desk.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `Strip`'s `open` state, `game.wire`, `game.pack.constitution.ledgers`, `roomTo`, `hueClass`.
- Produces: `export default function Peek({ game, of, cause, onClose, onPin })`, where `onPin(item: PinItem)` is filled in Task 12 and takes `{ key: string; title: string; hue: string; lines: [string, string][] }`.

- [ ] **Step 1: Write the peek**

Create `src/Peek.tsx`:

```tsx
import type { GameView } from "./api";
import { hueClass, ledgerValue, roomTo, type LedgerKey } from "./rules";

export type PinItem = { key: string; title: string; hue: string; lines: [string, string][] };

const sign = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 10) / 10}`;

/**
 * Tier two of two: read-only, and an overlay under the strip so the page never moves.
 * Never a dialog, because a modal would break the one page rule (research §2).
 */
export default function Peek({ game, of, cause, onClose, onPin }: {
  game: GameView; of: LedgerKey; cause?: string; onClose: () => void; onPin: (item: PinItem) => void;
}) {
  const meta = game.pack.constitution?.ledgers?.[of];
  const rows = game.wire.filter((l) => l.kind === "ledger" && l.ledger === of);
  const line = meta?.line ?? 0;
  const value = ledgerValue(game, of);
  const name = meta?.name ?? of;
  const item: PinItem = {
    key: of, title: name, hue: hueClass(of),
    lines: rows.map((l) => [l.cause, sign(l.delta)] as [string, string]).concat([["Room to the line", String(Math.round(roomTo(value, line)))]]),
  };
  return (
    <div className={`peek ${hueClass(of)}`} role="group" aria-label={`${name}, this turn`}
      onPointerEnter={(e) => { (e.currentTarget as HTMLElement).dataset.stick = "1"; }}
      onPointerLeave={(e) => { delete (e.currentTarget as HTMLElement).dataset.stick; onClose(); }}>
      <div>
        <h3>{name}</h3>
        <ul className="flow">
          {rows.length ? rows.map((l, i) => (
            <li key={i}><span>{l.cause}</span><b className={`num ${l.delta < 0 ? "neg" : ""}`}>{sign(l.delta)}</b></li>
          )) : <li><span>Nothing moved it this turn.</span><b className="num">0</b></li>}
        </ul>
      </div>
      <div>
        <div className="kicker">Room to the failure line</div>
        <span className="big num">{Math.round(roomTo(value, line))}</span>
        <div className="small muted">Fails at <b className="num">{line}</b>{cause ? <><br /><b>{cause}</b></> : null}</div>
      </div>
      <div>
        <div className="kicker">Keep it in the rail</div>
        <div className="acts2">
          <button className="btn sm" onClick={() => onPin(item)}>Pin</button>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Style it**

In `src/styles.css`, after the `.led.danger` rules, add:

```css
/* an overlay, so opening it never moves the page */
.peek { position: absolute; left: 0; right: 0; top: 100%; z-index: var(--z-sticky); background: var(--bg);
  border: 2px solid var(--c, var(--ink)); border-top: 0; padding: var(--s3) var(--s4);
  display: grid; grid-template-columns: 1fr 1fr 210px; gap: var(--s4); }
.peek h3 { font-size: 22px; color: var(--c); text-transform: uppercase; }
.peek .flow { list-style: none; margin: 6px 0 0; padding: 0; }
.peek .flow li { display: flex; justify-content: space-between; gap: var(--s2); font-size: 13px; padding: 4px 0; border-bottom: 1px solid var(--tone); }
.peek .flow li b { font: 800 16px/1 var(--display); font-variant-numeric: tabular-nums; }
.peek .flow li b.neg { color: var(--danger); }
.peek .big { font: 900 56px/0.9 var(--display); color: var(--c); display: block; font-variant-numeric: tabular-nums; }
.peek .acts2 { display: flex; gap: var(--s2); align-items: center; margin-top: var(--s2); }
.btn.sm { min-height: 44px; padding: 0 12px; font-size: 15px; gap: 5px; }
```

- [ ] **Step 3: Wire it to the strip**

In `src/Desk.tsx`, import `Peek`, add `const [pins, setPins] = useState<PinItem[]>([]);` and `const [cause, setCause] = useState<string>();`, and replace the strip row with:

```tsx
      <div className="striprow" onPointerLeave={(e) => { if (e.pointerType === "mouse" && !document.querySelector<HTMLElement>(".peek[data-stick]")) setPeek(null); }}>
        <Strip game={game} open={peek} onOpen={(k) => { setPeek(k); setCause(undefined); }} />
        {peek ? <Peek game={game} of={peek} cause={cause} onClose={() => setPeek(null)}
          onPin={(p) => setPins((xs) => (xs.some((x) => x.key === p.key) ? xs : [...xs, p]))} /> : null}
      </div>
```

Add `useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPeek(null); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);` so the keyboard closes it the same way a pointer does.

- [ ] **Step 4: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 5: Visual check**

Open a saved game. Hover each of the five cells: the peek must drop under the strip in that ledger's hue, listing this turn's moves with their causes, the room to the failure line as one big number, and Pin and Close. The page behind it must not move a pixel, and the other four cells must stay readable. Tab through the strip with the keyboard: each cell's peek must open on focus and close on Escape. Confirm no `<dialog>` appears in the elements panel.

- [ ] **Step 6: Commit**

```bash
git add src/Peek.tsx src/Desk.tsx src/styles.css
git commit -m "A ledger peeks under the strip without moving the page"
```

---

### Task 7: The wire

**Files:**
- Create: `src/Wire.tsx`
- Modify: `src/Desk.tsx`, `src/styles.css`, `src/rules.ts`, `src/rules.test.ts`

**Interfaces:**
- Consumes: `game.wire` (`WireLine[]` from Stage A: `{ kind: "ledger" | "resistance" | "promise" | "card"; ledger?: LedgerV4; id?: string | null; delta; cause }`, where a resistance line carries no `ledger` and puts the holder id in `id`), `game.pending`, `game.holders`, `hueClass`.
- Produces: `export default function Wire({ game, onPick })` where `onPick(ledger, cause)` opens the peek; `wireLabel(line, names)` and `wireHue(line)` in `src/rules.ts`.

- [ ] **Step 1: Write the failing test**

Append to `src/rules.test.ts`:

```ts
import { wireHue, wireLabel } from "./rules";

test("a wire line names its ledger, its region when it has one, and its cause", () => {
  const names = new Map([["north", "Etruria"], ["senate", "The senate"]]);
  expect(wireLabel({ kind: "ledger", ledger: "popularity", id: "north", delta: 2, cause: "the post" }, names))
    .toBe("popularity, Etruria, the post");
  expect(wireLabel({ kind: "ledger", ledger: "treasury", delta: -4, cause: "farm credit" }, names))
    .toBe("treasury, farm credit");
});

test("a resistance line prints the holder's name, never a raw id", () => {
  const names = new Map([["senate", "The senate"]]);
  expect(wireLabel({ kind: "resistance", id: "senate", delta: 12, cause: "the levy" }, names))
    .toBe("The senate, the levy");
  expect(wireLabel({ kind: "resistance", id: "curia", delta: 4, cause: "the levy" }, names))
    .toBe("curia, the levy");
});

test("a resistance or card line is danger, a ledger or promise line takes its ledger's hue", () => {
  expect(wireHue({ kind: "ledger", ledger: "chest", delta: -20, cause: "reach" })).toBe("r-che");
  expect(wireHue({ kind: "promise", ledger: "popularity", delta: -1, cause: "land reform" })).toBe("r-pop");
  expect(wireHue({ kind: "resistance", id: "senate", delta: 12, cause: "the levy" })).toBe("r-danger");
  expect(wireHue({ kind: "card", ledger: "treasury", delta: -8, cause: "the flood" })).toBe("r-danger");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/rules.test.ts`
Expected: FAIL, `SyntaxError: Export named 'wireHue' not found in module`.

- [ ] **Step 3: Add the label and the hue**

Append to `src/rules.ts`:

```ts
// `names` covers regions and holders, because a resistance line's id is a holder's.
type Line = { kind: string; ledger?: string | null; id?: string | null; delta: number; cause: string };

export const wireLabel = (l: Line, names: Map<string, string>) =>
  (l.kind === "resistance"
    ? [l.id ? names.get(l.id) ?? l.id : null, l.cause]
    : [l.ledger, l.id ? names.get(l.id) ?? l.id : null, l.cause]
  ).filter(Boolean).join(", ");

/** A resistance move and a card hit are danger, and so is any line with no ledger to take a hue from. */
export const wireHue = (l: Line) =>
  l.kind === "resistance" || l.kind === "card" || !l.ledger ? "r-danger" : hueClass(l.ledger as LedgerKey);
```

The sixth hue class is already in `src/styles.css` from Task 3, so nothing is added to the stylesheet here.

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test src/rules.test.ts`
Expected: PASS, `8 pass`.

- [ ] **Step 5: Write the wire**

Create `src/Wire.tsx`:

```tsx
import { useMemo } from "react";
import type { GameView } from "./api";
import { Icon, type IconName } from "./icons";
import { wireHue, wireLabel, type LedgerKey } from "./rules";
import { useReduced } from "./motion";

const sign = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 10) / 10}`;
const GLYPH: Record<string, IconName> = { ledger: "act", resistance: "seat", promise: "act", card: "crisis" };

/** One line per move with its cause, in its hue, and a ledger line is clickable to peek (spec §9). */
export default function Wire({ game, onPick }: { game: GameView; onPick: (k: LedgerKey, cause: string) => void }) {
  const reduced = useReduced();
  // one map for both id kinds: a ledger line's id is a region, a resistance line's is a holder
  const names = useMemo(() => new Map([
    ...game.pack.regions.map((r) => [r.id, r.name] as [string, string]),
    ...game.holders.map((h) => [h.id, h.name] as [string, string]),
  ]), [game.pack.regions, game.holders]);
  const lines = game.wire;
  const runs = reduced || lines.length < 4 ? [lines] : [lines, lines];
  return (
    <div className="wire">
      <span className="lbl"><Icon name="wire" sm /> Wire</span>
      <div className="runwrap">
        <div className={`run ${reduced || lines.length < 4 ? "still" : ""}`}>
          {runs.flatMap((set, r) => set.map((l, i) => {
            const icon = l.kind === "ledger" && l.ledger ? (l.ledger as IconName) : GLYPH[l.kind] ?? "act";
            const body = <><Icon name={icon} sm /><b className="num">{sign(l.delta)}</b><span>{wireLabel(l, names)}</span></>;
            return l.kind === "ledger" && l.ledger
              ? <button key={`${r}-${i}`} className={`w ${wireHue(l)}`} onClick={() => onPick(l.ledger as LedgerKey, l.cause)}>{body}</button>
              : <span key={`${r}-${i}`} className={`w ${wireHue(l)}`}>{body}</span>;
          }))}
          {game.pending ? <span className="w"><b className="num">Next</b><span>{game.pending}</span></span> : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Style it**

In `src/styles.css`, after the peek rules, add:

```css
.wire { position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-sticky); background: var(--ink); color: var(--bg);
  display: flex; align-items: center; height: var(--wire); overflow: hidden; }
.wire .lbl { flex: none; display: flex; align-items: center; gap: 6px; padding: 0 var(--s3); height: 100%;
  background: var(--accent); color: var(--bg); font: 800 13px/1 var(--display); letter-spacing: 0.12em; text-transform: uppercase; }
.runwrap { flex: 1; min-width: 0; overflow: hidden; }
.run { display: flex; gap: var(--s5); white-space: nowrap; padding-left: var(--s5); animation: ticker 46s linear infinite; }
.run.still { animation: none; }
.wire:hover .run, .wire:focus-within .run { animation-play-state: paused; }
.wire .w { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--bg); min-height: 38px;
  border-bottom: 2px solid transparent; }
button.w:hover, button.w:focus-visible { border-bottom-color: var(--c-on); }
.wire .w b { font: 800 17px/1 var(--display); color: var(--c-on, var(--bg)); font-variant-numeric: tabular-nums; }
.wire .w .ic { color: var(--c-on); }
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
```

The `@media (prefers-reduced-motion: reduce)` block already zeroes every animation duration, so the run needs nothing added there; Task 24 checks that block once, at the end.

- [ ] **Step 7: Hang it on the Desk**

In `src/Desk.tsx`, import `Wire` and render it as the last child of `<main className="desk press">`:

```tsx
      <Wire game={game} onPick={(k, c) => { setPeek(k); setCause(c); }} />
```

- [ ] **Step 8: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 9: Visual check**

End one turn and look at the bottom of the window. The wire must run across the full width on ink, with the label block in the accent, one entry per ledger move showing the hue icon, the signed figure in the lighter stage hue and the cause, and the pending item last. Hover it: the run must stop so an entry can be clicked, and clicking must open that ledger's peek with the cause printed inside it. Push a holder into resistance and confirm that line prints the holder's name and its cause in the one red, and that it is not clickable. With reduce motion on, the run must be still.

- [ ] **Step 10: Commit**

```bash
git add src/Wire.tsx src/Desk.tsx src/styles.css src/rules.ts src/rules.test.ts
git commit -m "The wire prints every ledger move with its cause"
```

---

### Task 8: The stage, the floor and the holder rows

**Files:**
- Create: `src/Holders.tsx`
- Modify: `src/Desk.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `game.holders` (Stage A `HolderView[]`: `id name where stance resistance line response weight levers warnedAt nearest persona`), `game.warnings`.
- Produces: `export default function Holders({ holders, warnings, onPick })` and `export function HolderPlate({ h, warned, onPick })`.

- [ ] **Step 1: Write the plates**

Create `src/Holders.tsx`:

```tsx
import type { GameView } from "./api";
import { Icon } from "./icons";

type H = GameView["holders"][number];

const RESPONSE: Record<string, string> = {
  early_test: "can call the test early", coup: "can end the run", strike: "can strike a decree",
  refuse_levy: "can refuse a levy", riot: "can riot", excommunicate: "can excommunicate",
  embargo: "can embargo", none: "cannot remove you",
};

/** One plate per holder: the mood, the resistance against its line, and the one nearest its line marked. */
export function HolderPlate({ h, warned, onPick }: { h: H; warned: boolean; onPick: (id: string) => void }) {
  const over = h.resistance >= h.line;
  return (
    <button className={`plateh ${h.nearest ? "near" : ""} ${over ? "over" : ""}`} onClick={() => onPick(h.id)}
      aria-label={`${h.name}, mood ${Math.round(h.stance * 100)} percent, resistance ${Math.round(h.resistance)} of ${h.line}, ${RESPONSE[h.response] ?? h.response}`}>
      <span className="ph">
        <Icon name={h.where === "abroad" ? "abroad" : "seat"} sm />
        <b>{h.name}</b>
        {h.weight ? <span className="chip faint num">{h.weight.toFixed(2)}</span> : null}
      </span>
      <span className="mood num">{Math.round(h.stance * 100)}</span>
      <span className="res" aria-hidden="true">
        <i style={{ width: `${Math.min(100, h.resistance)}%` }} />
        <b style={{ left: `${Math.min(100, h.line)}%` }} />
      </span>
      <span className="small muted">{warned ? "Warned" : h.nearest ? "Nearest its line" : RESPONSE[h.response] ?? h.response}</span>
    </button>
  );
}

export default function Holders({ holders, warnings, onPick }: {
  holders: H[]; warnings: GameView["warnings"]; onPick: (id: string) => void;
}) {
  const warned = new Set(warnings.map((w) => w.holder));
  const rows: [string, H[]][] = [
    ["At home", holders.filter((h) => h.where === "home")],
    ["Abroad", holders.filter((h) => h.where === "abroad")],
  ];
  return (
    <div className="holders">
      {rows.map(([label, list]) => (list.length ? (
        <div key={label} className="holderrow">
          <div className="kicker">{label}</div>
          <div className="plates">{list.map((h) => <HolderPlate key={h.id} h={h} warned={warned.has(h.id)} onPick={onPick} />)}</div>
        </div>
      ) : null))}
    </div>
  );
}
```

- [ ] **Step 2: Style the plates**

In `src/styles.css`, after the `.floorbox` rule, add:

```css
.holders { display: grid; gap: var(--s2); flex: none; }
.holderrow { display: grid; gap: 4px; }
.plates { display: flex; flex-wrap: wrap; gap: var(--s2); }
.plateh { flex: 1 1 140px; min-height: 44px; display: grid; gap: 2px; text-align: left; padding: 6px 8px;
  border: 1.5px solid var(--tone); background: var(--bg); transition: border-color var(--t-state); }
.plateh:hover { border-color: var(--ink); }
.plateh.near { border-color: var(--ink); border-width: 2px; }
.plateh.over { border-color: var(--danger); border-width: 2px; }
.plateh .ph { display: flex; align-items: center; gap: 5px; }
.plateh b { font: 800 14px/1.05 var(--display); text-transform: uppercase; letter-spacing: 0.02em; }
.plateh .mood { font: 800 26px/1 var(--display); font-variant-numeric: tabular-nums; }
.plateh .res { position: relative; display: block; height: 7px; background: var(--tone); }
.plateh .res i { position: absolute; inset: 0 auto 0 0; background: var(--ink); transition: width 700ms var(--ease-expo); }
.plateh .res b { position: absolute; top: -3px; width: 2px; height: 13px; background: var(--danger); }
.plateh.near .small, .plateh.over .small { color: var(--ink); }
.plateh.over .small { color: var(--danger); }
```

- [ ] **Step 3: Put it on the stage**

In `src/Desk.tsx`, import `Holders` and render it inside the floor column, under the whip bar and above nothing else:

```tsx
          <Holders holders={game.holders} warnings={game.warnings} onPick={setHolder} />
```

Add `const [holder, setHolder] = useState<string | null>(null);` beside the other state. The holder file that a click opens lands in Task 13's Room panel, so for now select the holder and switch the rail to the Room tab.

When `game.pack.chamber` has no seats for this polity the floor renders as it does today; the plates are the stage's second row either way.

- [ ] **Step 4: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 5: Visual check**

Open a saved game built after Stage A. Under the floor you must see two labelled rows, "At home" and "Abroad", with one plate per holder: the name in condensed caps, the counted weight as a faint chip, the mood as a large tabular number, and a resistance bar with a red tick at that holder's line. Exactly one plate carries the heavier ink border, and it must be the holder whose resistance is nearest its line. Drive a holder over its line and confirm that plate turns to a red border with the word in red, never red alone.

- [ ] **Step 6: Commit**

```bash
git add src/Holders.tsx src/Desk.tsx src/styles.css
git commit -m "The stage shows the room at home and abroad against each line"
```

---

### Task 9: The composer, seven verb tabs that settle from the text

**Files:**
- Create: `src/Compose.tsx`
- Modify: `src/Desk.tsx`, `src/styles.css`, `src/rules.ts`, `src/rules.test.ts`

**Interfaces:**
- Consumes: `game.instruments` (Stage A `Partial<Record<Verb, InstrumentView>>` with `name consent price available affordable`), `api.price` (Stage B `POST /acts/price`, body `{ turn, text, verb?, memberId? }`).
- Produces: `export default function Compose({ game, act, busy, verb, onVerb, text, onText })` and `settleVerb(text, instruments)` in `src/rules.ts`.

- [ ] **Step 1: Write the failing test**

Append to `src/rules.test.ts`:

```ts
import { settleVerb } from "./rules";

const all = { decree: {}, law: {}, appoint: {}, spend: {}, proclaim: {}, favour: {}, force: {} } as never;

test("the verb settles from the words the player used", () => {
  expect(settleVerb("Send troops to the eastern border and set a curfew.", all)).toBe("force");
  expect(settleVerb("Appoint Livia to the treasury.", all)).toBe("appoint");
  expect(settleVerb("Pay the legions four months of back wages.", all)).toBe("spend");
  expect(settleVerb("Tell the country the grain will hold.", all)).toBe("proclaim");
  expect(settleVerb("Promise Cassius the province he wants.", all)).toBe("favour");
  expect(settleVerb("By my own hand, the tax on salt ends today.", all)).toBe("decree");
  expect(settleVerb("A bill for four years of farm credit.", all)).toBe("law");
});

test("an empty box and an unpriced verb both fall back to what the pack allows", () => {
  expect(settleVerb("", all)).toBe("law");
  // no cue matches without `force`, so the fallback order decides it
  expect(settleVerb("Send troops in.", { spend: {}, proclaim: {} } as never)).toBe("proclaim");
  expect(settleVerb("anything", {} as never)).toBe(null);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/rules.test.ts`
Expected: FAIL, `SyntaxError: Export named 'settleVerb' not found in module`.

- [ ] **Step 3: Add the settler**

Append to `src/rules.ts`:

```ts
export const VERBS = ["decree", "law", "appoint", "spend", "proclaim", "favour", "force"] as const;
export type VerbKey = (typeof VERBS)[number];

// Most specific first: "pay the troops" is spend, "send the troops" is force.
const CUES: [VerbKey, RegExp][] = [
  ["force", /\b(deploy|curfew|martial|arrest|troops|soldiers|garrison|police|seal|occupy)\b/i],
  ["appoint", /\b(appoint|install|promote|dismiss|replace|name .* as|make .* (the|my))\b/i],
  ["favour", /\b(favou?r|promise|gift|pardon|owe|grant .* to \w+ personally)\b/i],
  ["spend", /\b(spend|pay|fund|subsid|relief|build|buy|wages|rations)\b/i],
  ["proclaim", /\b(tell|say|announce|address|speak|post|write to) (the|my|them)\b/i],
  ["decree", /\b(decree|edict|order|by my own|effective today|ends today)\b/i],
  ["law", /\b(bill|law|act|statute|legislat|table)\b/i],
];
const FALLBACK: VerbKey[] = ["law", "decree", "proclaim", "spend", "appoint", "favour", "force"];

/** The tabs settle from the text; the player may still pick a tab and the caller stops calling this. */
export function settleVerb(text: string, instruments: Partial<Record<VerbKey, unknown>>): VerbKey | null {
  const has = (v: VerbKey) => instruments[v] !== undefined;
  for (const [v, re] of CUES) if (has(v) && re.test(text)) return v;
  return FALLBACK.find(has) ?? null;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test src/rules.test.ts`
Expected: PASS, `10 pass`.

- [ ] **Step 5: Write the composer**

Create `src/Compose.tsx`:

```tsx
import type { KeyboardEvent } from "react";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Icon } from "./icons";
import { VERBS, type VerbKey } from "./rules";

/** Seven fixed instruments, pack named and pack priced, greyed when this turn cannot afford them (R6). */
export default function Compose({ game, act, busy, verb, onVerb, text, onText }: {
  game: GameView; act: Act; busy: boolean;
  verb: VerbKey | null; onVerb: (v: VerbKey) => void; text: string; onText: (s: string) => void;
}) {
  const list = VERBS.filter((v) => game.instruments[v]);
  const i = verb ? list.indexOf(verb) : 0;
  const keys = (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const j = d ? (i + d + list.length) % list.length : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    onVerb(list[j]);
    document.getElementById(`verb-${list[j]}`)?.focus();
  };
  const price = () => act(() => api.price(game, text.trim(), verb ?? undefined));
  return (
    <>
      <div className="verbs" role="tablist" aria-label="The seven instruments" data-tour="compose">
        {list.map((v) => {
          const ins = game.instruments[v]!;
          return (
            <button key={v} id={`verb-${v}`} role="tab" aria-selected={verb === v} tabIndex={verb === v ? 0 : -1}
              disabled={!ins.affordable} title={ins.affordable ? undefined : "Not affordable this turn"}
              onKeyDown={keys} onClick={() => onVerb(v)}>{ins.name}</button>
          );
        })}
      </div>
      <label className="kicker" htmlFor="actpad"><Icon name="act" sm /> On your desk, {game.pack.vocabulary.turn} {game.turn}</label>
      <textarea id="actpad" className="billpad" value={text} maxLength={1200} rows={3} spellCheck={false}
        placeholder="Say what you are doing, and who pays for it." onChange={(e) => onText(e.target.value)} />
      <div className="actions">
        <button className={`btn ${busy ? "busy" : ""}`} disabled={busy || !verb || text.trim().length < 12} onClick={price}>
          {busy ? "Pricing" : "Price it"}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Style it**

In `src/styles.css`, after the `.deskcol` rule, add:

```css
.verbs { display: flex; flex-wrap: wrap; gap: 1px; border-bottom: 1px solid var(--ink); }
.verbs button { flex: 1 1 auto; min-height: 44px; padding: 0 8px; color: var(--ink-2);
  font: 600 11px/1 var(--sans); letter-spacing: 0.06em; text-transform: uppercase;
  transition: color var(--t-fast), box-shadow var(--t-fast); }
.verbs button:hover:not(:disabled) { color: var(--ink); }
.verbs button[aria-selected="true"] { color: var(--ink); box-shadow: inset 0 -2px 0 var(--ink); }
.verbs button:disabled { opacity: 0.35; cursor: default; }
.deskcol .billpad { width: 100%; min-height: 74px; resize: none; border: 0; border-bottom: 2px solid var(--ink);
  background: transparent; padding: 0 0 7px; outline: none; font: 700 20px/1.2 var(--display); color: var(--ink); }
.deskcol .billpad:focus { border-bottom-color: var(--accent); }
```

- [ ] **Step 7: Hang it on the Desk**

In `src/Desk.tsx`, import `Compose` and `settleVerb`, and add the state and the settling effect:

```tsx
  const [verb, setVerb] = useState<VerbKey | null>(null);
  const [picked, setPicked] = useState(false);
  useEffect(() => { if (!picked) setVerb(settleVerb(text, game.instruments)); }, [text, picked, game.instruments]);
```

Render it in the desk column in place of the Task 4 comment:

```tsx
        <section className="col deskcol" aria-label="The desk">
          <Compose game={game} act={act} busy={busy} verb={verb} text={text}
            onVerb={(v) => { setPicked(true); setVerb(v); }} onText={setText} />
        </section>
```

Task 4 already dropped the old writing box and its handler, so the column is empty and this fills it. `text` and `setText` are the state Task 4 kept; the composer now owns them.

- [ ] **Step 8: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 9: Visual check**

Open a saved game and type into the left column. Seven tabs must sit above the box carrying the pack's own names, greyed when the turn cannot pay for them. Type "send troops to the border": the selected tab must move to the force instrument on its own. Then click a different tab by hand and keep typing: the tab must stay where you put it. Arrow left and right along the tab strip with the keyboard and confirm only one tab is a tab stop.

- [ ] **Step 10: Commit**

```bash
git add src/Compose.tsx src/Desk.tsx src/styles.css src/rules.ts src/rules.test.ts
git commit -m "The composer offers seven instruments and settles one from the text"
```

---

### Task 10: The price tag, Commit and End turn

**Files:**
- Create: `src/PriceTag.tsx`
- Modify: `src/Desk.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `game.tag` (Stage B's `PriceTag`: `verb title reading credibility quoted charge discounted revenue serves hits keeps targets tags regions member promises sunset template stances`), `game.refusal` (`{ line, test, cost }`), `api.act`, `api.endTurn` (Stage A's `POST /api/games/:id/turn/end`), `game.pending`, `game.events`, `game.stage`.
- Produces: `export default function Tag({ game, act, busy, onDone })` in `src/PriceTag.tsx`, the End turn control under it, and the live region that reads the boundary out. The two land together because they are the same column below the composer and share the `.deskcol` scroll.

Every act carries a price tag before the commit: the charge, the revenue, who it serves and who it hits, what it keeps, and the credibility factor (spec §2 and R10). It is the telegraph, so a loss is instructive (research §1 rows 2 and 3). There is no discard: pricing again replaces the tag and ending the turn drops it.

- [ ] **Step 1: Write the tag**

Create `src/PriceTag.tsx`:

```tsx
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Icon, type IconName } from "./icons";
import { hueClass, type LedgerKey } from "./rules";

// `as const`, not `LedgerKey[]`: Price has three keys and indexing it by a five-member union is a tsc error.
const CHARGED = ["treasury", "authority", "chest"] as const;

/** Named `Tag`, because `PriceTag` is Stage B's type name and both land in `src/Desk.tsx`. */
export default function Tag({ game, act, busy, onDone }: {
  game: GameView; act: Act; busy: boolean; onDone: () => void;
}) {
  const names = game.pack.constitution?.ledgers;
  const v = game.pack.vocabulary;
  if (game.refusal) {
    return (
      <figure className="tag refused">
        <figcaption className="tag-h"><span>The clerk returns it</span><span className="num">{game.refusal.cost} authority</span></figcaption>
        <div className="tag-b">
          <p>{game.refusal.line}</p>
          <p className="small muted">It failed the {game.refusal.test} test. Write it another way and price it again.</p>
        </div>
      </figure>
    );
  }
  const t = game.tag;
  if (!t) return null;
  const chips = (k: string, xs: string[], red = false) => (xs.length ? (
    <div className="tagr"><span className="k">{k}</span><span className="vs">{xs.map((x) => <span key={x} className={`chip ${red ? "red" : "faint"}`}>{x}</span>)}</span></div>
  ) : null);
  return (
    <figure className="tag" data-tour="tag">
      <figcaption className="tag-h">
        <span>Price tag{t.discounted ? ", a quarter off" : ""}</span>
        <span className="num">credibility {t.credibility.toFixed(2)}</span>
      </figcaption>
      <div className="tag-b">
        <h3>{t.title}</h3>
        <p className="small">{t.reading}</p>
        <dl className="fig">
          {CHARGED.map((k) => (t.charge[k] ? (
            <div key={k} className={hueClass(k)}>
              <dt><Icon name={k as IconName} sm /> {names?.[k]?.name ?? k}</dt>
              <dd className="num">{"−"}{t.charge[k]}
                {t.discounted && t.quoted[k] !== t.charge[k] ? <span className="was num"> was {t.quoted[k]}</span> : null}</dd>
            </div>
          ) : null))}
          {t.revenue.map((r, i) => (
            <div key={`r${i}`} className={hueClass(r.ledger as LedgerKey)}>
              <dt><Icon name={r.ledger as IconName} sm /> {names?.[r.ledger]?.name ?? r.ledger}
                {r.id ? `, ${game.pack.regions.find((g) => g.id === r.id)?.name ?? r.id}` : ""}, each {v.turn}</dt>
              <dd className="num">{r.delta > 0 ? `+${r.delta}` : `${"−"}${Math.abs(r.delta)}`}</dd>
            </div>
          ))}
        </dl>
        {chips("Serves", t.serves)}
        {chips("Hits", t.hits, true)}
        {chips("Keeps", t.keeps)}
        {t.stances.length ? (
          <div className="tagr"><span className="k">Room</span><span className="vs">
            {t.stances.map((r) => (
              <span key={r.id} className="chip red num">{r.name} at {Math.round(r.stance * 100)}, resistance {Math.round(r.resistance)} of {r.line}</span>
            ))}
          </span></div>
        ) : null}
        {t.promises.length ? <p className="small">Read as a promise: {t.promises.map((x) => `${x.label}, by ${v.turn} ${x.window}`).join("; ")}.</p> : null}
        {t.sunset ? <p className="small num">It ends at {v.turn} {t.sunset}.</p> : null}
        <span className="priced">Priced</span>
      </div>
      <div className="actions">
        <button className={`btn ${busy ? "busy" : ""}`} data-primary disabled={busy} onClick={() => act(() => api.act(game)).then(onDone)}>
          {busy ? "Committing" : "Commit"}
        </button>
        <span className="small muted">Price something else to replace this, or end the {v.turn} to drop it.</span>
      </div>
    </figure>
  );
}
```

The whip band is not on the tag: Stage B put it on the bill row, because the count happens at commit, so a tabled law prints its band on the floor.

- [ ] **Step 2: Style it**

In `src/styles.css`, after the `.deskcol .billpad` rules, add:

```css
.was { font: 600 11px/1 var(--sans); color: var(--ink-2); text-decoration: line-through; margin-left: 5px; }
.tag { margin: var(--s3) 0 0; border: 2px solid var(--ink); background: var(--bg); position: relative; }
.tag.refused { border-color: var(--danger); }
.tag-h { display: flex; justify-content: space-between; gap: var(--s2); background: var(--ink); color: var(--bg);
  padding: 5px 9px; font: 600 10px/1.4 var(--sans); letter-spacing: 0.11em; text-transform: uppercase; }
.tag.refused .tag-h { background: var(--danger); }
.tag-b { padding: var(--s3) var(--s3) var(--s4); }
.tag-b h3 { font-size: 22px; margin-bottom: var(--s2); text-transform: uppercase; }
.fig { margin: 0; }
.fig > div { display: flex; justify-content: space-between; align-items: center; gap: var(--s3); padding: 5px 0; border-bottom: 1px solid var(--tone); }
.fig dt { font-size: 12.5px; display: flex; align-items: center; gap: 6px; }
.fig dd { margin: 0; font: 800 22px/1 var(--display); font-variant-numeric: tabular-nums; }
.tagr { display: flex; gap: var(--s2); align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--tone); }
.tagr:last-of-type { border-bottom: 0; }
.tagr .k { flex: none; width: 46px; font: 600 10px/1.6 var(--sans); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-2); }
.tagr .vs { display: flex; flex-wrap: wrap; gap: var(--s1); }
/* its own name: `.stamp` is the full-page oath stamp and keeps that meaning */
.priced { position: absolute; right: 9px; bottom: 9px; transform: rotate(-6deg);
  font: 800 14px/1 var(--display); letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 9px;
  border: 3px solid var(--accent); color: var(--accent); mix-blend-mode: multiply; pointer-events: none; }
.tag .actions { padding: 0 var(--s3) var(--s3); margin-top: 0; }
```

- [ ] **Step 3: Hang it under the composer**

In `src/Desk.tsx`, add `import Tag from "./PriceTag";` and render it inside the desk column under `<Compose/>`:

```tsx
          <Tag game={game} act={act} busy={busy} onDone={() => { setText(""); setPicked(false); }} />
```

- [ ] **Step 4: Add the End turn control**

In `src/Desk.tsx`, under `<Tag/>` inside the desk column, add:

```tsx
          <div className="endturn panel">
            {game.pending ? <p className="small"><span className="kicker">Next</span> {game.pending}</p> : null}
            <button className={`btn ghost ${busy ? "busy" : ""}`} data-tour="end"
              disabled={busy || cardOpen || game.stage !== "session"}
              onClick={() => act(() => api.endTurn(game)).then((ok) => { if (ok) { setText(""); setPicked(false); } })}>
              {busy ? "Ending" : `End the ${v.turn}`}
            </button>
            {game.tag ? <p className="small muted">What is priced on the desk is dropped, not committed.</p> : null}
            {cardOpen ? <p className="small muted">Answer the card on the desk first.</p> : null}
          </div>
```

Add `const cardOpen = !!game.events.at(-1) && game.events.at(-1)!.stance === undefined;` beside the other derived state, and reuse it for the card gate. End turn is never gated on the price tag: Stage A's `endTurn` clears `game.tag` and `game.refusal` at the boundary, so an unpriced desk is simply dropped.

- [ ] **Step 5: Style it and read the boundary out**

In `src/styles.css`, after the `.tag .actions` rule, add:

```css
.endturn { margin-top: auto; display: grid; gap: 6px; }
.endturn .btn { width: 100%; }
.endturn .kicker { display: inline; margin-right: 6px; }
```

Then in `src/Desk.tsx`, add to the existing `setLive` effects:

```tsx
  useEffect(() => { if (game.pending) setLive(`Next ${v.turn}. ${game.pending}`); }, [game.pending]); // eslint-disable-line
```

- [ ] **Step 6: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 7: Visual check**

Write an act and press Price it. A ruled tag must print under the box with an ink header, the title in condensed caps, the clerk's one-line reading, one row per charged ledger and per revenue line in that ledger's hue with the figure tabular and ink, the serves, hits and keeps as chips, each hit holder with its stance and its resistance against its line, the credibility factor in the header, and a Priced mark in the accent at the bottom right. Commit must be 52 px and reachable by keyboard. Play into the discounted turns and price an act aimed at a counted holder: the header must say a quarter off and each discounted figure must carry its struck-through original. Then write something the era cannot do, such as "broadcast on television" in 44 BC, and confirm the tag comes back in the one red with the clerk's line, the test it failed and the authority it cost, not an error toast.

Then look at the bottom of the same column. End turn must sit under the tag in ghost weight so it never outshines Commit, with the pending item printed above it in one line. Price an act without committing it: End turn must stay live and the sentence under it must warn that the priced act is dropped. Leave a crisis card unanswered: End turn must grey and say so. Commit an act, then end the turn: the wire must fill with the boundary's lines, the turn number in the masthead must advance by one, and a screen reader must hear the pending item once. At a 700 px window height, scroll the desk column and confirm both Commit and End turn are reachable.

- [ ] **Step 8: Commit**

```bash
git add src/PriceTag.tsx src/Desk.tsx src/styles.css
git commit -m "Every act prints its price tag, and the turn ends under it"
```

---

### Task 11: The tabled law gets a home on the desk

**Files:**
- Modify: `src/Desk.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: the bill block Task 4 carried across from `Chamber.tsx`, `game.bills`, `api.whip`, `api.amend`, `api.adopt`, `api.vote`, `FeedLine`.
- Produces: `.tabled` in the desk column, the only home a tabled law has once the rail becomes the five spec §9 tabs in Task 12.

A law tabled by `POST /acts` is counted, amended, whipped and voted through four routes Stage B keeps and the term script still drives. The two-tab rail is their only screen today, and Task 12 replaces that rail with Feed, Country, Room, Record and Pinned, none of which can hold them. The spec fixes those five tabs, so the count moves to the desk column, under the price tag, where the act that tabled it was written. This task runs before Task 12 so the controls are never orphaned, not even between two commits.

- [ ] **Step 1: Move the block**

In `src/Desk.tsx`, cut the whole `tab === "turn"` branch of the rail panel, which is the bill card with its kicker, title, summary, tags, stamp and actions, the `Adopt an amendment` block under it, `<FeedLine/>`, the headline panel and the two quotes. Leave the `tab === "feed"` branch and the tab strip alone.

Paste it into the desk column, as the last child before `<div className="endturn panel">`, wrapped in one element and gated on the bill:

```tsx
          {bill ? (
            <section className="tabled" aria-label={`${v.bill} ${bill.id}`}>
              {/* the bill card, the amendments, FeedLine, the headline and the quotes, unchanged */}
            </section>
          ) : null}
```

Every handler stays as it is: `api.whip`, `api.amend`, `api.adopt` and `api.vote` are called exactly where they were called before, and `bill`, `whipped`, `voted`, `exp`, `need`, `yes`, `margin` and `amendments` are the same derived values Task 4 carried across. Nothing about the roll call changes.

- [ ] **Step 2: Style it**

In `src/styles.css`, after the `.endturn .kicker` rule, add:

```css
.tabled { display: grid; gap: var(--s3); border-top: 2px solid var(--ink); padding-top: var(--s3); flex: none; }
.tabled h2 { font-size: 28px; margin: 4px 0 6px; }
.tabled .actions { margin-top: var(--s2); }
```

The desk column already scrolls, so a tabled law with two amendments and two quotes pushes nothing off the screen.

- [ ] **Step 3: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 4: Visual check**

Open a saved game with a law on the floor. Under the price tag the desk column must carry the bill card with its title, summary and tags, then the count controls in this order as the state moves: the whip button, then Call the vote with Amend beside it, then the pass or fail stamp with Next. The floor in the middle column must still count, still roll seat by seat and still land its gavel. Adopt an amendment from the desk column and watch the expected yes on the floor move. Call the vote and watch the roll call. Then end the turn with no law tabled and confirm the desk column is only the composer, the tag and End turn, with nothing left behind.

- [ ] **Step 5: Commit**

```bash
git add src/Desk.tsx src/styles.css
git commit -m "A tabled law is counted and voted from the desk column"
```

---

### Task 12: The rail, five tabs with the unread mark and Pinned

**Files:**
- Create: `src/Rail.tsx`
- Modify: `src/Desk.tsx`, `src/styles.css`, `src/rules.ts`, `src/rules.test.ts`

**Interfaces:**
- Consumes: `PinItem` from `src/Peek.tsx`, `game.posts`, `game.inForce`, `game.warnings`, `game.wire`.
- Produces: `export default function Rail({ label, tab, onTab, unread, pins, onUnpin, children })`, `export const TABS`, `export type Tab`, and `unreadTabs(game, seen)` in `src/rules.ts`. The rail takes no `game`: every number it needs arrives as `unread` or `pins`.

- [ ] **Step 1: Write the failing test**

Append to `src/rules.test.ts`:

```ts
import { unreadTabs } from "./rules";

const g = {
  turn: 7,
  posts: [{ turn: 6 }],
  inForce: [{ turn: 5, term: 1 }],
  warnings: [{ at: 7 }],
  wire: [{ kind: "ledger", ledger: "popularity", delta: 2, cause: "the post" }],
} as never;

test("a tab is unread when its content moved after the player last opened it", () => {
  expect(unreadTabs(g, { feed: 0, country: 0, room: 0, record: 0, pinned: 0 }).sort())
    .toEqual(["country", "feed", "record", "room"]);
});

test("opening a tab clears its mark and nothing else", () => {
  expect(unreadTabs(g, { feed: 6, country: 7, room: 7, record: 5, pinned: 0 })).toEqual([]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/rules.test.ts`
Expected: FAIL, `SyntaxError: Export named 'unreadTabs' not found in module`.

- [ ] **Step 3: Add the reader**

Append to `src/rules.ts`:

```ts
type UnreadGame = {
  turn: number; posts: { turn: number }[]; inForce: { turn: number }[];
  warnings: { at: number }[]; wire: { kind: string; ledger?: string | null }[];
};

/**
 * Nielsen's ceiling is two disclosure levels, so anything the player has not seen is a mark on a
 * tab and never a third layer of screen (research §2).
 */
export function unreadTabs(game: UnreadGame, seen: Record<string, number>): string[] {
  const last = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  const at: Record<string, number> = {
    feed: last(game.posts.map((p) => p.turn)),
    country: game.wire.some((l) => l.kind === "ledger" && l.ledger === "popularity") ? game.turn : 0,
    room: last(game.warnings.map((w) => w.at)),
    record: last(game.inForce.map((f) => f.turn)),
    pinned: 0,
  };
  return Object.keys(at).filter((k) => at[k] > (seen[k] ?? 0));
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test src/rules.test.ts`
Expected: PASS, `12 pass`.

- [ ] **Step 5: Write the rail**

Create `src/Rail.tsx`:

```tsx
import type { KeyboardEvent, ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import type { PinItem } from "./Peek";

export const TABS = ["feed", "country", "room", "record", "pinned"] as const;
export type Tab = (typeof TABS)[number];

const GLYPH: Record<Tab, IconName> = { feed: "post", country: "region", room: "seat", record: "vote", pinned: "pin" };

export default function Rail({ label, tab, onTab, unread, pins, onUnpin, children }: {
  label: Record<Tab, string>; tab: Tab; onTab: (t: Tab) => void; unread: string[];
  pins: PinItem[]; onUnpin: (key: string) => void; children: ReactNode;
}) {
  const i = TABS.indexOf(tab);
  const keys = (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const j = d ? (i + d + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    onTab(TABS[j]);
    document.getElementById(`tab-${TABS[j]}`)?.focus();
  };
  return (
    <>
      <div className="tabbar" role="tablist" aria-label="The rail">
        {TABS.map((t) => {
          const n = t === "pinned" ? pins.length : 0;
          const mark = unread.includes(t);
          return (
            <button key={t} id={`tab-${t}`} role="tab" aria-selected={tab === t} aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1} onKeyDown={keys} onClick={() => onTab(t)}>
              <Icon name={GLYPH[t]} sm />
              <span>{label[t]}</span>
              {n ? <b className="badge num">{n}</b> : mark ? <b className="badge dot" aria-label="new">&nbsp;</b> : null}
            </button>
          );
        })}
      </div>
      <div className="railbody">
        <div className="tabpanel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === "pinned" ? (
            pins.length ? pins.map((p) => (
              <div key={p.key} className={`pinned ${p.hue}`}>
                <h4>{p.title}</h4>
                {p.lines.map(([k, val], j) => <div key={j} className="line"><span>{k}</span><b className="num">{val}</b></div>)}
                <button className="unpin" onClick={() => onUnpin(p.key)}>Unpin</button>
              </div>
            )) : <p className="note">Nothing pinned. Open a ledger or a holder, then press Pin to keep it here.</p>
          ) : children}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Style it**

In `src/styles.css`, after the `.railbody` rule, add:

```css
.tabbar { display: flex; gap: 1px; border-bottom: 1px solid var(--ink); flex: none; }
.tabbar button { position: relative; flex: 1 1 auto; min-height: 44px; padding: 0 5px; color: var(--ink-2);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  font: 600 9.5px/1 var(--sans); letter-spacing: 0.07em; text-transform: uppercase;
  transition: color var(--t-fast), box-shadow var(--t-fast); }
.tabbar button:hover { color: var(--ink); }
.tabbar button[aria-selected="true"] { color: var(--ink); box-shadow: inset 0 -2px 0 var(--ink); }
/* ink, not accent: the default accent is the old red and unread is not a danger (research §3) */
.tabbar .badge { position: absolute; transform: translate(18px, -14px); background: var(--ink); color: var(--bg);
  font-size: 9px; padding: 1px 4px; }
.tabbar .badge.dot { width: 8px; height: 8px; padding: 0; }
.tabpanel { padding-top: var(--s3); display: grid; gap: var(--s3); align-content: start; }
.pinned { border-top: 2px solid var(--c, var(--ink)); padding: var(--s2) 0 var(--s3); display: grid; gap: 4px; }
.pinned h4 { font: 800 18px/1 var(--display); text-transform: uppercase; margin: 0; color: var(--c, var(--ink)); }
.pinned .line { display: flex; justify-content: space-between; gap: var(--s2); font-size: 12.5px; }
.unpin { min-height: 44px; justify-self: start; font: 600 10px/1 var(--sans); letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-2); text-decoration: underline; text-underline-offset: 3px; }
.unpin:hover { color: var(--ink); }
```

- [ ] **Step 7: Hang it on the Desk**

Task 11 already moved the tabled law out of the rail, so what is left to replace is the tab strip, its panel wrapper and the `tab === "feed"` branch. In `src/Desk.tsx`, replace all of it with:

```tsx
        <aside className="col railcol" aria-label="The rail">
          <Rail label={{ feed: v.feed, country: "Country", room: "Room", record: "Record", pinned: "Pinned" }}
            tab={tab} onTab={(t) => { setTab(t); setSeen((s) => ({ ...s, [t]: game.turn })); }}
            unread={unreadTabs(game, seen)} pins={pins} onUnpin={(k) => setPins((xs) => xs.filter((x) => x.key !== k))}>
            {tab === "feed" ? <Feed game={game} bill={bill} act={act} busy={busy} /> : null}
          </Rail>
        </aside>
```

Change the tab state to `const [tab, setTab] = useState<Tab>("feed");` and add `const [seen, setSeen] = useState<Record<string, number>>({});`. Delete the `TABS` constant Task 4 carried over from the two-tab rail.

- [ ] **Step 8: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 9: Visual check**

Open a saved game. The rail must carry five tabs with an icon over a short label, the selected one underlined in ink. End a turn without opening the rail: the Feed and Country tabs must take a small ink dot, never a red one. Open each one and the dot must clear for that tab alone. Open a ledger peek and press Pin: the Pinned tab must take a count badge and the panel must hold that ledger's lines with an Unpin control at 44 px. Arrow along the tabs and confirm only one is a tab stop.

- [ ] **Step 10: Commit**

```bash
git add src/Rail.tsx src/Desk.tsx src/styles.css src/rules.ts src/rules.test.ts
git commit -m "The rail carries five tabs, the unread mark and what the player pinned"
```

---

### Task 13: The rail panels, Country, Room and Record

**Files:**
- Create: `src/Panels.tsx`
- Modify: `src/Desk.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `Tiles` and `shortNames` from `src/Tiles.tsx`, `game.ledgers.popularity`, `game.holders`, `game.inForce`, `game.promises`, `game.pack.escalations`, `roomTo`.
- Produces: `export function Country({ game })`, `export function Room({ game, selected, onPick, onPin })`, `export function RecordTab({ game })`. The tab component is not called `Record`, because `src/Desk.tsx` imports it beside the `Record<K, V>` type it uses for the seen map.

- [ ] **Step 1: Write the three panels**

Create `src/Panels.tsx`:

```tsx
import { useMemo } from "react";
import type { GameView } from "./api";
import Tiles, { shortNames, type TileDatum } from "./Tiles";
import type { PinItem } from "./Peek";

/** The rubric R8 asks to be printed, in the Record tab, in plain words. */
const RUBRIC = [
  "Power. Can this ruler and this body do this at all.",
  "Era. Does the mechanism exist in this year.",
  "A refusal costs 1 authority and never reaches the room.",
  "Scale is priced by a credibility factor from 0.6 to 1.0 that multiplies revenue and popularity.",
];

export function Country({ game }: { game: GameView }) {
  const regions = game.pack.regions;
  const wsum = regions.reduce((a, r) => a + r.weight, 0) || 1;
  const shorts = useMemo(() => shortNames(regions.map((r) => r.name)), [regions]);
  const items: TileDatum[] = regions.map((r, i) => ({
    id: r.id, name: r.name, short: shorts[i], weight: r.weight / wsum,
    p: (game.ledgers.popularity[r.id] ?? 50) / 100,
  }));
  const low = [...regions].sort((a, b) => (game.ledgers.popularity[a.id] ?? 50) - (game.ledgers.popularity[b.id] ?? 50))[0];
  return (
    <>
      <Tiles items={items} label="The country by weight" foot={(d) => `${Math.round(d.p * 100)}`} />
      {low ? <p className="note">{low.name} at {Math.round(game.ledgers.popularity[low.id] ?? 50)} is the drag.</p> : null}
    </>
  );
}

export function Room({ game, selected, onPick, onPin }: {
  game: GameView; selected: string | null; onPick: (id: string) => void; onPin: (item: PinItem) => void;
}) {
  const h = game.holders.find((x) => x.id === selected);
  // §9's rail zone is members and blocs, and a holder's members live on the pack, not on HolderView
  const members = game.pack.constitution?.holders.find((x) => x.id === selected)?.members;
  return (
    <>
      <ul className="causes" aria-label="The room">
        {game.holders.map((x) => (
          <li key={x.id}>
            <button className="rowbtn" aria-current={x.id === selected} onClick={() => onPick(x.id)}>
              <b className="num">{Math.round(x.stance * 100)}</b>
              <span>{x.name}, {x.where === "abroad" ? "abroad" : "at home"}, resistance {Math.round(x.resistance)} of {x.line}</span>
            </button>
          </li>
        ))}
      </ul>
      {h ? (
        <div className="panel">
          <div className="kicker">{h.persona.role}</div>
          <h3>{h.persona.name}</h3>
          <p className="small">Weight {h.weight.toFixed(2)}. Moved by {h.levers.map((l) => game.instruments[l]?.name ?? l).join(", ")}.</p>
          {members === "blocs" || members === "citizens" ? (
            <ul className="causes" aria-label="Its people">
              {game.pack.blocs.map((b) => (
                <li key={b.id}><b className="num">{Math.round((game.blocs[b.id] ?? 0.5) * 100)}</b><span>{b.name}</span></li>
              ))}
            </ul>
          ) : null}
          <button className="btn sm" onClick={() => onPin({
            key: `holder:${h.id}`, title: h.name, hue: "",
            lines: [["Mood", String(Math.round(h.stance * 100))], ["Resistance", `${Math.round(h.resistance)} of ${h.line}`], ["Weight", h.weight.toFixed(2)]],
          })}>Pin</button>
        </div>
      ) : null}
    </>
  );
}

export function RecordTab({ game }: { game: GameView }) {
  const v = game.pack.vocabulary;
  const promises = Object.values(game.promises);
  return (
    <>
      <div className="panel">
        <div className="kicker">In force</div>
        <ul className="causes">
          {game.inForce.length ? game.inForce.map((f) => (
            <li key={f.id}>
              <b className="num">{f.perTurn.reduce((a, p) => a + p.delta, 0)}</b>
              <span>{f.title}, each {v.turn}, repeal needs {f.repealConsent.replace(/_/g, " ")}{f.sunset ? `, ends at ${v.turn} ${f.sunset}` : ""}</span>
            </li>
          )) : <li><span>Nothing is in force yet.</span></li>}
        </ul>
      </div>
      <div className="panel">
        <div className="kicker">{v.promise}</div>
        <div className="pledges">
          {promises.map((p) => (
            <span key={p.label} className={`stampsm tiny ${p.state === "kept" ? "pass" : p.state === "broken" ? "fail" : "wait"}`}>
              {p.label}{p.state === "pending" ? ` · ${Math.max(0, p.window - game.turn)}` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="kicker">This term brings</div>
        <ul className="causes">
          {game.escalations.slice(0, 2 * game.term).map((k) => {
            const e = game.pack.escalations.find((x) => x.key === k);
            return e ? <li key={k}><span>{e.name}. {e.headline}</span></li> : null;
          })}
        </ul>
      </div>
      <div className="panel">
        <div className="kicker">What the clerk checks</div>
        <ul className="causes">{RUBRIC.map((r) => <li key={r}><span>{r}</span></li>)}</ul>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Style the rows**

In `src/styles.css`, after the `.unpin` rule, add:

```css
.causes { list-style: none; margin: 0; padding: 0; }
.causes li { display: flex; gap: var(--s2); align-items: baseline; padding: 5px 0; border-bottom: 1px solid var(--tone); font-size: 12.5px; }
.causes li b { font: 800 16px/1 var(--display); min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
.rowbtn { display: flex; gap: var(--s2); align-items: baseline; width: 100%; min-height: 44px; text-align: left; }
.rowbtn[aria-current="true"] { box-shadow: inset 2px 0 0 var(--ink); padding-left: 6px; }
```

- [ ] **Step 3: Hang them in the rail**

In `src/Desk.tsx`, import the three panels and fill the rail's children:

```tsx
            {tab === "feed" ? <Feed game={game} bill={bill} act={act} busy={busy} /> : null}
            {tab === "country" ? <Country game={game} /> : null}
            {tab === "room" ? <Room game={game} selected={holder} onPick={setHolder}
              onPin={(p) => setPins((xs) => (xs.some((x) => x.key === p.key) ? xs : [...xs, p]))} /> : null}
            {tab === "record" ? <RecordTab game={game} /> : null}
```

Change the holder plates' `onPick` to `(id) => { setHolder(id); setTab("room"); }` so a plate on the stage opens that holder in the rail, which is the second and last disclosure level.

- [ ] **Step 4: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 5: Visual check**

Open each of the four content tabs. Country must show the weighted treemap with each region's popularity and one sentence naming the drag. Room must list every holder with its mood, where it sits and its resistance against its line, and clicking a plate on the stage must jump here with that holder selected and its figure and levers printed. Select the holder whose members are the street and confirm the pack's five blocs are listed under it with their own numbers. Record must list the acts in force with their per-turn effect and repeal consent, the promises with a countdown, this term's escalations, and the four rubric lines. Confirm no panel opens a modal.

- [ ] **Step 6: Commit**

```bash
git add src/Panels.tsx src/Desk.tsx src/styles.css
git commit -m "Country, Room and Record fill the rail"
```

---

### Task 14: The cards, warning, crisis, foreign move, black swan and escalation

**Files:**
- Modify: `src/Card.tsx`, `src/Desk.tsx`

**Interfaces:**
- Consumes: `game.events` (Stage B gave `Event` its own `kind` and `holder`), `game.warnings` (Stage A `Warning`: `{ holder, response, at, fires, number }`).
- Produces: `Card` gains `kind` and `holders` and loses `blocs`; `export function WarningCard({ pack, holder, warning, busy, onHold, onClose })`.

Holding a warning calls nothing. There is no hold route in Stage A's table or Stage B's, and Stage C writes no worker code: `advanceWarnings` already fires the response two turns later whatever the screen does. Hold is the player saying "I have read it", so it is a dismissal the Desk keeps in state.

- [ ] **Step 1: Give the card its kinds**

In `src/Card.tsx`, replace the `Props` type and the `Card` head with:

```tsx
export type CardKind = "crisis" | "foreign" | "swan" | "warning" | "escalation";

const KICKER: Record<CardKind, string> = {
  crisis: "A crisis", foreign: "A move abroad", swan: "Out of nowhere",
  warning: "A warning", escalation: "This term brings",
};

type Props = {
  pack: GamePack; event: ViewEvent; kind: CardKind; holders: { id: string; name: string; stance: number }[];
  turn: number; busy: boolean; onStance: (i: number) => void; onClose: () => void;
};

/** One poster, five kinds. A crisis, a move abroad and a black swan all have to be answered. */
export default function Card({ pack, event, kind, holders, turn, busy, onStance, onClose }: Props) {
  const answered = event.stance !== undefined;
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (answered) done.current?.focus(); }, [answered]);
  const stances = event.card?.stances ?? event.stances;
  const title = event.card?.title ?? "The floor has news.";
  return (
    <Poster label={title} block={!answered} onClose={onClose}>{(dismiss) => (<>
      <div className="kicker">{KICKER[kind]} · {pack.vocabulary.turn} {turn}</div>
      <h2>{title}</h2>
      {event.card ? <p>{event.card.body}</p> : null}
      {!answered ? (
        <div className="amend">
          {stances.map((s, i) => <button key={i} className="opt2" disabled={busy} onClick={() => onStance(i)}><b>{s}</b></button>)}
        </div>
      ) : (
        <>
          <div className="meters">
            {holders.map((h, i) => (
              <Meter key={h.id} k={h.name} value={Math.round(h.stance * 100)} suffix="%" fill={h.stance * 100} i={i} />
            ))}
          </div>
          <p className="lede">{event.outcome ?? stances[event.stance!]}</p>
          <button ref={done} className="btn" onClick={dismiss}>Close the card</button>
        </>
      )}
    </>)}</Poster>
  );
}
```

Delete the `blocs` prop and the `pack.blocs` loop it fed: v4 shows the holders after an answer, and the blocs are the street holder's members.

- [ ] **Step 2: Add the warning card**

Append to `src/Card.tsx`:

```tsx
/** R4: a holder over its line plays this with the number, and its response fires two turns later. */
export function WarningCard({ pack, holder, warning, busy, onHold, onClose }: {
  pack: GamePack; holder: { name: string; line: number }; warning: { response: string; fires: number; number: number };
  busy: boolean; onHold: () => void; onClose: () => void;
}) {
  const RESPONSE: Record<string, string> = {
    early_test: "call the test early", coup: "end your rule", strike: "strike your last decree",
    refuse_levy: "refuse the next levy", riot: "riot", excommunicate: "excommunicate you", embargo: "close the purse",
  };
  return (
    <Poster label={`${holder.name} warns you`} block={false} onClose={onClose}>{(dismiss) => (<>
      <div className="kicker">A warning · {pack.vocabulary.turn} {warning.fires}</div>
      <h2>{holder.name} is at {Math.round(warning.number)}.</h2>
      <p>Their line is {holder.line}. If they are still over it at {pack.vocabulary.turn} {warning.fires} they will {RESPONSE[warning.response] ?? "act"}.</p>
      <div className="amend">
        <button className="opt2" disabled={busy} onClick={onHold}><b>Hold</b><span className="small muted">Leave it and take the risk.</span></button>
        <button className="opt2" disabled={busy} onClick={dismiss}><b>Go and work on them</b><span className="small muted">Close this and spend the turn easing them.</span></button>
      </div>
    </>)}</Poster>
  );
}
```

- [ ] **Step 3: Pick the kind on the Desk**

In `src/Desk.tsx`, replace the `<Card .../>` line with:

```tsx
      {card && !rolling ? (
        <Card key={card.id} pack={pack} event={card} kind={KIND[card.kind ?? "generic"] ?? "crisis"}
          holders={game.holders.map((h) => ({ id: h.id, name: h.name, stance: h.stance }))}
          turn={card.turn} busy={busy} onStance={stance} onClose={() => setAnswered(null)} />
      ) : null}
      {warning ? (
        <WarningCard pack={pack} holder={{ name: warnedHolder!.name, line: warnedHolder!.line }} warning={warning}
          busy={busy} onHold={() => setHeld((xs) => [...xs, warning.holder])}
          onClose={() => setHeld((xs) => [...xs, warning.holder])} />
      ) : null}
```

Change the Card import in `src/Desk.tsx` to `import Card, { Announce, WarningCard, type CardKind } from "./Card";`, then add beside the other derived state, with the one mapper the kinds need:

```tsx
  const KIND: Record<string, CardKind> = { generic: "crisis", dated: "crisis", relief: "crisis", crisis: "crisis", swan: "swan", foreign: "foreign" };
  // a list, not one id: two warnings open at once must both be dismissable
  const [held, setHeld] = useState<string[]>([]);
  const warning = game.warnings.find((w) => !held.includes(w.holder)) ?? null;
  const warnedHolder = warning ? game.holders.find((h) => h.id === warning.holder) : undefined;
```

A foreign move and a black swan carry `kind: "foreign"` and `kind: "swan"` on the storylet, so they arrive through the same `Card` with no Hold stance, which is what `block={!answered}` already enforces. The escalation notice keeps `Announce`.

- [ ] **Step 4: Check the event type**

`export type ViewEvent = Event;` in `src/api.ts` needs no change: Stage B put `kind` and `holder` on `Event` itself, so they ride through. Confirm with `grep -n "kind" worker/engine.ts | grep -i event` that the field is there before writing the mapper; if Stage B named the values differently, the only edit is the `KIND` map above.

- [ ] **Step 5: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 6: Visual check**

Play until a crisis fires. The poster must print the kicker for its kind, the body, two costed stances, and after the answer one meter per holder rather than per bloc. Escape must not close it until it is answered. Drive a holder over its line and confirm the warning poster prints that holder's number, its line, the turn its response fires and what that response is, with Hold as one of two choices, and that Escape does close this one. Drive a second holder over its line so two warnings are open: dismissing the first must show the second, and dismissing the second must clear the card for good rather than bring the first one back. Confirm a move abroad has no Hold.

- [ ] **Step 7: Commit**

```bash
git add src/Card.tsx src/Desk.tsx
git commit -m "Five kinds of card, with the warning carrying its number and Hold"
```

---

### Task 15: Three coach marks, and the keyboard pass

**Files:**
- Modify: `src/Desk.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `Tour` and `TourStep` from `src/Tour.tsx`, the anchors `data-tour="compose"` from Task 9 and `data-tour="tag"` and `data-tour="end"` from Task 10.
- Produces: `const TOUR = (game: GameView) => Record<"write" | "price" | "end", TourStep>` inside `src/Desk.tsx`.

- [ ] **Step 1: Replace the three steps**

In `src/Desk.tsx`, replace the `TOUR` constant Task 4 carried across with:

```tsx
const TOUR = (game: GameView): Record<string, TourStep> => ({
  write: { id: "write", anchor: "compose", title: "1 of 3 · Say what you are doing",
    text: "Seven instruments, each with its own price. Write the act in a sentence and the right one settles itself." },
  price: { id: "price", anchor: "tag", title: "2 of 3 · Read the price",
    text: `What it costs, what it earns, who it serves and who it hits. Nothing is hidden, so ${game.ruler.role} can see a loss coming.` },
  end: { id: "end", anchor: "end", title: `3 of 3 · End the ${game.pack.vocabulary.turn}`,
    text: "Acts resolve as you make them. The world moves only when you end the turn." },
});
```

Replace the step chooser with:

```tsx
  const steps = TOUR(game);
  const step: TourStep | null = !tour ? null
    : !game.tag && !game.refusal && !text.trim() ? steps.write
    : game.tag || game.refusal ? steps.price
    : steps.end;
  const wasEnded = useRef(game.turn);
  useEffect(() => { if (tour && game.turn > wasEnded.current) endTour(); wasEnded.current = game.turn; }, [game.turn]); // eslint-disable-line
```

Delete the `hotSeat`, `weakest` and `Vocab` code the two-tab tour needed, and the `hot={hotSeat}` prop on the floor.

- [ ] **Step 2: Sweep the keyboard and the roles**

Check each of these in `src/Desk.tsx` and fix what is wrong:

- `.verbs` is `role="tablist"` with exactly one `tabIndex={0}` and arrow, Home and End handled (Task 9).
- `.tabbar` is `role="tablist"` with exactly one `tabIndex={0}` and the same keys (Task 12).
- Every `.led`, `.plateh`, `.rowbtn`, `.unpin`, `.btn.sm` and `.tabbar button` clears 44 px through the rules added in Tasks 5, 8, 12 and 13.
- Every unread parameter in the new files is written `_name`: `noUnusedParameters` is on, so `bunx tsc -b --force` is the check.
- The peek is opened by `focus` and closed by Escape (Task 6) and carries `role="group"` with a label, not `role="dialog"`.
- The live region `<div className="sr" role="status" aria-live="polite">` still sits inside `<main className="desk">`.

Add the one missing skip link at the top of the Desk so the wire and the rail are reachable without walking the whole strip:

```tsx
      <a className="sr" href="#actpad">Skip to the desk</a>
```

- [ ] **Step 3: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 4: Visual check**

Clear `usoj:tour` in local storage and reload a saved game. Three coach marks must appear in order: one on the instrument tabs while the box is empty, one on the price tag once an act is priced, one on End turn after the commit. Ending a turn must end the tour, and Skip the tour must work at every step. Then unplug the mouse: Tab must reach, in order, the skip link, the strip, the instrument tabs, the box, Price it, the tag's two buttons, a tabled law's controls, End turn, the floor, the plates, the rail tabs and the wire, with a visible ring at every stop.

- [ ] **Step 5: Commit**

```bash
git add src/Desk.tsx src/styles.css
git commit -m "Three coach marks for the Desk, and one tab stop per group"
```

---

### Task 16: The landing page, and the constitution step on Build

**Files:**
- Create: `src/Landing.tsx`
- Delete: `src/Write.tsx`
- Modify: `src/App.tsx`, `src/Build.tsx:5-6,15`, `src/styles.css`

**Interfaces:**
- Consumes: `api.daily`, `api.match`, `api.share`, `api.load`, the `usoj:game` pointer.
- Produces: `export default function Landing({ daily, resume, busy, onFind, onResume, onCode, onPlayDaily })`.

- [ ] **Step 1: Write the landing**

Create `src/Landing.tsx`:

```tsx
import { useState } from "react";
import type { Daily } from "./api";
import { Ornament } from "./theme";
import { hueClass, type LedgerKey } from "./rules";

export default function Landing({ daily, resume, busy, onFind, onResume, onCode, onPlayDaily }: {
  daily: Daily | null; resume: boolean; busy: boolean;
  onFind: (prompt: string) => void; onResume: () => void; onCode: (code: string) => void; onPlayDaily: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const ready = text.trim().length >= 3;
  const send = () => { if (ready && !busy) onFind(text.trim()); };
  return (
    <main className="landing press">
      <div className="mast"><b>United States of Jev</b><span className="flag"><Ornament kind="rule" /></span><span>Any polity, one term</span></div>

      <section className="panel door" aria-label="Today's term">
        <div className="kicker">Today's term</div>
        {daily ? (<>
          <h2>{daily.title}</h2>
          <p className="small muted">{daily.era} · {daily.place}</p>
          {daily.played && daily.grid ? (
            <div className="sharecard" aria-label="Today's result">
              {daily.grid.map((s, i) => <div key={i}><span className={`sq on ${hueClass(s.ledger as LedgerKey)}`} /><span>{i + 1}</span></div>)}
            </div>
          ) : null}
          <div className="row">
            <button className={`btn ${daily.played ? "ghost" : "hot"}`} disabled={busy} onClick={() => onPlayDaily(daily.scenario)}>
              {daily.played ? "Play it again as practice" : "Take the seat"}
            </button>
            <span className="small muted num">Streak {daily.streak} · played {daily.plays}</span>
          </div>
        </>) : <p className="note">Today's term is not up yet. Name a place and a time instead.</p>}
      </section>

      <section className="panel door" aria-label="Any polity">
        <div className="kicker">Any polity</div>
        <h2>Name a place and a time.</h2>
        <p className="muted">Germany in 2021. Rome in 44 BC. A Mars colony in 2091. Write it in any language.</p>
        <textarea className="ask" rows={2} value={text} spellCheck={false} placeholder="Egypt after the 2011 revolution"
          aria-label="Name a place and a time" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
        <div className="row">
          <button className={`btn ${busy ? "busy" : ""}`} disabled={!ready || busy} onClick={send}>{busy ? "Finding it" : "Find it"}</button>
          <span className="small muted">Command or Control plus Enter sends it.</span>
        </div>
      </section>

      {resume ? (
        <section className="panel door" aria-label="Resume">
          <div className="kicker">Where you left off</div>
          <button className="btn hot" disabled={busy} onClick={onResume}>Back to the desk</button>
        </section>
      ) : null}

      <section className="panel door" aria-label="A friend's code">
        <div className="kicker">A friend's code</div>
        <div className="field">
          <input className="code" value={code} spellCheck={false} aria-label="A friend's code"
            placeholder="J3-XXXXXX-0-012-000000" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="btn ghost" disabled={busy || code.trim().length < 8} onClick={() => onCode(code.trim())}>Play that seat</button>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Style it**

In `src/styles.css`, after the front door rule that begins `.write, .match, .build, .takeseat {`, add:

```css
.landing { max-width: 1240px; margin: 0 auto; padding: 20px 24px 80px;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--s5) var(--s6); align-items: start; }
.landing .mast { grid-column: 1 / -1; }
.door { display: grid; gap: var(--s2); align-content: start; }
.door h2 { font-size: clamp(26px, 3vw, 40px); text-transform: uppercase; }
.door .ask { font-size: clamp(20px, 2.4vw, 28px); }
.door .field { display: flex; flex-wrap: wrap; gap: var(--s2); }
.sq.r-tre, .sq.r-aut, .sq.r-che, .sq.r-loy, .sq.r-pop { color: var(--c); }
```

`.landing` carries its own width and padding, so it does not join the front door selector list. `.write` and `.write h1` in that list lose their element when `src/Write.tsx` goes in Step 3; leave the dead selectors for the stage review rather than editing a rule this task does not need.

- [ ] **Step 3: Route to it**

In `src/App.tsx`:

- Change the union to `type Screen = "landing" | "match" | "build" | "seat";` and the initial state to `useState<Screen>("landing")`.
- Replace the `Write` import with `import Landing from "./Landing";` and add `import type { Daily } from "./api";`.
- Add `const [daily, setDaily] = useState<Daily | null>(null);` and, in the boot effect, `api.daily().then(setDaily).catch(() => {});` before the saved-game load. A missing route leaves `daily` null and the landing still works.
- Add `const resumeId = store.get("usoj:game");` and a resume handler:

```tsx
  const resume = async () => { const id = store.get("usoj:game"); if (id) { setBusy(true); try { setGame(await api.load(id)); } catch (e) { fail(e); } finally { setBusy(false); } } };
  const playCode = async (code: string) => { await act(() => api.share(code)); };
```

- Replace the final `: <Write busy={busy} onSubmit={find} />` line with:

```tsx
        : <Landing daily={daily} resume={!!resumeId} busy={busy} onFind={find} onResume={resume} onCode={playCode} onPlayDaily={open} />}
```

- Replace every `setScreen("write")` with `setScreen("landing")`.

Then `git rm src/Write.tsx`.

- [ ] **Step 4: Add the constitution step to Build**

In `src/Build.tsx`, add `"constitution"` to `STEPS` between `"frame"` and `"assign"` (line 5), which makes it the sixth of fourteen, add `constitution: "Write the constitution"` to `PLAIN` (line 6), and add a case to `label` (line 15):

```ts
    case "constitution": return v ? "Write the constitution" : PLAIN.constitution;
```

Then surface the content note beside the masthead, so it is read before the Seat:

```tsx
            {state?.pack?.content_note ? <p className="note">{state.pack.content_note}</p> : null}
```

The step id must match the Workflow's own step string, which Stage A's build step named `constitution`, or the progress list silently sticks.

- [ ] **Step 5: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 6: Visual check**

Open `http://localhost:8799` with no saved game. The landing must show four blocks under one masthead: today's term, any polity with the prompt box, a friend's code, and no resume block. Start a game, reload the landing by leaving the seat, and the resume block must appear with the hot button. With no daily route the first block must read "Today's term is not up yet" and everything else must still work. Then build a scenario and watch the step list: fourteen steps with "Write the constitution" sixth, after "Draw the chamber", and the content note under the masthead.

- [ ] **Step 7: Commit**

```bash
git add src/Landing.tsx src/App.tsx src/Build.tsx src/styles.css
git commit -m "The landing offers today's term, any polity, resume and a friend's code"
```

---

### Task 17: The Seat, three pages with the oath on each

**Files:**
- Modify: `src/Seat.tsx`, `src/App.tsx:126-130`, `src/Panels.tsx`, `src/styles.css`, `src/rules.ts`, `src/rules.test.ts`
- Delete: `src/keys.ts`

**Interfaces:**
- Consumes: `pack.constitution.{ruler, holders, retention, ledgers, briefing}`, `pack.starts`, `pack.regions`, `pack.promises`, `Tiles`, `LEDGER_KEYS`.
- Produces: `barAt(pack, term)` and `difficulty(gap)` in `src/rules.ts`; `onSeat(faction, promises, seed, platform)` on the Seat's props.

`radioKeys` went with the faction picker. `src/Campaign.tsx` was its only other caller and Stage B deleted that file, so `src/keys.ts` is dead code the moment this task lands and goes with it.

- [ ] **Step 1: Write the failing test**

Append to `src/rules.test.ts`:

```ts
import { barAt, difficulty } from "./rules";

const pack = { constitution: { retention: { bar: { start: 0.5, step: 0.03, cap: 0.7 } } } } as never;

test("the bar climbs on the pack's printed schedule and stops at the cap", () => {
  expect(barAt(pack, 1)).toBeCloseTo(0.5, 5);
  expect(barAt(pack, 4)).toBeCloseTo(0.59, 5);
  expect(barAt(pack, 20)).toBeCloseTo(0.7, 5);
  expect(barAt({} as never, 3)).toBeCloseTo(0.56, 5);
});

test("the difficulty label comes from the seats you are short", () => {
  expect(difficulty(-4)).toBe("Comfortable");
  expect(difficulty(3)).toBe("Minority");
  expect(difficulty(9)).toBe("Minority, with a handicap");
  expect(difficulty(18)).toBe("Survival");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/rules.test.ts`
Expected: FAIL, `SyntaxError: Export named 'barAt' not found in module`.

- [ ] **Step 3: Add the two readers**

Append to `src/rules.ts`:

```ts
const BAR = { start: 0.5, step: 0.03, cap: 0.7 };

/** The pack's own printed schedule (spec §6), so the player sees the ratchet coming. */
export function barAt(pack: { constitution?: { retention?: { bar?: { start: number; step: number; cap: number } } } }, term: number) {
  const b = pack.constitution?.retention?.bar ?? BAR;
  return Math.min(b.cap, b.start + b.step * (term - 1));
}

/** Spec §6 minority starts: above 6 short prints a handicap, above 15 short is the survival path. */
export const difficulty = (gap: number) =>
  gap <= 0 ? "Comfortable" : gap > 15 ? "Survival" : gap > 6 ? "Minority, with a handicap" : "Minority";
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test src/rules.test.ts`
Expected: PASS, `14 pass`.

- [ ] **Step 5: Rewrite the Seat as three pages**

Replace `src/Seat.tsx` with:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { PackView } from "./api";
import { Chamber } from "./Hemicycle";
import Tiles, { shortNames, type TileDatum } from "./Tiles";
import { Ornament, applyTheme } from "./theme";
import { barAt, difficulty, LEDGER_KEYS } from "./rules";
import { sound } from "./sound";

const b36 = (n: number) => n.toString(36);
const PAGES = ["The situation", "The room", "You"] as const;

export default function Seat({ pack, busy, onSeat }: {
  pack: PackView; busy: boolean;
  onSeat: (faction: string, promises: number[], seed: number, platform: string) => Promise<boolean>;
}) {
  const [page, setPage] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [platform, setPlatform] = useState("");
  const [stamped, setStamped] = useState(false);
  const [seed] = useState(() => Math.floor(Math.random() * 36 ** 6));
  useEffect(() => { applyTheme(pack.theme); }, [pack.theme]);

  const c = pack.constitution;
  // The pack names the office holder's own party, so there is no picker (planning brief).
  const start = pack.starts.find((s) => s.faction === c?.ruler.faction) ?? pack.starts[0];
  const own = pack.members.filter((m) => m.faction === start.faction).length;
  const gap = pack.chamber.threshold - own;
  const v = pack.vocabulary;
  const full = picks.length === 3;
  const code = `J3-${pack.id.slice(0, 6)}-${b36(pack.factions.findIndex((f) => f.id === start.faction))}-${[0, 1, 2].map((i) => (picks[i] === undefined ? "_" : b36(picks[i]))).join("")}-${b36(seed).padStart(6, "0")}`;
  const toggle = (i: number) => setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < 3 ? [...p, i] : p));

  const shorts = useMemo(() => shortNames(pack.regions.map((r) => r.name)), [pack.regions]);
  const wsum = pack.regions.reduce((a, r) => a + r.weight, 0) || 1;
  const tiles: TileDatum[] = pack.regions.map((r, i) => ({
    id: r.id, name: r.name, short: shorts[i], weight: r.weight / wsum,
    p: (r.lean.find((l) => l.id === start.faction)?.value ?? 0.5),
  }));
  const weight = (id: string) => c?.retention.weights.find((w) => w.id === id)?.value ?? 0;

  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const take = () => {
    setStamped(true);
    sound.play("gavel");
    timer.current = setTimeout(() => onSeat(start.faction, picks, seed, platform.trim()).then((ok) => { if (!ok) setStamped(false); }), 650) as unknown as number;
  };

  return (
    <main className="takeseat press" onPointerDown={sound.unlock}>
      <div className="mast">
        <b>{pack.title}</b>
        <span className="flag"><Ornament kind={pack.theme.ornament} /></span>
        <span>{pack.era} · {pack.place}</span>
      </div>

      <section className="stage" aria-label={PAGES[page]}>
        <div className="kicker">{page + 1} of 3 · {PAGES[page]}</div>
        {page === 0 ? (<>
          <h2 className="head">{start.premise}</h2>
          <p>{c?.briefing.situation}</p>
          {pack.content_note ? <p className="note">{pack.content_note}</p> : null}
          <Tiles items={tiles} label="The regions by weight" foot={(d) => `${Math.round(d.p * 100)}`} />
        </>) : page === 1 ? (<>
          <p>{c?.briefing.room}</p>
          <div className="stagearea"><Chamber pack={pack} members={pack.members} own={start.faction} coalition={start.coalition} /></div>
          <ul className="causes" aria-label="Who can stop you">
            {(c?.holders ?? []).map((h) => (
              <li key={h.id}>
                <b className="num">{Math.round(h.stance * 100)}</b>
                <span>{h.name}, {h.where === "abroad" ? "abroad" : "at home"}, weight {weight(h.id).toFixed(2)}, line {h.line}, {h.response.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        </>) : (<>
          <p>{c?.briefing.you}</p>
          <ul className="causes" aria-label="The five ledgers here">
            {LEDGER_KEYS.map((k) => (
              <li key={k}><b className="num">{c?.ledgers?.[k]?.line ?? 0}</b><span>{c?.ledgers?.[k]?.name ?? k}, fails at that number</span></li>
            ))}
          </ul>
          <p className="small num">{c?.retention.name ?? pack.test.name} asks for {(barAt(pack, 1) * 100).toFixed(0)} of the room at the end of the term.</p>
          <p className="small">{difficulty(gap)}. You hold {own} of {pack.chamber.size}, and {pack.chamber.threshold} carries a vote.</p>
        </>)}
      </section>

      <aside className="rail" aria-label="Take the seat">
        <div className="field">
          <span className="kicker" id="l-promise">{v.promise} · {picks.length} of 3</span>
          <div className="chips" role="group" aria-labelledby="l-promise" style={{ justifyContent: "start" }}>
            {pack.promises.map((p, i) => (
              <button key={p.tag} className="opt" aria-pressed={picks.includes(i)}
                disabled={full && !picks.includes(i)} onClick={() => toggle(i)}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="kicker" htmlFor="platform">Your platform, one sentence. Optional.</label>
          <textarea id="platform" className="ask" rows={2} maxLength={240} value={platform} spellCheck={false}
            placeholder="What you are standing for, and by when." onChange={(e) => setPlatform(e.target.value)} />
        </div>
        <div className="field">
          <span className="kicker">Your code</span>
          <div className="code" aria-label="Game code">{code}</div>
          <span className="small muted">{full ? "Same code, same room, same luck." : "Pick 3 to finish the code."}</span>
        </div>
        <div className="row">
          <button className="btn ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Back</button>
          <button className="btn ghost" disabled={page === 2} onClick={() => setPage(page + 1)}>Next</button>
        </div>
        <button className={`btn ${busy ? "busy" : ""}`} disabled={!full || busy || stamped} onClick={take}>
          {busy ? `Taking the ${v.seat}` : `Take the ${v.seat}`}
        </button>
      </aside>
    </main>
  );
}
```

The oath button sits in the rail, which is on screen on all three pages, so R17's "oath button on every page" holds without repeating the control.

Then run `git rm src/keys.ts`: the faction picker was its last caller.

- [ ] **Step 6: Print the same label after the oath**

The Seat computes the gap from the pack because no game exists yet. Once the game does exist the number is the view's, so the Record tab reads it rather than recomputing it. In `src/Panels.tsx`, in `RecordTab`, above the rubric panel, add:

```tsx
      <div className="panel">
        <div className="kicker">Where you stand</div>
        <p className="small">{difficulty(game.shortfall)}. You are <span className="num">{game.shortfall}</span> short of
          {" "}{v.pass}{game.handicap ? <>, and the seat costs <span className="num">{game.handicap}</span> authority a {v.turn}</> : null}.</p>
      </div>
```

and `import { difficulty } from "./rules";` at the top. `game.shortfall` and `game.handicap` are Stage A's view fields (spec §6); the client never derives either one.

- [ ] **Step 7: Carry the platform through App**

In `src/App.tsx`, change `takeSeat`:

```tsx
  const takeSeat = async (faction: string, promises: number[], seed: number, platform: string) => {
    const ok = await act(() => api.seat(scenario!, faction, promises, seed, platform));
    if (ok) go("/", true);
    return ok;
  };
```

- [ ] **Step 8: Style the pager**

In `src/styles.css`, after the `.takeseat .rail .btn` rule, add:

```css
.takeseat .rail { gap: var(--s4); }
.takeseat .rail .row .btn { width: auto; flex: 1 1 0; }
.takeseat .stage .causes li b { min-width: 46px; }
.takeseat .ask { font-size: 17px; border-bottom-width: 1.5px; }
```

- [ ] **Step 9: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 10: Visual check**

Build a scenario and reach the Seat. Three pages must page back and forth: the situation with the premise, the briefing paragraph, the content note and the regions as weighted tiles; the room with the briefing paragraph, the floor and one line per holder carrying its mood, where it sits, its weight, its line and its response, home and abroad alike; and you with the briefing paragraph, one line per ledger with the number it fails at, the bar the first term asks for, and the difficulty label with the seats you are short. No faction picker anywhere. The promise chips, the platform box, the code and Take the seat must stay on screen on all three pages. Then take the seat and open the Record tab: the same difficulty label must print there, from the view rather than from the pack, and the handicap line must appear only on a start that carries one.

- [ ] **Step 11: Commit**

```bash
git add src/Seat.tsx src/App.tsx src/Panels.tsx src/styles.css src/rules.ts src/rules.test.ts src/keys.ts
git commit -m "The Seat is three briefing pages with the oath always in reach"
```

---

### Task 18: The oath beat

**Files:**
- Modify: `src/Seat.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `.wipe` and `.stamp` from `src/styles.css`, `sound.play("gavel")`, `sound.unlock`.
- Produces: the press wipe and the pack's stamp over the stage while the seat call runs.

- [ ] **Step 1: Add the wipe and the stamp**

In `src/Seat.tsx`, render the two over the stage while `stamped` is true:

```tsx
      {stamped ? <div className="wipe" aria-hidden="true" /> : null}
```

and inside the `.stage` element, as its last child:

```tsx
        <div className={`stamp ${stamped ? "hit" : ""}`} aria-hidden="true">{v.seat}</div>
```

Wrap the stage's contents in `<div className="stagearea">` so the stamp is positioned against the page it lands on, and add the live region:

```tsx
      <div className="sr" role="status" aria-live="polite">{stamped ? `Sworn in. ${pack.title}.` : ""}</div>
```

- [ ] **Step 2: Time the three beats**

The gavel plays at the press, the stamp lands over 520 ms on the existing `stamp` keyframe, the wipe runs 600 ms, and the seat call fires at 650 ms, which Task 17 already set. Confirm `sound.unlock` is on the root `onPointerDown`, since the first gavel is silent without a gesture.

- [ ] **Step 3: Style the stage area**

In `src/styles.css`, after the `.takeseat .ask` rule, add:

```css
.takeseat .stagearea { position: relative; overflow: clip; display: grid; gap: var(--s3); align-content: start; }
```

- [ ] **Step 4: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 5: Visual check**

Press Take the seat. In order: the gavel sounds, the pack's word for the seat stamps across the page in the accent, a sheet of paper crosses the window, and the Desk is behind it. Turn reduce motion on and repeat: the stamp and the wipe must crossfade instead of sweeping, the gavel must still sound, and the Desk must still arrive.

- [ ] **Step 6: Commit**

```bash
git add src/Seat.tsx src/styles.css
git commit -m "The oath is a gavel, a stamp and the press wipe"
```

---

### Task 19: The half-term, the pack's holder draw

**Files:**
- Modify: `src/Midterm.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `pack.constitution.halfTerm.{holder, name}`, `game.midterm`, `game.holders`, `TileReveal`, `api.midterm`.
- Produces: `src/Midterm.tsx` renders either the seat walk or the bloc walk, chosen by the half-term holder's members.

- [ ] **Step 1: Name the draw from the pack**

In `src/Midterm.tsx`, replace every `v.midterm` with the half-term's own name:

```tsx
  const half = pack.constitution?.halfTerm;
  const holder = game.holders.find((h) => h.id === half?.holder);
  const name = half?.name ?? v.midterm;
```

and use `name` in the `<nav aria-label>`, the two kickers and the `aria-live` line. The identifier `vocabulary.midterm` keeps its old meaning and is only the fallback.

- [ ] **Step 2: Walk the right thing**

The seat walk only makes sense when the drawn holder's members are seats. Add the branch above the return:

```tsx
  const regions = useMemo(() => new Map(pack.regions.map((r) => [r.id, r.name])), [pack.regions]);
  const regionWalk = game.midterm?.regions ?? [];
```

`game.midterm.regions` is the region draw a non-chamber holder produces, listed under "## Required from Stage D" at the end of this plan. When it is absent the array is empty and the seat walk runs exactly as it does today.

When `regionWalk.length` is non-zero the stage renders the tiles instead of the floor:

```tsx
        {regionWalk.length ? (
          <TileReveal regions={regionWalk} names={regions} label={name} ms={40000}
            onProgress={(i) => setShown(i)} onDone={() => setDone(true)} />
        ) : (
          <ChamberFloor pack={pack} members={members} own={game.faction} coalition={game.coalition}
            whip={done ? NO_WHIP : undefined} votes={result && !done ? votes : undefined} hot={hot} />
        )}
```

Import `TileReveal` from `./Tiles` and `useMemo` if it is not already imported. Leave the seat path, its rAF clock and its `held`, `declared`, `swapped` and `bySeat` memos exactly as they are: the branch only keeps the seat arithmetic off a draw that has no seats.

- [ ] **Step 3: Re-base the wipeout on the holder's own share**

In the rail's verdict, replace the wipeout sentence with:

```tsx
            {result.wipeout ? <p className="lede fail">{holder?.name ?? name} turned against its own side. The rest of the term is borrowed time.</p> : null}
```

`lostOwn` is the engine's own share test, so the client only prints its verdict.

- [ ] **Step 4: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 5: Visual check**

Play to turn 10 on a pack whose half-term holder is the chamber: the class must still walk seat by seat under the pack's own name for the draw, not the word midterm. Then load a pack whose half-term holder is the street or a court and confirm the stage walks that holder's regions as tiles on the same 40 s clock, with the same skip control on a replay.

- [ ] **Step 6: Commit**

```bash
git add src/Midterm.tsx src/styles.css
git commit -m "The half-term walks whichever holder the pack draws"
```

---

### Task 20: The campaign stage view

**Files:**
- Modify: `src/Desk.tsx`, `src/styles.css`, `src/rules.ts`, `src/rules.test.ts`

**Interfaces:**
- Consumes: `game.holders`, `game.bar`, `game.discount` (Stage B: `1`, or `1 - CAMPAIGN_DISCOUNT` on the campaign's turns), `game.rival` (Stage B's `RivalMove`: `{ turn, name, backer, region, line }`).
- Produces: `mandateOf(holders)` in `src/rules.ts`, and the campaign panel inside the Desk's floor column.

Stage B already deleted `src/Campaign.tsx`, the two campaign routes, `stage: "campaign"` and the App branch, and put C4's discount on the last turns of the ordinary session. This task only writes the §14 readout, on the stage the Desk already owns. Nothing is deleted here.

No turn number crosses into the client. The panel opens when `game.discount < 1` and prints the discount out of that same field, so retuning `CAMPAIGN_FROM` or `CAMPAIGN_DISCOUNT` in `worker/acts.ts` moves the screen with it and nothing in `src/rules.ts` has to follow.

- [ ] **Step 1: Write the failing test**

Append to `src/rules.test.ts`:

```ts
import { mandateOf } from "./rules";

test("the mandate is the weighted sum over the counted holders only", () => {
  const holders = [
    { id: "senate", weight: 0.3, stance: 0.6 },
    { id: "plebs", weight: 0.5, stance: 0.4 },
    { id: "patricians", weight: 0.2, stance: 0.8 },
    { id: "legions", weight: 0, stance: 0.1 },
  ];
  expect(mandateOf(holders)).toBeCloseTo(0.54, 5);
  expect(mandateOf([])).toBe(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/rules.test.ts`
Expected: FAIL, `SyntaxError: Export named 'mandateOf' not found in module`.

- [ ] **Step 3: Add the sum**

Append to `src/rules.ts`:

```ts
/** Spec §6: the same weighted sum the test runs, printed live so the arithmetic is never a surprise. */
export const mandateOf = (holders: { weight: number; stance: number }[]) =>
  holders.reduce((a, h) => a + h.weight * h.stance, 0);
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test src/rules.test.ts`
Expected: PASS, `15 pass`.

- [ ] **Step 5: Put the readout on the stage**

In `src/Desk.tsx`, add to the floor column, above `<Holders/>`:

```tsx
          {campaigning ? (
            <div className="campaignview panel">
              <div className="kicker">{v.campaign} · acts aimed at the counted holders cost <span className="num">{Math.round((1 - game.discount) * 100)}</span> per cent less</div>
              <div className="count">
                <Num value={mandate * 100} decimals={1} className={`n ${mandate < game.bar ? "fail" : ""}`} />
                <span className="muted num">of {(game.bar * 100).toFixed(0)} needed</span>
              </div>
              <div className="whipbar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mandate * 100)} aria-label={v.test}>
                <div className={`fill ${mandate < game.bar ? "fail" : ""}`} style={{ width: `${Math.min(100, mandate * 100)}%` }} />
                <div className="tick" style={{ left: `${game.bar * 100}%` }}><span className="num">{(game.bar * 100).toFixed(0)}</span></div>
              </div>
              <ul className="causes" aria-label="The arithmetic, holder by holder">
                {counted.map((h) => (
                  <li key={h.id}>
                    <b className="num">{(h.weight * h.stance * 100).toFixed(1)}</b>
                    <span>{h.name}, {h.weight.toFixed(2)} of the room at {Math.round(h.stance * 100)}, moved by {h.levers.map((l) => game.instruments[l]?.name ?? l).join(", ")}</span>
                  </li>
                ))}
              </ul>
              {game.rival ? (
                <p className="small">{game.rival.line} {game.rival.region ? `In ${game.pack.regions.find((r) => r.id === game.rival!.region)?.name ?? game.rival.region}.` : ""}</p>
              ) : null}
            </div>
          ) : null}
```

Add beside the other derived state:

```tsx
  // the worker owns the schedule: a discount on the wire is what opens this panel
  const campaigning = game.discount < 1;
  const counted = game.holders.filter((h) => h.weight > 0);
  const mandate = mandateOf(counted);
```

Import `mandateOf` and `Num`.

- [ ] **Step 6: Confirm the old screen is already gone**

Run: `ls src/Campaign.tsx; grep -n "campaign" src/App.tsx src/api.ts`
Expected: `No such file or directory`, and no hit in either file. Stage B removed all of it. If a hit remains, delete it here: the `Campaign` import and the `game.stage === "campaign"` branch in `src/App.tsx`, and the `drafts` and `campaign` entries in `src/api.ts`. `scripts/term.ts` is Stage B's and is not edited by this stage.

- [ ] **Step 7: Style it**

In `src/styles.css`, after the `.plateh` rules, add:

```css
.campaignview { flex: none; display: grid; gap: var(--s2); }
.campaignview .count .n { font: 800 clamp(40px, 5vw, 64px)/0.9 var(--display); }
.campaignview .causes { max-height: 22vh; overflow: auto; }
```

- [ ] **Step 8: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build; ! grep -q scandal_season dist/client/assets/*.js && echo clean`
Expected: `0 fail`, `tsc` silent, vite prints `built in`, the grep line prints `clean`.

- [ ] **Step 9: Visual check**

Play until the view sends a discount under 1. The floor column must gain a panel above the holder plates: the live mandate as a large tabular number against the bar it must clear, a bar with the bar's own tick, one line per counted holder showing its own contribution, its weight, its stance and the instruments that move it, and the rival's last move in one sentence. The discount sentence must print the pack's own word for the campaign and the number the view sent, and a price tag on the same turn must say a quarter off. Confirm the Desk is still the screen: there is no separate campaign page, and the last turn goes straight to the test.

- [ ] **Step 10: Commit**

```bash
git add src/Desk.tsx src/styles.css src/rules.ts src/rules.test.ts
git commit -m "The campaign is the Desk with the test arithmetic on the stage"
```

---

### Task 21: The test, walked by holder

**Files:**
- Modify: `src/Test.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `game.test` (Stage A `TestResult`: `mandate bar won holders early? regions seats`), `TileReveal`, `ChamberFloor`, `api.test`.
- Produces: `src/Test.tsx` renders the reveal in pack order against the bar, and `pack.chamber.alpha` leaves the client.

- [ ] **Step 1: Replace the arithmetic**

In `src/Test.tsx`, delete the `walk` memo, the `base` and `tilesDone` gate, the `share` state, the `sShown`, `votes` and `yes` derivations, the `a`, `pub`, `loy` and `pct` block (lines 85 to 91), both hard-coded `50`s (the `% of the mandate · 50% wins` caption on line 109 and the `left: "50%"` tick with its `<span className="num">50</span>` on line 113) and the `v` alias, which loses its last two readers with the rail. Replace them with the holder walk:

```tsx
  const rows = test?.holders ?? [];
  const n = rows.length;
  // 40 s over the whole room, and no faster than one holder can be read
  const beat = n ? Math.min(2400, Math.max(700, 40000 / n)) : 0;
  const REGION_MS = 14000;   // TUNE, the country's own clock inside the walk
  const mandate = rows.slice(0, shown).reduce((a, r) => a + r.weight * r.stance, 0);
```

`mandateOf` is not used here, because the reveal sums only the holders that have landed.

`test.mandate`, `test.bar` and every holder weight arrive unrounded (Stage A's fix round, item 3). This screen is the one that rounds them, and only for display: `toFixed(1)` on a percentage, `Math.round` on a stance. Nothing here re-clamps or writes a rounded number back.

Replace the rAF effect's body with the same clock over `n` holders:

```tsx
  useEffect(() => {
    if (!n || done) return;
    if (reduced) { const t = setTimeout(() => { setShown(n); setDone(true); }, 2000); return () => clearTimeout(t); }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(n, Math.floor((now - t0) / beat) + 1);
      setShown(k);
      if (k < n) raf = requestAnimationFrame(tick); else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, beat, reduced, done]); // eslint-disable-line
```

- [ ] **Step 2: Print the mandate against the bar**

Replace the `.count` and `.whipbar` block on the stage with:

```tsx
        <div className={`count ${done ? "bounce" : ""}`}>
          <Num key={`m${done}`} value={mandate * 100} decimals={1} instant={done} className={`n ${done && !test.won ? "fail" : ""}`} />
          <span className="muted num">of {(test.bar * 100).toFixed(0)} needed{test.early ? ", called early" : ""}</span>
        </div>
        <div className="whipbar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mandate * 100)} aria-label={pack.test.name}>
          <div className={`fill ${done && !test.won ? "fail" : ""}`} style={{ width: `${Math.min(100, mandate * 100)}%` }} />
          <div className="tick" style={{ left: `${test.bar * 100}%` }}><span className="num">{(test.bar * 100).toFixed(0)}</span></div>
        </div>
```

- [ ] **Step 3: Walk the two grains under it**

Keep the citizens by region and the chamber by seat, both on the stage under the bar:

```tsx
        {test.regions.length ? (
          <TileReveal regions={test.regions} names={names} skip={skipped} label="The country, region by region" ms={REGION_MS}
            onProgress={() => {}} onDone={() => {}} />
        ) : null}
        {test.seats.length && done ? (
          <ChamberFloor pack={pack} members={game.members} own={game.faction} coalition={game.coalition}
            votes={Object.fromEntries(test.seats.map((s) => [s.id, s.yes]))} />
        ) : null}
```

- [ ] **Step 4: List the holders as they land**

Replace the whole rail with one list in pack order:

```tsx
      <aside className="rail" aria-label={pack.test.name}>
        <ul className="causes" aria-label="The room, holder by holder">
          {rows.map((r, i) => (
            <li key={r.id} className={i < shown ? "rise" : "wait"}>
              <b className="num">{i < shown ? (r.weight * r.stance * 100).toFixed(1) : "—"}</b>
              <span>{r.name}, {r.counted ? `${r.weight.toFixed(2)} of the room` : "not counted"}{i < shown ? `, at ${Math.round(r.stance * 100)}` : ""}</span>
            </li>
          ))}
        </ul>
      </aside>
```

This replaces the two `.panel` meters the alpha reveal used. Keep `names`, the skip control, the replay key and the verdict block; the verdict still prints `pack.test.win` or `pack.test.lose`, which Stage A left untouched.

- [ ] **Step 5: Style the waiting rows**

In `src/styles.css`, after the `.causes li b` rule Task 13 added, add:

```css
.causes li.wait { color: var(--ink-2); }
.causes li.wait b { color: var(--tone); }
```

- [ ] **Step 6: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 7: Visual check**

Play a term to its end. The numeral must count the mandate, not a percentage of fifty, and the tick on the bar must sit at the printed bar for that term, never at 50. The rail must list every holder in pack order with an em dash until it lands and then its own weighted contribution, and an uncounted holder must say so rather than show a weight. The country must reveal region by region and the floor must declare by seat. When a holder called the test early, the line under the numeral must say so.

- [ ] **Step 8: Commit**

```bash
git add src/Test.tsx src/styles.css
git commit -m "The test walks the room holder by holder against the printed bar"
```

---

### Task 22: Won, another term or stop here

**Files:**
- Modify: `src/Won.tsx`

**Interfaces:**
- Consumes: `game.terms.at(-1)`, `game.bar`, `pack.escalations`, `barAt` from `src/rules.ts`, `api.continue`, `api.stop`.
- Produces: `src/Won.tsx` prints the next term's bar and its two conditions beside the two choices.

- [ ] **Step 1: Print what another term costs**

In `src/Won.tsx`, replace the score block and the escalation block with:

```tsx
      {t ? (
        <div className="ledger" style={{ "--i": 3 } as any}>
          <div><div className="k">Score, term {t.term}</div><div className="v"><Num value={t.points} /></div></div>
          <div><div className="k">{pack.constitution?.retention.name ?? pack.test.name}</div><div className="v"><Num value={Math.round(t.mandate * 100)} /> of <span className="num">{Math.round(game.bar * 100)}</span></div></div>
          <div><div className="k">{v.pass}</div><div className="v"><Num value={t.passed} /></div></div>
        </div>
      ) : null}

      <div className="panel escal" style={{ "--i": 4 } as any}>
        <div className="kicker">Another term asks for {Math.round(barAt(pack, game.term + 1) * 100)} of the room</div>
        {next.length ? next.map((e) => (
          <div key={e!.key}><h3>{e!.name}</h3><p className="muted small">{e!.headline}</p></div>
        )) : <p className="muted small">Nothing new is dealt for it.</p>}
      </div>
```

Add `import { barAt } from "./rules";` and change the escalation slice to the next term's pair:

```tsx
  const i = 2 * game.term;
  const next = [pack.escalations[i], pack.escalations[i + 1]].filter((e) => !!e);
```

- [ ] **Step 2: Say what stopping here does**

Replace the row of two buttons with:

```tsx
      <div className="row" style={{ "--i": 5 } as any}>
        <button className={`btn ${busy ? "busy" : ""}`} disabled={busy} onClick={() => act(() => api.continue(game))}>Another term</button>
        <button className="btn ghost" disabled={busy} onClick={() => act(() => api.stop(game))}>Stop here</button>
        <span className="small muted">Another term carries every act in force, every appointment and every grudge. Stopping here banks the score and writes the last page.</span>
      </div>
```

- [ ] **Step 3: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 4: Visual check**

Win a term. The page must print the term's score, the mandate against the bar it cleared, and a panel whose heading names the higher bar the next term asks for, with that term's two escalations under it. The two choices must sit side by side with one sentence saying what each one does. Press Stop here and the Over page must arrive with an epilogue rather than an empty ending.

- [ ] **Step 5: Commit**

```bash
git add src/Won.tsx
git commit -m "Won prints the next bar and what another term carries"
```

---

### Task 23: Over, the obituary, the style line and the two turns

**Files:**
- Modify: `src/Over.tsx`, `src/api.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `game.result` (`ending`, `score`, and Stage D's `line`, `decisive` and `grid`), `game.ending`, `game.terms`, `game.code`, `api.share`. Every one of the three is optional on the type and guarded at its use, so this screen renders before Stage D lands them.
- Produces: `src/Over.tsx` prints the style line, the two decisive turns and the per-turn grid, each only when the view carries it.

- [ ] **Step 1: Type what the view may carry**

In `src/api.ts`, after the `Daily` type, add:

```ts
/** R22: both are engine facts. The client prints them and never derives them. */
export type RunStyle = { line: string; decisive: { turn: number; line: string }[] };
```

and widen the result on `GameView`:

```ts
  result?: NonNullable<Game["result"]> & Partial<RunStyle> & { grid?: { ledger: string; won?: boolean }[] };
```

- [ ] **Step 2: Print the three new blocks**

In `src/Over.tsx`, after the `.ledger` block, which carries `"--i": 4`, add:

```tsx
      {r?.line ? (
        <div className="panel escal" style={{ "--i": 5 } as any}>
          <div className="kicker">How you ruled</div>
          <p className="lede">{r.line}</p>
        </div>
      ) : null}

      {r?.decisive?.length ? (
        <div className="panel escal" style={{ "--i": 6 } as any}>
          <div className="kicker">The two {v.turn}s that decided it</div>
          <ul className="causes">
            {r.decisive.map((d) => <li key={d.turn}><b className="num">{d.turn}</b><span>{d.line}</span></li>)}
          </ul>
        </div>
      ) : null}
```

`--i` is the stagger index `.stagger > *` reads, so the two blocks take 5 and 6 and the two blocks below them move up by two: the share panel becomes `"--i": 7` and the last row `"--i": 8`.

- [ ] **Step 3: Replace the share card**

Replace the `.sharecard` block that prints one square per bill with one square per turn in the hue of the ledger that moved most, and the test as the last row:

```tsx
      <div className="panel share" style={{ "--i": 7 } as any}>
        <div className="kicker">The record, term {game.terms.at(-1)?.term ?? game.term}</div>
        {r?.grid?.length ? (
          <div className="sharecard" aria-label="One square per turn">
            {r.grid.map((s, i) => (
              <div key={i}><span className={`sq on ${hueClass(s.ledger as LedgerKey)}`} /><span className="num">{i + 1}</span></div>
            ))}
            <div className="testrow"><span className={`sq ${r.ending === "reelected" ? "on" : ""}`} /><span>{pack.test.name}</span></div>
          </div>
        ) : null}
        <div className="code" aria-label="Share code">{game.code}</div>
        <button className="btn ghost" onClick={() => { copyText(game.code); setCopied(true); }}>{copied ? "Copied" : "Copy the code"}</button>
      </div>
```

Add `import { hueClass, type LedgerKey } from "./rules";`, delete the `style={{ color: own?.color ?? "var(--ink)" }}` the old squares carried, and delete the now unused `own` lookup above it.

- [ ] **Step 4: Relabel the replay**

Change the replay button's label to say what it is:

```tsx
        <button className={`btn ${busy ? "busy" : ""}`} disabled={busy} onClick={() => act(() => api.share(game.code))}>Replay the seed as practice</button>
```

- [ ] **Step 5: Style the last row**

In `src/styles.css`, after the `.sq.on` rule, add:

```css
.sharecard .testrow { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--s2);
  border-top: 1px solid var(--tone); padding-top: 6px; font-size: 12px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase; }
```

- [ ] **Step 6: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build`
Expected: `0 fail`, `tsc` silent, vite prints `built in`.

- [ ] **Step 7: Visual check**

Lose a run. The obituary must print from the record as it does today, then a panel naming how the run was ruled in one sentence, then a panel with the two turns that decided it and why. The grid must be one square per turn in the hue of the ledger that moved most, with the test as a final row, filled when the run was kept. On a save whose result carries none of the three, those panels must simply not appear and the page must still read as a front page.

- [ ] **Step 8: Commit**

```bash
git add src/Over.tsx src/api.ts src/styles.css
git commit -m "Over names the style, the two turns and the grid"
```

---

### Task 24: The phone at 390 px, and reduced motion

**Files:**
- Modify: `src/styles.css`, `src/Desk.tsx`

**Interfaces:**
- Consumes: every class the eight zone tasks added.
- Produces: the 900 px query rewritten for the Desk, and the reduced-motion block extended.

The phone layout is a redesign and not a squeeze (research §1 row 12): the strip and the wire stay, the composer becomes a bottom sheet, the rail tabs move to the thumb zone.

- [ ] **Step 1: Rewrite the narrow query**

In `src/styles.css`, inside the existing `@media (max-width: 900px)` block, the one whose first rule is `.chamber, .build, .takeseat { grid-template-columns: 1fr; ... }`, add:

```css
  body:has(.desk) { height: auto; overflow: auto; }
  .desk { height: auto; display: block; padding: 0 15px calc(var(--wire) + 56px); }
  .strip { grid-template-columns: repeat(5, 1fr); }
  .led { padding: 8px 4px 10px; border-right: 1px solid var(--tone); min-width: 0; }
  .led:last-child { border-right: 0; }
  .led .v { font-size: 26px; }
  .led .ledk .kicker { font-size: 9px; letter-spacing: 0.04em; }
  .led .d, .led .room { display: none; }
  /* the cell is the tap target for its peek, which buys a large Fitts target for free (research §5) */
  .peek { position: static; grid-template-columns: 1fr; gap: var(--s3); border: 2px solid var(--c); margin-bottom: var(--s3); }
  .main { grid-template-columns: 1fr; gap: var(--s4); padding-top: var(--s4); }
  .floorcol { order: 1; } .railcol { order: 2; } .deskcol { order: 3; }
  .floorbox { min-height: 210px; }
  .tabbar { position: fixed; left: 0; right: 0; bottom: var(--wire); z-index: var(--z-sticky);
    background: var(--bg); border-top: 2px solid var(--ink); border-bottom: 0; }
  .tabbar button { min-height: 52px; font-size: 9px; padding: 0 2px; }
  .tabbar button[aria-selected="true"] { box-shadow: inset 0 3px 0 var(--ink); }
  .railbody { overflow: visible; }
  /* the desk is a sheet the thumb opens, with the price tag above the keyboard */
  .deskcol { position: fixed; left: 0; right: 0; bottom: calc(var(--wire) + 52px); z-index: var(--z-sticky);
    background: var(--bg); border-top: 2px solid var(--ink); padding: var(--s2) 15px var(--s3);
    max-height: 72dvh; overflow: auto; transform: translateY(100%); transition: transform var(--t-state) var(--ease-out); }
  .deskcol[data-open="true"] { transform: none; }
  .deskopen { display: inline-flex; position: fixed; right: 15px; bottom: calc(var(--wire) + 62px); z-index: var(--z-sticky); }
  .verbs button { font-size: 10px; }
  .campaignview .causes { max-height: none; }
```

- [ ] **Step 2: Add the sheet handle**

In `src/Desk.tsx`, add `const [sheet, setSheet] = useState(false);`, put `data-open={sheet}` on the desk column, and render the handle as the last child of the main element:

```tsx
      <button className="btn deskopen" aria-expanded={sheet} onClick={() => setSheet(!sheet)}>
        {sheet ? "Close the desk" : "Write an act"}
      </button>
```

On a wide window the handle is hidden, so add to the base stylesheet, after the `.tabled .actions` rule:

```css
.deskopen { display: none; }
```

- [ ] **Step 3: Finish the reduced-motion block**

In `src/styles.css`, inside the `@media (prefers-reduced-motion: reduce)` block, add one rule:

```css
  .deskcol { transition: none !important; }
```

That block's first rule already sets `animation-duration: 0.01ms !important` and `transition-duration: 0.01ms !important` on `*`, which covers the ticker, the strip tracks, the resistance bars and the whip bar. Only the sheet needs its own line, because a transform of 100% at any duration still reads as a slide. Add nothing else: a rule that repeats the universal one is a rule someone has to read at three in the morning.

- [ ] **Step 4: Run everything**

Run: `bun test worker src && bunx tsc -b --force && bun run build; ! grep -q scandal_season dist/client/assets/*.js && echo clean`
Expected: `0 fail`, `tsc` silent, vite prints `built in`, the grep line prints `clean`.

- [ ] **Step 5: Visual check**

Set the window to 390 px wide. The strip must be five cells across with the label above and the number below, each cell at least 44 px tall and its own tap target for the peek, which now sits in the flow rather than as an overlay. The floor must come first, the rail second, and the desk must be a sheet that the Write an act button raises, with the price tag above the keyboard when the box has focus. The five rail tabs must be fixed just above the wire in the thumb zone at 52 px, and the wire must be the last line on screen. No horizontal scrolling anywhere. Then turn reduce motion on: the wire must be still, every bar must jump to its value, and the sheet must appear without sliding.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/Desk.tsx
git commit -m "The Desk on a phone, and every motion path honours the setting"
```

---

## Self-review

**1. Spec coverage for Stage C (§12 row C, §9, §14).**

| Requirement | Task |
|---|---|
| The Desk, one page, 100dvh, no scrolling | 4 |
| Strip: value, delta, failure line tick, fixed hue and icon | 3, 5 |
| Stage: the floor, home and abroad holder rows, resistance and line, the nearest marked | 8 |
| Desk zone: seven verb tabs greyed when unaffordable, the box, the price tag, Commit, End turn | 9, 10 |
| A tabled law keeps its count, its amendments and its vote | 11 |
| Rail: Feed, Country, Room, Record, Pinned, with the blocs under their holder | 12, 13 |
| Wire: one line per move with its cause, hue-coded, clickable to peek | 7 |
| Era palette on paper, rules and motif; five FIXED hues outside `applyTheme` | 3, 4 |
| Glance, peek, keep; the unread as a mark on a tab; peeks are never dialogs | 5, 6, 12 |
| Landing (§14): daily card, any polity, resume, a friend's code, the result grid | 16 |
| Build gains the constitution step and the content note | 16 |
| Seat (R17): three pages, back and forth, oath on every page, the platform sentence | 17 |
| Oath: the press wipe, the pack's stamp, the gavel | 18 |
| Cards: warning with Hold, crisis, foreign move without Hold, black swan, escalation | 14 |
| Half-term: the pack's holder draw, wipeout re-based on its own side | 19 |
| Campaign: live test arithmetic per holder with its lever, the band, the rival's move | 20 |
| Test: the mandate by holder in pack order against the printed bar | 21 |
| Won: another term with its bar and two conditions, or stop here | 22 |
| Over (R22): epilogue, style line, the two decisive turns, the grid, replay as practice | 23 |
| Drop `motion`: one `src/motion.ts` with `useReduced` and a rAF tween | 1 |
| Phone at 390 px per research §5 | 24 |
| Reduced motion, keyboard, aria, 44 px, roving tabindex | 15, 24 |
| Three Tour marks | 15 |
| The client contract follows Stage B's routes, and the v3 ledgers leave the view | 2 |

Deliberately not in Stage C: the daily cron and archive, the share grid's own generation, the style bots, the measurement log and the balance pass, which are Stage D. The seven instruments' pricing, the plausibility gate, the Director's draws, the campaign discount and the three authoritarian templates are Stage B; Stage C only renders what they produce.

**2. Placeholder scan.** No `TBD`, no "similar to Task N", no "add error handling". Two forward references are named and closed inside the task that makes them: Task 6's `onPin` is a no-op until Task 12 gives it the Pinned panel, and Task 8's holder `onPick` selects a holder until Task 13 gives it the Room panel. Task 4's inline comments name the blocks that move across by their content, and the step tells the implementer to read `src/Chamber.tsx` in full first.

**3. Nothing is orphaned between two commits.** Task 4 drops the old writing box, and Task 9 puts the composer in the same column five tasks later, which is the one gap in the set: between them a law cannot be tabled, and the visual checks say so. Every other control keeps a screen at every commit. Task 11 moves the whip, the amendments, Adopt and Call the vote out of the two-tab rail one task before Task 12 replaces that rail, so the four routes Stage B keeps are never unreachable. Task 2 deletes the three compatibility ledgers and fixes all three readers in the same task, so `tsc` is silent at its own gate.

**4. Type consistency.** `LedgerKey` is the client's ledger id type everywhere and never shadows Stage A's `LedgerV4`; the constant beside it is `LEDGER_KEYS`, because the Global Constraints keep `LEDGERS` for the worker. `VerbKey` in `src/rules.ts` is a local mirror of Stage A's `Verb` so `src/rules.ts` stays free of worker imports; `src/Compose.tsx` and `src/api.ts` use Stage A's `Verb`, and the two unions have the same seven members in the same order. No worker number is mirrored in the client at all: the campaign reads `game.discount` and the bar reads the pack's own schedule. The component in `src/PriceTag.tsx` is `Tag`, never `PriceTag`, because `PriceTag` is Stage B's type name and both are imported into `src/Desk.tsx`. The Record tab component is exported as `RecordTab`, never `Record`, so it cannot be confused with the `Record<K, V>` type `src/Desk.tsx` uses for its seen map. `PinItem` is defined once in `src/Peek.tsx` and imported by `src/Rail.tsx` and `src/Panels.tsx`. `Tab` and `TABS` live once in `src/Rail.tsx`, and `unreadTabs` returns exactly the members of `TABS`. Every local wire type in `src/rules.ts` declares `ledger` optional, which is what Stage A's `WireLine` sends. `Card`'s props lost `blocs` and gained `kind` and `holders` in Task 14, and its one call site is `src/Desk.tsx`. `Seat`'s `onSeat` gained a fourth `platform` argument in Task 17 and its one call site is `App.takeSeat`, which `api.seat` matches.

---

## Interfaces produced

Everything below is Stage C's contract. Stage D uses these names exactly and never redefines them.

### `src/rules.ts` (every pure client rule, tested in `src/rules.test.ts`)

```ts
export const LEDGER_KEYS: readonly ["treasury", "authority", "chest", "loyalty", "popularity"];
export type LedgerKey = (typeof LEDGER_KEYS)[number];
export const VERBS: readonly ["decree", "law", "appoint", "spend", "proclaim", "favour", "force"];
export type VerbKey = (typeof VERBS)[number];

export function hueClass(k: LedgerKey): string;            // "r-tre" | "r-aut" | "r-che" | "r-loy" | "r-pop"
export function roomTo(value: number, line: number): number;
export function danger(value: number, line: number): boolean;
export function ledgerValue(game: GameView, k: LedgerKey): number;
export function ledgerDelta(game: GameView, k: LedgerKey): number;
// `names` holds regions and holders: a resistance line's id is a holder's and it carries no ledger
export function wireLabel(l: WireLine, names: Map<string, string>): string;
export function wireHue(l: WireLine): string;              // "r-danger" for resistance, card and any line with no ledger
export function settleVerb(text: string, instruments: Partial<Record<VerbKey, unknown>>): VerbKey | null;
export function unreadTabs(game: GameView, seen: Record<string, number>): string[];
export function barAt(pack: PackView, term: number): number;
export function difficulty(gap: number): string;           // "Comfortable" | "Minority" | "Minority, with a handicap" | "Survival"
export function mandateOf(holders: { weight: number; stance: number }[]): number;
```

No worker constant is mirrored here. `CAMPAIGN_FROM` stays in `worker/acts.ts` alone: the campaign panel opens on `game.discount < 1`.

### `src/motion.ts`

```ts
export function useReduced(): boolean;                     // false synchronously on the first render
export function ease(t: number): number;                   // cubic-bezier(0.22, 1, 0.36, 1)
export function tween(from: number, to: number, ms: number, onUpdate: (v: number) => void, onDone?: () => void): () => void;
```

### `src/icons.tsx`

```tsx
export type IconName = "treasury" | "authority" | "chest" | "loyalty" | "popularity"
  | "act" | "post" | "hand" | "vote" | "crisis" | "region" | "seat" | "pin" | "wire" | "abroad";
export function Icon({ name, sm }: { name: IconName; sm?: boolean }): JSX.Element;
```

### Components

```tsx
// src/Desk.tsx: the play screen, replaces Chamber.tsx
export default function Desk(props: { game: GameView; act: Act; busy: boolean; onQuit: () => void; onRolled: () => void }): JSX.Element;

// src/Strip.tsx
export default function Strip(props: { game: GameView; open: LedgerKey | null; onOpen: (k: LedgerKey | null) => void }): JSX.Element;

// src/Peek.tsx
export type PinItem = { key: string; title: string; hue: string; lines: [string, string][] };
export default function Peek(props: { game: GameView; of: LedgerKey; cause?: string; onClose: () => void; onPin: (item: PinItem) => void }): JSX.Element;

// src/Wire.tsx
export default function Wire(props: { game: GameView; onPick: (k: LedgerKey, cause: string) => void }): JSX.Element;

// src/Holders.tsx
export function HolderPlate(props: { h: GameView["holders"][number]; warned: boolean; onPick: (id: string) => void }): JSX.Element;
export default function Holders(props: { holders: GameView["holders"]; warnings: GameView["warnings"]; onPick: (id: string) => void }): JSX.Element;

// src/Compose.tsx
export default function Compose(props: { game: GameView; act: Act; busy: boolean; verb: VerbKey | null; onVerb: (v: VerbKey) => void; text: string; onText: (s: string) => void }): JSX.Element;

// src/PriceTag.tsx: the component is `Tag`, and `PriceTag` is Stage B's type name
export default function Tag(props: { game: GameView; act: Act; busy: boolean; onDone: () => void }): JSX.Element | null;

// src/Rail.tsx
export const TABS: readonly ["feed", "country", "room", "record", "pinned"];
export type Tab = (typeof TABS)[number];
export default function Rail(props: { label: Record<Tab, string>; tab: Tab; onTab: (t: Tab) => void; unread: string[]; pins: PinItem[]; onUnpin: (key: string) => void; children: ReactNode }): JSX.Element;

// src/Panels.tsx
export function Country(props: { game: GameView }): JSX.Element;
export function Room(props: { game: GameView; selected: string | null; onPick: (id: string) => void; onPin: (item: PinItem) => void }): JSX.Element;
export function RecordTab(props: { game: GameView }): JSX.Element;

// src/Landing.tsx
export default function Landing(props: { daily: Daily | null; resume: boolean; busy: boolean; onFind: (prompt: string) => void; onResume: () => void; onCode: (code: string) => void; onPlayDaily: (id: string) => void }): JSX.Element;

// src/Card.tsx
export type CardKind = "crisis" | "foreign" | "swan" | "warning" | "escalation";
export default function Card(props: { pack: GamePack; event: ViewEvent; kind: CardKind; holders: { id: string; name: string; stance: number }[]; turn: number; busy: boolean; onStance: (i: number) => void; onClose: () => void }): JSX.Element;
export function WarningCard(props: { pack: GamePack; holder: { name: string; line: number }; warning: { response: string; fires: number; number: number }; busy: boolean; onHold: () => void; onClose: () => void }): JSX.Element;
export function Announce(props: { pack: GamePack; keys: string[]; onClose: () => void }): JSX.Element | null;
export function useSheet(onClose: () => void, block?: boolean): { ref: RefObject<HTMLDialogElement>; dismiss: () => void };

// src/Seat.tsx
export default function Seat(props: { pack: PackView; busy: boolean; onSeat: (faction: string, promises: number[], seed: number, platform: string) => Promise<boolean> }): JSX.Element;
```

Kept unchanged and still exported: `src/Hemicycle.tsx` (`Chamber`, `RollHandle`, `orderMembers`, `Seated`), `src/Tiles.tsx` (`Tiles`, `TileReveal`, `squarify`, `floorWeights`, `shortNames`), `src/Ledger.tsx` (`Num`, `Meter`, `national`; the default `Ledger` is deleted in Task 2), `src/Drawer.tsx` (`MemberDrawer`, `LobbyKind`), `src/Feed.tsx` (`Feed`, `FeedLine`; Stage B already repointed its send to `api.price` then `api.act`), `src/Tour.tsx` (`Tour`, `TourStep`), `src/theme.tsx`, `src/sound.ts`, `src/layouts.ts`.

Deleted by this stage: `src/Chamber.tsx` (Task 4), `src/Write.tsx` (Task 16), `src/keys.ts` (Task 17, `radioKeys` loses its last caller with the faction picker), the `motion` dependency (Task 1). `src/Campaign.tsx` was already deleted by Stage B.

Not touched by this stage: `scripts/term.ts`, which Stage B's last task rewrote against the v4 routes and which still drives the whip, amend, lobby and vote block as the route contract's regression test.

### The `src/api.ts` contract

`PriceTag`, `Refusal`, `Act`, `RivalMove`, `Warning`, `InForce`, `WireLine`, `HolderRow` and `TestResult` are Stage A's and Stage B's own types, imported from `worker/engine.ts` and re-exported here, never restated. Stage C adds two:

```ts
export type Daily = { day: string; scenario: string; title: string; era: string; place: string; played: boolean; streak: number; plays: number; grid?: { ledger: string; won?: boolean }[] };
/** R22: both are engine facts. The client prints them and never derives them. */
export type RunStyle = { line: string; decisive: { turn: number; line: string }[] };

export type GameView = Omit<Game, "pack" | "director" | "members" | "bills" | "ledgers" | "holders" | "extra"> & {
  ledgers: Game["ledgers"];                  // the five v4 names only: approval, capital and party are gone
  scenario: string; pack: PackView; members: ViewMember[]; bills: ViewBill[];
  citizens: Pick<Citizen, "id" | "region" | "bloc" | "name" | "weight">[];
  lobbyCosts: Record<LobbyAction, number>; coalition: string[]; seatTitle: string; turnsPerTerm: number;
  ending?: { title: string; body: string }; deltas?: Record<string, number>;
  holders: HolderView[]; instruments: Partial<Record<Verb, InstrumentView>>;
  bar: number; ruler: { role: string; faction: string }; shortfall: number; handicap: number;
  calls: { spent: number; cap: number }; discount: number;
  warnings: Warning[]; inForce: InForce[]; wire: WireLine[]; pending: string | null;
  tag: PriceTag | null; refusal: Refusal | null; acts: Act[]; rival: RivalMove | null;
  test?: TestResult;
  result?: NonNullable<Game["result"]> & Partial<RunStyle> & { grid?: { ledger: string; won?: boolean }[] };
};

export const api: {
  match(prompt: string): Promise<MatchResult>;
  build(prompt: string): Promise<{ id: string }>;
  scenario(id: string): Promise<BuildState>;
  daily(): Promise<Daily>;                                                               // GET /daily, Stage C
  seat(scenario: string, faction: string, promises: number[], seed?: number, platform?: string): Promise<GameView>;
  share(code: string): Promise<GameView>;
  load(id: string): Promise<GameView>;
  price(g: GameView, text: string, verb?: Verb, memberId?: string): Promise<GameView>;   // POST /acts/price
  act(g: GameView): Promise<GameView>;                                                   // POST /acts
  withdraw(g: GameView, id: string): Promise<GameView>;                                  // POST /acts/withdraw
  endTurn(g: GameView): Promise<GameView>;                                               // POST /turn/end
  resolve(g: GameView, i: number, stance: number): Promise<GameView>;
  whip(g: GameView): Promise<GameView>;
  lobby(g: GameView, memberId: string, action: LobbyAction): Promise<GameView>;
  amend(g: GameView): Promise<GameView>;
  adopt(g: GameView, i: number): Promise<GameView>;
  vote(g: GameView): Promise<GameView>;
  midterm(g: GameView): Promise<GameView>;
  test(g: GameView): Promise<GameView>;
  continue(g: GameView): Promise<GameView>;
  stop(g: GameView): Promise<GameView>;
};
```

`daily` and `seat`'s fifth argument are the only two things Stage C adds. `price`, `act`, `withdraw` and `endTurn` are Stage B's, with Stage B's names, and are never renamed here.

Gone for good by the end of this stage, on top of what Stage B removed: `api.draft`, `api.post`, `api.drafts`, `api.campaign`, `Lever`, `Gains`, `campaign` on `GameView`, and `ledgers.approval`, `ledgers.capital` and `ledgers.party` on both the view and `worker/game.ts`'s `view()`. There is no `api.hold` and no hold route: a held warning is state on the Desk.

### CSS the later stages may reuse

Tokens on `:root`: `--tre --aut --che --loy --pop --danger` with their `-on` variants for ink backgrounds, `--head --wire`, `--s1` to `--s6`. `--red` is gone: `--danger: #bb0916` is the only failure colour in the file. Classes: `.r-tre .r-aut .r-che .r-loy .r-pop .r-danger` set `--c` and `--c-on`; `.ic` and `.ic.sm`; `.desk .striprow .strip .led .track .room .peek .main .col .deskcol .floorcol .railcol .railbody .tabbar .tabpanel .pinned .unpin .causes .rowbtn .verbs .tag .tag-h .tag-b .fig .tagr .was .priced .tabled .endturn .holders .plateh .campaignview .wire .run .landing .door .deskopen`. `.priced` is the tag's own mark and does not touch `.stamp`, which stays the oath's.

---

## Required from Stage D

Stage B's plan landed while this one was being written, so every act route, every price tag field, the campaign's removal and the wire's line kinds are read from it rather than assumed. Three shapes are Stage D's to write, and Stage D's plan must carry a task for each. The exact shapes are below. Every one of them is also guarded at its use, so Stage C ships and renders before Stage D lands them.

| Required | Exact shape | Where it comes from | Used by | What happens until it lands |
|---|---|---|---|---|
| `GET /api/daily` | answers Stage C's `Daily`: `{ day: string; scenario: string; title: string; era: string; place: string; played: boolean; streak: number; plays: number; grid?: { ledger: string; won?: boolean }[] }` | spec §10 and §14 | Task 16 | `api.daily()` rejects, `App` swallows it, the landing's first block prints "Today's term is not up yet" and the other three blocks work |
| `game.result.line` | `string`, one sentence naming how the run was ruled, written from `record()` | R22; an engine fact, never client arithmetic | Task 23 | The panel does not render and Over reads as it does today |
| `game.result.decisive` | `{ turn: number; line: string }[]`, the two turns that decided it, written from `record()` | R22; an engine fact, never client arithmetic | Task 23 | The panel does not render |
| `game.result.grid` | `{ ledger: string; won?: boolean }[]`, one entry per turn carrying the ledger that moved most | spec §10's share grid | Tasks 16, 23 | The grid does not render; the code and the copy button still do |

`result.line` and `result.decisive` had no owner in the reviewed draft. They are R22 requirements and they are engine facts, so they belong to the stage that owns `record()`'s readers: Stage D writes them and this table is the ask.

Two smaller reconciliations for the cross-check, both one-line fixes if they come back different:

- `Event.kind`'s value set. Stage B put `kind` and `holder` on `Event` but does not spell the union out. Task 14 maps it through one `KIND` record that defaults to `"crisis"`, so a different name changes that one line.
- `game.midterm.regions`. Task 19 walks a non-chamber half-term holder as tiles when the field is there and falls back to the seat walk when it is not, so a pack whose half-term is a court still counts.

## Open questions

- Stage A's `ConstitutionSchema` types `ruler.faction` as a bare string. Task 17 resolves it against `pack.starts` and falls back to `pack.starts[0]`, but a pack whose generator wrote a display name there will always start the player in the first faction. The cross-plan reconcile asks Stage A's validator to require a `pack.starts` id; until it does, the fallback stands.
- Brief ruling 10 puts spec §6's minority start fields on the Stage A view, and Task 17 reads `game.shortfall` and `game.handicap` there for the label after the oath. Before the oath no game exists, so the Seat computes `threshold - ownSeats` from the pack. The two can disagree only if Stage A's `shortfall` is not that same subtraction, which its interface block says it is.
- `ledgerValue` sums the weighted national popularity in the client, which is the same arithmetic as Stage A's `nationalPopularity`. It prints a view field rather than deciding anything, but it is two formulas to keep in step. A `popularity: number` scalar on the view would let the client sum go.
- Stage B leaves `pack.chamber.alpha`, `pack.test.reveal` and `pack.test.win` and `lose` in place. Task 21 stops reading `alpha` and `reveal` and keeps `win` and `lose` as the verdict sentence. Both dead fields stay in the pack, unread, which the stage review may want to call.
- `.write` and `.write h1` in `src/styles.css` lose their element when `src/Write.tsx` goes in Task 16, and `.billpad textarea` loses its last match when the composer takes over in Task 9. Both are dead selectors for the stage review, not edits this plan makes.
