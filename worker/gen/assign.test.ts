import { describe, expect, test } from "bun:test";
import { TEMPERAMENTS } from "../engine";
import { scaleSeats } from "../pack";
import { assignCitizens, assignMembers } from "./assign";
import { mkFrame } from "./fixture";

const count = <T>(rows: T[], of: (r: T) => string) => rows.reduce<Record<string, number>>((a, r) => ({ ...a, [of(r)]: (a[of(r)] ?? 0) + 1 }), {});

describe("assign", () => {
  test("members per faction equal scaleSeats", () => {
    const f = mkFrame();
    const members = assignMembers(f);
    expect(members.length).toBe(f.chamber.size);
    expect(count(members, (m) => m.faction)).toEqual(scaleSeats(Object.fromEntries(f.factions.map((x) => [x.id, x.seats])), f.chamber.size));
  });

  test("every region gets a member when the chamber is at least as large as the regions", () => {
    for (const regions of [6, 30, 60]) {
      const base = mkFrame();
      const f = mkFrame({
        regions: Array.from({ length: regions }, (_, i) => ({ id: `r${i}`, name: `Region ${i}`, weight: 1 / regions, lean: base.regions[0].lean })),
      });
      const seen = new Set(assignMembers(f).map((m) => m.region));
      expect(seen.size).toBe(regions);
      expect(new Set(assignCitizens(f).map((c) => c.region)).size).toBe(regions);
    }
  });

  test("identity fields are fixed before any model call", () => {
    const f = mkFrame();
    const members = assignMembers(f);
    expect(new Set(members.map((m) => m.id)).size).toBe(f.chamber.size);
    expect(new Set(members.map((m) => m.temperament)).size).toBe(TEMPERAMENTS.length);
    expect(count(members, (m) => m.years)).toEqual({ new: 30, mid: 40, long: 30 });
    expect(members.every((m) => m.name === "" && m.bio === "")).toBe(true);

    const citizens = assignCitizens(f);
    expect(citizens.length).toBe(250);
    expect(Object.values(count(citizens, (c) => c.bloc))).toEqual([50, 50, 50, 50, 50]);
    expect(citizens.every((c) => c.age >= 18 && c.age <= 88)).toBe(true);
  });
});
