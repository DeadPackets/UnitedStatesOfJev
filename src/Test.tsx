import { useEffect, useMemo, useRef, useState } from "react";
import { useReduced } from "./motion";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Chamber as ChamberFloor } from "./Hemicycle";
import { Num } from "./Ledger";
import { Ornament } from "./theme";
import { TileReveal } from "./Tiles";
import { sound } from "./sound";

type Props = { game: GameView; act: Act; busy: boolean; onDone: () => void };

// The reveal walks the room one holder per beat, in pack order, against the term's bar.
export default function Test({ game, act, busy, onDone }: Props) {
  const reduced = useReduced();
  const pack = game.pack;
  const test = game.test;
  const called = useRef(false);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);
  const key = `usoj:test:${game.id}:${game.terms.length}`;
  const [replay] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const [skipped, setSkipped] = useState(false);

  const run = () => {
    called.current = true;
    setFailed(false);
    act(() => api.test(game)).then((ok) => {
      if (!ok) {
        called.current = false;
        setFailed(true);
      }
    });
  };
  useEffect(() => {
    if (!test && !called.current && game.stage === "test") run();
  }, [test, game.stage]); // eslint-disable-line

  const rows = test?.holders ?? [];
  const n = rows.length;
  // 40 s over the whole room, and no faster than one holder can be read
  const beat = n ? Math.min(2400, Math.max(700, 40000 / n)) : 0;
  const REGION_MS = 14000; // TUNE, the country's own clock inside the walk
  const mandate = rows.slice(0, shown).reduce((a, r) => a + (r.weight * r.support) / 100, 0);

  useEffect(() => {
    if (!n || done) return;
    if (reduced) {
      const t = setTimeout(() => {
        setShown(n);
        setDone(true);
      }, 2000);
      return () => clearTimeout(t);
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(n, Math.floor((now - t0) / beat) + 1);
      setShown(k);
      if (k < n) raf = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, beat, reduced, done]); // eslint-disable-line

  useEffect(() => {
    if (shown > 0 && !done) sound.play("tick", { pitch: shown });
  }, [shown]); // eslint-disable-line
  useEffect(() => {
    if (!done || !test) return;
    sound.play(test.won ? "gavel" : "thud");
    try {
      localStorage.setItem(key, "1");
    } catch {}
  }, [done]); // eslint-disable-line

  const names = useMemo(() => new Map(pack.regions.map((r) => [r.id, r.name])), [pack.regions]);

  if (!test) {
    return (
      <main className="over press">
        <div className="kicker">{pack.title}</div>
        <h1>{pack.test.name}</h1>
        <p className="muted">{failed ? "The count did not come back." : "Counting the answers."}</p>
        {failed ? (
          <button className={`btn ${busy ? "busy" : ""}`} disabled={busy} onClick={run}>
            Ask again
          </button>
        ) : null}
      </main>
    );
  }

  return (
    <main className="chamber press" onPointerDown={sound.unlock}>
      <header className="topbar">
        <h1>{pack.title}</h1>
        <nav aria-label={pack.test.name}>
          <Ornament kind={pack.theme.ornament} />
          <span className="num" style={{ padding: "0 8px" }}>
            {shown} of {n}
          </span>
          {replay && !done ? (
            <button
              className="link"
              onClick={() => {
                setSkipped(true);
                setShown(n);
                setDone(true);
              }}
            >
              Skip the count
            </button>
          ) : null}
        </nav>
      </header>

      <section className="stage" aria-label={pack.test.name}>
        <div className="kicker">{pack.test.name}</div>
        {/* the key remounts the numeral at the verdict: a rolling digit must not land on a stale frame */}
        <div className={`count ${done ? "bounce" : ""}`}>
          <Num
            key={`m${done}`}
            value={mandate * 100}
            decimals={1}
            instant={done}
            className={`n ${done && !test.won ? "fail" : ""}`}
          />
          <span className="muted num">
            of {(test.bar * 100).toFixed(0)} needed{test.early ? ", called early" : ""}
          </span>
        </div>
        <div
          className="whipbar"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(mandate * 100)}
          aria-label={pack.test.name}
        >
          <div
            className={`fill ${done && !test.won ? "fail" : ""}`}
            style={{ width: `${Math.min(100, mandate * 100)}%` }}
          />
          <div className="tick" style={{ left: `${test.bar * 100}%` }}>
            <span className="num">{(test.bar * 100).toFixed(0)}</span>
          </div>
        </div>
        {test.regions.length ? (
          <TileReveal
            regions={test.regions}
            names={names}
            skip={skipped}
            label="The country, region by region"
            ms={REGION_MS}
            onProgress={() => {}}
            onDone={() => {}}
          />
        ) : null}
        {test.seats.length && done ? (
          <ChamberFloor
            pack={pack}
            members={game.members}
            own={game.faction}
            coalition={game.coalition}
            votes={Object.fromEntries(test.seats.map((s) => [s.id, s.yes]))}
          />
        ) : null}
        {done ? (
          // The pack writes win and lose as whole sentences, so the verdict is prose, not a stamp.
          <div className="verdict rise">
            <p className={`lede ${test.won ? "" : "fail"}`}>
              {test.won ? pack.test.win : pack.test.lose}
            </p>
            <button className="btn" onClick={onDone}>
              See the result
            </button>
          </div>
        ) : null}
      </section>

      <aside className="rail" aria-label={pack.test.name}>
        <ul className="causes" aria-label="The room, holder by holder">
          {rows.map((r, i) => (
            <li key={r.id} className={i < shown ? "rise" : "wait"}>
              <b className="num">{i < shown ? (r.weight * r.support).toFixed(1) : "·"}</b>
              <span>
                {r.name}, {r.counted ? `${r.weight.toFixed(2)} of the room` : "not counted"}
                {i < shown ? `, at ${Math.round(r.support)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      <div className="sr" role="status" aria-live="polite">
        {done
          ? `${(mandate * 100).toFixed(1)} of ${(test.bar * 100).toFixed(0)}. ${test.won ? pack.test.win : pack.test.lose}`
          : ""}
      </div>
    </main>
  );
}
