import type { Game, LobbyAction } from "../worker/engine";

export type GameView = Game & { billsPerTerm: number | null };
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({ error: "Bad response" }));
  if (!r.ok) throw new ApiError(r.status, data.error ?? "Something went wrong");
  return data as T;
}

export const api = {
  daily: () => call<{ code: string }>("/daily"),
  create: (code: string) => call<GameView>("/games", { code }),
  load: (id: string) => call<GameView>(`/games/${id}`),
  draft: (g: GameView, text: string) => call<GameView>(`/games/${g.id}/bills`, { turn: g.turn, text }),
  whip: (g: GameView) => call<GameView>(`/games/${g.id}/bills/${g.turn}/whip`, { turn: g.turn }),
  lobby: (g: GameView, senatorId: string, action: LobbyAction) => call<GameView>(`/games/${g.id}/bills/${g.turn}/lobby`, { turn: g.turn, senatorId, action }),
  amend: (g: GameView) => call<GameView>(`/games/${g.id}/bills/${g.turn}/amend`, { turn: g.turn }),
  adopt: (g: GameView, i: number) => call<GameView>(`/games/${g.id}/bills/${g.turn}/amend/${i}`, { turn: g.turn }),
  vote: (g: GameView) => call<GameView>(`/games/${g.id}/bills/${g.turn}/vote`, { turn: g.turn }),
};
