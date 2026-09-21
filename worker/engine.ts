import { STATES, STATE_IDS } from "./states";

export type Party = "D" | "R";
export type Mode = "term" | "sandbox" | "agenda";
export interface Settings { v: 1; party: Party; seats: number; mode: Mode; pop: -1 | 0 | 1; lobby: boolean; amend: boolean; agenda: number; seed: number }
export interface RosterSenator { id: string; seat: string; state: string; party: Party; name: string; bio: string; core_issues: string[]; temperament: string; tell: string; donors: string[]; years_in_office: "new" | "mid" | "long" }
export interface Senator extends RosterSenator { situation?: string; memory: string[] }
export interface BillDraft { title: string; summary: string; tags: string[] }
export interface Bill extends BillDraft {
  id: number; text: string; offers: Record<string, string>;
  whip?: Record<string, number>; filibuster?: number; blocs?: Record<string, number>; constitutional?: number;
  amendments?: BillDraft[]; votes?: Record<string, boolean>; passed?: boolean; struck?: boolean; headline?: { title: string; lede: string };
}
export interface Game {
  id: string; code: string; settings: Settings; turn: number; capital: number;
  approval: Record<string, number>; seated: Senator[]; bills: Bill[]; phase: "draft" | "whip" | "over";
  result?: { reelected: boolean; score: number };
}

