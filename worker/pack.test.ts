import { test, expect } from "bun:test";
import { PackSchema, scaleSeats, packView, type Citizen } from "./pack";
import mini from "./fixtures/mini.json";

const BLOCS = ["dockworkers", "merchants", "fisherfolk", "clergy", "students"];
const REGIONS = mini.regions.map((r) => r.id);

function makeCitizens(): Citizen[] {
  const citizens: Citizen[] = [];
  for (const bloc of BLOCS) {
    for (let i = 0; i < 50; i++) {
      citizens.push({
        id: `${bloc}-${i}`, region: REGIONS[i % REGIONS.length], bloc, name: `Citizen ${bloc} ${i}`,
        age: 20 + (i % 50), job: "harbor worker", town: "Harbor City",
        worldview: "wants the harbor to stay prosperous", issues: ["tariffs", "dockworker-pay"], weight: 1,
      });
    }
  }
  return citizens;
}

test("fixture parses with generated citizens", () => {
  const pack = { ...mini, citizens: makeCitizens() };
  const parsed = PackSchema.parse(pack);
  expect(parsed.members.length).toBe(24);
  expect(parsed.citizens.length).toBe(250);
  expect(parsed.escalations.length).toBe(20);
});

test("scaleSeats uses largest remainder with a minimum of one seat", () => {
  const seats = scaleSeats({ SPD: 206, CDU: 197, Greens: 118, FDP: 92, AfD: 83, Linke: 39, SSW: 1 }, 100);
  expect(seats).toEqual({ SPD: 28, CDU: 27, Greens: 16, FDP: 12, AfD: 11, Linke: 5, SSW: 1 });
});

test("scaleSeats clamps to size when forced minimums overflow", () => {
  const shares: Record<string, number> = { dominant: 999989 };
  for (let i = 0; i < 11; i++) shares[`minor${i}`] = 1;
  const seats = scaleSeats(shares, 24);
  expect(Object.values(seats).reduce((a, b) => a + b, 0)).toBe(24);
  expect(Object.values(seats).every((v) => v >= 1)).toBe(true);
  expect(seats.dominant).toBe(13);
});

test("packView strips citizens and member personas", () => {
  const pack = PackSchema.parse({ ...mini, citizens: makeCitizens() });
  const view = packView(pack);
  const json = JSON.stringify(view);
  expect((view as any).citizens).toBeUndefined();
  expect(json).not.toContain("\"bio\"");
  expect(json).not.toContain("\"tell\"");
  expect(json).not.toContain("worldview");
});
