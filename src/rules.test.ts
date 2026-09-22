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
