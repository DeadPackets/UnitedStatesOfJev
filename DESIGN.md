# Design

## Theme
Duotone: black ink on white paper, one red. A single deliberate look, no dark theme. Halftone paper texture behind the stage only. The scene is a ballot, a broadsheet, and a political poster at once.

## Color
| Token | Value | Role |
|---|---|---|
| --bg | #ffffff | page |
| --paper | #f4f4f2 | portrait ground |
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

Faces are full-color dither, plates are ink. Both come from the same 4×4 contact sheet cell (`worker/art.ts`):

- **Seat coin** — the `face` render, 128 px, Floyd–Steinberg dithered to a 16-color palette picked per face by median cut. Shown at seat and hover size (44 to 96 px) in a round crop with a faction-color ring, a 1px ink rule outside it, and a thicker ring when selected. Initials in the faction color stand in until the face lands.
- **Plate** — the `plate` render, 256 px, grayscale, luma normalized then leveled 10% to 85% (black point 0.10, white point 0.85), ordered 8×8 Bayer dither at 3 levels, printed in the pack's ink on its paper. Shown in the member drawer at 256 px with an ink rule top and bottom, faction color only in the name line.

## Crest and masthead

Same plate halftone treatment as the member plate (`worker/art.ts`): one crest per faction, ink is the faction's own color on the pack's paper; one masthead per pack, resized to 1600×400, ink on paper. Both generate at build time, in parallel with members and the deck; portraits generate after the pack is ready, in the background, and never block play.

## Vocabulary rule

Every pack ships its own `vocabulary` (seat, chamber, member, bill, turn, whip, lobby, promise...). Pack words print bare — as labels, buttons, kickers — never spliced into an English sentence frame: "bring men to the vote" reads correctly as a button label but breaks as "Run the bring men to the vote". Plain nouns (`bill`, `seat`, `member`, `turn`, `test`, `promise`) are safe inside a sentence; anything that can be a whole phrase in some pack (`whip`, `lobby`) is not.
