import { describe, expect, mock, test } from "bun:test";
import { mkFacts, mkFrame } from "./fixture";
import type { GenCtx } from "./prompts";

const seen: { need: { members: number; citizens: number }; already_used?: string[] }[] = [];
// Each call invents names from its own counter, disjoint from every other call unless the pool forces a collision.
let series = 0;
let forceDup = false;

mock.module("../luna", () => ({
  luna: async (_env: unknown, _schema: unknown, _name: string, _system: string, user: string) => {
    const req = JSON.parse(user);
    seen.push(req);
    const take = (n: number, tag: string) => Array.from({ length: n }, () => {
      series++;
      return forceDup && series % 2 === 0 ? "Dup Name" : `${tag} ${series}`;
    });
    return { members: take(req.need.members, "Member"), citizens: take(req.need.citizens, "Citizen") };
  },
}));
const { names } = await import("./personas");

const ctx = (m: number, c: number): GenCtx => ({
  prompt: "Rome -0044", lang: "la", fiction: false, sources: { wikipedia: [], people: [], parties: [] },
  facts: mkFacts(), frame: mkFrame(), calendar: null, deck: [],
  members: Array.from({ length: m }, (_, i) => ({
    id: `m${i + 1}`, seat: `seat-${i + 1}`, region: "r01", faction: "reds", name: "", bio: "", core_issues: [],
    temperament: "loyalist", tell: "", patrons: [], years: "new", flags: [], portrait: "",
  })),
  citizens: Array.from({ length: c }, (_, i) => ({
    id: `c${i + 1}`, region: "r01", bloc: "b01", name: "", age: 20 + (i % 50), job: "", town: "", worldview: "", issues: ["", ""], weight: 1,
  })),
});

describe("names", () => {
  test("60 members + 250 citizens: one member call, four 80-name citizen chunks, deduped, no shortfall", async () => {
    seen.length = 0; series = 0; forceDup = false;
    const r = await names({} as never, ctx(60, 250));
    expect(seen.length).toBe(5);
    expect(seen[0].need).toEqual({ members: 60, citizens: 0 });
    expect(seen.slice(1).map((s) => s.need)).toEqual([
      { members: 0, citizens: 80 }, { members: 0, citizens: 80 }, { members: 0, citizens: 80 }, { members: 0, citizens: 10 },
    ]);
    expect(r.members!.length).toBe(60);
    expect(r.citizens!.length).toBe(250);
    const all = [...r.members!.map((m) => m.name), ...r.citizens!.map((c) => c.name)];
    expect(new Set(all).size).toBe(all.length);
  });

  test("a shortfall is topped up three times, and a pool that never fills is a repair, not an id in the chamber", async () => {
    seen.length = 0; series = 0; forceDup = true;
    // This stub repeats a name on every call, so the pools can never fill; a member named "m12" is the
    // outcome this guards against.
    await expect(names({} as never, ctx(60, 250))).rejects.toMatchObject({ name: "NeedsRepair" });
    expect(seen.length).toBe(8);                 // five first-pass calls, then three top-ups
    const topUp = seen[5];
    expect(topUp.need.members).toBeGreaterThan(0);
    expect(topUp.already_used!.length).toBeGreaterThan(0);
  });
});
