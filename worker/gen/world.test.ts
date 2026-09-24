import { expect, test } from "bun:test";
import { z } from "zod";
import { ESCALATION_KEYS, VERBS } from "../pack";
import fixture from "./fixtures/fridge-roster.json";
import { GROK, ModelStop, OPUS, type Caller, type CallRequest } from "./openrouter";
import {
  VocabularySchema,
  type Bible,
  type FactionRow,
  type GroupRow,
  type Plan,
  type Roster,
} from "./schemas";
import {
  checkBible,
  checkPart,
  mergeWorld,
  planJobs,
  worldCall,
  type Job,
  type WorldContext,
} from "./world";

const plan = fixture.plan as Plan;
const roster = fixture.roster as Roster;
const card = {
  wants: ["Cold shelves"],
  hates: [{ tag: "Warm nights", red_line: true }],
  strike: "Stops voting with you.",
};
const groupRow = (id: string, icon: GroupRow["icon"] = "council"): GroupRow => ({
  id,
  icon,
  color: "#224466",
  line: 30,
  response: "strike",
  ...card,
});
const factionRow = (id: string): FactionRow => ({ id, color: "#663322", with_you: false, ...card });
const bible = {
  vocabulary: Object.fromEntries(
    Object.keys(VocabularySchema.shape).map((key) => [key, key === "abroad" ? null : "word"]),
  ),
  terms: [],
  groups: roster.groups.map((group) => ({
    id: group.id,
    name: group.name,
    short: group.name.slice(0, 16),
    identity: group.wants,
    face: "A voice",
    face_role: "speaker, an invented voice",
  })),
  regions: ["top", "middle", "bottom", "door", "crisper", "freezer"].map((id) => ({
    id,
    name: `The ${id} shelf`,
  })),
} as unknown as Bible;
const context: WorldContext = {
  prefix: "",
  roster,
  bible,
  model: OPUS,
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
};
const job = (name: string): Job => planJobs(roster).find((candidate) => candidate.name === name)!;

test("the parts are chunks of four groups and blocs, then one call per other part", () => {
  expect(planJobs(roster).map((part) => [part.name, part.ids?.length ?? 0])).toEqual([
    ["groups1", 4],
    ["groups2", 2],
    ["chamber", 4],
    ["factions2", 1],
    ["briefing", 0],
    ["ledgers", 0],
    ["instruments", 0],
    ["systems", 0],
    ["theme", 0],
  ]);
  expect(planJobs({ ...roster, chamber: null }).some((part) => part.kind === "chamber")).toBe(
    false,
  );
});

// Lesson 25: a chunk wrote all 8 factions instead of its 4.
test.each([
  [
    "the owner's row wins over a row another chunk wrote",
    [groupRow("pantry", "army")],
    [groupRow("pantry", "foreign")],
    "foreign",
  ],
  ["a row only another chunk wrote fills the gap", [groupRow("pantry", "army")], [], "army"],
])("%s", (_label, strayRows, ownRows, icon) => {
  const parts = {
    groups1: {
      groups: [
        ...["householder", "expiry", "mould", "botulinum"].map((id) => groupRow(id)),
        ...strayRows,
      ],
    },
    groups2: { groups: ownRows },
    chamber: {
      chamber: {
        name: "Parliament",
        shape: "hemicycle",
        threshold: 31,
        tie: null,
        factions: ["freshfood", "crisper", "freezer", "door"].map(factionRow),
      },
    },
    factions2: { factions: [] },
    briefing: {},
    ledgers: { ledgers: {} },
    instruments: { instruments: {} },
    systems: {},
    theme: { theme: null },
  };
  const world = mergeWorld(roster, bible, parts, planJobs(roster));
  expect(world.groups.map((row) => row.id)).toEqual([
    "householder",
    "expiry",
    "mould",
    "botulinum",
    "pantry",
  ]);
  expect(world.groups.find((row) => row.id === "pantry")?.icon).toBe(icon);
  expect(world.chamber?.factions.map((row) => row.id)).toEqual([
    "freshfood",
    "crisper",
    "freezer",
    "door",
  ]);
});

const pledges = (count: number, change: Partial<{ for: string; tag: string }> = {}) =>
  Array.from({ length: count }, (_, i) => ({
    text: `Pledge ${i}`,
    tag: `pledge-${i}`,
    for: "public",
    quote: null,
    doc: null,
    ...change,
  }));
