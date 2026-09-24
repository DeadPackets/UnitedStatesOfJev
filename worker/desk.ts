// The desk's view contract: what the worker sends the React desk (docs/mocks/v4/feel/desk.html) on every read of a
// game. Types, and deskView: the mapping from a pack and a game to what the desk draws. game.ts view() adds it;
// the client reads these fields and never derives a number the engine owns.
import { billOf, commit, instrumentOf, previewOf, vetoRows } from "./acts";
import { checkEmblem } from "./emblem";
import {
  AGAINST_AT,
  FOR_AT,
  type Bill,
  RESOURCES,
  WARN_TURNS,
  actTokens,
  applyVote,
  effectiveWhip,
  glanceOf,
  hash,
  holdersOf,
  rng,
  testBar,
  votePreview,
  weightOf,
  type FactionCount,
  type Game,
  type Preview,
  type PriceTag,
  type Resource,
  type Veto,
  type WireLine,
} from "./engine";
import type { Emblem } from "./emblem";
import type { Glance, LineIcon, Pack, ResourceIcon, Verb } from "./pack";
import { parseThemeTokens, type ThemeTokens, type Tint } from "./tokens";

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
  leans: Record<string, "for" | "against" | "hesitant">; // each member's lean, so a seat opens the member it shows
}

/** A law signed and waiting for its vote: the only time the engine lets you lobby a seat or amend the bill. */
export interface Floor {
  title: string;
  count: Count | null; // null until the bill is counted
  drafts: { title: string; summary: string; expected: number }[] | null; // null: not amended yet
  lobbied: string[]; // the members already offered something on this bill
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
  floor: Floor | null;
}

type Holder = ReturnType<typeof holdersOf>[number];

const NEUTRAL: Tint = { light: "#596073", dark: "#aab1c2" };
const RESOURCE_WORDS: Record<Resource, { name: string; icon: ResourceIcon }> = {
  treasury: { name: "Treasury", icon: "bank" },
  authority: { name: "Authority", icon: "gavel" },
  chest: { name: "Chest", icon: "note" },
};

const resourceName = (pack: Pack, key: Resource) =>
  pack.constitution?.ledgers[key]?.name ?? RESOURCE_WORDS[key].name;
const shortName = (holder: Holder) => holder.short ?? holder.name;
// R24: the final vote is each voting group's support times its weight.
const finalVote = (game: Game) =>
  Math.round(Object.values(game.holders).reduce((sum, h) => sum + h.weight * h.support, 0));
const need = (pack: Pack, game: Game) => Math.round(testBar(pack, game) * 100);

/** The words after the act's own title in a wire cause, capitalised; the fallback when nothing is left. */
export function reasonOf(cause: string, title: string, fallback: string): string {
  const rest = (
    title && cause.startsWith(title) ? cause.slice(title.length).replace(/^[:,]\s*/, "") : cause
  ).trim();
  return rest ? rest[0].toUpperCase() + rest.slice(1) : fallback;
}

// The pack's hints first; Stage 0's suggested fallback for a pack written before icons.
function iconOf(holder: Holder): LineIcon {
  if (holder.icon) return holder.icon;
  if (holder.members === "seats") return "chamber";
  if (holder.members === "citizens") return "street";
  return holder.levers.includes("force") ? "army" : "council";
}
function tintOf(pack: Pack, id: string, own?: Tint): Tint {
  if (own) return own;
  const faction = pack.factions.find((candidate) => candidate.id === id);
  return faction ? (faction.tint ?? { light: faction.color, dark: faction.color }) : NEUTRAL;
}

