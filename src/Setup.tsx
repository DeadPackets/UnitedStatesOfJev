import { useEffect, useMemo, useRef, useState } from "react";
import { encodeCode, decodeCode, dailyCode, seatParties, type Settings, type Mode } from "../worker/engine";
import { SeatPreview } from "./Hemicycle";

const THEMES = ["First 100 Days", "Green Century", "Law and Order", "Small Government", "Infrastructure Decade", "Healthcare for All", "Secure Borders", "Education First", "Innovation Nation", "Veterans and Defense"];
const MODES: Record<Mode, string> = { term: "Term · 40 bills", sandbox: "Sandbox · no end", agenda: "Agenda · 10 bills" };
const POPS = [[-1, "Unpopular"], [0, "Split"], [1, "Popular"]] as const;
const DIFF = (seats: number) => (seats >= 55 ? "a honeymoon" : seats <= 45 ? "a lame duck" : "a divided Senate");

/** The headline typesets itself from the rules, broadsheet style. */
function Typeset({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const ref = useRef(text);
  useEffect(() => {
    if (text === ref.current) return;
    const from = ref.current; ref.current = text;
    let common = 0; while (common < from.length && common < text.length && from[common] === text[common]) common++;
    let i = common; const t0 = performance.now();
    const step = (now: number) => { const target = common + Math.floor((now - t0) / 22); if (target > i) { i = Math.min(text.length, target); setShown(text.slice(0, i)); } if (i < text.length) requestAnimationFrame(step); };
    setShown(text.slice(0, common)); requestAnimationFrame(step);
  }, [text]);
  return <h2 className="head" aria-live="polite">{shown}{shown.length < text.length ? <span className="cursor" /> : null}</h2>;
}

export default function Setup({ onStart, busy }: { onStart: (code: string) => void; busy: boolean }) {
  const [s, setS] = useState<Settings>(() => ({ ...decodeCode(dailyCode()), mode: "term", seats: 55, pop: 1, seed: (Math.random() * 2 ** 30) >>> 0 }));
  const [code, setCode] = useState(() => encodeCode(s));
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [stamped, setStamped] = useState(false);
  const set = (patch: Partial<Settings>) => setS((prev) => { const next = { ...prev, ...patch }; setCode(encodeCode(next)); setCodeErr(null); return next; });
  const onCode = (v: string) => { setCode(v); try { setS(decodeCode(v)); setCodeErr(null); } catch (e) { setCodeErr((e as Error).message); } };
  const parties = useMemo(() => seatParties(s), [s.party, s.seats, s.seed]); // eslint-disable-line
  // one gesture: left of center is Democrat, right is Republican, distance is the margin
  const slider = s.party === "D" ? 100 - s.seats : s.seats;
  const onSlide = (v: number) => set({ party: v < 50 ? "D" : v > 50 ? "R" : s.party, seats: 50 + Math.abs(v - 50) });
  const partyName = s.party === "D" ? "Democrat" : "Republican";
  const headline = s.mode === "agenda" ? `${partyName} takes the oath. Agenda: ${THEMES[s.agenda]}.` : `${partyName} takes the oath. ${DIFF(s.seats)}, ${s.pop > 0 ? "popular" : s.pop < 0 ? "unpopular" : "the country split"}${s.mode === "sandbox" ? ", no end in sight" : ""}.`;
  const start = () => { setStamped(true); setTimeout(() => onStart(code), 650); };

  return (
    <main className="setup">
      <div className="mast rise"><b>Congress of Jev</b><span>You are the President</span></div>
      <div className="stagearea">
        <div className="bignum num rise" aria-label={`${s.seats} seats for your party, ${100 - s.seats} against`}><span className={`a ${s.seats >= 55 ? "red" : ""}`}>{s.seats}</span><span className="b">{100 - s.seats}</span></div>
        <SeatPreview parties={parties} party={s.party} ink={(s.pop + 1) / 2} />
        <div className={`stamp ${stamped ? "hit" : ""}`} aria-hidden="true">Sworn in</div>
      </div>
      <Typeset text={headline} />
      <div className="track rise" style={{ animationDelay: "120ms" }}>
        <input type="range" min={40} max={60} value={slider} onChange={(e) => onSlide(Number(e.target.value))} aria-label="Drag left for Democrat, right for Republican; distance sets your party's seats" aria-valuetext={`${partyName}, ${s.seats} seats`} />
        <div className="ends"><span className={s.party === "D" ? "on" : ""}>Democrat</span><span className="mid">drag toward your party · distance is the margin</span><span className={s.party === "R" ? "on" : ""}>Republican</span></div>
      </div>
      <div className="chips rise" role="group" aria-label="President's popularity" style={{ animationDelay: "200ms" }}>{POPS.map(([p, name]) => <button key={p} className="opt" aria-pressed={s.pop === p} onClick={() => set({ pop: p })}>{name}</button>)}</div>
      <div className="rise" style={{ display: "grid", justifyItems: "center", gap: 8, animationDelay: "280ms" }}>
        <button className={`btn ${busy ? "busy" : ""}`} disabled={busy || !!codeErr} onClick={start}>{busy ? "Seating the Senate" : "Take office"}</button>
      </div>
      <details className="more rise" style={{ animationDelay: "360ms" }}>
        <summary>More rules: mode, lobbying, amendments, share code</summary>
        <div className="field"><span className="kicker" id="l-mode">Mode</span>
          <div className="chips" role="group" aria-labelledby="l-mode" style={{ justifyContent: "start" }}>{(Object.keys(MODES) as Mode[]).map((m) => <button key={m} className="opt" aria-pressed={s.mode === m} onClick={() => set({ mode: m })}>{MODES[m]}</button>)}</div>
          {s.mode === "agenda" ? <select className="code" aria-label="Agenda" value={s.agenda} onChange={(e) => set({ agenda: Number(e.target.value) })}>{THEMES.map((t, i) => <option key={t} value={i}>{t}</option>)}</select> : null}</div>
        <div>
          <div className="toggle"><span>Lobbying <span className="small muted">spend capital to move one senator</span></span><button role="switch" aria-checked={s.lobby} aria-label="Lobbying" className="switch" onClick={() => set({ lobby: !s.lobby })} /></div>
          <div className="toggle"><span>Amendments <span className="small muted">three rewrites, pick one</span></span><button role="switch" aria-checked={s.amend} aria-label="Amendments" className="switch" onClick={() => set({ amend: !s.amend })} /></div>
        </div>
        <div className="field"><label className="kicker" htmlFor="code">Share code</label>
          <input id="code" className="code" value={code} onChange={(e) => onCode(e.target.value)} spellCheck={false} aria-invalid={!!codeErr} aria-describedby="code-help" />
          {codeErr ? <span id="code-help" className="error">{codeErr}</span> : <span id="code-help" className="small muted">Same code, same Senate, same luck. <button className="link" onClick={() => onCode(dailyCode())}>Use today's daily chamber</button></span>}
        </div>
      </details>
    </main>
  );
}
