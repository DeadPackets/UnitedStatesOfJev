import { useCallback, useEffect, useRef, useState } from "react";
import { useReduced } from "./motion";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Chamber as ChamberFloor, type RollHandle } from "./Hemicycle";
import { MemberDrawer, type LobbyKind } from "./Drawer";
import { Num } from "./Ledger";
import Feed, { FeedLine } from "./Feed";
import Card, { Announce, WarningCard, type CardKind } from "./Card";
import Tour, { type TourStep } from "./Tour";
import { Ornament } from "./theme";
import { sound } from "./sound";
import Strip from "./Strip";
import Peek, { type PinItem } from "./Peek";
import Wire from "./Wire";
import Holders from "./Holders";
import Compose from "./Compose";
import Tag from "./PriceTag";
import { mandateOf, settleVerb, unreadTabs, type LedgerKey, type VerbKey } from "./rules";
import Rail, { type Tab } from "./Rail";
import { Country, Room, RecordTab } from "./Panels";

const TOUR = (game: GameView): Record<string, TourStep> => ({
  write: { id: "write", anchor: "compose", title: "1 of 3 · Say what you are doing",
    text: "Seven instruments, each with its own price. Write the act in a sentence and the right one settles itself." },
  price: { id: "price", anchor: "tag", title: "2 of 3 · Read the price",
    text: `What it costs, what it earns, who it serves and who it hits. Nothing is hidden, so ${game.ruler.role} can see a loss coming.` },
  end: { id: "end", anchor: "end", title: `3 of 3 · End the ${game.pack.vocabulary.turn}`,
    text: "Acts resolve as you make them. The world moves only when you end the turn." },
});

type DeskProps = { game: GameView; act: Act; busy: boolean; onQuit: () => void; onRolled: () => void };

