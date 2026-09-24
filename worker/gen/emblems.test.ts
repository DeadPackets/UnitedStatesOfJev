import { expect, test } from "bun:test";
import type { Emblem } from "../emblem";
import { emblemsFor, keepEmblems } from "./emblems";
import { ModelStop, type Caller, type CallRequest } from "./openrouter";

const disc: Emblem = {
  size: 64,
  elements: [{ tag: "circle", cx: 32, cy: 32, r: 26, fill: "ink" }],
};
const verdict = (legible: boolean, canon: "fits" | "wrong" | "none") => [
  { id: "lions", legible, canon },
];

test.each([
  ["legible and fits its canon", verdict(true, "fits"), 7, true],
  ["legible, no known device", verdict(true, "none"), 14, true],
  ["unreadable at 28 px", verdict(false, "fits"), 7, false],
  ["the wrong device in a canon world", verdict(true, "wrong"), 7, false],
  [
    "the wrong device in an invented world, where canon is not checked",
    verdict(true, "wrong"),
    14,
    true,
  ],
  ["never reviewed", null, 7, false],
])("an emblem that is %s ships: %p", (_label, review, kind, ships) => {
  const { kept } = keepEmblems({ lions: disc }, review, kind);
  expect("lions" in kept).toBe(ships);
});

const world = {
  title: "Westeros",
  era: "298 AC",
  place: "King's Landing",
  houseVoice: "Maester's chronicle",
  kind: 7,
};
const groups = [
  { id: "lions", name: "House Lannister", identity: "The richest house in the realm." },
  { id: "stags", name: "House Baratheon", identity: "The king's own house." },
];
const drawn = (id: string, elements: unknown[]) => ({
  id,
  motif: "a device",
  viewBox: "0 0 64 64",
  elements,
});
const circle = { tag: "circle", cx: 32, cy: 32, r: 26, fill: "ink" };

// A fake Opus: the first emblem call can be filtered; the review says every emblem it sees is legible and fits.
function fake(options: { filterFirst?: boolean; failReview?: boolean; emblems: unknown[] }) {
  const requests: CallRequest<unknown>[] = [];
  const call = (async (request: CallRequest<unknown>) => {
    requests.push(request);
    if (request.name === "emblems" && options.filterFirst)
      throw new ModelStop("content_filter", "filtered");
    if (request.name === "emblem-review") {
      if (options.failReview) throw new ModelStop("invalid", "bad review");
      const shown = JSON.parse(request.user.slice(request.user.indexOf("[")));
      return {
        emblems: shown.map((row: { id: string }) => ({ id: row.id, legible: true, canon: "fits" })),
      };
    }
    return { emblems: options.emblems };
  }) as unknown as Caller;
  return { call, requests };
}

test("a filtered emblem call is resent once with names only, and its emblems are sanitized and reviewed", async () => {
  const model = fake({
    filterFirst: true,
    emblems: [drawn("lions", [circle]), drawn("stags", [circle])],
  });
  const { emblems, report } = await emblemsFor(model.call, world, groups);
  expect(model.requests.map((request) => request.name)).toEqual([
    "emblems",
    "emblems-names",
    "emblem-review",
  ]);
  expect(model.requests[1].user).not.toContain("The richest house");
  expect(Object.keys(emblems)).toEqual(["lions", "stags"]);
  expect(report).toMatchObject({ asked: 2, drawn: 2, kept: 2, namesOnly: true });
});

test("an emblem the sanitizer refuses, or one never drawn, falls back to the line icon with its reason", async () => {
  const model = fake({ emblems: [drawn("lions", [{ tag: "script" }, { tag: "foreignObject" }])] });
  const { emblems, report } = await emblemsFor(model.call, world, groups);
  expect(emblems).toEqual({});
  expect(report.dropped).toEqual([
    { id: "lions", reason: "no element survived" },
    { id: "stags", reason: "not drawn" },
  ]);
});

test("a review that fails ships no emblem at all", async () => {
  const model = fake({ failReview: true, emblems: [drawn("lions", [circle])] });
  const { emblems, report } = await emblemsFor(model.call, world, groups);
  expect(emblems).toEqual({});
  expect(report.dropped.map((row) => row.reason)).toContain("not reviewed");
});

test("an emblem call that fails for another reason costs nothing more and ships no emblem", async () => {
  const call = (async () => {
    throw new ModelStop("length", "too long");
  }) as unknown as Caller;
  const { emblems, report } = await emblemsFor(call, world, groups);
  expect(emblems).toEqual({});
  expect(report.dropped).toHaveLength(2);
});
