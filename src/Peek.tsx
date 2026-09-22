import type { GameView } from "./api";
import { hueClass, ledgerValue, roomTo, type LedgerKey } from "./rules";

export type PinItem = { key: string; title: string; hue: string; lines: [string, string][] };

const sign = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 10) / 10}`;

/**
 * Tier two of two: read-only, and an overlay under the strip so the page never moves.
 * Never a dialog, because a modal would break the one page rule (research §2).
 */
export default function Peek({ game, of, cause, onClose, onPin }: {
  game: GameView; of: LedgerKey; cause?: string; onClose: () => void; onPin: (item: PinItem) => void;
}) {
  const meta = game.pack.constitution?.ledgers?.[of];
  const rows = game.wire.filter((l) => l.kind === "ledger" && l.ledger === of);
  const line = meta?.line ?? 0;
  const value = ledgerValue(game, of);
  const name = meta?.name ?? of;
  const item: PinItem = {
    key: of, title: name, hue: hueClass(of),
    lines: rows.map((l) => [l.cause, sign(l.delta)] as [string, string]).concat([["Room to the line", String(Math.round(roomTo(value, line)))]]),
  };
  return (
    <div className={`peek ${hueClass(of)}`} role="group" aria-label={`${name}, this turn`}
      onPointerEnter={(e) => { (e.currentTarget as HTMLElement).dataset.stick = "1"; }}
      onPointerLeave={(e) => { delete (e.currentTarget as HTMLElement).dataset.stick; onClose(); }}>
      <div>
        <h3>{name}</h3>
        <ul className="flow">
          {rows.length ? rows.map((l, i) => (
            <li key={i}><span>{l.cause}</span><b className={`num ${l.delta < 0 ? "neg" : ""}`}>{sign(l.delta)}</b></li>
          )) : <li><span>Nothing moved it this turn.</span><b className="num">0</b></li>}
        </ul>
      </div>
      <div>
        <div className="kicker">Room to the failure line</div>
        <span className="big num">{Math.round(roomTo(value, line))}</span>
        <div className="small muted">Fails at <b className="num">{line}</b>{cause ? <><br /><b>{cause}</b></> : null}</div>
      </div>
      <div>
        <div className="kicker">Keep it in the rail</div>
        <div className="acts2">
          <button className="btn sm" onClick={() => onPin(item)}>Pin</button>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
