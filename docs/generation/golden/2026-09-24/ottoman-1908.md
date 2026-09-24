# Journal of the Sublime Porte, 1908 to 1909

Prompt: "The Ottoman Empire after the Young Turk Revolution, 1908". Scenario `gdzq8b`. Status: ready.
Run on 2026-09-24 with `bun scripts/golden-builds.ts` against the local worker.

## Time and money

| measure | value | target |
|---|---|---|
| total seconds | 392.1 | 220 |
| roster fragment (s from build start) | 194.1 |  |
| bible fragment (s from build start / from world start) | 263.6 / 60.8 | 90 |
| briefing fragment (s from build start / from world start) | 304.7 / 101.9 |  |
| Opus and Grok dollars (ledger) | 2.227 | 0.9 |
| calls (Grok) | 15 (0) |  |
| input tokens (cached) | 625697 (393870) |  |

| call | model | s | $ | in | out | reasoning | cached | cache write | finish |
|---|---|---|---|---|---|---|---|---|---|
| plan | anthropic/claude-opus-5.5 | 22.9 | 0.0556 | 4038 | 2000 | 1174 | 0 | 0 | stop |
| roster | anthropic/claude-opus-5.5 | 142.2 | 0.704 | 89894 | 17578 | 7278 | 0 | 0 | stop |
| roster-repair | anthropic/claude-opus-5.5 | 8.3 | 0.1581 | 36816 | 620 | 261 | 0 | 0 | stop |
| bible | anthropic/claude-opus-5.5 | 60.7 | 0.343 | 41045 | 7144 | 2702 | 0 | 39387 | stop |
| groups3 | anthropic/claude-opus-5.5 | 9.2 | 0.0426 | 44971 | 640 | 434 | 39387 | 0 | stop |
| instruments | anthropic/claude-opus-5.5 | 12.2 | 0.0502 | 45332 | 952 | 678 | 39387 | 0 | stop |
| theme | anthropic/claude-opus-5.5 | 12.6 | 0.0512 | 45548 | 959 | 676 | 39387 | 0 | stop |
| chamber | anthropic/claude-opus-5.5 | 15.6 | 0.0595 | 45120 | 1464 | 810 | 39387 | 0 | stop |
| groups2 | anthropic/claude-opus-5.5 | 16.4 | 0.0598 | 45035 | 1496 | 824 | 39387 | 0 | stop |
| factions2 | anthropic/claude-opus-5.5 | 17.1 | 0.0647 | 44941 | 1764 | 1058 | 39387 | 0 | stop |
| groups1 | anthropic/claude-opus-5.5 | 19.9 | 0.0675 | 45054 | 1882 | 1268 | 39387 | 0 | stop |
| ledgers | anthropic/claude-opus-5.5 | 20.8 | 0.0671 | 45168 | 1840 | 1150 | 39387 | 0 | stop |
| briefing | anthropic/claude-opus-5.5 | 41.1 | 0.1228 | 44906 | 4706 | 3274 | 39387 | 0 | stop |
| systems | anthropic/claude-opus-5.5 | 53.5 | 0.1591 | 45860 | 6346 | 2331 | 39387 | 0 | stop |
| emblems | anthropic/claude-opus-5.5 | 102.5 | 0.2216 | 1969 | 10798 | 6127 | 0 | 0 | stop |

## The world

Ottoman Empire, 1908 to 1909; The Sublime Porte, Constantinople. Grounded in the record of the Second Constitutional Era: the 1908 Ottoman general election results, the restored 1876 constitution, and Wikidata dates for Grand Viziers.
Ruler: Grand Vizier of the Ottoman Empire, head of the first constitutional cabinet at the Sublime Porte (faction liberty; own group liberty; public public). Removed by: Sultan Abdul Hamid II can dismiss you by imperial decree, the Chamber of Deputies can vote you out by no confidence, and the Committee of Union and Progress can press both to do so.
Chamber: Chamber of Deputies, 72 seats, 36 to pass.

### Holders

