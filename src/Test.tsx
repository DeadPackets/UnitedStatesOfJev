import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Chamber as ChamberFloor } from "./Hemicycle";
import { Num } from "./Ledger";
import { Ornament } from "./theme";
import { TileReveal } from "./Tiles";
import { sound } from "./sound";

type Props = { game: GameView; act: Act; busy: boolean; onDone: () => void };

/**
 * The alpha reveal. One item per beat on a rAF clock: regions by weight, seats by loyalty, or both.
 * The numeral counts the half being walked and carries the other half as its base.
 */
export default function Test({ game, act, busy, onDone }: Props) {
  const reduced = useReducedMotion();
  const pack = game.pack;
  const v = pack.vocabulary;
  const test = game.test;
  const called = useRef(false);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);
  const [tilesDone, setTilesDone] = useState(false);
  const [share, setShare] = useState(0);
  const key = `usoj:test:${game.id}`;
  const [replay] = useState(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } });
  const [skipped, setSkipped] = useState(false);

  const run = () => {
    called.current = true; setFailed(false);
    act(() => api.test(game)).then((ok) => { if (!ok) { called.current = false; setFailed(true); } });
  };
  useEffect(() => { if (!test && !called.current && game.stage === "test") run(); }, [test, game.stage]); // eslint-disable-line

  const walk = useMemo(() => ({
    regions: test && pack.test.reveal !== "seats" ? test.regions : [],
    seats: test && pack.test.reveal !== "regions" ? test.seats : [],
  }), [test, pack.test.reveal]);
  const n = walk.regions.length + walk.seats.length;
  // 40 s over the whole walk, clamped so a 6-region list is not a slideshow and a 200-seat floor still ticks.
  const beat = n ? Math.min(1200, Math.max(120, 40000 / n)) : 0;

  // the tiles own the region half and its clock; the seat walk starts where they stop
  const base = walk.regions.length;
  useEffect(() => {
    if (!n || done || (base > 0 && !tilesDone)) return;
    if (!walk.seats.length) { setDone(true); return; }
    if (reduced) { const t = setTimeout(() => { setShown(n); setDone(true); }, 2000); return () => clearTimeout(t); }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(n, base + Math.floor((now - t0) / beat) + 1);
      setShown(k);
      if (k < n) raf = requestAnimationFrame(tick); else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, beat, base, reduced, done, tilesDone]); // eslint-disable-line

  useEffect(() => { if (shown > 0 && !done) sound.play("tick", { pitch: shown }); }, [shown]); // eslint-disable-line
  useEffect(() => {
    if (!done || !test) return;
    sound.play(test.won ? "gavel" : "thud");
    try { localStorage.setItem(key, "1"); } catch {}
  }, [done]); // eslint-disable-line

  const names = useMemo(() => new Map(pack.regions.map((r) => [r.id, r.name])), [pack.regions]);
  const sShown = Math.max(0, shown - walk.regions.length);
  const votes = useMemo(() => Object.fromEntries(walk.seats.slice(0, sShown).map((s) => [s.id, s.yes])), [walk.seats, sShown]);

  if (!test) {
    return (
      <main className="over press">
        <div className="kicker">{pack.title}</div>
        <h1>{pack.test.name}</h1>
        <p className="muted">{failed ? "The count did not come back." : "Counting the answers."}</p>
        {failed ? <button className={`btn ${busy ? "busy" : ""}`} disabled={busy} onClick={run}>Ask again</button> : null}
      </main>
    );
  }

  const a = pack.chamber.alpha;
  const pub = walk.regions.length ? share : test.drawnPublic;
  const loy = walk.seats.length
    ? walk.seats.slice(0, sShown).filter((s) => s.yes).length / (test.seats.length || 1)
    : test.drawnLoyalty;
  const pct = (a * pub + (1 - a) * loy) * 100;
  const yes = walk.seats.slice(0, sShown).filter((s) => s.yes).length;

  return (
    <main className="chamber press" onPointerDown={sound.unlock}>
      <header className="topbar">
        <h1>{pack.title}</h1>
        <nav aria-label={pack.test.name}>
          <Ornament kind={pack.theme.ornament} />
          <span className="num" style={{ padding: "0 8px" }}>{shown} of {n}</span>
          {replay && !done ? <button className="link" onClick={() => { setSkipped(true); setShown(n); setDone(true); }}>Skip the count</button> : null}
        </nav>
      </header>

      <section className="stage" aria-label={pack.test.name}>
        <div className="kicker">{pack.test.name}</div>
        {/* the key remounts the numeral at the verdict: a rolling digit must not land on a stale frame */}
        <div className={`count ${done ? "bounce" : ""}`}>
          <Num key={`m${done}`} value={pct} decimals={1} instant={done} className={`n ${done && !test.won ? "fail" : ""}`} />
          <span className="muted">% of the mandate · 50% wins</span>
        </div>
        <div className="whipbar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Mandate">
          <div className={`fill ${done && !test.won ? "fail" : ""}`} style={{ width: `${Math.min(100, pct)}%` }} />
          <div className="tick" style={{ left: "50%" }}><span className="num">50</span></div>
        </div>
        {walk.regions.length ? (
          <TileReveal regions={walk.regions} names={names} skip={skipped} label="The count by weight" ms={40000 * walk.regions.length / (n || 1)}
            onProgress={(i, s) => { setShare(s); setShown((k) => Math.max(k, i)); }}
            onDone={() => setTilesDone(true)} />
        ) : null}
        {walk.seats.length ? (
          <ChamberFloor pack={pack} members={game.members} own={game.faction} coalition={game.coalition}
            votes={votes} onPick={() => {}} />
        ) : null}
        {done ? (
          // The pack writes win and lose as whole sentences, so the verdict is prose, not a stamp.
          <div className="verdict rise">
            <p className={`lede ${test.won ? "" : "fail"}`}>{test.won ? pack.test.win : pack.test.lose}</p>
            <button className="btn" onClick={onDone}>See the result</button>
          </div>
        ) : null}
      </section>

      <aside className="rail" aria-label={pack.test.name}>
        {walk.regions.length ? (
          <div className="panel">
            <div className="kicker">{v.approval}</div>
            <div className="meter">
              <div className="k">Weighted share</div>
              <div className="v"><Num key={`p${done}`} value={pub * 100} decimals={1} instant={done} />%</div>
              <div className="bar"><i style={{ width: `${Math.min(100, pub * 100)}%` }} /></div>
            </div>
          </div>
        ) : null}
        {walk.seats.length ? (
          <div className="panel">
            <div className="kicker">{v.chamber}</div>
            <div className="meter">
              <div className="k">Declared for</div>
              <div className="v"><Num key={`y${done}`} value={yes} instant={done} /> of <span className="num">{test.seats.length}</span></div>
              <div className="bar"><i style={{ width: `${(yes / (test.seats.length || 1)) * 100}%` }} /></div>
            </div>
          </div>
        ) : null}
      </aside>

      <div className="sr" role="status" aria-live="polite">
        {done ? `${Math.round(pct)} percent. ${test.won ? pack.test.win : pack.test.lose}` : ""}
      </div>
    </main>
  );
}
