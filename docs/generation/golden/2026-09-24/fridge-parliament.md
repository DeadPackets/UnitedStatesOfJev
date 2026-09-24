# Hansard of the Parliament of the Fridge

Prompt: "The Parliament of the Fridge". Scenario `7wiyp8`. Status: ready.
Run on 2026-09-24 with `bun scripts/golden-builds.ts` against the local worker.

## Time and money

| measure | value | target |
|---|---|---|
| total seconds | 274.6 | 220 |
| roster fragment (s from build start) | 86.7 |  |
| bible fragment (s from build start / from world start) | 143.4 / 46.9 | 90 |
| briefing fragment (s from build start / from world start) | 174.5 / 78 |  |
| Opus and Grok dollars (ledger) | 1.193 | 0.9 |
| calls (Grok) | 14 (0) |  |
| input tokens (cached) | 324525 (201592) |  |

| call | model | s | $ | in | out | reasoning | cached | cache write | finish |
|---|---|---|---|---|---|---|---|---|---|
| plan | anthropic/claude-opus-5.5 | 12.3 | 0.0319 | 4025 | 805 | 333 | 0 | 0 | stop |
| roster | anthropic/claude-opus-5.5 | 66.4 | 0.2961 | 38242 | 7308 | 3828 | 0 | 0 | stop |
| roster-repair | anthropic/claude-opus-5.5 | 8.9 | 0.0629 | 11913 | 793 | 444 | 0 | 0 | stop |
| bible | anthropic/claude-opus-5.5 | 46.9 | 0.2378 | 26857 | 5378 | 1881 | 0 | 25199 | stop |
| instruments | anthropic/claude-opus-5.5 | 8.9 | 0.0396 | 30105 | 765 | 504 | 25199 | 0 | stop |
| theme | anthropic/claude-opus-5.5 | 12.6 | 0.0486 | 30415 | 1161 | 851 | 25199 | 0 | stop |
| groups1 | anthropic/claude-opus-5.5 | 13.6 | 0.0487 | 29882 | 1270 | 709 | 25199 | 0 | stop |
| groups2 | anthropic/claude-opus-5.5 | 13.6 | 0.0463 | 29858 | 1155 | 646 | 25199 | 0 | stop |
| emblems | anthropic/claude-opus-5.5 | 14.6 | 0.0269 | 1648 | 1029 | 1029 | 0 | 0 | content_filter |
| chamber | anthropic/claude-opus-5.5 | 16.4 | 0.0557 | 29986 | 1606 | 924 | 25199 | 0 | stop |
| ledgers | anthropic/claude-opus-5.5 | 16.7 | 0.0536 | 30035 | 1486 | 916 | 25199 | 0 | stop |
| briefing | anthropic/claude-opus-5.5 | 31 | 0.094 | 29669 | 3599 | 2239 | 25199 | 0 | stop |
| emblems-names | anthropic/claude-opus-5.5 | 19 | 0.0303 | 1235 | 1282 | 1282 | 0 | 0 | content_filter |
| systems | anthropic/claude-opus-5.5 | 42.7 | 0.1205 | 30655 | 4743 | 1550 | 25199 | 0 | stop |

## The world

The Fridge, September to October 2026; The Parliament of the Fridge, top shelf. The Fridge's own logic of shelf life, spoilage, the cold chain and fresh food against leftovers, played straight through Westminster patterns of coalition, confidence votes and dissolution, with the Householder as a sovereign who reigns and also eats.
Ruler: Prime Minister of the Fridge (faction dairy; own group dairy; public public). Removed by: The Householder can throw you in the Bin, veto any motion by eating its sponsor, or order the Defrost; the Parliament can vote you out on a confidence motion; and the Expiry Date printed on your carton removes you when it passes.
Chamber: the Parliament, 38 seats, 20 to pass.

### Holders

| id | name | where | members | support | line | weight | gives | icon | emblem | card |
|---|---|---|---|---|---|---|---|---|---|---|
| householder | The Householder | home | none | 50 | 32 | 0.4 |  | crown |  | wants Clear old food, Cut waste, Hold the cold; hates **Warm the Fridge**, Hide spoiled food; The Householder opens the door, eats your sponsor or throws you in the Bin. |
| public | The Foodstuffs of the Fridge | home | citizens | 48 | 30 |  |  | street |  | wants Steady cold, Protect dated items; hates **Bin early**, Cut the Compressor; The Foodstuffs block the vents on every shelf and ignore the Clerk's orders. |
| clostridium | The Clostridium Front | home | none | 30 | 15 |  |  | army |  | wants Raise the Thermostat, Seal the containers; hates **Freeze the meat**, Open the containers; The Clostridium Front seizes the sealed jars and makes the door shelves unsafe. |
| mould | The Barwon Mould Legion | home | none | 33 | 18 |  |  | army |  | wants Raise humidity, Delay the clear-out; hates **Clear the back**, Wipe the shelves; The Barwon Mould Legion spreads along the middle shelf until the Householder smells it. |
| freezer | The Linde Freezer Compartment | home | none | 52 | 36 |  |  | council |  | wants Compressor priority, Divert cold upward, Lower the Thermostat; hates **Order a Defrost**, Raise humidity, Cut Compressor power; The Linde Freezer Compartment hoards the Compressor's cold above the cabinet and lets every shelf below it warm. |
| frigidaire | Frigidaire | abroad | none | 60 | 42 |  |  | foreign |  | wants Cut energy use, Avoid service calls; hates **Claim the Warranty**, Run Compressor harder; Frigidaire voids the Warranty from beyond the kitchen and refuses any service call to the cabinet. |
| fda | The Silver Spring Food and Drug Administration | abroad | none | 45 | 27 |  |  | foreign |  | wants Hold Recommended Mark, Clear spoiled food, Enforce Four-Step Code; hates **Raise the Thermostat**, Bribes; The Silver Spring Food and Drug Administration posts a notice on the door that the Fridge fails the Recommended Mark. |
| the_chamber | the Parliament | home | seats | 71 | 56 | 0.6 |  | chamber |  | none |

