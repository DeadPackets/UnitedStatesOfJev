import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** `false` on the first render, not `null`: every call site treated `null` as falsy already. */
export function useReduced(): boolean {
  const [on, setOn] = useState(() => (typeof matchMedia === "function" ? matchMedia(QUERY).matches : false));
  useEffect(() => {
    const m = matchMedia(QUERY);
    const read = () => setOn(m.matches);
    m.addEventListener("change", read);
    return () => m.removeEventListener("change", read);
  }, []);
  return on;
}

/** cubic-bezier(0.22, 1, 0.36, 1), sampled by bisection on x; `--ease-out` in the stylesheet. */
export function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const bez = (a: number, b: number, u: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 24; i++) { u = (lo + hi) / 2; if (bez(0.22, 0.36, u) < t) lo = u; else hi = u; }
  return bez(1, 1, u);
}

/** Returns the stopper. It cancels the frame and leaves whatever was last painted on screen. */
export function tween(from: number, to: number, ms: number, onUpdate: (v: number) => void, onDone?: () => void) {
  let raf = 0;
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    onUpdate(from + (to - from) * ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
    else onDone?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
