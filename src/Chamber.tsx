import { useEffect, useRef, useState } from "react";
import { useReducedMotion, animate } from "motion/react";
import { expectedYes, passThreshold, nationalApproval, type Bill, type BillDraft, type Senator, type LobbyAction } from "../worker/engine";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import Hemicycle, { type RollHandle } from "./Hemicycle";
import Drawer from "./Drawer";
import Map from "./Map";
import Tour, { TOUR_BILL, type TourStep } from "./Tour";
import { sound } from "./sound";

function Num({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (reduced) { el.textContent = value.toFixed(decimals); prev.current = value; return; }
    const c = animate(prev.current, value, { duration: 0.7, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { el.textContent = v.toFixed(decimals); } });
    prev.current = value; return () => c.stop();
  }, [value, decimals, reduced]);
  return <span ref={ref} className={`num ${className ?? ""}`}>{value.toFixed(decimals)}</span>;
}

function Headline({ bill }: { bill: Bill }) {
  return <div key={bill.id} className="headline panel rise" style={{ animationDelay: "120ms" }}><div className="kicker">Wire</div><h3>{bill.headline!.title}</h3><p className="muted small" style={{ margin: "6px 0 0" }}>{bill.headline!.lede}</p></div>;
}

const TOUR_STEPS: Record<string, TourStep> = {
  write: { id: "write", anchor: "billpad", title: "1 of 3 · Write a bill", text: "This one is prefilled. Send it, or write your own. Luna turns it into a bill; Jev reads it to every senator." },
  count: { id: "count", anchor: "whip", title: "2 of 3 · Count the votes", text: "One call, 100 senators, a third of a second. Then tap the dim seat on your side to twist an arm." },
  lobby: { id: "lobby", anchor: "seat", title: "2 of 3 · Lobby", text: "That is the weakest senator on your side. Tap the seat, promise a project, watch the odds move." },
  vote: { id: "vote", anchor: "vote", title: "3 of 3 · Call the vote", text: "The count is a forecast, not a promise. Every senator rolls their own dice." },
};
type Amendment = BillDraft & { expected: number };

