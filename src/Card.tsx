import { useEffect, useRef, type ReactNode } from "react";
import type { GamePack, ViewEvent } from "./api";
import { Meter } from "./Ledger";

function Poster({ label, children, block, onClose }: { label: string; children: ReactNode; block: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  // A card that is still open has to be answered, so Escape and a backdrop click do nothing until a stance is taken.
  return (
    <dialog ref={ref} className="poster" aria-label={label}
      onCancel={(e) => { if (block) e.preventDefault(); }}
      onClose={onClose}
      onClick={(e) => { if (!block && e.target === ref.current) onClose(); }}
    >{children}</dialog>
  );
}

type Props = {
  pack: GamePack; event: ViewEvent; blocs: Record<string, number>; turn: number; busy: boolean;
  onStance: (i: number) => void; onClose: () => void;
};

/** The crisis card: the poster, three stances, then what the five groups think of the answer. */
export default function Card({ pack, event, blocs, turn, busy, onStance, onClose }: Props) {
  const answered = event.stance !== undefined;
  const stances = event.card?.stances ?? event.stances;
  const title = event.card?.title ?? "The floor has news.";
  return (
    <Poster label={title} block={!answered} onClose={onClose}>
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
          <button className="btn" onClick={onClose}>Close the card</button>
        </>
      )}
    </Poster>
  );
}

/** Same poster for the escalations a new term brings, in the pack's own words. */
export function Announce({ pack, keys, onClose }: { pack: GamePack; keys: string[]; onClose: () => void }) {
  const items = keys.map((k) => pack.escalations.find((e) => e.key === k)).filter((e) => !!e);
  if (!items.length) return null;
  return (
    <Poster label={items[0]!.name} block={false} onClose={onClose}>
      <div className="kicker">{pack.title}</div>
      {items.map((e) => <div key={e!.key}><h2>{e!.name}</h2><p>{e!.headline}</p></div>)}
      <button className="btn" onClick={onClose}>Close the notice</button>
    </Poster>
  );
}