function rimRow(pack: Pack, game: Game, holder: Holder): RimRow {
  const state = game.holders[holder.id];
  const support = Math.round(state?.support ?? 50);
  const line = state?.line ?? holder.line;
  const warning = game.warnings.find((candidate) => candidate.holder === holder.id);
  return {
    id: holder.id,
    name: shortName(holder),
    where: holder.where,
    support,
    line,
    margin: support - line,
    strikesOn: warning ? warning.fires : support < line ? game.turn + WARN_TURNS : null,
    votes: Math.round((state?.weight ?? weightOf(pack, holder.id)) * 100),
    tint: tintOf(pack, holder.id, holder.tint),
    icon: iconOf(holder),
    emblem: checkEmblem(holder.emblem),
    glance: glanceOf(holder) ?? null,
  };
}

function resourceLine(pack: Pack, key: Resource, delta: number, why: string): ReceiptLine {
  return { target: "resource", id: key, name: resourceName(pack, key), delta, why };
}
function voteLine(pack: Pack, before: Game, after: Game): ReceiptLine {
  const bar = need(pack, before),
    to = finalVote(after);
  const why = to >= bar ? `${to - bar} above what you need` : `${bar - to} short of what you need`;
  return {
    target: "finalVote",
    id: "finalVote",
    name: "Final vote",
    delta: to - finalVote(before),
    why,
  };
}
// Whole numbers on both ends, so a from, a to and their delta always agree on screen.
function groupLines(
  pack: Pack,
  before: Game,
  after: Game,
  wire: WireLine[],
  title: string,
  fallback?: string,
): ReceiptLine[] {
  return holdersOf(pack).flatMap((holder): ReceiptLine[] => {
    const from = Math.round(before.holders[holder.id]?.support ?? 0),
      to = Math.round(after.holders[holder.id]?.support ?? 0);
    if (from === to) return [];
    const cause =
      wire.find((line) => line.kind === "support" && line.id === holder.id)?.cause ?? "";
    const why = reasonOf(
      cause,
      title,
      fallback ?? (to > from ? "It serves them" : "It costs them"),
    );
    return [{ target: "group", id: holder.id, name: shortName(holder), delta: to - from, why }];
  });
}
function resourceDiff(
  pack: Pack,
  before: Game,
  after: Game,
  wire: WireLine[],
  fallback: string,
): ReceiptLine[] {
  return RESOURCES.flatMap((key): ReceiptLine[] => {
    const from = Math.round(before.ledgers[key]),
      to = Math.round(after.ledgers[key]);
    if (from === to) return [];
    const cause = wire.find((line) => line.kind === "ledger" && line.ledger === key)?.cause ?? "";
    return [resourceLine(pack, key, to - from, reasonOf(cause, "", fallback))];
  });
}

// ponytail: ledgers are set deep enough that commit never refuses and a vote's +2 or -2 never clamps; the receipt
// reads resources off the tag, so these numbers never reach the player. Upgrade: an engine dry-run flag on commit.
const DEEP = { treasury: 5000, authority: 100, chest: 5000 };
function afterCommit(pack: Pack, game: Game, tag: PriceTag) {
  const clone = structuredClone(game);
  clone.ledgers = { ...DEEP };
  const mark = clone.wireTurn === clone.turn ? clone.wire.length : 0;
  commit(pack, clone, structuredClone(tag));
  return { game: clone, wire: clone.wire.slice(mark) };
}
// Seat by seat on the preview's own lines: a passage takes every hesitant seat, a defeat none of them. The whip is set
// far past 0 and 1 so the draw is certain whatever mood, shift or cap effectiveWhip adds.
function afterVote(pack: Pack, signed: Game, passed: boolean) {
  const clone = structuredClone(signed);
  const bill = clone.bills.at(-1)!;
  const chance = effectiveWhip(clone, bill);
  bill.whip = Object.fromEntries(
    Object.entries(chance).map(([id, p]) => [id, (passed ? p > AGAINST_AT : p >= FOR_AT) ? 5 : -5]),
  );
  const mark = clone.wire.length;
  applyVote(pack, clone, bill);
  return { game: clone, wire: clone.wire.slice(mark) };
}