export default function Chamber({ game, act, busy, onQuit }: { game: GameView; act: Act; busy: boolean; onQuit: () => void }) {
  const reduced = useReducedMotion();
  const [dismissed, setDismissed] = useState(-1);
  const last = game.bills[game.turn - 1];
  // After a vote the turn advances; keep showing the voted bill until "Next bill".
  const bill = game.bills[game.turn] ?? (last?.votes && dismissed !== game.turn ? last : undefined);
  const [tour, setTour] = useState(() => { try { return localStorage.getItem("usoj:tour") !== "done"; } catch { return false; } });
  const [text, setText] = useState(tour ? TOUR_BILL : "");
  const [pick, setPick] = useState<Senator | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [muted, setMuted] = useState(sound.muted);
  const [rolling, setRolling] = useState(false);
  const [pulse, setPulse] = useState<string>();
  const [rollYes, setRollYes] = useState<number | null>(null);
  const hemi = useRef<RollHandle>(null);
  const [live, setLive] = useState("");
  const sel = pick ? game.seated.find((s) => s.id === pick.id) : undefined;
  const whipped = !!bill?.whip;
  const voted = !!bill?.votes;
  const exp = whipped ? expectedYes(bill.whip!) : 0;
  const yes = voted ? Object.values(bill.votes!).filter(Boolean).length : 0;
  const need = bill ? passThreshold(bill) : 51;
  const amendments = bill?.amendments as Amendment[] | undefined;
  const agenda = game.settings.mode === "agenda";
  const offers = bill ? Object.keys(bill.offers).length : 0;
  const shownYes = rollYes ?? yes;
  const crossed = voted && !rolling && bill.passed;

  // Beat 4: roll call. Reveal votes one by one in random order, accelerating; ticks rise with the yes count.
  const rolledFor = useRef<number>(bill?.votes ? bill.id : -1);
  useEffect(() => {
    if (!voted || rolledFor.current === bill.id) return;
    rolledFor.current = bill.id;
    const done = () => { bill.passed ? sound.play("gavel") : sound.play("thud"); setLive(`Vote: ${yes} yes, ${100 - yes} no. ${bill.passed ? "Passed" : "Failed"}, ${need} needed.`); };
    if (reduced || !hemi.current) { done(); return; }
    setRolling(true); setRollYes(0);
    let lastTick = 0;
    hemi.current.roll(bill.votes!, (n) => { setRollYes(n); if (n !== lastTick) { lastTick = n; sound.play("tick", { pitch: n }); } }, () => { setRolling(false); setRollYes(null); done(); });
  }, [voted, bill?.id]); // eslint-disable-line

  useEffect(() => { if (bill?.headline && voted && !rolling) sound.play("slide"); }, [bill?.headline, rolling]); // eslint-disable-line
  useEffect(() => { if (bill && !whipped) { sound.play("chime"); setLive(`Bill drafted: ${bill.title}.`); } }, [bill?.id, whipped]); // eslint-disable-line
  useEffect(() => { if (whipped && !voted) setLive(`Whip count: ${exp.toFixed(1)} expected yes, ${need} needed.`); }, [whipped, voted]); // eslint-disable-line

  const weakest = whipped && !voted ? game.seated.filter((s) => s.party === game.settings.party).sort((a, b) => bill.whip![a.id] - bill.whip![b.id])[0] : undefined;
  const step: TourStep | null = !tour ? null : !bill ? TOUR_STEPS.write : !whipped ? TOUR_STEPS.count : !voted && offers === 0 && game.settings.lobby ? TOUR_STEPS.lobby : !voted ? TOUR_STEPS.vote : null;
  const endTour = () => { setTour(false); try { localStorage.setItem("usoj:tour", "done"); } catch {} };
  const wasVoted = useRef(voted);
  useEffect(() => { if (tour && voted && !wasVoted.current) endTour(); wasVoted.current = voted; }, [voted]); // eslint-disable-line

  const draft = async () => { if (await act(() => api.draft(game, text))) { setText(""); setDismissed(-1); } };
  const [before, setBefore] = useState<number | null>(null);
  // Keep the drawer open after a lobby so the player watches the percentage move; the seat pulses behind it.
  const lobby = async (a: LobbyAction) => { if (!sel || !bill?.whip) return; const was = bill.whip[sel.id]; if (await act(() => api.lobby(game, sel.id, a))) { sound.play("click"); setBefore(was); setPulse(sel.id); setTimeout(() => setPulse(undefined), 700); } };
  const headline = bill?.headline ? bill : last?.headline ? last : null;

  return (
    <main className="chamber press" onPointerDown={sound.unlock}>
      <header className="topbar">
        <h1>Congress <span>of Jev</span></h1>
        <nav aria-label="Game">
          <span className="num" style={{ padding: "0 6px" }}>Turn {(bill?.id ?? game.turn) + 1}{game.billsPerTerm ? ` of ${game.billsPerTerm}` : ""}</span>
          <button className="link" aria-pressed={showMap} onClick={() => setShowMap((v) => !v)}>{showMap ? "Chamber" : "Map"}</button>
          <button className="link" aria-pressed={!muted} onClick={() => { sound.muted = !muted; setMuted(!muted); }}>{muted ? "Sound off" : "Sound on"}</button>
          <button className="link" onClick={onQuit}>Quit</button>
        </nav>
      </header>

      <section className="stage" aria-label="Chamber floor">
        {showMap ? <div className="rise"><Map approval={game.approval} /></div>
          : <Hemicycle ref={hemi} seated={game.seated} bill={bill} party={game.settings.party} onPick={(s) => { if (!rolling) setPick(s); }} selected={sel?.id} rolling={rolling} pulse={pulse} hot={step?.id === "lobby" ? weakest?.id : undefined} />}
        {!bill ? <p className="prompt rise" style={{ margin: "0 auto" }}>{agenda ? "The Senate is seated. Send the next bill." : "The Senate is seated. Write a bill."}</p> : (
          <>
            <div className={`count ${crossed ? "bounce" : ""}`}>
              {voted ? <Num value={shownYes} className={`n ${!rolling && !bill.passed ? "fail" : ""}`} /> : whipped ? <Num value={exp} decimals={1} className="n" /> : <span className="n muted">—</span>}
              <span className="muted">{voted ? (rolling ? `roll call · ${need} needed` : bill.passed ? (bill.struck ? "passed, struck down by the Court" : "passed") : "failed") : whipped ? `expected yes · ${need} needed` : "run the whip count"}</span>
            </div>
            <div className="whipbar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={voted ? shownYes : exp} aria-label="Yes votes">
              <div className={`fill ${voted && !rolling && !bill.passed ? "fail" : ""}`} style={{ width: `${voted ? shownYes : exp}%` }} />
              <div className="tick" style={{ left: "51%" }}><span>51</span></div>
              <div className={`tick ${need === 60 ? "hot" : ""}`} style={{ left: "60%", opacity: need === 60 ? 1 : 0.35 }}><span>60</span></div>
            </div>
          </>
        )}
      </section>

      <aside className="rail" aria-label="Desk">
        <div className="ledger panel">
          <div><div className="k">Capital</div><div className="v"><Num value={game.capital} /></div></div>
          <div><div className="k">Approval</div><div className="v"><Num value={Math.round(nationalApproval(game))} />%</div></div>
          <div><div className="k">Passed</div><div className="v num">{game.bills.filter((b) => b.passed).length}</div></div>
        </div>

        {!bill ? (
          <div key="pad" className="billpad panel rise" data-tour="billpad">
            <label className="kicker" htmlFor="bill" style={{ display: "block", marginBottom: 8 }}>{agenda ? "Next on the agenda" : "Propose a bill"}</label>
            {agenda ? <p className="tell" style={{ margin: 0 }}>Bill {game.turn + 1} of your agenda goes to the parliamentarian.</p>
              : <textarea id="bill" value={text} onChange={(e) => setText(e.target.value)} placeholder="Every worker gets four weeks of paid leave, paid for by a 2% tax on…" maxLength={1200} rows={4} />}
            <div className="actions"><button className={`btn ${busy ? "busy" : ""}`} disabled={busy || (!agenda && text.trim().length < 12)} onClick={draft}>{busy ? "Drafting" : "Send to the floor"}</button></div>
          </div>
        ) : (
          <div key={`bill-${bill.id}-${bill.title}`} className="billcard panel rise">
            <div className="kicker num">Bill {bill.id + 1}</div>
            <h2>{bill.title}</h2>
            <p className="muted" style={{ margin: 0 }}>{bill.summary}</p>
            <div className="tags">{bill.tags.map((t, i) => <span key={t} className="chip faint rise" style={{ animationDelay: `${120 + i * 40}ms` }}>{t}</span>)}</div>
            {voted && !rolling ? <div style={{ marginTop: 12 }}><span className={`stampsm stampin ${bill.passed ? "pass" : "fail"}`}>{bill.passed ? "Passed" : "Failed"} {yes}–{100 - yes}</span></div> : null}
            <div className="actions">
              {!whipped ? <button className={`btn ${busy ? "busy" : ""}`} data-tour="whip" disabled={busy} onClick={() => act(() => api.whip(game))}>{busy ? "Counting" : "Whip count"}</button> : null}
              {whipped && !voted ? <>
                <button className={`btn ${busy ? "busy" : ""}`} data-tour="vote" data-tour-hot={step?.id === "vote"} disabled={busy} onClick={() => act(() => api.vote(game))}>{busy ? "Voting" : "Call the vote"}</button>
                {game.settings.amend && !bill.amendments ? <button className="btn ghost" disabled={busy} onClick={() => act(() => api.amend(game))}>Amend</button> : null}
                {game.settings.lobby ? <span className="small muted">Tap a seat to lobby.</span> : null}
              </> : null}
              {voted && !rolling ? <button className="btn" disabled={busy} onClick={() => setDismissed(game.turn)}>Next bill</button> : null}
            </div>
            {amendments && amendments.length > 0 && !voted ? <div className="amend"><div className="kicker">Pick an amendment</div>
              {amendments.map((a, i) => <button key={i} className="opt2" disabled={busy} onClick={() => act(() => api.adopt(game, i))}><b>{a.title}</b><span className="small muted">{a.summary}</span><span className="small num">expected yes {a.expected.toFixed(1)}</span></button>)}</div> : null}
          </div>
        )}

        {headline && !rolling ? <Headline bill={headline} /> : null}
      </aside>

      <div className="sr" role="status" aria-live="polite">{live}</div>
      {sel ? <Drawer s={sel} game={game} bill={bill} busy={busy} before={before} onClose={() => { setPick(null); setBefore(null); }} onLobby={lobby} /> : null}
      <Tour step={step} onSkip={endTour} />
    </main>
  );
}
