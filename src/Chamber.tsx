import { useEffect, useRef, useState } from "react";
import { useReducedMotion, animate } from "motion/react";
import { expectedYes, passThreshold, nationalApproval, type Senator, type LobbyAction } from "../worker/engine";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import Hemicycle from "./Hemicycle";
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
    const c = animate(prev.current, value, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => { el.textContent = v.toFixed(decimals); } });
    prev.current = value; return () => c.stop();
  }, [value, decimals, reduced]);
  return <span ref={ref} className={`num ${className ?? ""}`}>{value.toFixed(decimals)}</span>;
}

const TOUR_STEPS: Record<string, TourStep> = {
  write: { id: "write", anchor: "billpad", title: "1 of 3 · Write a bill", text: "This one is prefilled. Send it, or write your own. Luna turns it into a bill; Jev reads it to every senator." },
  count: { id: "count", anchor: "whip", title: "2 of 3 · Count the votes", text: "One call, 100 senators, a third of a second. Then tap the dim seat on your side to twist an arm." },
  lobby: { id: "lobby", anchor: "seat", title: "2 of 3 · Lobby", text: "That is the weakest senator on your side. Tap the seat, promise a project, watch the odds move." },
  vote: { id: "vote", anchor: "vote", title: "3 of 3 · Call the vote", text: "The count is a forecast, not a promise. Every senator rolls their own dice." },
};

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
  const [revealed, setRevealed] = useState<Set<string> | null>(null);
  const [pulse, setPulse] = useState<string>();
  const [rollYes, setRollYes] = useState<number | null>(null);
  const sel = pick ? game.seated.find((s) => s.id === pick.id) : undefined;
  const whipped = !!bill?.whip;
  const voted = !!bill?.votes;
  const exp = whipped ? expectedYes(bill.whip!) : 0;
  const yes = voted ? Object.values(bill.votes!).filter(Boolean).length : 0;
  const need = bill ? passThreshold(bill) : 51;
  const amendments = bill?.amendments as ((NonNullable<typeof bill>["amendments"] extends (infer T)[] | undefined ? T : never) & { expected: number })[] | undefined;
  const agenda = game.settings.mode === "agenda";
  const rolling = revealed !== null;
  const offers = bill ? Object.keys(bill.offers).length : 0;

  // Beat 4: roll call. Reveal votes one by one in random order, accelerating; sounds tick up with the yes count.
  const rolledFor = useRef<number>(bill?.votes ? bill.id : -1); // a bill already voted at mount does not replay
  useEffect(() => {
    if (!voted || rolledFor.current === bill.id) return;
    rolledFor.current = bill.id;
    if (reduced) { bill.passed ? sound.play("gavel") : sound.play("thud"); return; }
    const ids = Object.keys(bill.votes!).sort(() => Math.random() - 0.5);
    const set = new Set<string>(); let count = 0, i = 0;
    setRevealed(new Set()); setRollYes(0);
    const step = () => {
      if (i >= ids.length) { setRevealed(null); setRollYes(null); bill.passed ? sound.play("gavel") : sound.play("thud"); return; }
      const id = ids[i++]; set.add(id); if (bill.votes![id]) count++;
      setRevealed(new Set(set)); setRollYes(count); sound.play("tick", { pitch: count });
      setTimeout(step, Math.max(8, 50 - i * 0.45));
    };
    step();
  }, [voted, bill?.id]); // eslint-disable-line

  useEffect(() => { if (bill?.headline && voted && !rolling) sound.play("slide"); }, [bill?.headline, rolling]); // eslint-disable-line
  useEffect(() => { if (bill && !whipped) sound.play("chime"); }, [bill?.id, whipped]); // eslint-disable-line

  const weakest = whipped && !voted ? game.seated.filter((s) => s.party === game.settings.party).sort((a, b) => bill.whip![a.id] - bill.whip![b.id])[0] : undefined;
  const step: TourStep | null = !tour ? null : !bill ? TOUR_STEPS.write : !whipped ? TOUR_STEPS.count : !voted && offers === 0 && game.settings.lobby ? TOUR_STEPS.lobby : !voted ? TOUR_STEPS.vote : null;
  const endTour = () => { setTour(false); try { localStorage.setItem("usoj:tour", "done"); } catch {} };
  const wasVoted = useRef(voted);
  useEffect(() => { if (tour && voted && !wasVoted.current) endTour(); wasVoted.current = voted; }, [voted]); // eslint-disable-line

  const shownYes = rollYes ?? yes;
  const crossed = voted && !rolling && bill.passed;

  return (
    <main className="chamber" onPointerDown={sound.unlock}>
      <header className="topbar">
        <h1>Congress <em>of Jev</em></h1>
        <div className="small muted num">Turn {(bill?.id ?? game.turn) + 1}{game.billsPerTerm ? ` of ${game.billsPerTerm}` : ""} · <button style={{ textDecoration: "underline" }} onClick={() => setShowMap((v) => !v)}>{showMap ? "Chamber" : "Map"}</button> · <button className="mute" onClick={() => { sound.muted = !muted; setMuted(!muted); }}>{muted ? "Sound off" : "Sound on"}</button> · <button style={{ textDecoration: "underline" }} onClick={onQuit}>Quit</button></div>
      </header>

      <section className="stage">
        {showMap ? <Map approval={game.approval} /> : <Hemicycle seated={game.seated} bill={bill} party={game.settings.party} onPick={(s) => { if (!rolling) setPick(s); }} selected={sel?.id} revealed={revealed} pulse={pulse} hot={step?.id === "lobby" ? weakest?.id : undefined} />}
        <div className={`bigcount ${crossed ? "bounce" : ""}`}>
          {voted ? <Num value={shownYes} className={`n ${!rolling ? (bill.passed ? "pass" : "fail") : ""}`} /> : whipped ? <Num value={exp} decimals={1} className="n" /> : <span className="n">—</span>}
          <span className="muted">{voted ? (rolling ? `roll call · ${need} needed` : bill.passed ? (bill.struck ? "passed, struck down by the Court" : "passed") : "failed") : whipped ? `expected yes · ${need} needed` : "expected yes"}</span>
        </div>
        <div className="whipbar">
          <div className="fill" style={{ width: `${voted ? shownYes : exp}%` }} />
          <div className="tick" style={{ left: "51%" }}><span>51</span></div>
          <div className={`tick ${need === 60 ? "hot" : ""}`} style={{ left: "60%", opacity: need === 60 ? 1 : 0.35 }}><span>60</span></div>
        </div>
      </section>

      <aside className="rail">
        <div className="ledger card">
          <div><div className="k">Capital</div><div className="v"><Num value={game.capital} /></div></div>
          <div><div className="k">Approval</div><div className="v"><Num value={Math.round(nationalApproval(game))} />%</div></div>
          <div><div className="k">Passed</div><div className="v num">{game.bills.filter((b) => b.passed).length}</div></div>
        </div>

        {!bill ? (
          <div key="pad" className="card billpad rise" data-tour="billpad">
            <div className="eyebrow" style={{ marginBottom: 8 }}>{agenda ? "Next on the agenda" : "Propose a bill"}</div>
            {agenda ? <p className="serif" style={{ fontSize: 22, margin: 0 }}>Your agenda's bill {game.turn + 1} goes to the parliamentarian.</p>
              : <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Every worker gets four weeks of paid leave, paid for by a 2% tax on…" maxLength={1200} />}
            <div className="actions"><button className="btn" disabled={busy || (!agenda && text.trim().length < 12)} onClick={async () => { if (await act(() => api.draft(game, text))) { setText(""); setDismissed(-1); } }}>{busy ? "Drafting…" : "Send to the floor"}</button></div>
          </div>
        ) : (
          <div key={`bill-${bill.id}-${bill.title}`} className="card billcard rise">
            <div className="eyebrow">Bill {bill.id + 1}</div>
            <h2>{bill.title}</h2>
            <p className="muted" style={{ margin: 0 }}>{bill.summary}</p>
            <div className="tags">
              {bill.tags.map((t, i) => <span key={t} className="chip rise" style={{ animationDelay: `${120 + i * 40}ms` }}>{t}</span>)}
            </div>
            {voted && !rolling && <div style={{ marginTop: 12 }}><span className={`stamp stampin ${bill.passed ? "pass" : "fail"}`}>{bill.passed ? "Passed" : "Failed"} {yes}–{100 - yes}</span></div>}
            <div className="actions">
              {!whipped && <button className="btn" data-tour="whip" disabled={busy} onClick={() => act(() => api.whip(game))}>{busy ? "Counting…" : "Whip count"}</button>}
              {whipped && !voted && <>
                <button className="btn gold" data-tour="vote" data-tour-hot={step?.id === "vote"} disabled={busy} onClick={() => act(() => api.vote(game))}>{busy ? "Voting…" : "Call the vote"}</button>
                {game.settings.amend && !bill.amendments && <button className="btn ghost" disabled={busy} onClick={() => act(() => api.amend(game))}>{busy ? "Drafting…" : "Amend"}</button>}
                {game.settings.lobby && <span className="small muted">Tap a seat to lobby.</span>}
              </>}
            </div>
            {amendments && amendments.length > 0 && !voted && <div className="amend" style={{ marginTop: 14 }}><div className="eyebrow">Pick an amendment</div>
              {amendments.map((a, i) => <button key={i} className="opt" disabled={busy} onClick={() => act(() => api.adopt(game, i))}><b>{a.title}</b><span className="small muted">{a.summary}</span><span className="small num">expected yes {a.expected.toFixed(1)}</span></button>)}</div>}
          </div>
        )}

        {(bill?.headline || last?.headline) && !rolling && (() => { const h = (bill?.headline ? bill : last)!; return (
          <div key={h.id} className="card headline rise" style={{ animationDelay: "120ms" }}><div className="eyebrow">Wire</div><h3>{h.headline!.title}</h3><p className="muted small" style={{ margin: "6px 0 0" }}>{h.headline!.lede}</p></div>); })()}

        {voted && !rolling && <div><button className="btn" disabled={busy} onClick={() => setDismissed(game.turn)}>Next bill</button></div>}
      </aside>

      {sel && <Drawer s={sel} game={game} bill={bill} busy={busy} onClose={() => setPick(null)}
        onLobby={async (a: LobbyAction) => { if (await act(() => api.lobby(game, sel.id, a))) { sound.play("click"); setPulse(sel.id); setTimeout(() => setPulse(undefined), 700); setPick(null); } }} />}
      <Tour step={step} onSkip={endTour} />
    </main>
  );
}
