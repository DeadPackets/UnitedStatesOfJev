import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

export type Box = { x: number; y: number; w: number; h: number };
export type Tile<T> = Box & { d: T };
export type TileDatum = { id: string; name: string; short: string; weight: number; p: number };
export type TileState = "" | "won" | "lost" | "flash";

const worst = (row: number[], short: number) => {
  const s = row.reduce((a, b) => a + b, 0), mx = Math.max(...row), mn = Math.min(...row);
  return Math.max((short * short * mx) / (s * s), (s * s) / (short * short * mn));
};

/** Squarified treemap: rows run along the short side and close when the aspect stops improving. */
export function squarify<T extends { weight: number }>(items: T[], box: Box): Tile<T>[] {
  const out: Tile<T>[] = [];
  const total = items.reduce((s, d) => s + d.weight, 0) || 1;
  // `worst` divides by the smallest value in the row, so a region Luna weighted 0 would size every
  // tile NaN. A millionth of the box is below a pixel and keeps the arithmetic finite.
  const vals = items.map((d) => (Math.max(d.weight, total * 1e-6) * (box.w * box.h)) / total);
  let { x, y, w, h } = box, i = 0;
  while (i < vals.length) {
    const short = Math.min(w, h);
    // A share this small leaves nothing of the box to cut: the rest take no room rather than NaN of it.
    if (!(short > 0)) { for (; i < vals.length; i++) out.push({ d: items[i], x, y, w: 0, h: 0 }); break; }
    const row = [vals[i]];
    let j = i + 1;
    while (j < vals.length && worst(row.concat(vals[j]), short) <= worst(row, short)) row.push(vals[j++]);
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const rw = sum / h;
      let cy = y;
      row.forEach((val, k) => { const rh = val / rw; out.push({ d: items[i + k], x, y: cy, w: rw, h: rh }); cy += rh; });
      x += rw; w -= rw;
    } else {
      const rh = sum / w;
      let cx = x;
      row.forEach((val, k) => { const rw2 = val / rh; out.push({ d: items[i + k], x: cx, y, w: rw2, h: rh }); cx += rw2; });
      y += rh; h -= rh;
    }
    i = j;
  }
  return out;
}

/** A tappable tile is a target first: 44 px square, with room for the aspect squarify may hand it. */
const TARGET = 44 * 44 * 2;

/**
 * Layout weights for a map you can tap. A share too small to hold a target is lifted to one and the
 * rest give up the difference; the printed weight stays the true one. Past the point where the box
 * cannot hold one target per region, every tile is the same size, which is the best the box allows.
 */
// ponytail: an area floor, not a side floor. squarify's leftover row can still hand a 24-region tail
// a 36 px short side on a 330 px phone; a side floor means changing squarify, which the reveal shares.
export function floorWeights(weights: number[], boxArea: number, min = TARGET): number[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const floor = min / (boxArea || 1);
  // squarify divides by the sum it is handed, so a floor applied once is eroded by its own lifting:
  // k lifted tiles next to one large region leave each of them F/(R+kF). Lift, renormalise, repeat —
  // the lifted set only grows, so it settles; past the point where the box cannot hold one target
  // per region every round clamps everything alike and the cap hands back the even split.
  let out = weights.map((w) => w / total);
  for (let round = 0; round < 8; round++) {
    const sum = out.reduce((a, b) => a + b, 0) || 1;
    if (out.every((x) => x / sum >= floor)) break;
    out = out.map((x) => Math.max(x / sum, floor));
  }
  return out;
}

