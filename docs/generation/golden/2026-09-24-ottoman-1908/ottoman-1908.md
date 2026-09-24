# The Sublime Porte after the revolution

Prompt: "The Ottoman Empire after the Young Turk Revolution, 1908". Scenario `k8ccvu`. Status: ready.
Run on 2026-09-24 with `bun scripts/golden-builds.ts` against the local worker.

## Time and money

| measure | value | target |
|---|---|---|
| total seconds | 440.7 | 220 |
| roster fragment (s from build start) | 130.7 |  |
| bible fragment (s from build start / from world start) | 195.7 / 65 | 90 |
| briefing fragment (s from build start / from world start) | 227.3 / 96.6 |  |
| Opus and Grok dollars (ledger) | 1.511 | 0.9 |
| calls (Grok) | 14 (0) |  |
| input tokens (cached) | 428048 (309906) |  |

| call | model | s | $ | in | out | reasoning | cached | cache write | finish |
|---|---|---|---|---|---|---|---|---|---|
| plan | anthropic/claude-opus-5.5 | 16.9 | 0.0543 | 4038 | 1933 | 1123 | 0 | 0 | stop |
| roster | anthropic/claude-opus-5.5 | 90.9 | 0.4371 | 55532 | 10969 | 6001 | 0 | 0 | stop |
| bible | anthropic/claude-opus-5.5 | 65 | 0.3133 | 33194 | 7609 | 3890 | 0 | 31536 | stop |
| groups3 | anthropic/claude-opus-5.5 | 10.5 | 0.0252 | 36353 | 700 | 507 | 35262 | 0 | stop |
| instruments | anthropic/claude-opus-5.5 | 10.7 | 0.0304 | 36713 | 894 | 603 | 35262 | 0 | stop |
| chamber | anthropic/claude-opus-5.5 | 11.9 | 0.033 | 36465 | 1071 | 700 | 35262 | 0 | stop |
| groups1 | anthropic/claude-opus-5.5 | 16.9 | 0.043 | 36448 | 1582 | 907 | 35262 | 0 | stop |
| theme | anthropic/claude-opus-5.5 | 17.3 | 0.0381 | 36972 | 1232 | 927 | 35262 | 0 | stop |
| ledgers | anthropic/claude-opus-5.5 | 19 | 0.0499 | 36592 | 1903 | 1261 | 35262 | 0 | stop |
| groups2 | anthropic/claude-opus-5.5 | 20 | 0.0509 | 36434 | 1984 | 1259 | 35262 | 0 | stop |
| briefing | anthropic/claude-opus-5.5 | 31.5 | 0.0983 | 36332 | 3502 | 2045 | 31536 | 3726 | stop |
| systems | anthropic/claude-opus-5.5 | 51.1 | 0.1517 | 37231 | 6022 | 3106 | 31536 | 3726 | stop |
| emblems | anthropic/claude-opus-5.5 | 65.5 | 0.1469 | 1688 | 7080 | 3927 | 0 | 0 | stop |
| emblem-review | anthropic/claude-opus-5.5 | 16.8 | 0.0389 | 4056 | 1155 | 901 | 0 | 0 | stop |

## The world

The Ottoman Empire, July 1908 to April 1909; The Sublime Porte, Constantinople. Grounded in the record of the Young Turk Revolution of July 1908, the 1908 Ottoman general election results (275 seats), and the grand viziers' dates of office in the Second Constitutional Era.
Ruler: Grand Vizier of the Ottoman Empire, keeper of the imperial seal at the Sublime Porte (faction liberty; own group porte; public people). Removed by: Sultan Abdul Hamid II can dismiss you by imperial rescript, the Committee of Union and Progress can force your resignation through the Army and the crowds, and from December 1908 the Chamber of Deputies can bring you down by a vote of no confidence.
Chamber: Chamber of Deputies, 72 seats, 36 to pass.

### Holders

