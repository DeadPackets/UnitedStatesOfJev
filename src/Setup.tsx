import { useEffect, useState } from "react";
import { encodeCode, decodeCode, dailyCode, type Settings, type Party, type Mode } from "../worker/engine";

const PRESETS: Record<string, { seats: number; pop: -1 | 0 | 1 }> = { Honeymoon: { seats: 55, pop: 1 }, Divided: { seats: 50, pop: 0 }, "Lame duck": { seats: 45, pop: -1 } };
const THEMES = ["First 100 Days", "Green Century", "Law and Order", "Small Government", "Infrastructure Decade", "Healthcare for All", "Secure Borders", "Education First", "Innovation Nation", "Veterans and Defense"];

export default function Setup({ onStart, busy }: { onStart: (code: string) => void; busy: boolean }) {
  const [s, setS] = useState<Settings>(() => ({ ...decodeCode(dailyCode()), mode: "term", seats: 55, pop: 1, seed: (Math.random() * 2 ** 30) >>> 0 }));
  const [code, setCode] = useState(encodeCode(s));
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const set = (patch: Partial<Settings>) => setS((prev) => { const next = { ...prev, ...patch }; setCode(encodeCode(next)); setCodeErr(null); return next; });
  useEffect(() => { setCode(encodeCode(s)); }, []); // eslint-disable-line
  const onCode = (v: string) => { setCode(v); try { setS(decodeCode(v)); setCodeErr(null); } catch (e) { setCodeErr((e as Error).message); } };
  const preset = Object.entries(PRESETS).find(([, p]) => p.seats === s.seats && p.pop === s.pop)?.[0] ?? "Custom";

  return (
    <main className="setup">
      <div>
        <div className="eyebrow">United States of Jev</div>
        <h1>Congress <em>of Jev</em></h1>
        <p className="muted">You are the President. One hundred senators, each judged by Jev in a third of a second. Write bills, count votes, twist arms.</p>
      </div>
      <div className="field"><span className="eyebrow">Your party</span>
        <div className="seg">{(["D", "R"] as Party[]).map((p) => <button key={p} className={p.toLowerCase()} aria-pressed={s.party === p} onClick={() => set({ party: p })}>{p === "D" ? "Democrat" : "Republican"}</button>)}</div></div>
      <div className="field"><span className="eyebrow">Chamber</span>
        <div className="seg">{[...Object.keys(PRESETS), "Custom"].map((k) => <button key={k} aria-pressed={preset === k} onClick={() => k !== "Custom" && set(PRESETS[k])}>{k}</button>)}</div>
        <div className="small muted num">Your party holds <b>{s.seats}</b> of 100 seats. The President is {s.pop > 0 ? "popular" : s.pop < 0 ? "unpopular" : "evenly split"}.</div>
        <input type="range" min={40} max={60} value={s.seats} onChange={(e) => set({ seats: Number(e.target.value) })} aria-label="Seats" />
        <div className="seg">{([-1, 0, 1] as const).map((p) => <button key={p} aria-pressed={s.pop === p} onClick={() => set({ pop: p })}>{p < 0 ? "Unpopular" : p > 0 ? "Popular" : "Split"}</button>)}</div></div>
      <div className="field"><span className="eyebrow">Mode</span>
        <div className="seg">{(["term", "sandbox", "agenda"] as Mode[]).map((m) => <button key={m} aria-pressed={s.mode === m} onClick={() => set({ mode: m })}>{{ term: "Term · 40 bills", sandbox: "Sandbox", agenda: "Agenda · 10 bills" }[m]}</button>)}</div>
        {s.mode === "agenda" && <select value={s.agenda} onChange={(e) => set({ agenda: Number(e.target.value) })} className="code">{THEMES.map((t, i) => <option key={t} value={i}>{t}</option>)}</select>}</div>
      <div>
        <div className="toggle"><span>Lobbying <span className="muted small">spend capital to move one senator</span></span><button role="switch" aria-checked={s.lobby} className="switch" onClick={() => set({ lobby: !s.lobby })} /></div>
        <div className="toggle"><span>Amendments <span className="muted small">three rewrites, pick one</span></span><button role="switch" aria-checked={s.amend} className="switch" onClick={() => set({ amend: !s.amend })} /></div>
      </div>
      <div className="field"><span className="eyebrow">Share code</span>
        <input className="code" value={code} onChange={(e) => onCode(e.target.value)} spellCheck={false} aria-label="Share code" />
        {codeErr ? <span className="error">{codeErr}</span> : <span className="small muted">Same code, same Senate, same luck. Paste a friend's to replay their chamber. <button className="small" style={{ textDecoration: "underline" }} onClick={() => onCode(dailyCode())}>Today's daily</button></span>}
      </div>
      <div><button className="btn" disabled={busy || !!codeErr} onClick={() => onStart(code)}>{busy ? "Seating the Senate…" : "Take office"}</button></div>
    </main>
  );
}
