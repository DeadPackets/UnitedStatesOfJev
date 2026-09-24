# Design

## Theme
Duotone: black ink on white paper, one red. A single deliberate look, no dark theme. Halftone paper texture behind the stage only. The scene is a ballot, a broadsheet, and a political poster at once.

## Color
| Token | Value | Role |
|---|---|---|
| --bg | #ffffff | page |
| --paper | #f4f4f2 | seat and plate ground |
| --tone | #e6e6e3 | halftone dots, whip-bar track, faint chips |
| --ink | #0b0b0b | text, seats, primary buttons, rules |
| --ink-2 | #5b5b58 | secondary text (6.9:1 on white) |
| --red | #d0001f | the only color: stamps, failed votes, filibuster tick, focus ring, situation chips |

Party is never a hue. Our seats are solid ink, the opposition is 45° hatching, and the two sides sit on opposite wings. Votes are filled (yes) or hollow (no). Approval on the map is ink density in five steps.

## Typography
- Display: Big Shoulders Display 700/800, condensed civic signage. Headlines, the split numeral, counts, senator names, buttons.
- Body and UI: Public Sans 400/500/600. Labels, prose, chips.
- Buttons are uppercase display type with 0.06em tracking, square corners, 2px ink border.

## Motion
- Easing: --ease-out cubic-bezier(0.22, 1, 0.36, 1); --ease-expo cubic-bezier(0.16, 1, 0.3, 1). No bounce.
- Durations: 120ms feedback, 220ms state, 420ms surfaces; one-shot choreography 0.9 to 2.4 s.
- Signature moments: seats gather from the stage center on load (transform only, per-seat 5ms stagger); the headline typesets itself; "Sworn in" stamps; a new screen prints top to bottom (clip-path press); roll call runs on a rAF clock keyed to elapsed time, 2.4 s ease-in, painting circles directly so 60 to 120 Hz all finish together.
- Seats are keyed by position, never by identity, so reordering never moves DOM nodes or restarts animations.
- Reduced motion: every one-shot becomes a 200ms fade; roll call resolves instantly.

## Components
- Buttons: 52px, square, ink on white or white on ink; scale(0.96) on press; red focus ring.
- Panels: no cards. A 2px ink top rule separates panels; chips are 1px ink outlines.
- Seats: 9px circles; probability as opacity; lobbied as 3px stroke; focus as red ring.
- Drawer: native dialog with a 2px ink left rule; bottom sheet on phones.
- Setup: mast, split numeral, chamber, headline, one slider, three popularity chips, one button, then a "More rules" disclosure.

## v3 theme: the pack drives the page

Every polity pack carries its own `theme` object (`worker/pack.ts`). The client maps it onto the same custom properties above, so no v3 screen is styled from a hardcoded palette:

| Token | Sets |
|---|---|
| `--ink`, `--paper` | body text, seats, rules, the halftone plate's two tones |
| `--bg` | page background |
| `--accent` | the pack's one color: marks, stamps, the tour's hot-seat ring. Not contrast-checked at build, so never a focus ring or a failure state — `--red` keeps that job |
| `--display`, `--sans` | one of eight curated Google Fonts pairs (`FONT_PAIRS` in `worker/pack.ts`), preloaded by name |
| `data-texture` | `newsprint` / `parchment` / `concrete` / `steel` / `none`, a body-level background texture |
| `data-ornament` | `laurel` / `eagle` / `star` / `crescent` / `cross` / `gear` / `rule` / `none`, an SVG used in the masthead rule and stamps |

Contrast (ink on paper) is enforced at build: under 4.5:1 and the reviewer resets to the default pair.

## Faction fills

Twelve patterns (`FILLS` in `worker/pack.ts`): `solid`, `hatch`, `hatch2`, `cross`, `dots`, `rings`, `hollow`, `half`, `wave`, `grid`, `brick`, `check`. Each faction gets a color (Wikidata P465 when the real party has one, else a 12-color set with pairwise distance enforced) plus a fill, unique per faction in that pack. Seats render `fill: color` with the pattern overlaid in ink, so color and pattern both carry the party — never color alone.

## Layouts

Six point generators (`src/layouts.ts`), each producing `{x, y, angle}` per seat in a 600×340 box:

| Layout | Geometry |
|---|---|
| `hemicycle` | 1 to 5 concentric arcs of 12 to 28 seats, rows split by largest remainder, facing the well |
| `benches` | two facing rectangular grids of near-square cells, split left/right of one center seat (the chair) |
| `horseshoe` | 1 to 3 concentric elliptical arcs open at the front, facing the chair |
| `circle` | 1 to 3 concentric elliptical rings, nearly closed, facing the center table |
| `classroom` | one rectangular grid, rows read left to right, facing the front |
| `court` | 1 to 3 arcs fanned below one seat at the top (the throne), facing it |

## Seat coin and plate

The game draws no pictures: no faces, crests or mastheads.

- **Seat coin** — the member's initials in the faction color on paper, in a round crop with a faction-color ring, a 1px ink rule outside it, and a thicker ring when selected.
- **Plate** — the initials at 256 px in the member drawer, with an ink rule top and bottom, faction color only in the name line.

## Vocabulary rule

Every pack ships its own `vocabulary` (seat, chamber, member, bill, turn, whip, lobby, promise...). Pack words print bare — as labels, buttons, kickers — never spliced into an English sentence frame: "bring men to the vote" reads correctly as a button label but breaks as "Run the bring men to the vote". Plain nouns (`bill`, `seat`, `member`, `turn`, `test`, `promise`) are safe inside a sentence; anything that can be a whole phrase in some pack (`whip`, `lobby`) is not.

