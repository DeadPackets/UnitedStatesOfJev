import type { Consent, Holder, HolderResponse, LedgerV4, Pack, Member as PackMember, Price, Storylet, Verb } from "./pack";
import { TEMPLATES } from "./gen/templates";
import { turnOf, type Calendar } from "./gen/calendar-math";

// Kept here because pack.ts and gen/assign.ts read it; the pack fills names, never rules.
export const TEMPERAMENTS = ["loyalist", "deal-maker", "populist", "ideologue", "institutionalist", "maverick"] as const;

export type EscalationKey = Pack["escalations"][number]["key"];
export type Condition = NonNullable<Storylet["needs"]>[number];
export type Effect = Storylet["results"][number];
export type Ending = keyof Pack["endings"];

export interface Member extends PackMember {
  memory: string[]; situation?: string;
  loyalty: number;   // 0..100; 100 own faction, 0 opposition, coalition partners from their start hostility
  mood: number;      // permanent whip modifier -1..1 from grudges and honored favors
}
export interface BillDraft { title: string; summary: string; tags: string[] }
export interface Bill extends BillDraft {
  id: number; text: string; offers: Record<string, string>; acts?: Record<string, LobbyAction>;
  whip?: Record<string, number>; filibuster?: number; blocs?: Record<string, number>;
  patrons?: Record<string, number>; constitutional?: number; vetoes?: Record<string, number>;
  amendments?: BillDraft[]; votes?: Record<string, boolean>; yes?: number; threshold?: number;
  passed?: boolean; struck?: boolean; vetoed?: boolean;
  headline?: { title: string; lede: string }; quotes?: { name: string; text: string }[];
}
export interface Event {
  id: string; turn: number; relief: boolean; stances: string[];
  card?: { title: string; body: string; stances: string[] };
  stance?: number; scores?: Record<string, number>; outcome?: string;
}
export interface TestResult {
  loyalty: number; public: number; drawnLoyalty: number; drawnPublic: number; mandate: number; won: boolean;
  seats: { id: string; p: number; yes: boolean }[];              // loyalty ascending, the walk
  regions: { id: string; weight: number; p: number; yes: boolean }[];   // region weight descending, the map
}
export interface HolderState {
  id: string; stance: number; resistance: number; line: number;
  response: HolderResponse; weight: number; warnedAt: number | null;
}
export interface Warning { holder: string; response: HolderResponse; at: number; fires: number; number: number }
export interface TermRecord { term: number; passed: number; kept: number; broken: number; mandate: number; points: number }
export interface Game {
  id: string; code: string; pack: string; faction: string; seed: number; calendar: Calendar;
  term: number; turn: number; stage: "session" | "midterm" | "campaign" | "test" | "won" | "over";
  phase: "draft" | "whip" | "over";
  ledgers: { treasury: number; authority: number; chest: number; loyalty: number; popularity: Record<string, number> };
  patrons: Record<string, number>;   // -2..2
  blocs: Record<string, number>;     // last measured approval 0..1, the Director's prerequisites read it
  holders: Record<string, HolderState>;
  warnings: Warning[];
  inForce: InForce[];
  earlyTest?: string;   // the holder that called it; the test route reads it instead of the term test
  promises: Record<string, { label: string; passed: number; state: "pending" | "kept" | "broken"; window: number; share: number; authored: boolean }>;
  members: Member[]; bills: Bill[]; posts: Post[]; events: Event[];
  director: { intensity: number; lastCrisis: number; seen: string[] };
  streak: number; bestStreak: number;
  escalations: EscalationKey[]; stageB: Partial<Record<EscalationKey, number>>;
  marks: Record<string, string[]>;   // seeded id lists: famine, meddling, midterm
  lastApprove: Record<string, number>;   // previous citizen mean per region, the 0.05 gate
  revolt: number | null;   // the turn loyalty fell under its line; the faction votes as opposition for it
  wire: WireLine[];   // this turn's lines
  pending: string | null;
  economy?: string; terms: TermRecord[]; test?: TestResult;
  midterm?: Midterm; campaign?: Campaign;
  result?: { ending: Ending; score: number };
}

// kind says what moved (planning brief ruling 7): a resistance move has no ledger, so Stage C's wire reads
// kind, never a borrowed ledger name.
export interface WireLine { kind: "ledger" | "resistance" | "promise" | "card"; ledger?: LedgerV4; id?: string | null; delta: number; cause: string }

// Spec §4. The pack may move a line; these are the defaults the generator is told to use.
export const LEDGER_LINES: Record<LedgerV4, number> = { treasury: 0, authority: 0, chest: 0, loyalty: 20, popularity: 30 };   // TUNE
export const REVOLT_WHIP = 0.15;   // TUNE, spec §4: under its line the faction votes as opposition
// Spec §4's table, as numbers. v2 paid ±5 a vote and +10 a favour, which made authority the only ledger
// that mattered; §4 prices a law at 2 and a kept promise at 3, so promises and holders carry the run.
export const LAW_PASSED = 2;         // TUNE, §4: a law passed
export const LAW_LOST = 2;           // TUNE, §4: a lost vote
export const STRUCK_DECREE = 3;      // TUNE, §4: a struck decree
export const PROMISE_AUTHORITY = 3;  // TUNE, §4: a promise kept
export const PROMISE_LOYALTY = 5;    // TUNE, §4: a promise kept
export const FAVOUR_REPAID = 1;      // TUNE, §4: a favour repaid
export const CHEST_CAP = 20;         // TUNE, §4: the patrons' payout, capped a turn

export const ledgerLine = (pack: Pack, l: LedgerV4): number => pack.constitution?.ledgers[l].line ?? LEDGER_LINES[l];

export function ledgerValue(pack: Pack, game: Game, l: LedgerV4): number {
  return l === "popularity" ? nationalPopularity(pack, game) : game.ledgers[l];
}

export function belowLine(pack: Pack, game: Game): LedgerV4[] {
  // LEDGER_LINES keeps LEDGERS_V4's order; a value import of ./pack here cycles through TEMPERAMENTS.
  return (Object.keys(LEDGER_LINES) as LedgerV4[]).filter((l) => ledgerValue(pack, game, l) <= ledgerLine(pack, l));
}

export const canAfford = (_pack: Pack, game: Game, price: Price): boolean =>
  game.ledgers.authority >= price.authority && game.ledgers.treasury >= price.treasury && game.ledgers.chest >= price.chest;

export function pay(_pack: Pack, game: Game, price: Price, cause: string): WireLine[] {
  const out: WireLine[] = [];
  for (const l of ["authority", "treasury", "chest"] as const) {
    const d = price[l];
    if (!d) continue;
    game.ledgers[l] = round1(clamp(game.ledgers[l] - d, 0, l === "authority" ? 200 : 9999));
    out.push({ kind: "ledger", ledger: l, delta: -d, cause });
  }
  return out;
}

