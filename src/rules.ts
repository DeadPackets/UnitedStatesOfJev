export const LEDGER_KEYS = ["treasury", "authority", "chest", "loyalty", "popularity"] as const;
export type LedgerKey = (typeof LEDGER_KEYS)[number];

const HUE: Record<LedgerKey, string> = {
  treasury: "r-tre", authority: "r-aut", chest: "r-che", loyalty: "r-loy", popularity: "r-pop",
};

export const hueClass = (k: LedgerKey) => HUE[k];
export const roomTo = (value: number, line: number) => Math.max(0, value - line);
/** A ledger at its line has already failed: spec §4 reads "0: no spending act until revenue passes". */
export const danger = (value: number, line: number) => value <= line;

// `ledger` is optional because a resistance line carries none (Stage A's WireLine).
type StripGame = {
  ledgers: Record<string, number | Record<string, number>>;
  pack: { regions: { id: string; weight: number }[] };
  wire: { kind: string; ledger?: string | null; id?: string | null; delta: number }[];
};

/** Popularity is per region, so the strip prints the same weighted sum the test's public half uses. */
export function ledgerValue(game: StripGame, k: LedgerKey): number {
  const v = game.ledgers[k];
  if (typeof v === "number") return v;
  let w = 0, sum = 0;
  for (const r of game.pack.regions) { w += r.weight; sum += r.weight * (v?.[r.id] ?? 50); }
  return w ? sum / w : 50;
}

/** Only `kind: "ledger"` counts: a resistance move borrows no ledger's arithmetic. */
export const ledgerDelta = (game: StripGame, k: LedgerKey) =>
  game.wire.reduce((a, l) => (l.kind === "ledger" && l.ledger === k ? a + l.delta : a), 0);

// `names` covers regions and holders, because a resistance line's id is a holder's.
type Line = { kind: string; ledger?: string | null; id?: string | null; delta: number; cause: string };

export const wireLabel = (l: Line, names: Map<string, string>) =>
  (l.kind === "resistance"
    ? [l.id ? names.get(l.id) ?? l.id : null, l.cause]
    : [l.ledger, l.id ? names.get(l.id) ?? l.id : null, l.cause]
  ).filter(Boolean).join(", ");

/** A resistance move and a card hit are danger, and so is any line with no ledger to take a hue from. */
export const wireHue = (l: Line) =>
  l.kind === "resistance" || l.kind === "card" || !l.ledger ? "r-danger" : hueClass(l.ledger as LedgerKey);

export const VERBS = ["decree", "law", "appoint", "spend", "proclaim", "favour", "force"] as const;
export type VerbKey = (typeof VERBS)[number];

// Most specific first: "pay the troops" is spend, "send the troops" is force.
const CUES: [VerbKey, RegExp][] = [
  ["force", /\b(deploy|curfew|martial|arrest|troops|soldiers|garrison|police|seal|occupy)\b/i],
  ["appoint", /\b(appoint|install|promote|dismiss|replace|name .* as|make .* (the|my))\b/i],
  ["favour", /\b(favou?r|promise|gift|pardon|owe|grant .* to \w+ personally)\b/i],
  ["spend", /\b(spend|pay|fund|subsid|relief|build|buy|wages|rations)\b/i],
  ["proclaim", /\b(tell|say|announce|address|speak|post|write to) (the|my|them)\b/i],
  ["decree", /\b(decree|edict|order|by my own|effective today|ends today)\b/i],
  ["law", /\b(bill|law|act|statute|legislat|table)\b/i],
];
const FALLBACK: VerbKey[] = ["law", "decree", "proclaim", "spend", "appoint", "favour", "force"];

/** The tabs settle from the text; the player may still pick a tab and the caller stops calling this. */
export function settleVerb(text: string, instruments: Partial<Record<VerbKey, unknown>>): VerbKey | null {
  const has = (v: VerbKey) => instruments[v] !== undefined;
  for (const [v, re] of CUES) if (has(v) && re.test(text)) return v;
  return FALLBACK.find(has) ?? null;
}

type UnreadGame = {
  turn: number; posts: { turn: number }[]; inForce: { turn: number }[];
  warnings: { at: number }[]; wire: { kind: string; ledger?: string | null }[];
};

// Two disclosure levels only, so anything unseen is a mark on a tab, never a third layer (research §2).
export function unreadTabs(game: UnreadGame, seen: Record<string, number>): string[] {
  const last = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  const at: Record<string, number> = {
    feed: last(game.posts.map((p) => p.turn)),
    country: game.wire.some((l) => l.kind === "ledger" && l.ledger === "popularity") ? game.turn : 0,
    room: last(game.warnings.map((w) => w.at)),
    record: last(game.inForce.map((f) => f.turn)),
    pinned: 0,
  };
  return Object.keys(at).filter((k) => at[k] > (seen[k] ?? 0));
}

const BAR = { start: 0.5, step: 0.03, cap: 0.7 };

/** The pack's own printed schedule (spec §6), so the player sees the ratchet coming. */
export function barAt(pack: { constitution?: { retention?: { bar?: { start: number; step: number; cap: number } } } }, term: number) {
  const b = pack.constitution?.retention?.bar ?? BAR;
  return Math.min(b.cap, b.start + b.step * (term - 1));
}

/** Spec §6 minority starts: above 6 short prints a handicap, above 15 short is the survival path. */
export const difficulty = (gap: number) =>
  gap <= 0 ? "Comfortable" : gap > 15 ? "Survival" : gap > 6 ? "Minority, with a handicap" : "Minority";