export const TAGS = ["taxes", "spending", "healthcare", "guns", "immigration", "energy", "climate", "farming", "defense", "veterans", "education", "labor", "tech", "trade", "housing", "crime", "courts", "elections", "infrastructure", "civil-rights"] as const;
export const TEMPERAMENTS = ["loyalist", "deal-maker", "populist", "ideologue", "institutionalist", "maverick"] as const;
export const DONORS = ["oil and gas", "banks", "unions", "tech", "farm lobby", "hospitals", "defense contractors", "real estate", "teachers", "small business"] as const;
export const BLOCS = ["business", "labor", "seniors", "youth", "rural"] as const;
export const SITUATIONS = [
  "up for re-election this year", "facing a primary challenger from their party's base", "retiring after this term",
  "just lost their largest donor", "home state hit by a major disaster this month", "under an ethics investigation",
  "eyeing a run for governor", "home-state unemployment is rising fast", "recently switched committee to appropriations",
  "leading their party's messaging on this issue", "publicly feuding with the President", "owes the President a favor from last session",
];
export const LOBBY = {
  pork: { cost: 10, label: "Promise a project", text: (s: Senator) => `The President promises a $200 million federal project in ${STATES[s.state].name}.` },
  favor: { cost: 15, label: "Trade a favor", text: (s: Senator) => `The President offers to back the senator's own ${s.core_issues[0]} bill next session.` },
  threat: { cost: 20, label: "Threaten a primary", text: () => `The President threatens to back a primary challenger against the senator.` },
} as const;
export type LobbyAction = keyof typeof LOBBY;
export const BILLS_PER_TERM: Record<Mode, number> = { term: 40, sandbox: Infinity, agenda: 10 };

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function encodeCode(s: Settings): string {
  const mode = { term: "T", sandbox: "S", agenda: "A" }[s.mode];
  const pop = { "-1": "U", "0": "E", "1": "P" }[String(s.pop) as "-1" | "0" | "1"];
  let seed = "", n = s.seed >>> 0;
  for (let i = 0; i < 6; i++) { seed = B32[n & 31] + seed; n >>>= 5; }
  return `J1-${s.party}${String(s.seats).padStart(2, "0")}${mode}${pop}${s.lobby ? "L" : "-"}${s.amend ? "A" : "-"}${s.mode === "agenda" ? s.agenda : "X"}-${seed}`;
}
export function decodeCode(code: string): Settings {
  const m = /^J1-([DR])(\d\d)([TSA])([UEP])([L-])([A-])([0-9X])-([0-9A-HJKMNP-TV-Z]{6})$/i.exec(code.trim().toUpperCase());
  if (!m) throw new Error("Bad code");
  const seats = Number(m[2]);
  if (seats < 40 || seats > 60) throw new Error("Seats must be 40 to 60");
  let seed = 0; for (const ch of m[8]) seed = (seed * 32 + B32.indexOf(ch)) >>> 0;
  return {
    v: 1, party: m[1] as Party, seats, mode: ({ T: "term", S: "sandbox", A: "agenda" } as const)[m[3] as "T" | "S" | "A"],
    pop: ({ U: -1, E: 0, P: 1 } as const)[m[4] as "U" | "E" | "P"], lobby: m[5] === "L", amend: m[6] === "A",
    agenda: m[7] === "X" ? 0 : Number(m[7]), seed,
  };
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash(str: string): number {
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const leanToward = (state: string, party: Party) => STATES[state].lean * (party === "R" ? 1 : -1);

export function seatChamber(roster: RosterSenator[], s: Settings): Senator[] {
  const r = rng(s.seed);
  const seats = [...new Set(roster.map((x) => x.seat))];
  const score = new Map(seats.map((seat) => [seat, leanToward(seat.slice(0, 2), s.party) + (r() - 0.5) * 6]));
  const ranked = [...seats].sort((a, b) => score.get(b)! - score.get(a)!);
  const other: Party = s.party === "D" ? "R" : "D";
  const seated = seats.map((seat) => {
    const party = ranked.indexOf(seat) < s.seats ? s.party : other;
    const base = roster.find((x) => x.seat === seat && x.party === party)!;
    return { ...base, memory: [] as string[] } as Senator;
  });
  const shuffled = [...seated].sort(() => r() - 0.5);
  shuffled.slice(0, 15).forEach((sen, i) => { sen.situation = SITUATIONS[Math.floor(r() * SITUATIONS.length)] ?? SITUATIONS[i % SITUATIONS.length]; });
  return seated;
}

export function startApproval(s: Settings): Record<string, number> {
  const r = rng(s.seed ^ 0x9e3779b9);
  return Object.fromEntries(STATE_IDS.map((id) => [id, clamp(Math.round(50 + leanToward(id, s.party) * 0.5 + s.pop * 8 + (r() - 0.5) * 6), 20, 80)]));
}

export function newGame(id: string, code: string, roster: RosterSenator[]): Game {
  const settings = decodeCode(code);
  return { id, code, settings, turn: 0, capital: 100, approval: startApproval(settings), seated: seatChamber(roster, settings), bills: [], phase: "draft" };
}

export const expectedYes = (whip: Record<string, number>) => Object.values(whip).reduce((a, b) => a + b, 0);
export const passThreshold = (bill: Bill) => ((bill.filibuster ?? 0) >= 0.5 ? 60 : 51);
export const popularity = (game: Game) => { const a = nationalApproval(game); return a >= 55 ? "popular" : a <= 45 ? "unpopular" : "evenly split"; };
export function nationalApproval(game: Game): number {
  let ev = 0, sum = 0;
  for (const id of STATE_IDS) { ev += STATES[id].ev; sum += STATES[id].ev * game.approval[id]; }
  return sum / ev;
}

export function drawVotes(whip: Record<string, number>, seed: number, billId: number): Record<string, boolean> {
  const r = rng((seed ^ Math.imul(billId + 1, 0x9e3779b1)) >>> 0);
  return Object.fromEntries(Object.keys(whip).sort().map((id) => [id, r() < whip[id]]));
}

export function applyVote(game: Game, bill: Bill): void {
  const votes = drawVotes(bill.whip!, game.settings.seed, bill.id);
  const yes = Object.values(votes).filter(Boolean).length;
  const passed = yes >= passThreshold(bill);
  const struck = passed && (bill.constitutional ?? 0) >= 0.7;
  Object.assign(bill, { votes, passed, struck });
  const outraged = Object.values(bill.blocs ?? {}).filter((s) => s >= 1.5).length;
  for (const id of STATE_IDS) {
    const ps = game.seated.filter((s) => s.state === id).map((s) => bill.whip![s.id]);
    const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
    const delta = passed ? (struck ? 0 : (mean - 0.5) * 10) : -2;
    game.approval[id] = clamp(Math.round((game.approval[id] + delta - outraged) * 10) / 10, 0, 100);
  }
  game.capital = clamp(game.capital + (passed ? 5 : -5) - (struck ? 5 : 0), 0, 200);
  for (const s of game.seated) {
    const offer = bill.offers[s.id];
    let line: string | undefined;
    if (offer) line = votes[s.id] ? `Took the President's offer on "${bill.title}" and voted yes.` : `Refused the President's offer on "${bill.title}" and voted no.`;
    else if (s.party === game.settings.party && !votes[s.id]) line = `Broke with the President and voted no on "${bill.title}".`;
    if (line) s.memory = [...s.memory, line].slice(-5);
  }
  game.turn += 1;
  game.phase = game.turn >= BILLS_PER_TERM[game.settings.mode] ? "over" : "draft";
  if (game.phase === "over") game.result = endTerm(game);
}

export function endTerm(game: Game): { reelected: boolean; score: number } {
  const approval = nationalApproval(game);
  const passed = game.bills.filter((b) => b.passed && !b.struck).length;
  return { reelected: approval >= 50, score: Math.round(passed * 10 + approval + game.capital / 4) };
}

export function dailyCode(date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const seed = hash(day);
  return encodeCode({ v: 1, party: seed & 1 ? "D" : "R", seats: 50, mode: "agenda", pop: 0, lobby: true, amend: true, agenda: seed % 10, seed });
}
