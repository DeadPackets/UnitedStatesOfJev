import { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Bill, Party, Senator } from "../worker/engine";
import type { Member, Pack } from "../worker/pack";
import { STATES } from "../worker/states";
import { BOX, minGap, points } from "./layouts";
import { FILL_DEFS, art, fillFor, initials } from "./theme";

const ROWS = [12, 16, 20, 24, 28];
export const POINTS = (() => {
  const pts: { x: number; y: number; a: number }[] = [];
  ROWS.forEach((n, row) => {
    const r = 120 + row * 42;
    for (let i = 0; i < n; i++) { const a = Math.PI - (Math.PI * (i + 0.5)) / n; pts.push({ x: Math.round(300 + r * Math.cos(a)), y: Math.round(310 - r * Math.sin(a)), a }); }
  });
  return pts.sort((p, q) => q.a - p.a);
})();
const gatherVars = (i: number) => ({ "--i": i, "--dx": `${300 - POINTS[i].x}px`, "--dy": `${170 - POINTS[i].y}px` }) as any;

export function orderSeats(seated: Senator[], whip: Record<string, number> | undefined, party: Party) {
  const p = (s: Senator) => whip?.[s.id] ?? 0.5;
  const mine = seated.filter((s) => s.party === party).sort((a, b) => p(b) - p(a));
  const theirs = seated.filter((s) => s.party !== party).sort((a, b) => p(a) - p(b));
  return party === "D" ? [...mine, ...theirs] : [...theirs.reverse(), ...mine.reverse()];
}

/** Opposition seats are hatched, ours are solid: party is carried by texture and position, never by hue. */
export const Hatch = () => <defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="var(--ink)" strokeWidth="1.2" /></pattern></defs>;

/** Setup preview: seats by party only. `ink` (0..1) is the chamber's mood from the popularity rule. */
export const SeatPreview = memo(function SeatPreview({ parties, party, ink }: { parties: Record<string, Party>; party: Party; ink: number }) {
  const seats = Object.entries(parties);
  const mine = seats.filter(([, p]) => p === party), theirs = seats.filter(([, p]) => p !== party);
  const ordered = party === "D" ? [...mine, ...theirs] : [...theirs, ...mine];
  return (
    <svg className="hemi gather" viewBox="0 0 600 340" role="img" aria-label={`Chamber preview: ${mine.length} seats for your party`}>
      <Hatch />
      {/* keyed by position, not seat: a reorder would move DOM nodes and restart the gather animation */}
      {ordered.map(([, p], i) => <g key={i} className="seatg" style={gatherVars(i)}><circle className="seat" cx={POINTS[i].x} cy={POINTS[i].y} r={9} fill={p === party ? "var(--ink)" : "url(#hatch)"} stroke={p === party ? "none" : "var(--ink)"} strokeWidth={1} opacity={0.45 + 0.55 * ink} /></g>)}
    </svg>
  );
});

export type RollHandle = { roll: (votes: Record<string, boolean>, onCount: (n: number) => void, onDone: () => void) => void };
type Props = { seated: Senator[]; bill?: Bill; party: Party; onPick: (s: Senator) => void; selected?: string; pulse?: string; hot?: string; rolling: boolean };

/**
 * Roll call runs on a rAF clock keyed to elapsed time (2.4 s, ease-in), toggling classes on the circles directly.
 * One React commit at the end. 60, 90 or 120 Hz screens all finish together with no dropped frames.
 */
