import { test, expect } from "bun:test";
import { DAILY_SYSTEM, duplicate } from "./daily-prompt";

test("the proposer is told to pick one place, one year, and no repeat", () => {
  expect(DAILY_SYSTEM).toContain("executive head");
  expect(DAILY_SYSTEM).toContain("at most 120 characters");
  expect(DAILY_SYSTEM).toContain("must not repeat any of the past dailies");
  expect(DAILY_SYSTEM).not.toContain("—");
});

test("a prompt naming a place a recent daily already used is a duplicate", () => {
  const past = [{ place: "Egypt" }, { place: "Chile" }];
  expect(duplicate("Egypt after the 2011 revolution", past)).toBe(true);
  expect(duplicate("egypt in 1952", past)).toBe(true);
  expect(duplicate("Bohemia in 1618", past)).toBe(false);
});

test("words that every prompt carries never make a duplicate", () => {
  expect(duplicate("The Roman republic after Sulla", [{ place: "Dutch Republic" }])).toBe(false);
  expect(duplicate("Prussia under Bismarck", [{ place: "Bavaria" }])).toBe(false);
});
