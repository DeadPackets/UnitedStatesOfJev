import { expect, test } from "bun:test";
import type { Emblem } from "../emblem";
import { ESCALATION_KEYS, VERBS } from "../pack";
import { DEFAULT_THEME_TOKENS } from "../tokens";
import {
  BACKER_AUTHORITY,
  CHAMBER_HOLDER,
  calendarOf,
  frameOf,
  packOf,
  type BuildParts,
} from "./assemble";
import { assignCitizens, assignMembers } from "./assign";
import fixture from "./fixtures/fridge-roster.json";
import { factionIds, type Bible, type Plan, type Roster, type World } from "./schemas";

const plan = fixture.plan as Plan;
const roster = fixture.roster as Roster;
const card = {
  wants: ["Clean shelves", "Cold door"],
  hates: [
    { tag: "Warm nights", red_line: true },
    { tag: "Bribes", red_line: false },
  ],
  strike: "Stops voting with you.",
};
const colour = (index: number) => `#${(0x224466 + index * 0x0a0a0a).toString(16).padStart(6, "0")}`;

function bibleFor(from: Roster): Bible {
  return {
    house_voice: "Hansard of the Parliament of the Fridge",
    tone: ["Short sentences.", "Solemn.", "Never winks."],
    grounding: from.grounding_line,
    title: "The Parliament of the Fridge",
    era: "Days 1 to 21 after the weekly shop",
    place: "The Middle Shelf",
    year: 1,
    vocabulary: {
      seat: "Prime Minister",
      chamber: "Parliament of the Fridge",
      member: "member",
      bill: "Shelf Bill",
      pass: "carried",
      fail: "left on the shelf",
      capital: "chill",
      turn: "day",
      midterm: "the sniff test",
      campaign: "the canvass",
      test: "the clear-out",
      feed: "the door log",
      post: "notice",
      whip: "whip",
      lobby: "lobby",
      promise: "pledge",
      patron: "backer",
      approval: "freshness",
      file: "Shelf record",
      abroad: "beyond the door",
    },
    terms: [],
    history: [{ date: "0001-01-01", beat: "The weekly shop restocks every shelf." }],
    groups: from.groups.map((group) => ({
      id: group.id,
      name: group.name,
      short: group.name.slice(4, 20),
      identity: group.wants,
      face: `${group.name} speaker`,
      face_role: "spokesman, an invented voice",
    })),
    regions: ["top", "middle", "bottom", "door", "crisper", "freezer"].map((id) => ({
      id,
      name: `The ${id} shelf`,
    })),
  };
}

function worldFor(from: Roster, bible: Bible, change: Partial<World> = {}): World {
  const seats = from.groups.filter((group) => group.seats !== null);
  const tags = Array.from({ length: 16 }, (_, i) => `policy-${i + 1}`);
  const offer = { label: "An offer", text: "The Prime Minister offers a shelf." };
  const resource = (name: string) => ({
    name,
    start: 40,
    line: 0,
    for: "What keeps the shelves cold.",
    earn: ["The weekly shop"],
    spend: ["An open door"],
    fails: "the milk turns.",
    icon: "drop" as const,
  });
  return {
    bible,
    groups: from.groups
      .filter((group) => group.seats === null)
      .map((group, i) => ({
        id: group.id,
        icon: "council" as const,
        color: colour(i),
        line: group.support - 15,
        response: "strike" as const,
        ...card,
      })),
    chamber:
      from.chamber && seats.length
        ? {
            name: "Parliament of the Fridge",
            shape: "hemicycle",
            threshold: 31,
            tie: null,
            factions: seats.map((group, i) => ({
              id: group.id,
              color: colour(i + 8),
              with_you: group.id === "door",
              ...card,
            })),
          }
        : null,
    briefing: {
      ruler: { role: "Prime Minister", removed_by: "The Householder can bin you at any time." },
      briefing: {
        situation: "The weekly shop is in. The milk is fresh. The mould waits in the corner.",
        room: "The Householder can bin you.",
        you: "You hold the Middle Shelf.",
      },
      problems: Array.from({ length: 8 }, (_, i) => `Problem ${i + 1}.`),
      pledges: Array.from({ length: 8 }, (_, i) => ({
        text: `Pledge ${i + 1}`,
        tag: `pledge-${i + 1}`,
        for: "public",
        quote: null,
        doc: null,
      })),
    },
    ledgers: {
      treasury: resource("Larder"),
      authority: resource("Chill"),
      chest: resource("Tupper"),
      loyalty: { name: "Loyalty", start: 60, line: 20 },
      popularity: { name: "Freshness", start: 50, line: 30 },
    },
    instruments: Object.fromEntries(
      VERBS.map((verb) => [
        verb,
        {
          name: `The ${verb}`,
          available: true,
          vetoes:
            verb === "law"
              ? ["chamber"]
              : verb === "decree"
                ? ["householder"]
                : verb === "force"
                  ? ["mould"]
                  : [],
        },
      ]),
    ) as World["instruments"],
    systems: {
      tags,
      blocs: Array.from({ length: 5 }, (_, i) => ({
        id: `bloc-${i}`,
        name: `Bloc ${i}`,
        description: "The eggs of the door.",
      })),
      patrons: Array.from({ length: 10 }, (_, i) => ({
        id: `patron-${i}`,
        name: `Patron ${i}`,
        wants: [tags[i]],
        hates: ["not-a-tag", tags[i + 1]],
      })),
      regions: bible.regions.map((region) => ({
        id: region.id,
        weight: 2,
        lean: factionIds(from).map((faction) => ({ faction, value: 0.2 })),
      })),
      test: {
        name: "the clear-out",
        win: "You stay on the shelf.",
        lose: "You are binned.",
        reveal: "both",
      },
      endings: {
        reelected: "Kept",
        defeated: "Binned",
        lame_duck: "Wilted",
        impeached: "Thrown out",
        coup: null,
        stopped: null,
        dismissed: "Binned by the hand",
      },
      lobby: { pork: offer, favor: offer, threat: offer },
      escalations: ESCALATION_KEYS.map((key) => ({ key, name: key, headline: `${key} headline.` })),
    },
    theme: DEFAULT_THEME_TOKENS,
    ...change,
  };
}

