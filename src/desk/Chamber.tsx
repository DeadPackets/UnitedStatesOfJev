// The chamber: every seat in six rows, factions filling wedges left to right with hesitant seats at the edge nearest
// the centre; the tally, the legend and, once priced, the count and each faction's terms. Painted by hand (paintChamber)
// so the receipt can reveal the count mid-print and React repaints the same state after. A seat opens its member.
import {
  forwardRef,
  memo,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent,
} from "react";
import type { ChamberFaction, Count } from "../../worker/desk";
import { play, reduced } from "./fx";
import { iconNode, paintCentre, paintTally } from "./paint";

export type SeatSpot = {
  x: number;
  y: number;
  angle: number;
  index: number;
  faction: ChamberFaction;
};
export type ChamberHandle = { reveal(count?: Count | null): void; spots: SeatSpot[] };
export type TermHandler = (faction: string, term: string) => void;
type Seated = { id: string; faction: string };

const ROWS = [0.45, 0.56, 0.67, 0.78, 0.89, 1];
export function layoutSeats(factions: ChamberFaction[]): SeatSpot[] {
  const size = factions.reduce((sum, faction) => sum + faction.seats, 0);
  const total = ROWS.reduce((a, b) => a + b);
  const counts = ROWS.map((radius) => Math.round((size * radius) / total));
  counts[5] += size - counts.reduce((a, b) => a + b);
  const points = ROWS.flatMap((radius, row) =>
    Array.from({ length: counts[row] }, (_, j) => {
      const angle = Math.PI * (1 - (counts[row] > 1 ? j / (counts[row] - 1) : 0.5));
      return { x: radius * Math.cos(angle), y: -radius * Math.sin(angle), angle, row };
    }),
  ).sort((a, b) => b.angle - a.angle || a.row - b.row);
  let next = 0;
  return factions.flatMap((faction) =>
    points.slice(next, (next += faction.seats)).map((point, i) => ({
      x: point.x,
      y: point.y,
      angle: point.angle,
      index: next - faction.seats + i,
      faction,
    })),
  );
}

const ORDER = { for: 0, against: 1, hesitant: 2 } as const;
// Which member sits in each seat. Within each faction's wedge: sure seats on the far side, hesitant ones nearest the
// chamber's centre, so the seat a player clicks is the member whose lean it shows.
function bindMembers(spots: SeatSpot[], members: Seated[], count: Count | null): (string | null)[] {
  const bound: (string | null)[] = spots.map(() => null);
  for (const factionId of new Set(spots.map((spot) => spot.faction.id))) {
    const wedge = spots.filter((spot) => spot.faction.id === factionId);
    const left = wedge.reduce((sum, spot) => sum + spot.angle, 0) / wedge.length > Math.PI / 2;
    const seated = members.filter((member) => member.faction === factionId);
    if (count)
      seated.sort(
        (a, b) => ORDER[count.leans[a.id] ?? "hesitant"] - ORDER[count.leans[b.id] ?? "hesitant"],
      );
    if (count && !left) seated.reverse();
    wedge.forEach((spot, i) => (bound[spot.index] = seated[i]?.id ?? null));
  }
  return bound;
}
const LEAN_CLASS = { for: "p-for", against: "p-ag", hesitant: "p-hes" } as const;

function paintLegend(
  legend: HTMLElement,
  factions: ChamberFaction[],
  count: Count | null,
  costs: (term: { cost: Record<string, number> }) => string,
  onTerm?: TermHandler,
) {
  legend.replaceChildren(
    ...factions.map((faction) => {
      const item = document.createElement("span"),
        dot = document.createElement("i"),
        name = document.createElement("b");
      dot.style.setProperty("--pl", faction.tint.light);
      dot.style.setProperty("--pd", faction.tint.dark);
      const row = count?.factions.find((candidate) => candidate.id === faction.id);
      if (!row) {
        name.textContent = String(faction.seats);
        item.append(dot, `${faction.name} `, name);
        return item;
      }
      name.textContent = faction.name;
      const parts = [
        row.for && `${row.for} for`,
        row.hesitant && `${row.hesitant} hesitant`,
        row.against && `${row.against} against`,
      ];
      item.append(dot, name, ` ${parts.filter(Boolean).join(", ")}: ${row.reason}`);
      for (const term of row.terms ?? []) {
        const chip = document.createElement("button");
        chip.className = "btn term";
        // Short on the chip so the legend stays near the mock's two lines; the full term is the tooltip.
        const cost = costs(term);
        const what = term.kind === "pledge" ? term.label : term.kind === "post" ? "A post" : "";
        chip.textContent =
          [what, cost === "free" ? "" : cost].filter(Boolean).join(" · ") || "free";
        chip.title = `${term.label} · ${cost}`;
        chip.setAttribute("aria-label", `Take their terms: ${term.label}, ${cost}`);
        chip.onclick = () => onTerm?.(faction.id, term.kind);
        item.append(chip);
      }
      return item;
    }),
  );
}

