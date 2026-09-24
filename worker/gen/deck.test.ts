import { test, expect } from "bun:test";
import { DeckSchema } from "./deck";
import { TEMPLATE_IDS } from "./templates";

const body = (date: string) => ({
  generic: TEMPLATE_IDS.map((template) => ({
    template,
    title_hint: "x",
    stances: ["Act"],
    memory: null,
  })),
  dated: Array.from({ length: 5 }, () => ({
    date,
    exogenous: true,
    title_hint: "The Ides",
    stances: ["Act"],
    scored: ["none"],
    needs: [],
    results: [],
    memory: null,
  })),
  swans: Array.from({ length: 3 }, () => ({
    title_hint: "The fleet burns",
    stances: ["Pay the ransom", "Sail out"],
    scored: ["blocs"],
    results: [],
    memory: null,
  })),
});

test("the deck schema takes a padded signed date and rejects an unpadded one", () => {
  expect(DeckSchema.safeParse(body("-0044-03-15")).success).toBe(true);
  expect(DeckSchema.safeParse(body("-0044-3-15")).success).toBe(false);
});

test("the deck schema carries three to six black swans, each with a decision", () => {
  const swan = {
    title_hint: "The fleet burns",
    stances: ["Pay the ransom", "Sail out"],
    scored: ["blocs"],
    results: [],
    memory: null,
  };
  const base = { generic: [], dated: [] };
  const parsed = DeckSchema.safeParse({ ...base, swans: [swan, swan, swan] });
  expect(parsed.success).toBe(false); // generic and dated still have their own lengths
  const one = DeckSchema.shape.swans.safeParse([swan, swan]);
  expect(one.success).toBe(false); // two is under the floor
  expect(DeckSchema.shape.swans.safeParse([swan, swan, swan]).success).toBe(true);
  expect(
    DeckSchema.shape.swans.safeParse([{ ...swan, stances: ["Only one"] }, swan, swan]).success,
  ).toBe(false);
});