const partsFor = (
  from: Roster,
  change: Partial<World> = {},
  emblems: Record<string, Emblem> = {},
): BuildParts => ({
  id: "fridge",
  prompt: fixture.prompt,
  plan,
  gathered: {
    docs: [],
    qids: {},
    facts: {},
    homeQids: [],
    spans: {},
    checklist: [],
    wikidataTable: "",
    sweepCategories: [],
  },
  roster: from,
  world: worldFor(from, bibleFor(from), change),
  emblems,
});
const build = (parts: BuildParts) => {
  const frame = frameOf(parts);
  return packOf(parts, {
    members: assignMembers(frame).map((member, i) => ({ ...member, name: `Member ${i}` })),
    citizens: assignCitizens(frame).map((citizen, i) => ({ ...citizen, name: `Citizen ${i}` })),
    deck: Array.from({ length: 20 }, (_, i) => ({
      id: `gen-${i + 1}`,
      kind: "generic" as const,
      weight: 1,
      title_hint: "A shelf matter",
      stances: ["Act", "Wait"],
      scored: ["none" as const],
      results: [],
    })),
  });
};

test("the fridge world assembles into a pack the game parses: one holder per group without seats, then the chamber", () => {
  const pack = build(partsFor(roster));
  expect(pack.constitution!.holders.map((holder) => holder.id)).toEqual([
    "householder",
    "expiry",
    "mould",
    "botulinum",
    "pantry",
    "public",
    CHAMBER_HOLDER,
  ]);
  expect(pack.factions.map((faction) => faction.id)).toEqual([
    "freshfood",
    "crisper",
    "freezer",
    "door",
    "tupperware",
  ]);
  expect(pack.chamber).toMatchObject({ size: 60, threshold: 31 });
  expect(pack.constitution!.holders.find((holder) => holder.id === CHAMBER_HOLDER)).toMatchObject({
    members: "seats",
    support: 62,
  });
});

test("own party is one row: the ruler's chamber party is a faction and the own group, never a holder", () => {
  const pack = build(partsFor(roster));
  expect(pack.constitution!.ownGroup).toBe("freshfood");
  expect(pack.constitution!.ruler.faction).toBe("freshfood");
  expect(pack.constitution!.holders.some((holder) => holder.id === "freshfood")).toBe(false);
  expect(pack.starts.find((start) => start.faction === "freshfood")?.coalition).toEqual([
    "freshfood",
    "door",
  ]);
});

test("the public group is the public row's holder, read from the citizens", () => {
  const pack = build(partsFor(roster));
  expect(pack.constitution!.publicGroup).toBe("public");
  expect(pack.constitution!.holders.find((holder) => holder.id === "public")?.members).toBe(
    "citizens",
  );
});