type Paint = {
  spots: SeatSpot[];
  bound: (string | null)[];
  count: Count | null;
  need: number;
  eligible: Set<string> | null; // while a favour looks for its member: every other seat dims
  costs: (term: { cost: Record<string, number> }) => string;
  onTerm?: TermHandler;
};
export function paintChamber(stage: HTMLElement, paint: Paint, animated: boolean) {
  const { spots, bound, count, need, eligible, costs, onTerm } = paint;
  const size = spots.length;
  stage.querySelectorAll<SVGCircleElement>("#hemi .seat").forEach((circle, i) => {
    const member = bound[i];
    const lean = count && member ? count.leans[member] : undefined;
    const dim = eligible && !(member && eligible.has(member)) ? " dim" : "";
    const set = () =>
      circle.setAttribute("class", `seat${lean ? ` ${LEAN_CLASS[lean]}` : ""}${dim}`);
    if (!animated || reduced()) return set();
    const delay = ((Math.PI - spots[i].angle) / Math.PI) * 0.4;
    setTimeout(set, delay * 1000);
    play(circle, { scaleX: [1, 0, 1] }, { duration: 0.22, delay }).catch(() => {});
  });
  const inFavour = count ? count.factions.reduce((sum, f) => sum + f.for, 0) : 0;
  const against = count ? count.factions.reduce((sum, f) => sum + f.against, 0) : 0;
  const hesitant = count ? count.factions.reduce((sum, f) => sum + f.hesitant, 0) : 0;
  paintCentre(
    stage,
    count ? inFavour : need,
    count ? `for · ${count.need} needed` : `needed of ${size}`,
  );
  paintTally(stage, inFavour, against, size);
  const telltale = stage.querySelector("#stv")!;
  if (!count) telltale.replaceChildren();
  else {
    const chip = document.createElement("span");
    chip.className = "ctel";
    const bold = (value: number) =>
      Object.assign(document.createElement("b"), { textContent: String(value) });
    chip.append(
      iconNode("i-ballot"),
      bold(inFavour),
      " for · ",
      bold(hesitant),
      " hesitant · ",
      bold(against),
      " against",
    );
    telltale.replaceChildren(chip);
  }
  const factions = [...new Map(spots.map((spot) => [spot.faction.id, spot.faction])).values()];
  paintLegend(stage.querySelector(".gleg")!, factions, count, costs, onTerm);
}

type Props = {
  factions: ChamberFaction[];
  members: Seated[];
  label: string;
  need: number;
  count: Count | null;
  eligible: Set<string> | null;
  costs: (term: { cost: Record<string, number> }) => string;
  onTerm: TermHandler;
  onSeat: (member: string, index: number) => void;
};

export const Chamber = memo(
  forwardRef<ChamberHandle, Props>(function Chamber(
    { factions, members, label, need, count, eligible, costs, onTerm, onSeat },
    ref,
  ) {
    const spots = useMemo(() => layoutSeats(factions), [factions]);
    const bound = useMemo(() => bindMembers(spots, members, count), [spots, members, count]);
    const stage = useRef<HTMLElement>(null);
    const radius = 0.041 * Math.min(1, Math.sqrt(100 / Math.max(1, spots.length)));
    const paint = { spots, bound, count, need, eligible, costs, onTerm };
    useLayoutEffect(() => paintChamber(stage.current!, paint, false)); // eslint-disable-line
    useImperativeHandle(
      ref,
      () => ({
        spots,
        // The count the receipt is printing is not this render's yet: it arrives with the reveal.
        reveal: (next = count) =>
          paintChamber(
            stage.current!,
            { ...paint, count: next, bound: bindMembers(spots, members, next) },
            true,
          ),
      }),
      [paint], // eslint-disable-line
    );
    const click = (event: MouseEvent) => {
      const index = (event.target as Element).closest<SVGCircleElement>(".seat")?.dataset.i;
      const member = index === undefined ? null : bound[Number(index)];
      if (member) onSeat(member, Number(index));
    };
    return (
      <section className="stage sf" id="stage" ref={stage}>
        <div className="st-h">
          <span className="kicker">
            {/^the /i.test(label) ? label : `The ${label}`} · {spots.length} seats
          </span>
          <span className="st-v" id="stv" />
        </div>
        <div className="hemi-w">
          <svg
            id="hemi"
            viewBox="-1.08 -1.1 2.16 1.2"
            preserveAspectRatio="xMidYMid meet"
            aria-label={label}
            onClick={click}
          >
            {spots.map((spot) => (
              <circle
                key={spot.index}
                className="seat"
                data-i={spot.index}
                cx={spot.x.toFixed(4)}
                cy={spot.y.toFixed(4)}
                r={radius}
                style={
                  {
                    "--pl": spot.faction.tint.light,
                    "--pd": spot.faction.tint.dark,
                  } as CSSProperties
                }
              />
            ))}
            <text className="big" id="hcN" x="0" y="-.06" />
            <text className="sub" id="hcS" x="0" y=".05" />
          </svg>
          <div className="st-fx" id="stfx" />
        </div>
        <div className="tly" id="tly">
          <span className="ty-f">
            <b id="tyF" className="num" /> for
          </span>
          <div className="ty-bar">
            <i className="f" />
            <i className="a" />
            <i className="ln" style={{ left: `${(need / Math.max(1, spots.length)) * 100}%` }} />
          </div>
          <span className="ty-a">
            <b id="tyA" className="num" /> against
          </span>
        </div>
        <div className="gleg" />
      </section>
    );
  }),
);
