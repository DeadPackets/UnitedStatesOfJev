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
