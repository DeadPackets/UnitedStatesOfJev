import { LOBBY, type Bill, type Senator, type LobbyAction } from "../worker/engine";
import { STATES } from "../worker/states";
import type { GameView } from "./api";

export default function Drawer({ s, game, bill, onLobby, onClose, busy }: { s: Senator; game: GameView; bill?: Bill; onLobby: (a: LobbyAction) => void; onClose: () => void; busy: boolean }) {
  const p = bill?.whip?.[s.id];
  const canLobby = game.settings.lobby && bill?.whip && !bill.votes && !bill.offers[s.id];
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" aria-label={s.name}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div className="portrait"><img src={`/portraits/${s.id}.webp`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /><span style={{ position: "absolute" }}>{s.name.split(" ").map((w) => w[0]).join("")}</span></div>
          <div><h2 style={{ fontSize: 26 }}>{s.name}</h2><div className="muted">{s.party === "D" ? "Democrat" : "Republican"} · {STATES[s.state].name} · {s.years_in_office === "long" ? "veteran" : s.years_in_office === "new" ? "freshman" : "second term"}</div></div>
        </div>
        {p !== undefined && <div><div className="eyebrow">Will vote yes</div><div className="prob num" style={{ color: `var(--${s.party.toLowerCase()})` }}>{Math.round(p * 100)}%</div>
          {bill?.votes && <div className={`stamp ${bill.votes[s.id] ? "pass" : "fail"}`}>{bill.votes[s.id] ? "Voted yes" : "Voted no"}</div>}</div>}
        <p style={{ margin: 0 }}>{s.bio}</p>
        <div><div className="eyebrow">The tell</div><p className="serif" style={{ fontSize: 20, margin: "4px 0 0" }}>{s.tell}</p></div>
        <div className="tags">{s.core_issues.map((t) => <span key={t} className="chip">{t}</span>)}{s.donors.map((d) => <span key={d} className="chip" style={{ opacity: 0.7 }}>{d}</span>)}{s.situation && <span className="chip" style={{ color: "var(--gold)" }}>{s.situation}</span>}</div>
        {s.memory.length > 0 && <div><div className="eyebrow">Remembers</div><ul className="memory">{s.memory.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
        {bill?.offers[s.id] && <div className="small muted">On the table: {bill.offers[s.id]}</div>}
        {canLobby && <div className="lobby"><div className="eyebrow">Lobby · {game.capital} capital left</div>
          {(Object.keys(LOBBY) as LobbyAction[]).map((a) => <button key={a} disabled={busy || game.capital < LOBBY[a].cost} onClick={() => onLobby(a)}><span>{LOBBY[a].label}</span><span className="num muted">−{LOBBY[a].cost}</span></button>)}</div>}
        <button className="btn ghost" onClick={onClose}>Close</button>
      </aside>
    </>
  );
}
