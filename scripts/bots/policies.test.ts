import { test, expect } from "bun:test";
import { OWN_FAILURE, POLICIES, STYLES, mulberry } from "./policies";

const view = (over: Record<string, unknown> = {}) =>
  ({
    id: "g",
    turn: 3,
    term: 1,
    stage: "session",
    bar: 0.53,
    ledgers: { treasury: 40, authority: 9, chest: 12 },
    regions: { r1: 44, r2: 61 },
    holders: [
      {
        id: "army",
        name: "the legions",
        support: 55,
        line: 50,
        weight: 0,
        levers: ["force", "favour"],
        where: "home",
      },
      {
        id: "senate",
        name: "the senate",
        support: 60,
        line: 30,
        weight: 0.4,
        levers: ["law"],
        where: "home",
      },
    ],
    instruments: {
      decree: { name: "decree", available: true, affordable: true },
      law: { name: "law", available: true, affordable: true },
      appoint: { name: "appoint", available: true, affordable: true },
      spend: { name: "spend", available: true, affordable: true },
      proclaim: { name: "post", available: true, affordable: true },
      favour: { name: "favour", available: true, affordable: true },
      force: { name: "force", available: true, affordable: true },
    },
    promises: {
      grain: {
        label: "cheap grain",
        state: "pending",
        window: 12,
        passed: 0,
        share: 0.02,
        authored: false,
      },
    },
    members: [
      { id: "m1", name: "Vela" },
      { id: "m2", name: "Otho" },
    ],
    pack: {
      regions: [
        { id: "r1", name: "the harbour" },
        { id: "r2", name: "the hills" },
      ],
      chamber: { size: 60 },
    },
    ...over,
  }) as never;

test("there are six policies and four of them are the styles", () => {
  expect(POLICIES).toHaveLength(6);
  expect(POLICIES.map((p) => p.name).sort()).toEqual([
    "broker",
    "greedy",
    "idealist",
    "populist",
    "random",
    "strongman",
  ]);
  expect(STYLES).toEqual(["strongman", "populist", "broker", "idealist"]);
  expect(Object.keys(OWN_FAILURE).sort()).toEqual(STYLES.slice().sort());
});

test("every policy returns at least one affordable act and never an empty text", () => {
  for (const p of POLICIES) {
    const acts = p.acts(view(), mulberry(7));
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      expect(a.text.length).toBeGreaterThan(11);
      expect((view() as any).instruments[a.verb].available).toBe(true);
    }
  }
});

test("a favour names the member it is offered to, because that is what the price call takes", () => {
  const acts = POLICIES.find((p) => p.name === "broker")!.acts(view(), mulberry(1));
  expect(acts.some((a) => a.verb === "favour" && a.memberId === "m1")).toBe(true);
  for (const p of POLICIES)
    for (const a of p.acts(view(), mulberry(3))) expect(a).not.toHaveProperty("target");
});

test("each style reaches for its own verb", () => {
  const of = (name: string) =>
    POLICIES.find((p) => p.name === name)!
      .acts(view(), mulberry(1))
      .map((a) => a.verb);
  expect(of("strongman")).toContain("decree");
  expect(of("populist")).toContain("proclaim");
  expect(of("broker")).toContain("law");
  expect(of("idealist")).toContain("law");
  expect(of("idealist")).not.toContain("force");
  expect(of("idealist")).not.toContain("decree");
});

test("a policy takes no verb the pack priced out of reach", () => {
  const priced = view({
    instruments: {
      ...(view() as any).instruments,
      decree: { name: "decree", available: false, affordable: false },
    },
  });
  expect(
    POLICIES.find((p) => p.name === "strongman")!
      .acts(priced, mulberry(1))
      .map((a) => a.verb),
  ).not.toContain("decree");
});

test("the same seed draws the same sequence", () => {
  const a = mulberry(42),
    b = mulberry(42);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
