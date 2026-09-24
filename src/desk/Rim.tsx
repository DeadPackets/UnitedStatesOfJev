// The rims: one fixed-height row per group (P1-B), home on the left, abroad on the right, washed in the group's own hue.
import { memo, type CSSProperties, type KeyboardEvent } from "react";
import type { RimRow } from "../../worker/desk";
import { Mark } from "./Emblem";
import { Icon, LINE_ICON } from "./Icon";
import { Live } from "./Live";
import { heatOf, standing } from "./paint";

type Props = {
  side: "home" | "abroad";
  heading: string;
  rows: RimRow[];
  turn: number;
  turnWord: string;
  testWord: string;
  fileWord: string;
  open: string | null;
  onOpen: (id: string) => void;
};

export const Rim = memo(function Rim({
  side,
  heading,
  rows,
  turn,
  turnWord,
  testWord,
  fileWord,
  open,
  onOpen,
}: Props) {
  return (
    <aside
      className={`rim rim-${side === "home" ? "l" : "r"} sf${rows.length > 7 ? " dense" : ""}`}
    >
      <h4>{heading}</h4>
      {rows.map((row) => {
        const tip = `Votes on you at ${testWord}: ${row.votes} of 100`;
        const press = (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpen(row.id);
        };
        return (
          <div
            key={row.id}
            className={`hm${row.margin < 0 ? " warn" : ""}${open === row.id ? " on" : ""}`}
            data-h={row.id}
            role="button"
            tabIndex={0}
            style={
              {
                "--gl": row.tint.light,
                "--gd": row.tint.dark,
                "--heat": heatOf(row.margin).toFixed(2),
              } as CSSProperties
            }
            aria-label={`${row.name}: support ${row.support}, ${standing(row, turn, turnWord, false)}${row.votes ? `. ${tip}` : ""}. Open the ${fileWord}.`}
            onClick={() => onOpen(row.id)}
            onKeyDown={press}
          >
            <span className="hi">
              <Mark emblem={row.emblem} icon={LINE_ICON[row.icon]} />
            </span>
            <span className="hb">
              <b className="hn">{row.name}</b>
              <span className="hr">
                <i className="bar">
                  <i style={{ width: `${row.support}%` }} />
                  <i className="ln" style={{ left: `${row.line}%` }} />
                </i>
                <span className="dx" />
                <Live className="n num" text={row.support} />
                {row.votes ? (
                  <span className="bal-w">
                    <Icon id="i-ballot" />
                    {row.votes}
                    <span className="bal-tip" role="tooltip">
                      {tip}
                    </span>
                  </span>
                ) : null}
              </span>
              <Live as="span" className="hs" text={standing(row, turn, turnWord, true)} />
            </span>
          </div>
        );
      })}
    </aside>
  );
});
