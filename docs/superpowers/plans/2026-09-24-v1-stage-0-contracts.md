# United States of Jev v1, Stage 0 (contracts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the contracts that Track D (React port of the desk) and Track E (generation v2 into production) share, so the two tracks never edit the same files and meet cleanly: pack fields, the R36 engine, the desk's view types, the emblem sanitizer, the theme tokens with their contrast fix, and two real fixture packs.

**Architecture:** Two new pure modules (`worker/emblem.ts`, `worker/tokens.ts`) own the security- and colour-sensitive rules; `worker/pack.ts` gains only optional, lenient fields that use them; the engine switches its card reads to R36 glance cards through one function (`glanceOf`) that also reads old R30 cards; the clerk returns a new `touches` list of glance tags. `worker/desk.ts` holds the desk's view types only; Track D writes the mapper. A converter script turns the approved mock's two worlds into fixture packs that parse, play and seed local D1.

**Tech Stack:** TypeScript 5.9, zod 4, bun:test, Cloudflare Workers + D1 (local), React 19 (consumer only; no React code in this stage).

**Spec:** `docs/superpowers/specs/2026-09-22-the-ruler-design.md` (R24 to R36; R36 is the glance card). Mock: `docs/mocks/v4/feel/desk.html` (fileHTML, GC, G2, SC tables), `docs/mocks/v4/eras/{biden-2021,westeros}.json`, `docs/mocks/v4/feel/emblem-gen.ts`, `docs/mocks/v4/gen2/{schemas,split}.ts`.

**Measured before writing:** every code block below was run in a throwaway worktree off `2cb4830`: `bun test worker src scripts` 440 pass, 0 fail (337 before); `bunx tsc -b` silent; `bunx vite build` succeeds; the fixture SQL seeds local D1 (`biden-2021` 104 KB, `westeros` 117 KB). Every diff below passes `git apply --check` on `2cb4830`.

**Order:** Task 1 and Task 2 in parallel, then Task 3, then Task 4, then Task 5 and Task 6 in parallel. Six tasks.

## Global Constraints

Copied verbatim from the v1 build brief (lead, 2026-09-24): the lines that bear on the contracts. The brief's scope, generation-speed, content-filter and power-base lines bind Tracks D and E, not this stage. Every task's requirements include this section.