export const TURNS_PER_TERM = 20;
export const RESIST_BYPASS = 12;   // TUNE, C2: an act a holder could have stopped
export const RESIST_HIT = 8;       // TUNE, C2: an act that costs a holder something
export const RESIST_SERVE = 10;    // TUNE, C2: a favour or a service
export const RESIST_DECAY = 1;     // TUNE, C2: a turn, toward 0
export const RESIST_CARRY = 0.5;   // TUNE, R21: what a new term inherits
export const WARN_TURNS = 2;   // TUNE, R4
export const RIOT_HIT = 8;         // TUNE, popularity in every region
export const LEVY_HIT = 10;        // TUNE, treasury
export const EMBARGO_HIT = 8;      // TUNE, treasury
export const EXCOMMUNICATE_HIT = 25;   // TUNE, loyalty
export const STRIKE_HIT = 3;       // TUNE, authority when a law is struck
export const LOBBY_COSTS = { pork: 10, favor: 15, threat: 20 } as const;
export type LobbyAction = keyof typeof LOBBY_COSTS;
export const SITUATIONS = [
  "faces a challenger for their seat this term", "is retiring at the end of this term", "just lost their largest patron",
  "their region was hit by disaster this month", "is under investigation for corruption", "wants a higher office",
  "their region's trade has collapsed", "was just given a seat on the treasury board", "leads their faction's line on this issue",
  "is feuding in public with the ruler", "owes the ruler a favor from last term", "has a brother in the opposition",
];
const INVESTIGATION = SITUATIONS[4];
// Relief cards are the relief- templates, which the deck step numbers gen-NN by template index.
const RELIEF = new Set(TEMPLATES.flatMap((t, i) => (t.id.startsWith("relief-") ? [`gen-${String(i + 1).padStart(2, "0")}`] : [])));
const WAR_TAGS = /defen[cs]e|security|war|army|navy|military|conscript/i;

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash(str: string): number {
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round1 = (x: number) => Math.round(x * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
// Votes, event draws and test draws are true random: input randomness fair, output randomness exciting.
const roll = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

const B36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const b36 = (n: number, w: number) => { let s = ""; for (let i = 0; i < w; i++) { s = B36[n % 36] + s; n = Math.floor(n / 36); } return s; };
const un36 = (s: string) => [...s].reduce((a, c) => a * 36 + B36.indexOf(c), 0);

export interface Code { scenario: string; faction: number; promises: [number, number, number]; seed: number }
// scenario6 is a hash tag, not the id: the DO and D1 hold the real scenario id.
export const scenarioTag = (id: string) => b36(hash(id) % 36 ** 6, 6);
export function encodeCode(c: Code): string {
  return `J3-${c.scenario}-${b36(c.faction, 1)}-${c.promises.map((p) => b36(p, 1)).join("")}-${b36(c.seed & 0x7fffffff, 6)}`;
}
export function decodeCode(code: string): Code {
  const m = typeof code === "string" && /^J3-([0-9A-Z]{6})-([0-9A-Z])-([0-9A-Z]{3})-([0-9A-Z]{6})$/.exec(code.trim().toUpperCase());
  if (!m) throw new Error("Bad code");
  return {
    scenario: m[1], faction: un36(m[2]), seed: un36(m[4]),
    promises: [...m[3]].map(un36) as [number, number, number],
  };
}

export const leanOf = (pack: Pack, region: string, faction: string) =>
  pack.regions.find((r) => r.id === region)?.lean.find((l) => l.id === faction)?.value ?? 0;

export function newGame(id: string, code: string, pack: Pack, faction: string, promises: string[], calendar: Calendar): Game {
  const c = decodeCode(code);
  const start = pack.starts.find((s) => s.faction === faction) ?? pack.starts[0];
  const r = rng(c.seed);
  const game: Game = {
    id, code, pack: pack.id, faction: start.faction, seed: c.seed, calendar,
    term: 1, turn: 1, stage: "session", phase: "draft",
    ledgers: {
      treasury: 0,
      authority: start.capital, chest: 0, loyalty: start.party,
      popularity: Object.fromEntries(pack.regions.map((g) => [g.id, clamp(Math.round(50 + leanOf(pack, g.id, start.faction) * 15 + (r() - 0.5) * 6), 20, 80)])),
    },
    patrons: Object.fromEntries(pack.patrons.map((p) => [p.id, 0])),
    blocs: Object.fromEntries(pack.blocs.map((b) => [b.id, 0.5])),
    holders: seedHolders(pack),
    warnings: [],
    inForce: [],
    promises: Object.fromEntries(promises.map((t) => [t, {
      label: pack.promises.find((p) => p.tag === t)?.label ?? t, passed: 0, state: "pending" as const,
      window: PROMISE_WINDOW, share: PROMISE_SHARE, authored: false,
    }])),
    members: pack.members.map((m) => ({ ...m, memory: [], loyalty: loyaltyFor(start, m.faction, start.faction), mood: 0 })),
    bills: [], posts: [], events: [], director: { intensity: 0, lastCrisis: -1, seen: [] },
    streak: 0, bestStreak: 0, escalations: [], stageB: {}, marks: {},
    lastApprove: {}, terms: [], revolt: null, wire: [], pending: null,
  };
  const shuffled = [...game.members].sort(() => r() - 0.5);
  for (const m of shuffled.slice(0, Math.max(1, Math.round(pack.chamber.size * 0.15)))) m.situation = SITUATIONS[Math.floor(r() * SITUATIONS.length)];
  game.marks.midterm = shuffled.slice(0, Math.round(pack.chamber.size / 3)).map((m) => m.seat);
  return game;
}

export const holdersOf = (pack: Pack): Holder[] => pack.constitution?.holders ?? [];
export const weightOf = (pack: Pack, id: string): number =>
  pack.constitution?.retention.weights.find((w) => w.id === id)?.value ?? 0;

export function seedHolders(pack: Pack): Record<string, HolderState> {
  return Object.fromEntries(holdersOf(pack).map((h) => [h.id, {
    id: h.id, stance: h.stance, resistance: 0, line: h.line, response: h.response,
    weight: weightOf(pack, h.id), warnedAt: null,
  }]));
}

// _pack is unread today; Stage B's price tag names the holder from it.
const moveResistance = (_pack: Pack, game: Game, ids: string[], d: number, cause: string): WireLine[] => {
  const out: WireLine[] = [];
  for (const id of ids) {
    const h = game.holders[id];
    if (!h) continue;
    const before = h.resistance;
    h.resistance = clamp(round1(h.resistance + d), 0, 100);
    if (h.resistance !== before) out.push({ kind: "resistance", id, delta: h.resistance - before, cause });
  }
  return out;
};
export const raiseResistance = (pack: Pack, game: Game, ids: string[], amount: number, cause: string) =>
  moveResistance(pack, game, ids, Math.abs(amount), cause);
export const easeResistance = (pack: Pack, game: Game, ids: string[], amount: number, cause: string) =>
  moveResistance(pack, game, ids, -Math.abs(amount), cause);

// The plate the Desk marks: the holder closest to its own line, measured as a share of it.
export function nearestLine(game: Game): string | null {
  const rows = Object.values(game.holders).filter((h) => h.line > 0);
  if (!rows.length) return null;
  return rows.sort((a, b) => b.resistance / b.line - a.resistance / a.line)[0].id;
}

// R4: a holder over its line plays a warning card with the number, and fires two turns later if still over.
export function advanceWarnings(pack: Pack, game: Game): { warned: Warning[]; fired: Warning[]; wire: WireLine[] } {
  const warned: Warning[] = [], fired: Warning[] = [], wire: WireLine[] = [];
  for (const h of Object.values(game.holders)) {
    const over = h.resistance >= h.line;
    const open = game.warnings.find((w) => w.holder === h.id);
    if (!over) {
      if (open) game.warnings = game.warnings.filter((w) => w !== open);
      h.warnedAt = null;
      continue;
    }
    if (!open) {
      const w: Warning = { holder: h.id, response: h.response, at: game.turn, fires: game.turn + WARN_TURNS, number: h.resistance };
      game.warnings.push(w);
      h.warnedAt = game.turn;
      warned.push(w);
      continue;
    }
    open.number = h.resistance;
    if (game.turn >= open.fires) {
      game.warnings = game.warnings.filter((w) => w !== open);
      h.warnedAt = null;
      fired.push(open);
      wire.push(...fireResponse(pack, game, open));
    }
  }
  return { warned, fired, wire };
}

export function fireResponse(pack: Pack, game: Game, w: Warning): WireLine[] {
  const wire: WireLine[] = [], L = game.ledgers, name = pack.constitution?.holders.find((h) => h.id === w.holder)?.name ?? w.holder;
  const drop = (l: "treasury" | "chest" | "loyalty", d: number) => {
    L[l] = round1(clamp(L[l] - d, 0, l === "loyalty" ? 100 : 9999));
    wire.push({ kind: "card", ledger: l, delta: -d, cause: name });
  };
  switch (w.response) {
    case "riot": for (const r of pack.regions) { bump(game, r.id, -RIOT_HIT); wire.push({ kind: "card", ledger: "popularity", id: r.id, delta: -RIOT_HIT, cause: name }); } break;
    case "refuse_levy": drop("treasury", LEVY_HIT); break;
    case "embargo": drop("treasury", EMBARGO_HIT); break;
    case "excommunicate": drop("loyalty", EXCOMMUNICATE_HIT); break;
    case "strike": {
      // R11: a court strikes the act the ruler just put in force, not an old one it has lived with.
      const law = game.inForce.at(-1);
      if (law) repeal(game, law.id);
      L.authority = clamp(L.authority - STRIKE_HIT, 0, 200);
      wire.push({ kind: "card", ledger: "authority", delta: -STRIKE_HIT, cause: name });
      break;
    }
    case "early_test": game.earlyTest = w.holder; game.stage = "test"; game.phase = "over"; break;
    case "coup": {
      game.stage = "over"; game.phase = "over";
      game.terms.push(termPoints(game, 0));
      game.result = { ending: "coup", score: score(game) };
      break;
    }
    case "none": break;
  }
  return wire;
}

const loyaltyFor = (start: Pack["starts"][number], faction: string, own: string) =>
  faction === own ? 100 : (start.hostile ?? []).includes(faction) ? 25 : start.coalition.includes(faction) ? 70 : 0;

export function nationalPopularity(pack: Pack, game: Game): number {
  let w = 0, sum = 0;
  for (const r of pack.regions) { w += r.weight; sum += r.weight * (game.ledgers.popularity[r.id] ?? 50); }
  return w ? sum / w : 50;
}
export const popularity = (pack: Pack, game: Game) => { const a = nationalPopularity(pack, game); return a >= 55 ? "popular" : a <= 45 ? "unpopular" : "evenly split"; };
const bump = (game: Game, region: string, d: number) => { game.ledgers.popularity[region] = clamp(round1((game.ledgers.popularity[region] ?? 50) + d), 0, 100); };

// Up to 8 lines of record, for citizen and test calls and for Luna.
export function record(pack: Pack, game: Game) {
  const p = Object.values(game.promises);
  return {
    term: game.term, [pack.vocabulary.turn]: game.turn,
    kept: p.filter((x) => x.state === "kept").map((x) => x.label),
    broken: p.filter((x) => x.state === "broken").map((x) => x.label),
    streak: game.streak, [pack.vocabulary.approval]: Math.round(nationalPopularity(pack, game)),
    headlines: game.bills.filter((b) => b.headline).slice(-3).map((b) => b.headline!.title),
    ...(game.economy ? { economy: game.economy } : {}),
  };
}

/* ---------- escalations: spec §7's twenty, each a few lines at its own hook ---------- */

export type EscalationEffects = {
  start?: (pack: Pack, game: Game) => void;
  turn?: (pack: Pack, game: Game) => void;
  verdict?: (pack: Pack, game: Game, bill: Bill) => void;
  whip?: (game: Game, m: Member) => number;
  supermajority?: (bill: Bill) => boolean;
  test?: (game: Game, regions: { id: string; p: number }[]) => void;
  lobbyCost?: number; chest?: number; struckAt?: number; leak?: number;
  windowShift?: number; dirLo?: number; dirHi?: number; noRelief?: true;
  stageB?: number;
};

const seeded = <T,>(game: Game, salt: number, xs: T[], n: number): T[] => {
  const r = rng(game.seed ^ salt);
  return [...xs].sort(() => r() - 0.5).slice(0, n);
};

export const ESCALATION_EFFECTS: Record<EscalationKey, EscalationEffects> = {
  hostile_press: { verdict: (pack, game) => { for (const r of pack.regions) bump(game, r.id, -1); } },
  supermajority_era: { supermajority: () => true },
  recession: { start: (pack, game) => { game.economy = "recession"; for (const p of pack.patrons.slice(0, 2)) game.patrons[p.id] = -1; } },
  scandal_season: { start: (_pack, game) => { for (const m of seeded(game, 0x5ca2, game.members, 4)) m.situation = INVESTIGATION; } },
  short_fuse: { dirLo: 20, dirHi: 60 },
  split_chamber: { stageB: 8 },          // runMidterm
  costly_favors: { lobbyCost: 1.5 },
  fickle_base: { windowShift: -4 },
  empty_chest: { chest: 0.5 },
  hostile_court: { struckAt: 0.5 },
  rival_surge: { stageB: 2 },            // rivalTargets spend
  apathy: { stageB: 0.8 },               // runTest turnout
  defections: { whip: (game, m) => (m.faction === game.faction ? -0.05 : 0) },
  loud_opposition: { stageB: 1.5 },      // applyPost
  crisis_fatigue: { noRelief: true },
  leaks: { leak: 0.3 },
  war_footing: {
    supermajority: (bill) => bill.tags.some((t) => WAR_TAGS.test(t)),
    turn: (_pack, game) => { game.ledgers.authority = clamp(game.ledgers.authority - 2, 0, 200); },
  },
  famine: {
    start: (pack, game) => { game.marks.famine = seeded(game, 0xfa11, pack.regions, 10).map((r) => r.id); for (const id of game.marks.famine) bump(game, id, -2); },
    turn: (_pack, game) => { for (const id of (game.marks.famine ?? []).slice(0, 3)) bump(game, id, -0.5); },
  },
  succession_crisis: { start: (_pack, game) => { game.ledgers.loyalty = 35; } },
  foreign_meddling: {
    start: (pack, game) => { game.marks.meddling = seeded(game, 0xf0e1, pack.regions, 2).map((r) => r.id); },
    test: (game, regions) => { for (const id of game.marks.meddling ?? []) { const r = regions.find((x) => x.id === id); if (r) r.p = clamp(r.p - 0.05, 0, 1); } },
  },
};

const on = (game: Game) => game.escalations.map((k) => ESCALATION_EFFECTS[k]);
const first = <K extends "lobbyCost" | "chest" | "struckAt" | "leak" | "windowShift" | "dirLo" | "dirHi">(game: Game, k: K) =>
  on(game).map((e) => e[k]).find((v) => v !== undefined);

export function applyEscalation(pack: Pack, game: Game, key: EscalationKey): void {
  const e = ESCALATION_EFFECTS[key];
  if (e.stageB !== undefined) game.stageB[key] = e.stageB;
  e.start?.(pack, game);
}

/* ---------- the floor ---------- */

export function threshold(pack: Pack, game: Game, bill: Bill): number {
  const forced = on(game).some((e) => e.supermajority?.(bill));
  const veto = Object.values(bill.vetoes ?? {}).some((v) => v >= 0.6);
  return forced || veto || (bill.filibuster ?? 0) >= 0.5 ? pack.chamber.supermajority : pack.chamber.threshold;
}

export function effectiveWhip(game: Game, bill: Bill): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of game.members) {
    let p = (bill.whip?.[m.id] ?? 0) + m.mood;
    for (const e of on(game)) p += e.whip?.(game, m) ?? 0;
    if (m.loyalty > 0 && m.loyalty < 30) p = Math.min(p, 0.15);   // a coalition partner under 30 votes as opposition
    if (game.revolt === game.turn && m.faction === game.faction) p = Math.min(p, REVOLT_WHIP);
    out[m.id] = clamp(p, 0, 1);
  }
  return out;
}
export const expectedYes = (whip: Record<string, number>) => Object.values(whip).reduce((a, b) => a + b, 0);
export const drawVotes = (whip: Record<string, number>) => Object.fromEntries(Object.keys(whip).map((id) => [id, roll() < whip[id]]));

