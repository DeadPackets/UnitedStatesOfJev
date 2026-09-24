import { useMemo } from "react";
import type { GameView } from "./api";
import { Icon, type IconName } from "./icons";
import { wireHue, wireLabel, type LedgerKey } from "./rules";
import { useReduced } from "./motion";

const sign = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 10) / 10}`;
const GLYPH: Record<string, IconName> = {
  ledger: "act",
  support: "seat",
  promise: "act",
  card: "crisis",
};

/** One line per move with its cause, in its hue, and a ledger line is clickable to peek (spec §9). */
export default function Wire({
  game,
  onPick,
}: {
  game: GameView;
  onPick: (k: LedgerKey, cause: string) => void;
}) {
  const reduced = useReduced();
  // one map for both id kinds: a ledger line's id is a region, a support line's is a holder
  const names = useMemo(
    () =>
      new Map([
        ...game.pack.regions.map((r) => [r.id, r.name] as [string, string]),
        ...game.holders.map((h) => [h.id, h.name] as [string, string]),
      ]),
    [game.pack.regions, game.holders],
  );
  const lines = game.wire;
  const runs = reduced || lines.length < 4 ? [lines] : [lines, lines];
  return (
    <div className="wire">
      <span className="lbl">
        <Icon name="wire" sm /> Wire
      </span>
      <div className="runwrap">
        <div className={`run ${reduced || lines.length < 4 ? "still" : ""}`}>
          {runs.flatMap((set, r) =>
            set.map((l, i) => {
              const icon =
                l.kind === "ledger" && l.ledger ? (l.ledger as IconName) : (GLYPH[l.kind] ?? "act");
              const body = (
                <>
                  <Icon name={icon} sm />
                  <b className="num">{sign(l.delta)}</b>
                  <span>{wireLabel(l, names)}</span>
                </>
              );
              return l.kind === "ledger" && l.ledger ? (
                <button
                  key={`${r}-${i}`}
                  className={`w ${wireHue(l)}`}
                  tabIndex={r ? -1 : undefined}
                  aria-hidden={r ? true : undefined}
                  onClick={() => onPick(l.ledger as LedgerKey, l.cause)}
                >
                  {body}
                </button>
              ) : (
                <span
                  key={`${r}-${i}`}
                  className={`w ${wireHue(l)}`}
                  aria-hidden={r ? true : undefined}
                >
                  {body}
                </span>
              );
            }),
          )}
          {game.pending ? (
            <span className="w">
              <b className="num">Next</b>
              <span>{game.pending}</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