export default memo(forwardRef<RollHandle, Props>(function Hemicycle({ seated, bill, party, onPick, selected, pulse, hot, rolling }, ref) {
  const ordered = useMemo(() => orderSeats(seated, bill?.whip, party), [seated, bill?.whip, party]);
  const [hover, setHover] = useState<number | null>(null);
  const circles = useRef(new Map<string, SVGCircleElement>());
  const whipped = !!bill?.whip;
  const voted = !!bill?.votes;
  const mine = (s: Senator) => s.party === party;

  useImperativeHandle(ref, () => ({
    roll(votes, onCount, onDone) {
      const ids = Object.keys(votes).sort(() => Math.random() - 0.5);
      const DUR = 2400; let shown = 0, yes = 0; const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / DUR);
        const target = Math.floor(ids.length * t * t); // ease-in: the count accelerates like a real roll call
        while (shown < target) { const id = ids[shown++]; const c = circles.current.get(id); if (votes[id]) yes++; if (c) paintVote(c, votes[id]); onCount(yes); }
        if (t < 1) requestAnimationFrame(tick); else onDone();
      };
      requestAnimationFrame(tick);
    },
  }), []);

  const key = (s: Senator) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(s); } };
  const label = (s: Senator, p?: number) => `${s.name}, ${s.party === "D" ? "Democrat" : "Republican"}, ${STATES[s.state].name}${p === undefined ? "" : `, ${Math.round(p * 100)} percent yes`}${bill?.votes ? (bill.votes[s.id] ? ", voted yes" : ", voted no") : ""}`;
  const h = hover !== null ? ordered[hover] : null;
  return (
    <svg className={`hemi ${whipped || voted ? "" : "gather"}`} viewBox="0 0 600 340" role="group" aria-label="Senate chamber, 100 seats">
      <Hatch />
      {ordered.map((s, i) => {
        const p = bill?.whip?.[s.id];
        const yes = bill?.votes?.[s.id];
        const { x, y } = POINTS[i];
        const settled = voted && !rolling;
        const fill = settled ? (yes ? "var(--ink)" : "var(--bg)") : mine(s) ? "var(--ink)" : "url(#hatch)";
        const stroke = settled ? "var(--ink)" : mine(s) ? "none" : "var(--ink)";
        const opacity = settled ? (yes ? 1 : 0.7) : p === undefined ? 0.28 : 0.16 + 0.84 * p;
        return (
          <g key={i} className="seatg" role="button" tabIndex={0} aria-label={label(s, p)} style={gatherVars(i)}
            onClick={() => onPick(s)} onKeyDown={key(s)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            data-tour={hot === s.id ? "seat" : undefined}>
            <circle className="focus" cx={x} cy={y} r={15} fill="none" stroke="var(--red)" strokeWidth={2} />
            {hot === s.id ? <circle cx={x} cy={y} r={16} fill="none" stroke="var(--red)" strokeWidth={2} opacity={0.9}><animate attributeName="r" values="12;18;12" dur="1.4s" repeatCount="indefinite" /></circle> : null}
            <circle ref={(el) => { if (el) circles.current.set(s.id, el); else circles.current.delete(s.id); }} className={`seat ${pulse === s.id ? "pulse" : ""}`}
              cx={x} cy={y} r={selected === s.id ? 11 : 9} fill={fill} stroke={stroke} strokeWidth={settled && !yes ? 2 : bill?.offers?.[s.id] ? 3 : mine(s) ? 0 : 1} opacity={opacity}
              style={{ transitionDelay: rolling ? "0ms" : `${Math.abs(i - 50) * 10}ms` }} />
          </g>
        );
      })}
      {h ? (() => { const { x, y } = POINTS[hover!]; const p = bill?.whip?.[h.id]; const text = `${h.name} · ${h.state}${p === undefined ? "" : ` · ${Math.round(p * 100)}%`}`; const w = text.length * 7.2 + 20; const lx = Math.min(Math.max(x - w / 2, 4), 596 - w);
        return <g className="seatlabel rise" transform={`translate(${lx} ${y - 34})`}><rect width={w} height={24} /><text x={w / 2} y={16} textAnchor="middle">{text}</text></g>; })() : null}
    </svg>
  );
}));

function paintVote(c: SVGCircleElement, yes: boolean) {
  c.style.transitionDelay = "0ms";
  c.setAttribute("fill", yes ? "var(--ink)" : "var(--bg)");
  c.setAttribute("stroke", "var(--ink)");
  c.setAttribute("stroke-width", yes ? "0" : "2");
  c.setAttribute("opacity", yes ? "1" : "0.7");
}

