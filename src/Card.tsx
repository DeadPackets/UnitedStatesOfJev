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
export function useSheet(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const timer = useRef(0);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const watch = new MutationObserver(() => {
      if (d.open || timer.current) return;
      timer.current = setTimeout(onClose, UNMOUNT) as unknown as number;
    });
    watch.observe(d, { attributeFilter: ["open"] });
    return () => { watch.disconnect(); clearTimeout(timer.current); };
  }, []); // eslint-disable-line
  return { ref, dismiss: () => ref.current?.close() };
}

function Poster({ label, children, block, onClose }: { label: string; children: (dismiss: () => void) => ReactNode; block: boolean; onClose: () => void }) {
  const { ref, dismiss } = useSheet(onClose);
  // A card that is still open has to be answered, so Escape and a backdrop click do nothing until a stance is taken.
  return (
    <dialog ref={ref} className="poster" aria-label={label}
      onCancel={(e) => { if (block) e.preventDefault(); }}
      onClick={(e) => { if (!block && e.target === ref.current) dismiss(); }}
    >{children(dismiss)}</dialog>
  );
}

type Props = {
  pack: GamePack; event: ViewEvent; blocs: Record<string, number>; turn: number; busy: boolean;
  onStance: (i: number) => void; onClose: () => void;
};

/** The crisis card: the poster, three stances, then what the five groups think of the answer. */
export default function Card({ pack, event, blocs, turn, busy, onStance, onClose }: Props) {
  const answered = event.stance !== undefined;
  // Answering removes the stance the player was standing on, so focus moves to the one action left.
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (answered) done.current?.focus(); }, [answered]);
  const stances = event.card?.stances ?? event.stances;
  const title = event.card?.title ?? "The floor has news.";
  return (
    <Poster label={title} block={!answered} onClose={onClose}>{(dismiss) => (<>
      <div className="kicker">{pack.vocabulary.turn} {turn}</div>
      <h2>{title}</h2>
      {event.card ? <p>{event.card.body}</p> : null}
      {!answered ? (
        <div className="amend">
          {stances.map((s, i) => (
            <button key={i} className="opt2" disabled={busy} onClick={() => onStance(i)}><b>{s}</b></button>
          ))}
        </div>
      ) : (
        <>
          <div className="meters">
            {pack.blocs.map((b, i) => (
              <Meter key={b.id} k={b.name} value={Math.round((blocs[b.id] ?? 0.5) * 100)} suffix="%" fill={(blocs[b.id] ?? 0.5) * 100} i={i} />
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