- The UI is docs/mocks/v4/feel/desk.html, approved "absolutely perfect, ship it". Port it exactly: layout, tokens, motion values, copy, the flow (receipt pricing with no threads, Sign shockwave, seat-by-seat count, verdict with the court dimmed to 12%, P1-B couriers, review that stays until "Back to the desk"), rims (P1-B rows, tint wash, fixed height), glance card (R36), resources side sheet (stat cards), ballot chip with tooltip, and screen scaling (every size = px x --k, k = min(w/1440, h/900) clamped 1 to 1.8; in React use rem from one root scale, not per-component math).
- No logos, stamps or crests anywhere (world level). Faction emblems ship in placement A: the emblem replaces the rim-row line icon and shows in the card's icon disc; the line icon is the fallback for any missing, failed or filtered emblem.
- Add the `motion` npm package (owner approved). No other new runtime dependency without asking.
- D and E run in parallel after Stage 0. Old stored packs must keep loading: the desk shows them through a fallback.
- No pictures: image generation is removed (commit 866a2e4). Nothing may reintroduce it.
- Own party is one row: when the ruler's party sits in the chamber, ownGroup is that chamber party; pledges may target it; no duplicate holder.
- Themes: the world call writes design tokens (palette, curated font pair, type scale, radius, rule style, material settings, motion personality, courier shape, vocabulary) plus one emblem per faction as sanitized SVG. Never CSS or JS from a model. zod schema, OKLCH contrast auto-fix to 4.5:1, SVG allowlist sanitizer, default theme on any failure.
- Emblem guards: (1) 28 px legibility gate in a second pass, (2) canon check for known-story and historical worlds, (3) line-icon fallback. A filtered call may be resent once with a changed prompt (names only).
- Code standard: whole-word names, a short module header saying what the file owns, comments only for the why, no dense one-liners. Match the surrounding style. Biome formats on commit.
- Performance: 60 fps floor on a normal laptop during every desk moment; no React re-renders during animation (animate refs/Motion, not state); code-split by screen; JS under 200 KB gzipped; no long task over 50 ms; load only the world's 2 to 3 fonts.
- Tests (owner's CLAUDE.md): behaviour at the public boundary, parametrised, extend existing test files; no tests of getters or mock calls; test code no longer than the code under test except parsers, money, security (the SVG sanitizer is security: test it well). Prefer an end-to-end check that leaves a repeatable artifact. Gates per commit: `bun test worker src scripts` green, `bunx tsc -b` clean, `bunx vite build` succeeds.
- Stored packs must keep parsing: every new pack field is optional or has a default.
- Never commit or print the OpenRouter key (.env, .dev.vars). The repo is PUBLIC: nothing from .superpowers/ (private planning) goes into committed files.

Stage 0 adds two of its own:

- **No runtime import from `worker/pack.ts` into `worker/engine.ts`.** `pack.ts` reads `TEMPERAMENTS` from `engine.ts` while it initialises, so a value import the other way is a circular import that crashes at load. `engine.ts` imports pack **types** only; new engine helpers (`glanceOf`, `tagKey`, `glanceTags`) live in `engine.ts`.
- **Commit messages** follow the repo: one plain sentence, no `feat:` prefix.

## Decisions (the lead should confirm; each is reversible)

| # | Decision | Why |
|---|---|---|
| 1 | **An emblem is stored as structured JSON, not an SVG string:** `{ size: 24 \| 64, elements: [{ tag, d?, cx?, ..., fill?: "ink"\|"accent"\|"paper"\|"none" }] }`. The desk draws it with `createElement(tag, props)` from a 6-tag allowlist, never `innerHTML`. `sanitizeEmblem` runs on write (E); `checkEmblem` runs again on render (D). | No model text is ever parsed as markup, so there is no sanitizer bypass class at all; the allowlist regexes are a second wall. Paint is a token, not CSS, so no colour string reaches the page from the model. |
| 2 | **The clerk matches glance tags through a new `Quote.touches` field.** The price call receives `glance_tags` (every glance tag in the world, lower-cased) and returns the ones the act does; code keeps only known tags. A glance tag equal to a pack tag also matches with no clerk help. | R36 tags are phrases ("Relief checks"); only the clerk can say an act does them. One field on the existing Luna price call: no new call, no Jev units. |
| 3 | **R36 lean order:** red line (-2), then any other hate (-1), then a want (+1). Reasons print as `Red line: X`, `Hates X`, `Wants X` (were `Backs`/`Fights`). | A hated act that also serves a want reads as hated, the conservative call. |
| 4 | **Old packs:** `glanceOf` reads an R30 long card as a glance card (each want's first act as a want tag, the first act it fights as a hate, its red line). A pack with no card at all keeps lean 0, as today. The desk may show such a file from `holder.wants` and `holder.redLines` (D's choice). | No stored production pack has cards (generation never wrote them), so matching behaviour for live packs does not change. |
| 5 | **Money refusal is a hate tag matching** `/\b(bribes?\|bribery\|bought\|paid off\|cash for\|money for)\b/i` (`REFUSES_MONEY`). E's prompt writes "Bribes" for a group that will not take money. "Late payments" does not refuse money. | R36 dropped the `price.refuses` sentence; a loose `pay` match would misfire on the Iron Bank's "Late payments". |
| 6 | **A Negotiate pledge is any want not already promised** (was: only a want whose tag is a pack tag), keyed by `tagKey(want)`. It is kept when a later act or passed law touches that tag. | The glance tag is the pledge; the promise machinery is unchanged. |
| 7 | **Theme tokens drop `script`, `ornament` and `motif`** from the gen2 theme (no stamps or crests; UI copy stays left to right) and **add `courier`**: `dot`, `coin`, `shard`, `fleck`, the four shapes the mock already draws. Palettes are two objects, `light` and `dark`. The fix checks ink, muted and accent against paper and surface at 4.5:1. Resource, state and tint colours stay fixed tokens that D fits with `fitContrast` (the mock's `fit` used 4.6). | Level B tokens as the brief lists them, and nothing the desk cannot draw. |
| 8 | **Member glance cards are schema only.** The engine reads holder and faction cards; a member card is for the file. | R36 says members get the same card; the vote already moves per faction. |
| 9 | **`motion` is left to Track D.** No Stage 0 code imports it, and D is then the only track that edits `package.json` and `bun.lock`. | Ponytail; no lockfile conflict between tracks. |
| 10 | **Fixture non-desk content is mini.json's harbour filler** (deck, citizens, patrons, blocs, lobby, escalations, endings), and the converter reads the untracked `docs/mocks/v4` from the main checkout. | The desk never shows those fields; E replaces them with real ones. The mock folder is not in git, so a worktree must pass the main checkout's path. |

## Review Focus

1. **A model emblem carrying `<script>`, an `onload`, a `url()` paint or a coordinate far off the box**: nothing of it reaches the page, and the row shows its line icon. Pinned in Task 1 (the tag, attribute, path, paint, number and `checkEmblem` tables).
2. **A stored pack whose glance card, emblem, tint or theme is malformed** (a model wrote no red line, a `<script>` emblem, `"red"` as a colour): the pack still loads and only that field falls back. Pinned in Task 3 ("a malformed glance, emblem, tint or theme drops to undefined").
3. **A theme colour that carries CSS (`#fff;background:url(x)`) or text that cannot be read**: the default theme, or the same hue made readable at 4.5:1. Pinned in Task 2 (the invalid-token table and the fitting test).
4. **The clerk names a glance tag the world does not have, or in another case**: the unknown tag is dropped and the known one is keyed in lower case. Pinned in Task 4 (`luna.test.ts` and "the clerk's touches keep only this world's glance tags").
5. **A game saved before R36** (its price tag has no `touches`) and **a Negotiate pledge**: the old tag still commits, as a decree and as a law; the pledge is kept by a later act that does the want and not by the law it was bought on. Pinned in Task 4 ("a price tag stored before R36", "a decree that does a pledged want keeps the pledge", "a pledge taken on a law is not kept by that same law passing").

## Files

| File | Task | Owns |
|---|---|---|
| `worker/emblem.ts` (new) | 1 | Emblem schema, sanitizer, render check, React-ready shapes |
| `worker/emblem.test.ts` (new) | 1 | The sanitizer's security tests |
| `worker/tokens.ts` (new) | 2 | Theme token schema, default theme, WCAG contrast, OKLCH fix, tint schema |
| `worker/tokens.test.ts` (new) | 2 | Contrast and token tests |
| `worker/pack.ts` | 3 | Glance schema, icons, lenient new fields on holders, factions, members, ledgers, vocabulary, pack |
| `worker/pack.test.ts` | 3, 6 | New-field parse tests (3); fixture tests (6) |
| `worker/engine.ts`, `worker/acts.ts`, `worker/luna.ts` | 4 | R36 matching, `touches`, Negotiate terms |
| `worker/acts.test.ts`, `worker/game.test.ts`, `worker/luna.test.ts` | 4 | R30 card tests rewritten to R36 |
| `worker/desk.ts` (new) | 5 | The desk's view types |
| `scripts/era-fixture.ts` (new), `worker/fixtures/biden-2021.json`, `worker/fixtures/westeros.json` (generated) | 6 | Fixture packs and the local D1 seed |

After Stage 0, **Track D owns** `src/**`, `worker/desk.ts` (adds `deskView`), `worker/game.ts` `view()` (adds `desk`), `src/api.ts`, `package.json`. **Track E owns** `worker/gen/**`, `worker/build.ts`. Neither edits `worker/emblem.ts`, `worker/tokens.ts` or the Stage 0 parts of `worker/pack.ts` without the lead.

---

### Task 1: The emblem sanitizer

**Files:**
- Create: `worker/emblem.ts`
- Test: `worker/emblem.test.ts` (new)

**Interfaces:**
- Consumes: `zod` only.
- Produces: `EMBLEM_TAGS`, `EMBLEM_PAINTS`, `EMBLEM_LIMIT`, `type EmblemTag`, `type EmblemPaint`, `type EmblemElement`, `EmblemSchema`, `type Emblem`, `type SanitizedEmblem`, `sanitizeEmblem(raw: unknown): SanitizedEmblem`, `checkEmblem(value: unknown): Emblem | null`, `type EmblemShape`, `emblemShapes(emblem: Emblem): EmblemShape[]`.

The allowlist follows the lab prototype (`docs/mocks/v4/feel/emblem-gen.ts`, `sanitize`): 6 tags, viewBox `0 0 24 24` or `0 0 64 64`, numbers within twice the box, stroke at most a quarter of it, 12 elements, path data and transforms by pattern. Two changes from the lab: paints are stored as tokens (`ink`, `accent`, `paper`, `none`), not CSS, and `d`/`points` are accepted only on the tag that uses them.

- [ ] **Step 1: Write the failing test**

Create `worker/emblem.test.ts`:

```ts
import { expect, test } from "bun:test";
import { checkEmblem, EMBLEM_LIMIT, EmblemSchema, emblemShapes, sanitizeEmblem } from "./emblem";

const CIRCLE = { tag: "circle", cx: 12, cy: 12, r: 5 };
const box = (elements: unknown[], viewBox = "0 0 24 24") => sanitizeEmblem({ viewBox, elements });
const one = (element: unknown) => box([element]).emblem?.elements[0];

for (const tag of [
  "script",
  "foreignObject",
  "image",
  "use",
  "a",
  "style",
  "text",
  "animate",
  "set",
  "g",
  "iframe",
  "SCRIPT",
]) {
  test(`a <${tag}> element never survives`, () => {
    const result = box([{ tag, d: "M0 0", href: "javascript:alert(1)" }, CIRCLE]);
    expect(result.emblem?.elements.map((element) => element.tag)).toEqual(["circle"]);
  });
}

test("only allowlisted attributes survive: handlers, links, styles and classes are dropped", () => {
  const element = one({
    tag: "path",
    d: "M2 2L20 20",
    onload: "alert(1)",
    onclick: "x()",
    href: "#a",
    "xlink:href": "#b",
    style: "fill:red",
    class: "c",
    id: "i",
    filter: "url(#f)",
    mask: "url(#m)",
    "clip-path": "url(#c)",
  });
  expect(element).toEqual({ tag: "path", d: "M2 2L20 20", fill: "ink" });
});

test("a __proto__ key from parsed JSON is dropped and pollutes nothing", () => {
  const element = one(
    JSON.parse('{"tag":"circle","cx":1,"cy":1,"r":1,"__proto__":{"polluted":1}}'),
  );
  expect(element).toEqual({ tag: "circle", cx: 1, cy: 1, r: 1, fill: "ink" });
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

for (const d of [
  "M0 0 javascript:alert(1)",
  "M0 0 url(#x)",
  "M0 0 <script>",
  "M0 0 &#106;",
  "M0 0 expression(1)",
  "",
  `M${"1".repeat(1500)}`,
]) {
  test(`path data ${JSON.stringify(d.slice(0, 30))} drops the path`, () => {
    expect(box([{ tag: "path", d }]).emblem).toBeNull();
  });
}

test("polygon points outside numbers drop the polygon", () => {
  expect(box([{ tag: "polygon", points: "0,0 10,10 url(x)" }]).emblem).toBeNull();
});

for (const [transform, kept] of [
  ["translate(2,3) scale(1.1)", true],
  ["rotate(45 12 12)", true],
  ["rotate(45 12 12) url(x)", false],
  ["translate(1,2);fill:red", false],
  ["scale(2) javascript:", false],
  ["rotate(calc(1))", false],
] as [string, boolean][]) {
  test(`transform ${transform} is ${kept ? "kept" : "refused"}`, () => {
    expect(one({ ...CIRCLE, transform })?.transform).toBe(kept ? transform : undefined);
  });
}

for (const [paint, token] of [
  ["url(#g)", "ink"],
  ["#ff0000", "ink"],
  ["red", "ink"],
  ["var(--x);background:url(y)", "ink"],
  ["currentColor", "ink"],
  ["ink", "ink"],
  ["var(--accent)", "accent"],
  ["ACCENT", "accent"],
  ["var(--paper)", "paper"],
  ["none", "none"],
]) {
  test(`fill ${paint} is stored as ${token}`, () => {
    expect(one({ ...CIRCLE, fill: paint })?.fill).toBe(token as never);
  });
}

for (const [viewBox, size] of [
  ["0 0 24 24", 24],
  [" 0  0 64 64 ", 64],
  ["0 0 100 100", null],
  ["-10 0 64 64", null],
  ["0 0 24", null],
  ["", null],
  ["0 0 24 24; x", null],
] as [string, number | null][]) {
  test(`viewBox ${JSON.stringify(viewBox)} gives size ${size}`, () => {
    expect(box([CIRCLE], viewBox).emblem?.size ?? null).toBe(size);
  });
}

for (const [key, value] of [
  ["r", "NaN"],
  ["r", "Infinity"],
  ["r", "1e400"],
  ["r", "12px"],
  ["r", ""],
  ["cx", 49],
  ["cx", -49],
] as [string, string | number][]) {
  test(`${key}=${JSON.stringify(value)} drops the element`, () => {
    expect(box([{ ...CIRCLE, [key]: value }]).emblem).toBeNull();
  });
}

test("a coordinate at twice the box is kept, and a wide stroke is cut to a quarter of it", () => {
  expect(one({ ...CIRCLE, cx: 48 })?.cx).toBe(48);
  expect(one({ ...CIRCLE, "stroke-width": 20 })?.strokeWidth).toBe(6);
  expect(one({ ...CIRCLE, strokeWidth: 2 })?.strokeWidth).toBe(2);
});

test("more than the limit is cut to the limit, and the cut is reported", () => {
  const result = box(Array.from({ length: 15 }, () => CIRCLE));
  expect(result.emblem?.elements).toHaveLength(EMBLEM_LIMIT);
  expect(result.fixes).toContain(`cut 15 elements to ${EMBLEM_LIMIT}`);
});

test("a path with no d and a polygon with no points are dropped; d on a circle is dropped alone", () => {
  expect(box([{ tag: "path", fill: "ink" }, { tag: "polygon" }]).emblem).toBeNull();
  expect(one({ ...CIRCLE, d: "M0 0" })).toEqual({ ...CIRCLE, fill: "ink" });
});

for (const raw of [null, "svg", 42, [], { viewBox: "0 0 24 24", elements: "x" }]) {
  test(`input ${JSON.stringify(raw)} gives no emblem`, () => {
    expect(sanitizeEmblem(raw).emblem).toBeNull();
  });
}

test("whatever goes in, what comes out passes the stored schema", () => {
  const messy = [
    { tag: "PATH", d: "M2 2L20 20", fill: "url(#g)", onload: "x" },
    { tag: "rect", x: "1", y: "1", width: "5", height: "5", transform: "rotate(45 12 12)" },
    { tag: "line", x1: 0, y1: 0, x2: 24, y2: 24, stroke: "var(--accent)", "stroke-width": 20 },
    { tag: "polygon", points: "1,1 5,1 3,4", "fill-rule": "evenodd" },
    { tag: "ellipse", cx: 12, cy: 12, rx: 4, ry: 2, fill: "paper" },
  ];
  const result = box(messy);
  expect(result.emblem?.elements).toHaveLength(5);
  expect(EmblemSchema.safeParse(result.emblem).success).toBe(true);
});

for (const [label, stored] of [
  ["an extra onload key", { size: 24, elements: [{ tag: "path", d: "M0 0", onload: "x" }] }],
  ["a size of 32", { size: 32, elements: [CIRCLE] }],
  ["a coordinate off the box", { size: 24, elements: [{ ...CIRCLE, cx: 999 }] }],
  ["a script in d", { size: 24, elements: [{ tag: "path", d: "M0 0 javascript:" }] }],
  ["a raw colour", { size: 24, elements: [{ ...CIRCLE, fill: "#ff0000" }] }],
  ["no elements", { size: 24, elements: [] }],
] as [string, unknown][]) {
  test(`checkEmblem refuses a stored emblem with ${label}`, () => {
    expect(checkEmblem(stored)).toBeNull();
  });
}

test("the desk's shapes carry only geometry and a style with the paint's CSS", () => {
  const emblem = box([
    { ...CIRCLE, fill: "accent", stroke: "ink", "stroke-width": 2 },
    { tag: "path", d: "M1 1L2 2", fill: "paper" },
  ]).emblem!;
  expect(checkEmblem(emblem)).toEqual(emblem);
  expect(emblemShapes(emblem)).toEqual([
    {
      tag: "circle",
      props: {
        cx: 12,
        cy: 12,
        r: 5,
        strokeWidth: 2,
        style: { fill: "var(--accent)", stroke: "currentColor" },
      },
    },
    { tag: "path", props: { d: "M1 1L2 2", style: { fill: "var(--paper)" } } },
  ]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test worker/emblem.test.ts`
Expected: FAIL, `Cannot find module './emblem'`.

- [ ] **Step 3: Write the module**

Create `worker/emblem.ts`:

```ts
// Faction and group emblems: the stored shape, the sanitizer that turns a model's SVG-as-JSON into it, and the
// shapes the desk draws. An emblem is data, never markup: the desk builds each shape with createElement from an
// allowlisted tag, so no model text is ever parsed as HTML or SVG. Generation sanitizes on write; the desk checks
// again on render and falls back to the line icon when the check fails.
import { z } from "zod";

export const EMBLEM_TAGS = ["path", "circle", "ellipse", "rect", "polygon", "line"] as const;
export const EMBLEM_PAINTS = ["ink", "accent", "paper", "none"] as const;
export const EMBLEM_LIMIT = 12;

const NUMBER_KEYS = [
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "width",
  "height",
  "x1",
  "y1",
  "x2",
  "y2",
  "strokeWidth",
] as const;
// Path commands and numbers only: no letter outside the command set, so no url(), no javascript:, no entity.
const PATTERNS = {
  d: /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]{1,1500}$/,
  points: /^[0-9eE.,\s+-]{1,600}$/,
  transform: /^\s*((translate|rotate|scale|matrix|skewX|skewY)\(\s*[-0-9eE.,\s]*\)\s*)+$/,
};
const ATTRIBUTE_NAMES: Record<string, string> = {
  "stroke-width": "strokeWidth",
  "fill-rule": "fillRule",
};
// The model may name a paint by its token or by the CSS the lab used; anything else is painted in ink.
const PAINT_ALIASES: Record<string, EmblemPaint> = {
  ink: "ink",
  currentcolor: "ink",
  accent: "accent",
  "var(--accent)": "accent",
  paper: "paper",
  "var(--paper)": "paper",
  none: "none",
};
const PAINT_CSS: Record<EmblemPaint, string> = {
  ink: "currentColor",
  accent: "var(--accent)",
  paper: "var(--paper)",
  none: "none",
};

export type EmblemTag = (typeof EMBLEM_TAGS)[number];
export type EmblemPaint = (typeof EMBLEM_PAINTS)[number];

const coordinate = z.number().optional();
const EmblemElementSchema = z.strictObject({
  tag: z.enum(EMBLEM_TAGS),
  d: z.string().regex(PATTERNS.d).optional(),
  points: z.string().regex(PATTERNS.points).optional(),
  transform: z.string().regex(PATTERNS.transform).optional(),
  cx: coordinate,
  cy: coordinate,
  r: coordinate,
  rx: coordinate,
  ry: coordinate,
  x: coordinate,
  y: coordinate,
  width: coordinate,
  height: coordinate,
  x1: coordinate,
  y1: coordinate,
  x2: coordinate,
  y2: coordinate,
  strokeWidth: coordinate,
  fill: z.enum(EMBLEM_PAINTS).optional(),
  stroke: z.enum(EMBLEM_PAINTS).optional(),
  fillRule: z.enum(["nonzero", "evenodd"]).optional(),
});
export type EmblemElement = z.infer<typeof EmblemElementSchema>;

function elementProblem(element: EmblemElement, size: number): string | null {
  for (const key of NUMBER_KEYS) {
    const value = element[key];
    if (value !== undefined && Math.abs(value) > size * 2)
      return `${key} ${value} is off the emblem`;
  }
  if ((element.strokeWidth ?? 0) > size / 4) return "stroke wider than a quarter of the emblem";
  if (element.tag === "path" && !element.d) return "a path needs d";
  if (element.tag !== "path" && element.d !== undefined) return "only a path takes d";
  if (element.tag === "polygon" && !element.points) return "a polygon needs points";
  if (element.tag !== "polygon" && element.points !== undefined)
    return "only a polygon takes points";
  return null;
}

// The stored shape. size is the viewBox edge: "0 0 24 24" or "0 0 64 64".
export const EmblemSchema = z
  .strictObject({
    size: z.union([z.literal(24), z.literal(64)]),
    elements: z.array(EmblemElementSchema).min(1).max(EMBLEM_LIMIT),
  })
  .superRefine((emblem, context) => {
    for (const element of emblem.elements) {
      const problem = elementProblem(element, emblem.size);
      if (problem) context.addIssue({ code: "custom", message: problem });
    }
  });
export type Emblem = z.infer<typeof EmblemSchema>;

export type SanitizedEmblem =
  | { emblem: Emblem; fixes: string[] }
  | { emblem: null; reason: string; fixes: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// One model element to a stored element, or null (with the reason in fixes) when it cannot be made safe.
function cleanElement(item: unknown, size: 24 | 64, fixes: string[]): EmblemElement | null {
  if (!isRecord(item)) {
    fixes.push("dropped an element that is not an object");
    return null;
  }
  const tag = String(item.tag ?? "").toLowerCase();
  if (!(EMBLEM_TAGS as readonly string[]).includes(tag)) {
    fixes.push(`dropped <${tag.slice(0, 20)}>`);
    return null;
  }
  const element: Record<string, unknown> = { tag };
  for (const [rawKey, rawValue] of Object.entries(item)) {
    if (rawKey === "tag") continue;
    const key = ATTRIBUTE_NAMES[rawKey] ?? rawKey;
    const value = String(rawValue).trim();
    if ((NUMBER_KEYS as readonly string[]).includes(key)) {
      const number = Number(value);
      if (value === "" || !Number.isFinite(number) || Math.abs(number) > size * 2) {
        fixes.push(`dropped <${tag}>: ${key}=${value.slice(0, 20)}`);
        return null;
      }
      element[key] = key === "strokeWidth" ? Math.min(number, size / 4) : number;
    } else if (key === "d" || key === "points" || key === "transform") {
      const owner = key === "d" ? "path" : key === "points" ? "polygon" : tag;
      if (owner !== tag) {
        fixes.push(`dropped ${key} on <${tag}>`);
        continue;
      }
      if (!PATTERNS[key].test(value)) {
        fixes.push(`dropped <${tag}>: ${key} failed the pattern`);
        return null;
      }
      element[key] = value;
    } else if (key === "fill" || key === "stroke") {
      const paint = PAINT_ALIASES[value.toLowerCase()];
      if (!paint) fixes.push(`${key} ${value.slice(0, 24)} -> ink`);
      element[key] = paint ?? "ink";
    } else if (key === "fillRule") {
      element.fillRule = value === "evenodd" ? "evenodd" : "nonzero";
    } else {
      fixes.push(`dropped ${rawKey.slice(0, 20)}`);
    }
  }
  if (tag === "path" && element.d === undefined) {
    fixes.push("dropped <path> with no d");
    return null;
  }
  if (tag === "polygon" && element.points === undefined) {
    fixes.push("dropped <polygon> with no points");
    return null;
  }
  // SVG paints a shape with no fill black; ink follows the row's hue in both themes.
  element.fill ??= "ink";
  return element as EmblemElement;
}

// The model's emblem ({ viewBox, elements: [{ tag, ...attributes }] }) to the stored shape, with every change listed.
export function sanitizeEmblem(raw: unknown): SanitizedEmblem {
  const fixes: string[] = [];
  if (!isRecord(raw)) return { emblem: null, reason: "not an object", fixes };
  const viewBox = String(raw.viewBox ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const size = viewBox === "0 0 24 24" ? 24 : viewBox === "0 0 64 64" ? 64 : null;
  if (!size) return { emblem: null, reason: `viewBox ${viewBox.slice(0, 40)}`, fixes };
  const elements: EmblemElement[] = [];
  for (const item of Array.isArray(raw.elements) ? raw.elements : []) {
    const element = cleanElement(item, size, fixes);
    if (element) elements.push(element);
  }
  if (elements.length > EMBLEM_LIMIT) {
    fixes.push(`cut ${elements.length} elements to ${EMBLEM_LIMIT}`);
    elements.length = EMBLEM_LIMIT;
  }
  if (!elements.length) return { emblem: null, reason: "no element survived", fixes };
  // cleanElement enforces every rule of the schema, so a failure here is a bug in this file, refused rather than shipped.
  const parsed = EmblemSchema.safeParse({ size, elements });
  if (!parsed.success)
    return { emblem: null, reason: parsed.error.issues[0]?.message ?? "invalid", fixes };
  return { emblem: parsed.data, fixes };
}

// The desk's check before it draws: a stored emblem that no longer passes the schema is not drawn.
export function checkEmblem(value: unknown): Emblem | null {
  const parsed = EmblemSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type EmblemShape = {
  tag: EmblemTag;
  props: Record<string, string | number | Record<string, string>>;
};
// What React draws: one createElement(tag, props) per shape inside <svg viewBox={`0 0 ${size} ${size}`}>. Paint goes
// through style, because var() is reliable in CSS and not in SVG presentation attributes.
export function emblemShapes(emblem: Emblem): EmblemShape[] {
  return emblem.elements.map(({ tag, fill, stroke, ...geometry }) => ({
    tag,
    props: {
      ...geometry,
      style: {
        fill: PAINT_CSS[fill ?? "ink"],
        ...(stroke ? { stroke: PAINT_CSS[stroke] } : {}),
      },
    },
  }));
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `bun test worker/emblem.test.ts`
Expected: PASS, 68 pass, 0 fail.

- [ ] **Step 5: Run the gates**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green, tsc prints nothing.

- [ ] **Step 6: Commit**

```bash
git add worker/emblem.ts worker/emblem.test.ts
git commit -m "Emblem sanitizer: model SVG-as-JSON to a stored shape the desk draws without markup"
```

---

### Task 2: Theme tokens and the contrast fix

**Files:**
- Create: `worker/tokens.ts`
- Test: `worker/tokens.test.ts` (new)

**Interfaces:**
- Consumes: `zod` only.
- Produces: `DISPLAY_FONTS`, `BODY_FONTS`, `MONO_FONTS`, `MATERIALS`, `TEXTURES`, `RULE_STYLES`, `MOTIONS`, `COURIERS`, `MIN_CONTRAST`, `ColourSchema`, `TintSchema`, `type Tint`, `type Palette`, `ThemeTokensSchema`, `type ThemeTokens`, `DEFAULT_THEME_TOKENS`, `contrastRatio(first: string, second: string): number`, `fitContrast(foreground: string, backgrounds: string[], minimum?: number): string`, `fitThemeTokens(tokens: ThemeTokens): { tokens: ThemeTokens; fixes: string[] }`, `parseThemeTokens(raw: unknown): { tokens: ThemeTokens; fixes: string[] }`.

Colour maths is written here, not imported: WCAG 2 luminance and the OKLab matrices (Björn Ottosson, 2020) are about 50 lines, and the brief allows no new dependency. The fix walks OKLCH lightness away from the backgrounds, keeps the hue, and lowers chroma only where sRGB cannot show it. Both mock palettes (Biden, Westeros) already pass at 4.5:1, measured; so does the default.

- [ ] **Step 1: Write the failing test**

Create `worker/tokens.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  contrastRatio,
  DEFAULT_THEME_TOKENS,
  fitContrast,
  fitThemeTokens,
  MIN_CONTRAST,
  parseThemeTokens,
} from "./tokens";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test("contrast ratios match WCAG's own figures", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  expect(contrastRatio("#ffffff", "#777777")).toBeCloseTo(4.48, 2);
});