function countOf(pack: Pack, game: Game, bill: Bill, preview: Preview | null): Count | null {
  if (!preview) return null;
  const chance = effectiveWhip(game, bill);
  const unsure = (id: string) => chance[id] > AGAINST_AT && chance[id] < FOR_AT;
  const lean = (id: string) =>
    chance[id] >= FOR_AT ? "for" : chance[id] <= AGAINST_AT ? "against" : "hesitant";
  return {
    leans: Object.fromEntries(game.members.map((member) => [member.id, lean(member.id)])),
    label: pack.vocabulary.chamber,
    need: preview.need,
    expected: preview.expected,
    tie: null,
    factions: preview.factions.map((faction) => ({
      ...faction,
      hesitantNames: game.members
        .filter((member) => member.faction === faction.id && unsure(member.id))
        .map((member) => member.name),
    })),
  };
}

function receiptOf(pack: Pack, game: Game, tag: PriceTag): Receipt {
  const words = pack.vocabulary;
  const law = tag.verb === "law";
  const vetoes = vetoRows(pack, game, tag.verb, actTokens(tag));
  const signed = afterCommit(pack, game, tag);
  const charge = RESOURCES.filter((key) => tag.charge[key] > 0).map((key) =>
    resourceLine(pack, key, -tag.charge[key], "Spent when you sign"),
  );
  const rates = tag.revenue.flatMap((rate) =>
    (RESOURCES as readonly string[]).includes(rate.ledger)
      ? [
          resourceLine(
            pack,
            rate.ledger as Resource,
            rate.delta,
            `Every ${words.turn} while it stands`,
          ),
        ]
      : [],
  );
  const groups = groupLines(pack, game, signed.game, signed.wire, tag.title);
  const outcome = (passed: boolean) => {
    const voted = afterVote(pack, signed.game, passed);
    const verdictWords = `The ${words.bill} ${passed ? words.pass : words.fail}`;
    return [
      ...resourceDiff(pack, signed.game, voted.game, voted.wire, verdictWords),
      ...(passed ? rates : []),
      ...groupLines(pack, signed.game, voted.game, voted.wire, tag.title, verdictWords),
      voteLine(pack, game, voted.game),
    ];
  };
  return {
    verb: tag.verb,
    instrument: instrumentOf(pack, tag.verb)?.name ?? tag.verb,
    title: tag.title,
    reading: tag.reading,
    now: law
      ? [...charge, ...groups]
      : [...charge, ...rates, ...groups, voteLine(pack, game, signed.game)],
    pass: law ? outcome(true) : [],
    fail: law ? outcome(false) : [],
    vetoes,
    blocked: vetoes.find((veto) => !veto.agrees) ?? null,
    count: law ? countOf(pack, game, billOf(game, tag), previewOf(pack, game, tag)) : null,
  };
}

function verdictOf(pack: Pack, game: Game): Verdict | null {
  const bill = game.bills.at(-1);
  if (game.phase !== "over" || !bill?.votes || bill.id !== game.turn) return null;
  const votes = bill.votes;
  const chance = effectiveWhip(game, bill);
  const unsure = (id: string) => chance[id] > AGAINST_AT && chance[id] < FOR_AT;
  // The sure seats in a shuffle seeded by the bill, so a reload replays the same count; then each hesitant seat.
  const draw = rng(hash(`${game.seed}:${game.term}:${bill.id}:order`));
  const sure = game.members
    .filter((member) => !unsure(member.id))
    .map((member) => ({ member, key: draw() }))
    .sort((a, b) => a.key - b.key)
    .map(({ member }) => member);
  const hesitant = pack.factions.flatMap((faction) =>
    game.members.filter((member) => member.faction === faction.id && unsure(member.id)),
  );
  const yes = bill.yes ?? 0;
  return {
    passed: !!bill.passed && !bill.struck,
    yes,
    no: game.members.length - yes,
    need: bill.threshold ?? 0,
    tieBrokenBy: null,
    vetoedBy: null,
    order: [...sure, ...hesitant].map((member) => ({
      member: member.id,
      faction: member.faction,
      yes: !!votes[member.id],
      hesitant: unsure(member.id),
    })),
  };
}

