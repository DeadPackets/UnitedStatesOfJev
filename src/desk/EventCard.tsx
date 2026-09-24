// A card on the desk (not in the mock): the glance file's shell with the card's text and its answers as buttons.
// It holds End turn until it is answered or declined (R33); a relief card cannot be declined.
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { ViewEvent } from "../api";
import { Icon } from "./Icon";
import { atStage } from "./paint";

const KIND: Record<string, { icon: string; word: string }> = {
  crisis: { icon: "i-alert", word: "A crisis" },
  relief: { icon: "i-hand", word: "Relief" },
  foreign: { icon: "i-globe", word: "From abroad" },
  swan: { icon: "i-bolt", word: "Out of nowhere" },
};

type Props = {
  event: ViewEvent;
  turnWord: string;
  busy: boolean;
  onAnswer: (stance: number, from: HTMLElement) => void;
  onDecline: (from: HTMLElement) => void;
};

export function EventCard({ event, turnWord, busy, onAnswer, onDecline }: Props) {
  const card = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    atStage(card.current!);
    card.current!.querySelector<HTMLElement>("[data-stance]")?.focus({ preventScroll: true });
  }, []);
  const kind = KIND[event.kind ?? "crisis"] ?? KIND.crisis;
  const stances = event.card?.stances ?? event.stances;
  return (
    <>
      <div className="scrim" />
      <article
        ref={card}
        className="fcard ev"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ev-t"
        style={{ "--gl": "var(--accent)", "--gd": "var(--accent)" } as CSSProperties}
      >
        <header className="fc-h">
          <span className="fc-i">
            <Icon id={kind.icon} />
          </span>
          <div className="fc-hd">
            <p className="fc-k">
              {kind.word} · {turnWord[0].toUpperCase() + turnWord.slice(1)} {event.turn}
            </p>
            <h2 id="ev-t">{event.card?.title ?? "A card on the desk"}</h2>
          </div>
          <span />
        </header>
        <div className="fc-b">
          {event.card?.body ? <p className="ev-b">{event.card.body}</p> : null}
          <div className="ev-s">
            {stances.map((stance, i) => (
              <button
                key={i}
                className="btn"
                data-stance={i}
                disabled={busy}
                onClick={(e) => onAnswer(i, e.currentTarget)}
              >
                {stance}
              </button>
            ))}
          </div>
          {event.kind !== "relief" ? (
            <button
              className="btn ev-no"
              disabled={busy}
              onClick={(e) => onDecline(e.currentTarget)}
            >
              Decline it
            </button>
          ) : null}
        </div>
      </article>
    </>
  );
}