for (const [label, foreground, backgrounds] of [
  ["grey text on parchment", "#a79a82", ["#e8d7b0", "#f1e4c5"]],
  ["a red accent on cream", "#ef5a62", ["#f4f0e6", "#fbf9f3"]],
  ["navy on a dark surface", "#1f3a6e", ["#0c111a", "#141b27"]],
  ["the paper's own colour", "#f4f0e6", ["#f4f0e6"]],
  ["pure yellow on white", "#ffff00", ["#ffffff"]],
  ["upper-case hex", "#A79A82", ["#E8D7B0"]],
] as [string, string, string[]][]) {
  test(`fitContrast lifts ${label} to ${MIN_CONTRAST}:1 on every background`, () => {
    const fitted = fitContrast(foreground, backgrounds);
    expect(fitted).toMatch(/^#[0-9a-f]{6}$/);
    for (const background of backgrounds)
      expect(contrastRatio(fitted, background)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
}

test("a colour that already reads comes back unchanged", () => {
  expect(fitContrast("#121A2B", ["#f4f0e6", "#fbf9f3"])).toBe("#121a2b");
});

test("the fix keeps the hue: a red stays red", () => {
  const [red, green, blue] = rgb(fitContrast("#ef5a62", ["#f4f0e6", "#fbf9f3"]));
  expect(red).toBeGreaterThan(green + 40);
  expect(red).toBeGreaterThan(blue + 40);
});

const valid = {
  ...DEFAULT_THEME_TOKENS,
  light: { ...DEFAULT_THEME_TOKENS.light, muted: "#b8b0a0" },
};
for (const [label, raw] of [
  ["null", null],
  ["an empty object", {}],
  ["a font off the list", { ...valid, display: "Comic Sans MS" }],
  ["a colour name", { ...valid, light: { ...valid.light, ink: "red" } }],
  ["a colour carrying CSS", { ...valid, light: { ...valid.light, ink: "#fff;background:url(x)" } }],
  ["a three-digit colour", { ...valid, dark: { ...valid.dark, ink: "#fff" } }],
  ["a radius past 18", { ...valid, radius: 40 }],
  ["an unknown courier", { ...valid, courier: "rocket" }],
] as [string, unknown][]) {
  test(`${label} gives the default theme and says why`, () => {
    const result = parseThemeTokens(raw);
    expect(result.tokens).toEqual(DEFAULT_THEME_TOKENS);
    expect(result.fixes[0]).toStartWith("default theme:");
  });
}

test("valid tokens with a faint muted colour are fitted, every text colour reads, and a second pass changes nothing", () => {
  const first = parseThemeTokens(valid);
  expect(first.fixes).toEqual([expect.stringContaining("light.muted #b8b0a0 ->")]);
  for (const mode of ["light", "dark"] as const) {
    const palette = first.tokens[mode];
    for (const key of ["ink", "muted", "accent"] as const)
      for (const background of [palette.paper, palette.surface])
        expect(contrastRatio(palette[key], background)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  }
  expect(parseThemeTokens(first.tokens)).toEqual({ tokens: first.tokens, fixes: [] });
});

test("the default theme needs no fix", () => {
  expect(fitThemeTokens(DEFAULT_THEME_TOKENS).fixes).toEqual([]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test worker/tokens.test.ts`
Expected: FAIL, `Cannot find module './tokens'`.

- [ ] **Step 3: Write the module**

Create `worker/tokens.ts`:

```ts
// The world's theme tokens (level B): what a build may choose for the desk's look, the default when it chose
// badly, and the contrast fix that keeps text readable. The model picks values from these lists; it never writes
// CSS. Generation runs parseThemeTokens on write; the desk runs it again on render.
import { z } from "zod";

// The curated Google Fonts (docs THEME.md): a world loads its display, body and mono faces and no other.
export const DISPLAY_FONTS = [
  "Cinzel",
  "Cinzel Decorative",
  "Cormorant",
  "Cormorant SC",
  "Playfair Display",
  "Playfair Display SC",
  "IM Fell English",
  "IM Fell English SC",
  "IM Fell DW Pica",
  "UnifrakturMaguntia",
  "UnifrakturCook",
  "Pirata One",
  "Grenze Gotisch",
  "Libre Caslon Display",
  "Abril Fatface",
  "Rozha One",
  "DM Serif Display",
  "Fraunces",
  "Bodoni Moda",
  "Rye",
  "Bebas Neue",
  "Oswald",
  "Anton",
  "Archivo Black",
  "Big Shoulders Display",
  "Syne",
  "Unbounded",
  "Orbitron",
  "Audiowide",
  "Michroma",
  "Chakra Petch",
  "Space Grotesk",
  "Tektur",
  "Marcellus",
  "Marcellus SC",
  "Tenor Sans",
  "Forum",
  "Philosopher",
  "Amiri",
  "Reem Kufi",
  "Aref Ruqaa",
  "Lalezar",
  "Marhey",
  "El Messiri",
  "Noto Kufi Arabic",
  "Noto Naskh Arabic",
  "Vazirmatn",
  "Gulzar",
] as const;
export const BODY_FONTS = [
  "EB Garamond",
  "Crimson Pro",
  "Libre Baskerville",
  "Source Serif 4",
  "Newsreader",
  "Lora",
  "Spectral",
  "Alegreya",
  "Cardo",
  "Old Standard TT",
  "Literata",
  "Public Sans",
  "IBM Plex Sans",
  "Inter Tight",
  "Work Sans",
  "Instrument Sans",
  "Figtree",
  "Manrope",
  "Rubik",
  "Noto Sans Arabic",
  "Cairo",
  "Tajawal",
] as const;
export const MONO_FONTS = [
  "IBM Plex Mono",
  "JetBrains Mono",
  "Space Mono",
  "Share Tech Mono",
  "VT323",
  "Martian Mono",
  "Courier Prime",
  "DM Mono",
] as const;
export const MATERIALS = [
  "newsprint",
  "vellum",
  "parchment",
  "linen",
  "papyrus",
  "stone",
  "brass",
  "steel",
  "terminal",
  "silk",
  "clay",
  "glass",
] as const;
export const TEXTURES = [
  "halftone",
  "lines",
  "crosshatch",
  "grid",
  "stars",
  "hex",
  "weave",
  "noise",
  "scanlines",
  "none",
] as const;
export const RULE_STYLES = ["single", "double", "dotted", "ornate", "notched", "none"] as const;
export const MOTIONS = ["stately", "brisk", "mechanical", "fluid"] as const;
// Each shape is one the desk mock already draws: dot and coin couriers, shard and fleck bursts.
export const COURIERS = ["dot", "coin", "shard", "fleck"] as const;
export const MIN_CONTRAST = 4.5;

// Six-digit hex only: a colour lands in a CSS custom property, so a wider string could smuggle in a declaration.
export const ColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// A group's hue in each mode: its rim row's wash, bar and disc, and its seats.
export const TintSchema = z.object({ light: ColourSchema, dark: ColourSchema });
export type Tint = z.infer<typeof TintSchema>;
const PaletteSchema = z.object({
  paper: ColourSchema,
  surface: ColourSchema,
  ink: ColourSchema,
  muted: ColourSchema,
  accent: ColourSchema,
  accent2: ColourSchema,
  rule: ColourSchema,
});
export type Palette = z.infer<typeof PaletteSchema>;

export const ThemeTokensSchema = z.object({
  display: z.enum(DISPLAY_FONTS),
  displayWeight: z.number().int().min(300).max(900),
  displayCase: z.enum(["none", "upper", "small-caps"]),
  displayTracking: z.number().min(-0.05).max(0.2),
  body: z.enum(BODY_FONTS),
  bodySize: z.number().min(16).max(19),
  mono: z.enum(MONO_FONTS).nullable(),
  light: PaletteSchema,
  dark: PaletteSchema,
  material: z.enum(MATERIALS),
  texture: z.enum(TEXTURES),
  textureScale: z.number().min(0.6).max(2),
  radius: z.number().min(0).max(18),
  ruleStyle: z.enum(RULE_STYLES),
  motion: z.enum(MOTIONS),
  courier: z.enum(COURIERS),
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

// The approved desk's own look (docs/mocks/v4/feel/desk.html on the Biden world).
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  display: "Libre Caslon Display",
  displayWeight: 400,
  displayCase: "none",
  displayTracking: 0,
  body: "Public Sans",
  bodySize: 17,
  mono: "IBM Plex Mono",
  light: {
    paper: "#f4f0e6",
    surface: "#fbf9f3",
    ink: "#121a2b",
    muted: "#4f5668",
    accent: "#b3202e",
    accent2: "#1f3a6e",
    rule: "#c9bfa9",
  },
  dark: {
    paper: "#0c111a",
    surface: "#141b27",
    ink: "#ece5d5",
    muted: "#9ba2b2",
    accent: "#ef5a62",
    accent2: "#8eaaf0",
    rule: "#263044",
  },
  material: "linen",
  texture: "crosshatch",
  textureScale: 0.8,
  radius: 4,
  ruleStyle: "double",
  motion: "brisk",
  courier: "dot",
};

type Rgb = [number, number, number];
const hexToRgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

// WCAG 2 relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const [red, green, blue] = hexToRgb(hex).map(toLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

// OKLab (Björn Ottosson, 2020): lightness moves evenly to the eye, so a fix keeps the colour's character.
function toOklch(hex: string): Rgb {
  const [red, green, blue] = hexToRgb(hex).map(toLinear);
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  return [lightness, Math.hypot(a, b), Math.atan2(b, a)];
}
function oklchToLinear(lightness: number, chroma: number, hue: number): Rgb {
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}
const inGamut = (rgb: Rgb) => rgb.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);
// Out of the sRGB gamut, chroma gives way first so the hue holds.
function fromOklch(lightness: number, chroma: number, hue: number): string {
  let low = 0;
  let high = chroma;
  if (!inGamut(oklchToLinear(lightness, chroma, hue))) {
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if (inGamut(oklchToLinear(lightness, middle, hue))) low = middle;
      else high = middle;
    }
  } else low = chroma;
  const rgb = oklchToLinear(lightness, low, hue);
  return `#${rgb
    .map((channel) =>
      Math.round(fromLinear(Math.min(1, Math.max(0, channel))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// The foreground itself when it already reads on every background; otherwise the nearest colour of the same hue,
// walked in OKLCH lightness away from the backgrounds, that does.
export function fitContrast(
  foreground: string,
  backgrounds: string[],
  minimum = MIN_CONTRAST,
): string {
  const passes = (colour: string) =>
    backgrounds.every((background) => contrastRatio(colour, background) >= minimum);
  const start = foreground.toLowerCase();
  if (passes(start)) return start;
  const [lightness, chroma, hue] = toOklch(start);
  const meanLuminance =
    backgrounds.reduce((sum, background) => sum + luminance(background), 0) / backgrounds.length;
  // 0.179 is where black and white give the same contrast: above it darker text reads better.
  const target = meanLuminance > 0.179 ? 0 : 1;
  for (let step = 1; step <= 100; step++) {
    const candidate = fromOklch(lightness + ((target - lightness) * step) / 100, chroma, hue);
    if (passes(candidate)) return candidate;
  }
  return target === 0 ? "#000000" : "#ffffff";
}

// Every text colour of each mode (ink, muted, accent) against both of its backgrounds (paper, surface).
export function fitThemeTokens(tokens: ThemeTokens): { tokens: ThemeTokens; fixes: string[] } {
  const fixes: string[] = [];
  const fitPalette = (mode: "light" | "dark"): Palette => {
    const palette = { ...tokens[mode] };
    for (const key of ["ink", "muted", "accent"] as const) {
      const fitted = fitContrast(palette[key], [palette.paper, palette.surface]);
      if (fitted !== palette[key].toLowerCase())
        fixes.push(`${mode}.${key} ${palette[key]} -> ${fitted}`);
      palette[key] = fitted;
    }
    return palette;
  };
  return { tokens: { ...tokens, light: fitPalette("light"), dark: fitPalette("dark") }, fixes };
}

// Anything to tokens the desk can use: the default theme when it does not parse, fitted tokens when it does.
export function parseThemeTokens(raw: unknown): { tokens: ThemeTokens; fixes: string[] } {
  const parsed = ThemeTokensSchema.safeParse(raw);
  if (parsed.success) return fitThemeTokens(parsed.data);
  const issue = parsed.error.issues[0];
  return {
    tokens: DEFAULT_THEME_TOKENS,
    fixes: [`default theme: ${issue?.path.join(".") || "tokens"} ${issue?.message ?? "invalid"}`],
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `bun test worker/tokens.test.ts`
Expected: PASS, 19 pass, 0 fail.

- [ ] **Step 5: Run the gates**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add worker/tokens.ts worker/tokens.test.ts
git commit -m "Theme tokens: level B schema, default theme and an OKLCH fix to 4.5:1 contrast"
```

---

### Task 3: Pack schema additions

**Files:**
- Modify: `worker/pack.ts` (imports; icon lists and `lenient` after the `LEDGERS` list; `GlanceSchema` and `REFUSES_MONEY` before `FactionSchema`; new fields on `FactionSchema`, `HolderReadSchema`, the constitution ledgers, `MemberSchema`, `vocabulary` and `PackSchema`; two type exports after `export type Card`)
- Test: `worker/pack.test.ts` (extend)

**Interfaces:**
- Consumes: `EmblemSchema` (Task 1); `ThemeTokensSchema`, `TintSchema`, `DEFAULT_THEME_TOKENS` (Task 2).
- Produces: `LINE_ICONS`, `RESOURCE_ICONS`, `type LineIcon`, `type ResourceIcon`, `GlanceSchema`, `type Glance`, `REFUSES_MONEY`, and these optional fields on the parsed `Pack`:
  - `constitution.holders[i]`: `short?: string`, `icon?: LineIcon`, `glance?: Glance`, `emblem?: Emblem`, `tint?: Tint`
  - `factions[i]`: `glance?: Glance`, `emblem?: Emblem`, `tint?: Tint`
  - `members[i]`: `glance?: Glance`
  - `constitution.ledgers.{treasury,authority,chest}`: `icon?: ResourceIcon`, `for?: string`, `earn: string[]` (default `[]`), `spend: string[]` (default `[]`), `fails?: string`
  - `vocabulary.file?: string`, `vocabulary.abroad?: string`
  - `themeTokens?: ThemeTokens`

Every new field except the two ledger arrays goes through `lenient()`: a malformed value parses as `undefined`, so one bad card never fails a stored pack (`worker/db.ts` `parseRow` re-validates every pack on read). `GlanceSchema` itself stays strict (exactly one red line, 1 to 3 wants and hates) so that E's write check rejects bad model output and repairs it. The generator's strict `ConstitutionSchema` is untouched: all new holder fields sit on `HolderReadSchema`, and the ledger words on a new `ResourceNameSchema` used only by the read schema.

- [ ] **Step 1: Write the failing tests**

In `worker/pack.test.ts`, replace the import line

```ts
import { PackSchema, scaleSeats, packView, type Citizen } from "./pack";
```

with

```ts
import { GlanceSchema, PackSchema, scaleSeats, packView, type Citizen } from "./pack";
import { DEFAULT_THEME_TOKENS } from "./tokens";
```

and append to the end of the file:

```ts
// R36, emblems and level B themes: every new field is optional, and a malformed one drops alone.
const GLANCE = {
  wants: ["Toll relief"],
  hates: [{ tag: "Closing the reef", redLine: true }],
  strike: "Keeps its boats in port",
};
const EMBLEM = { size: 24, elements: [{ tag: "circle", cx: 12, cy: 12, r: 5, fill: "ink" }] };
const TINT = { light: "#2553a3", dark: "#7aa2ff" };
const dressed = (extra: Record<string, unknown>, tokens: unknown) => ({
  ...mini,
  citizens: makeCitizens(),
  themeTokens: tokens,
  factions: mini.factions.map((f) => ({ ...f, ...extra })),
  members: mini.members.map((m) => ({ ...m, glance: extra.glance })),
  constitution: {
    ...mini.constitution,
    holders: mini.constitution.holders.map((h) => ({ ...h, ...extra, icon: "court" })),
  },
});

test("glance cards, emblems, tints, icons and theme tokens survive a parse", () => {
  const parsed = PackSchema.parse(
    dressed({ glance: GLANCE, emblem: EMBLEM, tint: TINT }, DEFAULT_THEME_TOKENS),
  );
  const holder = parsed.constitution!.holders[0];
  expect([holder.glance, holder.emblem, holder.tint, holder.icon]).toEqual([
    GLANCE,
    EMBLEM,
    TINT,
    "court",
  ]);
  expect([parsed.factions[0].glance, parsed.members[0].glance]).toEqual([GLANCE, GLANCE]);
  expect(parsed.themeTokens).toEqual(DEFAULT_THEME_TOKENS);
});

test("a malformed glance, emblem, tint or theme drops to undefined and the pack still loads", () => {
  const bad = {
    glance: { ...GLANCE, hates: [{ tag: "Closing the reef", redLine: false }] }, // no red line
    emblem: { size: 24, elements: [{ tag: "script" }] },
    tint: { light: "red", dark: "#7aa2ff" },
  };
  const parsed = PackSchema.parse(dressed(bad, { ...DEFAULT_THEME_TOKENS, display: "Comic Sans" }));
  const holder = parsed.constitution!.holders[0];
  expect([holder.glance, holder.emblem, holder.tint]).toEqual([undefined, undefined, undefined]);
  expect([parsed.factions[0].glance, parsed.members[0].glance]).toEqual([undefined, undefined]);
  expect(parsed.themeTokens).toBeUndefined();
});

for (const [label, hates] of [
  ["no red line", [{ tag: "A", redLine: false }]],
  [
    "two red lines",
    [
      { tag: "A", redLine: true },
      { tag: "B", redLine: true },
    ],
  ],
  ["four hates", ["A", "B", "C", "D"].map((tag, i) => ({ tag, redLine: i === 0 }))],
] as [string, { tag: string; redLine: boolean }[]][]) {
  test(`a glance card with ${label} fails the write check`, () => {
    expect(GlanceSchema.safeParse({ ...GLANCE, hates }).success).toBe(false);
  });
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test worker/pack.test.ts`
Expected: FAIL: `GlanceSchema` is not exported, and the parsed holder has no `glance`.

- [ ] **Step 3: Apply the schema change**

Save this patch as `/tmp/stage0-pack.diff` and run `git apply /tmp/stage0-pack.diff` (if `main` moved since `2cb4830`, use `git apply --3way`). The patch is the whole change to `worker/pack.ts`:

```diff
diff --git a/worker/pack.ts b/worker/pack.ts
index e843d20..362d1a9 100644
--- a/worker/pack.ts
+++ b/worker/pack.ts
@@ -1,5 +1,7 @@
 import { z } from "zod";
+import { EmblemSchema } from "./emblem";
 import { TEMPERAMENTS } from "./engine";
+import { ThemeTokensSchema, TintSchema } from "./tokens";
 
 export const FONT_PAIRS = [
   "Big Shoulders Display + Public Sans",
@@ -103,7 +105,42 @@ const LEDGERS = [
   "turn",
 ] as const;
 
+// The desk's line icons: a group's rim-row disc when it has no emblem, or its emblem fails.
+export const LINE_ICONS = [
+  "chamber",
+  "court",
+  "army",
+  "clergy",
+  "street",
+  "party",
+  "patrons",
+  "press",
+  "foreign",
+  "market",
+  "crown",
+  "council",
+] as const;
+export const RESOURCE_ICONS = [
+  "bank",
+  "coins",
+  "note",
+  "gavel",
+  "medal",
+  "people",
+  "crown",
+  "scroll",
+  "flag",
+  "drop",
+  "grain",
+  "crate",
+  "house",
+  "sword",
+  "faith",
+] as const;
+
 const IdNum = z.object({ id: z.string(), value: z.number() });
+// A malformed value drops to undefined, so one bad card or emblem never fails a whole stored pack.
+const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);
 const LobbyText = z.object({ cost: z.number(), label: z.string(), text: z.string() });
 
 // R30: a faction card. yes and no are the acts a want backs and fights, in the player's words; `match` and
@@ -129,6 +166,27 @@ const CardSchema = z.object({
   rival: z.string(),
   tension: z.string(),
 });
+// R36: the glance card, about 20 words. wants and hates are short tags (1 to 4 words) that the file shows and the
+// engine matches: the clerk names the tags an act does, and a tag equal to one of the pack's own tags matches it
+// directly. Exactly one hate is the red line. strike is what the group does when it turns on the ruler.
+export const GlanceSchema = z
+  .object({
+    face: z.object({ name: z.string(), role: z.string() }).optional(),
+    wants: z.array(z.string().min(1).max(48)).min(1).max(3),
+    hates: z
+      .array(z.object({ tag: z.string().min(1).max(48), redLine: z.boolean() }))
+      .min(1)
+      .max(3),
+    strike: z.string(),
+  })
+  .refine(
+    (glance) => glance.hates.filter((hate) => hate.redLine).length === 1,
+    "exactly one hate is the red line",
+  );
+export type Glance = z.infer<typeof GlanceSchema>;
+// Lead's ruling on Negotiate: a group with a hate tag like this is never offered money for its votes.
+export const REFUSES_MONEY = /\b(bribes?|bribery|bought|paid off|cash for|money for)\b/i;
+
 const FactionSchema = z.object({
   id: z.string(),
   name: z.string(),
@@ -138,6 +196,9 @@ const FactionSchema = z.object({
   ideology: z.string(),
   leader: z.string(),
   card: CardSchema.optional(),
+  glance: lenient(GlanceSchema),
+  emblem: lenient(EmblemSchema),
+  tint: lenient(TintSchema),
 });
 const RegionSchema = z.object({
   id: z.string(),
@@ -190,8 +251,22 @@ const HolderSchema = z.object({
 const HolderReadSchema = HolderSchema.extend({
   support: z.number().min(0).max(100).optional(),
   card: CardSchema.optional(),
+  short: z.string().optional(), // the rim row's label when the name is long
+  icon: lenient(z.enum(LINE_ICONS)),
+  glance: lenient(GlanceSchema),
+  emblem: lenient(EmblemSchema),
+  tint: lenient(TintSchema),
 });
 const LedgerNameSchema = z.object({ name: z.string(), line: z.number() });
+// The resources sheet's words for treasury, authority and chest: what it is, what fills it, what drains it, and
+// the tail after "At 0".
+const ResourceNameSchema = LedgerNameSchema.extend({
+  icon: lenient(z.enum(RESOURCE_ICONS)),
+  for: z.string().optional(),
+  earn: z.array(z.string()).default([]),
+  spend: z.array(z.string()).default([]),
+  fails: z.string().optional(),
+});
 
 export const ConstitutionSchema = z.object({
   ruler: z.object({ role: z.string(), faction: z.string() }),
@@ -263,9 +338,9 @@ const PackConstitutionSchema = ConstitutionSchema.extend({
   publicGroup: z.string().optional(), // R24: the holder whose support by region was popularity
   ownGroup: z.string().optional(), // R24: the holder whose support was loyalty
   ledgers: z.object({
-    treasury: LedgerNameSchema,
-    authority: LedgerNameSchema,
-    chest: LedgerNameSchema,
+    treasury: ResourceNameSchema,
+    authority: ResourceNameSchema,
+    chest: ResourceNameSchema,
     loyalty: LedgerNameSchema.optional(),
     popularity: LedgerNameSchema.optional(),
   }),
@@ -298,6 +373,7 @@ const MemberSchema = z.object({
   // Optional: packs stored before names carried them are re-validated on read.
   gender: z.enum(GENDERS).optional(),
   look: z.string().optional(),
+  glance: lenient(GlanceSchema), // R36: members get the same card; the file shows it, the engine does not read it
 });
 const CitizenSchema = z.object({
   id: z.string(),
@@ -388,6 +464,8 @@ export const PackSchema = z
       promise: z.string(),
       patron: z.string(),
       approval: z.string(),
+      file: z.string().optional(), // the glance file's kicker: "Senate file", "Herald's roll"
+      abroad: z.string().optional(), // the right rim's words for abroad: "across the Narrow Sea"
     }),
     theme: z.object({
       fonts: z.enum(FONT_PAIRS),
@@ -444,6 +522,7 @@ export const PackSchema = z
     }),
     lobby: z.object({ pork: LobbyText, favor: LobbyText, threat: LobbyText }),
     constitution: PackConstitutionSchema.optional(),
+    themeTokens: lenient(ThemeTokensSchema), // level B; a pack without them shows DEFAULT_THEME_TOKENS
   })
   .refine((p) => p.members.length === p.chamber.size, "members must equal chamber.size")
   .refine((p) => p.starts.length === p.factions.length, "one start per faction")
@@ -467,6 +546,8 @@ export type Holder = z.infer<typeof HolderReadSchema>;
 export type Instrument = NonNullable<Pack["constitution"]>["instruments"]["law"]; // as the engine reads it: vetoes, not consent
 export type Price = z.infer<typeof PriceSchema>;
 export type Card = z.infer<typeof CardSchema>;
+export type LineIcon = (typeof LINE_ICONS)[number];
+export type ResourceIcon = (typeof RESOURCE_ICONS)[number];
 
 // Largest remainder method, minimum one seat per faction that held any share.
 export function scaleSeats(shares: Record<string, number>, size: number): Record<string, number> {
```

- [ ] **Step 4: Run them to see them pass**

Run: `bun test worker/pack.test.ts`
Expected: PASS, 0 fail (13 tests).

- [ ] **Step 5: Run the gates**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green. The existing suite still passes: no field that existed changed shape.

- [ ] **Step 6: Commit**

```bash
git add worker/pack.ts worker/pack.test.ts
git commit -m "Pack fields for R36 glance cards, emblems, tints, icons, resource words and theme tokens, all optional"
```

---

### Task 4: The engine reads R36 glance cards

**Files:**
- Modify: `worker/engine.ts` (`Bill.touches`, `Quote.touches`, `PriceTag.touches`; `tagKey`, `actTokens`, `glanceOf`, `glanceTags`, `glanceLean` replace `cardLean`; `cardShift` and `votePreview` read `glanceOf`; a passed law keeps promises by its touches)
- Modify: `worker/acts.ts` (`vetoRows`, `priceTag`, `touch` read `glanceOf`; `priceTag` stores keyed touches; `billOf` carries them; `commit` keeps promises by them; `termsOf` rewritten to R36)
- Modify: `worker/luna.ts` (`QuoteSchema.touches`; the price prompt's `touches` line; `glance_tags` in the user block; known-tag filter)
- Test: `worker/acts.test.ts`, `worker/game.test.ts`, `worker/luna.test.ts` (R30 card tests rewritten to R36, four tests added)

**Interfaces:**
- Consumes: `type Glance`, `type Card`, `REFUSES_MONEY` from `worker/pack.ts` (Task 3).
- Produces (in `worker/engine.ts`):
  - `tagKey(tag: string): string` (trim, lower case)
  - `glanceOf(entity: { glance?: Glance; card?: Card }): Glance | undefined`
  - `glanceTags(pack: Pack): string[]` (every holder's and faction's glance tag, keyed, unique)
  - `glanceLean(glance: Glance | undefined, tokens: Set<string>): Lean` (`cardLean` is removed)
  - `actTokens(a: { verb; tags; touches?; keeps?; serves?; hits? }): Set<string>`
  - `Quote.touches: string[]`, `PriceTag.touches?: string[]`, `Bill.touches?: string[]`
- Unchanged names with R36 behaviour: `cardShift`, `votePreview`, `CARD_MOVE`, `CARD_SHIFT` (engine); `termsOf`, `negotiate`, `priceTag`, `commit` (acts); `priceAct` (luna).

What changes in play: a group moves when the clerk says an act does one of its tags (red line -10, hate -5, want +4, as `CARD_MOVE`); a chamber faction's seats shift the same way (`CARD_SHIFT`); a veto holder refuses an act over its red line. Negotiate offers a pledge on the first want not yet promised, a post, and money unless a hate tag matches `REFUSES_MONEY`. The pledge's promise key is `tagKey(want)`, kept by a later act or law whose touches include it.

- [ ] **Step 1: Rewrite the tests**

Save this patch as `/tmp/stage0-engine-tests.diff` and run `git apply /tmp/stage0-engine-tests.diff`. It replaces the R30 card fixtures (`card`, `tideCard`) with glance cards, adds `touches` to the quote helper and to the stubbed Luna price answers, and adds four tests: the pre-R36 price tag, the pledge kept by a later decree, the money-refusal table (with "Late payments" still offered money) and the clerk's known-tag filter.

```diff
diff --git a/worker/acts.test.ts b/worker/acts.test.ts
index 9eab3e3..5b95867 100644
--- a/worker/acts.test.ts
+++ b/worker/acts.test.ts
@@ -16,6 +16,7 @@ import {
 import {
   applyVote,
   armyHolder,
+  authorPromise,
   CAMPAIGN_FROM,
   encodeCode,
   newGame,
@@ -25,7 +26,7 @@ import {
   type Game,
   type Quote,
 } from "./engine";
-import { PackSchema, type Citizen, type Pack } from "./pack";
+import { PackSchema, type Citizen, type Glance, type Pack } from "./pack";
 import mini from "./fixtures/mini.json";
 
 const REGIONS = mini.regions.map((r) => r.id);
@@ -74,6 +75,7 @@ export const quote = (over: Partial<Quote> = {}): Quote => ({
   keeps: [],
   targets: null,
   tags: ["tariffs"],
+  touches: [],
   regions: [],
   promises: [],
   sunset: null,
@@ -196,7 +198,17 @@ test("the tag prints each named holder's support and line", () => {
   expect(t.stances[1]).toEqual({ id: "league", name: "the Grain League", support: 43, line: 40 });
 });
 
-// R30: a card answers an act the clerk did not aim at its group: red line first, then each want in order.
+// R36: a glance card answers an act the clerk did not aim at its group: its red line, then a hate, then a want.
+const glance: Glance = {
+  face: { name: "Ada Voss", role: "League factor" },
+  wants: ["Grain tariff cut", "tariffs"],
+  hates: [
+    { tag: "Grain tariff raised", redLine: false },
+    { tag: "Troops on the quay", redLine: true },
+  ],
+  strike: "Hoards the grain",
+};
+// R30: a long card from before R36 reads as a glance card: each want's first act, and its red line.
 const card = {
   base: "Grain factors of the upper quay",
   redLine: "Troops on the quay",
@@ -214,59 +226,82 @@ const card = {
   rival: "street",
   tension: "Wants free trade, but hoards grain in a famine.",
 };
-const carded: Pack = {
+const withLeague = (league: { glance?: Glance; card?: typeof card }): Pack => ({
   ...pack,
   constitution: {
     ...pack.constitution!,
-    holders: pack.constitution!.holders.map((h) => (h.id === "league" ? { ...h, card } : h)),
+    holders: pack.constitution!.holders.map((h) => (h.id === "league" ? { ...h, ...league } : h)),
   },
-};
-for (const [over, move, reason] of [
-  [{ tags: ["tariffs"] }, 4, "Backs Cut the grain tariff"],
-  [{ tags: ["tariffs"], serves: ["street"] }, -5, "Fights Raise the grain tariff"], // the first want decides: its no before its yes
-  [{ verb: "force", tags: ["tariffs"] }, -10, "Red line: Troops on the quay"],
-  [{ tags: ["fish-quotas"] }, 0, undefined],
-  [{ tags: ["tariffs"], hits: ["league"] }, -SUPPORT_HIT, undefined], // named by the clerk: SUPPORT_HIT only
-] as [Partial<Quote>, number, string | undefined][]) {
-  test(`a carded group answers ${JSON.stringify(over)} by ${move}`, () => {
+});
+const carded = withLeague({ glance });
+for (const [label, over, move, reason, league] of [
+  ["a want", { touches: ["grain tariff cut"] }, 4, "Wants Grain tariff cut", carded],
+  ["a want that is a pack tag", { tags: ["tariffs"] }, 4, "Wants tariffs", carded],
+  [
+    "a hate over a want",
+    { touches: ["Grain tariff cut", "Grain tariff raised"] },
+    -5,
+    "Hates Grain tariff raised",
+    carded,
+  ],
+  [
+    "the red line over all",
+    { touches: ["grain tariff cut", "troops on the quay"] },
+    -10,
+    "Red line: Troops on the quay",
+    carded,
+  ],
+  ["nothing on its card", { tags: [], touches: ["harbour lights"] }, 0, undefined, carded],
+  [
+    "a clerk's hit",
+    { touches: ["grain tariff cut"], hits: ["league"] },
+    -SUPPORT_HIT,
+    undefined,
+    carded,
+  ],
+  [
+    "an R30 want",
+    { touches: ["cut the grain tariff"] },
+    4,
+    "Wants Cut the grain tariff",
+    withLeague({ card }),
+  ],
+  [
+    "an R30 red line",
+    { touches: ["troops on the quay"] },
+    -10,
+    "Red line: Troops on the quay",
+    withLeague({ card }),
+  ],
+] as [string, Partial<Quote>, number, string | undefined, Pack][]) {
+  test(`a carded group answers ${label} by ${move}`, () => {
     const g = game();
     g.holders.league.support = 50;
-    const tag = priceTag(carded, g, quote(over));
+    const tag = priceTag(league, g, quote(over));
     expect(tag.stances.find((s) => s.id === "league")?.reason).toBe(reason);
-    commit(carded, g, tag);
+    commit(league, g, tag);
     expect(g.holders.league.support).toBe(50 + move);
   });
 }
 
-// R30: a chamber faction's card shifts its seats' chances, and the preview buckets them from the same numbers.
+// R36: a chamber faction's glance card shifts its seats' chances, and the preview buckets them from the same numbers.
 const floor: Pack = {
   ...pack,
-  factions: pack.factions.map((f) =>
-    f.id === "tidebound"
-      ? {
-          ...f,
-          card: {
-            ...card,
-            redMatch: ["piracy"],
-            wants: [{ ...card.wants[0], match: { yes: ["tariffs"], no: ["fish-quotas"] } }],
-          },
-        }
-      : f,
-  ),
+  factions: pack.factions.map((f) => (f.id === "tidebound" ? { ...f, glance } : f)),
 };
-for (const [tags, bucket, reason] of [
-  [["harbor-tolls"], "hesitant", "Nothing in it decides them"], // 0.6
-  [["tariffs"], "for", "Backs Cut the grain tariff"], // 0.7
-  [["fish-quotas"], "hesitant", "Fights Raise the grain tariff"], // 0.5
-  [["piracy"], "against", "Red line: Troops on the quay"], // 0.3
+for (const [touches, bucket, reason] of [
+  [["harbour lights"], "hesitant", "Nothing in it decides them"], // 0.6
+  [["grain tariff cut"], "for", "Wants Grain tariff cut"], // 0.7
+  [["grain tariff raised"], "hesitant", "Hates Grain tariff raised"], // 0.5
+  [["troops on the quay"], "against", "Red line: Troops on the quay"], // 0.3
 ] as [string[], "for" | "against" | "hesitant", string][]) {
-  test(`a law on ${tags} puts the carded faction's seats ${bucket}`, () => {
+  test(`a law that does ${touches} puts the carded faction's seats ${bucket}`, () => {
     const g = game();
     for (const m of g.members) {
       m.mood = 0;
       m.loyalty = 100;
     }
-    const tag = priceTag(floor, g, quote({ verb: "law", tags }));
+    const tag = priceTag(floor, g, quote({ verb: "law", tags: ["harbor-tolls"], touches }));
     tag.count = { whip: Object.fromEntries(g.members.map((m) => [m.id, 0.6])) };
     const row = previewOf(floor, g, tag)!.factions.find((f) => f.id === "tidebound")!;
     expect(row[bucket]).toBe(6);
@@ -274,6 +309,23 @@ for (const [tags, bucket, reason] of [
   });
 }
 
+// R36: a Negotiate pledge is a promise keyed by the want; an act the clerk says does that want delivers it.
+test("a decree that does a pledged want keeps the pledge", () => {
+  const g = game();
+  authorPromise(g, "toll relief", "Toll relief", g.turn + 4);
+  g.promises["toll relief"].passed = 1; // as negotiate() leaves it
+  commit(pack, g, priceTag(pack, g, quote({ tags: [], touches: ["Toll relief"] })));
+  expect(g.promises["toll relief"].state).toBe("kept");
+});
+
+test("a price tag stored before R36 has no touches and still commits, as a law too", () => {
+  for (const verb of ["decree", "law"] as const) {
+    const g = game();
+    const { touches: _none, ...stored } = priceTag(carded, g, quote({ verb }));
+    expect(() => commit(carded, g, stored)).not.toThrow();
+  }
+});
+
 test("a veto group refuses an act over its red line whatever its support", () => {
   const g = game();
   g.holders.league.support = 90;
@@ -287,7 +339,7 @@ test("a veto group refuses an act over its red line whatever its support", () =>
       },
     },
   };
-  expect(priceTag(p, g, quote({ verb: "force" })).vetoes).toEqual([
+  expect(priceTag(p, g, quote({ verb: "force", touches: ["troops on the quay"] })).vetoes).toEqual([
     {
       id: "league",
       name: "the Grain League",
@@ -295,7 +347,7 @@ test("a veto group refuses an act over its red line whatever its support", () =>
       reason: "Red line: Troops on the quay",
     },
   ]);
-  expect(priceTag(p, g, quote({ verb: "force", tags: [] })).vetoes![0].agrees).toBe(false);
+  expect(priceTag(p, g, quote({ verb: "force" })).vetoes![0].agrees).toBe(true); // the act does not cross it
   expect(blocker(p, g, "force")).toBeUndefined(); // with no act in hand, only its support counts
 });
 
diff --git a/worker/game.test.ts b/worker/game.test.ts
index 3cf4524..a4dda18 100644
--- a/worker/game.test.ts
+++ b/worker/game.test.ts
@@ -12,7 +12,7 @@ import {
   SURVIVAL_BAR,
   type Game,
 } from "./engine";
-import { PackSchema, type Citizen, type Pack } from "./pack";
+import { PackSchema, type Citizen, type Glance, type Pack } from "./pack";
 import mini from "./fixtures/mini.json";
 
 const citizens = (): Citizen[] =>
@@ -315,6 +315,7 @@ test("a second request while one is in flight gets 409 one move at a time", asyn
 
 let refuse = false;
 let lawTag = false;
+let clerkTouches: string[] = [];
 let postTag = false;
 
 // Every model call goes out through one fetch: `systemone` is Jev, `chat/completions` is Luna, keyed by schema name.
@@ -337,6 +338,7 @@ const canned = (name: string, user: string): unknown => {
             keeps: [],
             targets: null,
             tags: [],
+            touches: [],
             regions: [],
             promises: [],
             sunset: null,
@@ -357,6 +359,7 @@ const canned = (name: string, user: string): unknown => {
             keeps: ["tariffs"],
             targets: postTag ? [pack.blocs[0].id] : null,
             tags: ["tariffs"],
+            touches: clerkTouches,
             regions: [],
             promises: [],
             sunset: null,
@@ -1010,30 +1013,19 @@ test("the preview follows a seat moved after pricing, so it still matches the vo
   expect((await post("bills/1/vote", { turn: 1 })).body.bills[0].yes).toBe(shown);
 });
 
-// R30: every seat at 0.5 hesitates; a term pays, spends one clerk unit and lifts the faction's seats over the for line.
-const tideCard = {
-  base: "Net-owners of the outer reefs",
-  redLine: "Closing the reef",
-  redMatch: [],
-  wants: [
-    {
-      want: "Toll relief",
-      yes: ["Cut the harbour tolls"],
-      no: ["Raise the harbour tolls"],
-      match: { yes: ["harbor-tolls"], no: [] },
-    },
-  ],
-  price: { takes: "a post", refuses: "nothing" },
-  face: { name: "Mira Salt", role: "Reef speaker", line: "Cut the tolls." },
-  rival: "harborites",
-  tension: "Wants low tolls, but needs the harbour dredged.",
+// R36: every seat at 0.5 hesitates; a term pays, spends one clerk unit and lifts the faction's seats over the for line.
+const tideGlance: Glance = {
+  face: { name: "Mira Salt", role: "Reef speaker" },
+  wants: ["Toll relief"],
+  hates: [{ tag: "Closing the reef", redLine: true }],
+  strike: "Keeps its boats in port",
 };
 for (const [term, paid] of [
   [
     "pledge",
     (g: Game) =>
-      g.promises["harbor-tolls"]?.state === "pending" &&
-      g.promises["harbor-tolls"].window === g.turn + 4,
+      g.promises["toll relief"]?.state === "pending" &&
+      g.promises["toll relief"].window === g.turn + 4,
   ],
   ["post", (g: Game) => g.inForce.some((l) => l.id === "appoint-tidebound")],
   ["money", (g: Game, chest: number) => g.ledgers.chest === chest - 12], // 2 a seat for 6 hesitant seats
@@ -1043,7 +1035,7 @@ for (const [term, paid] of [
     const { do_, game, post } = seatedGame(67);
     do_.pack = {
       ...pack,
-      factions: pack.factions.map((f) => (f.id === "tidebound" ? { ...f, card: tideCard } : f)),
+      factions: pack.factions.map((f) => (f.id === "tidebound" ? { ...f, glance: tideGlance } : f)),
     };
     for (const m of game.members) {
       m.mood = -0.4;
@@ -1070,15 +1062,12 @@ for (const [term, paid] of [
   });
 }
 
-const priceHesitant = async (
-  card: typeof tideCard,
-  text = "Raise the harbour levy on the wharf.",
-) => {
+const priceHesitant = async (glance: Glance, text = "Raise the harbour levy on the wharf.") => {
   stubModels(0.9);
   const { do_, game, post } = seatedGame(67);
   do_.pack = {
     ...pack,
-    factions: pack.factions.map((f) => (f.id === "tidebound" ? { ...f, card } : f)),
+    factions: pack.factions.map((f) => (f.id === "tidebound" ? { ...f, glance } : f)),
   };
   for (const m of game.members) {
     m.mood = -0.4;
@@ -1093,7 +1082,7 @@ const priceHesitant = async (
 };
 
 test("a term taken on this turn's law survives re-pricing it: charged once, the lift kept", async () => {
-  const { game, post } = await priceHesitant(tideCard);
+  const { game, post } = await priceHesitant(tideGlance);
   const chest = game.ledgers.chest;
   expect(
     (await post("acts/negotiate", { turn: 1, faction: "tidebound", term: "money" })).status,
@@ -1111,11 +1100,11 @@ test("a term taken on this turn's law survives re-pricing it: charged once, the
 });
 
 test("a pledge taken on a law is not kept by that same law passing", async () => {
-  const { game, post } = await priceHesitant(tideCard);
+  const { game, post } = await priceHesitant(tideGlance);
   expect(
     (await post("acts/negotiate", { turn: 1, faction: "tidebound", term: "pledge" })).status,
   ).toBe(200);
-  game.tag!.tags.push("harbor-tolls"); // the law on the floor carries the pledged subject
+  game.tag!.touches = ["toll relief"]; // the law on the floor does the pledged want
   for (const m of game.members) m.mood = 1;
   await post("acts", { turn: 1 });
   game.bills[0].constitutional = 0; // the stub's 0.9 would strike it, and a struck law keeps nothing anyway
@@ -1123,11 +1112,11 @@ test("a pledge taken on a law is not kept by that same law passing", async () =>
     passed: true,
     struck: false,
   });
-  expect(game.promises["harbor-tolls"].state).toBe("pending");
+  expect(game.promises["toll relief"].state).toBe("pending");
 });
 
 test("a post is not offered while the appointment's veto holder refuses", async () => {
-  const { do_, game, post } = await priceHesitant(tideCard);
+  const { do_, game, post } = await priceHesitant(tideGlance);
   const c = do_.pack.constitution;
   do_.pack = {
     ...do_.pack,
@@ -1142,12 +1131,28 @@ test("a post is not offered while the appointment's veto holder refuses", async
   ).toBe(409);
 });
 
-test("a faction whose card refuses payment is never offered money", async () => {
-  const { row } = await priceHesitant({
-    ...tideCard,
-    price: { takes: "a post", refuses: "Payment of any kind" },
+for (const [hate, offered] of [
+  ["Bribes", false],
+  ["Cash for votes", false],
+  ["Being bought", false],
+  ["Late payments", true], // hating late payments is not refusing money
+] as [string, boolean][]) {
+  test(`a faction that hates ${hate} is ${offered ? "" : "never "}offered money`, async () => {
+    const { row } = await priceHesitant({
+      ...tideGlance,
+      hates: [{ tag: hate, redLine: false }, ...tideGlance.hates],
+    });
+    expect(row.terms.map((t: { kind: string }) => t.kind)).toEqual(
+      offered ? ["pledge", "post", "money"] : ["pledge", "post"],
+    );
   });
-  expect(row.terms.map((t: { kind: string }) => t.kind)).toEqual(["pledge", "post"]);
+}
+
+test("the clerk's touches keep only this world's glance tags, as keys", async () => {
+  clerkTouches = ["Toll relief", "A tag no card has"];
+  const { game } = await priceHesitant(tideGlance);
+  clerkTouches = [];
+  expect(game.tag!.touches).toEqual(["toll relief"]);
 });
 
 test("a favour names a seat, and a body that names none is a 400", async () => {
diff --git a/worker/luna.test.ts b/worker/luna.test.ts
index 7d7ae25..ad2e199 100644
--- a/worker/luna.test.ts
+++ b/worker/luna.test.ts
@@ -55,6 +55,7 @@ const ANSWER = {
   keeps: ["tariffs", "not-a-tag"],
   targets: null,
   tags: ["tariffs", "not-a-tag"],
+  touches: ["Not a glance tag"],
   regions: [REGIONS[0], "nowhere"],
   promises: [{ tag: "new-quay", label: "A new quay before winter", window: 8 }],
   sunset: null,
@@ -83,6 +84,7 @@ test("the act is priced, the ids are filtered and the player's words stay out of
   expect(q.hits).toEqual(["league"]); // "ghost" is not a holder
   expect(q.keeps).toEqual(["tariffs"]); // "not-a-tag" is not a promise tag
   expect(q.tags).toEqual(["tariffs"]);
+  expect(q.touches).toEqual([]); // mini.json has no glance cards, so no tag is known
   expect(q.regions).toEqual([REGIONS[0]]); // "nowhere" is not a region
   expect(q.revenue).toEqual([{ ledger: "treasury", id: null, delta: 6 }]);
   expect(q.promises[0]).toEqual({ tag: "new-quay", label: "A new quay before winter", window: 8 });
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test worker/acts.test.ts worker/game.test.ts worker/luna.test.ts`
Expected: FAIL, 19 fail and 85 pass: the glance-card, Negotiate, pledge and touches tests fail because the engine still reads R30 `card` and never sets `touches`.

- [ ] **Step 3: Apply the engine change**

Save this patch as `/tmp/stage0-engine.diff` and run `git apply /tmp/stage0-engine.diff`:

```diff
diff --git a/worker/acts.ts b/worker/acts.ts
index 44673b0..ece39d8 100644
--- a/worker/acts.ts
+++ b/worker/acts.ts
@@ -3,8 +3,10 @@ import {
   agrees,
   armyHolder,
   CARD_MOVE,
-  cardLean,
   cardShift,
+  glanceLean,
+  glanceOf,
+  tagKey,
   votePreview,
   authorPromise,
   belowLine,
@@ -37,7 +39,7 @@ import {
   type Veto,
   type WireLine,
 } from "./engine";
-import type { Instrument, Pack, Price, Verb } from "./pack";
+import { REFUSES_MONEY, type Instrument, type Pack, type Price, type Verb } from "./pack";
 
 export const CAMPAIGN_DISCOUNT = 0.25; // TUNE, C4
 
@@ -86,7 +88,7 @@ export function vetoRows(pack: Pack, game: Game, verb: Verb, tokens?: Set<string
     const holder = holdersOf(pack).find((candidate) => candidate.id === veto);
     const state = game.holders[veto];
     if (!holder || !state) return [];
-    const redLine = tokens ? cardLean(holder.card, tokens) : null;
+    const redLine = tokens ? glanceLean(glanceOf(holder), tokens) : null;
     if (redLine?.lean === -2)
       return [{ id: veto, name: holder.name, agrees: false, reason: redLine.reason }];
     const reason = `support ${Math.round(state.support)}, its line ${state.line}`;
@@ -145,7 +147,9 @@ export function priceTag(pack: Pack, game: Game, q: Quote, member: string | null
     .flatMap((holder) => {
       const state = game.holders[holder.id];
       const named = q.serves.includes(holder.id) || q.hits.includes(holder.id);
-      const { lean, reason } = named ? { lean: 0, reason: "" } : cardLean(holder.card, tokens);
+      const { lean, reason } = named
+        ? { lean: 0, reason: "" }
+        : glanceLean(glanceOf(holder), tokens);
       if (!state || (!named && !lean)) return [];
       const row = { id: holder.id, name: holder.name, support: state.support, line: state.line };
       return [reason ? { ...row, reason } : row];
@@ -165,6 +169,7 @@ export function priceTag(pack: Pack, game: Game, q: Quote, member: string | null
     keeps: q.keeps,
     targets: q.targets,
     tags: q.tags,
+    touches: q.touches.map(tagKey),
     regions: q.regions,
     member,
     promises: q.promises,
@@ -201,7 +206,7 @@ function touch(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
   const tokens = actTokens(tag);
   for (const holder of holdersOf(pack)) {
     if (tag.serves.includes(holder.id) || tag.hits.includes(holder.id)) continue;
-    const { lean, reason } = cardLean(holder.card, tokens);
+    const { lean, reason } = glanceLean(glanceOf(holder), tokens);
     if (lean)
       wire.push(
         ...moveSupport(pack, game, [holder.id], CARD_MOVE[lean], `${tag.title}: ${reason}`),
@@ -326,6 +331,7 @@ export const billOf = (game: Game, tag: PriceTag): Bill => ({
   offers: {},
   rates: tag.revenue,
   keeps: tag.keeps,
+  touches: tag.touches ?? [],
   sunset: tag.sunset,
   ...tag.count,
   ...(tag.shift ? { shift: { ...tag.shift } } : {}),
@@ -349,38 +355,33 @@ export const NEGOTIATE_LIFT = 0.34; // TUNE: lifts a hesitant seat (under 2/3) o
 export const PLEDGE_DUE = 4; // TUNE, the mock's: turns to deliver what was pledged
 export const SEAT_PRICE = 2; // TUNE, the mock's: chest per hesitant seat
 
-// R30: a pledge to the first thing its card backs that no promise holds yet, a post, or money for its hesitant seats.
+// R36: a pledge to the group's first want that no promise holds yet, a post, or money unless a hate refuses it.
 export function termsOf(pack: Pack, game: Game, factionId: string, hesitant: number): Term[] {
   const faction = pack.factions.find((candidate) => candidate.id === factionId);
   if (!faction) return [];
+  const glance = glanceOf(faction);
   const free: Price = { authority: 0, treasury: 0, chest: 0 };
   const terms: Term[] = [];
-  for (const want of faction.card?.wants ?? []) {
-    const subject = want.match.yes.find(
-      (cardTag) => pack.tags.includes(cardTag) && !game.promises[cardTag],
-    );
-    if (!subject) continue;
+  const want = glance?.wants.find((tag) => !game.promises[tagKey(tag)]);
+  if (want)
     terms.push({
       kind: "pledge",
-      label: want.yes[0] ?? want.want,
+      label: want,
       cost: free,
-      tag: subject,
+      tag: tagKey(want),
       due: game.turn + PLEDGE_DUE,
     });
-    break;
-  }
   // A post is an appointment: offered only where the ruler could appoint now, vetoes and all.
   const appoint = instrumentOf(pack, "appoint");
   if (appoint && available(pack, game, "appoint") && !blocker(pack, game, "appoint")) {
     terms.push({
       kind: "post",
-      label: `A post for ${faction.card?.face.name ?? faction.leader}`,
+      label: `A post for ${glance?.face?.name ?? faction.leader}`,
       cost: appoint.price,
     });
   }
   const money = SEAT_PRICE * hesitant;
-  // Lead's ruling: a faction whose card refuses money or payment is never offered it.
-  if (!/\b(money|pay|paid)/i.test(faction.card?.price.refuses ?? "")) {
+  if (!glance?.hates.some((hate) => REFUSES_MONEY.test(hate.tag))) {
     terms.push({
       kind: "money",
       label: `${money} from the chest`,
@@ -465,7 +466,7 @@ export function commit(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
         sunset: tag.sunset,
       });
     }
-    for (const t of tag.keeps) keepPromise(pack, game, t);
+    for (const t of [...tag.keeps, ...(tag.touches ?? [])]) keepPromise(pack, game, t);
   }
   for (const p of tag.promises) authorPromise(game, p.tag, p.label, game.turn + p.window);
   game.acts.push({
diff --git a/worker/engine.ts b/worker/engine.ts
index de5f119..54c419d 100644
--- a/worker/engine.ts
+++ b/worker/engine.ts
@@ -1,5 +1,6 @@
 import type {
   Card,
+  Glance,
   Holder,
   HolderResponse,
   LedgerV4,
@@ -62,6 +63,7 @@ export interface Bill extends BillDraft {
   keeps?: string[];
   sunset?: number | null; // the price tag's, applied on a pass
   shift?: Record<string, number>; // R30: per chamber faction, added to each seat's chance: its card, then negotiated terms
+  touches?: string[]; // R36: the glance tags the priced act does, which keep a pledge when the law passes
 }
 export type WhipCount = Pick<
   Bill,
@@ -139,6 +141,7 @@ export interface Quote {
   keeps: string[];
   targets: string[] | null;
   tags: string[]; // the pack's own topic tags, which the law verb puts on the bill
+  touches: string[]; // R36: the glance tags this act does, as tagKey keys
   regions: string[]; // the regions the act touches, which spend and force read
   promises: { tag: string; label: string; window: number }[];
   sunset: number | null;
@@ -160,6 +163,7 @@ export interface PriceTag {
   keeps: string[];
   targets: string[] | null;
   tags: string[];
+  touches?: string[]; // R36; a tag priced before R36 has none
   regions: string[];
   member: string | null; // the seat a favour is aimed at; code picks it from the body, never Luna
   promises: { tag: string; label: string; window: number }[];
@@ -803,35 +807,65 @@ export const armyHolder = (pack: Pack): Holder | null =>
 export const agrees = (game: Game, id: string): boolean =>
   !game.holders[id] || game.holders[id].support >= game.holders[id].line;
 
-// R30: an act's machine tags as a card reads them: its subjects, the promises it keeps, whom it serves and hits, its verb.
+// R36: a glance tag as the engine compares it; the clerk's touches and a pledge's promise use the same key.
+export const tagKey = (tag: string): string => tag.trim().toLowerCase();
+
+// R30 and R36: an act's machine tags as a card reads them: its subjects, the glance tags it does, the promises it
+// keeps, whom it serves and hits, its verb.
 export const actTokens = (a: {
   verb: Verb;
   tags: string[];
+  touches?: string[];
   keeps?: string[];
   serves?: string[];
   hits?: string[];
 }): Set<string> =>
   new Set([
-    ...a.tags,
+    ...a.tags.map(tagKey),
+    ...(a.touches ?? []).map(tagKey),
     ...(a.keeps ?? []),
     ...(a.serves ?? []).map((id) => `serves:${id}`),
     ...(a.hits ?? []).map((id) => `hits:${id}`),
     `verb:${a.verb}`,
   ]);
 
+// R36, with the R30 fallback: a card from before R36 reads as a glance card, each want's first act as its tag.
+export function glanceOf(entity: { glance?: Glance; card?: Card }): Glance | undefined {
+  if (entity.glance) return entity.glance;
+  const card = entity.card;
+  if (!card) return undefined;
+  const hates = card.wants.flatMap((want) => want.no.slice(0, 1)).slice(0, 2);
+  return {
+    face: { name: card.face.name, role: card.face.role },
+    wants: card.wants.map((want) => want.yes[0] ?? want.want).slice(0, 3),
+    hates: [...hates.map((tag) => ({ tag, redLine: false })), { tag: card.redLine, redLine: true }],
+    strike: "",
+  };
+}
+
+// Every glance tag in the world, as keys: the list the clerk picks an act's touches from.
+export function glanceTags(pack: Pack): string[] {
+  const glances = [...holdersOf(pack), ...pack.factions].map(glanceOf);
+  const tags = glances.flatMap((glance) =>
+    glance ? [...glance.wants, ...glance.hates.map((hate) => hate.tag)] : [],
+  );
+  return [...new Set(tags.map(tagKey))];
+}
+
 export interface Lean {
   lean: -2 | -1 | 0 | 1;
   reason: string;
 }
-// The red line first, then each want in order; the first the act touches decides and gives the reason.
-export function cardLean(card: Card | undefined, tokens: Set<string>): Lean {
-  const touches = (cardTags: string[]) => cardTags.some((cardTag) => tokens.has(cardTag));
-  if (!card) return { lean: 0, reason: "" };
-  if (touches(card.redMatch)) return { lean: -2, reason: `Red line: ${card.redLine}` };
-  for (const want of card.wants) {
-    if (touches(want.match.no)) return { lean: -1, reason: `Fights ${want.no[0] ?? want.want}` };
-    if (touches(want.match.yes)) return { lean: 1, reason: `Backs ${want.yes[0] ?? want.want}` };
-  }
+// R36: the red line first, then any other hate, then a want; the first the act touches decides and gives the reason.
+export function glanceLean(glance: Glance | undefined, tokens: Set<string>): Lean {
+  if (!glance) return { lean: 0, reason: "" };
+  const touched = (tag: string) => tokens.has(tagKey(tag));
+  const red = glance.hates.find((hate) => hate.redLine && touched(hate.tag));
+  if (red) return { lean: -2, reason: `Red line: ${red.tag}` };
+  const hate = glance.hates.find((candidate) => touched(candidate.tag));
+  if (hate) return { lean: -1, reason: `Hates ${hate.tag}` };
+  const want = glance.wants.find(touched);
+  if (want) return { lean: 1, reason: `Wants ${want}` };
   return { lean: 0, reason: "" };
 }
 export const CARD_MOVE: Record<Lean["lean"], number> = { 1: 4, 0: 0, [-1]: -5, [-2]: -10 }; // TUNE, the mock's numbers
@@ -1222,7 +1256,7 @@ export const CARD_SHIFT: Record<Lean["lean"], number> = { 1: 0.1, 0: 0, [-1]: -0
 export function cardShift(pack: Pack, tokens: Set<string>): Record<string, number> {
   const shift: Record<string, number> = {};
   for (const faction of pack.factions) {
-    const { lean } = cardLean(faction.card, tokens);
+    const { lean } = glanceLean(glanceOf(faction), tokens);
     if (lean) shift[faction.id] = CARD_SHIFT[lean];
   }
   return shift;
@@ -1271,7 +1305,7 @@ export function votePreview(
     const inFavour = chances.filter((chance) => chance >= FOR_AT).length;
     const against = chances.filter((chance) => chance <= AGAINST_AT).length;
     const average = mean(chances);
-    let reason = cardLean(faction.card, tokens).reason;
+    let reason = glanceLean(glanceOf(faction), tokens).reason;
     if (!reason && average >= FOR_AT) reason = "Votes with you on this";
     else if (!reason && average <= AGAINST_AT) reason = "Votes against you on this";
     else if (!reason) reason = "Nothing in it decides them";
@@ -1352,7 +1386,8 @@ export function applyVote(pack: Pack, game: Game, bill: Bill): void {
   );
 
   if (passed && !struck) {
-    for (const t of new Set([...bill.tags, ...(bill.keeps ?? [])])) keepPromise(pack, game, t);
+    for (const t of new Set([...bill.tags, ...(bill.keeps ?? []), ...(bill.touches ?? [])]))
+      keepPromise(pack, game, t);
     if (bill.rates?.length)
       enact(game, {
         id: `law-${game.term}-${bill.id}`,
diff --git a/worker/luna.ts b/worker/luna.ts
index c0966c5..3b64799 100644
--- a/worker/luna.ts
+++ b/worker/luna.ts
@@ -4,9 +4,11 @@ import {
   clamp,
   CRED_HI,
   CRED_LO,
+  glanceTags,
   holdersOf,
   PROMISE_WINDOW,
   record,
+  tagKey,
   type Bill,
   type BillDraft,
   type Event,
@@ -104,6 +106,7 @@ const QuoteSchema = z.object({
   keeps: z.array(z.string()),
   targets: z.array(z.string()).nullable(),
   tags: z.array(z.string()),
+  touches: z.array(z.string()),
   regions: z.array(z.string()),
   promises: z.array(z.object({ tag: z.string(), label: z.string(), window: z.number() })),
   sunset: z.number().nullable(),
@@ -126,6 +129,7 @@ Return one object:
 - serves: the ids of the power holders this act gives something to. hits: the ids it takes something from. Use only the ids in holders.
 - keeps: the promise tags this act delivers, from promise_tags. Empty when it delivers none.
 - tags: 1 to 4 subjects this act materially touches, from tags. These are what the ${pack.vocabulary.chamber} files it under.
+- touches: the tags from glance_tags that this act does, as written: a want it delivers, or a hated thing it commits. A tag the act opposes, undoes or only mentions is not touched. Empty when it does none.
 - regions: the ids of the regions the act touches, from regions. Empty when it touches the whole polity.
 - targets: for a proclaim, the ids of the groups it speaks to, from groups. null for every other verb.
 - promises: any new commitment the ruler makes in their own words, at most two. tag is a short lower case id with hyphens, label is the promise in at most 8 words, window is the number of ${pack.vocabulary.turn}s they gave themselves, or 12 when they named none. Empty when they promised nothing new.
@@ -156,6 +160,7 @@ export async function priceAct(
     })),
     ledgers: c?.ledgers ?? {},
     promise_tags: pack.promises.map((p) => p.tag),
+    glance_tags: glanceTags(pack),
     groups: pack.blocs.map((b) => ({ id: b.id, name: b.name })),
     regions: pack.regions.map((r) => ({ id: r.id, name: r.name })),
     record: record(pack, game),
@@ -164,6 +169,7 @@ export async function priceAct(
 
   const ids = new Set(holdersOf(pack).map((h) => h.id));
   const tags = new Set(pack.promises.map((p) => p.tag));
+  const glance = new Set(glanceTags(pack));
   const blocs = new Set(pack.blocs.map((b) => b.id));
   const regions = new Set(pack.regions.map((r) => r.id));
   const money = (x: number) => Math.max(0, Math.round(x));
@@ -194,6 +200,7 @@ export async function priceAct(
     keeps: [...new Set(q.keeps)].filter((t) => tags.has(t)),
     targets: q.targets === null ? null : [...new Set(q.targets)].filter((b) => blocs.has(b)),
     tags: [...new Set(q.tags)].filter((t) => pack.tags.includes(t)).slice(0, 4),
+    touches: [...new Set(q.touches.map(tagKey))].filter((t) => glance.has(t)).slice(0, 6),
     regions: [...new Set(q.regions)].filter((r) => regions.has(r)),
     promises: q.promises.slice(0, 2).map((p) => ({
       tag: clip(p.tag, 40)
```

- [ ] **Step 4: Run them to see them pass**

Run: `bun test worker/acts.test.ts worker/game.test.ts worker/luna.test.ts`
Expected: PASS, 0 fail.

- [ ] **Step 5: Run the gates**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green. `grep -rn "cardLean" worker src scripts` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add worker/engine.ts worker/acts.ts worker/luna.ts worker/acts.test.ts worker/game.test.ts worker/luna.test.ts
git commit -m "Engine reads R36 glance cards: the clerk names the tags an act does, Negotiate pledges a want"
```

---

### Task 5: The desk's view contract

**Files:**
- Create: `worker/desk.ts`

**Interfaces:**
- Consumes: `FactionCount`, `Resource`, `Veto` (engine); `Emblem` (Task 1); `ThemeTokens`, `Tint` (Task 2); `Glance`, `LineIcon`, `ResourceIcon`, `Verb` (Task 3).
- Produces: `RimRow`, `ChamberFaction`, `ResourceCard`, `FinalVote`, `ReceiptLine`, `Receipt`, `Count`, `Verdict`, `ReviewLine`, `DeskView`.

Types only, so there is no test to write: `bunx tsc -b` is the check (the file is inside `tsconfig.worker.json`, and `src` reaches it through imports once D uses it). It extends the current view, it does not replace it: `view()` keeps every field it sends today, and D adds one field, `desk: DeskView`, built by a `deskView(pack, game)` that D writes in this file. Each field maps to a part of the approved mock: `RimRow` to `.hm` and `P.rowPaint`, `glance` to `fileHTML`, `ResourceCard` to `rkHTML`, `Receipt.now/pass/fail` to `P.items('now'|'pass'|'fail')`, `Count` to `P.lines().fac` and the `.gleg` legend, `Verdict.order` to `P.count`, `ReviewLine` to `review()`.

- [ ] **Step 1: Write the module**

Create `worker/desk.ts`:

```ts
// The desk's view contract: what the worker sends the React desk (docs/mocks/v4/feel/desk.html) on every read of a
// game. Types only. Track D writes deskView(pack, game): DeskView in this file and adds `desk` to game.ts view();
// the client reads these fields and never derives a number the engine owns.
import type { FactionCount, Resource, Veto } from "./engine";
import type { Emblem } from "./emblem";
import type { Glance, LineIcon, ResourceIcon, Verb } from "./pack";
import type { ThemeTokens, Tint } from "./tokens";

/** One group on a rim: home groups on the left, abroad on the right, in pack order. */
export interface RimRow {
  id: string;
  name: string; // the pack's short name where it has one
  where: "home" | "abroad";
  support: number; // 0 to 100
  line: number; // under it the group warns, and strikes two turns later
  margin: number; // support minus line: under 0 the row warns
  strikesOn: number | null; // the turn its warning fires, while it is under its line
  votes: number; // its share of the final vote, 0 to 100; 0 means it cannot vote on you
  tint: Tint;
  icon: LineIcon; // always set: the disc shows it when emblem is null or fails checkEmblem
  emblem: Emblem | null;
  glance: Glance | null; // null: the file shows the support block and no tags
}

/** A chamber faction: its seats in the hemicycle and its entry in the legend. */
export interface ChamberFaction {
  id: string;
  name: string;
  short: string;
  seats: number;
  tint: Tint;
  emblem: Emblem | null;
  glance: Glance | null;
}

/** One stat card of the resources sheet, and the top bar's figure. */
export interface ResourceCard {
  key: Resource;
  name: string;
  value: number;
  icon: ResourceIcon;
  about: string | null; // the pack's `for`: what this resource is in this world
  earn: string[];
  spend: string[];
  fails: string | null; // the tail after "At 0"
  history: number[]; // the last seven turns' closing values, oldest first; the last is `value`
}

/** The top bar's final vote: the weighted support of the voting groups against the bar. */
export interface FinalVote {
  value: number; // 0 to 100
  need: number;
}

/** One line of the receipt, and one courier when it lands. */
export interface ReceiptLine {
  target: "resource" | "group" | "finalVote";
  id: string; // a Resource, a holder id, or "finalVote"
  name: string;
  delta: number;
  why: string;
}

/** The priced act: what signing spends now, what lands if it passes, what a defeat costs. */
export interface Receipt {
  verb: Verb;
  instrument: string; // the pack's name for the verb
  title: string;
  reading: string;
  now: ReceiptLine[];
  pass: ReceiptLine[];
  fail: ReceiptLine[]; // empty for an act with no vote
  vetoes: Veto[];
  blocked: Veto | null; // the first veto that refuses: the act can be priced but not signed
  count: Count | null; // a law only
}

/** The count before the vote: each faction's for, against and hesitant seats, with its reason and terms. */
export interface Count {
  label: string; // the chamber's name
  need: number;
  expected: number;
  tie: string | null; // who breaks a tie in the ruler's favour
  factions: (FactionCount & { hesitantNames: string[] })[]; // FactionCount carries terms
}

/** The vote as the desk plays it, seat by seat, and its result. */
export interface Verdict {
  passed: boolean;
  yes: number;
  no: number;
  need: number;
  tieBrokenBy: string | null;
  vetoedBy: string | null;
  // Seats in calling order: sure votes first, then each hesitant seat by name.
  order: { member: string; faction: string; yes: boolean; hesitant: boolean }[];
}

/** One row of the review that stays until "Back to the desk". */
export interface ReviewLine extends ReceiptLine {
  from: number;
  to: number;
}

export interface DeskView {
  theme: ThemeTokens; // fitted, or DEFAULT_THEME_TOKENS for a pack without them
  vocabulary: { file: string; abroad: string; turn: string; pass: string; fail: string };
  rim: RimRow[];
  factions: ChamberFaction[];
  resources: ResourceCard[];
  finalVote: FinalVote;
  receipt: Receipt | null;
  verdict: Verdict | null;
  review: ReviewLine[] | null;
}
```

- [ ] **Step 2: Run the gates**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green, tsc prints nothing.

- [ ] **Step 3: Commit**

```bash
git add worker/desk.ts
git commit -m "Desk view contract: the types the React desk reads"
```

---

### Task 6: Fixture packs from the mock's two worlds

**Files:**
- Create: `scripts/era-fixture.ts`
- Create (generated, committed): `worker/fixtures/biden-2021.json`, `worker/fixtures/westeros.json`
- Generated, not committed: `.wrangler/fixtures.sql` (`.wrangler/` is in `.gitignore`)
- Test: `worker/pack.test.ts` (extend)

**Interfaces:**
- Consumes: `sanitizeEmblem` (Task 1), `parseThemeTokens` (Task 2), `PackSchema`, `FILLS`, `VERBS`, `type Glance` (Task 3), `glanceLean` through `priceTag` and `commit` (Task 4).
- Produces: two engine v2 packs with every Stage 0 field filled (glance cards on 9 holders and every chamber faction, tints, icons, 9 of 9 holder emblems in each world, fitted theme tokens, resource words, `vocabulary.file` and, for Westeros, `vocabulary.abroad`), seedable into local D1 as scenarios `biden-2021` and `westeros`.

The glance words, group tints and the Westeros "voices at court" chamber are copied from `desk.html`'s `G2`, `GC` and `SC` tables (the era files do not carry them). The Biden independents have no card in the mock, so the script writes one, and they have no emblem: that row tests the line-icon fallback. `docs/mocks/v4` is not in git; in a worktree, pass the main checkout's path.

- [ ] **Step 1: Write the failing test**

In `worker/pack.test.ts`, replace

```ts
import { DEFAULT_THEME_TOKENS } from "./tokens";
```

with

```ts
import { DEFAULT_THEME_TOKENS, fitThemeTokens } from "./tokens";
import { CARD_MOVE, encodeCode, newGame, scenarioTag, type Quote } from "./engine";
import { commit, priceTag } from "./acts";
```

and append to the end of the file:

```ts
// The desk mock's two worlds as engine v2 packs (scripts/era-fixture.ts): Track D builds against these.
const decree = (touches: string[]): Quote => ({
  verb: "decree",
  title: "An order",
  reading: "You sign an order.",
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
for (const [file, ruler, touch, group] of [
  ["biden-2021", "dem", "relief checks", "public"],
  ["westeros", "baratheon", "safe roads", "smallfolk"],
] as const) {
  test(`the ${file} fixture has a glance card, tint and icon on every group, and its groups answer an act`, async () => {
    const pack = PackSchema.parse(
      await Bun.file(`${import.meta.dir}/fixtures/${file}.json`).json(),
    );
    for (const holder of pack.constitution!.holders) {
      expect(holder.glance?.hates.filter((hate) => hate.redLine)).toHaveLength(1);
      expect([holder.tint, holder.icon].every(Boolean)).toBe(true);
    }
    for (const faction of pack.factions) expect(faction.glance).toBeDefined();
    expect(fitThemeTokens(pack.themeTokens!).fixes).toEqual([]);
    const code = encodeCode({
      scenario: scenarioTag(pack.id),
      faction: pack.factions.findIndex((faction) => faction.id === ruler),
      promises: [0, 1, 2],
      seed: 7,
    });
    const promises = pack.promises.slice(0, 3).map((promise) => promise.tag);
    const game = newGame("g", code, pack, ruler, promises, pack.calendar);
    const before = game.holders[group].support;
    commit(pack, game, priceTag(pack, game, decree([touch])));
    expect(game.holders[group].support).toBe(before + CARD_MOVE[1]);
  });
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test worker/pack.test.ts`
Expected: FAIL, `ENOENT` for `worker/fixtures/biden-2021.json`.

- [ ] **Step 3: Write the converter**

Create `scripts/era-fixture.ts`:

```ts
// bun scripts/era-fixture.ts [mockDir] — turns the approved desk mock's two worlds (docs/mocks/v4/eras/*.json and
// their lab emblems) into engine v2 packs in worker/fixtures/, and writes .wrangler/fixtures.sql to seed local D1.
// The desk reads real data from these before generation v2 lands. What the desk never shows (deck, citizens,
// patrons, blocs, lobby, escalations, endings) is mini.json's harbour filler.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sanitizeEmblem, type Emblem } from "../worker/emblem";
import { TEMPERAMENTS } from "../worker/engine";
import { FILLS, PackSchema, VERBS, type Glance } from "../worker/pack";
import { parseThemeTokens, type Tint } from "../worker/tokens";
import mini from "../worker/fixtures/mini.json";

const MOCK = process.argv[2] ?? "docs/mocks/v4";

// The mock hard-codes these three tables in desk.html (GC, G2 and SC.house); they are copied here verbatim, with the
// last hate of each card as its red line, as the mock draws it.
const TINTS: Record<string, Record<string, [string, string]>> = {
  "biden-2021": {
    congress: ["#1f3a6e", "#8eaaf0"],
    court: ["#4f5668", "#aab1c2"],
    fed: ["#227f53", "#6dc393"],
    public: ["#8a6d24", "#f1cc7e"],
    dem: ["#2553a3", "#7aa2ff"],
    gop: ["#bf2f2b", "#ff7a70"],
    nato: ["#1d6470", "#6cc4cf"],
    china: ["#a14a1a", "#f0a070"],
    markets: ["#623e96", "#a37fde"],
    ind: ["#596073", "#aab1c2"],
  },
  westeros: {
    houses: ["#44584c", "#a9c2b0"],
    lannister: ["#9b2226", "#ff8a80"],
    council: ["#3f5163", "#9fb4c8"],
    baratheon: ["#7a5d0e", "#e3c15a"],
    smallfolk: ["#6b4f33", "#caa27a"],
    faith: ["#2f4a6e", "#9db6e0"],
    ironbank: ["#4a4f57", "#b5bcc7"],
    exiles: ["#6d2d5e", "#d99ac7"],
    freecities: ["#1d6470", "#6cc4cf"],
  },
};
type Card = [string[], string[], string];
const GLANCES: Record<string, Record<string, Card>> = {
  "biden-2021": {
    congress: [
      ["Its say on spending", "Bipartisan bills", "Confirmation votes"],
      ["Spending by order", "Party-line bills", "Ending the filibuster"],
      "Refuses your budget",
    ],
    court: [
      ["Orders citing a law", "Power to the states", "Nine justices"],
      ["Federal mandates", "Court packing", "Defying its rulings"],
      "Strikes down your orders",
    ],
    fed: [
      ["Stable prices", "Powell renamed", "Clear ports"],
      ["More stimulus", "New tariffs", "Orders on rates"],
      "Raises rates hard",
    ],
    nato: [
      ["Eastern flank troops", "Arms for Ukraine", "Being consulted"],
      ["Deals over Kyiv", "Going it alone", "Doubting Article 5"],
      "Pulls back from your plans",
    ],
    public: [
      ["Relief checks", "Open schools", "Jobs"],
      ["Gas taxes", "New lockdowns", "Troops on protesters"],
      "Takes to the streets",
    ],
    china: [
      ["Tariffs lifted", "Huawei eased", "One China"],
      ["Chip bans", "Arms for Taiwan", "Recognising Taiwan"],
      "Cuts off chips and rare earths",
    ],
    dem: [
      ["The rescue plan", "Climate money", "Voting rights"],
      ["Smaller relief", "The filibuster", "Social Security cuts"],
      "Calls the final vote early",
    ],
    gop: [
      ["Spending cuts", "The border wall", "2017 tax cuts"],
      ["New spending", "Tax rises", "Federal election law"],
      "Shuts the government down",
    ],
    markets: [
      ["A budget that adds up", "Debt ceiling raised"],
      ["Unfunded trillions", "Shutdowns", "A missed payment"],
      "Sells your bonds",
    ],
    // Written for this fixture: the mock has no card for the two independents.
    ind: [
      ["Bigger relief checks", "A $15 minimum wage"],
      ["Means-tested checks", "Social Security cuts"],
      "Withholds two votes",
    ],
  },
  westeros: {
    houses: [
      ["Their own justice", "Asked before war", "Peace between houses"],
      ["Royal judges", "Calling the banners", "Seizing a castle"],
      "Rises against the throne",
    ],
    lannister: [
      ["Tywin as Hand", "Repaid first", "Joffrey as heir"],
      ["Stark as Hand", "Iron Bank first", "Setting Cersei aside"],
      "Keeps its men and gold home",
    ],
    council: [
      ["A Hand to work with", "Fewer tourneys", "Decrees in council"],
      ["Tourneys on credit", "Dismissing the council"],
      "Lets the realm stall",
    ],
    baratheon: [
      ["Honours for Stannis", "Land for storm lords", "Targaryens hunted"],
      ["A Lannister Hand", "Pardoning the Targaryens"],
      "Keeps the storm lords home",
    ],
    smallfolk: [
      ["Cheap bread", "Peace", "Safe roads"],
      ["Bread taxes", "Tourneys", "Burning the fields"],
      "Riots in King's Landing",
    ],
    faith: [
      ["Its own courts", "Gifts to the Sept"],
      ["Taxing the Faith", "Setting the queen aside", "Seizing sept lands"],
      "Turns your house against you",
    ],
    ironbank: [
      ["Payments on time", "A sound master of coin"],
      ["Late payments", "Tourneys on credit", "Refusing to repay"],
      "Calls in the crown's loans",
    ],
    exiles: [
      ["Loyalists pardoned", "Dorne angry"],
      ["Killers sent", "A royal fleet", "A price on their heads"],
      "Buys a Dothraki army",
    ],
    freecities: [
      ["Open ports", "Quiet seas", "Pentos left alone"],
      ["Harbour taxes", "A fleet sent east", "Seizing their ships"],
      "Shuts its ports to you",
    ],
  },
};
// Per world: the calendar, the chamber when the era file has none (Westeros's voices at court, from SC.house), and
// the named seats the mock's count calls.
const WORLDS = {
  "biden-2021": {
    calendar: { start_date: "2021-01-20", unit: "season" as const },
    court: null,
    named: { dem: ["Joe Manchin", "Kyrsten Sinema"], gop: ["Susan Collins"] } as Record<
      string,
      string[]
    >,
  },
  westeros: {
    calendar: { start_date: "0298-01-01", unit: "month" as const },
    court: {
      name: "Voices at court",
      threshold: 50,
      factions: [
        { id: "baratheon", name: "House Baratheon", short: "Baratheon", seats: 20 },
        { id: "smallfolk", name: "Smallfolk", short: "Smallfolk", seats: 15 },
        { id: "council", name: "Small council", short: "Council", seats: 15 },
        { id: "houses", name: "Great houses", short: "Houses", seats: 30 },
        { id: "lannister", name: "House Lannister", short: "Lannister", seats: 20 },
      ],
    },
    named: {
      houses: [
        "House Stark",
        "House Arryn",
        "House Tully",
        "House Tyrell",
        "House Martell",
        "House Greyjoy",
      ],
    } as Record<string, string[]>,
  },
};

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function glanceFor(
  world: string,
  id: string,
  face?: { name: string; role: string },
): Glance | undefined {
  const card = GLANCES[world][id];
  if (!card) return undefined;
  const [wants, hates, strike] = card;
  return {
    ...(face ? { face: { name: face.name, role: face.role.split(";")[0] } } : {}),
    wants,
    hates: hates.map((tag, index) => ({ tag, redLine: index === hates.length - 1 })),
    strike,
  };
}

function emblemsOf(world: string): Record<string, Emblem> {
  const lab = JSON.parse(readFileSync(`${MOCK}/feel/emblem-gen/${world}.json`, "utf8"));
  const out: Record<string, Emblem> = {};
  for (const entry of lab.emblems) {
    if (!entry.ok) continue;
    const raw = {
      viewBox: entry.viewBox,
      elements: entry.elements.map((element: { tag: string; attrs: object }) => ({
        tag: element.tag,
        ...element.attrs,
      })),
    };
    const result = sanitizeEmblem(raw);
    if (result.emblem) out[entry.id] = result.emblem;
  }
  return out;
}

function convert(id: keyof typeof WORLDS) {
  const era = JSON.parse(readFileSync(`${MOCK}/eras/${id}.json`, "utf8"));
  const setup = WORLDS[id];
  const emblems = emblemsOf(id);
  const tint = (key: string): Tint | undefined => {
    const pair = TINTS[id][key];
    return pair ? { light: pair[0], dark: pair[1] } : undefined;
  };
  const vocabulary = era.vocabulary;
  const chamber = era.chamber
    ? {
        name: era.chamber.name,
        threshold: era.chamber.threshold,
        factions: era.chamber.factions.map((faction: any) => ({
          ...faction,
          face: faction.card?.face,
        })),
      }
    : setup.court!;
  const size = chamber.factions.reduce((sum: number, faction: any) => sum + faction.seats, 0);
  const holderFace = (holderId: string) =>
    era.holders.find((h: any) => h.id === holderId)?.card?.face;

  const factions = chamber.factions.map((faction: any, index: number) => ({
    id: faction.id,
    name: faction.name,
    short: faction.short,
    color: tint(faction.id)?.light ?? "#555555",
    fill: FILLS[index % FILLS.length],
    ideology: faction.name,
    leader: (faction.face ?? holderFace(faction.id))?.name ?? faction.name,
    glance: glanceFor(id, faction.id, faction.face ?? holderFace(faction.id)),
    emblem: emblems[faction.id],
    tint: tint(faction.id),
  }));
  const pledgeTags = era.pledges.map((pledge: any) => slug(pledge.text).slice(0, 40));
  const tags = [...pledgeTags, ...mini.tags.slice(0, 16 - pledgeTags.length)];
  const regions = era.regions.map((region: any) => ({
    id: region.id,
    name: region.name,
    weight: 1 / era.regions.length,
    lean: factions.map((faction: any) => ({ id: faction.id, value: 0 })),
  }));

  let seat = 0;
  const members = factions.flatMap((faction: any, factionIndex: number) => {
    const seats = chamber.factions[factionIndex].seats;
    const named = setup.named[faction.id] ?? [];
    return Array.from({ length: seats }, (_, k) => {
      seat++;
      const region = regions[seat % regions.length];
      return {
        id: `m${seat}`,
        seat: `seat-${String(seat).padStart(3, "0")}`,
        region: region.id,
        faction: faction.id,
        name: named[k] ?? `${faction.short} ${vocabulary.member} ${k + 1}`,
        bio: "",
        core_issues: [tags[seat % tags.length]],
        temperament: TEMPERAMENTS[seat % TEMPERAMENTS.length],
        tell: "",
        patrons: [],
        years: "mid",
        flags: [],
      };
    });
  });
  const citizens = Array.from({ length: 250 }, (_, i) => ({
    id: `c-${i}`,
    region: regions[i % regions.length].id,
    bloc: mini.blocs[i % mini.blocs.length].id,
    name: `Citizen ${i + 1}`,
    age: 20 + (i % 50),
    job: "worker",
    town: era.place,
    worldview: "",
    issues: [tags[0], tags[1]],
    weight: 1,
  }));
  const coalition = factions
    .filter(
      (faction: any) =>
        faction.id === era.ruler.faction ||
        era.chamber?.factions.find((f: any) => f.id === faction.id)?.withYou,
    )
    .map((faction: any) => faction.id);

  const chamberHolder = era.holders.find((h: any) => h.icon === "chamber")?.id;
  const holders = era.holders.map((h: any) => ({
    id: h.id,
    name: h.name,
    ...(h.short ? { short: h.short } : {}),
    where: h.where,
    persona: {
      name: h.card?.face?.name ?? h.name,
      role: (h.card?.face?.role ?? "").split(";")[0],
      bio: h.card?.base ?? h.wants,
      tell: h.says,
    },
    members: h.id === chamberHolder ? "seats" : h.id === era.publicGroup ? "citizens" : "none",
    stance: h.stance,
    support: Math.round(h.stance * 100),
    line: h.line,
    response: h.response,
    levers: h.icon === "army" ? ["force"] : [],
    wants: [h.wants],
    redLines: h.card?.redLine?.act ? [h.card.redLine.act] : [],
    gives: null,
    responses: [h.does],
    icon: h.icon,
    glance: glanceFor(id, h.id, h.card?.face),
    emblem: emblems[h.id],
    tint: tint(h.id),
  }));
  const name = (holderId: string) =>
    era.holders.find((h: any) => h.id === holderId)?.name ?? holderId;
  const resource = (key: "treasury" | "authority" | "chest") => {
    const ledger = era.ledgers[key];
    return {
      name: ledger.name,
      line: ledger.line,
      icon: ledger.icon,
      for: ledger.for,
      earn: ledger.earn,
      spend: ledger.spend,
      fails: ledger.fails,
    };
  };
  const theme = era.theme;
  const tokens = parseThemeTokens({
    display: theme.display,
    displayWeight: theme.displayWeight,
    displayCase: theme.displayCase,
    displayTracking: theme.displayTracking,
    body: theme.body,
    bodySize: theme.bodySize,
    mono: theme.mono,
    light: {
      paper: theme.paper,
      surface: theme.surface,
      ink: theme.ink,
      muted: theme.muted,
      accent: theme.accent,
      accent2: theme.accent2,
      rule: theme.rule,
    },
    dark: theme.dark,
    material: theme.material,
    texture: theme.texture,
    textureScale: theme.textureScale,
    radius: theme.radius,
    ruleStyle: theme.ruleStyle,
    motion: theme.motion,
    courier: "dot",
  });
  if (tokens.fixes[0]?.startsWith("default theme")) throw new Error(`${id}: ${tokens.fixes[0]}`);

  const pack = PackSchema.parse({
    v: 1,
    id,
    lang: "en",
    prompt: era.prompt,
    title: era.title,
    era: era.era,
    place: era.place,
    description: era.briefing.situation,
    fiction: era.kind === "fiction",
    kind: era.kind === "fiction" ? "canon" : "recorded",
    sources: [],
    vocabulary: {
      ...mini.vocabulary,
      seat: era.ruler.role,
      chamber: vocabulary.chamber,
      member: vocabulary.member,
      bill: vocabulary.bill,
      pass: vocabulary.pass,
      fail: vocabulary.fail,
      turn: vocabulary.turn,
      test: vocabulary.test,
      post: vocabulary.post,
      midterm: vocabulary.halfTerm,
      file: vocabulary.file,
      ...(vocabulary.abroad ? { abroad: vocabulary.abroad } : {}),
    },
    theme: mini.theme,
    themeTokens: tokens.tokens,
    chamber: {
      size,
      threshold: chamber.threshold,
      supermajority: Math.ceil((size * 2) / 3),
      alpha: 0.5,
      veto: null,
    },
    calendar: setup.calendar,
    factions,
    regions,
    blocs: mini.blocs,
    patrons: mini.patrons,
    members,
    citizens,
    starts: factions.map((faction: any) => ({
      faction: faction.id,
      seat_title: era.ruler.role,
      coalition,
      premise: era.ruler.youAre,
      party: 55,
      capital: 40,
      hostile: null,
    })),
    problems: [...era.problems, ...era.handling, ...mini.problems].slice(0, 8),
    promises: era.pledges.map((pledge: any, i: number) => ({
      tag: pledgeTags[i],
      label: pledge.text,
    })),
    tags,
    deck: mini.deck,
    escalations: mini.escalations,
    test: { ...mini.test, name: vocabulary.test },
    endings: mini.endings,
    lobby: mini.lobby,
    constitution: {
      ruler: {
        role: era.ruler.role,
        faction: era.ruler.faction,
        above: null,
        removedBy: era.ruler.removedBy.map((r: any) => `${name(r.id)} ${r.how}.`).join(" "),
      },
      holders,
      instruments: Object.fromEntries(
        VERBS.map((verb) => [
          verb,
          {
            name: era.instruments[verb].name,
            available: era.instruments[verb].available,
            vetoes: era.instruments[verb].vetoes,
            price: mini.constitution.instruments[verb].price,
          },
        ]),
      ),
      retention: {
        name: vocabulary.test,
        weights: era.holders
          .filter((h: any) => h.weight > 0)
          .map((h: any) => ({ id: h.id, value: h.weight })),
      },
      halfTerm: { holder: era.publicGroup, name: vocabulary.halfTerm },
      ledgers: {
        treasury: resource("treasury"),
        authority: resource("authority"),
        chest: resource("chest"),
        loyalty: { name: era.ledgers.loyalty.name, line: era.ledgers.loyalty.line },
        popularity: { name: era.ledgers.popularity.name, line: era.ledgers.popularity.line },
      },
      briefing: era.briefing,
      publicGroup: era.publicGroup,
      ownGroup: era.ownGroup,
    },
  });
  writeFileSync(`worker/fixtures/${id}.json`, `${JSON.stringify(pack, null, 1)}\n`);
  return pack;
}

// D1 caps one statement at 100 KB, so the pack goes in as an INSERT and then appended in 40 KB pieces.
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
const sql: string[] = [];
for (const id of Object.keys(WORLDS) as (keyof typeof WORLDS)[]) {
  const pack = convert(id);
  const json = JSON.stringify(pack);
  sql.push(
    `INSERT OR REPLACE INTO scenarios (id, status, step, lang, title, era, place, description, prompt, pack, fragments, created, builds) VALUES (${[id, "ready", "ready", "en", pack.title, pack.era, pack.place, pack.description, pack.prompt].map(quote).join(", ")}, '', '[]', ${Date.now()}, 0);`,
  );
  for (let i = 0; i < json.length; i += 40_000)
    sql.push(
      `UPDATE scenarios SET pack = pack || ${quote(json.slice(i, i + 40_000))} WHERE id = ${quote(id)};`,
    );
  console.log(
    `${id}: ${pack.constitution!.holders.length} holders, ${pack.members.length} seats, ${Math.round(json.length / 1024)} KB`,
  );
}
mkdirSync(".wrangler", { recursive: true });
writeFileSync(".wrangler/fixtures.sql", `${sql.join("\n")}\n`);
console.log("wrote worker/fixtures/*.json and .wrangler/fixtures.sql");
```

- [ ] **Step 4: Generate the fixtures**

Run: `bun scripts/era-fixture.ts /Users/deadpackets/workspace/UnitedStatesOfJev/docs/mocks/v4`
Expected:

```
biden-2021: 9 holders, 100 seats, 104 KB
westeros: 9 holders, 100 seats, 117 KB
wrote worker/fixtures/*.json and .wrangler/fixtures.sql
```

- [ ] **Step 5: Run the test to see it pass**

Run: `bun test worker/pack.test.ts`
Expected: PASS, 0 fail (15 tests).

- [ ] **Step 6: Seed local D1 and check the rows (the repeatable artifact for Track D)**

```bash
yes | bunx wrangler d1 migrations apply usoj --local
bunx wrangler d1 execute usoj --local --file .wrangler/fixtures.sql
bunx wrangler d1 execute usoj --local --command "SELECT id, status, length(pack) AS bytes FROM scenarios WHERE id IN ('biden-2021','westeros')"
```

Expected: two rows, `status` `ready`, `bytes` about 106,000 and 120,000. The SQL inserts each pack in 40 KB pieces because D1 caps one statement at 100 KB. With `bun run dev` running, `curl -s localhost:5173/api/scenarios/biden-2021 | head -c 120` prints the start of the pack.

- [ ] **Step 7: Run the gates**

Run: `bun test worker src scripts && bunx tsc -b && bunx vite build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add scripts/era-fixture.ts worker/fixtures/biden-2021.json worker/fixtures/westeros.json worker/pack.test.ts
git commit -m "Fixture packs for the Biden and Westeros desks, built from the approved mock, with a local D1 seed"
```

---

## Interfaces produced

Every path, export and signature Track D and Track E consume. Nothing else from Stage 0 is a contract.

### `worker/emblem.ts`

```ts
export const EMBLEM_TAGS: readonly ["path", "circle", "ellipse", "rect", "polygon", "line"];
export const EMBLEM_PAINTS: readonly ["ink", "accent", "paper", "none"];
export const EMBLEM_LIMIT = 12;
export type EmblemTag = (typeof EMBLEM_TAGS)[number];
export type EmblemPaint = (typeof EMBLEM_PAINTS)[number];
export type EmblemElement = {
  tag: EmblemTag;
  d?: string; // path only
  points?: string; // polygon only
  transform?: string;
  cx?: number; cy?: number; r?: number; rx?: number; ry?: number;
  x?: number; y?: number; width?: number; height?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  strokeWidth?: number;
  fill?: EmblemPaint; stroke?: EmblemPaint;
  fillRule?: "nonzero" | "evenodd";
};
export type Emblem = { size: 24 | 64; elements: EmblemElement[] }; // 1 to 12 elements
export const EmblemSchema: z.ZodType<Emblem>; // strict: unknown keys fail
export type SanitizedEmblem =
  | { emblem: Emblem; fixes: string[] }
  | { emblem: null; reason: string; fixes: string[] };
// raw: the model's { viewBox: "0 0 24 24" | "0 0 64 64", elements: [{ tag, ...attributes }] }; kebab-case or
// camelCase attribute names; paints "ink" | "accent" | "paper" | "none" (also "currentColor", "var(--accent)",
// "var(--paper)"); any other paint becomes ink.
export function sanitizeEmblem(raw: unknown): SanitizedEmblem;
export function checkEmblem(value: unknown): Emblem | null; // D: call before drawing; null means draw the line icon
export type EmblemShape = { tag: EmblemTag; props: Record<string, string | number | Record<string, string>> };
// D: <svg viewBox={`0 0 ${emblem.size} ${emblem.size}`}>{emblemShapes(emblem).map((shape, i) =>
//   createElement(shape.tag, { key: i, ...shape.props }))}</svg>; the svg's `color` is the group's tint.
export function emblemShapes(emblem: Emblem): EmblemShape[];
```

### `worker/tokens.ts`

```ts
export const DISPLAY_FONTS: readonly [...48 Google Fonts];
export const BODY_FONTS: readonly [...22];
export const MONO_FONTS: readonly [...8];
export const MATERIALS: readonly ["newsprint", "vellum", "parchment", "linen", "papyrus", "stone", "brass", "steel", "terminal", "silk", "clay", "glass"];
export const TEXTURES: readonly ["halftone", "lines", "crosshatch", "grid", "stars", "hex", "weave", "noise", "scanlines", "none"];
export const RULE_STYLES: readonly ["single", "double", "dotted", "ornate", "notched", "none"];
export const MOTIONS: readonly ["stately", "brisk", "mechanical", "fluid"];
export const COURIERS: readonly ["dot", "coin", "shard", "fleck"];
export const MIN_CONTRAST = 4.5;
export const ColourSchema: z.ZodString; // /^#[0-9a-fA-F]{6}$/
export const TintSchema: z.ZodType<Tint>;
export type Tint = { light: string; dark: string };
export type Palette = { paper: string; surface: string; ink: string; muted: string; accent: string; accent2: string; rule: string };
export type ThemeTokens = {
  display: (typeof DISPLAY_FONTS)[number];
  displayWeight: number; // integer 300 to 900
  displayCase: "none" | "upper" | "small-caps";
  displayTracking: number; // -0.05 to 0.2 em
  body: (typeof BODY_FONTS)[number];
  bodySize: number; // 16 to 19 px at k = 1
  mono: (typeof MONO_FONTS)[number] | null;
  light: Palette;
  dark: Palette;
  material: (typeof MATERIALS)[number];
  texture: (typeof TEXTURES)[number];
  textureScale: number; // 0.6 to 2
  radius: number; // 0 to 18 px at k = 1
  ruleStyle: (typeof RULE_STYLES)[number];
  motion: (typeof MOTIONS)[number]; // the mock's duration factor: stately 1.18, brisk 0.9, mechanical 1, fluid 1
  courier: (typeof COURIERS)[number];
};
export const ThemeTokensSchema: z.ZodType<ThemeTokens>;
export const DEFAULT_THEME_TOKENS: ThemeTokens; // the approved desk on the Biden world
export function contrastRatio(first: string, second: string): number; // WCAG 2
export function fitContrast(foreground: string, backgrounds: string[], minimum?: number): string; // lower-case hex
export function fitThemeTokens(tokens: ThemeTokens): { tokens: ThemeTokens; fixes: string[] };
// E on write and D on render: DEFAULT_THEME_TOKENS with fixes[0] starting "default theme:" when raw does not
// parse; otherwise the tokens with ink, muted and accent fitted to 4.5:1 on paper and surface in both modes.
export function parseThemeTokens(raw: unknown): { tokens: ThemeTokens; fixes: string[] };
```

### `worker/pack.ts`

```ts
export const LINE_ICONS: readonly ["chamber", "court", "army", "clergy", "street", "party", "patrons", "press", "foreign", "market", "crown", "council"];
export const RESOURCE_ICONS: readonly ["bank", "coins", "note", "gavel", "medal", "people", "crown", "scroll", "flag", "drop", "grain", "crate", "house", "sword", "faith"];
export type LineIcon = (typeof LINE_ICONS)[number];
export type ResourceIcon = (typeof RESOURCE_ICONS)[number];
export type Glance = {
  face?: { name: string; role: string };
  wants: string[]; // 1 to 3 tags, each 1 to 48 characters (R36 asks 2 to 3 tags of 1 to 4 words)
  hates: { tag: string; redLine: boolean }[]; // 1 to 3, exactly one redLine
  strike: string; // what the group does when it turns on the ruler
};
export const GlanceSchema: z.ZodType<Glance>; // strict: E's write check
export const REFUSES_MONEY: RegExp; // /\b(bribes?|bribery|bought|paid off|cash for|money for)\b/i, tested on hate tags
```

New optional fields on the parsed `Pack` (a malformed value parses as `undefined`; E writes them, D reads them):

| Path | Type | Fallback when absent |
|---|---|---|
| `constitution.holders[i].short` | `string` | `name` |
| `constitution.holders[i].icon` | `LineIcon` | D picks one (suggested: seats to chamber, citizens to street, a force lever to army, else council) |
| `constitution.holders[i].glance`, `factions[i].glance` | `Glance` | `glanceOf` reads an R30 `card`; else none |
| `members[i].glance` | `Glance` | the member's faction's card; the engine never reads it |
| `constitution.holders[i].emblem`, `factions[i].emblem` | `Emblem` | the line icon |
| `constitution.holders[i].tint`, `factions[i].tint` | `Tint` | a faction's `color`; D picks for a holder |
| `constitution.ledgers.{treasury,authority,chest}` | `+ icon?: ResourceIcon, for?: string, earn: string[], spend: string[], fails?: string` | `earn` and `spend` default to `[]` |
| `vocabulary.file` | `string` | "File" |
| `vocabulary.abroad` | `string` | "abroad" |
| `themeTokens` | `ThemeTokens` | `DEFAULT_THEME_TOKENS` |

E maps the gen2 world shape into these: gen2 `theme` (flat light palette plus `dark`) to `themeTokens` through `parseThemeTokens`, dropping `script`, `ornament` and `motif` and choosing a `courier`; gen2 glance `hates[].red_line` to `redLine`; each emblem through `sanitizeEmblem`, storing `emblem` only when it is not null (and when the 28 px gate passes).

### `worker/engine.ts`

```ts
export const tagKey: (tag: string) => string; // trim, lower case: the key for touches, glance tags and pledges
export const actTokens: (a: { verb: Verb; tags: string[]; touches?: string[]; keeps?: string[]; serves?: string[]; hits?: string[] }) => Set<string>;
export function glanceOf(entity: { glance?: Glance; card?: Card }): Glance | undefined; // R36, else R30 read as R36
export function glanceTags(pack: Pack): string[]; // every holder and faction glance tag, keyed, unique
export function glanceLean(glance: Glance | undefined, tokens: Set<string>): Lean; // replaces cardLean
// reasons: "Red line: <tag>" (lean -2), "Hates <tag>" (-1), "Wants <tag>" (+1), "" (0)
export interface Quote { /* existing fields */ touches: string[] }
export interface PriceTag { /* existing fields */ touches?: string[] } // keyed; absent on a tag saved before R36
export interface Bill { /* existing fields */ touches?: string[] }
```

`worker/acts.ts` `termsOf(pack, game, factionId, hesitant): Term[]` now returns `{ kind: "pledge", label: <want tag>, tag: tagKey(<want tag>), due }`, `{ kind: "post", label: "A post for <glance face or leader>" }`, and `{ kind: "money" }` unless a hate tag matches `REFUSES_MONEY`. `worker/luna.ts` `priceAct` sends `glance_tags: glanceTags(pack)` and returns `touches` filtered to them, keyed, at most 6.

### `worker/desk.ts` (types only; D adds `export function deskView(pack: Pack, game: Game): DeskView` here and `desk: deskView(pack, game)` in `worker/game.ts` `view()`, then `desk: DeskView` on `GameView` in `src/api.ts`)

```ts
export interface RimRow { id: string; name: string; where: "home" | "abroad"; support: number; line: number; margin: number; strikesOn: number | null; votes: number; tint: Tint; icon: LineIcon; emblem: Emblem | null; glance: Glance | null }
export interface ChamberFaction { id: string; name: string; short: string; seats: number; tint: Tint; emblem: Emblem | null; glance: Glance | null }
export interface ResourceCard { key: Resource; name: string; value: number; icon: ResourceIcon; about: string | null; earn: string[]; spend: string[]; fails: string | null; history: number[] }
export interface FinalVote { value: number; need: number }
export interface ReceiptLine { target: "resource" | "group" | "finalVote"; id: string; name: string; delta: number; why: string }
export interface Receipt { verb: Verb; instrument: string; title: string; reading: string; now: ReceiptLine[]; pass: ReceiptLine[]; fail: ReceiptLine[]; vetoes: Veto[]; blocked: Veto | null; count: Count | null }
export interface Count { label: string; need: number; expected: number; tie: string | null; factions: (FactionCount & { hesitantNames: string[] })[] }
export interface Verdict { passed: boolean; yes: number; no: number; need: number; tieBrokenBy: string | null; vetoedBy: string | null; order: { member: string; faction: string; yes: boolean; hesitant: boolean }[] }
export interface ReviewLine extends ReceiptLine { from: number; to: number }
export interface DeskView { theme: ThemeTokens; vocabulary: { file: string; abroad: string; turn: string; pass: string; fail: string }; rim: RimRow[]; factions: ChamberFaction[]; resources: ResourceCard[]; finalVote: FinalVote; receipt: Receipt | null; verdict: Verdict | null; review: ReviewLine[] | null }
```

### Fixtures and seed

- `worker/fixtures/biden-2021.json`: ruler faction `dem` (President); 9 holders; chamber factions `dem` 48, `ind` 2 (no emblem: the fallback row), `gop` 50; `publicGroup` `public`, `ownGroup` `dem`.
- `worker/fixtures/westeros.json`: ruler faction `baratheon` (King); 9 holders; chamber "Voices at court" `baratheon` 20, `smallfolk` 15, `council` 15, `houses` 30, `lannister` 20; `law` unavailable; `force` vetoed by `houses`.
- Regenerate: `bun scripts/era-fixture.ts <path to docs/mocks/v4>`. Seed local D1: `yes | bunx wrangler d1 migrations apply usoj --local && bunx wrangler d1 execute usoj --local --file .wrangler/fixtures.sql`. Seat a game: `POST /api/games { "scenario": "biden-2021", "faction": "dem", "promises": [0, 1, 2] }`.

### Not in Stage 0

- `motion`: Track D adds it (`bun add motion`) with its first import.
