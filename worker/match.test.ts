import { test, expect } from "bun:test";
import { decide } from "./match";
import type { MatchCandidate } from "./jev";

const candidates: MatchCandidate[] = [
  { id: "a", title: "Rome 44 BC", era: "44 BC", place: "Rome", description: "The Senate after Caesar." },
  { id: "b", title: "Germany 2021", era: "2021", place: "Berlin", description: "The Bundestag after Merkel." },
];

test("top >= 0.95 loads that candidate", () => {
  expect(decide(candidates, { a: 0.96, b: 0.02, none_of_these: 0.02 })).toEqual({ load: "a" });
});

test("top in 0.85-0.95 offers everyone >= 0.5, sorted", () => {
  expect(decide(candidates, { a: 0.88, b: 0.6, none_of_these: 0.1 })).toEqual({
    offer: [
      { id: "a", title: "Rome 44 BC", era: "44 BC", place: "Rome", description: "The Senate after Caesar.", p: 0.88 },
      { id: "b", title: "Germany 2021", era: "2021", place: "Berlin", description: "The Bundestag after Merkel.", p: 0.6 },
    ],
  });
});

test("top below 0.85 builds", () => {
  expect(decide(candidates, { a: 0.7, b: 0.2, none_of_these: 0.1 })).toEqual({ build: true });
});

test("none_of_these winning builds even at high probability", () => {
  expect(decide(candidates, { a: 0.4, b: 0.3, none_of_these: 0.9 })).toEqual({ build: true });
});