| id | name | where | members | support | line | weight | gives | icon | emblem | card |
|---|---|---|---|---|---|---|---|---|---|---|
| sultan | Sultan Abdul Hamid II | home | none | 62 | 45 | 0.35 | 3 authority/turn | crown | yes | wants Palace names ministers, Honour the Caliph, Restore press censorship; hates **War Ministry to Porte**, Purge palace staff, Cut civil list; The Sultan dismisses the Grand Vizier by imperial rescript from Yıldız Palace. |
| porte | The Sublime Porte and the Council of Ministers | home | none | 68 | 50 |  |  | council | yes | wants Pay the officials, Cabinet names ministers; hates **Salonika names ministers**, Palace names ministers, Purge the bureaucracy; The ministers resign together, and the Porte's clerks leave every dossier unsigned. |
| army | The Ottoman Army | home | none | 45 | 30 | 0.2 |  | army | yes | wants Pay army arrears, Purge palace favourites, War Ministry to Porte; hates **Palace names ministers**, Cut army pay, Disband Third Army; Third Army officers march on Constantinople to force the Grand Vizier out. |
| ulema | The Ulema | home | none | 55 | 40 |  |  | clergy | yes | wants Uphold the Sharia, Honour the Caliph; hates **Non-Muslim equality**, Secular schools, Reform religious courts; The Şeyhülislam issues rulings against the government, and the mosques preach against it. |
| arf | Armenian Revolutionary Federation | home | none | 42 | 28 |  |  | party |  | wants Return seized land, Protect eastern villages, Amnesty Armenian exiles; hates **Restore Hamidian officials**, Disarm Armenians, Muslim precedence; The Dashnaks break with the Porte and call strikes and tax refusal in Van and Erzurum. |
| people | The Ottoman people | home | citizens | 48 | 30 |  |  | street |  | wants Cut bread prices, Lower taxes, Boycott Austrian goods; hates **Suspend the Constitution**, New taxes, Cede territory; Crowds fill Beyazıt and the bridges, shut the bazaars and march on the Porte. |
| austria | Austria-Hungary | abroad | none | 38 | 22 |  |  | foreign | yes | wants Accept Bosnian annexation, End the boycott, Open Ottoman markets; hates **Boycott Austrian goods**, Raise tariffs, Reinforce Novi Pazar; Vienna closes its markets and credit to Ottoman trade and presses the Powers against the Porte. |
| bulgaria | Principality of Bulgaria | abroad | none | 33 | 20 |  |  | foreign | yes | wants Recognise independence, Macedonian reforms, Amnesty IMRO bands; hates **Assert suzerainty**, Disarm IMRO, Favour Greek bands; Sofia seizes the railway through its lands, proclaims independence and sends IMRO bands back into Macedonia. |
| greece | Kingdom of Greece | abroad | none | 36 | 22 |  |  | foreign | yes | wants Cede Crete, Protect Patriarchists, Amnesty Greek bands; hates **Occupy Crete**, Hunt Greek bands, Favour Exarchate; Athens arms the Greek bands in Macedonia again and shuts Greek ports to Ottoman goods. |
| the_chamber | Chamber of Deputies | home | seats | 5 | 1 | 0.45 |  | chamber |  | none |

### Factions

| id | name | seats | tint | emblem | card |
|---|---|---|---|---|---|
| cup | Committee of Union and Progress | 71 | #c70e2d / #ee424c | yes | wants Cede war ministry, Purge palace men, Hold elections; hates **Palace names ministers**, Press censorship, Delay elections; The Committee brings Third Army officers and Unionist fedai into Constantinople and demands Kâmil Pasha in your place. |
| liberty | Liberty Party | 1 | #0067aa / #0288dd | yes | wants Decentralise provinces, Free canvass; hates **Officers in cabinet**, Arrest liberals, Centralise provinces; The Liberty Party turns its newspapers against the Porte and backs Kâmil Pasha for Grand Vizier. |

### Acts

| verb | name | consent | vetoes | available |
|---|---|---|---|---|
| decree | Grand Vizierial order under imperial sanction |  | sultan | true |
| law | Draft law before the General Assembly |  | sultan, chamber | true |
| appoint | Naming of ministers and governors |  | sultan | true |
| spend | Budget grant from the Treasury |  | chamber | true |
| proclaim | Porte communiqué to the press |  |  | true |
| favour | Grant of rank, decoration or pledge |  | sultan | true |
| force | Order to the Ministry of War |  | army, sultan | true |

### Pledges

| pledge | tag | for | quote | doc |
|---|---|---|---|---|
| Restore the Constitution of 1876 in full | restore-constitution | cup | forced Sultan Abdul Hamid II to restore the Constitution, recall the parliament, and schedule an election. | 2 |
| Reinstate the General Assembly after thirty years | recall-parliament | liberty | Reinstatement of the Parliament | 2 |
| Call general elections for the Chamber | call-general-elections | people | General elections are called | 2 |
| Abolish the Sultan's secret police | abolish-secret-police | people | abolishing the secret police | 13 |
| End censorship of the press | end-press-censorship | capital | rescinding press censorship powers | 13 |
| Leave war and navy ministers to the Sultan | sultan-names-ministers | sultan |  |  |
| Pay the arrears of the Rumelian regiments | pay-army-arrears | army |  |  |
| Guard the Sharia and the Caliph's standing | guard-sharia-caliph | ulema |  |  |

Members 72 (with a card: 72); citizens 250; deck 28; tags 24; sources 13. Theme: Libre Caslon Display on linen.

## Checks

| checks | before | after | left |
|---|---|---|---|
| bible-checks | 0 | 0 |  |
| checks-briefing | 0 | 0 |  |
| checks-chamber | 0 | 0 |  |
| checks-groups1 | 0 | 0 |  |
| checks-groups2 | 0 | 0 |  |
| checks-groups3 | 0 | 0 |  |
| checks-instruments | 0 | 0 |  |
| checks-ledgers | 0 | 0 |  |
| checks-systems | 0 | 0 |  |
| checks-theme | 0 | 0 |  |
| roster-checks | 0 | 0 |  |

Emblems: {"asked":11,"drawn":11,"kept":9,"namesOnly":false,"dropped":[{"id":"arf","reason":"does not read at 28 px"},{"id":"people","reason":"does not read at 28 px"}]}