test.each([
  ["expiry", "expiry"],
  ["householder", null],
  [null, null],
])("with backer %p, the holder that gives authority each turn is %p", (backer, giver) => {
  const pack = build(partsFor({ ...roster, ruler: { ...roster.ruler, backer } }));
  const givers = pack.constitution!.holders.filter((holder) => holder.gives);
  expect(givers.map((holder) => holder.id)).toEqual(giver ? [giver] : []);
  if (giver)
    expect(givers[0].gives).toEqual({ ledger: "authority", amount: BACKER_AUTHORITY, per: "turn" });
});

test("the holders that vote are banded between 0.15 and 0.6 and sum to 1; the chamber votes with its blocs' share", () => {
  const weights = build(partsFor(roster)).constitution!.retention.weights;
  expect(weights.map((weight) => weight.id)).toEqual(["householder", CHAMBER_HOLDER]);
  expect(weights.reduce((total, weight) => total + weight.value, 0)).toBeCloseTo(1, 2);
  expect(weights.every((weight) => weight.value >= 0.15 && weight.value <= 0.6)).toBe(true);
});

test("a chamber over 72 seats is drawn at 72 and its threshold scales from the real one", () => {
  const real = { freshfood: 147, crisper: 64, freezer: 37, door: 23, tupperware: 4 } as Record<
    string,
    number
  >;
  const big: Roster = {
    ...roster,
    chamber: { ...roster.chamber!, real_size: 275 },
    groups: roster.groups.map((group) =>
      group.seats === null ? group : { ...group, seats: real[group.id] },
    ),
  };
  const parts = partsFor(big);
  parts.world.chamber!.threshold = 138;
  const pack = build(parts);
  expect(pack.chamber).toMatchObject({ size: 72, threshold: 36 });
  expect(pack.members).toHaveLength(72);
});

test("a world with no chamber seats a court of 24 from its home groups, and law is unavailable", () => {
  const court: Roster = {
    ...roster,
    chamber: null,
    ruler: { ...roster.ruler, own_group: "expiry" },
    groups: roster.groups.filter((group) => group.seats === null),
  };
  const pack = build(partsFor(court));
  expect(pack.factions.map((faction) => faction.id)).toEqual(["expiry", "mould", "botulinum"]);
  expect(pack.chamber.size).toBe(24);
  expect(pack.members).toHaveLength(24);
  expect(pack.constitution!.instruments.law.available).toBe(false);
  expect(pack.constitution!.holders.some((holder) => holder.id === CHAMBER_HOLDER)).toBe(false);
});

test("pledge tags join the tags, and a patron's tag outside them is dropped", () => {
  const pack = build(partsFor(roster));
  expect(pack.tags).toContain("pledge-1");
  expect(pack.tags.length).toBeLessThanOrEqual(24);
  expect(pack.patrons[0].hates).not.toContain("not-a-tag");
  expect(pack.promises[0]).toEqual({ tag: "pledge-1", label: "Pledge 1" });
});

test("a card that breaks R36 leaves its holder without a glance, and emblems and faces land on their rows", () => {
  const disc: Emblem = {
    size: 64,
    elements: [{ tag: "circle", cx: 32, cy: 32, r: 26, fill: "ink" }],
  };
  const parts = partsFor(roster, {}, { mould: disc });
  parts.world.groups[0].hates = [
    { tag: "A", red_line: true },
    { tag: "B", red_line: true },
  ];
  const pack = build(parts);
  const holders = pack.constitution!.holders;
  expect(holders.find((holder) => holder.id === "householder")?.glance).toBeUndefined();
  expect(holders.find((holder) => holder.id === "mould")?.emblem).toEqual(disc);
  expect(holders.find((holder) => holder.id === "expiry")?.glance?.face?.name).toBe(
    "The FDA Expiry Date speaker",
  );
  expect(holders.find((holder) => holder.id === "expiry")?.tint?.light).toMatch(/^#[0-9a-f]{6}$/);
  expect(pack.themeTokens).toBeDefined();
});

test.each([
  ["0001-01-01", "0001-01-21", "day", "0001-01-01"],
  ["1908-07-24", "1908-12-11", "week", "1908-07-24"],
  ["2021-01-20", "2022-09-21", "month", "2021-01-20"],
  ["1789-05-05", "1794-05-05", "season", "1789-05-05"],
  ["-44-03-15", "-0044-08-02", "week", "-0044-03-15"],
])("a term from %p to %p runs in %ps from %p", (start, end, unit, first) => {
  expect(calendarOf({ ...plan, start_date: start, term_end: end })).toEqual({
    start_date: first,
    unit,
  });
});
