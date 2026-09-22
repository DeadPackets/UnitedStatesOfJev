# HUD and information architecture for the Desk

Research notes for United States of Jev. Sixteen sources, read 2026-09-22.

## 1. Principles and how they land on the Desk

| # | Source | Principle | Application to the Desk |
|---|---|---|---|
| 1 | Nielsen, [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Show the few options that most tasks need, defer the rest to a second tier, and never build a third. | The five ledgers and the whip count are tier one. The rail tabs are tier two. Nothing on the Desk may require a third click to become legible, so a tab must not open a modal that opens another modal. |
| 2 | Subset Games, [Road to the IGF: Into the Breach](https://www.gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-) | "We wanted to make something where every death felt like your own fault", so every enemy move is telegraphed before the player commits. | The price tag on a bill is the telegraph. Cost, revenue, who it serves and who it hits must be shown before the vote, not after, and the whip count must move as the player edits the bill. |
| 3 | Subset Games, [Into the Breach Design Postmortem, GDC 2019](https://gdcvault.com/play/1026333/-Into-the-Breach-Design) | Perfect information makes a loss instructive instead of unfair. | If a hidden roll decides a vote, show its range on the price tag first. A defeat traced to a number the player could not see reads as a bug. |
| 4 | Mega Crit, [Slay the Spire design retrospective](https://www.pcgamer.com/best-design-2019-slay-the-spire/) | Intent icons state what each enemy will do next turn, in one glyph plus one number. | Each bloc in the hemicycle carries an intent glyph for the current bill: for, against, undecided, plus the seat count. One glyph, one number, no sentence. |
| 5 | Ware, [Visual Thinking for Design](https://en.wikipedia.org/wiki/Colin_Ware) via [preattentive attributes summary](https://uxdesign.cc/preattentive-attributes-of-visual-perception-and-their-application-to-data-visualizations-7b0fb50e1375) | Hue, lightness, size, position and motion are processed in about 200 ms before attention, so only these channels support a true glance. | Give each ledger one fixed hue and one fixed slot in the strip. A number that changes must also move or flash, because motion is the strongest pop-out channel on a busy page. |
| 6 | Tufte, [data-ink ratio](https://infovis-wiki.net/wiki/Data-Ink_Ratio) and NN/g, [Clutter-Free Charts](https://www.nngroup.com/articles/clutter-charts/) | Maximise the ink that carries data and erase the rest. | Ledgers get a number, a label, a delta and a failure line. No gauge chrome, no bevels, no drop shadows, no progress bar behind the number. |
| 7 | [Fitts's Law](https://lawsofux.com/fittss-law/), NN/g [application notes](https://www.nngroup.com/articles/fitts-law/) | Time to hit a target grows with distance and falls with target size. | The bill desk is the highest frequency control, so it gets the largest hit areas and sits next to the price tag it changes. Screen edges are free size, so the wire and the rail tabs should touch their edges. |
| 8 | [Game Accessibility Guidelines: no essential information by fixed colour alone](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-fixed-colour-alone/) | 8 to 10 percent of males cannot separate red from green, so colour must reinforce a label, icon or shape, never carry meaning by itself. | Every ledger shows its name and icon next to the number. Danger is red plus the word plus a rule, never red alone. Seat blocs get a shape as well as a party hue. |
| 9 | Okabe and Ito, [Color Universal Design palette](https://easystats.github.io/see/reference/scale_color_okabeito.html) | Eight hues chosen empirically to stay separable under all common colour vision deficiencies, avoiding the yellow-green confusion band. | The five ledger hues below are built on the same method: spread hue, spread lightness, skip the confusion band, verify by simulation. |
| 10 | Dinosaur Polo Club, [Mini Motorways and minimalism](https://www.gamedeveloper.com/audio/-i-mini-motorways-i-and-the-delicate-art-of-marrying-complexity-and-minimalism) | Colour and shape on a neutral background carry the state, and depth comes from the system, not from the display. | The neutral paper base is correct. Keep saturation for data only, so a tinted panel background is not allowed. |
| 11 | Nerial, [The Casual (but Regal) Swipe, GDC 2017](https://www.gdcvault.com/play/1024278/The-Casual-\(but-Regal\)-Swipe) and [Alliot interview](https://www.inverse.com/gaming/23117-reigns-francois-alliot-nerial-developer-interview) | Four meters, Church, People, Army and Treasury, give a one-bit choice its whole weight. | Five is near the ceiling. Do not add a sixth ledger. If a new quantity is needed, put it in the rail, not in the strip. |
| 12 | Lab42 and Paradox, [CK3 Console Dev Diary #3: UI/UX and Controls](https://www.paradoxinteractive.com/games/crusader-kings-iii/news/ck3-console-dev-diary-3-uiux-and-controls) | Porting a dense strategy UI to a limited input meant a hybrid, not a cursor emulator, avoiding "lots of fullscreen menus that potentially break the immersion", with a radial for the frequent jumps. | The phone layout is a redesign, not a squeeze. Keep the ledgers and the wire in place and make the rail a bottom sheet the thumb can reach. |
| 13 | Paradox, [Stellaris Dev Diary #417, situation log redesign](https://forum.paradoxplaza.com/forum/developer-diary/stellaris-dev-diary-417-situation-log-updated.1918530/) | The log was rebuilt because it lacked ordering, grouping and hierarchy, not because it lacked data. | Feed and Record need grouping by subject and a stable sort. A reverse chronological wall of events is the failure state they fixed. |
| 14 | Cliffski, [Democracy 4's overcomplexity is by design](https://www.positech.co.uk/cliffsblog/2023/02/19/democracy-4s-overcomplexity-is-by-design/) | Overload is deliberate there: "you do not have enough time to process all this, and you need to go with your gut". | This is the fork in the road. Democracy 4 wants the player to feel swamped. If Jev wants a clear read of one bill, do not copy its icon field. Borrow its link tracing, drop its density. |
| 15 | Nijman, [The Art of Screenshake](https://www.youtube.com/watch?v=AJdEqssNZ-U) and [Balatro feedback analysis](https://blakecrosley.com/guides/design/balatro) | Small feedback layers, sound, delay, motion and permanence, change how a number feels without changing the number. | The wire is the feedback channel. Count the changed ledger up or down over about 400 ms, tick the seat that flipped, and leave the last line readable instead of clearing it. |
| 16 | Coates, [Game UI Database](https://www.gameuidatabase.com/) | 55,000 catalogued screens sorted by screen type, HUD element and colour. | Before drawing icons, pull the resource-strip and legislature screens there, plus [Interface In Game](https://interfaceingame.com/games/frostpunk/) for Frostpunk, and copy conventions players already read. |
| 17 | Beach, [Making Civilization VI](https://www.gamedeveloper.com/design/city-management-mayhem-and-sid-meier-s-wisdom-making-i-civilization-vi-i-) | Unstacking cities moved decisions onto the map, so the map became the readout. | The hemicycle should be the primary readout, not decoration beside the numbers. Seats are where the bill is won, so the whip count belongs on the floor, not in a panel. |
| 18 | Smashing Magazine, [The Thumb Zone](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/) | Bottom centre is the reliable one-handed reach area, top corners are not. | On the phone, the rail moves to bottom tabs and the wire sits just above them. |

## 2. The three-tier model checked

The proposed model is glance, peek, pin. The sources support three tiers of attention but only two tiers of navigation.

| Tier | Intended | What the sources say | Change suggested |
|---|---|---|---|
| Glance | Five ledgers and the whip count read in about one second | Ware supports this only if each item uses a preattentive channel: fixed hue, fixed position, size. Six items is within the limit. | Reserve motion for this tier. Only the ledger that just changed may animate. |
| Peek | Hover or tap gives the reason, the price tag, the bloc detail | Nielsen allows one disclosure step. Into the Breach and Slay the Spire require the peek before the commit, not after. | Peek is read-only and must not steal the page. A tooltip or inline panel, never a modal, with the ledgers still visible behind it. |
| Pin | Keep a bloc, a bill or a number in the rail across turns | Stellaris rebuilt its log around grouping, ordering and personalisation, which is what pinning is. | Pinning is a user-built tier one, so a pinned item may show its delta in the strip area, not only inside the rail. |

The one change worth making: the model is missing a level for the unread. Nielsen warns that two disclosure levels are the practical limit, so anything the player has not yet seen should surface as a mark on the tab, not as a fourth layer of screen.

## 3. Colour and icon system

Five hues, fixed per resource across every scenario. Verified with Delta E 2000 after protanopia, deuteranopia and tritanopia simulation. Worst pair under protanopia and deuteranopia is Delta E 9.1, a clear separation. Lightness is spread as well as hue, so greyscale still ranks them. None of the five is red or party blue.

| Ledger | OKLCH (light) | Hex | Contrast on paper | Dark mode |
|---|---|---|---|---|
| Treasury | `oklch(53% 0.11 158)` | `#227f53` | 4.56 | `oklch(75% 0.11 158)` `#6dc393` |
| Political capital | `oklch(45% 0.14 300)` | `#623e96` | 7.27 | `oklch(67% 0.14 300)` `#a37fde` |
| Party chest | `oklch(64% 0.105 85)` | `#a98738` | 3.10 | `oklch(86% 0.105 85)` `#f1cc7e` |
| Party mood | `oklch(53% 0.085 228)` | `#2b7592` | 4.74 | `oklch(75% 0.085 228)` `#71b9d8` |
| Approval | `oklch(53% 0.15 345)` | `#a5417f` | 5.26 | `oklch(75% 0.15 345)` `#f084c4` |

Base paper `#f7f5ef` (`oklch(97% 0.008 95)`), ink `#2a2923` (`oklch(28% 0.01 95)`).

Party chest at 3.10 passes the 3:1 bar for a graphic but not the 4.5:1 bar for small text. Rule: the hue paints the rule, the icon and the delta arrow. Numerals and labels stay ink. That keeps every ledger readable and keeps the hue as identity rather than as the text colour.

Red is one token, `oklch(50% 0.20 27)` `#bb0916`, and it has one meaning: this number has crossed or is about to cross its failure line. Red is never used for a party, for a negative delta, for a decrease, or for an enemy bloc. A fall in approval is an ink number with a down arrow. A fall that breaches the failure line is red, plus the failure word, plus a red rule under the ledger. That gives three channels for one state, which is what the accessibility guideline asks for.

Icons: one glyph per ledger, same 24 px grid, same stroke width, filled only in danger. Distinct silhouettes matter more than the metaphor, because silhouette survives at 16 px and metaphor does not. Seat blocs carry a shape as well as a party hue, so the whip count reads from shape and text alone.

## 4. Five mistakes to avoid

1. Letting the ledger strip animate as a group. Every number moving at once removes the pop-out that motion buys, so only the changed number moves.
2. Using red for a decrease. A shrinking treasury is not a crisis, and once red means two things it means nothing. Keep red for the failure line only.
3. Building a third disclosure level. A tab that opens a panel that opens a modal loses the player, and Nielsen names two levels as the ceiling.
4. Copying Democracy 4's icon field. Its overload is an authored feeling, not a default. A page that shows every link at once cannot be read in the five seconds the Desk has.
5. Shipping an unordered feed. Stellaris rebuilt its log because reverse chronological order with no grouping hides the one event that mattered. Group by subject, keep a stable sort, mark the unread.

## 5. On a 390 px phone

The strip, the chamber and the wire stay. The bill desk and the rail change state.

- Ledgers become one row of five cells about 70 px wide, label above, number below, hue in the rule under the number. No legend.
- The hemicycle keeps the centre but loses per-seat hover. Tapping a bloc opens the peek as a half-height sheet: the CK3 console move, a different control rather than a shrunken one.
- The bill desk becomes a bottom sheet, with the price tag docked above the keyboard so the cost is visible while typing.
- The rail becomes five bottom tabs in the thumb zone. The wire sits just above them, one line, truncated, tappable to expand.
- Minimum hit target 44 px. The ledger cells are themselves the tap targets for their peek, which buys a large Fitts target for free.
