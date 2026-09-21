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
