import { useEffect, useRef, type ReactNode } from "react";
import type { GamePack, ViewEvent } from "./api";
import { Meter } from "./Ledger";

/** The sheet keeps its exit on screen for one transition, then the caller unmounts it. */
const UNMOUNT = 200;

/**
 * A modal sheet: it shows on mount, and every way out of it goes through the dialog's own close,
 * so the browser hands focus back to the opener. The unmount is driven off the open attribute
 * rather than the `close` event, because the attribute is the one signal every path has to
 * produce, and the guard makes it fire once per sheet however it was closed.
 */
export function useSheet(onClose: () => void, block = false) {
  const ref = useRef<HTMLDialogElement>(null);
  const timer = useRef(0);
  // The close watcher answers a second Escape whatever `cancel` says, so a sheet that must be
  // answered is opened again rather than left mounted and hidden.
  const blocked = useRef(block);
  blocked.current = block;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const watch = new MutationObserver(() => {
      if (d.open || timer.current) return;
      if (blocked.current) { d.showModal(); return; }
      // A self-opened sheet can outlive its opener and leave <body> focused; a click during the exit
      // does the same, so the fallback to the primary action runs only when the window passed untouched.
      let touched = false;
      const touch = () => { touched = true; };
      document.addEventListener("pointerdown", touch, { capture: true, once: true });
      timer.current = setTimeout(() => {
        document.removeEventListener("pointerdown", touch, { capture: true });
        if (!touched && document.activeElement === document.body) document.querySelector<HTMLElement>("[data-primary]")?.focus();
        onClose();
      }, UNMOUNT) as unknown as number;
    });
    watch.observe(d, { attributeFilter: ["open"] });
    return () => { watch.disconnect(); clearTimeout(timer.current); };
  }, []); // eslint-disable-line
  return { ref, dismiss: () => ref.current?.close() };
}

function Poster({ label, children, block, onClose }: { label: string; children: (dismiss: () => void) => ReactNode; block: boolean; onClose: () => void }) {
  const { ref, dismiss } = useSheet(onClose, block);
  // A card that is still open has to be answered, so Escape and a backdrop click do nothing until a stance is taken.
  return (
    <dialog ref={ref} className="poster" aria-label={label}
      onCancel={(e) => { if (block) e.preventDefault(); }}
      onClick={(e) => { if (!block && e.target === ref.current) dismiss(); }}
    >{children(dismiss)}</dialog>
  );
}

export type CardKind = "crisis" | "foreign" | "swan" | "warning" | "escalation";

const KICKER: Record<CardKind, string> = {
  crisis: "A crisis", foreign: "A move abroad", swan: "Out of nowhere",
  warning: "A warning", escalation: "This term brings",
};

type Props = {
  pack: GamePack; event: ViewEvent; kind: CardKind; holders: { id: string; name: string; stance: number }[];
  turn: number; busy: boolean; onStance: (i: number) => void; onClose: () => void;
};

/** One poster, five kinds. A crisis, a move abroad and a black swan all have to be answered. */
export default function Card({ pack, event, kind, holders, turn, busy, onStance, onClose }: Props) {
  const answered = event.stance !== undefined;
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (answered) done.current?.focus(); }, [answered]);
  const stances = event.card?.stances ?? event.stances;
  const title = event.card?.title ?? "The floor has news.";
  return (
    <Poster label={title} block={!answered} onClose={onClose}>{(dismiss) => (<>
      <div className="kicker">{KICKER[kind]} · {pack.vocabulary.turn} {turn}</div>
      <h2>{title}</h2>
      {event.card ? <p>{event.card.body}</p> : null}
      {!answered ? (
        <div className="amend">
          {stances.map((s, i) => <button key={i} className="opt2" disabled={busy} onClick={() => onStance(i)}><b>{s}</b></button>)}
        </div>
      ) : (
        <>
          <div className="meters">
            {holders.map((h, i) => (
              <Meter key={h.id} k={h.name} value={Math.round(h.stance * 100)} suffix="%" fill={h.stance * 100} i={i} />
            ))}
          </div>
          <p className="lede">{event.outcome ?? stances[event.stance!]}</p>
          <button ref={done} className="btn" onClick={dismiss}>Close the card</button>
        </>
      )}
    </>)}</Poster>
  );
}

/** Same poster for the escalations a new term brings, in the pack's own words. */
export function Announce({ pack, keys, onClose }: { pack: GamePack; keys: string[]; onClose: () => void }) {
  const items = keys.map((k) => pack.escalations.find((e) => e.key === k)).filter((e) => !!e);
  if (!items.length) return null;
  return (
    <Poster label={items[0]!.name} block={false} onClose={onClose}>{(dismiss) => (<>
      <div className="kicker">{pack.title}</div>
      {items.map((e) => <div key={e!.key}><h2>{e!.name}</h2><p>{e!.headline}</p></div>)}
      <button className="btn" onClick={dismiss}>Close the notice</button>
    </>)}</Poster>
  );
}

/** R4: a holder over its line plays this with the number, and its response fires two turns later. */
export function WarningCard({ pack, holder, warning, busy, onHold, onClose }: {
  pack: GamePack; holder: { name: string; line: number }; warning: { response: string; fires: number; number: number };
  busy: boolean; onHold: () => void; onClose: () => void;
}) {
  const RESPONSE: Record<string, string> = {
    early_test: "call the test early", coup: "end your rule", strike: "strike your last decree",
    refuse_levy: "refuse the next levy", riot: "riot", excommunicate: "excommunicate you", embargo: "close the purse",
  };
  return (
    <Poster label={`${holder.name} warns you`} block={false} onClose={onClose}>{(dismiss) => (<>
      <div className="kicker">A warning · {pack.vocabulary.turn} {warning.fires}</div>
      <h2>{holder.name} is at {Math.round(warning.number)}.</h2>
      <p>Their line is {holder.line}. If they are still over it at {pack.vocabulary.turn} {warning.fires} they will {RESPONSE[warning.response] ?? "act"}.</p>
      <div className="amend">
        <button className="opt2" disabled={busy} onClick={onHold}><b>Hold</b><span className="small muted">Leave it and take the risk.</span></button>
        <button className="opt2" disabled={busy} onClick={dismiss}><b>Go and work on them</b><span className="small muted">Close this and spend the turn easing them.</span></button>
      </div>
    </>)}</Poster>
  );
}