export default function Desk({ game, act, busy, onQuit, onRolled }: DeskProps) {
  const reduced = useReduced();
  const pack = game.pack;
  const v = pack.vocabulary;
  const size = pack.chamber.size;

  const [dismissed, setDismissed] = useState(-1);
  const [tab, setTab] = useState<Tab>("feed");
  const [seen, setSeen] = useState<Record<string, number>>({});
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
  const [holder, setHolder] = useState<string | null>(null);
  const [seat, setSeat] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [verb, setVerb] = useState<VerbKey | null>(null);
  const [picked, setPicked] = useState(false);
  const [sheet, setSheet] = useState(false);
  useEffect(() => { if (!picked) setVerb(settleVerb(text, game.instruments)); }, [text, picked, game.instruments]);
  // Only what this term brought: past the pack's twenty the list stops growing and there is nothing to announce.
  const [notice, setNotice] = useState(() => (game.term > 1 && game.turn === 1 ? game.escalations.slice(2 * (game.term - 2)) : []));
  const [tour, setTour] = useState(() => { try { return localStorage.getItem("usoj:tour") !== "done"; } catch { return false; } });
  const floor = useRef<RollHandle>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPeek(null); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);

  // A bill lives on the desk for its own turn. Outside the session a voted one waits for "Continue", and
  // never inside it: a stale "Next" there would end a second turn.
  const latest = game.bills.at(-1);
  const bill = latest && (latest.id === game.turn || (latest.votes && dismissed !== latest.id && game.stage !== "session")) ? latest : undefined;
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
  const cardOpen = !!game.events.at(-1) && game.events.at(-1)!.stance === undefined;
  const openCard = cardOpen ? game.events.length - 1 : -1;
  const card = event && (event.stance === undefined || answered === event.id) ? event : undefined;
  const KIND: Record<string, CardKind> = { generic: "crisis", dated: "crisis", relief: "crisis", crisis: "crisis", swan: "swan", foreign: "foreign" };
  // keyed by holder and turn: two open warnings both dismiss, and a holder warned again later shows again
  const [held, setHeld] = useState<string[]>([]);
  const warning = game.warnings.find((w) => !held.includes(`${w.holder}@${w.at}`)) ?? null;
  const warnedHolder = warning ? game.holders.find((h) => h.id === warning.holder) : undefined;
  // the worker owns the schedule: a discount on the wire is what opens this panel
  const campaigning = game.discount < 1;
  const counted = game.holders.filter((h) => h.weight > 0);
  const mandate = mandateOf(counted);

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
  useEffect(() => { if (game.pending) setLive(`Next ${v.turn}. ${game.pending}`); }, [game.pending]); // eslint-disable-line
  useEffect(() => { if (whipped && !voted) setLive(`${v.whip}: ${exp.toFixed(1)} expected yes, ${need} needed.`); }, [whipped, voted]); // eslint-disable-line

  const steps = TOUR(game);
  const pickSeat = useCallback((id: string) => { if (!rolling) { setSeat(id); setPick((p) => ({ id, n: (p?.n ?? 0) + 1 })); } }, [rolling]);
  const step: TourStep | null = !tour ? null
    : !game.tag && !game.refusal && !text.trim() ? steps.write
    : game.tag || game.refusal ? steps.price
    : steps.end;
  const endTour = () => { setTour(false); try { localStorage.setItem("usoj:tour", "done"); } catch {} };
  const wasEnded = useRef(game.turn);
  useEffect(() => { if (tour && game.turn > wasEnded.current) endTour(); wasEnded.current = game.turn; }, [game.turn]); // eslint-disable-line

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
      <a className="sr" href="#actpad">Skip to the desk</a>
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
        <section className="col deskcol" aria-label="The desk" data-open={sheet}>
          <Compose game={game} act={act} busy={busy} verb={verb} text={text} seat={seat}
            onVerb={(v) => { setPicked(true); setVerb(v); }} onText={setText} />
          <Tag game={game} act={act} busy={busy} onDone={() => { setText(""); setPicked(false); }} />
          {bill ? (
            <section className="tabled" aria-label={`${v.bill} ${bill.id}`}>
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
                  {!whipped ? <button className={`btn ${busy ? "busy" : ""}`} data-primary disabled={busy} onClick={() => act(() => api.whip(game))}>{busy ? "Counting" : v.whip}</button> : null}
                  {whipped && !voted ? <>
                    <button className={`btn ${busy ? "busy" : ""}`} data-primary disabled={busy} onClick={() => act(() => api.vote(game))}>{busy ? "Voting" : "Call the vote"}</button>
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
            </section>
          ) : null}
          <div className="endturn panel">
            {game.pending ? <p className="small"><span className="kicker">Next</span> {game.pending}</p> : null}
            <button className={`btn ghost ${busy ? "busy" : ""}`} data-tour="end"
              disabled={busy || rolling || cardOpen || game.stage !== "session"}
              onClick={() => { onRolled(); act(() => api.endTurn(game)).then((ok) => { if (ok) { setText(""); setPicked(false); } }); }}>
              {busy ? "Ending" : `End the ${v.turn}`}
            </button>
            {game.tag ? <p className="small muted">What is priced on the desk is dropped, not committed.</p> : null}
            {cardOpen ? <p className="small muted">Answer the card on the desk first.</p> : null}
          </div>
        </section>
        <section className="col floorcol" aria-label={v.chamber}>
          <div className="floorbox">
            <ChamberFloor ref={floor} pack={pack} members={game.members} own={game.faction} coalition={game.coalition}
              whip={bill?.whip} votes={bill?.votes} rolling={rolling} pulse={pulse} selected={sel?.id}
              onPick={pickSeat} />
          </div>
        {!bill ? <p className="prompt rise" style={{ margin: "0 auto" }}>{game.seatTitle}. Write a {v.bill}.</p> : (
          <>
            <div className={`count ${crossed ? "bounce" : ""}`}>
              {voted ? <Num value={shownYes} instant={rolling} className={`n ${!rolling && !bill.passed ? "fail" : ""}`} />
                : whipped ? <Num value={exp} decimals={1} className="n" />
                : <span className="n num muted">·</span>}
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
          {campaigning ? (
            <div className="campaignview panel">
              <div className="kicker">{v.campaign} · acts aimed at the counted holders cost <span className="num">{Math.round((1 - game.discount) * 100)}</span> per cent less</div>
              <div className="count">
                <Num value={mandate * 100} decimals={1} className={`n ${mandate < game.bar ? "fail" : ""}`} />
                <span className="muted num">of {(game.bar * 100).toFixed(0)} needed</span>
              </div>
              <div className="whipbar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mandate * 100)} aria-label={v.test}>
                <div className={`fill ${mandate < game.bar ? "fail" : ""}`} style={{ width: `${Math.min(100, mandate * 100)}%` }} />
                <div className="tick" style={{ left: `${game.bar * 100}%` }}><span className="num">{(game.bar * 100).toFixed(0)}</span></div>
              </div>
              <ul className="causes" aria-label="The arithmetic, holder by holder">
                {counted.map((h) => (
                  <li key={h.id}>
                    <b className="num">{(h.weight * h.support).toFixed(1)}</b>
                    <span>{h.name}, {h.weight.toFixed(2)} of the room at {Math.round(h.support)}, moved by {h.levers.map((l) => game.instruments[l]?.name ?? l).join(", ")}</span>
                  </li>
                ))}
              </ul>
              {game.rival ? (
                <p className="small">{game.rival.line} {game.rival.region ? `In ${game.pack.regions.find((r) => r.id === game.rival!.region)?.name ?? game.rival.region}.` : ""}</p>
              ) : null}
            </div>
          ) : null}
          <Holders holders={game.holders} warnings={game.warnings} onPick={(id) => { setHolder(id); setTab("room"); setSeen((s) => ({ ...s, room: game.turn })); }} />
        </section>
        <aside className="col railcol" aria-label="The rail">
          <Rail label={{ feed: v.feed, country: "Country", room: "Room", record: "Record", pinned: "Pinned" }}
            tab={tab} onTab={(t) => { setTab(t); setSeen((s) => ({ ...s, [t]: game.turn })); }}
            unread={unreadTabs(game, seen)} pins={pins} onUnpin={(k) => setPins((xs) => xs.filter((x) => x.key !== k))}>
            {tab === "feed" ? <Feed game={game} bill={bill} act={act} busy={busy} /> : null}
            {tab === "country" ? <Country game={game} /> : null}
            {tab === "room" ? <Room game={game} selected={holder} onPick={setHolder}
              onPin={(p) => setPins((xs) => (xs.some((x) => x.key === p.key) ? xs : [...xs, p]))} /> : null}
            {tab === "record" ? <RecordTab game={game} /> : null}
          </Rail>
        </aside>
      </div>

      <div className="sr" role="status" aria-live="polite">{live}</div>
      {sel ? <MemberDrawer key={`${sel.id}#${pick!.n}`} pack={pack} member={sel} capital={game.ledgers.authority}
        costs={game.lobbyCosts} bill={bill} before={before} busy={busy}
        onLobby={lobby} onClose={() => { setPick(null); setBefore(null); }} /> : null}
      {card && !rolling ? (
        <Card key={card.id} pack={pack} event={card} kind={KIND[card.kind ?? "generic"] ?? "crisis"}
          holders={game.holders.map((h) => ({ id: h.id, name: h.name, stance: h.support / 100 }))}
          turn={card.turn} busy={busy} onStance={stance} onClose={() => setAnswered(null)} />
      ) : null}
      {warning && warnedHolder ? (
        <WarningCard key={`${warning.holder}@${warning.at}`} pack={pack} holder={{ name: warnedHolder.name, line: warnedHolder.line }} warning={warning}
          busy={busy} onHold={() => setHeld((xs) => [...xs, `${warning.holder}@${warning.at}`])}
          onClose={() => setHeld((xs) => [...xs, `${warning.holder}@${warning.at}`])} />
      ) : null}
      {notice.length ? <Announce key={game.term} pack={pack} keys={notice} onClose={() => setNotice([])} /> : null}
      <Tour step={step} onSkip={endTour} />
      <Wire game={game} onPick={(k, c) => { setPeek(k); setCause(c); }} />
      <button className="btn deskopen" aria-expanded={sheet} onClick={() => setSheet(!sheet)}>
        {sheet ? "Close the desk" : "Write an act"}
      </button>
    </main>
  );
}
