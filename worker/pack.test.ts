import { test, expect } from "bun:test";
import { GlanceSchema, PackSchema, scaleSeats, packView, type Citizen } from "./pack";
import { DEFAULT_THEME_TOKENS, fitThemeTokens } from "./tokens";
import { CARD_MOVE, encodeCode, newGame, scenarioTag, type Quote } from "./engine";
import { commit, priceTag } from "./acts";
import mini from "./fixtures/mini.json";

const BLOCS = ["dockworkers", "merchants", "fisherfolk", "clergy", "students"];
const REGIONS = mini.regions.map((r) => r.id);

function makeCitizens(): Citizen[] {
  const citizens: Citizen[] = [];
  for (const bloc of BLOCS) {
    for (let i = 0; i < 50; i++) {
      citizens.push({
        id: `${bloc}-${i}`,
        region: REGIONS[i % REGIONS.length],
        bloc,
        name: `Citizen ${bloc} ${i}`,
        age: 20 + (i % 50),
        job: "harbor worker",
        town: "Harbor City",
        worldview: "wants the harbor to stay prosperous",
        issues: ["tariffs", "dockworker-pay"],
        weight: 1,
      });
    }
  }
  return citizens;
}

test("fixture parses with generated citizens, and a stored pack's old art is dropped", () => {
  const art = { masthead: "masthead.png", crests: [], portraits: [] };
  const pack = { ...mini, citizens: makeCitizens(), art };
  const parsed = PackSchema.parse(pack);
  expect("art" in parsed).toBe(false);
  expect(parsed.members.length).toBe(24);
  expect(parsed.citizens.length).toBe(250);
  expect(parsed.escalations.length).toBe(20);
});

test("starts out of factions order fails validation", () => {
  const pack = { ...mini, citizens: makeCitizens(), starts: [...mini.starts].reverse() };
  expect(() => PackSchema.parse(pack)).toThrow("starts must follow factions order");
});

test("scaleSeats uses largest remainder with a minimum of one seat", () => {
  const seats = scaleSeats(
    { SPD: 206, CDU: 197, Greens: 118, FDP: 92, AfD: 83, Linke: 39, SSW: 1 },
    100,
  );
  expect(seats).toEqual({ SPD: 28, CDU: 27, Greens: 16, FDP: 12, AfD: 11, Linke: 5, SSW: 1 });
});

test("scaleSeats clamps to size when forced minimums overflow", () => {
  const shares: Record<string, number> = { dominant: 999989 };
  for (let i = 0; i < 11; i++) shares[`minor${i}`] = 1;
  const seats = scaleSeats(shares, 24);
  expect(Object.values(seats).reduce((a, b) => a + b, 0)).toBe(24);
  expect(Object.values(seats).every((v) => v >= 1)).toBe(true);
  expect(seats.dominant).toBe(13);
});

test("packView strips citizens and member personas", () => {
  const pack = PackSchema.parse({ ...mini, citizens: makeCitizens() });
  const view = packView(pack);
  const json = JSON.stringify(view);
  expect((view as any).citizens).toBeUndefined();
  expect(json).not.toContain('"bio"');
  expect(json).not.toContain('"tell"');
  expect(json).not.toContain("worldview");
});

import { ConstitutionSchema } from "./pack";
import { mkConstitution } from "./gen/fixture";

const CONSTITUTION = mkConstitution();

test("the constitution parses, fills its defaults and needs all seven verbs", () => {
  const c = ConstitutionSchema.parse(CONSTITUTION);
  expect(c.retention.bar).toEqual({ start: 0.5, step: 0.03, cap: 0.7 });
  expect(c.holders[0].stance).toBe(0.5);
  expect(c.holders[3].gives).toEqual({ ledger: "treasury", amount: 4, per: "turn" });
  const { force: _gone, ...six } = CONSTITUTION.instruments;
  expect(() => ConstitutionSchema.parse({ ...CONSTITUTION, instruments: six })).toThrow();
});

test("a pack stored before the constitution existed still parses", () => {
  // Task 10 gives mini.json a constitution of its own, so strip it: this test is about the field's absence.
  const { constitution: _c, ...noC } = mini as Record<string, unknown>;
  const parsed = PackSchema.parse({ ...noC, citizens: makeCitizens() });
  expect(parsed.constitution).toBeUndefined();
});

test("a pack with a constitution parses and the view keeps holder prose in the worker", () => {
  const parsed = PackSchema.parse({
    ...mini,
    citizens: makeCitizens(),
    constitution: CONSTITUTION,
  });
  expect(parsed.constitution!.holders.length).toBe(4);
  const json = JSON.stringify(packView(parsed));
  expect(json).not.toContain('"bio"');
  expect(json).not.toContain('"tell"');
  expect(json).toContain('"briefing"');
});

