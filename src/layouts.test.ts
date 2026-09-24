import { expect, test } from "bun:test";
import { BOX, minGap, points, type Layout } from "./layouts";

const LAYOUTS: Layout[] = ["hemicycle", "benches", "horseshoe", "circle", "classroom", "court"];
const CASES: [number, number][] = [
  [24, 24],
  [100, 14],
];

for (const layout of LAYOUTS) {
  for (const [n, gap] of CASES) {
    test(`${layout} seats ${n}`, () => {
      const seats = points(layout, n);
      expect(seats.length).toBe(n);
      for (const s of seats) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(BOX.w);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(BOX.h);
        expect(Number.isFinite(s.angle)).toBe(true);
      }
      expect(minGap(seats)).toBeGreaterThanOrEqual(gap);
    });
  }

  test(`${layout} small and empty`, () => {
    expect(points(layout, 0)).toEqual([]);
    for (const n of [1, 2, 5, 13, 41]) expect(points(layout, n).length).toBe(n);
  });
}