export function applyVote(pack: Pack, game: Game, bill: Bill): void {
  const whip = effectiveWhip(game, bill);
  const th = threshold(pack, game, bill);
  const votes = drawVotes(whip);
  const yes = Object.values(votes).filter(Boolean).length;
  const passed = yes >= th;
  const struck = passed && (bill.constitutional ?? 0) >= (first(game, "struckAt") ?? 0.7);
  Object.assign(bill, { votes, yes, threshold: th, passed, struck, vetoed: Object.values(bill.vetoes ?? {}).some((v) => v >= 0.6) });

  const L = game.ledgers;
  L.authority = clamp(L.authority + (passed ? LAW_PASSED : -LAW_LOST) - (struck ? STRUCK_DECREE : 0), 0, 200);
  const own = game.members.filter((m) => m.faction === game.faction);
  const ownYes = own.filter((m) => votes[m.id]).length;
  L.loyalty = clamp(L.loyalty + (passed ? (yes - ownYes > ownYes ? -6 : 3) : -2), 0, 100);

  game.streak = passed && !struck ? game.streak + 1 : 0;
  game.bestStreak = Math.max(game.bestStreak, game.streak);
  // Jev scores opposition 0..2, so 1 is neutral for a patron and 1 - s/2 is a bloc's approval.
  for (const [id, s] of Object.entries(bill.patrons ?? {})) if (id in game.patrons) game.patrons[id] = clamp(round1(game.patrons[id] + (1 - s)), -2, 2);
  for (const [id, s] of Object.entries(bill.blocs ?? {})) if (id in game.blocs) game.blocs[id] = clamp(1 - s / 2, 0, 1);
  // §4: the patrons pay each verdict, capped a turn, so a wall of happy patrons is not an infinite chest.
  L.chest = round1(L.chest + Math.min(CHEST_CAP, Object.values(game.patrons).reduce((a, b) => a + Math.max(0, b), 0) * (first(game, "chest") ?? 1)));

  if (passed && !struck) for (const t of bill.tags) keepPromise(pack, game, t);
  for (const e of on(game)) e.verdict?.(pack, game, bill);

  for (const m of game.members) {
    const act = bill.acts?.[m.id];
    let line: string | undefined;
    if (act === "threat" && !votes[m.id]) { m.mood = clamp(m.mood - 0.15, -1, 1); line = `The ${pack.vocabulary.seat} was threatened over "${bill.title}" and still voted ${pack.vocabulary.fail}.`; }
    else if (bill.offers[m.id]) line = votes[m.id] ? `Took the offer on "${bill.title}" and voted with the government.` : `Refused the offer on "${bill.title}".`;
    else if (votes[m.id] && m.memory.includes(FAVOR_OWED)) {
      m.memory = m.memory.filter((x) => x !== FAVOR_OWED);
      L.authority = clamp(L.authority + FAVOUR_REPAID, 0, 200);
      line = `Returned the favor and voted for "${bill.title}".`;
    }
    else if (m.faction === game.faction && !votes[m.id]) line = `Broke with their own faction and voted against "${bill.title}".`;
    if (line) m.memory = [...m.memory, line].slice(-5);
  }

  game.phase = "over";
}

