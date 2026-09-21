import { memo, useMemo, useState, type KeyboardEvent } from "react";
import type { Bill, Party, Senator } from "../worker/engine";
import { STATES } from "../worker/states";

const ROWS = [12, 16, 20, 24, 28];
const POINTS = (() => {
  const pts: { x: number; y: number; a: number }[] = [];
  ROWS.forEach((n, row) => {
    const r = 120 + row * 42;
    for (let i = 0; i < n; i++) { const a = Math.PI - (Math.PI * (i + 0.5)) / n; pts.push({ x: Math.round(300 + r * Math.cos(a)), y: Math.round(310 - r * Math.sin(a)), a }); }
  });
  return pts.sort((p, q) => q.a - p.a);
})();

export function orderSeats(seated: Senator[], whip: Record<string, number> | undefined, party: Party) {
  const p = (s: Senator) => whip?.[s.id] ?? 0.5;
  const mine = seated.filter((s) => s.party === party).sort((a, b) => p(b) - p(a));
  const theirs = seated.filter((s) => s.party !== party).sort((a, b) => p(a) - p(b));
  return party === "D" ? [...mine, ...theirs] : [...theirs.reverse(), ...mine.reverse()];
}

/** Setup-screen preview: 100 seats colored by party only. Fill transitions as the split slider moves. */
export const SeatPreview = memo(function SeatPreview({ parties, party }: { parties: Record<string, Party>; party: Party }) {
  const seats = Object.entries(parties);
  const mine = seats.filter(([, p]) => p === party), theirs = seats.filter(([, p]) => p !== party);
  const ordered = party === "D" ? [...mine, ...theirs] : [...theirs, ...mine];
  return (
    <svg className="hemi bloom" viewBox="0 0 600 330" role="img" aria-label={`Chamber preview: ${mine.length} seats for your party`}>
      {ordered.map(([seat, p], i) => <g key={seat} className="seatg" style={{ "--i": i } as any}><circle className="seat" cx={POINTS[i].x} cy={POINTS[i].y} r={9} fill={`var(--${p.toLowerCase()})`} opacity={0.85} /></g>)}
    </svg>
  );
});

type Props = { seated: Senator[]; bill?: Bill; party: Party; onPick: (s: Senator) => void; selected?: string; revealed: Set<string> | null; pulse?: string; hot?: string };

export default memo(function Hemicycle({ seated, bill, party, onPick, selected, revealed, pulse, hot }: Props) {
  const ordered = useMemo(() => orderSeats(seated, bill?.whip, party), [seated, bill?.whip, party]);
  const [hover, setHover] = useState<number | null>(null);
  const whipped = !!bill?.whip;
  const voted = !!bill?.votes;
  const key = (s: Senator) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(s); } };
  const label = (s: Senator, p?: number) => `${s.name}, ${s.party === "D" ? "Democrat" : "Republican"}, ${STATES[s.state].name}${p === undefined ? "" : `, ${Math.round(p * 100)} percent yes`}${bill?.votes ? (bill.votes[s.id] ? ", voted yes" : ", voted no") : ""}`;
  const h = hover !== null ? ordered[hover] : null;
  return (
    <svg className={`hemi bloom ${whipped ? "" : "breathe"}`} viewBox="0 0 600 340" role="group" aria-label="Senate chamber, 100 seats">
      {ordered.map((s, i) => {
        const p = bill?.whip?.[s.id];
        const color = `var(--${s.party.toLowerCase()})`;
        const shown = voted && (revealed === null || revealed.has(s.id));
        const yes = bill?.votes?.[s.id];
        const opacity = shown ? 1 : p === undefined ? 0.2 : 0.14 + 0.86 * p;
        const { x, y } = POINTS[i];
        return (
          <g key={s.id} className="seatg" role="button" tabIndex={0} aria-label={label(s, p)} style={{ "--i": i } as any}
            onClick={() => onPick(s)} onKeyDown={key(s)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            data-tour={hot === s.id ? "seat" : undefined}>
            <circle className="focus" cx={x} cy={y} r={15} fill="none" stroke="var(--gold)" strokeWidth={2} />
            {hot === s.id ? <circle cx={x} cy={y} r={16} fill="none" stroke="var(--gold)" strokeWidth={2} opacity={0.8}><animate attributeName="r" values="12;18;12" dur="1.4s" repeatCount="indefinite" /></circle> : null}
            <circle className={`seat ${p === undefined && !voted ? "idle" : ""} ${pulse === s.id ? "pulse" : ""}`} cx={x} cy={y} r={selected === s.id ? 11 : 9}
              fill={shown && !yes ? "transparent" : color} stroke={color} strokeWidth={shown && !yes ? 2 : bill?.offers?.[s.id] ? 3 : 0}
              opacity={shown && !yes ? 0.6 : opacity} style={{ transitionDelay: revealed ? "0ms" : `${Math.abs(i - 50) * 12}ms` }} />
          </g>
        );
      })}
      {h ? (() => { const { x, y } = POINTS[hover!]; const p = bill?.whip?.[h.id]; const text = `${h.name} · ${h.state}${p === undefined ? "" : ` · ${Math.round(p * 100)}%`}`; const w = text.length * 7.2 + 20; const lx = Math.min(Math.max(x - w / 2, 4), 596 - w);
        return <g className="seatlabel rise" transform={`translate(${lx} ${y - 34})`}><rect width={w} height={24} rx={12} /><text x={w / 2} y={16} textAnchor="middle">{text}</text></g>; })() : null}
    </svg>
  );
});