/** Own faction first, then coalition partners, then opposition, biggest block first; whipped members lead their block. */
export function orderMembers(members: Member[], own: string, coalition: string[], whip?: Record<string, number>): Member[] {
  const blocks = new Map<string, Member[]>();
  for (const m of members) { const b = blocks.get(m.faction); if (b) b.push(m); else blocks.set(m.faction, [m]); }
  const rank = (id: string) => (id === own ? 0 : coalition.includes(id) ? 1 : 2);
  return [...blocks.keys()]
    .sort((a, b) => rank(a) - rank(b) || blocks.get(b)!.length - blocks.get(a)!.length || a.localeCompare(b))
    .flatMap((id) => (whip ? [...blocks.get(id)!].sort((x, y) => (whip[y.id] ?? 0.5) - (whip[x.id] ?? 0.5)) : blocks.get(id)!));
}

const hideImg = (e: { currentTarget: SVGImageElement }) => { e.currentTarget.style.display = "none"; };
const showImg = (e: { currentTarget: SVGImageElement }) => { e.currentTarget.classList.add("on"); };
const paintSeat = (g: SVGGElement, yes: boolean) => { g.dataset.vote = yes ? "yes" : "no"; };

type ChamberProps = {
  pack: Pack; members: Member[]; own: string; coalition: string[];
  whip?: Record<string, number>; votes?: Record<string, boolean>;
  selected?: string; onPick: (id: string) => void; hot?: string[]; pulse?: string; rolling?: boolean;
};

/**
 * Any polity, any layout. The roll call keeps the v1 rAF clock; it flips one data attribute per
 * seat instead of painting attributes, so the ink and paper of a vote come from the stylesheet.
 */
