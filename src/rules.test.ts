import { expect, test } from "bun:test";
import { shareText, squareClass } from "./rules";

test("a quiet turn is an empty square, a ledger turn is filled in its hue", () => {
  expect(squareClass("quiet")).toBe("sq");
  expect(squareClass("treasury")).toBe("sq on r-tre");
});

import { settleVerb } from "./rules";

const all = {
  decree: {},
  law: {},
  appoint: {},
  spend: {},
  proclaim: {},
  favour: {},
  force: {},
} as never;

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
  expect(
    settleVerb("A bill to clear the kingsroad.", { law: { available: false }, decree: {} }),
  ).toBe("decree");
});

import { barAt, difficulty } from "./rules";

const pack = {
  constitution: { retention: { bar: { start: 0.5, step: 0.03, cap: 0.7 } } },
} as never;

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

import { allRead } from "./rules";

test("the oath waits until every page has been shown, in any order", () => {
  expect(allRead(new Set([0]), 3)).toBe(false);
  expect(allRead(new Set([0, 2]), 3)).toBe(false);
  expect(allRead(new Set([2, 0, 1]), 3)).toBe(true);
});

test("the copied grid is rows of five squares, then the verdict row", () => {
  const grid = [
    { ledger: "authority" },
    { ledger: "popularity" },
    { ledger: "quiet" },
    { ledger: "treasury" },
    { ledger: "chest" },
    { ledger: "loyalty", won: true },
  ];
  expect(shareText("Rome, 44 BC", "2026-09-22", grid, 3).split("\n")).toEqual([
    "United States of Jev, Rome, 44 BC",
    "Daily 2026-09-22, streak 3",
    "🟪🟧⬜🟩🟨",
    "🟦",
    "✅✅✅✅",
    "unitedstatesofjev.deadpackets.pw",
  ]);
});

test("a run with no verdict copies no verdict row, and a lost one copies red", () => {
  expect(shareText("Rome, 44 BC", "2026-09-22", [{ ledger: "authority" }], 0).split("\n")[3]).toBe(
    "unitedstatesofjev.deadpackets.pw",
  );
  expect(shareText("Rome, 44 BC", "2026-09-22", [{ ledger: "treasury", won: false }], 0)).toContain(
    "🟥🟥🟥🟥",
  );
});
