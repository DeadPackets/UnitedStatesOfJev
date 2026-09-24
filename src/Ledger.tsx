import { useLayoutEffect, useRef } from "react";
import { tween, useReduced } from "./motion";
import type { GamePack } from "./api";

/** Rolling digits. `shown` is what is on screen, so a tick interrupted mid-flight resumes from there. */
export function Num({
  value,
  decimals = 0,
  className,
  instant = false,
}: {
  value: number;
  decimals?: number;
  className?: string;
  instant?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduced = useReduced();
  // Layout, not passive: React commits `value` into this span, so the roll must be the last
  // writer before the paint or a target arriving mid-roll is the digit the frame shows.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (v: number) => {
      shown.current = v;
      el.textContent = v.toFixed(decimals);
    };
    if (reduced || instant || Math.abs(shown.current - value) < 0.05) {
      write(value);
      return;
    }
    return tween(shown.current, value, 600, write, () => write(value));
  }, [value, decimals, reduced, instant]);
  return (
    <span ref={ref} className={`num ${className ?? ""}`}>
      {value.toFixed(decimals)}
    </span>
  );
}

const clamp = (x: number) => Math.min(100, Math.max(0, x));

/** The one national number: region approval weighted by region weight, the same sum the test's public half uses. */
export function national(pack: GamePack, approval: Record<string, number>): number {
  let w = 0,
    sum = 0;
  for (const r of pack.regions) {
    w += r.weight;
    sum += r.weight * (approval[r.id] ?? 50);
  }
  return w ? sum / w : 50;
}

type MeterProps = {
  k: string;
  value: number;
  decimals?: number;
  suffix?: string;
  fill: number;
  i: number;
};

/** One meter: label, rolling number, bar. The bar's transition delay staggers the row by 100 ms. */
export function Meter({ k, value, decimals = 0, suffix = "", fill, i }: MeterProps) {
  return (
    <div className="meter rise" style={{ animationDelay: `${i * 100}ms` }}>
      <div className="k">{k}</div>
      <div className="v">
        <Num value={value} decimals={decimals} />
        {suffix}
      </div>
      <div
        className="bar"
        role="meter"
        aria-label={k}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamp(fill))}
      >
        <i style={{ width: `${clamp(fill)}%`, transitionDelay: `${i * 100}ms` }} />
      </div>
    </div>
  );
}
