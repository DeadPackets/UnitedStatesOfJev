// The review: every change of the last moment with its amount and reason, which stays until "Back to the desk".
import { useLayoutEffect, useRef } from "react";
import type { ResourceCard, ReviewLine, RimRow } from "../../worker/desk";
import { play, reduced, signed } from "./fx";
import { Icon, LINE_ICON, RESOURCE_ICON } from "./Icon";
import { stagger } from "motion";

type Props = {
  kicker: string;
  title: string;
  failed: boolean;
  lines: ReviewLine[];
  rows: RimRow[];
  resources: ResourceCard[];
  onBack: () => void;
};

export function Review({ kicker, title, failed, lines, rows, resources, onBack }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (reduced()) return;
    play(box.current!, { opacity: [0, 1], y: [14, 0] }, { duration: 0.3 }).catch(() => {});
    play(
      [...box.current!.querySelectorAll("li")],
      { opacity: [0, 1], x: [-8, 0] },
      { duration: 0.25, delay: stagger(0.05) },
    ).catch(() => {});
  }, []);
  const iconOf = (line: ReviewLine) => {
    if (line.target === "finalVote") return "i-ballot";
    if (line.target === "resource")
      return RESOURCE_ICON[resources.find((card) => card.key === line.id)?.icon ?? "bank"];
    return LINE_ICON[rows.find((row) => row.id === line.id)?.icon ?? "council"];
  };
  return (
    <div className="rv sf" id="rv" ref={box}>
      <div className="rv-h">
        <span className="kicker">{kicker}</span>
        <h3>{title}</h3>
        {failed ? <p>Nothing it promised lands.</p> : null}
        <button className="btn" id="back" onClick={onBack}>
          Back to the desk
        </button>
      </div>
      <ol className="rv-l">
        {lines.length ? (
          lines.map((line) => (
            <li key={`${line.target}:${line.id}`} className={line.delta > 0 ? "up" : "dn"}>
              <Icon id={iconOf(line)} />
              <span className="nm">{line.name}</span>
              <span className="ft num">
                {line.from} → {line.to}
              </span>
              <b className="num">{signed(line.delta)}</b>
              <span className="wy">{line.why}</span>
            </li>
          ))
        ) : (
          <li>
            <span className="nm">Nothing moved.</span>
          </li>
        )}
      </ol>
    </div>
  );
}
