// Paint helpers shared by the desk's layout effects and its moments: each writes one part of the React-drawn desk by
// hand, so a moment can change it mid-flight and React can paint the same finished state when the moment ends.
import { animate } from "motion";
import type { ReceiptLine, RimRow } from "../../worker/desk";
import type { Resource } from "../../worker/engine";
import { reduced, sfx, signed } from "./fx";

export const RESOURCE_TOKEN: Record<Resource, "tre" | "aut" | "che"> = {
  treasury: "tre",
  authority: "aut",
  chest: "che",
};
const find = (root: ParentNode, selector: string) => root.querySelector<HTMLElement>(selector);

/** The rim row's wash deepens from 5% to 16% of its hue as support nears its line. */
export const heatOf = (margin: number) => Math.max(0, Math.min(1, 1 - margin / 25));

export function standing(
  row: Pick<RimRow, "margin" | "strikesOn">,
  turn: number,
  turnWord: string,
  short: boolean,
) {
  if (row.margin > 0) return `${row.margin} above its line`;
  if (row.margin === 0) return "On its line";
  const turns = Math.max(1, (row.strikesOn ?? turn + 2) - turn);
  return `${-row.margin} under${short ? "" : " its line"} · strikes in ${turns} ${turnWord}${turns === 1 ? "" : "s"}`;
}

export function paintRow(
  el: HTMLElement,
  row: RimRow,
  support: number,
  turn: number,
  turnWord: string,
) {
  const margin = support - row.line;
  el.style.setProperty("--heat", heatOf(margin).toFixed(2));
  el.classList.toggle("warn", margin < 0);
  const status = find(el, ".hs");
  if (status)
    status.textContent = standing({ margin, strikesOn: row.strikesOn }, turn, turnWord, true);
}

export function paintCentre(stage: ParentNode, big: number, sub: string) {
  const number = find(stage, "#hcN"),
    caption = find(stage, "#hcS");
  if (number) number.textContent = String(big);
  if (caption) caption.textContent = sub;
}
export function paintTally(stage: ParentNode, yes: number, no: number, size: number) {
  find(stage, "#tyF")!.textContent = String(yes);
  find(stage, "#tyA")!.textContent = String(no);
  find(stage, ".ty-bar .f")!.style.transform = `scaleX(${yes / size})`;
  find(stage, ".ty-bar .a")!.style.transform = `scaleX(${no / size})`;
}

/** The small tied tag with the amount, on the element a receipt line moves. */
export function paintKnot(target: Element, delta: number, animated: boolean) {
  const slot = target.querySelector(".dx");
  if (!slot) return;
  const knot = document.createElement("span");
  knot.className = `knot ${delta > 0 ? "up" : "dn"}`;
  knot.textContent = signed(delta);
  slot.replaceChildren(knot);
  if (!animated || reduced()) return;
  animate(knot, { scale: [1.6, 1] }, { type: "spring", stiffness: 600, damping: 12 });
  animate(target, { x: [0, 4, -3, 0] }, { duration: 0.3 });
  sfx("knot");
}

export function iconNode(id: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  svg.setAttribute("class", "ic");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", `/icons.svg#${id}`);
  svg.append(use);
  return svg;
}

/** The lock badge on a group that must agree; red when it refuses. */
export function lockRow(row: Element, refuses: boolean, animated: boolean) {
  const disc = row.querySelector(".hi");
  if (!disc || disc.querySelector(".lockb")) return;
  const badge = document.createElement("i");
  badge.className = refuses ? "lockb no" : "lockb";
  badge.append(iconNode("i-lock"));
  disc.append(badge);
  if (animated && !reduced()) animate(badge, { scale: [0, 1.4, 1] }, { duration: 0.35 });
}

export function clearMarks(root: ParentNode) {
  for (const mark of root.querySelectorAll(".knot, .gd, .lockb, .wtag, .sweep")) mark.remove();
}

export function targetOf(
  main: ParentNode,
  line: Pick<ReceiptLine, "target" | "id">,
): HTMLElement | null {
  if (line.target === "finalVote") return find(main, "#fv");
  return line.target === "resource"
    ? find(main, `.led[data-r="${CSS.escape(line.id)}"]`)
    : find(main, `.hm[data-h="${CSS.escape(line.id)}"]`);
}

/** Centres a fixed card on the chamber, as the mock's file and card open. */
export function atStage(el: HTMLElement) {
  const stage = document.getElementById("stage")?.getBoundingClientRect();
  if (!stage) return;
  el.style.left = `${stage.left + stage.width / 2}px`;
  el.style.top = `${stage.top + stage.height / 2}px`;
}
