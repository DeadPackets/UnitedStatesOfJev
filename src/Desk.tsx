import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReduced } from "./motion";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Chamber as ChamberFloor, type RollHandle } from "./Hemicycle";
import { MemberDrawer, type LobbyKind } from "./Drawer";
import { Num } from "./Ledger";
import Feed, { FeedLine } from "./Feed";
import Card, { Announce } from "./Card";
import Tour, { type TourStep } from "./Tour";
import { Ornament } from "./theme";
import { sound } from "./sound";
import Strip from "./Strip";
import Peek, { type PinItem } from "./Peek";
import Wire from "./Wire";
import type { LedgerKey } from "./rules";

type Vocab = GameView["pack"]["vocabulary"];
const TABS = ["turn", "feed"] as const;

const TOUR = (v: Vocab): Record<string, TourStep> => ({
  write: { id: "write", anchor: "billpad", title: `1 of 3 · Write a ${v.bill}`, text: `Say what it does in a sentence or two. The clerk writes it up, and every ${v.member} reads it.` },
  count: { id: "count", anchor: "whip", title: `2 of 3 · ${v.whip}`, text: `One call asks all of them how they will vote. Then tap a faint ${v.seat} on your own side.` },
  lobby: { id: "lobby", anchor: "seat", title: `2 of 3 · ${v.lobby}`, text: `That is the softest ${v.seat} on your side. Tap it, make an offer, watch the number move.` },
  vote: { id: "vote", anchor: "vote", title: "3 of 3 · Call the vote", text: `The count is a forecast, not a promise. Every ${v.member} rolls their own dice.` },
});

type DeskProps = { game: GameView; act: Act; busy: boolean; onQuit: () => void; onRolled: () => void };

