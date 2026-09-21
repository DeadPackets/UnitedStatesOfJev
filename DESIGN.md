# Design

## Theme
Dark by default: the scene is a tense evening vote, the hemicycle glowing on a near-black chamber floor. Light theme for daytime, a true neutral off-white at near-zero chroma, never cream. Both switch with the OS.

## Color (OKLCH)
| Token | Dark | Light | Role |
|---|---|---|---|
| --bg | oklch(0.17 0.012 260) | oklch(0.975 0.003 260) | page |
| --surface | oklch(0.21 0.012 260) | oklch(0.93 0.005 260) | panels, inputs |
| --ink | oklch(0.95 0.006 80) | oklch(0.20 0.01 260) | text, primary buttons |
| --ink-2 | oklch(0.74 0.01 80) | oklch(0.44 0.01 260) | secondary text, AA on bg and surface |
| --line | oklch(0.30 0.01 260) | oklch(0.86 0.006 260) | hairlines |
| --gold | oklch(0.80 0.13 80) | oklch(0.60 0.13 80) | the one accent: primary action, pass, tour |
| --d / --r | oklch(0.70 0.10 250) / oklch(0.68 0.13 30) | oklch(0.48 0.12 250) / oklch(0.50 0.15 30) | party hues, muted on purpose |

Strategy: restrained. Gold is under 10% of any screen. Party hues appear only on seats and the drawer figure.

## Typography
- Display: Big Shoulders Display 700/800, condensed, civic signage. Headlines, the big counts, senator names.
- Body and UI: Public Sans 400/500/600, the US government's own face. Labels, buttons, prose.
- Scale: 13 / 15 / 18 / 24 / 34 / 56 / clamp(48px, 9vw, 96px). Tabular numerals everywhere a number changes.
- `text-wrap: balance` on headings, `pretty` on prose. Letter-spacing on display no tighter than -0.02em.

## Motion
- Tokens: --ease-out-quint cubic-bezier(0.22, 1, 0.36, 1); --ease-out-expo cubic-bezier(0.16, 1, 0.3, 1). No bounce, no elastic.
- Durations: 120ms feedback, 220ms state, 400ms surfaces, 600 to 900ms one-shot choreography.
- CSS transitions for anything interactive (interruptible). Keyframes only for one-shot sequences. Enter animations enhance content that is already visible by default.
- Signature moments: seats bloom on mount; whip wave from center; roll call with rising tick; stamp; headline slide. Everything else is 220ms or less.
- Reduced motion: crossfades only, roll call resolves instantly.

## Components
- Buttons: pill, 44px tall, scale(0.96) on press, 2px focus ring in gold offset 2px. Primary is ink on bg; the hot action is gold.
- Cards: 16px radius, surface fill, no border-plus-shadow pairs. Inner elements 8px radius (concentric with 8px padding).
- Seats: 9px radius circles; party hue fill; probability as opacity; vote as filled or hollow; lobbied as 3px ring; focus as gold ring.
- Drawer: native dialog, slides from the right on desktop, bottom sheet on phones, 220ms.
- Coach marks: ink surface on bg, gold kicker, one at a time.