### Factions

| id | name | seats | tint | emblem | card |
|---|---|---|---|---|---|
| dairy | The Pasteur Dairy Bloc | 14 | #796b35 / #e8d9a0 |  | wants Lower the Thermostat, Bin the leftovers, Reserve top shelf; hates **Raise the Thermostat**, Shield the leftovers; Salted Butter withholds the Dairy Bloc's 14 votes and lets the Prime Minister's carton sour on the confidence motion. |
| leftovers | The Thanksgiving Leftovers Bloc | 11 | #8b5a2b / #b07c4d |  | wants Guarantee against Bin, Leftovers eaten first, Enforce rotation; hates **Bin the leftovers**, Waive rotation; Cold Turkey moves no confidence from the middle shelf and offers the Householder the opposition's 11 containers as dinner. |
| crisper | The Geelong Crisper Greens | 8 | #1a7c17 / #3f9b3a |  | wants Raise humidity, Keep frost off, Protect crisper drawer; hates **Divert cold upward**, Lower humidity; Romaine Lettuce takes the Crisper Greens' 8 seats out of the coalition, leaving the government 14 of 38. |
| door | The Appert Door Conserves | 5 | #b0243a / #e45763 |  | wants Permanent door seats, Honour sealed jars; hates **Clear the door**, Open sealed jars, Favour the crisper; Strawberry Jam sells the Door Conserves' 5 votes to the Thanksgiving Leftovers Bloc for a pledge of permanent seats. |

### Acts

| verb | name | consent | vetoes | available |
|---|---|---|---|---|
| decree | A Prime Minister's order from the top shelf |  | householder | true |
| law | A motion carried in the Parliament |  | chamber | true |
| appoint | A seat on the government bench of the top shelf |  |  | true |
| spend | A vote of chill |  | chamber | true |
| proclaim | A notice on the door |  |  | true |
| favour | A pledge of shelf space |  |  | true |
| force | An order to clear the back of the Fridge |  | householder | true |

### Pledges

| pledge | tag | for | quote | doc |
|---|---|---|---|---|
| Hold the Thermostat at the Recommended Mark | hold-recommended-mark | fda |  |  |
| Clear the back of the middle shelf | clear-back-shelf | back |  |  |
| Raise the Humidity Dial in the drawer | raise-humidity-dial | crisper |  |  |
| Guarantee permanent seats in the door | permanent-door-seats | door |  |  |
| No member binned before the Expiry Date | no-early-binning | public |  |  |
| Give the Freezer first call on the Compressor | freezer-compressor-priority | freezer |  |  |
| Fresh food at every Opening of the Door | fresh-at-every-opening | householder |  |  |
| Enforce the First In First Out Rule | enforce-first-in-first-out | leftovers |  |  |

Members 38 (with a card: 38); citizens 250; deck 29; tags 24; sources 11. Theme: Libre Caslon Display on glass.

## Checks

| checks | before | after | left |
|---|---|---|---|
| bible-checks | 0 | 0 |  |
| checks-briefing | 0 | 0 |  |
| checks-chamber | 0 | 0 |  |
| checks-groups1 | 0 | 0 |  |
| checks-groups2 | 0 | 0 |  |
| checks-instruments | 0 | 0 |  |
| checks-ledgers | 0 | 0 |  |
| checks-systems | 0 | 0 |  |
| checks-theme | 0 | 0 |  |
| roster-checks | 1 | 0 |  |

Emblems: {"asked":11,"drawn":0,"kept":0,"namesOnly":true,"dropped":[{"id":"householder","reason":"not drawn"},{"id":"dairy","reason":"not drawn"},{"id":"leftovers","reason":"not drawn"},{"id":"crisper","reason":"not drawn"},{"id":"door","reason":"not drawn"},{"id":"public","reason":"not drawn"},{"id":"clostridium","reason":"not drawn"},{"id":"mould","reason":"not drawn"},{"id":"freezer","reason":"not drawn"},{"id":"frigidaire","reason":"not drawn"},{"id":"fda","reason":"not drawn"}]}
