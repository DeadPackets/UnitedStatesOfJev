import { useMemo, useState } from "react";
import { encodeCode, decodeCode, dailyCode, seatParties, type Settings, type Party, type Mode } from "../worker/engine";
import { SeatPreview } from "./Hemicycle";

const PRESETS: Record<string, { seats: number; pop: -1 | 0 | 1 }> = { Honeymoon: { seats: 55, pop: 1 }, Divided: { seats: 50, pop: 0 }, "Lame duck": { seats: 45, pop: -1 } };
const THEMES = ["First 100 Days", "Green Century", "Law and Order", "Small Government", "Infrastructure Decade", "Healthcare for All", "Secure Borders", "Education First", "Innovation Nation", "Veterans and Defense"];
const MODES: Record<Mode, string> = { term: "Term · 40 bills", sandbox: "Sandbox", agenda: "Agenda · 10 bills" };
const POPS = [[-1, "Unpopular"], [0, "Split"], [1, "Popular"]] as const;

export default function Setup({ onStart, busy }: { onStart: (code: string) => void; busy: boolean }) {
  const [s, setS] = useState<Settings>(() => ({ ...decodeCode(dailyCode()), mode: "term", seats: 55, pop: 1, seed: (Math.random() * 2 ** 30) >>> 0 }));
  const [code, setCode] = useState(() => encodeCode(s));
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const set = (patch: Partial<Settings>) => setS((prev) => { const next = { ...prev, ...patch }; setCode(encodeCode(next)); setCodeErr(null); return next; });
  const onCode = (v: string) => { setCode(v); try { setS(decodeCode(v)); setCodeErr(null); } catch (e) { setCodeErr((e as Error).message); } };
  const preset = Object.entries(PRESETS).find(([, p]) => p.seats === s.seats && p.pop === s.pop)?.[0] ?? "Custom";
  const parties = useMemo(() => seatParties(s), [s.party, s.seats, s.seed]); // eslint-disable-line
  const other: Party = s.party === "D" ? "R" : "D";

  return (
    <main className="setup">
      <div className="form stagger">
        <div className="hero" style={{ "--i": 0 } as any}>
          <h1>Congress <span>of Jev</span></h1>
          <p>You are the President. One hundred senators, each judged by Jev in a third of a second. Write bills, count votes, twist arms.</p>
        </div>
        <div className="field" style={{ "--i": 1 } as any}><span className="kicker" id="l-party">Your party</span>
          <div className="seg" role="group" aria-labelledby="l-party">{(["D", "R"] as Party[]).map((p) => <button key={p} aria-pressed={s.party === p} onClick={() => set({ party: p })}>{p === "D" ? "Democrat" : "Republican"}</button>)}</div></div>
        <div className="field" style={{ "--i": 2 } as any}><span className="kicker" id="l-chamber">Chamber</span>
          <div className="seg" role="group" aria-labelledby="l-chamber">{[...Object.keys(PRESETS), "Custom"].map((k) => <button key={k} aria-pressed={preset === k} onClick={() => k !== "Custom" && set(PRESETS[k])}>{k}</button>)}</div>
          <label className="small muted num" htmlFor="seats">Your party holds <b style={{ color: "var(--ink)" }}>{s.seats}</b> of 100 seats.</label>
          <input id="seats" type="range" min={40} max={60} value={s.seats} onChange={(e) => set({ seats: Number(e.target.value) })} />
          <div className="seg" role="group" aria-label="President's popularity">{POPS.map(([p, name]) => <button key={p} aria-pressed={s.pop === p} onClick={() => set({ pop: p })}>{name}</button>)}</div></div>
        <div className="field" style={{ "--i": 3 } as any}><span className="kicker" id="l-mode">Mode</span>
          <div className="seg" role="group" aria-labelledby="l-mode">{(Object.keys(MODES) as Mode[]).map((m) => <button key={m} aria-pressed={s.mode === m} onClick={() => set({ mode: m })}>{MODES[m]}</button>)}</div>
          {s.mode === "agenda" ? <select className="code" aria-label="Agenda" value={s.agenda} onChange={(e) => set({ agenda: Number(e.target.value) })}>{THEMES.map((t, i) => <option key={t} value={i}>{t}</option>)}</select> : null}</div>
        <div style={{ "--i": 4 } as any}>
          <div className="toggle"><span>Lobbying <span className="hint">spend capital to move one senator</span></span><button role="switch" aria-checked={s.lobby} aria-label="Lobbying" className="switch" onClick={() => set({ lobby: !s.lobby })} /></div>
          <div className="toggle"><span>Amendments <span className="hint">three rewrites, pick one</span></span><button role="switch" aria-checked={s.amend} aria-label="Amendments" className="switch" onClick={() => set({ amend: !s.amend })} /></div>
        </div>
        <div className="field" style={{ "--i": 5 } as any}><label className="kicker" htmlFor="code">Share code</label>
          <input id="code" className="code" value={code} onChange={(e) => onCode(e.target.value)} spellCheck={false} aria-invalid={!!codeErr} aria-describedby="code-help" />
          {codeErr ? <span id="code-help" className="error">{codeErr}</span> : <span id="code-help" className="small muted">Same code, same Senate, same luck. Paste a friend's to replay their chamber. <button className="link" onClick={() => onCode(dailyCode())}>Use today's daily chamber</button></span>}
        </div>
        <div style={{ "--i": 6 } as any}><button className={`btn hot ${busy ? "busy" : ""}`} disabled={busy || !!codeErr} onClick={() => onStart(code)}>{busy ? "Seating the Senate" : "Take office"}</button></div>
      </div>
      <aside className="preview rise" aria-live="polite">
        <SeatPreview parties={parties} party={s.party} />
        <div className="split num"><span className={s.party.toLowerCase()}>{s.seats}</span><span className={other.toLowerCase()}>{100 - s.seats}</span></div>
        <p className="small muted" style={{ margin: 0 }}>Seats fill by state lean. Push past 55 and your party starts winning in the other side's states.</p>
      </aside>
    </main>
  );
}
