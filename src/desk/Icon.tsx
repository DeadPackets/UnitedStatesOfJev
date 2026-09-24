// The desk's line icons: one static sprite (public/icons.svg, the approved mock's symbols), drawn by id.
import type { LineIcon, ResourceIcon, Verb } from "../../worker/pack";

export const LINE_ICON: Record<LineIcon, string> = {
  chamber: "i-cap",
  court: "i-court",
  army: "i-army",
  clergy: "i-clergy",
  street: "i-pop",
  party: "i-flag",
  patrons: "i-coins",
  press: "i-news",
  foreign: "i-globe",
  market: "i-chart",
  crown: "i-crown",
  council: "i-council",
};

// The mock drew six resource icons; the other nine take the nearest symbol the sprite has.
export const RESOURCE_ICON: Record<ResourceIcon, string> = {
  bank: "i-tre",
  gavel: "i-aut",
  note: "i-che",
  coins: "i-coins",
  crown: "i-crown",
  crate: "i-crate",
  people: "i-pop",
  scroll: "i-scroll",
  flag: "i-flag",
  sword: "i-army",
  faith: "i-clergy",
  medal: "i-star",
  drop: "i-tre",
  grain: "i-tre",
  house: "i-tre",
};

export const VERB_ICON: Record<Verb, string> = {
  law: "i-cap",
  decree: "i-scroll",
  appoint: "i-council",
  spend: "i-coins",
  proclaim: "i-news",
  favour: "i-hand",
  force: "i-army",
};

export function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ? `ic ${className}` : "ic"} aria-hidden="true">
      <use href={`/icons.svg#${id}`} />
    </svg>
  );
}