export default function Desk({ game, act, busy, onQuit, onRolled }: DeskProps) {
  const reduced = useReduced();
  const pack = game.pack;
  const v = pack.vocabulary;
  const size = pack.chamber.size;

  const [dismissed, setDismissed] = useState(-1);
  const [tab, setTab] = useState<(typeof TABS)[number]>("turn");
  // `n` counts openings, so re-picking the same seat during a sheet's exit still mounts a fresh dialog.
  const [pick, setPick] = useState<{ id: string; n: number } | null>(null);
  const [muted, setMuted] = useState(sound.muted);
  const [rolling, setRolling] = useState(false);
  const [pulse, setPulse] = useState<string>();
  const [rollYes, setRollYes] = useState<number | null>(null);
  const [before, setBefore] = useState<number | null>(null);
  const [live, setLive] = useState("");
  const [answered, setAnswered] = useState<string | null>(null);
  const [peek, setPeek] = useState<LedgerKey | null>(null);
  const [pins, setPins] = useState<PinItem[]>([]);
  const [cause, setCause] = useState<string>();
  void pins; // the rail reads it from Task 12; drop this line then
  // Only what this term brought: past the pack's twenty the list stops growing and there is nothing to announce.
  const [notice, setNotice] = useState(() => (game.term > 1 && game.turn === 1 ? game.escalations.slice(2 * (game.term - 2)) : []));
  const [tour, setTour] = useState(() => { try { return localStorage.getItem("usoj:tour") !== "done"; } catch { return false; } });
  const floor = useRef<RollHandle>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPeek(null); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);

  // The last bill stays on the desk after its vote until "Next" clears it.
  const latest = game.bills.at(-1);
  const bill = latest && (latest.id === game.turn || (latest.votes && dismissed !== latest.id)) ? latest : undefined;
  const whipped = !!bill?.whip;
  const voted = !!bill?.votes;
  const exp = bill?.expected ?? 0;
  const need = bill?.needed ?? bill?.threshold ?? pack.chamber.threshold;
  const yes = bill?.yes ?? 0;
  const shownYes = rollYes ?? yes;
  const crossed = voted && !rolling && bill!.passed;
  const margin = Math.abs(yes - need);
  const sel = pick ? game.members.find((m) => m.id === pick.id) : undefined;
  const amendments = bill?.amendments;
  const event = game.events.at(-1);
  const openCard = event && event.stance === undefined ? game.events.length - 1 : -1;
  const card = event && (event.stance === undefined || answered === event.id) ? event : undefined;

  // Roll call: reveal votes one by one, accelerating, and walk the last five when the count is close.
  const rolledFor = useRef(voted ? bill!.id : -1);
  useEffect(() => {
    if (!voted || !bill || rolledFor.current === bill.id) return;
    rolledFor.current = bill.id;
    const done = () => {
      sound.play(bill.passed ? "gavel" : "thud");
      setLive(`${yes} yes, ${size - yes} no. ${bill.passed ? v.pass : v.fail}, ${need} needed.`);
    };
    if (reduced || !floor.current) { done(); return; }
    setRolling(true); setRollYes(0);
    let lastTick = 0;
    floor.current.roll(bill.votes!, (n) => { setRollYes(n); if (n !== lastTick) { lastTick = n; sound.play("tick", { pitch: n }); } },
      () => { setRolling(false); setRollYes(null); done(); }, need);
  }, [voted, bill?.id]); // eslint-disable-line

  useEffect(() => { if (bill?.headline && voted && !rolling) sound.play("slide"); }, [bill?.headline, rolling]); // eslint-disable-line
  useEffect(() => { if (bill && !whipped) { sound.play("chime"); setLive(`${v.bill}: ${bill.title}.`); } }, [bill?.id, whipped]); // eslint-disable-line
  useEffect(() => { if (whipped && !voted) setLive(`${v.whip}: ${exp.toFixed(1)} expected yes, ${need} needed.`); }, [whipped, voted]); // eslint-disable-line

  const weakest = useMemo(() => (whipped && !voted
    ? game.members.filter((m) => m.faction === game.faction).sort((a, b) => (bill!.whip![a.id] ?? 0) - (bill!.whip![b.id] ?? 0))[0]
    : undefined), [whipped, voted, game.members, game.faction, bill?.whip]); // eslint-disable-line
  const steps = TOUR(v);
  const pickSeat = useCallback((id: string) => { if (!rolling) setPick((p) => ({ id, n: (p?.n ?? 0) + 1 })); }, [rolling]);
  const step: TourStep | null = !tour || tab !== "turn" ? null
    : !bill ? steps.write
    : !whipped ? steps.count
    : !voted && Object.keys(bill.offers).length === 0 ? steps.lobby
    : !voted ? steps.vote : null;
  const hotSeat = useMemo(() => (step?.id === "lobby" && weakest ? [weakest.id] : undefined), [step?.id, weakest?.id]);
  const endTour = () => { setTour(false); try { localStorage.setItem("usoj:tour", "done"); } catch {} };
  const wasVoted = useRef(voted);
  useEffect(() => { if (tour && voted && !wasVoted.current) endTour(); wasVoted.current = voted; }, [voted]); // eslint-disable-line

  // The drawer stays open after an offer so the player watches the percentage move; the seat pulses behind it.
  const pulsing = useRef(0);
  useEffect(() => () => clearTimeout(pulsing.current), []);
  const lobby = async (k: LobbyKind) => {
    if (!sel || !bill?.whip) return;
    const was = bill.whip[sel.id];
    if (await act(() => api.lobby(game, sel.id, k))) {
      sound.play("click"); setBefore(was); setPulse(sel.id);
      clearTimeout(pulsing.current);
      pulsing.current = setTimeout(() => setPulse(undefined), 700) as unknown as number;
    }
  };
  const stance = async (i: number) => {
    if (openCard < 0 || !event) return;
    setAnswered(event.id);
    if (!await act(() => api.resolve(game, openCard, i))) setAnswered(null);
  };

  return (
    <main className="desk press" onPointerDown={sound.unlock}>
      <header className="mast">
        <b>{pack.title}</b>
        <nav aria-label={v.turn}>
          <Ornament kind={pack.theme.ornament} />
          <span className="num" style={{ padding: "0 8px" }}>{v.turn} {game.turn} of {game.turnsPerTerm}</span>
          {game.stage === "midterm" ? <span className="chip red">{v.midterm}</span> : null}
          <button className="link" aria-pressed={!muted} onClick={() => { sound.muted = !muted; setMuted(!muted); }}>{muted ? "Sound off" : "Sound on"}</button>
          <button className="link" onClick={onQuit}>Leave the seat</button>
        </nav>
      </header>

      <div className="striprow" onPointerLeave={(e) => { if (e.pointerType === "mouse" && !document.querySelector<HTMLElement>(".peek[data-stick]")) setPeek(null); }}>
        <Strip game={game} open={peek} onOpen={(k) => { setPeek(k); setCause(undefined); }} />
        {peek ? <Peek game={game} of={peek} cause={cause} onClose={() => setPeek(null)}
          onPin={(p) => setPins((xs) => (xs.some((x) => x.key === p.key) ? xs : [...xs, p]))} /> : null}
      </div>

      <div className="main">
        <section className="col deskcol" aria-label="The desk">{/* the composer lands here in Task 9 */}</section>
        <section className="col floorcol" aria-label={v.chamber}>
          <div className="floorbox">
            <ChamberFloor ref={floor} pack={pack} members={game.members} own={game.faction} coalition={game.coalition}
              whip={bill?.whip} votes={bill?.votes} rolling={rolling} pulse={pulse} selected={sel?.id}
              hot={hotSeat} onPick={pickSeat} />
          </div>
        {!bill ? <p className="prompt rise" style={{ margin: "0 auto" }}>{game.seatTitle}. Write a {v.bill}.</p> : (
          <>
            <div className={`count ${crossed ? "bounce" : ""}`}>
              {voted ? <Num value={shownYes} instant={rolling} className={`n ${!rolling && !bill.passed ? "fail" : ""}`} />
                : whipped ? <Num value={exp} decimals={1} className="n" />
                : <span className="n num muted">—</span>}
              <span className="muted">{voted ? (rolling ? `${need} needed` : bill.passed ? (bill.struck ? `${v.pass}, struck down` : v.pass) : v.fail)
                : whipped ? `expected yes · ${need} needed` : v.whip}</span>
            </div>
            <div className="whipbar" role="meter" aria-valuemin={0} aria-valuemax={size} aria-valuenow={voted ? shownYes : exp} aria-label="Yes votes">
              <div className={`fill ${voted && !rolling && !bill.passed ? "fail" : ""}`} style={{ width: `${((voted ? shownYes : exp) / size) * 100}%` }} />
              <div className="tick" style={{ left: `${(need / size) * 100}%` }}><span className="num">{need}</span></div>
              {pack.chamber.supermajority !== need ? (
                <div className="tick" style={{ left: `${(pack.chamber.supermajority / size) * 100}%`, opacity: 0.35 }}>
                  <span className="num">{pack.chamber.supermajority}</span>
                </div>
              ) : null}
            </div>
          </>
        )}
        </section>
        <aside className="col railcol" aria-label="The rail">
          <div className="railbody">
        <div className="tabs" role="tablist" aria-label="Desk views">
          {TABS.map((t) => (
            <button key={t} id={`tab-${t}`} role="tab" aria-selected={tab === t} aria-controls={tab === t ? "railpanel" : undefined}
              tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)}
              onKeyDown={(e) => {
                const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                const next = d ? TABS[(TABS.indexOf(t) + d + TABS.length) % TABS.length]
                  : e.key === "Home" ? TABS[0] : e.key === "End" ? TABS[TABS.length - 1] : undefined;
                if (!next) return;
                setTab(next); document.getElementById(`tab-${next}`)?.focus();
              }}>{t === "turn" ? v.turn : v.feed}</button>
          ))}
        </div>

        <div id="railpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} className="railpanel">
        {tab === "feed" ? <Feed game={game} bill={bill} act={act} busy={busy} /> : <>

        {bill ? (
          <div key={`bill-${bill.id}-${bill.title}`} className="billcard panel rise">
            <div className="kicker num">{v.bill} {bill.id}</div>
            <h2>{bill.title}</h2>
            <p className="muted" style={{ margin: 0 }}>{bill.summary}</p>
            <div className="tags">{bill.tags.map((t, i) => <span key={t} className="chip faint rise" style={{ animationDelay: `${120 + i * 40}ms` }}>{t}</span>)}</div>
            {voted && !rolling ? (
              <div style={{ marginTop: 12 }}>
                <span className={`stampsm stampin shake ${bill.passed ? "pass" : "fail"}`} style={{ "--sh": `${margin >= 10 ? 6 : margin >= 4 ? 4 : 2}px` } as any}>
                  {bill.passed ? v.pass : v.fail} {yes}–{size - yes}
                </span>
              </div>
            ) : null}
            <div className="actions">
              {!whipped ? <button className={`btn ${busy ? "busy" : ""}`} data-tour="whip" data-primary disabled={busy} onClick={() => act(() => api.whip(game))}>{busy ? "Counting" : v.whip}</button> : null}
              {whipped && !voted ? <>
                <button className={`btn ${busy ? "busy" : ""}`} data-tour="vote" data-tour-hot={step?.id === "vote"} data-primary disabled={busy} onClick={() => act(() => api.vote(game))}>{busy ? "Voting" : "Call the vote"}</button>
                {!bill.amendments ? <button className="btn ghost" disabled={busy} onClick={() => act(() => api.amend(game))}>Amend the {v.bill}</button> : null}
                <span className="small muted">Tap a {v.seat} to make an offer.</span>
              </> : null}
              {voted && !rolling ? <button className="btn" data-primary disabled={busy} onClick={() => { setDismissed(bill.id); onRolled(); if (game.stage === "session") act(() => api.endTurn(game)); }}>
                {game.stage === "session" ? `Next ${v.bill}` : "Continue"}
              </button> : null}
            </div>
            {amendments?.length && !voted ? (
              <div className="amend"><div className="kicker">Adopt an amendment</div>
                {amendments.map((a, i) => (
                  <button key={i} className="opt2" disabled={busy} onClick={() => act(() => api.adopt(game, i))}>
                    <b>{a.title}</b><span className="small muted">{a.summary}</span>
                    <span className="small num">expected yes {a.expected.toFixed(1)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <FeedLine game={game} bill={bill} />

        {bill?.headline && !rolling ? (
          <div key={bill.id} className="headline panel rise" style={{ animationDelay: "120ms" }}>
            <div className="kicker">{v.feed}</div>
            <h3>{bill.headline.title}</h3>
            <p className="muted small" style={{ margin: "6px 0 0" }}>{bill.headline.lede}</p>
          </div>
        ) : null}

        {/* the two quotes slide in after the stamp has landed */}
        {voted && !rolling && bill!.quotes?.length ? (
          <div key={`said-${bill!.id}`} className="quotes">
            {bill!.quotes.slice(0, 2).map((q, i) => (
              <blockquote key={q.name} className="pull rise" style={{ animationDelay: `${640 + i * 180}ms` }}>
                {q.text}<cite>{q.name}</cite>
              </blockquote>
            ))}
          </div>
        ) : null}
        </>}
        </div>
          </div>
        </aside>
      </div>

      <div className="sr" role="status" aria-live="polite">{live}</div>
      {sel ? <MemberDrawer key={`${sel.id}#${pick!.n}`} pack={pack} member={sel} capital={game.ledgers.authority}
        costs={game.lobbyCosts} bill={bill} before={before} busy={busy}
        onLobby={lobby} onClose={() => { setPick(null); setBefore(null); }} /> : null}
      {card && !rolling ? <Card key={card.id} pack={pack} event={card} blocs={game.blocs} turn={card.turn} busy={busy}
        onStance={stance} onClose={() => setAnswered(null)} /> : null}
      {notice.length ? <Announce key={game.term} pack={pack} keys={notice} onClose={() => setNotice([])} /> : null}
      <Tour step={step} onSkip={endTour} />
      <Wire game={game} onPick={(k, c) => { setPeek(k); setCause(c); }} />
    </main>
  );
}
