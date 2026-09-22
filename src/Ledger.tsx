import { useLayoutEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import type { GamePack, GameView } from "./api";

/** Rolling digits. `shown` is what is on screen, so a tick interrupted mid-flight resumes from there. */
export function Num({ value, decimals = 0, className, instant = false }: { value: number; decimals?: number; className?: string; instant?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduced = useReducedMotion();
  // Layout, not passive: React commits `value` into this span, so the roll must be the last
  // writer before the paint or a target arriving mid-roll is the digit the frame shows.
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const write = (v: number) => { shown.current = v; el.textContent = v.toFixed(decimals); };
    if (reduced || instant || Math.abs(shown.current - value) < 0.05) { write(value); return; }
    const c = animate(shown.current, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1], onUpdate: write, onComplete: () => write(value) });
    return () => c.stop();
  }, [value, decimals, reduced, instant]);
  return <span ref={ref} className={`num ${className ?? ""}`}>{value.toFixed(decimals)}</span>;
}

const clamp = (x: number) => Math.min(100, Math.max(0, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** The one national number: region approval weighted by region weight, the same sum the test's public half uses. */
export function national(pack: GamePack, approval: Record<string, number>): number {
  let w = 0, sum = 0;
  for (const r of pack.regions) { w += r.weight; sum += r.weight * (approval[r.id] ?? 50); }
  return w ? sum / w : 50;
}

type MeterProps = { k: string; value: number; decimals?: number; suffix?: string; fill: number; i: number };

/** One meter: label, rolling number, bar. The bar's transition delay staggers the row by 100 ms. */
export function Meter({ k, value, decimals = 0, suffix = "", fill, i }: MeterProps) {
  return (
    <div className="meter rise" style={{ animationDelay: `${i * 100}ms` }}>
      <div className="k">{k}</div>
      <div className="v"><Num value={value} decimals={decimals} />{suffix}</div>
      <div className="bar" role="meter" aria-label={k} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamp(fill))}>
        <i style={{ width: `${clamp(fill)}%`, transitionDelay: `${i * 100}ms` }} />
      </div>
    </div>
  );
}

/** Five meters, three pledge stamps, the streak. Every label and number comes from the pack and the view. */
export default function Ledger({ game }: { game: GameView }) {
  const v = game.pack.vocabulary;
  const own = game.pack.factions.find((f) => f.id === game.faction);
  const L = game.ledgers;
  const approval = national(game.pack, L.approval);
  const pledges = Object.values(game.promises);
  const progress = (pledges.reduce((a, p) => a + Math.min(p.passed, 2), 0) / Math.max(1, pledges.length * 2)) * 100;
  const patron = mean(Object.values(game.patrons));
  const meters: MeterProps[] = [
    { k: v.approval, value: Math.round(approval), suffix: "%", fill: approval, i: 0 },
    { k: v.capital, value: L.capital, fill: L.capital / 2, i: 1 },
    { k: v.promise, value: Math.round(progress), suffix: "%", fill: progress, i: 2 },
    { k: v.patron, value: patron, decimals: 1, fill: ((patron + 2) / 4) * 100, i: 3 },
    { k: `${own?.short ?? "Party"} mood`, value: L.party, fill: L.party, i: 4 },
  ];
  return (
    <div className="meters panel" aria-label="The ledger">
      {meters.map((m) => <Meter key={m.k} {...m} />)}
      <div className="pledges">
        {pledges.map((p) => (
          <span key={p.label} className={`stampsm tiny ${p.state === "kept" ? "pass" : p.state === "broken" ? "fail" : "wait"}`}>{p.label}</span>
        ))}
      </div>
      <div className="small muted">
        Streak <span className="num">{game.streak}</span>
        {game.bestStreak > game.streak ? <> · best <span className="num">{game.bestStreak}</span></> : null}
      </div>
    </div>
  );
}
