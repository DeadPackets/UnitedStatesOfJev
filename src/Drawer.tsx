import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import { LOBBY, type Bill, type Senator, type LobbyAction } from "../worker/engine";
import { STATES } from "../worker/states";
import type { GameView } from "./api";

const TENURE = { long: "veteran", mid: "second term", new: "freshman" } as const;

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

export default function Drawer({ s, game, bill, onLobby, onClose, busy, before }: { s: Senator; game: GameView; bill?: Bill; onLobby: (a: LobbyAction) => void; onClose: () => void; busy: boolean; before: number | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const p = bill?.whip?.[s.id];
  const delta = before !== null && p !== undefined ? Math.round((p - before) * 100) : null;
  const canLobby = game.settings.lobby && bill?.whip && !bill.votes && !bill.offers[s.id];
  const initials = s.name.split(" ").map((w) => w[0]).join("");
  return (
    <dialog ref={ref} className="drawer" aria-label={s.name} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div className="portrait" aria-hidden="true"><span>{initials}</span><img src={`/portraits/${s.id}.webp`} alt="" loading="eager" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
        <div className="who"><h2>{s.name}</h2><div className="muted">{s.party === "D" ? "Democrat" : "Republican"} · {STATES[s.state].name} · {TENURE[s.years_in_office]}</div></div>
      </div>
      {p !== undefined ? <div><div className="kicker">Will vote yes</div><div className="prob num" style={{ color: `var(--${s.party.toLowerCase()})` }}><Pct value={p} from={before} />%{delta !== null ? <span className={`chip rise ${delta >= 0 ? "gold" : ""}`} style={{ marginLeft: 12, verticalAlign: "middle", fontSize: 14 }}>{delta >= 0 ? "+" : ""}{delta}</span> : null}</div>
        {bill?.votes ? <div className={`stamp ${bill.votes[s.id] ? "pass" : "fail"}`}>{bill.votes[s.id] ? "Voted yes" : "Voted no"}</div> : null}</div> : null}
      <p style={{ margin: 0 }}>{s.bio}</p>
      <div><div className="kicker">The tell</div><p className="tell">{s.tell}</p></div>
      <div className="tags">{s.core_issues.map((t) => <span key={t} className="chip">{t}</span>)}{s.donors.map((d) => <span key={d} className="chip" style={{ opacity: 0.7 }}>{d}</span>)}{s.situation ? <span className="chip gold">{s.situation}</span> : null}</div>
      {s.memory.length > 0 ? <div><div className="kicker">Remembers</div><ul className="memory">{s.memory.map((m, i) => <li key={i}>{m}</li>)}</ul></div> : null}
      {bill?.offers[s.id] ? <p className="small muted" style={{ margin: 0 }}>On the table: {bill.offers[s.id]}</p> : null}
      {canLobby ? <div className="lobby"><div className="kicker">Lobby · <span className="num">{game.capital}</span> capital left</div>
        {(Object.keys(LOBBY) as LobbyAction[]).map((a) => <button key={a} disabled={busy || game.capital < LOBBY[a].cost} onClick={() => onLobby(a)}><span>{LOBBY[a].label}</span><span className="num muted">−{LOBBY[a].cost}</span></button>)}</div> : null}
      <button className="btn ghost" onClick={onClose}>Close</button>
    </dialog>
  );
}
