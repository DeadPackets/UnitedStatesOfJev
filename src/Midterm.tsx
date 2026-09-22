import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { api, type GameView, type ViewMember } from "./api";
import type { Act } from "./App";
import { Chamber as ChamberFloor } from "./Hemicycle";
import { Ornament } from "./theme";
import { sound } from "./sound";

type Props = { game: GameView; act: Act; busy: boolean; onDone: () => void };

// The floor gathers itself in only while the count runs: an empty whip keeps that animation off the headline.
const NO_WHIP: Record<string, number> = {};

/**
 * Midterm night. The class up for election pulses while the count runs, then declares one seat per
 * beat: a held seat is marked, a lost one swaps its coin to the member who won it.
 */
export default function Midterm({ game, act, busy, onDone }: Props) {
  const pack = game.pack;
  const v = pack.vocabulary;
  const reduced = useReducedMotion();
  const result = game.midterm;
  const called = useRef(false);
  // the floor as the night began: a seat past the clock still shows who held it
  const before = useRef<ViewMember[]>(game.members);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);
  const key = `usoj:midterm:${game.id}:${game.term}`;
  const [replay] = useState(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } });

  const run = () => {
    called.current = true; setFailed(false);
    act(() => api.midterm(game)).then((ok) => { if (!ok) { called.current = false; setFailed(true); } });
  };
  useEffect(() => { if (!result && !called.current && game.stage === "midterm") run(); }, [result, game.stage]); // eslint-disable-line

  const walk = useMemo(() => (result?.up ?? []).map((seat) => ({
    seat, kept: !result!.lost.some((l) => l.seat === seat),
  })), [result]);
  const n = walk.length;
  // 40 s over the whole class, and no faster than the room can read one seat at a time
  const beat = n ? Math.min(700, 40000 / n) : 0;

  useEffect(() => {
    if (!n || done) return;
    if (reduced) { const t = setTimeout(() => { setShown(n); setDone(true); }, 2000); return () => clearTimeout(t); }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(n, Math.floor((now - t0) / beat) + 1);
      setShown(k);
      if (k < n) raf = requestAnimationFrame(tick); else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, beat, reduced, done]); // eslint-disable-line

  useEffect(() => {
    if (!shown || done) return;
    sound.play(walk[shown - 1]?.kept ? "tick" : "slide", { pitch: shown });
  }, [shown]); // eslint-disable-line
  useEffect(() => {
    if (!done || !result) return;
    sound.play(result.lost.length ? "thud" : "gavel");
    try { localStorage.setItem(key, "1"); } catch {}
  }, [done]); // eslint-disable-line

  const swapped = new Set(walk.slice(0, shown).filter((w) => !w.kept).map((w) => w.seat));
  const members = game.members.map((m) => (swapped.has(m.seat) ? m : before.current.find((b) => b.seat === m.seat) ?? m));
  const bySeat = new Map(members.map((m) => [m.seat, m]));
  // A held seat is marked like a yes; a lost one needs its coin, so the swap itself is the declaration.
  const votes: Record<string, boolean> = {};
  for (const w of walk.slice(0, shown)) { const m = bySeat.get(w.seat); if (m && w.kept) votes[m.id] = true; }
  const seatIds = (seats: string[]) => seats.map((s) => bySeat.get(s)?.id ?? "");
  const hot = !result ? seatIds(game.marks.midterm ?? [])
    : done ? seatIds([...swapped])
    : seatIds([walk[Math.max(0, shown - 1)]?.seat ?? ""]);

  const size = pack.chamber.size;
  const need = pack.chamber.threshold;
  const mine = members.filter((m) => m.faction === game.faction || game.coalition.includes(m.faction)).length;
  const lost = result?.lost.length ?? 0;

  return (
    <main className="chamber press midtermnight" onPointerDown={sound.unlock}>
      <header className="topbar">
        <h1>{pack.title}</h1>
        <nav aria-label={v.midterm}>
          <Ornament kind={pack.theme.ornament} />
          <span className="num" style={{ padding: "0 8px" }}>{shown} of {n || (game.marks.midterm ?? []).length}</span>
          {replay && result && !done ? <button className="link" onClick={() => { setShown(n); setDone(true); }}>Skip the count</button> : null}
        </nav>
      </header>

      <section className="stage" aria-label={v.chamber}>
        <div className="kicker">Government seats</div>
        <ChamberFloor pack={pack} members={members} own={game.faction} coalition={game.coalition}
          whip={done ? NO_WHIP : undefined} votes={result && !done ? votes : undefined} hot={hot} onPick={() => {}} />
        <div className="whipbar" role="meter" aria-valuemin={0} aria-valuemax={size} aria-valuenow={mine} aria-label="Government seats">
          <div className={`fill ${done && mine < need ? "fail" : ""}`} style={{ width: `${(mine / size) * 100}%` }} />
          <div className="tick" style={{ left: `${(need / size) * 100}%` }}><span className="num">{need}</span></div>
        </div>
        <p className="num">{mine} of {size}</p>
      </section>

      <aside className="rail" aria-label={v.midterm}>
        {!result ? (
          <div className="panel">
            <div className="kicker">{v.midterm}</div>
            <p className="lede">{failed ? "The count did not come back." : "A third of the seats are up."}</p>
            {failed ? <button className={`btn ${busy ? "busy" : ""}`} disabled={busy} onClick={run}>Count the vote</button> : null}
          </div>
        ) : (
          <div className="panel">
            <div className="kicker">{v.midterm}</div>
            <p className="lede">{n} up, {lost} changed hands</p>
            {done ? (
              <div className="verdict rise">
                {result.headline ? <><h2>{result.headline.title}</h2><p className="muted">{result.headline.lede}</p></> : null}
                {result.wipeout ? <p className="lede fail">The class is gone. The rest of the term is borrowed time.</p> : null}
                <button className="btn" onClick={onDone}>{result.wipeout ? "See the ending" : "Back to the floor"}</button>
              </div>
            ) : null}
          </div>
        )}
      </aside>

      <div className="sr" role="status" aria-live="polite">
        {done && result ? `${n} seats up, ${lost} changed hands. ${result.headline?.title ?? ""}` : ""}
      </div>
    </main>
  );
}