| id | name | where | members | support | line | weight | gives | icon | emblem | card |
|---|---|---|---|---|---|---|---|---|---|---|
| sultan | Sultan Abdul Hamid II | home | none | 56 | 40 | 0.3 |  | crown |  | wants Palace allowance, Name senators, Curb the Committee; hates **Strip royal sanction**, Cut palace staff; The Sultan dismisses the Grand Vizier by imperial decree from Yıldız Palace. |
| cup | Committee of Union and Progress | home | none | 44 | 30 | 0.25 |  | party |  | wants Consult the Committee, Centralise provinces, Boycott Austrian goods; hates **Replace war minister**, Decentralise provinces; The Central Committee orders its deputies to force a vote of confidence, and Tanin turns on the cabinet. |
| army | Ottoman Army | home | none | 50 | 35 |  |  | army |  | wants Pay arrears, Merit promotion, Suppress the bands; hates **Cut army pay**, Amnesty band fighters; The Hunter battalions refuse orders, and Third Army officers march on Constantinople to seat a war minister they trust. |
| imro | Internal Macedonian Revolutionary Organization | home | none | 40 | 25 |  |  | army |  | wants Amnesty band fighters, Exarchist schools, Macedonian autonomy; hates **Village reprisals**, Disarm the bands; The centralist bands return to the hills and resume raids across Ottoman Macedonia. |
| public | the people of the Ottoman Empire | home | citizens | 55 | 38 |  |  | street |  | wants Cut taxes, Bread relief, Defy the Powers; hates Raise taxes, **Cede territory**, Press censorship; Crowds fill the squares of Constantinople, and porters refuse Austrian cargo on every quay. |
| uk | United Kingdom | abroad | none | 66 | 48 |  |  | foreign |  | wants Liberal reforms, British advisers, Protect British trade; hates German concessions, Unionist ministers, **German alliance**; London withholds loans and leaves the Porte alone before the Powers. |
| ah | Austria-Hungary | abroad | none | 36 | 20 |  |  | foreign |  | wants Accept annexation, End the boycott, Trade treaty; hates Back the boycott, Garrison Novi Pazar, **Reclaim Bosnia**; Vienna closes its markets to Ottoman trade and presses the Powers to confirm the annexation. |
| bulgaria | Principality of Bulgaria | abroad | none | 38 | 22 |  |  | foreign |  | wants Recognise independence, Exarchist schools, Railway settlement; hates Demand compensation, Troops to border, **Deny independence**; Sofia keeps the Oriental Railway and sends money and rifles to the Internal Macedonian Revolutionary Organization. |
| greece | Kingdom of Greece and the Hellenic Macedonian Committee | abroad | none | 42 | 27 |  |  | foreign |  | wants Cede Crete, Protect Greek schools, Patriarchate privileges; hates **Occupy Crete**, Amnesty Bulgarian bands, Exarchist schools; Athens closes its ports to Ottoman shipping, funds more Greek bands in Ottoman Macedonia and backs the Cretans' union. |
| the_chamber | Chamber of Deputies | home | seats | 31 | 16 | 0.45 |  | chamber |  | none |

### Factions

| id | name | seats | tint | emblem | card |
|---|---|---|---|---|---|
| turks | Turkish deputies | 36 | #c8102e / #f34750 |  | wants Centralise provinces, Unionist ministers, Boycott Austrian goods; hates **Replace war minister**, Decentralisation, Bribes; Votes the cabinet out on a motion of no confidence, on the Central Committee's word. |
| arabs | Arab deputies | 15 | #2a792e / #49974b |  | wants Arabic in offices, Posts for notables; hates **Turkish-only offices**, Unionist ministers, Centralise provinces; Crosses to the Unionist benches on the next vote of confidence. |
| albanians | Albanian deputies | 7 | #1c1c1c / #878787 |  | wants Albanian schools, Local autonomy; hates **Disarm highlands**, Centralise provinces, Turkish-only schools; Walks out of the Chamber and sends word to the highlands to keep their rifles. |
| greeks | Greek deputies | 6 | #1f5fa8 / #4a89d5 |  | wants Patriarchate privileges, Greek schools, Conscription exemption; hates **Conscript Christians**, Centralise provinces, Unionist ministers; Votes with the Unionists and asks the Ecumenical Patriarchate to protest among the Powers. |
| armenians | Armenian deputies | 3 | #b22222 / #e6564e |  | wants Return Armenian lands, Disarm Kurdish tribes, Consult the Committee; hates **Arm Kurdish tribes**, Snub the Committee, Bribes; Its 14 deputies vote with the Turkish deputies against the cabinet and carry the land question to the Central Committee. |
| slavs | Slav deputies | 2 | #2e5c8a / #5b8abb |  | wants Protect Exarchist schools, End village reprisals, Amnesty band fighters; hates **Seize Exarchist churches**, Martial law, Favour Patriarchate; Its 10 deputies walk out of the Chamber of Deputies and take reports of reprisals to the foreign consuls in Salonica. |
| jews | Jewish deputies | 2 | #886400 / #d4a017 |  | wants Equal civic rights, Protect port trade, Ottomanist schooling; hates **Restrict non-Muslim rights**, Disrupt port trade, Millet quotas; Its 4 deputies side with the Salonica Unionists and vote against the cabinet on the next vote of confidence. |
| liberty | Liberty Party | 1 | #247847 / #469662 |  | wants Decentralise provinces, British reform advisers, Dismiss Unionist ministers; hates **Appoint Unionist ministers**, Centralise provinces, Press censorship; Prince Sabahaddin withdraws the party's support and calls the cabinet the Committee's servant in the Constantinople press. |