/** The map: one tile per region, area by weight. It paints what it is given and owns no clock. */
export default function Tiles({ items, state = {}, hit, selected = [], onPick, foot, label }: {
  items: TileDatum[]; state?: Record<string, TileState>; hit?: string;
  selected?: string[]; onPick?: (id: string) => void; foot?: (d: TileDatum) => string; label?: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 100, h: 62 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth || 100, h: el.clientHeight || 62 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hu = (100 * box.h) / (box.w || 1);
  // Only a map you can tap trades area for targets; the reveal keeps every region's true share.
  const lay = onPick ? floorWeights(items.map((d) => d.weight), box.w * box.h) : items.map((d) => d.weight);
  const rects = squarify(items.map((t, i) => ({ t, weight: lay[i] })).sort((a, b) => b.weight - a.weight),
    { x: 0, y: 0, w: 100, h: hu });
  return (
    <div className="tiles" ref={stage} aria-label={label}>
      {rects.map(({ d: { t }, ...r }) => {
        const px = (r.w / 100) * box.w, py = (r.h / hu) * box.h, tiny = px < 100 || py < 46;
        const cls = ["tile", tiny ? "tiny" : "", state[t.id] ?? "", hit === t.id ? "hit" : "", selected.includes(t.id) ? "on" : ""].filter(Boolean).join(" ");
        const Tag = onPick ? "button" : "div";
        return (
          <Tag key={t.id} className={cls} onClick={onPick ? () => onPick(t.id) : undefined}
            aria-pressed={onPick ? selected.includes(t.id) : undefined}
            style={{ left: `${r.x}%`, top: `${(r.y / hu) * 100}%`, width: `${r.w}%`, height: `${(r.h / hu) * 100}%` }}>
            <span className="nm">{tiny ? t.short : t.name}</span>
            <span className="wt num">{foot ? foot(t) : `${(t.weight * 100).toFixed(1)}%`}</span>
          </Tag>
        );
      })}
    </div>
  );
}

export type RevealRegion = { id: string; weight: number; p: number; yes: boolean };

/** Tile labels: three letters, grown one letter at a time until no two names share a short. */
export function shortNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let short = name.slice(0, 3).toUpperCase();
    if (used.has(short)) for (let k = 3; k < name.length; k++) {
      const cand = (short + name[k]).toUpperCase();
      if (!used.has(cand)) { short = cand; break; }
    }
    // Two names too short to grow apart ("Rom" beside "Rome") are numbered instead.
    if (used.has(short)) { let k = 2; while (used.has(`${short}${k}`)) k++; short = `${short}${k}`; }
    used.add(short);
    return short;
  });
}

/**
 * The region half of the reveal, on its own interval: smallest weight first, so the big tiles
 * decide it last. It reports the weighted share as it goes and calls `onDone` at the end.
 */
export function TileReveal({ regions, names, skip = false, label, ms = 40000, onProgress, onDone }: {
  regions: RevealRegion[]; names: Map<string, string>; skip?: boolean; label?: string; ms?: number;
  onProgress: (shown: number, share: number) => void; onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const [flash, setFlash] = useState<string>();
  const order = useMemo(() => [...regions].sort((a, b) => a.weight - b.weight), [regions]);
  const wsum = useMemo(() => regions.reduce((a, r) => a + r.weight, 0) || 1, [regions]);
  // the callbacks change every render; the clock must not restart with them
  const cb = useRef({ onProgress, onDone });
  cb.current = { onProgress, onDone };

  useEffect(() => {
    const share = (k: number) => order.slice(0, k).reduce((a, r) => a + (r.yes ? r.weight : 0), 0) / wsum;
    if (reduced || skip) {
      setShown(order.length); setFlash(undefined);
      cb.current.onProgress(order.length, share(order.length));
      cb.current.onDone();
      return;
    }
    let i = 0;
    const step = Math.max(400, Math.min(1400, ms / Math.max(1, order.length)));
    const t = setInterval(() => {
      const r = order[i];
      i += 1;
      setShown(i);
      cb.current.onProgress(i, share(i));
      if (r && r.yes !== (r.p >= 0.5)) { setFlash(r.id); setTimeout(() => setFlash(undefined), 420); }
      if (i >= order.length) { clearInterval(t); cb.current.onDone(); }
    }, step);
    return () => clearInterval(t);
  }, [order, wsum, reduced, skip]);

  const state = Object.fromEntries(order.slice(0, shown).map((r) =>
    [r.id, flash === r.id ? "flash" : r.yes ? "won" : "lost"] as [string, TileState]));
  const labels = regions.map((r) => names.get(r.id) ?? r.id);
  const shorts = shortNames(labels);
  const items: TileDatum[] = regions.map((r, i) =>
    ({ id: r.id, name: labels[i], short: shorts[i], weight: r.weight / wsum, p: r.p }));
  return <Tiles items={items} state={state} hit={order[shown - 1]?.id} label={label} />;
}
