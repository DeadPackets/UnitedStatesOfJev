import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import type { GamePack, ViewBill, ViewMember } from "./api";
import { art, initials as letters } from "./theme";
import { UNMOUNT, dismiss } from "./Card";

const TENURE = { long: "veteran", mid: "second term", new: "first term" } as const;
export type LobbyKind = keyof GamePack["lobby"];

function Pct({ value, from }: { value: number; from: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (from === null || reduced) { el.textContent = String(Math.round(value * 100)); return; }
    const c = animate(from * 100, value * 100, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { el.textContent = String(Math.round(v)); } });
    return () => c.stop();
  }, [value, from, reduced]);
  return <span ref={ref}>{Math.round(value * 100)}</span>;
}

type MemberDrawerProps = {
  pack: GamePack; member: ViewMember; capital: number; bill?: ViewBill; before: number | null; busy: boolean;
  onLobby: (kind: LobbyKind) => void; onClose: () => void;
};

/** The 256 px plate on paper, the faction in its colour, the pack's own lobby offers. No bio, no tell: the
 *  view keeps both in the Worker, so what the seat said on this bill stands in for them. */
export function MemberDrawer({ pack, member, capital, bill, before, busy, onLobby, onClose }: MemberDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const faction = pack.factions.find((f) => f.id === member.faction);
  const region = pack.regions.find((g) => g.id === member.region);
  const patrons = member.patrons.map((id) => pack.patrons.find((p) => p.id === id)?.name ?? id);
  const kinds = Object.keys(pack.lobby) as LobbyKind[];
  const v = pack.vocabulary;
  const p = bill?.whip?.[member.id];
  const delta = before !== null && p !== undefined ? Math.round((p - before) * 100) : null;
  const vote = bill?.votes?.[member.id];
  const said = bill?.quotes?.find((q) => q.name === member.name)?.text;
  const offered = bill?.offers[member.id];
  const canLobby = !!bill?.whip && !bill.votes && !offered;
  // An accepted offer takes the lobby buttons away, so focus moves to the one action left.
  useEffect(() => { if (!canLobby) done.current?.focus(); }, [canLobby]);
  return (
    <dialog ref={ref} className="drawer" aria-label={member.name} onClose={() => setTimeout(onClose, UNMOUNT)} onClick={(e) => { if (e.target === ref.current) dismiss(ref.current, onClose); }}>
      <div className="plate" aria-hidden="true">
        <span>{letters(member.name)}</span>
        <img src={art(pack.id, `members/${member.id}-plate.png`)} alt="" loading="eager"
          onLoad={(e) => { e.currentTarget.classList.add("on"); }} onError={(e) => { e.currentTarget.remove(); }} />
      </div>
      <div className="who">
        <h2>{member.name}</h2>
        <div className="small" style={{ color: faction?.color }}>{faction?.name ?? member.faction}</div>
        <div className="muted small">{region?.name ?? member.region} · {TENURE[member.years]} · {member.temperament}</div>
      </div>
      {p !== undefined ? (
        <div>
          <div className="kicker">Will vote yes</div>
          <div className="prob num"><Pct value={p} from={before} />%
            {delta !== null ? <span className={`chip rise ${delta < 0 ? "red" : ""}`} style={{ marginLeft: 12, verticalAlign: "middle", fontSize: 14 }}>{delta >= 0 ? "+" : ""}{delta}</span> : null}</div>
          {vote !== undefined ? <div className={`stampsm ${vote ? "pass" : "fail"}`}>{vote ? "Voted yes" : "Voted no"}</div> : null}
        </div>
      ) : null}
      {said ? <blockquote className="pull">{said}</blockquote> : null}
      <div className="tags">
        {member.core_issues.map((t) => <span key={t} className="chip">{t}</span>)}
        {patrons.map((x) => <span key={x} className="chip faint">{v.patron}: {x}</span>)}
        {member.flags.map((f) => <span key={f} className="chip red">{f}</span>)}
        {member.situation ? <span className="chip red">{member.situation}</span> : null}
      </div>
      {member.memory.length ? <div><div className="kicker">Remembers</div><ul className="memory">{member.memory.map((m, i) => <li key={i}>{m}</li>)}</ul></div> : null}
      {offered ? <p className="small muted" style={{ margin: 0 }}>On the table: {offered}</p> : null}
      {canLobby ? (
        <div className="lobby">
          <div className="kicker">{v.lobby} · <span className="num">{capital}</span> {v.capital}</div>
          {kinds.map((k) => (
            <button key={k} disabled={busy || capital < pack.lobby[k].cost} onClick={() => onLobby(k)}>
              <span className="t"><b>{pack.lobby[k].label}</b><span className="small muted">{pack.lobby[k].text}</span></span>
              <span className="num muted">−{pack.lobby[k].cost}</span>
            </button>
          ))}
        </div>
      ) : null}
      <button ref={done} className="btn ghost" onClick={(e) => dismiss(e.currentTarget, onClose)}>Close the file</button>
    </dialog>
  );
}
