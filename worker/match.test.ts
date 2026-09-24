import { expect, test } from "bun:test";
import { decide } from "./match";
import type { MatchCandidate } from "./jev";

const candidates: MatchCandidate[] = [
  {
    id: "a",
    title: "Rome 44 BC",
    era: "44 BC",
    place: "Rome",
    description: "The Senate after Caesar.",
  },
  {
    id: "b",
    title: "Germany 2021",
    era: "2021",
    place: "Berlin",
    description: "The Bundestag after Merkel.",
  },
];

const rome = { ...candidates[0] };
const germany = { ...candidates[1] };

test.each([
  ["top at 0.96 loads it", { a: 0.96, b: 0.02, none_of_these: 0.02 }, { load: "a" }],
  ["top at exactly 0.9 loads it", { a: 0.9, b: 0.05, none_of_these: 0.05 }, { load: "a" }],
  [
    "top at 0.85 offers it",
    { a: 0.85, b: 0.1, none_of_these: 0.05 },
    { offer: [{ ...rome, p: 0.85 }] },
  ],
  [
    "top at 0.88 offers everyone at 0.5 or more, sorted",
    { a: 0.88, b: 0.6, none_of_these: 0.1 },
    {
      offer: [
        { ...rome, p: 0.88 },
        { ...germany, p: 0.6 },
      ],
    },
  ],
  ["top at exactly 0.8 builds", { a: 0.8, b: 0.1, none_of_these: 0.1 }, { build: true }],
  ["top at 0.7 builds", { a: 0.7, b: 0.2, none_of_these: 0.1 }, { build: true }],
  ["none_of_these winning builds", { a: 0.4, b: 0.3, none_of_these: 0.9 }, { build: true }],
  ["no probabilities builds", {}, { build: true }],
])("%s", (_name, probabilities, expected) => {
  expect(decide(candidates, probabilities)).toEqual(expected as ReturnType<typeof decide>);
});
