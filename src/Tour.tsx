import { useEffect, useState } from "react";

// State-driven coach marks: each step is unlocked by game state, never by a timer, so it cannot drift.
export type TourStep = { id: string; anchor: string; text: string; title: string };
export const TOUR_BILL = "Give every public school teacher a $10,000 raise, paid for by closing the carried-interest loophole.";

export default function Tour({ step, onSkip }: { step: TourStep | null; onSkip: () => void }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!step) return;
    setBox(null);
    // The anchor may mount a beat after the step changes (card swap), so poll briefly instead of measuring once.
    let tries = 0;
    const find = () => { const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`); if (el) { setBox(el.getBoundingClientRect()); return true; } return false; };
    const iv = setInterval(() => { if (find() || ++tries > 20) clearInterval(iv); }, 150);
    window.addEventListener("resize", find); window.addEventListener("scroll", find, true);
    return () => { clearInterval(iv); window.removeEventListener("resize", find); window.removeEventListener("scroll", find, true); };
  }, [step]);
  if (!step || !box) return null;
  const W = 280;
  const left = Math.min(Math.max(12, box.left + box.width / 2 - W / 2), window.innerWidth - W - 12);
  const below = box.bottom + 12;
  const top = below + 120 > window.innerHeight ? Math.max(12, box.top - 132) : below;
  return (
    <div key={step.id} className="coach rise" style={{ left, top, width: W }} role="dialog" aria-label={step.title}>
      <div className="eyebrow">{step.title}</div>
      <p style={{ margin: "6px 0 10px" }}>{step.text}</p>
      <button className="small" style={{ textDecoration: "underline", color: "var(--paper-2)" }} onClick={onSkip}>Skip the tour</button>
    </div>
  );
}