### Acts

| verb | name | consent | vetoes | available |
|---|---|---|---|---|
| decree | Imperial irade on the Porte's submission |  | sultan | true |
| law | Draft law before the General Assembly |  | chamber, sultan | true |
| appoint | Appointment of ministers and governors |  | sultan | true |
| spend | Credit in the budget |  | chamber | true |
| proclaim | Communiqué to the Constantinople press |  |  | true |
| favour | Grant of rank, post or decoration |  |  | true |
| force | State of siege and orders to the troops |  | army | true |

### Pledges

| pledge | tag | for | quote | doc |
|---|---|---|---|---|
| Abolish the secret police | abolish-secret-police | public | abolishing the secret police | 14 |
| End press censorship across the empire | end-press-censorship | liberty | rescinding press censorship powers | 14 |
| Allow free canvass before the elections | free-election-canvass | cup | permitting free political campaigning ahead of a general election held during November and December | 14 |
| War and Navy appointments to the Sublime Porte | war-navy-to-porte | army | the transfer of navy and army ministerial appointments away from the sultan to the office of the grand vizier | 14 |
| Elect all 275 seats of the Chamber | elect-full-chamber | arabs | General elections were held in November and December 1908 for all 275 seats of the Chamber of Deputies of the Ottoman Empire | 3 |
| Keep the Sultan's sanction over draft laws | keep-imperial-sanction | sultan |  |  |
| Seek British help with reform | british-reform-help | uk |  |  |
| Amnesty for Macedonian band fighters | macedonian-band-amnesty | imro |  |  |

Members 72 (with a card: 72); citizens 250; deck 29; tags 24; sources 15. Theme: Amiri on parchment.

## Checks

| checks | before | after | left |
|---|---|---|---|
| bible-checks | 0 | 0 |  |
| checks-briefing | 0 | 0 |  |
| checks-chamber | 0 | 0 |  |
| checks-factions2 | 0 | 0 |  |
| checks-groups1 | 0 | 0 |  |
| checks-groups2 | 0 | 0 |  |
| checks-groups3 | 0 | 0 |  |
| checks-instruments | 0 | 0 |  |
| checks-ledgers | 0 | 0 |  |
| checks-systems | 0 | 0 |  |
| checks-theme | 0 | 0 |  |
| roster-checks | 1 | 0 |  |

Emblems: {"asked":17,"drawn":17,"kept":0,"namesOnly":false,"dropped":[{"id":"sultan","reason":"not reviewed"},{"id":"cup","reason":"not reviewed"},{"id":"army","reason":"not reviewed"},{"id":"imro","reason":"not reviewed"},{"id":"public","reason":"not reviewed"},{"id":"uk","reason":"not reviewed"},{"id":"ah","reason":"not reviewed"},{"id":"bulgaria","reason":"not reviewed"},{"id":"greece","reason":"not reviewed"},{"id":"turks","reason":"not reviewed"},{"id":"arabs","reason":"not reviewed"},{"id":"albanians","reason":"not reviewed"},{"id":"greeks","reason":"not reviewed"},{"id":"armenians","reason":"not reviewed"},{"id":"slavs","reason":"not reviewed"},{"id":"jews","reason":"not reviewed"},{"id":"liberty","reason":"not reviewed"}]}