export interface TurnEnd { wire: WireLine[]; warned: Warning[]; fired: Warning[]; event: Event | null; pending: string | null }

export interface InForce {
  id: string; verb: Verb; title: string; term: number; turn: number;
  perTurn: { ledger: LedgerV4; id?: string | null; delta: number }[];
  repealConsent: Consent; sunset: number | null;   // turns of life, authored into the text
}

export const inForceAge = (game: Game, law: InForce) => (game.term - law.term) * TURNS_PER_TERM + (game.turn - law.turn);

export function enact(game: Game, law: Omit<InForce, "term" | "turn">): InForce {
  const row: InForce = { ...law, term: game.term, turn: game.turn };
  game.inForce.push(row);
  return row;
}

export function repeal(game: Game, id: string): boolean {
  const n = game.inForce.length;
  game.inForce = game.inForce.filter((l) => l.id !== id);
  return game.inForce.length < n;
}

// The rate sheet: every law in force collects or pays once at the boundary, and prints its own line.
export function applyRates(pack: Pack, game: Game): WireLine[] {
  const wire: WireLine[] = [];
  for (const law of [...game.inForce]) {
    if (law.sunset !== null && inForceAge(game, law) >= law.sunset) { repeal(game, law.id); continue; }
    for (const rate of law.perTurn) {
      if (rate.ledger === "popularity") {
        const regions = rate.id ? pack.regions.filter((r) => r.id === rate.id) : pack.regions;
        for (const r of regions) { bump(game, r.id, rate.delta); wire.push({ kind: "ledger", ledger: "popularity", id: r.id, delta: rate.delta, cause: law.title }); }
        continue;
      }
      const hi = rate.ledger === "authority" ? 200 : rate.ledger === "loyalty" ? 100 : 9999;
      game.ledgers[rate.ledger] = round1(clamp(game.ledgers[rate.ledger] + rate.delta, 0, hi));
      wire.push({ kind: "ledger", ledger: rate.ledger, delta: rate.delta, cause: law.title });
    }
  }
  return wire;
}

export const PROMISE_WINDOW = 12;    // TUNE, R16: turns to deliver before the decay starts
export const PROMISE_SHARE = 0.02;   // TUNE, R16: share of a region's popularity lost a turn past the window

// R16: an authored promise is any commitment the player made in their own words. Stage B's proclaim route
// and the Seat's platform sentence both land here.
export function authorPromise(game: Game, tag: string, label: string, window = PROMISE_WINDOW, share = PROMISE_SHARE): void {
  if (game.promises[tag]) return;
  game.promises[tag] = { label, passed: 0, state: "pending", window, share, authored: true };
}

// Never a cliff: past its window an undelivered promise takes a share of each region's popularity a turn.
export function decayPromises(pack: Pack, game: Game): WireLine[] {
  const shift = first(game, "windowShift") ?? 0;
  const wire: WireLine[] = [];
  for (const p of Object.values(game.promises)) {
    if (p.state === "kept") continue;
    if (game.turn < p.window + shift) continue;
    p.state = "broken";
    for (const r of pack.regions) {
      const d = -round1((game.ledgers.popularity[r.id] ?? 50) * p.share);
      if (!d) continue;
      bump(game, r.id, d);
      wire.push({ kind: "promise", ledger: "popularity", id: r.id, delta: d, cause: p.label });
    }
  }
  return wire;
}

// Spec §5.3, the whole boundary in order: rates, decay, warnings, the ledgers' lines, the Director, the
// pending item. Every act resolves at once; only this function moves the clock.
export function endTurn(pack: Pack, game: Game): TurnEnd {
  const wire: WireLine[] = [];
  game.revolt = null;
  wire.push(...applyRates(pack, game));

  for (const h of Object.values(game.holders)) h.resistance = clamp(round1(h.resistance - RESIST_DECAY), 0, 100);

  const warnings = advanceWarnings(pack, game);
  wire.push(...warnings.wire);

  // §4: under its line the faction votes as opposition for the turn about to be played, and the class doubles.
  // The revolt renews every turn loyalty stays under; the class doubles once a term, not once a turn.
  if (ledgerValue(pack, game, "loyalty") <= ledgerLine(pack, "loyalty")) {
    game.revolt = game.turn + 1;
    if (!game.marks.doubled) {
      const cls = new Set(game.marks.midterm ?? []);
      for (const m of seeded(game, 0xd0b1e, game.members.filter((x) => !cls.has(x.seat)), cls.size)) cls.add(m.seat);
      game.marks.midterm = [...cls];
      game.marks.doubled = ["1"];
    }
  }
  if (ledgerValue(pack, game, "popularity") <= ledgerLine(pack, "popularity")) {
    const caller = Object.values(game.holders).find((h) => h.response === "early_test") ?? Object.values(game.holders).find((h) => h.response === "coup");
    if (caller) caller.resistance = Math.max(caller.resistance, caller.line);
  }

  wire.push(...decayPromises(pack, game));
  for (const e of on(game)) e.turn?.(pack, game);

  const voted = game.turn;
  game.turn += 1;
  const event = game.stage === "session" || game.stage === "midterm" ? director(game, pack) : null;

  if (game.result) { game.stage = "over"; game.phase = "over"; }
  else if (game.stage === "test") game.phase = "over";
  else if (game.turn > TURNS_PER_TERM) { game.stage = "campaign"; game.phase = "over"; startCampaign(pack, game); }
  else { game.phase = "draft"; if (voted === 10) game.stage = "midterm"; }

  game.wire = wire;
  game.pending = pendingItem(game, warnings, event);
  return { wire, warned: warnings.warned, fired: warnings.fired, event, pending: game.pending };
}

