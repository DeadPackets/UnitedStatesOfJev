import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import { LOBBY, type Bill, type Senator, type LobbyAction } from "../worker/engine";
import type { Member, Pack } from "../worker/pack";
import { STATES } from "../worker/states";
import type { GameView } from "./api";
import { art, initials as letters } from "./theme";

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
      {p !== undefined ? <div><div className="kicker">Will vote yes</div><div className="prob num" ><Pct value={p} from={before} />%{delta !== null ? <span className={`chip rise ${delta < 0 ? "red" : ""}`} style={{ marginLeft: 12, verticalAlign: "middle", fontSize: 14 }}>{delta >= 0 ? "+" : ""}{delta}</span> : null}</div>
        {bill?.votes ? <div className={`stampsm ${bill.votes[s.id] ? "pass" : "fail"}`}>{bill.votes[s.id] ? "Voted yes" : "Voted no"}</div> : null}</div> : null}
      <p style={{ margin: 0 }}>{s.bio}</p>
      <div><div className="kicker">The tell</div><p className="tell">{s.tell}</p></div>
      <div className="tags">{s.core_issues.map((t) => <span key={t} className="chip">{t}</span>)}{s.donors.map((d) => <span key={d} className="chip faint">{d}</span>)}{s.situation ? <span className="chip red">{s.situation}</span> : null}</div>
      {s.memory.length > 0 ? <div><div className="kicker">Remembers</div><ul className="memory">{s.memory.map((m, i) => <li key={i}>{m}</li>)}</ul></div> : null}
      {bill?.offers[s.id] ? <p className="small muted" style={{ margin: 0 }}>On the table: {bill.offers[s.id]}</p> : null}
      {canLobby ? <div className="lobby"><div className="kicker">Lobby · <span className="num">{game.capital}</span> capital left</div>
        {(Object.keys(LOBBY) as LobbyAction[]).map((a) => <button key={a} disabled={busy || game.capital < LOBBY[a].cost} onClick={() => onLobby(a)}><span>{LOBBY[a].label}</span><span className="num muted">−{LOBBY[a].cost}</span></button>)}</div> : null}
      <button className="btn ghost" onClick={onClose}>Close</button>
    </dialog>
  );
}

type MemberDrawerProps = {
  pack: Pack; member: Member; capital: number;
  onLobby: (kind: keyof Pack["lobby"]) => void; onClose: () => void;
};

/** Pack-driven member drawer: the 256 px plate on paper, the faction in its colour, the pack's own lobby offers. */
export function MemberDrawer({ pack, member, capital, onLobby, onClose }: MemberDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const faction = pack.factions.find((f) => f.id === member.faction);
  const region = pack.regions.find((g) => g.id === member.region);
  const patrons = member.patrons.map((id) => pack.patrons.find((p) => p.id === id)?.name ?? id);
  const kinds = Object.keys(pack.lobby) as (keyof Pack["lobby"])[];
  const vocab = pack.vocabulary;
  return (
    <dialog ref={ref} className="drawer" aria-label={member.name} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
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
      {member.bio ? <p style={{ margin: 0 }}>{member.bio}</p> : null}
      {member.tell ? <div><div className="kicker">The tell</div><p className="tell">{member.tell}</p></div> : null}
      <div className="tags">
        {member.core_issues.map((t) => <span key={t} className="chip">{t}</span>)}
        {patrons.map((p) => <span key={p} className="chip faint">{vocab.patron}: {p}</span>)}
        {member.flags.map((f) => <span key={f} className="chip red">{f}</span>)}
      </div>
      <div className="lobby">
        <div className="kicker">{vocab.lobby} · <span className="num">{capital}</span> {vocab.capital}</div>
        {kinds.map((k) => (
          <button key={k} disabled={capital < pack.lobby[k].cost} onClick={() => onLobby(k)}>
            <span className="t"><b>{pack.lobby[k].label}</b><span className="small muted">{pack.lobby[k].text}</span></span>
            <span className="num muted">−{pack.lobby[k].cost}</span>
          </button>
        ))}
      </div>
      <button className="btn ghost" onClick={onClose}>Close</button>
    </dialog>
  );
}
