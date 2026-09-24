# Chronicle of the Hand

Prompt: "Westeros, 298 AC". Scenario `9vp372`. Status: ready.
Run on 2026-09-24 with `bun scripts/golden-builds.ts` against the local worker.

## Time and money

| measure | value | target |
|---|---|---|
| total seconds | 229.3 | 220 |
| roster fragment (s from build start) | 71.3 |  |
| bible fragment (s from build start / from world start) | 126.1 / 54.8 | 90 |
| briefing fragment (s from build start / from world start) | 156.5 / 85.2 |  |
| Opus and Grok dollars (ledger) | 1.353 | 0.9 |
| calls (Grok) | 14 (0) |  |
| input tokens (cached) | 382983 (247456) |  |

| call | model | s | $ | in | out | reasoning | cached | cache write | finish |
|---|---|---|---|---|---|---|---|---|---|
| plan | anthropic/claude-opus-5.5 | 16 | 0.0405 | 4024 | 1240 | 636 | 0 | 0 | stop |
| roster | anthropic/claude-opus-5.5 | 53.1 | 0.3339 | 53085 | 6247 | 3141 | 0 | 0 | stop |
| bible | anthropic/claude-opus-5.5 | 54.9 | 0.2876 | 32590 | 6463 | 2979 | 0 | 30932 | stop |
| groups3 | anthropic/claude-opus-5.5 | 4.5 | 0.028 | 35523 | 185 | 0 | 30932 | 0 | stop |
| theme | anthropic/claude-opus-5.5 | 9.1 | 0.0413 | 36135 | 734 | 431 | 30932 | 0 | stop |
| instruments | anthropic/claude-opus-5.5 | 10.9 | 0.0424 | 35899 | 841 | 571 | 30932 | 0 | stop |
| ledgers | anthropic/claude-opus-5.5 | 16.3 | 0.0577 | 35755 | 1641 | 1053 | 30932 | 0 | stop |
| groups1 | anthropic/claude-opus-5.5 | 19.4 | 0.0623 | 35621 | 1900 | 1202 | 30932 | 0 | stop |
| groups2 | anthropic/claude-opus-5.5 | 19.4 | 0.0619 | 35598 | 1885 | 1221 | 30932 | 0 | stop |
| briefing | anthropic/claude-opus-5.5 | 30.4 | 0.0908 | 35351 | 3393 | 2020 | 30932 | 0 | stop |
| systems | anthropic/claude-opus-5.5 | 45.5 | 0.13 | 36406 | 5161 | 1566 | 30932 | 0 | stop |
| emblems | anthropic/claude-opus-5.5 | 59.8 | 0.1266 | 1519 | 6091 | 3545 | 0 | 0 | stop |
| emblem-review | anthropic/claude-opus-5.5 | 16.2 | 0.0397 | 3343 | 1335 | 1122 | 0 | 0 | stop |
| rewrite | anthropic/claude-opus-5.5 | 2.2 | 0.0099 | 2134 | 74 | 0 | 0 | 0 | stop |

## The world

The Seven Kingdoms, 298 to 299 AC; The Tower of the Hand, the Red Keep, King's Landing. Grounded in George R. R. Martin's A Song of Ice and Fire book canon: the small council, the great houses and the events of A Game of Thrones, 298 AC.
Ruler: Hand of the King, chair of the small council in the Tower of the Hand, the Red Keep (faction stark; own group stark; public people). Removed by: King Robert can dismiss you at will, and if he dies, a regent or the new king can strip you of the Hand of the King and arrest you for treason.
Chamber: small council, 24 seats, 13 to pass.

### Holders

| id | name | where | members | support | line | weight | gives | icon | emblem | card |
|---|---|---|---|---|---|---|---|---|---|---|
| crown | King Robert I Baratheon | home | none | 68 | 50 | 0.6 |  | crown | yes | wants Fund the tourney, Hunt the Targaryens; hates Cut royal feasts, Spare Daenerys Targaryen, **Defy royal command**; King Robert takes back the Hand's chain and sends Lord Eddard home to Winterfell. |
| lannister | Queen Cersei Lannister and House Lannister | home | none | 32 | 15 | 0.4 |  | patrons |  | wants Confirm Joffrey's succession, Borrow from Casterly Rock, Close the inquiry; hates Summon Lord Tywin, Arrest Tyrion Lannister, **Question Joffrey's birth**; The queen sets Lannister swords and the Kingsguard to seize the Hand and his daughters. |
| stark | House Stark | home | none | 70 | 50 |  |  | army | yes | wants Justice for Bran, Protect Stark daughters, Call northern banners; hates Bribes, Pardon Gregor Clegane, **Surrender Stark daughters**; Robb Stark keeps the northern bannermen at home and sends no swords south. |
| baelish | Petyr Baelish and the City Watch | home | none | 45 | 30 |  |  | council | yes | wants Grant lands, Borrow more gold, Pay the Watch; hates Audit the treasury, **Replace Master of Coin**; Littlefinger turns the gold cloaks of the City Watch against the Hand at the hour of need. |
| varys | Varys | home | none | 55 | 40 |  |  | council | yes | wants Delay open war, Fund informers; hates Declare war, Reward Baelish, **Dismiss Varys**; Varys carries the Hand's secrets to the queen, and his little birds stop whispering to the Tower of the Hand. |
| stannis | Stannis Baratheon | home | none | 50 | 35 |  |  | army | yes | wants Expose the bastards, Name Stannis heir; hates **Recognize Joffrey**, Bribes, Pardon Lannisters; Stannis keeps the royal fleet at Dragonstone and refuses the Crown his ships and swords. |
| targaryen | House Targaryen | abroad | none | 30 | 15 |  |  | foreign |  | wants War with Lannisters, Spare Daenerys; hates **Assassinate Daenerys**, Watch the Narrow Sea; Viserys presses the Dothraki to ready a crossing of the Narrow Sea, and old loyalists at court whisper for him. |
| ironbank | Iron Bank of Braavos | abroad | none | 48 | 30 |  |  | market | yes | wants Repay the loans, Cut royal spending; hates **Default on debt**, Hold a tourney, Borrow more gold; The Iron Bank calls in the Crown debt and lends its gold to the King's enemies instead. |
| people | The people of the Seven Kingdoms | home | citizens | 58 | 40 |  |  | street | yes | wants Store winter grain, Punish Riverlands raiders, Keep the peace; hates Raise the taxes, **Seize grain stores**, Fund the tourney; The smallfolk of King's Landing riot in Flea Bottom and stone the Hand's men at the city gates. |

