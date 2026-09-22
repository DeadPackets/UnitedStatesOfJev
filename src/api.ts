import type { Bill, BillDraft, Event, Game, LobbyAction, Member } from "../worker/engine";
import type { Citizen, Pack, PackView } from "../worker/pack";

/** What `GET /api/scenarios/:id` sends: `packView`, a Pack without citizens or member prose. */
export type { PackView };
type WhipCount = Pick<Bill, "whip" | "blocs" | "patrons" | "filibuster" | "constitutional" | "vetoes">;
export type ViewBill = Omit<Bill, "amendments"> & {
  expected?: number; needed?: number;
  amendments?: (BillDraft & { expected: number; count: WhipCount })[];
};
export type ViewMember = Omit<Member, "bio" | "tell">;
export type ViewEvent = Event;
/** What every `/api/games` route sends. The deck, the Director and every persona stay in the Worker. */
export type GameView = Omit<Game, "pack" | "director" | "members" | "bills"> & {
  scenario: string;
  pack: Omit<PackView, "deck">;
  members: ViewMember[];
  bills: ViewBill[];
  citizens: Pick<Citizen, "id" | "region" | "bloc" | "name" | "weight">[];
  coalition: string[];
  seatTitle: string;
  turnsPerTerm: number;
  ending?: { title: string; body: string };
  deltas?: Record<string, number>;   // per-region approval move from the last citizen call, one frame only
};
/** The pack as the game screens see it: the deck never leaves the Worker. */
export type GamePack = GameView["pack"];
export type Offer = { id: string; title: string; era: string; place: string; description: string; p: number };
export type MatchResult = { build?: true; load?: string; offer?: Offer[] };
export type Fragment = { kind: string } & Record<string, unknown>;
export type FrameFragment = {
  kind: "frame"; title: string; era: string; place: string; description: string;
  theme: Partial<Pack["theme"]>; factions: { id: string; name: string; short: string; color: string }[];
  problems?: string[]; vocabulary?: Pack["vocabulary"];
};
export type BuildState = { status: string; step: string | null; fragments: Fragment[]; pack?: PackView; error?: string };

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({ error: "Bad response" }));
  if (!r.ok) throw new ApiError(r.status, data.error ?? "Something went wrong");
  return data as T;
}

export const api = {
  match: (prompt: string) => call<MatchResult>("/scenarios/match", { prompt }),
  build: (prompt: string) => call<{ id: string }>("/scenarios", { prompt }),
  scenario: (id: string) => call<BuildState>(`/scenarios/${id}`),
  seat: (scenario: string, faction: string, promises: number[], seed?: number) => call<GameView>("/games", { scenario, faction, promises, seed }),
  share: (code: string) => call<GameView>("/games", { code }),
  load: (id: string) => call<GameView>(`/games/${id}`),
  draft: (g: GameView, text: string) => call<GameView>(`/games/${g.id}/bills`, { turn: g.turn, text }),
  whip: (g: GameView) => call<GameView>(`/games/${g.id}/bills/${g.turn}/whip`, { turn: g.turn }),
  lobby: (g: GameView, memberId: string, action: LobbyAction) => call<GameView>(`/games/${g.id}/bills/${g.turn}/lobby`, { turn: g.turn, memberId, action }),
  amend: (g: GameView) => call<GameView>(`/games/${g.id}/bills/${g.turn}/amend`, { turn: g.turn }),
  adopt: (g: GameView, i: number) => call<GameView>(`/games/${g.id}/bills/${g.turn}/amend/${i}`, { turn: g.turn }),
  vote: (g: GameView) => call<GameView>(`/games/${g.id}/bills/${g.turn}/vote`, { turn: g.turn }),
  resolve: (g: GameView, i: number, stance: number) => call<GameView>(`/games/${g.id}/events/${i}`, { turn: g.turn, stance }),
  test: (g: GameView) => call<GameView>(`/games/${g.id}/test`, {}),
  continue: (g: GameView) => call<GameView>(`/games/${g.id}/continue`, {}),
  stop: (g: GameView) => call<GameView>(`/games/${g.id}/stop`, {}),
};
