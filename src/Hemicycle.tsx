import { forwardRef, memo, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Member } from "../worker/pack";
import type { GamePack } from "./api";
import { BOX, minGap, points } from "./layouts";
import { FILL_DEFS, art, fillFor, hideBroken, initials } from "./theme";

/** A seat on the floor: the pack's member or the game's, both without the persona prose. */
export type Seated = Omit<Member, "bio" | "tell">;

/** Own faction first, then coalition partners, then opposition, biggest block first; whipped members lead their block. */
export function orderMembers(members: Seated[], own: string, coalition: string[], whip?: Record<string, number>): Seated[] {
  const blocks = new Map<string, Seated[]>();
  for (const m of members) { const b = blocks.get(m.faction); if (b) b.push(m); else blocks.set(m.faction, [m]); }
  const rank = (id: string) => (id === own ? 0 : coalition.includes(id) ? 1 : 2);
  return [...blocks.keys()]
    .sort((a, b) => rank(a) - rank(b) || blocks.get(b)!.length - blocks.get(a)!.length || a.localeCompare(b))
    .flatMap((id) => (whip ? [...blocks.get(id)!].sort((x, y) => (whip[y.id] ?? 0.5) - (whip[x.id] ?? 0.5)) : blocks.get(id)!));
}

const showImg = (e: { currentTarget: SVGImageElement }) => { e.currentTarget.classList.add("on"); };
// A read-only floor passes no handler; a fresh arrow here would defeat the memo on every parent render.
const NOOP = () => {};

export type RollHandle = {
  roll: (votes: Record<string, boolean>, onCount: (n: number) => void, onDone: () => void, needed?: number) => void;
};

type ChamberProps = {
  pack: GamePack; members: Seated[]; own: string; coalition: string[];
  whip?: Record<string, number>; votes?: Record<string, boolean>;
  selected?: string; onPick?: (id: string) => void; hot?: string[]; pulse?: string; rolling?: boolean;
};

/**
 * Any polity, any layout. The roll call keeps the v1 rAF clock; it flips one data attribute per
 * seat instead of painting attributes, so the ink and paper of a vote come from the stylesheet.
 */
