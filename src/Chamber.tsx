import { useState } from "react";
import { expectedYes, passThreshold, nationalApproval, type Senator, type LobbyAction } from "../worker/engine";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import Hemicycle from "./Hemicycle";
import Drawer from "./Drawer";
import Map from "./Map";

export default function Chamber({ game, act, busy, onQuit }: { game: GameView; act: Act; busy: boolean; onQuit: () => void }) {
  const [dismissed, setDismissed] = useState(-1);
  const last = game.bills[game.turn - 1];
  // After a vote the turn advances; keep showing the voted bill until "Next bill".
  const bill = game.bills[game.turn] ?? (last?.votes && dismissed !== game.turn ? last : undefined);
  const [text, setText] = useState("");
  const [pick, setPick] = useState<Senator | null>(null);
  const [showMap, setShowMap] = useState(false);
  const sel = pick ? game.seated.find((s) => s.id === pick.id) : undefined;
  const whipped = !!bill?.whip;
  const voted = !!bill?.votes;
  const exp = whipped ? expectedYes(bill.whip!) : 0;
  const yes = voted ? Object.values(bill.votes!).filter(Boolean).length : 0;
  const need = bill ? passThreshold(bill) : 51;
  const amendments = bill?.amendments as (typeof bill.amendments extends (infer T)[] | undefined ? T & { expected: number } : never)[] | undefined;
  const agenda = game.settings.mode === "agenda";

  return (
    <main className="chamber">
      <header className="topbar">
        <h1>Congress <em>of Jev</em></h1>
        <div className="small muted num">Turn {(bill?.id ?? game.turn) + 1}{game.billsPerTerm ? ` of ${game.billsPerTerm}` : ""} · <button style={{ textDecoration: "underline" }} onClick={() => setShowMap((v) => !v)}>{showMap ? "Chamber" : "Map"}</button> · <button style={{ textDecoration: "underline" }} onClick={onQuit}>Quit</button></div>
      </header>

      <section className="stage">
        {showMap ? <Map approval={game.approval} /> : <Hemicycle seated={game.seated} bill={bill} party={game.settings.party} onPick={setPick} selected={sel?.id} />}
        <div className="bigcount">
          <span className={`n num ${voted ? (bill.passed ? "pass" : "fail") : ""}`}>{voted ? yes : whipped ? exp.toFixed(1) : "—"}</span>
          <span className="muted">{voted ? (bill.passed ? (bill.struck ? "passed, struck down by the Court" : "passed") : "failed") : whipped ? `expected yes · ${need} needed` : "expected yes"}</span>
        </div>
        <div className="whipbar">
          <div className="fill" style={{ width: `${voted ? yes : exp}%` }} />
          <div className="tick" style={{ left: "51%" }}><span>51</span></div>
          <div className={`tick ${need === 60 ? "hot" : ""}`} style={{ left: "60%", opacity: need === 60 ? 1 : 0.35 }}><span>60</span></div>
        </div>
      </section>

      <aside className="rail">
        <div className="ledger card">
          <div><div className="k">Capital</div><div className="v num">{game.capital}</div></div>
          <div><div className="k">Approval</div><div className="v num">{Math.round(nationalApproval(game))}%</div></div>
          <div><div className="k">Passed</div><div className="v num">{game.bills.filter((b) => b.passed).length}</div></div>
        </div>

        {!bill && (
          <div className="card billpad">
            <div className="eyebrow" style={{ marginBottom: 8 }}>{agenda ? "Next on the agenda" : "Propose a bill"}</div>
            {agenda ? <p className="serif" style={{ fontSize: 22, margin: 0 }}>Your agenda's bill {game.turn + 1} goes to the parliamentarian.</p>
              : <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Every worker gets four weeks of paid leave, paid for by a 2% tax on…" maxLength={1200} />}
            <div className="actions"><button className="btn" disabled={busy || (!agenda && text.trim().length < 12)} onClick={async () => { if (await act(() => api.draft(game, text))) { setText(""); setDismissed(-1); } }}>{busy ? "Drafting…" : "Send to the floor"}</button></div>
          </div>
        )}

        {bill && (
          <div className="card billcard">
            <div className="eyebrow">Bill {bill.id + 1}</div>
            <h2>{bill.title}</h2>
            <p className="muted" style={{ margin: 0 }}>{bill.summary}</p>
            <div className="tags">{bill.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>
            {voted && <div style={{ marginTop: 12 }}><span className={`stamp ${bill.passed ? "pass" : "fail"}`}>{bill.passed ? "Passed" : "Failed"} {yes}–{100 - yes}</span></div>}
            <div className="actions">
              {!whipped && <button className="btn" disabled={busy} onClick={() => act(() => api.whip(game))}>{busy ? "Counting…" : "Whip count"}</button>}
              {whipped && !voted && <>
                <button className="btn gold" disabled={busy} onClick={() => act(() => api.vote(game))}>{busy ? "Voting…" : "Call the vote"}</button>
                {game.settings.amend && !bill.amendments && <button className="btn ghost" disabled={busy} onClick={() => act(() => api.amend(game))}>{busy ? "Drafting…" : "Amend"}</button>}
                {game.settings.lobby && <span className="small muted">Tap a seat to lobby.</span>}
              </>}
            </div>
            {amendments && amendments.length > 0 && !voted && <div className="amend" style={{ marginTop: 14 }}><div className="eyebrow">Pick an amendment</div>
              {amendments.map((a, i) => <button key={i} className="opt" disabled={busy} onClick={() => act(() => api.adopt(game, i))}><b>{a.title}</b><span className="small muted">{a.summary}</span><span className="small num">expected yes {a.expected.toFixed(1)}</span></button>)}</div>}
          </div>
        )}

        {(last?.headline || bill?.headline) && (() => { const h = (bill?.headline ? bill : last)!; return (
          <div className="card headline"><div className="eyebrow">Wire</div><h3>{h.headline!.title}</h3><p className="muted small" style={{ margin: "6px 0 0" }}>{h.headline!.lede}</p></div>); })()}

        {voted && <div><button className="btn" disabled={busy} onClick={() => setDismissed(game.turn)}>Next bill</button></div>}
      </aside>

      {sel && <Drawer s={sel} game={game} bill={bill} busy={busy} onClose={() => setPick(null)} onLobby={(a: LobbyAction) => act(() => api.lobby(game, sel.id, a))} />}
    </main>
  );
}
