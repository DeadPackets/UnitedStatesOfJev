export const LEDGER_KEYS = ["treasury", "authority", "chest", "loyalty", "popularity"] as const;
export type LedgerKey = (typeof LEDGER_KEYS)[number];

const HUE: Record<LedgerKey, string> = {
  treasury: "r-tre",
  authority: "r-aut",
  chest: "r-che",
  loyalty: "r-loy",
  popularity: "r-pop",
};

// A quiet turn (no ledger moved) is an empty square, as its share character is.
export const squareClass = (ledger: string) =>
  ledger in HUE ? `sq on ${HUE[ledger as LedgerKey]}` : "sq";
export const VERBS = ["decree", "law", "appoint", "spend", "proclaim", "favour", "force"] as const;
export type VerbKey = (typeof VERBS)[number];

// Most specific first: "pay the troops" is spend, "send the troops" is force.
const CUES: [VerbKey, RegExp][] = [
  [
    "force",
    /\b(deploy|curfew|martial|arrest|troops|soldiers|garrison|police|seal|occupy|war|invade|invasion|purge|mobili[sz]e)\b/i,
  ],
  ["appoint", /\b(appoint|install|promote|dismiss|replace|name .* as|make .* (the|my))\b/i],
  ["favour", /\b(favou?r|promise|gift|pardon|owe|grant .* to \w+ personally)\b/i],
  ["spend", /\b(spend|pay|fund|subsid|relief|build|buy|wages|rations)\b/i],
  ["proclaim", /\b(tell|say|announce|address|speak|post|write to) (the|my|them)\b/i],
  ["decree", /\b(decree|edict|order|by my own|effective today|ends today)\b/i],
  ["law", /\b(bill|law|act|statute|legislat|table)\b/i],
];
const FALLBACK: VerbKey[] = ["law", "decree", "proclaim", "spend", "appoint", "favour", "force"];

/** The tabs settle from the text; the player may still pick a tab and the caller stops calling this. */
export function settleVerb(
  text: string,
  instruments: Partial<Record<VerbKey, { available?: boolean }>>,
): VerbKey | null {
  // An instrument the pack lists as not available (a realm with no laws) is never the guess.
  const has = (v: VerbKey) => !!instruments[v] && instruments[v].available !== false;
  for (const [v, re] of CUES) if (has(v) && re.test(text)) return v;
  return FALLBACK.find(has) ?? null;
}

const BAR = { start: 0.5, step: 0.03, cap: 0.7 };

/** The pack's own printed schedule (spec §6), so the player sees the ratchet coming. */
export function barAt(
  pack: { constitution?: { retention?: { bar?: { start: number; step: number; cap: number } } } },
  term: number,
) {
  const b = pack.constitution?.retention?.bar ?? BAR;
  return Math.min(b.cap, b.start + b.step * (term - 1));
}

/** Spec §6 minority starts: above 6 short prints a handicap, above 15 short is the survival path. */
export const difficulty = (gap: number) =>
  gap <= 0
    ? "Comfortable"
    : gap > 15
      ? "Survival"
      : gap > 6
        ? "Minority, with a handicap"
        : "Minority";

/** The oath opens only once every Seat page has been shown. */
export const allRead = (read: ReadonlySet<number>, pages: number) =>
  Array.from({ length: pages }, (_, i) => i).every((i) => read.has(i));

export const GRID_WIDTH = 5; // TUNE: squares a row, so a 20 turn term copies as four rows

// A message box carries characters and not CSS, so the copied grid uses the nearest square to each hue.
export const GRID_SQUARES: Record<string, string> = {
  treasury: "🟩",
  authority: "🟪",
  chest: "🟨",
  loyalty: "🟦",
  popularity: "🟧",
  quiet: "⬜",
};

/** The streak changes every day, so the text is built at the moment it is copied and never stored. */
export function shareText(
  title: string,
  day: string,
  grid: { ledger: string; won?: boolean }[],
  streak: number,
): string {
  const rows: string[] = [];
  for (let i = 0; i < grid.length; i += GRID_WIDTH) {
    rows.push(
      grid
        .slice(i, i + GRID_WIDTH)
        .map((g) => GRID_SQUARES[g.ledger] ?? "⬜")
        .join(""),
    );
  }
  const last = grid.at(-1);
  if (typeof last?.won === "boolean") rows.push((last.won ? "✅" : "🟥").repeat(4));
  return [
    `United States of Jev, ${title}`,
    `Daily ${day}, streak ${streak}`,
    ...rows,
    "unitedstatesofjev.deadpackets.pw",
  ].join("\n");
}
