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