// R36, emblems and level B themes: every new field is optional, and a malformed one drops alone.
const GLANCE = {
  wants: ["Toll relief"],
  hates: [{ tag: "Closing the reef", redLine: true }],
  strike: "Keeps its boats in port",
};
const EMBLEM = { size: 24, elements: [{ tag: "circle", cx: 12, cy: 12, r: 5, fill: "ink" }] };
const TINT = { light: "#2553a3", dark: "#7aa2ff" };
const dressed = (extra: Record<string, unknown>, tokens: unknown) => ({
  ...mini,
  citizens: makeCitizens(),
  themeTokens: tokens,
  factions: mini.factions.map((f) => ({ ...f, ...extra })),
  members: mini.members.map((m) => ({ ...m, glance: extra.glance })),
  constitution: {
    ...mini.constitution,
    holders: mini.constitution.holders.map((h) => ({ ...h, ...extra, icon: "court" })),
  },
});

test("glance cards, emblems, tints, icons and theme tokens survive a parse", () => {
  const parsed = PackSchema.parse(
    dressed({ glance: GLANCE, emblem: EMBLEM, tint: TINT }, DEFAULT_THEME_TOKENS),
  );
  const holder = parsed.constitution!.holders[0];
  expect([holder.glance, holder.emblem, holder.tint, holder.icon]).toEqual([
    GLANCE,
    EMBLEM,
    TINT,
    "court",
  ]);
  expect([parsed.factions[0].glance, parsed.members[0].glance]).toEqual([GLANCE, GLANCE]);
  expect(parsed.themeTokens).toEqual(DEFAULT_THEME_TOKENS);
});

test("a malformed glance, emblem, tint or theme drops to undefined and the pack still loads", () => {
  const bad = {
    glance: { ...GLANCE, hates: [{ tag: "Closing the reef", redLine: false }] }, // no red line
    emblem: { size: 24, elements: [{ tag: "script" }] },
    tint: { light: "red", dark: "#7aa2ff" },
  };
  const parsed = PackSchema.parse(dressed(bad, { ...DEFAULT_THEME_TOKENS, display: "Comic Sans" }));
  const holder = parsed.constitution!.holders[0];
  expect([holder.glance, holder.emblem, holder.tint]).toEqual([undefined, undefined, undefined]);
  expect([parsed.factions[0].glance, parsed.members[0].glance]).toEqual([undefined, undefined]);
  expect(parsed.themeTokens).toBeUndefined();
});

for (const [label, hates] of [
  ["no red line", [{ tag: "A", redLine: false }]],
  [
    "two red lines",
    [
      { tag: "A", redLine: true },
      { tag: "B", redLine: true },
    ],
  ],
] as [string, { tag: string; redLine: boolean }[]][]) {
  test(`a glance card with ${label} fails the write check`, () => {
    expect(GlanceSchema.safeParse({ ...GLANCE, hates }).success).toBe(false);
  });
}

// The desk mock's two worlds as engine v2 packs (scripts/era-fixture.ts): Track D builds against these.
const decree = (touches: string[]): Quote => ({
  verb: "decree",
  title: "An order",
  reading: "You sign an order.",
  power: true,
  era: true,
  refusal: null,
  credibility: 1,
  cost: { authority: 0, treasury: 0, chest: 0 },
  revenue: [],
  serves: [],
  hits: [],
  keeps: [],
  targets: null,
  tags: [],
  touches,
  regions: [],
  promises: [],
  sunset: null,
  template: null,
});
for (const [file, ruler, touch, group] of [
  ["biden-2021", "dem", "relief checks", "public"],
  ["westeros", "baratheon", "safe roads", "smallfolk"],
] as const) {
  test(`the ${file} fixture has a glance card, tint and icon on every group, and its groups answer an act`, async () => {
    const pack = PackSchema.parse(
      await Bun.file(`${import.meta.dir}/fixtures/${file}.json`).json(),
    );
    for (const holder of pack.constitution!.holders) {
      expect(holder.glance?.hates.filter((hate) => hate.redLine)).toHaveLength(1);
      expect([holder.tint, holder.icon].every(Boolean)).toBe(true);
    }
    for (const faction of pack.factions) expect(faction.glance).toBeDefined();
    expect(fitThemeTokens(pack.themeTokens!).fixes).toEqual([]);
    const code = encodeCode({
      scenario: scenarioTag(pack.id),
      faction: pack.factions.findIndex((faction) => faction.id === ruler),
      promises: [0, 1, 2],
      seed: 7,
    });
    const promises = pack.promises.slice(0, 3).map((promise) => promise.tag);
    const game = newGame("g", code, pack, ruler, promises, pack.calendar);
    const before = game.holders[group].support;
    commit(pack, game, priceTag(pack, game, decree([touch])));
    expect(game.holders[group].support).toBe(before + CARD_MOVE[1]);
  });
}