function reviewOf(pack: Pack, game: Game, previous: Game): ReviewLine[] {
  // The wire is one turn's lines; a request that opened a new turn's wire wrote all of it.
  const wire =
    previous.wireTurn === game.wireTurn ? game.wire.slice(previous.wire.length) : game.wire;
  const title = previous.tag?.title ?? "";
  const resources = RESOURCES.flatMap((key): ReviewLine[] => {
    const from = Math.round(previous.ledgers[key]),
      to = Math.round(game.ledgers[key]);
    if (from === to) return [];
    const cause = wire.find((line) => line.kind === "ledger" && line.ledger === key)?.cause ?? "";
    const why = reasonOf(cause, title, to > from ? "Paid in" : "Spent");
    return [{ ...resourceLine(pack, key, to - from, why), from, to }];
  });
  const groups = groupLines(pack, previous, game, wire, title).map((line) => {
    const to = Math.round(game.holders[line.id].support);
    return { ...line, from: to - line.delta, to };
  });
  const vote = voteLine(pack, previous, game);
  const from = finalVote(previous);
  return [
    ...resources,
    ...groups,
    ...(vote.delta ? [{ ...vote, from, to: from + vote.delta }] : []),
  ];
}

function floorOf(pack: Pack, game: Game): Floor | null {
  const bill = game.bills.at(-1);
  if (game.phase !== "whip" || !bill || bill.id !== game.turn || bill.votes) return null;
  const tokens = actTokens({
    verb: "law",
    tags: bill.tags,
    touches: bill.touches,
    keeps: bill.keeps,
  });
  const preview = bill.whip ? votePreview(pack, game, bill, tokens) : null;
  return {
    title: bill.title,
    count: countOf(pack, game, bill, preview),
    // game.ts stores each draft with its expected yes count
    drafts:
      bill.amendments?.map((draft) => ({
        title: draft.title,
        summary: draft.summary,
        expected: (draft as { expected?: number }).expected ?? 0,
      })) ?? null,
    lobbied: Object.keys(bill.offers),
  };
}

/** Everything the desk draws for this game, from the pack's words and the game's numbers; the client derives nothing. */
export function deskView(pack: Pack, game: Game, previous?: Game): DeskView {
  const words = pack.vocabulary;
  return {
    theme: parseThemeTokens(pack.themeTokens).tokens,
    vocabulary: {
      file: words.file ?? "File",
      abroad: words.abroad ?? "abroad",
      turn: words.turn,
      pass: words.pass,
      fail: words.fail,
    },
    rim: holdersOf(pack).map((holder) => rimRow(pack, game, holder)),
    factions: pack.factions.flatMap((faction): ChamberFaction[] => {
      const seats = game.members.filter((member) => member.faction === faction.id).length;
      if (!seats) return [];
      return [
        {
          id: faction.id,
          name: faction.name,
          short: faction.short,
          seats,
          tint: tintOf(pack, faction.id, faction.tint),
          emblem: checkEmblem(faction.emblem),
          glance: glanceOf(faction) ?? null,
        },
      ];
    }),
    resources: RESOURCES.map((key) => {
      const ledger = pack.constitution?.ledgers[key];
      const value = Math.round(game.ledgers[key]);
      return {
        key,
        name: resourceName(pack, key),
        value,
        icon: ledger?.icon ?? RESOURCE_WORDS[key].icon,
        about: ledger?.for ?? null,
        earn: ledger?.earn ?? [],
        spend: ledger?.spend ?? [],
        fails: ledger?.fails ?? null,
        history: [value], // Cross-track request 1: the engine does not keep past turns' closing values yet
      };
    }),
    finalVote: { value: finalVote(game), need: need(pack, game) },
    receipt: game.tag ? receiptOf(pack, game, game.tag) : null,
    verdict: verdictOf(pack, game),
    review: previous ? reviewOf(pack, game, previous) : null,
    floor: floorOf(pack, game),
  };
}