### Factions

| id | name | seats | tint | emblem | card |
|---|---|---|---|---|---|
| crown | King Robert I Baratheon | 12 | #7b6100 / #c9a227 | yes | wants Fund the tourney, Hunt the Targaryens; hates Cut royal feasts, Spare Daenerys Targaryen, **Defy royal command**; King Robert takes back the Hand's chain and sends Lord Eddard home to Winterfell. |
| lannister | Queen Cersei Lannister and House Lannister | 8 | #9b1b1b / #dc5c52 |  | wants Confirm Joffrey's succession, Borrow from Casterly Rock, Close the inquiry; hates Summon Lord Tywin, Arrest Tyrion Lannister, **Question Joffrey's birth**; The queen sets Lannister swords and the Kingsguard to seize the Hand and his daughters. |
| stark | House Stark | 1 | #576672 / #788793 | yes | wants Justice for Bran, Protect Stark daughters, Call northern banners; hates Bribes, Pardon Gregor Clegane, **Surrender Stark daughters**; Robb Stark keeps the northern bannermen at home and sends no swords south. |
| baelish | Petyr Baelish and the City Watch | 1 | #346f52 / #569172 | yes | wants Grant lands, Borrow more gold, Pay the Watch; hates Audit the treasury, **Replace Master of Coin**; Littlefinger turns the gold cloaks of the City Watch against the Hand at the hour of need. |
| varys | Varys | 1 | #6b4c8a / #9778b9 | yes | wants Delay open war, Fund informers; hates Declare war, Reward Baelish, **Dismiss Varys**; Varys carries the Hand's secrets to the queen, and his little birds stop whispering to the Tower of the Hand. |
| stannis | Stannis Baratheon | 1 | #7b6100 / #c9a227 | yes | wants Expose the bastards, Name Stannis heir; hates **Recognize Joffrey**, Bribes, Pardon Lannisters; Stannis keeps the royal fleet at Dragonstone and refuses the Crown his ships and swords. |

### Acts

| verb | name | consent | vetoes | available |
|---|---|---|---|---|
| decree | Decree under the Hand's seal |  | crown | true |
| law | Law of the realm |  |  | false |
| appoint | Appointment to royal office |  | crown, lannister | true |
| spend | Warrant on the royal treasury |  | baelish | true |
| proclaim | Proclamation in the King's name |  | crown | true |
| favour | Grant of the Hand's favour |  |  | true |
| force | Command of the City Watch and the Hand's guard |  | crown, baelish | true |

### Pledges

| pledge | tag | for | quote | doc |
|---|---|---|---|---|
| Pay for the Hand's Tourney in full | fund-hands-tourney | crown |  |  |
| Pay the Iron Bank on every due date | bank-repayment-schedule | ironbank |  |  |
| Keep Sansa and Arya safe at court | daughters-kept-safe | stark |  |  |
| Honour Joffrey Baratheon as the King's heir | joffrey-succession-honoured | lannister |  |  |
| Leave the Master of Whisperers' informers untouched | spare-whisperer-network | varys |  |  |
| Bring the Riverlands raiders to justice | riverlands-raider-justice | riverlands |  |  |
| Store grain in royal granaries for winter | winter-grain-stores | people |  |  |
| Keep the northern bannermen ready to march | north-bannermen-ready | north |  |  |

Members 24 (with a card: 24); citizens 250; deck 31; tags 24; sources 12. Theme: IM Fell English SC on parchment.

## Checks

| checks | before | after | left |
|---|---|---|---|
| bible-checks | 0 | 0 |  |
| checks-briefing | 0 | 0 |  |
| checks-groups1 | 0 | 0 |  |
| checks-groups2 | 0 | 0 |  |
| checks-groups3 | 0 | 0 |  |
| checks-instruments | 0 | 0 |  |
| checks-ledgers | 0 | 0 |  |
| checks-systems | 0 | 0 |  |
| checks-theme | 0 | 0 |  |
| roster-checks | 0 | 0 |  |

Emblems: {"asked":9,"drawn":9,"kept":7,"namesOnly":false,"dropped":[{"id":"lannister","reason":"does not read at 28 px"},{"id":"targaryen","reason":"does not read at 28 px"}]}