// The one more turn hook: the next thing that will happen, printed at the boundary.
function pendingItem(game: Game, w: { warned: Warning[]; fired: Warning[] }, event: Event | null): string | null {
  const open = game.warnings[0];
  if (open) return `${open.holder} is at ${Math.round(open.number)} of a line of ${game.holders[open.holder]?.line ?? 0} and answers on turn ${open.fires}.`;
  if (w.fired.length) return `${w.fired[0].holder} acted on its warning.`;
  if (event) return "A card is on the desk.";
  if (game.turn === 10) return "The half of the term falls next turn.";
  if (game.turn === TURNS_PER_TERM) return "The test is next turn.";
  return null;
}

function keepPromise(pack: Pack, game: Game, tag: string) {
  const p = game.promises[tag];
  if (!p || p.state !== "pending") return;
  if (++p.passed < 2) return;
  p.state = "kept";
  game.ledgers.loyalty = clamp(game.ledgers.loyalty + PROMISE_LOYALTY, 0, 100);
  game.ledgers.authority = clamp(game.ledgers.authority + PROMISE_AUTHORITY, 0, 200);
  for (const r of pack.regions) bump(game, r.id, 4);
}

export const FAVOR_OWED = "Took a favor from the government and has not repaid it.";

export const lobbyCost = (game: Game, action: LobbyAction) => Math.round(LOBBY_COSTS[action] * (first(game, "lobbyCost") ?? 1));

export function applyLobby(pack: Pack, game: Game, bill: Bill, member: Member, action: LobbyAction): { cost: number; offer: string; leak: boolean } {
  const cost = lobbyCost(game, action);
  game.ledgers.authority = clamp(game.ledgers.authority - cost, 0, 200);
  const offer = pack.lobby[action].text;
  bill.offers[member.id] = offer;
  (bill.acts ??= {})[member.id] = action;
  if (action === "favor") member.memory = [...member.memory, FAVOR_OWED].slice(-5);
  const p = first(game, "leak");
  const leak = p !== undefined && roll() < p;
  if (leak) for (const r of pack.regions) bump(game, r.id, -2);
  return { cost, offer, leak };
}

/* ---------- citizens ---------- */

// Per-region delta from the approve Noul, applied only where the region's mean moved more than 0.05.
export function applyCitizens(pack: Pack, game: Game, approve: Record<string, number>): Record<string, number> {
  const per = new Map(pack.regions.map((r) => [r.id, { w: 0, s: 0 }]));
  const bloc = new Map(pack.blocs.map((b) => [b.id, [] as number[]]));
  for (const c of pack.citizens) {
    const a = approve[c.id];
    if (a === undefined) continue;
    const g = per.get(c.region);
    if (g) { g.w += c.weight; g.s += c.weight * a; }
    bloc.get(c.bloc)?.push(a);
  }
  const deltas: Record<string, number> = {};
  for (const r of pack.regions) {
    const g = per.get(r.id)!;
    if (!g.w) continue;
    const m = g.s / g.w;
    const prior = game.lastApprove[r.id];
    game.lastApprove[r.id] = m;
    if (prior !== undefined && Math.abs(m - prior) <= 0.05) continue;
    const d = round1(clamp((m - 0.5) * 10, -6, 6));
    deltas[r.id] = d;
    bump(game, r.id, d);
  }
  for (const [id, xs] of bloc) if (xs.length) game.blocs[id] = round1(mean(xs));
  return deltas;
}

/* ---------- the feed ---------- */

export type Reaction = "like" | "boo" | "share" | "ignore";
export interface Post {
  turn: number; text: string;
  likes: number; boos: number; shares: number; ignores: number;
  regions: Record<string, number>;                 // approval delta applied, per region
  hot: string[];                                   // regions where shares led
  replies: { name: string; text: string }[];
  rival: string;
  agree: { mine: number; rival: number };
  won: boolean;
}

export const feedMemory = (region: string, reaction: string) => `Constituents in ${region} were loud about the government's last notice: mostly ${reaction}.`;

// v2 §12 counts one region's own citizens, so the denominator is that region's sample, not the 250.
export function applyPost(pack: Pack, game: Game, turn: number, text: string,
  reactions: Record<string, Reaction>, said: { replies: { name: string; text: string }[]; rival: string },
  agree: Record<string, "government" | "rival">): Post {
  const loud = game.stageB.loud_opposition ?? 1;
  const tally = { like: 0, boo: 0, share: 0, ignore: 0 };
  const per = new Map(pack.regions.map((r) => [r.id, { like: 0, boo: 0, share: 0, ignore: 0, n: 0 }]));
  for (const c of pack.citizens) {
    const r = reactions[c.id];
    if (!r) continue;
    tally[r] += 1;
    const g = per.get(c.region);
    if (g) { g[r] += 1; g.n += 1; }
  }
  const regions: Record<string, number> = {}, hot: string[] = [];
  for (const r of pack.regions) {
    const g = per.get(r.id)!;
    if (!g.n) continue;
    const d = round1(clamp(((g.like + 2 * g.share - 2 * g.boo * loud) / g.n) * 2, -6, 6));
    regions[r.id] = d;
    if (d !== 0) bump(game, r.id, d);
    if (g.share > g.like && g.share > g.boo) {
      hot.push(r.id);
      const line = feedMemory(r.name, g.share > g.boo ? "passing it on" : "booing");
      for (const m of game.members) if (m.region === r.id) m.memory = [...m.memory, line].slice(-5);
    }
  }
  const votes = Object.values(agree);
  const mine = votes.filter((v) => v === "government").length;
  const post: Post = {
    turn, text, likes: tally.like, boos: tally.boo, shares: tally.share, ignores: tally.ignore,
    regions, hot, replies: said.replies.slice(0, 3), rival: said.rival,
    agree: { mine, rival: votes.length - mine }, won: mine >= votes.length - mine,
  };
  game.posts.push(post);
  return post;
}

/* ---------- the midterm ---------- */

export interface MidtermDraw {
  up: { seat: string; memberId: string; faction: string; p: number }[];
  forced: string[];                                // seat ids split_chamber took before any draw
  lost: { seat: string; memberId: string; from: string; to: string }[];
  lostOwn: number;
  wipeout: boolean;
}
export interface Replacement {
  id: string; seat: string; region: string; faction: string;
  temperament: (typeof TEMPERAMENTS)[number]; years: "new" | "mid" | "long";
  flags: Member["flags"]; patrons: string[];
}
export interface Persona { id: string; name: string; bio: string; tell: string; core_issues: string[] }
export interface Midterm { up: string[]; lost: MidtermDraw["lost"]; lostOwn: number; wipeout: boolean; headline?: { title: string; lede: string } }

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
// A partner is on the government's side only where neither start calls the other hostile.
const ownSide = (pack: Pack, game: Game, faction: string) => {
  if (faction === game.faction) return true;
  const start = pack.starts.find((s) => s.faction === game.faction);
  const theirs = pack.starts.find((s) => s.faction === faction);
  return (start?.coalition ?? []).includes(faction) && !(start?.hostile ?? []).includes(faction)
    && !(theirs?.hostile ?? []).includes(game.faction);
};

export const midtermUp = (game: Game): Member[] =>
  game.members.filter((m) => (game.marks.midterm ?? []).includes(m.seat));