export const Chamber = memo(forwardRef<RollHandle, ChamberProps>(function Chamber(
  { pack, members, own, coalition, whip, votes, selected, onPick = NOOP, hot, pulse, rolling }, ref,
) {
  const ordered = useMemo(() => orderMembers(members, own, coalition, whip), [members, own, coalition, whip]);
  const seats = useMemo(() => points(pack.theme.layout, members.length), [pack.theme.layout, members.length]);
  const gap = useMemo(() => minGap(seats), [seats]);
  // `points` rounds to a tenth of a unit, but `minGap` is a hypotenuse, so every radius drawn from it
  // carried 17 digits into eight attributes on each of up to 72 seats. A unit is about 1.3 px on screen.
  const r = Math.round(Math.min(20, gap * 0.4) * 100) / 100;
  // A 9 px circle is a 28 px target. Half the gap is the largest target two seats can hold without overlapping.
  const hit = Math.round(gap * 50) / 100;
  const factions = useMemo(() => new Map(pack.factions.map((f) => [f.id, f])), [pack.factions]);
  const regions = useMemo(() => new Map(pack.regions.map((g) => [g.id, g.name])), [pack.regions]);
  // SVG ids are document-wide: the reveal and the drawer can hold a chamber each.
  const scope = useId();
  const clip = `url(#${scope}coinclip)`;
  const [hover, setHover] = useState<number | null>(null);
  const groups = useRef(new Map<string, SVGGElement>());
  // Below 5 units a face is mud; the 4-unit band outside it keeps the pattern readable at every chamber size.
  const face = r - 4;
  const hotSet = useMemo(() => new Set(hot ?? []), [hot]);
  const vocab = pack.vocabulary;

  // A floor that leaves mid-roll takes its clock with it: the ticks and the gavel are already gone.
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useImperativeHandle(ref, () => ({
    roll(result, onCount, onDone, needed) {
      const ids = Object.keys(result).sort(() => Math.random() - 0.5);
      const DUR = 2400, SLOW = 400; let shown = 0, yes = 0, next = 0; const t0 = performance.now();
      const show = () => { const id = ids[shown++]; const g = groups.current.get(id); if (result[id]) yes++; if (g) g.dataset.vote = result[id] ? "yes" : "no"; onCount(yes); };
      const tick = (now: number) => {
        // A close call walks its last five seats, one every 400 ms, so the room hears each name.
        if (needed !== undefined && ids.length - shown <= 5 && Math.abs(yes - needed) <= 3) {
          if (now >= next) { next = now + SLOW; show(); }
        } else {
          const t = Math.min(1, (now - t0) / DUR);
          const target = Math.floor(ids.length * t * t);   // ease-in: the count accelerates like a real roll call
          while (shown < target) show();
        }
        if (shown < ids.length) raf.current = requestAnimationFrame(tick); else onDone();
      };
      raf.current = requestAnimationFrame(tick);
    },
  }), []);

  // A tooltip is the only thing `hover` feeds, so the seats are built outside the hover render.
  const seatGroups = useMemo(() => ordered.map((m, i) => {
    const s = seats[i];
    if (!s) return null;
    const f = factions.get(m.faction);
    const color = f?.color ?? "var(--ink)";
    const p = whip?.[m.id];
    // One source for the ink and the label: a seat the roll has not reached has no vote to announce.
    const cast = votes && !rolling && m.id in votes ? votes[m.id] : undefined;
    const label = `${m.name}, ${vocab.member}, ${f?.name ?? m.faction}, ${regions.get(m.region) ?? m.region}`
      + (p === undefined ? "" : `, ${Math.round(p * 100)} percent yes`)
      + (cast === undefined ? "" : cast ? ", voted yes" : ", voted no");
    return (
      // keyed by position, not member: a reorder would move DOM nodes and restart the gather animation
      <g key={i} ref={(el) => { if (el) groups.current.set(m.id, el); else groups.current.delete(m.id); }}
        className="seatg" role={onPick === NOOP ? "img" : "button"} tabIndex={0} aria-label={label}
        style={{ "--i": i, "--dx": `${300 - s.x}px`, "--dy": `${170 - s.y}px`, "--r": `${r}px` } as any}
        data-vote={cast === undefined ? undefined : cast ? "yes" : "no"}
        data-tour={hotSet.has(m.id) ? "seat" : undefined}
        onClick={() => onPick(m.id)} onKeyDown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(m.id); } }}
        onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
        <circle className="hit" cx={s.x} cy={s.y} r={hit} fill="transparent" />
        <circle className="focus" cx={s.x} cy={s.y} r={r + 6} fill="none" stroke="var(--danger)" strokeWidth={2} />
        {hotSet.has(m.id) ? <circle cx={s.x} cy={s.y} r={r + 5} fill="none" stroke="var(--accent)" strokeWidth={2} opacity={0.9}>
          <animate attributeName="r" values={`${r + 1};${r + 8};${r + 1}`} dur="1.4s" repeatCount="indefinite" /></circle> : null}
        <circle className={`seatc ${pulse === m.id ? "pulse" : ""}`} cx={s.x} cy={s.y} r={r}
          fill={f ? fillFor(f, scope) : "var(--ink)"} stroke={color} strokeWidth={selected === m.id ? 3 : 1.4}
          opacity={p === undefined ? 1 : 0.4 + 0.6 * p} />
        {face >= 5 ? <g opacity={p === undefined ? 1 : 0.4 + 0.6 * p}>
          <circle className="well" cx={s.x} cy={s.y} r={face} fill="var(--paper)" />
          {face >= 6 ? <text className="ini" x={s.x} y={s.y + face * 0.36} textAnchor="middle" style={{ fill: color, fontSize: face }}>{initials(m.name)}</text> : null}
          <image className="coin" href={art(pack.id, `members/${m.id}.png`)} x={s.x - face} y={s.y - face} width={face * 2} height={face * 2}
            clipPath={clip} preserveAspectRatio="xMidYMid slice" onLoad={showImg} onError={hideBroken} />
        </g> : null}
        <circle className="edge" cx={s.x} cy={s.y} r={r + 1.2} fill="none" stroke="var(--ink)" strokeWidth={1} />
      </g>
    );
  }), [ordered, seats, factions, regions, whip, votes, rolling, hotSet, pulse, selected, onPick, r, hit, face, pack, scope, clip, vocab]);

  const h = hover !== null ? ordered[hover] : null;
  return (
    <svg className={`hemi seats ${whip || votes ? "" : "gather"}`} viewBox={`0 0 ${BOX.w} ${BOX.h}`} role="group"
      aria-label={`${vocab.chamber}, ${members.length} ${vocab.seat}`}>
      <defs>
        <clipPath id={`${scope}coinclip`} clipPathUnits="objectBoundingBox"><circle cx={0.5} cy={0.5} r={0.5} /></clipPath>
        <FILL_DEFS factions={pack.factions} scope={scope} />
      </defs>
      {seatGroups}
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
            <circle cx={27} cy={23} r={17} fill={f ? fillFor(f, scope) : "var(--ink)"} stroke={f?.color ?? "var(--paper)"} strokeWidth={1.4} />
            <circle cx={27} cy={23} r={13} fill="var(--paper)" />
            <text className="ini" x={27} y={28} textAnchor="middle" style={{ fill: f?.color, fontSize: 13 }}>{initials(h.name)}</text>
            <image className="coin on" href={art(pack.id, `members/${h.id}.png`)} x={14} y={10} width={26} height={26}
              clipPath={clip} preserveAspectRatio="xMidYMid slice" onError={hideBroken} />
            <text x={54} y={20}>{h.name}</text>
            <text className="sub" x={54} y={36}>{sub}</text>
          </g></g>
        );
      })() : null}
    </svg>
  );
}));
