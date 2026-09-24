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
