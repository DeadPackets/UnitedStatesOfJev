import { test, expect } from "bun:test";
import { floorWeights, shortNames, squarify } from "./Tiles";

const items = [
  { id: "a", weight: 0.4 },
  { id: "b", weight: 0.25 },
  { id: "c", weight: 0.15 },
  { id: "d", weight: 0.1 },
  { id: "e", weight: 0.06 },
  { id: "f", weight: 0.04 },
];

test("the tiles fill the box, in proportion, without overlapping", () => {
  const box = { x: 0, y: 0, w: 100, h: 62 };
  const out = squarify(items, box);
  expect(out.length).toBe(items.length);
  const area = out.reduce((a, r) => a + r.w * r.h, 0);
  expect(area).toBeCloseTo(box.w * box.h, 4);
  for (const r of out) {
    expect(r.w * r.h).toBeCloseTo(r.d.weight * box.w * box.h, 4);
    expect(r.x).toBeGreaterThanOrEqual(-1e-9);
    expect(r.y).toBeGreaterThanOrEqual(-1e-9);
    expect(r.x + r.w).toBeLessThanOrEqual(box.w + 1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(box.h + 1e-9);
  }
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i],
        b = out[j];
      const overlap =
        Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      expect(overlap).toBeLessThan(1e-9);
    }
});

test("one tile takes the whole box", () => {
  const out = squarify([{ id: "only", weight: 1 }], { x: 0, y: 0, w: 60, h: 40 });
  expect(out[0]).toMatchObject({ x: 0, y: 0, w: 60, h: 40 });
});

test("every tile keeps a readable aspect", () => {
  const out = squarify(items, { x: 0, y: 0, w: 100, h: 62 });
  for (const r of out) expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThan(4);
});

// The campaign map is tapped, so a 2% region has to be a target: 44 px on its short side, in its own slot.
test("a floored map holds a 44px target in every tile, phone and desktop", () => {
  const skewed = [0.42, 0.18, 0.11, ...Array(17).fill(0.29 / 17)];
  for (const [w, h] of [
    [760, 471],
    [358, 448],
  ]) {
    const lay = floorWeights(skewed, w * h);
    const out = squarify(
      lay.map((weight, i) => ({ weight, i })),
      { x: 0, y: 0, w, h },
    );
    for (const r of out) expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(44);
  }
});

// squarify renormalises by the sum it is handed, so one dominant region next to a long tail used to
// erode the floor it had just been given: 59 lifted tiles plus a 0.5 region gave a 29 px side on a phone.
test("a long tail beside one big region still holds its targets", () => {
  const tail = [0.5, ...Array(59).fill(0.5 / 59)];
  for (const [w, h] of [
    [760, 471],
    [358, 448],
  ]) {
    const lay = floorWeights(tail, w * h);
    const out = squarify(
      lay.map((weight, i) => ({ weight, i })),
      { x: 0, y: 0, w, h },
    );
    for (const r of out) {
      expect(r.w * r.h).toBeGreaterThanOrEqual(44 * 44);
      expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(44);
    }
  }
});

test("the floor only lifts the tiles that need it", () => {
  const even = Array(8).fill(0.125);
  expect(floorWeights(even, 760 * 471)).toEqual(even);
});

test("two regions that start alike keep different shorts", () => {
  expect(shortNames(["Harbor City", "Harbor Hills", "Northreach"])).toEqual(["HAR", "HARB", "NOR"]);
});

test("names too short to grow apart are numbered", () => {
  expect(shortNames(["Rome", "Rom", "Rom"])).toEqual(["ROM", "ROM2", "ROM3"]);
});

// Luna may hand the reveal a region weighted 0; the row aspect divides by the smallest value in it.
test("a zero-weight region leaves every tile finite", () => {
  const out = squarify(
    [
      { id: "a", weight: 0.6 },
      { id: "b", weight: 0.4 },
      { id: "z", weight: 0 },
    ],
    { x: 0, y: 0, w: 100, h: 62 },
  );
  expect(out).toHaveLength(3);
  for (const r of out) for (const n of [r.x, r.y, r.w, r.h]) expect(Number.isFinite(n)).toBe(true);
});