const briefing = (change: Record<string, unknown> = {}) => ({
  ruler: { role: "Prime Minister", removed_by: "The hand can bin you." },
  briefing: { situation: "The shop is in.", room: "The hand decides.", you: "You hold the shelf." },
  problems: Array.from({ length: 8 }, (_, i) => `Problem ${i}.`),
  pledges: pledges(8),
  ...change,
});
const instruments = (vetoes: string[]) => ({
  instruments: Object.fromEntries(
    VERBS.map((verb) => [
      verb,
      { name: verb, available: true, vetoes: verb === "decree" ? vetoes : [] },
    ]),
  ),
});
const systems = (change: Record<string, unknown> = {}) => ({
  tags: Array.from({ length: 16 }, (_, i) => `policy-${i}`),
  blocs: Array.from({ length: 5 }, (_, i) => ({
    id: `bloc${i}`,
    name: `Bloc ${i}`,
    description: "Eggs.",
  })),
  patrons: Array.from({ length: 10 }, (_, i) => ({
    id: `patron${i}`,
    name: `Patron ${i}`,
    wants: ["policy-1"],
    hates: ["policy-2"],
  })),
  regions: bible.regions.map((region) => ({
    id: region.id,
    weight: 1,
    lean: [{ faction: "freshfood", value: 0.2 }],
  })),
  test: { name: "the clear-out", win: "You stay.", lose: "You go.", reveal: "both" },
  endings: {
    reelected: "Kept",
    defeated: "Binned",
    lame_duck: "Wilted",
    impeached: "Out",
    coup: null,
    stopped: null,
    dismissed: null,
  },
  lobby: {
    pork: { label: "A", text: "A." },
    favor: { label: "B", text: "B." },
    threat: { label: "C", text: "C." },
  },
  escalations: ESCALATION_KEYS.map((key) => ({ key, name: key, headline: `${key}.` })),
  ...change,
});

test.each([
  ["a chunk that misses one of its rows", "groups2", { groups: [groupRow("pantry")] }, ["W2"]],
  [
    "a card with two red lines",
    "groups2",
    {
      groups: [
        groupRow("pantry"),
        {
          ...groupRow("public"),
          hates: [
            { tag: "A", red_line: true },
            { tag: "B", red_line: true },
          ],
        },
      ],
    },
    ["W7"],
  ],
  ["a clean chunk", "groups2", { groups: [groupRow("pantry"), groupRow("public")] }, []],
  ["seven pledges", "briefing", briefing({ pledges: pledges(7) }), ["W6"]],
  [
    "a pledge for nobody",
    "briefing",
    briefing({ pledges: [...pledges(7), ...pledges(1, { for: "nobody", tag: "odd" })] }),
    ["W6"],
  ],
  [
    "a pledge to the own party in the chamber",
    "briefing",
    briefing({ pledges: [...pledges(7), ...pledges(1, { for: "freshfood", tag: "own" })] }),
    [],
  ],
  ["a veto no act lists", "instruments", instruments([]), ["W5"]],
  ["every veto listed", "instruments", instruments(["householder"]), []],
  ["nine patrons", "systems", systems({ patrons: systems().patrons.slice(0, 9) }), ["W11"]],
  [
    "a missing escalation",
    "systems",
    systems({ escalations: systems().escalations.slice(1) }),
    ["W11"],
  ],
  ["a region with no weight", "systems", systems({ regions: systems().regions.slice(1) }), ["W11"]],
  ["a clean systems part", "systems", systems(), []],
])("%s", (_label, name, part, checks) => {
  expect(checkPart(job(name), part, context).map((fail) => fail.check)).toEqual(checks);
});

test("a grounded world needs 4 of 8 pledges quoted word for word from the documents", () => {
  const promises = [
    "to open the Chamber",
    "to free the press",
    "to pay the army",
    "to end the censor",
  ];
  const grounded: WorldContext = {
    ...context,
    plan: { ...plan, kind: 1 },
    roster: { ...roster, ruler: { ...roster.ruler, name: "Kamil Pasha", wiki: "Kamil Pasha" } },
    gathered: {
      ...context.gathered,
      docs: [
        {
          index: 1,
          source: "Wikipedia: Programme",
          title: "Programme",
          text: `He promised ${promises.join(", ")}.`,
        },
      ],
    },
  };
  const quotedPledges = (count: number) =>
    pledges(8).map((pledge, i) => (i < count ? { ...pledge, quote: promises[i], doc: 1 } : pledge));
  expect(
    checkPart(job("briefing"), briefing({ pledges: quotedPledges(3) }), grounded).map(
      (fail) => fail.check,
    ),
  ).toEqual(["W10"]);
  expect(checkPart(job("briefing"), briefing({ pledges: quotedPledges(4) }), grounded)).toEqual([]);
});

test.each([
  ["a bible with five regions", { ...bible, regions: bible.regions.slice(1) }],
  ["a bible missing a group", { ...bible, groups: bible.groups.slice(1) }],
])("%s fails B1", (_label, broken) => {
  expect(checkBible(broken as Bible, roster).map((fail) => fail.check)).toContain("B1");
});

// Lesson 6: Opus refuses some premises outright; a filtered world call goes once to Grok, a length stop does not.
test.each([
  ["content_filter", [OPUS, GROK], GROK],
  ["length", [OPUS], null],
])("a %s stop on Opus calls %p and answers from %p", async (reason, models, answeredBy) => {
  const seen: string[] = [];
  const call = (async (request: CallRequest<unknown>) => {
    seen.push(request.model!);
    if (request.model !== GROK) throw new ModelStop(reason as "length", "stopped");
    return { ok: true };
  }) as unknown as Caller;
  const result = await worldCall(call, {
    name: "bible",
    schema: z.object({ ok: z.boolean() }),
    system: "",
    user: "",
    maxTokens: 1,
  }).catch(() => null);
  expect(seen).toEqual(models);
  expect(result?.model ?? null).toBe(answeredBy);
});