export const Chamber = memo(forwardRef<RollHandle, ChamberProps>(function Chamber(
  { pack, members, own, coalition, whip, votes, selected, onPick, hot, pulse, rolling }, ref,
) {
  const ordered = useMemo(() => orderMembers(members, own, coalition, whip), [members, own, coalition, whip]);
  const seats = useMemo(() => points(pack.theme.layout, members.length), [pack.theme.layout, members.length]);
  const r = useMemo(() => Math.min(20, minGap(seats) * 0.4), [seats]);
  const factions = useMemo(() => new Map(pack.factions.map((f) => [f.id, f])), [pack.factions]);
  const regions = useMemo(() => new Map(pack.regions.map((g) => [g.id, g.name])), [pack.regions]);
  const [hover, setHover] = useState<number | null>(null);
  const groups = useRef(new Map<string, SVGGElement>());
  // Below 5 units a face is mud; the 4-unit band outside it keeps the pattern readable at every chamber size.
  const face = r - 4;
  const hotSet = new Set(hot ?? []);

  useImperativeHandle(ref, () => ({
    roll(result, onCount, onDone) {
      const ids = Object.keys(result).sort(() => Math.random() - 0.5);
      const DUR = 2400; let shown = 0, yes = 0; const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / DUR);
        const target = Math.floor(ids.length * t * t); // ease-in: the count accelerates like a real roll call
        while (shown < target) { const id = ids[shown++]; const g = groups.current.get(id); if (result[id]) yes++; if (g) paintSeat(g, result[id]); onCount(yes); }
        if (t < 1) requestAnimationFrame(tick); else onDone();
      };
      requestAnimationFrame(tick);
    },
  }), []);

  const h = hover !== null ? ordered[hover] : null;
  const vocab = pack.vocabulary;
  return (
    <svg className={`hemi seats ${whip || votes ? "" : "gather"}`} viewBox={`0 0 ${BOX.w} ${BOX.h}`} role="group"
      aria-label={`${vocab.chamber}, ${members.length} ${vocab.seat}`}>
      <defs>
        <clipPath id="coinclip" clipPathUnits="objectBoundingBox"><circle cx={0.5} cy={0.5} r={0.5} /></clipPath>
        <FILL_DEFS factions={pack.factions} />
      </defs>
      {ordered.map((m, i) => {
        const s = seats[i];
        if (!s) return null;
        const f = factions.get(m.faction);
        const color = f?.color ?? "var(--ink)";
        const p = whip?.[m.id];
        const label = `${m.name}, ${vocab.member}, ${f?.name ?? m.faction}, ${regions.get(m.region) ?? m.region}`
          + (p === undefined ? "" : `, ${Math.round(p * 100)} percent yes`)
          + (votes ? (votes[m.id] ? ", voted yes" : ", voted no") : "");
        return (
          // keyed by position, not member: a reorder would move DOM nodes and restart the gather animation
          <g key={i} ref={(el) => { if (el) groups.current.set(m.id, el); else groups.current.delete(m.id); }}
            className="seatg" role="button" tabIndex={0} aria-label={label}
            style={{ "--i": i, "--dx": `${300 - s.x}px`, "--dy": `${170 - s.y}px`, "--r": `${r}px` } as any}
            data-vote={votes && !rolling ? (votes[m.id] ? "yes" : "no") : undefined}
            data-tour={hotSet.has(m.id) ? "seat" : undefined}
            onClick={() => onPick(m.id)} onKeyDown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(m.id); } }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <circle className="focus" cx={s.x} cy={s.y} r={r + 6} fill="none" stroke="var(--red)" strokeWidth={2} />
            {hotSet.has(m.id) ? <circle cx={s.x} cy={s.y} r={r + 5} fill="none" stroke="var(--red)" strokeWidth={2} opacity={0.9}>
              <animate attributeName="r" values={`${r + 1};${r + 8};${r + 1}`} dur="1.4s" repeatCount="indefinite" /></circle> : null}
            <circle className={`seatc ${pulse === m.id ? "pulse" : ""}`} cx={s.x} cy={s.y} r={r}
              fill={f ? fillFor(f) : "var(--ink)"} stroke={color} strokeWidth={selected === m.id ? 3 : 1.4}
              opacity={p === undefined ? 1 : 0.4 + 0.6 * p} />
            {face >= 5 ? <g opacity={p === undefined ? 1 : 0.4 + 0.6 * p}>
              <circle className="well" cx={s.x} cy={s.y} r={face} fill="var(--paper)" />
              {face >= 6 ? <text className="ini" x={s.x} y={s.y + face * 0.36} textAnchor="middle" style={{ fill: color, fontSize: face }}>{initials(m.name)}</text> : null}
              <image className="coin" href={art(pack.id, `members/${m.id}.png`)} x={s.x - face} y={s.y - face} width={face * 2} height={face * 2}
                clipPath="url(#coinclip)" preserveAspectRatio="xMidYMid slice" onLoad={showImg} onError={hideImg} />
            </g> : null}
            <circle className="edge" cx={s.x} cy={s.y} r={r + 1.2} fill="none" stroke="var(--ink)" strokeWidth={1} />
          </g>
        );
      })}
      {h ? (() => {
        const s = seats[hover!], f = factions.get(h.faction), p = whip?.[h.id];
        const sub = `${vocab.member} · ${f?.short ?? h.faction} · ${regions.get(h.region) ?? h.region}`
          + (p === undefined ? "" : ` · ${Math.round(p * 100)}%`);
        const w = Math.min(560, Math.max(h.name.length * 8.6, sub.length * 6.6) + 62);
        const lx = Math.min(Math.max(s.x - w / 2, 4), BOX.w - 4 - w), ly = Math.max(s.y - r - 56, 4);
        return (
          // the rise keyframe ends on `transform: none`, which would beat a transform attribute on the same node
          <g className="seatlabel" transform={`translate(${lx} ${ly})`}><g className="rise">
            <rect width={w} height={46} />
            <circle cx={27} cy={23} r={17} fill={f ? fillFor(f) : "var(--ink)"} stroke={f?.color ?? "var(--paper)"} strokeWidth={1.4} />
            <circle cx={27} cy={23} r={13} fill="var(--paper)" />
            <text className="ini" x={27} y={28} textAnchor="middle" style={{ fill: f?.color, fontSize: 13 }}>{initials(h.name)}</text>
            <image className="coin on" href={art(pack.id, `members/${h.id}.png`)} x={14} y={10} width={26} height={26}
              clipPath="url(#coinclip)" preserveAspectRatio="xMidYMid slice" onError={hideImg} />
            <text x={54} y={20}>{h.name}</text>
            <text className="sub" x={54} y={36}>{sub}</text>
          </g></g>
        );
      })() : null}
    </svg>
  );
}));
