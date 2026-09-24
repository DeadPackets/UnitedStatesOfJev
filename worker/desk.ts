// The desk's view contract: what the worker sends the React desk (docs/mocks/v4/feel/desk.html) on every read of a
// game. Types only. Track D writes deskView(pack, game): DeskView in this file and adds `desk` to game.ts view();
// the client reads these fields and never derives a number the engine owns.
import type { FactionCount, Resource, Veto } from "./engine";
import type { Emblem } from "./emblem";
import type { Glance, LineIcon, ResourceIcon, Verb } from "./pack";
import type { ThemeTokens, Tint } from "./tokens";

/** One group on a rim: home groups on the left, abroad on the right, in pack order. */
export interface RimRow {
  id: string;
  name: string; // the pack's short name where it has one
  where: "home" | "abroad";
  support: number; // 0 to 100
  line: number; // under it the group warns, and strikes two turns later
  margin: number; // support minus line: under 0 the row warns
  strikesOn: number | null; // the turn its warning fires, while it is under its line
  votes: number; // its share of the final vote, 0 to 100; 0 means it cannot vote on you
  tint: Tint;
  icon: LineIcon; // always set: the disc shows it when emblem is null or fails checkEmblem
  emblem: Emblem | null;
  glance: Glance | null; // null: the file shows the support block and no tags
}

/** A chamber faction: its seats in the hemicycle and its entry in the legend. */
export interface ChamberFaction {
  id: string;
  name: string;
  short: string;
  seats: number;
  tint: Tint;
  emblem: Emblem | null;
  glance: Glance | null;
}

/** One stat card of the resources sheet, and the top bar's figure. */
export interface ResourceCard {
  key: Resource;
  name: string;
  value: number;
  icon: ResourceIcon;
  about: string | null; // the pack's `for`: what this resource is in this world
  earn: string[];
  spend: string[];
  fails: string | null; // the tail after "At 0"
  history: number[]; // the last seven turns' closing values, oldest first; the last is `value`
}

/** The top bar's final vote: the weighted support of the voting groups against the bar. */
export interface FinalVote {
  value: number; // 0 to 100
  need: number;
}

/** One line of the receipt, and one courier when it lands. */
export interface ReceiptLine {
  target: "resource" | "group" | "finalVote";
  id: string; // a Resource, a holder id, or "finalVote"
  name: string;
  delta: number;
  why: string;
}

/** The priced act: what signing spends now, what lands if it passes, what a defeat costs. */
export interface Receipt {
  verb: Verb;
  instrument: string; // the pack's name for the verb
  title: string;
  reading: string;
  now: ReceiptLine[];
  pass: ReceiptLine[];
  fail: ReceiptLine[]; // empty for an act with no vote
  vetoes: Veto[];
  blocked: Veto | null; // the first veto that refuses: the act can be priced but not signed
  count: Count | null; // a law only
}

/** The count before the vote: each faction's for, against and hesitant seats, with its reason and terms. */
export interface Count {
  label: string; // the chamber's name
  need: number;
  expected: number;
  tie: string | null; // who breaks a tie in the ruler's favour
  factions: (FactionCount & { hesitantNames: string[] })[]; // FactionCount carries terms
}

/** The vote as the desk plays it, seat by seat, and its result. */
export interface Verdict {
  passed: boolean;
  yes: number;
  no: number;
  need: number;
  tieBrokenBy: string | null;
  vetoedBy: string | null;
  // Seats in calling order: sure votes first, then each hesitant seat by name.
  order: { member: string; faction: string; yes: boolean; hesitant: boolean }[];
}

/** One row of the review that stays until "Back to the desk". */
export interface ReviewLine extends ReceiptLine {
  from: number;
  to: number;
}

export interface DeskView {
  theme: ThemeTokens; // fitted, or DEFAULT_THEME_TOKENS for a pack without them
  vocabulary: { file: string; abroad: string; turn: string; pass: string; fail: string };
  rim: RimRow[];
  factions: ChamberFaction[];
  resources: ResourceCard[];
  finalVote: FinalVote;
  receipt: Receipt | null;
  verdict: Verdict | null;
  review: ReviewLine[] | null;
}
