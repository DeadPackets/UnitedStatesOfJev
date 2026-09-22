import { test, expect } from "bun:test";
import { shortNames, squarify } from "./Tiles";

const items = [
  { id: "a", weight: 0.4 }, { id: "b", weight: 0.25 }, { id: "c", weight: 0.15 },
  { id: "d", weight: 0.1 }, { id: "e", weight: 0.06 }, { id: "f", weight: 0.04 },
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
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const a = out[i], b = out[j];
    const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
                  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
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

test("two regions that start alike keep different shorts", () => {
  expect(shortNames(["Harbor City", "Harbor Hills", "Northreach"])).toEqual(["HAR", "HARB", "NOR"]);
});
