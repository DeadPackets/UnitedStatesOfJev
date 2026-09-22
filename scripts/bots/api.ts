// The bot drives the same HTTP API a player's browser does. Nothing here imports the worker.
import type { GameView } from "../../src/api";

export type Verb = "decree" | "law" | "appoint" | "spend" | "proclaim" | "favour" | "force";
export type BotAct = { verb: Verb; text: string; memberId?: string };
export type Whip = { expected: number; needed: number; yes: number; size: number };

export class Bot {
  calls = 0;
  ms = 0;
  whip: Whip | null = null;

  constructor(readonly base: string) {}

  async api(path: string, body?: unknown): Promise<GameView> {
    for (let attempt = 0; ; attempt++) {
      this.calls++;
      const t0 = performance.now();
      const r = await fetch(`${this.base}/api${path}`,
        body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      this.ms += performance.now() - t0;
      if (r.ok) return r.json() as Promise<GameView>;
      const text = await r.text();
      // wrangler.bots.jsonc allows 240 requests a minute and one bot turn is 6 to 12; back off rather than end the run.
      if (r.status === 429 && attempt < 5) { await new Promise((res) => setTimeout(res, 3000)); continue; }
      throw new Error(`${r.status} ${path}: ${text.slice(0, 300)}`);
    }
  }

  seat(scenario: string, faction: string | number, promises: number[], seed: number) {
    return this.api("/games", { scenario, faction, promises, seed });
  }

  /** Stage B's two call flow: price the text, then commit the tag. A refusal is priced, costs 1 authority and commits nothing. */
  async act(g: GameView, a: BotAct): Promise<GameView> {
    const turn = g.turn;
    const priced = await this.api(`/games/${g.id}/acts/price`, { turn, text: a.text, verb: a.verb, memberId: a.memberId });
    if (!priced.tag) return priced;
    return this.api(`/games/${g.id}/acts`, { turn });
  }

  /**
   * A law is that same act, which lands a bill on the floor, and then the vote.
   * The forecast is captured here because a voted bill comes back without `expected`.
   */
  async law(g: GameView, text: string): Promise<GameView> {
    const turn = g.turn;
    let view = await this.act(g, { verb: "law", text });
    let bill = view.bills.at(-1);
    if (!bill || bill.votes) return view;
    if (bill.expected === undefined) {
      const id = bill.id;
      view = await this.api(`/games/${view.id}/bills/${id}/whip`, { turn });
      bill = view.bills.find((b) => b.id === id);
    }
    if (!bill) return view;
    this.whip = { expected: bill.expected ?? 0, needed: bill.needed ?? bill.threshold ?? 0, yes: 0, size: view.pack.chamber.size };
    const voted = await this.api(`/games/${view.id}/bills/${bill.id}/vote`, { turn });
    this.whip.yes = voted.bills.find((b) => b.id === bill!.id)?.yes ?? 0;
    return voted;
  }

  /** Answer the first open card with the given stance, so a card never blocks the turn boundary. */
  async card(g: GameView, stance = 0): Promise<GameView> {
    const i = g.events.findIndex((e) => e.stance === undefined);
    return i < 0 ? g : this.api(`/games/${g.id}/events/${i}`, { turn: g.turn, stance });
  }

  midterm(g: GameView) { return this.api(`/games/${g.id}/midterm`, {}); }
  end(g: GameView) { return this.api(`/games/${g.id}/turn/end`, { turn: g.turn }); }
  test(g: GameView) { return this.api(`/games/${g.id}/test`, {}); }
  cont(g: GameView) { return this.api(`/games/${g.id}/continue`, {}); }
  stop(g: GameView) { return this.api(`/games/${g.id}/stop`, {}); }
}
