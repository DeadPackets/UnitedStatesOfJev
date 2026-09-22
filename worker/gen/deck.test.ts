import { test, expect } from "bun:test";
import { DeckSchema } from "./deck";
import { TEMPLATE_IDS } from "./templates";

const body = (date: string) => ({
  generic: TEMPLATE_IDS.map((template) => ({ template, title_hint: "x", stances: ["Act"], memory: null })),
  dated: Array.from({ length: 5 }, () => ({
    date, exogenous: true, title_hint: "The Ides", stances: ["Act"], scored: ["none"],
    needs: [], results: [], memory: null,
  })),
});

test("the deck schema takes a padded signed date and rejects an unpadded one", () => {
  expect(DeckSchema.safeParse(body("-0044-03-15")).success).toBe(true);
  expect(DeckSchema.safeParse(body("-0044-3-15")).success).toBe(false);
});
