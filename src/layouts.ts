import type { Pack } from "../worker/pack";

export type Layout = Pack["theme"]["layout"];
/** `angle` is where the seat faces, in screen radians (y grows down), so PI/2 points at the floor. */
export type Seat = { x: number; y: number; angle: number };

const W = 600, H = 340;
const D = Math.PI / 180;
/** The seat every other seat faces: the well, the table, the chair. */
const FOCUS: Record<Layout, [number, number]> = {
  hemicycle: [300, 310], benches: [300, 34], horseshoe: [300, 300],
  circle: [300, 170], classroom: [300, 30], court: [300, 40],
};

type Raw = { x: number; y: number; a: number };

// Largest remainder, so the rows or rings always add up to n exactly.
function split(weights: number[], n: number): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / total) * n);
  const out = raw.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  for (const i of [...raw.keys()].sort((a, b) => raw[b] - out[b] - (raw[a] - out[a]))) {
    if (left <= 0) break;
    out[i]++; left--;
  }
  return out;
}

function arc(count: number, cx: number, cy: number, rx: number, ry: number, a1: number, a2: number): Raw[] {
  return Array.from({ length: count }, (_, i) => {
    const a = a1 + (a2 - a1) * ((i + 0.5) / count);
    return { x: cx + rx * Math.cos(a), y: cy - ry * Math.sin(a), a };
  });
}

// Rows of near-square cells; a short last row is centred.
function grid(count: number, x0: number, y0: number, w: number, h: number): Raw[] {
  const cols = Math.max(1, Math.min(count, Math.round(Math.sqrt((count * w) / h))));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const inRow = Math.min(cols, count - row * cols);
    return { x: x0 + (w * (col + 0.5)) / cols + (w * (cols - inRow)) / (2 * cols), y: y0 + (h * (row + 0.5)) / rows, a: 0 };
  });
}

const byAngle = (p: Raw, q: Raw) => q.a - p.a;
const rings = (n: number, big: number, mid: number) => (n > big ? 3 : n > mid ? 2 : 1);

const HEMI_ROWS = [12, 16, 20, 24, 28];

function raw(layout: Layout, n: number): Raw[] {
  if (layout === "hemicycle") {
    // Rows of 8 to 14 seats; the outermost sits one seat clear of the box edge, 42 apart at 100 seats like v1.
    const rowCount = Math.max(1, Math.min(5, Math.ceil(n / 14)));
    const gap = rowCount > 1 ? Math.min(80, 168 / (rowCount - 1)) : 0;
    return split(HEMI_ROWS.slice(-rowCount), n)
      .flatMap((count, row) => {
        const r = 282 - (rowCount - 1 - row) * gap;
        return arc(count, 300, 310, r, r, Math.PI, 0);
      })
      .sort(byAngle);
  }
  if (layout === "benches") {
    const left = Math.ceil((n - 1) / 2);
    return [
      ...grid(left, 40, 80, 220, 230),
      ...(n > 0 ? [{ x: 300, y: 34, a: 0 }] : []),
      ...grid(n - 1 - left, 340, 80, 220, 230),
    ];
  }
  if (layout === "horseshoe") {
    const k = rings(n, 36, 12);
    const radii = Array.from({ length: k }, (_, i) => [170 + i * 50, 95 + i * 30] as const);
    return split(radii.map(([rx, ry]) => rx + ry), n)
      .flatMap((count, i) => arc(count, 300, 175, radii[i][0], radii[i][1], 235 * D, -55 * D))
      .sort(byAngle);
  }
  if (layout === "circle") {
    const k = rings(n, 40, 14);
    const radii = Array.from({ length: k }, (_, i) => [110 + i * 80, 62 + i * 45] as const);
    return split(radii.map(([rx, ry]) => rx + ry), n)
      .flatMap((count, i) => arc(count, 300, 170, radii[i][0], radii[i][1], 235 * D, -125 * D))
      .sort(byAngle);
  }
  if (layout === "classroom") return grid(n, 30, 70, 540, 250).sort((p, q) => p.x - q.x || p.y - q.y);
  const k = rings(n - 1, 45, 15);
  const radii = Array.from({ length: k }, (_, i) => 140 + i * 68);
  return [
    ...(n > 0 ? [{ x: 300, y: 40, a: 0 }] : []),
    ...split(radii, n - 1)
      .flatMap((count, i) => arc(count, 300, 40, radii[i], radii[i], -168 * D, -12 * D))
      .sort((p, q) => p.a - q.a),
  ];
}

/** Seat positions in a 600x340 box, in the order faction blocks are laid along. */
export function points(layout: Layout, n: number): Seat[] {
  if (n <= 0) return [];
  const [fx, fy] = FOCUS[layout];
  return raw(layout, n).map(({ x, y }) => ({
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    angle: x === fx && y === fy ? Math.PI / 2 : Math.atan2(fy - y, fx - x),
  }));
}

export function minGap(seats: Seat[]): number {
  let min = Infinity;
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      const dx = seats[i].x - seats[j].x, dy = seats[i].y - seats[j].y;
      min = Math.min(min, Math.hypot(dx, dy));
    }
  }
  return min;
}

export const BOX = { w: W, h: H };
