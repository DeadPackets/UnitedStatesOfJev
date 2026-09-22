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
  const vals = items.map((d) => (d.weight * (box.w * box.h)) / total);
  let { x, y, w, h } = box, i = 0;
  while (i < vals.length) {
    const short = Math.min(w, h);
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
  const rects = squarify([...items].sort((a, b) => b.weight - a.weight), { x: 0, y: 0, w: 100, h: hu });
  return (
    <div className="tiles" ref={stage} aria-label={label}>
      {rects.map((r) => {
        const px = (r.w / 100) * box.w, py = (r.h / hu) * box.h, tiny = px < 100 || py < 46;
        const cls = ["tile", tiny ? "tiny" : "", state[r.d.id] ?? "", hit === r.d.id ? "hit" : "", selected.includes(r.d.id) ? "on" : ""].filter(Boolean).join(" ");
        const Tag = onPick ? "button" : "div";
        return (
          <Tag key={r.d.id} className={cls} onClick={onPick ? () => onPick(r.d.id) : undefined}
            aria-pressed={onPick ? selected.includes(r.d.id) : undefined}
            style={{ left: `${r.x}%`, top: `${(r.y / hu) * 100}%`, width: `${r.w}%`, height: `${(r.h / hu) * 100}%` }}>
            <span className="nm">{tiny ? r.d.short : r.d.name}</span>
            <span className="wt num">{foot ? foot(r.d) : `${(r.d.weight * 100).toFixed(1)}%`}</span>
          </Tag>
        );
      })}
    </div>
  );
}

export type RevealRegion = { id: string; weight: number; p: number; yes: boolean };

/**
 * The region half of the reveal, on its own interval: smallest weight first, so the big tiles
 * decide it last. It reports the weighted share as it goes and calls `onDone` at the end.
 */
export function TileReveal({ regions, names, skip = false, label, onProgress, onDone }: {
  regions: RevealRegion[]; names: Map<string, string>; skip?: boolean; label?: string;
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
    const step = Math.max(400, Math.min(1400, 40000 / Math.max(1, order.length)));
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
  const items: TileDatum[] = regions.map((r) => {
    const name = names.get(r.id) ?? r.id;
    return { id: r.id, name, short: name.slice(0, 3).toUpperCase(), weight: r.weight / wsum, p: r.p };
  });
  return <Tiles items={items} state={state} hit={order[shown - 1]?.id} label={label} />;
}