export function regionIntent(pack: Pack, intent: Record<string, number>): Record<string, number> {
  const per = new Map(pack.regions.map((r) => [r.id, { w: 0, s: 0 }]));
  for (const c of pack.citizens) {
    const g = per.get(c.region);
    if (g && intent[c.id] !== undefined) { g.w += c.weight; g.s += c.weight * intent[c.id]; }
  }
  return Object.fromEntries(pack.regions.map((r) => { const g = per.get(r.id)!; return [r.id, g.w ? g.s / g.w : 0.5]; }));
}

// v2 §7: half the seat's fate is the region's approval, half is its citizens' intent. The odds flip for a
// seat the government does not hold.
export function holdP(pack: Pack, game: Game, m: Member, byRegion: Record<string, number>): number {
  const base = 0.5 * sigmoid(((game.ledgers.popularity[m.region] ?? 50) - 50) / 8) + 0.5 * (byRegion[m.region] ?? 0.5);
  return clamp(ownSide(pack, game, m.faction) ? base : 1 - base, 0, 1);
}

const seatShareOf = (game: Game, faction: string) => game.members.filter((m) => m.faction === faction).length;

// The seat goes to the faction the region leans to most, the loser excluded: code picks it, not a model.
// A forced seat must leave the government: only a faction outside ownSide can take it, largest caucus first.
const winnerOf = (pack: Pack, game: Game, region: string, loser: string, excludeOwnSide: boolean): string | undefined => {
  const pool = [...pack.factions].filter((f) => f.id !== loser && (!excludeOwnSide || !ownSide(pack, game, f.id)));
  if (!pool.length) return undefined;
  return excludeOwnSide
    ? pool.sort((a, b) => seatShareOf(game, b.id) - seatShareOf(game, a.id))[0].id
    : pool.sort((a, b) => leanOf(pack, region, b.id) - leanOf(pack, region, a.id))[0].id;
};

export function runMidterm(pack: Pack, game: Game, intent: Record<string, number>): MidtermDraw {
  const byRegion = regionIntent(pack, intent);
  const cls = midtermUp(game);
  const up = cls.map((m) => ({ seat: m.seat, memberId: m.id, faction: m.faction, p: Math.round(holdP(pack, game, m, byRegion) * 100) / 100 }));
  const n = game.stageB.split_chamber ?? 0;
  const forcedTo = new Map<string, string>();
  for (const m of seeded(game, 0x5b1e, cls.filter((m) => ownSide(pack, game, m.faction)), n)) {
    const to = winnerOf(pack, game, m.region, m.faction, true);
    if (to) forcedTo.set(m.seat, to);
  }
  const lost: MidtermDraw["lost"] = [];
  for (const m of cls) {
    const forced = forcedTo.get(m.seat);
    if (forced) { lost.push({ seat: m.seat, memberId: m.id, from: m.faction, to: forced }); continue; }
    const held = roll() < holdP(pack, game, m, byRegion);
    if (!held) lost.push({ seat: m.seat, memberId: m.id, from: m.faction, to: winnerOf(pack, game, m.region, m.faction, false)! });
  }
  const lostOwn = lost.filter((l) => ownSide(pack, game, l.from) && !ownSide(pack, game, l.to)).length;
  return { up, forced: [...forcedTo.keys()], lost, lostOwn, wipeout: lostOwn * 5 >= cls.length * 2 && cls.length > 0 };
}

// Identity is code's: the seat, the region, the winning faction, a cycled temperament, the seat's own flags.
export function replacements(_pack: Pack, game: Game, draw: MidtermDraw): Replacement[] {
  return draw.lost.map((l, i) => {
    const old = game.members.find((m) => m.seat === l.seat)!;
    return {
      // The game id is in the member id because the portrait is written under the scenario's R2 prefix and
      // served immutable: two games of one scenario would otherwise overwrite each other's faces.
      id: `r${hash(game.id).toString(36)}-${game.term}-${l.seat}`, seat: l.seat, region: old.region, faction: l.to,
      temperament: TEMPERAMENTS[(hash(l.seat) + i) % TEMPERAMENTS.length],
      years: "new" as const, flags: old.flags, patrons: [],
    };
  });
}

export function applyMidterm(pack: Pack, game: Game, draw: MidtermDraw, personas: Persona[]): void {
  const start = pack.starts.find((s) => s.faction === game.faction) ?? pack.starts[0];
  const by = new Map(personas.map((p) => [p.id, p]));
  for (const slot of replacements(pack, game, draw)) {
    const p = by.get(slot.id);
    const i = game.members.findIndex((m) => m.seat === slot.seat);
    if (i < 0) continue;
    const core = (p?.core_issues ?? []).filter((t) => pack.tags.includes(t));
    game.members[i] = {
      id: slot.id, seat: slot.seat, region: slot.region, faction: slot.faction,
      name: p?.name ?? slot.id, bio: p?.bio ?? "", tell: p?.tell ?? "",
      core_issues: core.length ? core : [pack.tags[0]], temperament: slot.temperament,
      patrons: slot.patrons, years: slot.years, flags: slot.flags, portrait: `members/${slot.id}.png`,
      memory: [], loyalty: loyaltyFor(start, slot.faction, game.faction), mood: 0,
    };
  }
  game.midterm = { up: draw.up.map((u) => u.seat), lost: draw.lost, lostOwn: draw.lostOwn, wipeout: draw.wipeout };
  if (draw.wipeout) {
    game.stage = "over"; game.phase = "over";
    game.terms.push(termPoints(game, 0));
    game.result = { ending: "lame_duck", score: score(game) };
  } else {
    game.stage = "session";
  }
}

/* ---------- the campaign ---------- */

export const CAMPAIGN_TURNS = 4;
export const SPEND_STEPS = [0, 5, 10] as const;
export const RIVAL_SPEND = 5;                      // per targeted region per campaign turn
export const SPEND_LIFT: Record<number, number> = { 0: 0, 5: 0.02, 10: 0.04 };
export const FAVOR_LIFT = 0.3;                     // modelled confidence lift on one seat

export type Lever = { kind: "spend"; regions: { id: string; amount: number }[] } | { kind: "favor"; memberId: string };
export interface CampaignTurn {
  n: number; message: string; lever: Lever; cost: { chest: number; capital: number };
  intent: Record<string, number>; public: number; band: [number, number]; regions: { id: string; p: number }[]; rival: string[];
}
export interface Campaign { drafts: string[]; messages: string[]; turns: CampaignTurn[]; rival: string[]; intent: Record<string, number> }

export function startCampaign(pack: Pack, game: Game): void {
  const intent = Object.fromEntries(pack.regions.map((r) => [r.id, clamp((game.ledgers.popularity[r.id] ?? 50) / 100, 0, 1)]));
  game.campaign = { drafts: [], messages: [], turns: [], rival: rivalTargets(pack, game, intent), intent };
}

// The rival goes where the government is weakest but not yet lost: two regions, its own money, every turn.
export function rivalTargets(pack: Pack, _game: Game, byRegion: Record<string, number>): string[] {
  const live = pack.regions.filter((r) => (byRegion[r.id] ?? 0.5) >= 0.35);
  const pool = live.length >= 2 ? live : pack.regions;
  return [...pool].sort((a, b) => (byRegion[a.id] ?? 0.5) - (byRegion[b.id] ?? 0.5)).slice(0, 2).map((r) => r.id);
}

export function leverCost(game: Game, lever: Lever): { chest: number; capital: number } {
  return lever.kind === "spend"
    ? { chest: lever.regions.reduce((a, r) => a + r.amount, 0), capital: 0 }
    : { chest: 0, capital: lobbyCost(game, "favor") };
}

