import { useMemo } from "react";
import type { Bill, Senator } from "../worker/engine";

const ROWS = [12, 16, 20, 24, 28];
export function seatPositions() {
  const pts: { x: number; y: number; a: number }[] = [];
  ROWS.forEach((n, row) => {
    const r = 120 + row * 42;
    for (let i = 0; i < n; i++) { const a = Math.PI - (Math.PI * (i + 0.5)) / n; pts.push({ x: 300 + r * Math.cos(a), y: 310 - r * Math.sin(a), a }); }
  });
  return pts.sort((p, q) => q.a - p.a);
}

export function orderSeats(seated: Senator[], whip: Record<string, number> | undefined, party: "D" | "R") {
  const p = (s: Senator) => whip?.[s.id] ?? 0.5;
  const mine = seated.filter((s) => s.party === party).sort((a, b) => p(b) - p(a));
  const theirs = seated.filter((s) => s.party !== party).sort((a, b) => p(a) - p(b));
  return party === "D" ? [...mine, ...theirs] : [...theirs.reverse(), ...mine.reverse()];
}

export default function Hemicycle({ seated, bill, party, onPick, selected, revealed, pulse, hot }:
  { seated: Senator[]; bill?: Bill; party: "D" | "R"; onPick: (s: Senator) => void; selected?: string; revealed: Set<string> | null; pulse?: string; hot?: string }) {
  const pts = useMemo(seatPositions, []);
  const ordered = useMemo(() => orderSeats(seated, bill?.whip, party), [seated, bill?.whip, party]);
  return (
    <svg className="hemi" viewBox="0 0 600 330" role="img" aria-label="Senate chamber">
      {ordered.map((s, i) => {
        const p = bill?.whip?.[s.id];
        const color = `var(--${s.party.toLowerCase()})`;
        const shown = !!bill?.votes && (revealed === null || revealed.has(s.id));
        const yes = bill?.votes?.[s.id];
        const opacity = shown ? 1 : p === undefined ? 0.18 : 0.12 + 0.88 * p;
        const { x, y } = pts[i];
        return (
          <g key={s.id} onClick={() => onPick(s)} style={{ cursor: "pointer" }} data-tour={hot === s.id ? "seat" : undefined}>
            {hot === s.id && <circle cx={x} cy={y} r={16} fill="none" stroke="var(--gold)" strokeWidth={2} opacity={0.8}><animate attributeName="r" values="12;18;12" dur="1.4s" repeatCount="indefinite" /></circle>}
            <circle className={`seat ${pulse === s.id ? "pulse" : ""}`} cx={x} cy={y} r={selected === s.id ? 11 : 9} fill={shown && !yes ? "transparent" : color} stroke={color}
              strokeWidth={shown && !yes ? 2 : bill?.offers?.[s.id] ? 3 : 0} opacity={shown && !yes ? 0.55 : opacity} style={{ transitionDelay: revealed ? "0ms" : `${Math.abs(i - 50) * 12}ms` }} />
            <title>{s.name} · {s.state} · {p === undefined ? "" : Math.round(p * 100) + "%"}</title>
          </g>
        );
      })}
    </svg>
  );
}
