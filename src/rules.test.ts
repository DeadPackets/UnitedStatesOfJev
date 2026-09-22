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