// What the UI shows: alpha x the public move, or (1 - alpha) x the chamber move. Code's estimate, not Jev's.
export function leverGain(pack: Pack, lever: Lever): number {
  const a = pack.chamber.alpha;
  if (lever.kind === "spend") {
    return a * lever.regions.reduce((s, r) => s + (pack.regions.find((x) => x.id === r.id)?.weight ?? 0) * (SPEND_LIFT[r.amount] ?? 0), 0);
  }
  return (1 - a) * (FAVOR_LIFT / pack.chamber.size);
}

// A band, not a point: the standard error of the *measured intent*, not of a single Bernoulli draw per region.
// Each region's own sample size (its citizen count) shrinks its contribution to the error.
export function forecast(pack: Pack, byRegion: Record<string, number>): { public: number; band: [number, number]; regions: { id: string; p: number }[] } {
  const w = pack.regions.reduce((a, r) => a + r.weight, 0) || 1;
  const pub = pack.regions.reduce((a, r) => a + r.weight * (byRegion[r.id] ?? 0.5), 0) / w;
  const n = new Map<string, number>();
  for (const c of pack.citizens) n.set(c.region, (n.get(c.region) ?? 0) + 1);
  const varr = pack.regions.reduce((a, r) => {
    const p = byRegion[r.id] ?? 0.5;
    return a + (r.weight / w) ** 2 * p * (1 - p) / (n.get(r.id) || 1);
  }, 0);
  const se = Math.sqrt(varr);
  const regions = pack.regions.map((r) => ({ id: r.id, p: sigmoid(((byRegion[r.id] ?? 0.5) - 0.5) * 12) }));
  return { public: pub, band: [clamp(pub - 1.96 * se, 0, 1), clamp(pub + 1.96 * se, 0, 1)], regions };
}

export function applyCampaign(pack: Pack, game: Game, message: string, lever: Lever, intent: Record<string, number>): CampaignTurn {
  const c = game.campaign!;
  const cost = leverCost(game, lever);
  game.ledgers.chest = round1(clamp(game.ledgers.chest - cost.chest, 0, 9999));
  game.ledgers.authority = clamp(game.ledgers.authority - cost.capital, 0, 200);
  if (lever.kind === "favor") {
    const m = game.members.find((x) => x.id === lever.memberId);
    if (m) {
      m.loyalty = clamp(m.loyalty + 10, 0, 100);
      m.mood = clamp(round1(m.mood + 0.1), -1, 1);
      m.memory = [...m.memory, "The government promised them support before the vote at the end of the term."].slice(-5);
    }
  }
  const byRegion = regionIntent(pack, intent);
  // Jev already prices rival_spend_here in the vote intent (multiplied by rival_surge); don't drag it again here.
  const rival = rivalTargets(pack, game, byRegion);
  const f = forecast(pack, byRegion);
  c.messages.push(message);
  c.intent = byRegion;
  c.rival = rival;
  const turn: CampaignTurn = { n: c.turns.length + 1, message, lever, cost, intent: byRegion, public: Math.round(f.public * 1000) / 1000, band: f.band, regions: f.regions, rival };
  c.turns.push(turn);
  c.drafts = [];
  if (c.turns.length >= CAMPAIGN_TURNS) { game.stage = "test"; game.phase = "over"; }
  return turn;
}

/* ---------- the Director ---------- */

// The keys are the storylet effect targets (pack.ts LEDGERS), which no stored deck can rename.
const VALUE: Record<Condition["ledger"], (pack: Pack, game: Game, id?: string | null) => number> = {
  approval: (pack, game) => nationalPopularity(pack, game),
  capital: (_p, game) => game.ledgers.authority,
  party: (_p, game) => game.ledgers.loyalty,
  chest: (_p, game) => game.ledgers.chest,
  bloc: (_p, game, id) => game.blocs[id ?? ""] ?? 0.5,
  patron: (_p, game, id) => game.patrons[id ?? ""] ?? 0,
  streak: (_p, game) => game.streak,
  turn: (_p, game) => game.turn,
};
const NEAR: Partial<Record<Condition["ledger"], number>> = { bloc: 0.05, patron: 0.5 };
const val = (pack: Pack, game: Game, c: Condition) => VALUE[c.ledger](pack, game, c.id);
export const meets = (pack: Pack, game: Game, c: Condition) => (c.op === "<" ? val(pack, game, c) < c.value : val(pack, game, c) > c.value);
const near = (pack: Pack, game: Game, c: Condition) => meets(pack, game, c) && Math.abs(val(pack, game, c) - c.value) <= (NEAR[c.ledger] ?? 5);

const turnFor = (game: Game, s: Storylet) => turnOf(s.date, game.calendar.start_date, game.calendar.unit) ?? s.turn ?? null;
const dueAt = (game: Game, s: Storylet, late: number) => {
  const t = turnFor(game, s);
  return t !== null && t <= game.turn && game.turn - t <= late;
};

