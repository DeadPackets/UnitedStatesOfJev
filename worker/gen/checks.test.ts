import { expect, test } from "bun:test";
import {
  checkPlanSeat,
  checkRoster,
  fitHolderCount,
  hasProperNoun,
  holderCounts,
  quoted,
} from "./checks";
import fixture from "./fixtures/fridge-roster.json";
import type { Gathered } from "./gather";
import { applyRosterPatch, repairRoster } from "./roster";
import type { Caller } from "./openrouter";
import type { Group, Plan, Roster } from "./schemas";
import type { WikidataFacts } from "./wikidata";

const plan = fixture.plan as Plan;
const roster = fixture.roster as Roster;
// Each numbered document holds the quotes the fixture cites from it, and some lower-case words for the C3 rows below.
const docs = Array.from({ length: 10 }, (_, i) => ({
  index: i + 1,
  source: `Wikipedia: Page ${i + 1}`,
  title: `Page ${i + 1}`,
  text: `${roster.groups
    .filter((group) => group.doc === i + 1)
    .map((group) => group.quote)
    .join(
      " ",
    )} The crisper drawer vegetables sit in a humid drawer while the army marches. A food and drug administration keeps it cold.`,
}));
const gathered: Gathered = {
  docs,
  qids: {},
  facts: {},
  homeQids: [],
  spans: {},
  checklist: [],
  wikidataTable: "",
  sweepCategories: [],
};
const context = { plan, gathered };
const changed = (id: string, change: Partial<Group>): Roster => ({
  ...roster,
  groups: roster.groups.map((group) => (group.id === id ? { ...group, ...change } : group)),
});
const supports = (values: Record<string, number>): Roster => ({
  ...roster,
  groups: roster.groups.map((group) => ({ ...group, support: values[group.id] ?? group.support })),
});
const pantry = roster.groups.find((group) => group.id === "pantry")!;
const withAbroad = (count: number): Roster => ({
  ...roster,
  groups: [
    ...roster.groups,
    ...Array.from({ length: count }, (_, i) => ({
      ...pantry,
      id: `extra${i}`,
      name: `The Kelvinator ${i} Pantry`,
    })),
  ],
});

test("the fridge roster passes every check", () => {
  expect(checkRoster(roster, context)).toEqual([]);
});

test.each([
  ["a quote not in its document", changed("expiry", { quote: "Words no page holds." }), "C1"],
  [
    "an invented name with no proper noun",
    changed("crisper", { name: "The Crisper Drawer Vegetables" }),
    "C3",
  ],
  ["a generic name", changed("mould", { name: "The Army" }), "C10"],
  ["a rival that is the group itself", changed("mould", { rival: "mould" }), "C12"],
  ["seats that miss the chamber's size", changed("freshfood", { seats: 30 }), "C12"],
  [
    "an own group that is the public",
    { ...roster, ruler: { ...roster.ruler, own_group: "public" } },
    "C12",
  ],
  ["a backer with seats", { ...roster, ruler: { ...roster.ruler, backer: "freshfood" } }, "C12"],
  ["four groups on one support", supports({ expiry: 44, mould: 44, botulinum: 44 }), "C13"],
  [
    "supports spanning under 25 points",
    supports({ householder: 50, expiry: 52, mould: 54, botulinum: 56, pantry: 58, public: 60 }),
    "C13",
  ],
  [
    "the public named as one camp",
    changed("public", { name: "The Leave voters of the Fridge" }),
    "C14",
  ],
  ["two public groups", changed("pantry", { kind: "public" }), "C14"],
  [
    "a name joining three bodies",
    changed("mould", { name: "The Penicillium, Aspergillus and Rhizopus Moulds" }),
    "C14",
  ],
  ["six groups abroad and eleven on the desk", withAbroad(4), "C15"],
])("%s fails %s", (_label, changedRoster, check) => {
  expect(checkRoster(changedRoster as Roster, context).map((fail) => fail.check)).toContain(check);
});

const facts = (qid: string, change: Partial<WikidataFacts>): WikidataFacts => ({
  qid,
  label: qid,
  founded: null,
  dissolved: null,
  born: null,
  died: null,
  places: [],
  jurisdiction: [],
  positions: [],
  ...change,
});
test("Wikidata wins: a body founded after the start fails C4, and a ruler out of office on the start date fails C8", () => {
  const recorded = {
    plan: { ...plan, kind: 1, start_date: "1908-07-24", term_end: "1909-03-01" },
    gathered: {
      ...gathered,
      qids: { "Late Body": "Q1", "Kamil Pasha": "Q2" },
      facts: {
        Q1: facts("Q1", { founded: "1912" }),
        Q2: facts("Q2", {
          positions: [{ position: "Grand Vizier", from: "1885-09-25", to: "1891-09-04" }],
        }),
      },
    },
  };
  const found = checkRoster(
    {
      ...changed("mould", { grounding: "record", wiki: "Late Body" }),
      ruler: { ...roster.ruler, name: "Kamil Pasha", wiki: "Kamil Pasha", office: "Grand Vizier" },
    },
    recorded,
  );
  expect(found.some((fail) => fail.check === "C4" && fail.row === "mould")).toBe(true);
  expect(found.some((fail) => fail.check === "C8" && fail.row === "ruler")).toBe(true);
});

