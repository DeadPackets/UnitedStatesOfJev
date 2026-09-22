import { test, expect } from "bun:test";
import { agreeQuestions, choices, jev, meter, REACTIONS, reactQuestions, voteQuestions } from "./jev";
import { newGame, encodeCode, scenarioTag } from "./engine";
import { PackSchema, type Citizen, type Pack } from "./pack";
import mini from "./fixtures/mini.json";

const BLOCS = ["dockworkers", "merchants", "fisherfolk", "clergy", "students"];
const REGIONS = mini.regions.map((r) => r.id);
const citizens = (): Citizen[] => BLOCS.flatMap((bloc) => Array.from({ length: 50 }, (_, i) => ({
  id: `${bloc}-${i}`, region: REGIONS[i % REGIONS.length], bloc, name: `C ${bloc} ${i}`, age: 30,
  job: "docker", town: "Harbor City", worldview: "wants work", issues: ["tariffs", "fish-quotas"] as [string, string], weight: 1,
})));
const pack: Pack = PackSchema.parse({ ...mini, citizens: citizens() });
const game = newGame("g", encodeCode({ scenario: scenarioTag(mini.id), faction: 0, promises: [0, 1, 2], seed: 1 }),
  pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], { start_date: "0450-05-01", unit: "month" });

test("every citizen gets one reaction choice with four options", () => {
  const qs = reactQuestions(pack, pack.citizens);
  expect(Object.keys(qs).length).toBe(250);
  const q = qs[`react_${pack.citizens[0].id}`] as { type: string; options: string[] };
  expect(q.type).toBe("choice");
  expect(q.options.map((o) => REACTIONS[o]).sort()).toEqual(["boo", "ignore", "like", "share"]);
});

test("the duel asks the sample which post it agrees with", () => {
  const qs = agreeQuestions(pack, pack.citizens.slice(0, 50));
  expect(Object.keys(qs).length).toBe(50);
  expect((qs[`agree_${pack.citizens[0].id}`] as { options: string[] }).options).toEqual(["government", "rival"]);
});

test("a citizen sees the money spent in their own region, not the whole map", () => {
  const spend = { [REGIONS[0]]: 10 }, rival = { [REGIONS[1]]: 5 };
  const qs = voteQuestions(pack, game, pack.citizens, spend, rival);
  const here = pack.citizens.find((c) => c.region === REGIONS[0])!;
  const there = pack.citizens.find((c) => c.region === REGIONS[2])!;
  expect(JSON.stringify((qs[`vote_${here.id}`] as { instructions: unknown }).instructions)).toContain("10");
  expect(JSON.stringify((qs[`vote_${there.id}`] as { instructions: unknown }).instructions)).toContain('"spend_here":0');
});

test("choices reads the top probability and strips the prefix", () => {
  expect(choices({ react_a: { probabilities: { like: 0.2, boo: 0.7, share: 0.1 } }, other: { noul: 1 } }, "react_")).toEqual({ a: "boo" });
});

import { holderQuestions, holderStance, holderState, HOLDER_SAMPLE } from "./jev";

test("a holder is read with its own numbers, and only its own", () => {
  const h = pack.constitution!.holders.find((x) => x.id === "street")!;
  const rows = { seats: [], citizens: pack.citizens.slice(0, HOLDER_SAMPLE) };
  const qs = holderQuestions(pack, game, h, rows);
  expect(Object.keys(qs).length).toBe(HOLDER_SAMPLE);
  const one = qs[`stance_${pack.citizens[0].id}`] as { instructions: Record<string, unknown> };
  expect(one.instructions.popularity_here).toBe(Math.round(game.ledgers.popularity[pack.citizens[0].region]));
  const chamber = pack.constitution!.holders.find((x) => x.id === "council")!;
  const cq = holderQuestions(pack, game, chamber, { seats: game.members, citizens: [] });
  expect(Object.keys(cq).length).toBe(game.members.length);
  const guard = pack.constitution!.holders.find((x) => x.id === "guard")!;
  const gq = holderQuestions(pack, game, guard, { seats: [], citizens: [] });
  expect(Object.keys(gq)).toEqual([`stance_${guard.id}`]);
  expect((holderState(pack, game, guard) as { resistance: number }).resistance).toBe(0);
  expect(holderStance(pack, guard, { [`stance_${guard.id}`]: { noul: 0.7 } })).toBeCloseTo(0.7, 5);
});

test("the meter counts one request's Jev tokens, its cost and its largest single call", async () => {
  const real = globalThis.fetch;
  const usage = [{ input_tokens: 1200, cost: 0.004 }, { input_tokens: 800 }];
  globalThis.fetch = (async () => Response.json({ answers: {}, usage: usage.shift() })) as unknown as typeof fetch;
  try {
    meter.reset();
    await jev({} as never, {}, {});
    await jev({} as never, {}, {});
    expect([meter.tokens, meter.calls, meter.worst]).toEqual([2000, 2, 1200]);
    expect(meter.cost).toBeCloseTo(0.004, 5);
    meter.reset();
    expect([meter.tokens, meter.cost, meter.calls, meter.worst]).toEqual([0, 0, 0, 0]);
  } finally { globalThis.fetch = real; }
});