function pick(pack: Pack, game: Game, pool: Storylet[]): Storylet | null {
  const weights = pool.map((s) => s.weight * ((s.needs ?? []).some((c) => near(pack, game, c)) ? 2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let x = roll() * total;
  for (let i = 0; i < pool.length; i++) if ((x -= weights[i]) < 0) return pool[i];
  return pool[pool.length - 1];
}

// Runs after every verdict. Returns the card drawn, already pushed onto game.events.
export function director(game: Game, pack: Pack): Event | null {
  const d = game.director;
  const last = game.bills.at(-1);
  const crisisLast = game.events.some((e) => e.turn === game.turn - 1);
  d.intensity = clamp(d.intensity + (last && !last.passed ? 25 : -10) + (crisisLast ? 20 : 0) + (game.streak >= 3 ? 10 : 0), 0, 100);
  if (game.stage !== "session" && game.stage !== "midterm") return null;

  const lo = first(game, "dirLo") ?? 30, hi = first(game, "dirHi") ?? 70;
  const gap = game.turn - d.lastCrisis;
  const clear = gap >= 2 || game.turn >= 17;

  // A flood or a comet lands on its turn whatever else happened; a conditional dated card waits for a clear
  // turn like any crisis, up to two turns late, then drops.
  // `seen` carries across terms, so a dated card that fired in term 1 does not fire again on the same
  // calendar date of term 2. One turn late is the slack that lets a second card due the same turn still fire,
  // and that lets a card dated turn 1 fire at all: the Director first runs after the turn-1 vote.
  const pending = pack.deck.filter((s) => s.kind === "dated" && !game.director.seen.includes(s.id));
  const exo = pending.find((s) => s.exogenous && dueAt(game, s, 1));
  if (exo) return fire(game, exo, false);
  if (clear) {
    const due = pending.find((s) => !s.exogenous && dueAt(game, s, 2) && (s.needs ?? []).every((c) => meets(pack, game, c)));
    if (due) return fire(game, due, false);
  }

  const forced = game.turn >= 17 && game.turn <= TURNS_PER_TERM && d.lastCrisis < 16;
  // Measured over 200 dry-run terms: with v2's -15 relief drop, intensity pins near 90 and a term gets 2.3
  // crises, not 4 to 7. Relief drops 40, and a relief that does not fire still rolls the ordinary crisis.
  let crisis = false, relief = false;
  if (forced) crisis = true;
  else if (!clear) crisis = false;                                 // never two in a row before turn 17
  else if (d.intensity < lo) crisis = roll() < 0.7;
  else if (d.intensity > hi) { relief = !on(game).some((e) => e.noRelief) && roll() < 0.6; crisis = !relief && roll() < 0.25; }
  else crisis = roll() < 0.25;
  if (!crisis && !relief) return null;

  const recent = new Set(game.events.filter((e) => game.turn - e.turn < 6).map((e) => e.id));
  const pool = pack.deck.filter((s) => s.kind === "generic" && RELIEF.has(s.id) === relief && !recent.has(s.id)
    && (s.needs ?? []).every((c) => meets(pack, game, c)));
  const card = pick(pack, game, pool);
  return card ? fire(game, card, relief) : null;
}

function fire(game: Game, s: Storylet, relief: boolean): Event {
  const e: Event = { id: s.id, turn: game.turn, relief, stances: s.stances };
  game.events.push(e);
  if (relief) game.director.intensity = clamp(game.director.intensity - 40, 0, 100);
  else game.director.lastCrisis = game.turn;
  if (!game.director.seen.includes(s.id)) game.director.seen.push(s.id);
  return e;
}

// Stance choice moves the world through the blocs and patrons Jev scored on it; the template's results are fixed.
export function resolveEvent(pack: Pack, game: Game, event: Event, stance: number, scores?: Record<string, number>): void {
  event.stance = stance;
  if (scores) {
    event.scores = scores;
    for (const [id, s] of Object.entries(scores)) {
      if (id in game.patrons) game.patrons[id] = clamp(round1(game.patrons[id] + (1 - s)), -2, 2);
      if (id in game.blocs) game.blocs[id] = clamp(1 - s / 2, 0, 1);
    }
  }
  const card = pack.deck.find((s) => s.id === event.id);
  for (const e of card?.results ?? []) applyEffect(pack, game, e, card?.memory);
}

const SEAT_MARK: Record<string, { mood: number; loyalty: number }> = {
  hostile: { mood: -0.2, loyalty: -40 }, favor: { mood: 0.3, loyalty: 10 },
  courted: { mood: 0.2, loyalty: 10 }, "kept-word": { mood: 0.05, loyalty: 10 },
};
function applyEffect(pack: Pack, game: Game, e: Effect, memory?: string | null) {
  if (e.chance != null && roll() >= e.chance) return;
  // The deck prompt asks for -15..15; a stored pack that ignored it may not zero a ledger from one card.
  const d = clamp(e.delta ?? 0, -15, 15), L = game.ledgers;
  switch (e.ledger) {
    case "approval": for (const r of pack.regions) bump(game, r.id, d); break;
    case "capital": L.authority = clamp(L.authority + d, 0, 200); break;
    case "party": L.loyalty = clamp(L.loyalty + d, 0, 100); break;
    case "chest": L.chest = clamp(round1(L.chest + d), 0, 9999); break;
    case "bloc": if (e.id && e.id in game.blocs) game.blocs[e.id] = clamp(game.blocs[e.id] + d, 0, 1); break;
    case "patron": if (e.id && e.id in game.patrons) game.patrons[e.id] = clamp(game.patrons[e.id] + d, -2, 2); break;
    case "streak": game.streak = Math.max(0, game.streak + d); game.bestStreak = Math.max(game.bestStreak, game.streak); break;
    case "turn": break;   // the deck may not move the clock
    case "seat": {
      const mark = SEAT_MARK[e.set ?? ""];
      if (!mark) break;
      const pool = e.set === "courted" ? game.members.filter((m) => m.faction !== game.faction) : game.members;
      const m = pool[Math.floor(roll() * pool.length)];
      if (!m) break;
      m.mood = clamp(round1(m.mood + mark.mood), -1, 1);
      m.loyalty = clamp(m.loyalty + mark.loyalty, 0, 100);
      if (memory) m.memory = [...m.memory, memory].slice(-5);
      break;
    }
  }
}

/* ---------- the test, endings, score ---------- */

export interface TestAnswers { loyalty: Record<string, number>; intent: Record<string, number> }

// The pack names no base bloc, so the player's base is the groups that approve of them most at term end.
export const baseBlocs = (game: Game, n = 2): string[] =>
  Object.entries(game.blocs).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);

// Both halves are always drawn, one draw per seat and per region, so the tally is the drawn count, not the
// mean. pack.test.reveal only decides which half the UI walks.
export function runTest(pack: Pack, game: Game, answers: TestAnswers): TestResult {
  const seats = game.members.map((m) => ({ id: m.id, p: clamp(answers.loyalty[m.id] ?? 0, 0, 1) })).sort((a, b) => a.p - b.p);
  const per = new Map(pack.regions.map((r) => [r.id, { w: 0, s: 0 }]));
  const apathy = game.stageB.apathy;
  const thin = new Set(apathy ? baseBlocs(game) : []);
  for (const c of pack.citizens) {
    const g = per.get(c.region);
    if (!g) continue;
    const w = c.weight * (thin.has(c.bloc) ? apathy! : 1);
    g.w += w; g.s += w * (answers.intent[c.id] ?? 0);
  }
  const regions = pack.regions
    .map((r) => { const g = per.get(r.id)!; return { id: r.id, weight: r.weight, p: g.w ? clamp(g.s / g.w, 0, 1) : 0.5 }; })
    .sort((a, b) => b.weight - a.weight);
  for (const e of on(game)) e.test?.(game, regions);

  const wsum = regions.reduce((a, r) => a + r.weight, 0) || 1;
  const loyalty = mean(seats.map((s) => s.p));
  const pub = regions.reduce((a, r) => a + r.weight * r.p, 0) / wsum;
  const drawnSeats = seats.map((s) => ({ ...s, yes: roll() < s.p }));
  const drawnRegions = regions.map((r) => ({ ...r, yes: roll() < r.p }));
  const drawnLoyalty = drawnSeats.filter((s) => s.yes).length / (drawnSeats.length || 1);
  const drawnPublic = drawnRegions.reduce((a, r) => a + (r.yes ? r.weight : 0), 0) / wsum;
  const a = pack.chamber.alpha;
  const mandate = a * drawnPublic + (1 - a) * drawnLoyalty;
  return { loyalty, public: pub, drawnLoyalty, drawnPublic, mandate, won: mandate >= 0.5, seats: drawnSeats, regions: drawnRegions };
}

// The only end a turn can reach on its own is a coup; every other stop is a holder's response or the test.
export function ending(_pack: Pack, game: Game): Ending | null {
  return game.result?.ending === "coup" ? "coup" : null;
}

// EV ÷ 2 in v2 becomes mandate × 100: a lost term still scores its bills and promises.
export function termPoints(game: Game, mandate: number): TermRecord {
  const p = Object.values(game.promises);
  const passed = game.bills.filter((b) => b.passed && !b.struck).length;
  const kept = p.filter((x) => x.state === "kept").length, broken = p.filter((x) => x.state === "broken").length;
  const points = passed * 10 + kept * 25 - broken * 15 + Math.round(mandate * 100) + Math.round(game.ledgers.authority / 4) + game.bestStreak * 5;
  return { term: game.term, passed, kept, broken, mandate, points };
}
export const score = (game: Game) => Math.round(game.terms.reduce((a, t) => a + t.points * 1.5 ** (t.term - 1), 0));

export function endTerm(pack: Pack, game: Game, test: TestResult): void {
  game.test = test;
  game.terms.push(termPoints(game, test.mandate));
  game.stage = test.won ? "won" : "over";
  game.phase = "over";
  game.result = { ending: test.won ? "reelected" : (ending(pack, game) ?? "defeated"), score: score(game) };
}

export const remainingEscalations = (pack: Pack, game: Game): EscalationKey[] =>
  pack.escalations.map((e) => e.key).filter((k) => !game.escalations.includes(k));

// Members, memory, ledgers and director.seen carry over; two more escalations stack.
export function continueTerm(pack: Pack, game: Game): void {
  game.term += 1; game.turn = 1; game.stage = "session"; game.phase = "draft";
  game.inForce = game.inForce.filter((l) => l.sunset === null || inForceAge(game, l) < l.sunset);
  game.bills = []; game.posts = []; game.events = []; game.streak = 0; game.bestStreak = 0;
  game.director.intensity = 0; game.director.lastCrisis = -1;
  game.test = undefined; game.campaign = undefined; game.midterm = undefined; game.result = undefined;
  for (const p of Object.values(game.promises)) { p.passed = 0; p.state = "pending"; }
  const add = remainingEscalations(pack, game).slice(0, 2);
  game.escalations.push(...add);
  for (const k of add) applyEscalation(pack, game, k);
  if (!add.length) for (const r of pack.regions) bump(game, r.id, -2);
}