## v3 Stage B: the feed, the night, the canvass, the reveal

Four screens were added to the term, each on the same duotone rules above. None of them is a new visual language:
a post is a broadsheet notice, the midterm is the floor counting itself, the canvass is a map with one lever, and
the reveal is the map again with the count running.

### The Feed

The rail's panel is a two-button `tablist`: the turn's desk, and the feed under the pack's own word for it. The
post box takes 240 characters and shuts once this turn has a post or the bill has voted. A post prints the four
reactions as ink marks (`✓ ✕ ↗ ○`, tabular numbers, 60 ms apart), the three replies as pull quotes with a name and
a region, the rival's answer in a hatched box, and the duel as a stamp in the pack's `pass` or `fail` word.

The approval move is per region, from that region's own citizens, never the national 250:

```
d = clamp(((like + 2·share − 2·boo·loud) / n) · 2, −6, 6)
```

`loud` is the `loud_opposition` escalation, so a boo counts double under it. A region where shares beat both likes
and boos is `hot`: it writes one memory line into every member seated there, which the next whip count reads.
Measured: Jev's argmax never picks `share`, so `hot` has never fired in a live term (`docs/experiments.md`).

### Midterm night

A third of the seats (`round(size / 3)`, seeded into `game.marks.midterm` at `newGame`) are up at turn 11. The
screen posts once on mount and then walks the class one seat per beat, `min(700 ms, 40 s / class)`, so a 60-seat
chamber runs 14 s and a 25-seat chamber 5.6 s.

| Beat | What the floor does |
|---|---|
| held | the seat takes an ink disc, the way a yes vote does |
| lost | the coin and the initials change to the winning faction, and the ring marks it |
| all done | the marks lift, the bar rests at the new count, the half-term headline rises in the rail |

Each seat holds on `0.5·sigmoid((region approval − 50) / 8) + 0.5·(region intent)`, flipped for a seat the
government does not hold, drawn once against `crypto` randomness — not the game's seed, so the night is never
replayable. The winner is the faction the region leans to most, the loser excluded; under `split_chamber` the
winner must come from outside the government's own side, largest caucus first. Replacements are written by Luna
in the same call and live on the game, never on the pack, so a pack is never edited by a run. Losing 40% of the
class from your own side ends the term as a lame duck.

### The canvass

Four closing turns, each one message of three and then one lever, priced against the two ledgers and shown in
points of the mandate so the two can be read against each other:

| Lever | Cost | Gain shown |
|---|---|---|
| up to two regions at 0, 5 or 10 | the chest | `α · Σ weight · SPEND_LIFT[amount]` |
| a favour to one seat | `lobbyCost(game, "favor")` of capital | `(1 − α) · FAVOR_LIFT / chamber size` |

`α` is the pack's own `chamber.alpha`, printed under the two figures as "α 0.65 public to 0.35 chamber", because
it is the exchange rate between the two halves of the test. The rival works two regions each turn, hatched on the
map and tagged; `rival_surge` doubles what the rival spends there. The forecast above the map is a band, not a
point: ±1.96 standard errors of the measured intent, with each region's own citizen count shrinking its share of
the error. The band is drawn as a grey segment, the point as a 2 px rule, over the same 50% tick the whip bar uses.

### The treemap and its choreography

Regions are a weighted treemap (`squarify`, `src/Tiles.tsx`), not a map: any polity has regions with weights, and
no polity has an outline we can draw. Tiles are laid largest first in a unit box matched to the real aspect, so
the biggest region is the biggest rectangle and a 2% region is still visible.

| Piece | Clock | Step |
|---|---|---|
| a region declares | `TileReveal`'s own interval | `clamp(40 s / regions, 400, 1400)` ms, wiping in from the top by `clip-path` |
| an upset | one `setTimeout` | 420 ms in `--accent`, the beat the forecast was contradicted |
| the seat floor | Test.tsx's rAF, unchanged | starts on `onDone`, so `reveal: "both"` runs the two in sequence over 40 s |

A won region is inked, a lost one hatched, and the header numeral counts up to the final share as the tiles land.
The whole reveal is skippable on a replay only: the first time, the count is the point. The canvass reuses the
same component with `onPick`, so the map you spent money on is the map that declares.

### Where the four Stage B escalations bite

| Key | Bites in |
|---|---|
| `loud_opposition` | the Feed's approval formula: a boo counts `loud` times |
| `split_chamber` | midterm night: a forced seat must leave the government's own side |
| `rival_surge` | the canvass: the rival's money in its two regions, and so the forecast |
| `apathy` | the test: the weight of your own two strongest blocs is thinned |

## The share grid

One square a turn, in the hue of the ledger that moved most that turn, five to a row, and the test as
a final row of four. The hues are the five fixed resource hues, so a grid reads the same on every pack:

| Square | Light | Copied as |
|---|---|---|
| Treasury | `#227f53` | 🟩 |
| Authority | `#623e96` | 🟪 |
| Chest | `#a98738` | 🟨 |
| Loyalty | `#2b7592` | 🟦 |
| Popularity | `#a5417f` | 🟧 |
| A still turn | transparent | ⬜ |
| The test, kept | `#227f53` | ✅ |
| The test, lost | `#bb0916` | 🟥 |

The verdict row is not a green square: a copied 🟩 row would read as four treasury turns. The card draws
the hues from the CSS tokens, which carry a dark variant, and the copy button writes the characters,
because a message box carries characters and not CSS. A run that ended before its test has no final row.
