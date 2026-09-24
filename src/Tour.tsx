import { useEffect, useLayoutEffect, useRef, useState } from "react";

// State-driven coach marks: each step is unlocked by game state, never by a timer, so it cannot drift.
export type TourStep = { id: string; anchor: string; text: string; title: string };

const W = 280;
const GAP = 12;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export default function Tour({ step, onSkip }: { step: TourStep | null; onSkip: () => void }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  const [h, setH] = useState(132);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!step) return;
    setBox(null);
    // The anchor may mount a beat after the step changes (card swap), so poll briefly instead of measuring once.
    let tries = 0;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (el) {
        setBox(el.getBoundingClientRect());
        return true;
      }
      return false;
    };
    const iv = setInterval(() => {
      if (find() || ++tries > 20) clearInterval(iv);
    }, 150);
    window.addEventListener("resize", find);
    window.addEventListener("scroll", find, true);
    return () => {
      clearInterval(iv);
      window.removeEventListener("resize", find);
      window.removeEventListener("scroll", find, true);
    };
  }, [step]);
  // The text sets the height, so the side is chosen against the card that is actually on screen.
  useLayoutEffect(() => {
    if (card.current) setH(card.current.offsetHeight);
  }, [step, box]);
  if (!step || !box) return null;
  let left = clamp(box.left + box.width / 2 - W / 2, GAP, window.innerWidth - W - GAP);
  let top: number;
  if (box.bottom + GAP + h <= window.innerHeight - GAP) top = box.bottom + GAP;
  else if (box.top - GAP - h >= GAP) top = box.top - GAP - h;
  else {
    // Neither band holds it: sit beside the anchor rather than on top of it.
    top = clamp(box.top, GAP, window.innerHeight - h - GAP);
    if (box.right + GAP + W <= window.innerWidth - GAP) left = box.right + GAP;
    else if (box.left - GAP - W >= GAP) left = box.left - GAP - W;
  }
  return (
    <div
      key={step.id}
      ref={card}
      className="coach rise"
      style={{ left, top, width: W }}
      role="dialog"
      aria-label={step.title}
    >
      <div className="kicker">{step.title}</div>
      <p style={{ margin: "6px 0 10px" }}>{step.text}</p>
      <button className="link" onClick={onSkip}>
        Skip the tour
      </button>
    </div>
  );
}
