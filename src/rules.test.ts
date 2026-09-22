import { expect, test } from "bun:test";
import { LEDGER_KEYS, danger, hueClass, roomTo } from "./rules";

test("the five ledgers keep their order and their hue class", () => {
  expect(LEDGER_KEYS).toEqual(["treasury", "authority", "chest", "loyalty", "popularity"]);
  expect(LEDGER_KEYS.map(hueClass)).toEqual(["r-tre", "r-aut", "r-che", "r-loy", "r-pop"]);
});

test("the room to the failure line is never negative", () => {
  expect(roomTo(38, 0)).toBe(38);
  expect(roomTo(47, 20)).toBe(27);
  expect(roomTo(12, 20)).toBe(0);
});

test("danger fires at the line, not below it", () => {
  expect(danger(21, 20)).toBe(false);
  expect(danger(20, 20)).toBe(true);
  expect(danger(19, 20)).toBe(true);
});

import { ledgerDelta, ledgerValue } from "./rules";

const game = {
  ledgers: { treasury: 38, authority: 14, chest: 120, loyalty: 47, popularity: { north: 60, south: 40 } },
  pack: { regions: [{ id: "north", weight: 3 }, { id: "south", weight: 1 }] },
  wire: [
    { kind: "ledger", ledger: "treasury", delta: -4, cause: "farm credit" },
    { kind: "ledger", ledger: "popularity", id: "north", delta: 2, cause: "the post" },
    { kind: "ledger", ledger: "treasury", delta: 1, cause: "the levy" },
    { kind: "resistance", id: "senate", delta: 12, cause: "the levy" },
  ],
} as never;

test("popularity reads as the weighted national number, the rest read straight", () => {
  expect(ledgerValue(game, "treasury")).toBe(38);
  expect(ledgerValue(game, "popularity")).toBe(55);
});

test("a ledger's delta sums only this turn's ledger lines, never a resistance move", () => {
  expect(ledgerDelta(game, "treasury")).toBe(-3);
  expect(ledgerDelta(game, "popularity")).toBe(2);
  expect(ledgerDelta(game, "chest")).toBe(0);
  expect(ledgerDelta(game, "authority")).toBe(0);
});

import { wireHue, wireLabel } from "./rules";

test("a wire line names its ledger, its region when it has one, and its cause", () => {
  const names = new Map([["north", "Etruria"], ["senate", "The senate"]]);
  expect(wireLabel({ kind: "ledger", ledger: "popularity", id: "north", delta: 2, cause: "the post" }, names))
    .toBe("popularity, Etruria, the post");
  expect(wireLabel({ kind: "ledger", ledger: "treasury", delta: -4, cause: "farm credit" }, names))
    .toBe("treasury, farm credit");
});

test("a resistance line prints the holder's name, never a raw id", () => {
  const names = new Map([["senate", "The senate"]]);
  expect(wireLabel({ kind: "resistance", id: "senate", delta: 12, cause: "the levy" }, names))
    .toBe("The senate, the levy");
  expect(wireLabel({ kind: "resistance", id: "curia", delta: 4, cause: "the levy" }, names))
    .toBe("curia, the levy");
});

test("a resistance or card line is danger, a ledger or promise line takes its ledger's hue", () => {
  expect(wireHue({ kind: "ledger", ledger: "chest", delta: -20, cause: "reach" })).toBe("r-che");
  expect(wireHue({ kind: "promise", ledger: "popularity", delta: -1, cause: "land reform" })).toBe("r-pop");
  expect(wireHue({ kind: "resistance", id: "senate", delta: 12, cause: "the levy" })).toBe("r-danger");
  expect(wireHue({ kind: "card", ledger: "treasury", delta: -8, cause: "the flood" })).toBe("r-danger");
});

import { settleVerb } from "./rules";

const all = { decree: {}, law: {}, appoint: {}, spend: {}, proclaim: {}, favour: {}, force: {} } as never;

test("the verb settles from the words the player used", () => {
  expect(settleVerb("Send troops to the eastern border and set a curfew.", all)).toBe("force");
  expect(settleVerb("Appoint Livia to the treasury.", all)).toBe("appoint");
  expect(settleVerb("Pay the legions four months of back wages.", all)).toBe("spend");
  expect(settleVerb("Tell the country the grain will hold.", all)).toBe("proclaim");
  expect(settleVerb("Promise Cassius the province he wants.", all)).toBe("favour");
  expect(settleVerb("By my own hand, the tax on salt ends today.", all)).toBe("decree");
  expect(settleVerb("A bill for four years of farm credit.", all)).toBe("law");
});

test("an empty box and an unpriced verb both fall back to what the pack allows", () => {
  expect(settleVerb("", all)).toBe("law");
  // no cue matches without `force`, so the fallback order decides it
  expect(settleVerb("Send troops in.", { spend: {}, proclaim: {} } as never)).toBe("proclaim");
  expect(settleVerb("anything", {} as never)).toBe(null);
});

import { unreadTabs } from "./rules";

const g = {
  term: 1,
  turn: 7,
  posts: [{ turn: 6 }],
  inForce: [{ turn: 5, term: 1 }],
  warnings: [{ at: 7 }],
  wire: [{ kind: "ledger", ledger: "popularity", delta: 2, cause: "the post" }],
} as never;

test("a tab is unread when its content moved after the player last opened it", () => {
  expect(unreadTabs(g, { feed: 0, country: 0, room: 0, record: 0, pinned: 0 }).sort())
    .toEqual(["country", "feed", "record", "room"]);
});

test("opening a tab clears its mark and nothing else", () => {
  expect(unreadTabs(g, { feed: 6, country: 7, room: 7, record: 5, pinned: 0 })).toEqual([]);
  // a law from last term's later turn clears once the tab is opened this term
  const next = { term: 2, turn: 3, posts: [], inForce: [{ turn: 18, term: 1 }], warnings: [], wire: [] } as never;
  expect(unreadTabs(next, { record: 3 })).toEqual([]);
});

import { barAt, difficulty } from "./rules";

const pack = { constitution: { retention: { bar: { start: 0.5, step: 0.03, cap: 0.7 } } } } as never;

test("the bar climbs on the pack's printed schedule and stops at the cap", () => {
  expect(barAt(pack, 1)).toBeCloseTo(0.5, 5);
  expect(barAt(pack, 4)).toBeCloseTo(0.59, 5);
  expect(barAt(pack, 20)).toBeCloseTo(0.7, 5);
  expect(barAt({} as never, 3)).toBeCloseTo(0.56, 5);
});

test("the difficulty label comes from the seats you are short", () => {
  expect(difficulty(-4)).toBe("Comfortable");
  expect(difficulty(3)).toBe("Minority");
  expect(difficulty(9)).toBe("Minority, with a handicap");
  expect(difficulty(18)).toBe("Survival");
});

import { mandateOf } from "./rules";

test("the mandate is the weighted sum over the counted holders only", () => {
  const holders = [
    { id: "senate", weight: 0.3, stance: 0.6 },
    { id: "plebs", weight: 0.5, stance: 0.4 },
    { id: "patricians", weight: 0.2, stance: 0.8 },
    { id: "legions", weight: 0, stance: 0.1 },
  ];
  expect(mandateOf(holders)).toBeCloseTo(0.54, 5);
  expect(mandateOf([])).toBe(0);
});