// The fridge's C3 repair renamed the FDA "The Silver Spring Food and Drug Administration".
test.each([
  ["a real body under its own page's name", "The Food and Drug Administration", "1906", false],
  ["a page without a founding date", "The Food and Drug Administration", null, true],
  ["a name that is not its page's", "The Cold Food Administration", "1906", true],
])("C3 on %s fails: %p", (_label, name, founded, fails) => {
  const wiki = "Food and Drug Administration";
  const real = {
    plan,
    gathered: { ...gathered, qids: { [wiki]: "Q1" }, facts: { Q1: facts("Q1", { founded }) } },
  };
  const found = checkRoster(changed("crisper", { name, wiki }), real).filter(
    (fail) => fail.check === "C3" && fail.row === "crisper",
  );
  expect(found.length > 0).toBe(fails);
});

// The Genghis build: the prompt named the man, the plan seated his chief minister.
test.each([
  ["Genghis Khan", "Prime Minister of Mongolia", "Luvsannamsrain Oyun-Erdene", ["P1"]],
  ["Genghis Khan", "Great Khan of Mongolia", "Genghis Khan", []],
  [null, "Prime Minister of Mongolia", "Luvsannamsrain Oyun-Erdene", []],
  ["Kublai", "Prime Minister of Mongolia", null, []],
])("prompt seat %p against seat %p held by %p", (promptSeat, office, holder, checks) => {
  const seated = { ...plan, prompt_seat: promptSeat, seat: { office, holder, holder_wiki: null } };
  expect(
    checkPlanSeat("Genghis Khan rules modern Mongolia", seated).map((fail) => fail.check),
  ).toEqual(checks);
});

test.each([
  ["Frozen foods remain safe indefinitely", 2, true],
  ["“Frozen foods ... indefinitely”", 2, true],
  ["Frozen foods remain safe forever", 2, false],
  ["Frozen foods remain safe indefinitely", 9, false],
  ["...", 2, false],
])("quote %p in document %p is found: %p", (quote, doc, found) => {
  expect(quoted(quote, doc, docs)).toBe(found);
});

test.each([
  ["The Perkins Fresh Food Party", true],
  ["The Crisper Drawer", false],
  ["The FDA Expiry Date", true],
])("%p has a proper noun: %p", (name, proper) => {
  expect(
    hasProperNoun(name, new Set(["crisper", "drawer", "expiry", "date", "fresh", "food", "party"])),
  ).toBe(proper);
});

test("fitting the desk moves the least important groups abroad out, and never the one above the seat", () => {
  const fitted = fitHolderCount(withAbroad(5));
  const counts = holderCounts(fitted);
  expect(counts.total).toBeLessThanOrEqual(10);
  expect(counts.abroad).toBeLessThanOrEqual(5);
  expect(fitted.groups.some((group) => group.id === "householder")).toBe(true);
  expect(fitted.excluded.filter((row) => row.why.startsWith("outside power"))).toHaveLength(2);
});

test("a repair patch replaces rows by id, takes out the rows it removes and can clear the fall", () => {
  const withFall = {
    ...roster,
    fall: { date: "0001-01-15", what: "Binned.", doc: null, quote: null },
  };
  const patched = applyRosterPatch(withFall, {
    groups: [{ ...pantry, name: "The Appert Tinned Goods" }],
    remove: ["botulinum"],
    excluded: [{ name: "The Clostridium Botulinum", why: "outside power" }],
    ruler: null,
    fall: null,
    fall_clear: true,
    chamber: null,
    chamber_clear: false,
  });
  expect(patched.groups.find((group) => group.id === "pantry")?.name).toBe(
    "The Appert Tinned Goods",
  );
  expect(patched.groups.some((group) => group.id === "botulinum")).toBe(false);
  expect(patched.fall).toBeNull();
  expect(patched.chamber).toEqual(roster.chamber);
});

// Lesson 10: the repair reads the failing row's own document first; the old cut kept the first 7 by index instead.
test("a roster repair shows the failing row's own document, then the pages that name it, to 90,000 characters", async () => {
  const page = (index: number, text: string) => ({
    index,
    source: `Wikipedia: Page ${index}`,
    title: `Page ${index}`,
    text,
  });
  const long = "x".repeat(40000);
  const many = [
    page(1, `The Penicillium Mould ${long}`),
    page(2, `The Penicillium Mould ${long}`),
    page(3, `The Penicillium Mould ${long}`),
    page(4, "Mouldy bread is not the group."),
    page(5, "The Penicillium Mould grew on the cheese."),
  ];
  let shown = "";
  const call = (async (request: { user: string }) => {
    shown = request.user;
    return {
      groups: [],
      remove: [],
      excluded: [],
      ruler: null,
      fall: null,
      fall_clear: false,
      chamber: null,
      chamber_clear: false,
    };
  }) as unknown as Caller;
  const failing = changed("mould", { wiki: null, doc: 5 });
  await repairRoster(
    call,
    failing,
    [{ check: "C1", row: "mould", message: "quote not found", docs: [5] }],
    { plan, gathered: { ...gathered, docs: many } },
  );
  expect([...shown.matchAll(/<document index="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([
    1, 2, 5,
  ]);
});
