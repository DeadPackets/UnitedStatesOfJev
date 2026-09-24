import type { CSSProperties } from "react";
import type { GameView } from "./api";
import { Icon, type IconName } from "./icons";
import { Num } from "./Ledger";
import {
  LEDGER_KEYS,
  danger,
  hueClass,
  ledgerDelta,
  ledgerValue,
  roomTo,
  type LedgerKey,
} from "./rules";

// The strip bar needs a top for each ledger; the failure line is the only number that carries meaning.
const SCALE: Record<LedgerKey, number> = {
  treasury: 200,
  authority: 100,
  chest: 200,
  loyalty: 100,
  popularity: 100,
}; // TUNE

/** Five slots, fixed order, fixed hue: the only tier that may be read in one second (research §2). */
export default function Strip({
  game,
  open,
  onOpen,
}: {
  game: GameView;
  open: LedgerKey | null;
  onOpen: (k: LedgerKey | null) => void;
}) {
  const names = game.pack.constitution?.ledgers;
  return (
    <div className="strip" role="group" aria-label="The five ledgers">
      {LEDGER_KEYS.map((k) => {
        const value = ledgerValue(game, k);
        const line = names?.[k]?.line ?? 0;
        const delta = ledgerDelta(game, k);
        const hot = danger(value, line);
        const show = () => onOpen(k);
        return (
          <button
            key={k}
            className={`led ${hueClass(k)} ${hot ? "danger" : ""}`}
            aria-expanded={open === k}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") show();
            }}
            onFocus={show}
            onClick={() => onOpen(open === k ? null : k)}
          >
            <span className="ledk">
              <Icon name={k as IconName} />
              <span className="kicker">{names?.[k]?.name ?? k}</span>
            </span>
            <span className="top">
              <b className="v">
                <Num value={Math.round(value)} />
              </b>
              {delta ? (
                <span className="d num">
                  <i className="arrow" aria-hidden="true">
                    {delta > 0 ? "▲" : "▼"}
                  </i>
                  {Math.abs(Math.round(delta))}
                </span>
              ) : null}
            </span>
            <span className="track" aria-hidden="true">
              <i
                style={{ "--w": `${Math.min(100, (value / SCALE[k]) * 100)}%` } as CSSProperties}
              />
              <b
                className="fail"
                style={{ "--x": `${Math.min(100, (line / SCALE[k]) * 100)}%` } as CSSProperties}
              />
            </span>
            <span className="room num">
              {hot ? `Failed at ${line}` : `${Math.round(roomTo(value, line))} to the line`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
