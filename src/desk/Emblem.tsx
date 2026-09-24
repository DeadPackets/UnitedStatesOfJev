// A group's mark (placement A): its emblem when it passes checkEmblem, drawn from allowlisted shapes with createElement
// and clipped to its own box; the line icon otherwise, which is also the fallback for any missing or filtered emblem.
import { createElement } from "react";
import { checkEmblem, emblemShapes } from "../../worker/emblem";
import { Icon } from "./Icon";

export function Mark({ emblem, icon }: { emblem: unknown; icon: string }) {
  const checked = checkEmblem(emblem);
  if (!checked) return <Icon id={icon} />;
  return (
    <svg
      className="em"
      viewBox={`0 0 ${checked.size} ${checked.size}`}
      overflow="hidden"
      aria-hidden="true"
    >
      {emblemShapes(checked).map((shape, index) =>
        createElement(shape.tag, { key: index, ...shape.props }),
      )}
    </svg>
  );
}
