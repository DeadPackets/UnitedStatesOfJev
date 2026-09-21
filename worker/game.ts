import { DurableObject } from "cloudflare:workers";
import roster from "./roster.json";
import agendas from "./agendas.json";
import { applyVote, expectedYes, newGame, passThreshold, LOBBY, BILLS_PER_TERM, type Bill, type BillDraft, type Game, type LobbyAction, type RosterSenator } from "./engine";
import { jev, whipQuestions, whipState, gateQuestion, UpstreamError, type Env } from "./jev";
import { parseBill, amendBill, narrate } from "./luna";

const MAX_TURNS = 200;
class Reject extends Error { constructor(public status: number, message: string) { super(message); } }

export class GameDO extends DurableObject<Env> {
  private game?: Game;

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (parts[0] === "health") return Response.json({ ok: true });
      const body = req.method === "POST" ? await req.json().catch(() => ({})) as any : {};
      if (parts[0] === "new") return Response.json(view(await this.create(body.id, body.code)));
      const game = await this.load();
      if (req.method === "GET") return Response.json(view(game));
      if (game.phase === "over" || game.turn >= MAX_TURNS) throw new Reject(409, "This term is over.");
      if (body.turn !== game.turn) throw new Reject(409, "Stale turn. Reload the game.");
      // parts: ["bills"] | ["bills", b, action, i?]
      const action = parts[0] === "bills" && parts.length === 1 ? "draft" : parts[2];
      const bill = parts[1] !== undefined ? game.bills[Number(parts[1])] : undefined;
      if (action !== "draft" && (!bill || bill.id !== game.turn)) throw new Reject(409, "Not the current bill.");
      switch (action) {
        case "draft": await this.draft(game, String(body.text ?? "")); break;
        case "whip": { if (bill!.whip) throw new Reject(409, "Already counted."); Object.assign(bill!, await this.whip(game, bill!)); break; }
        case "lobby": await this.lobby(game, bill!, body.senatorId, body.action); break;
        case "amend": parts[3] !== undefined ? this.adopt(bill!, Number(parts[3])) : await this.amend(game, bill!); break;
        case "vote": await this.vote(game, bill!); break;
        default: throw new Reject(404, "Unknown action");
      }
      await this.save(game);
      return Response.json(view(game));
    } catch (e) {
      if (e instanceof Reject) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof UpstreamError) return Response.json({ error: "The chamber is in recess. Try again." }, { status: 503 });
      throw e;
    }
  }

  private async create(id: string, code: string): Promise<Game> {
    const game = newGame(id, code, roster as RosterSenator[]);
    await this.save(game);
    return game;
  }
  private async load(): Promise<Game> {
    if (this.game) return this.game;
    const row = this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS game(k TEXT PRIMARY KEY, v TEXT); SELECT v FROM game WHERE k='game'").toArray()[0];
    if (!row) throw new Reject(404, "No such game.");
    return (this.game = JSON.parse(row.v as string));
  }
  private async save(game: Game) {
    this.game = game;
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS game(k TEXT PRIMARY KEY, v TEXT); INSERT OR REPLACE INTO game(k, v) VALUES ('game', ?)", JSON.stringify(game));
  }

  private async draft(game: Game, text: string) {
    if (game.phase !== "draft") throw new Reject(409, "A bill is already on the floor.");
    let draft: BillDraft;
    if (game.settings.mode === "agenda") {
      const a = agendas[game.settings.agenda % agendas.length].bills[game.turn];
      draft = { title: a.title, summary: a.summary, tags: a.tags }; text = a.text;
    } else {
      text = text.trim().slice(0, 1200);
      if (text.length < 12) throw new Reject(400, "Write a little more.");
      const gate = await jev(this.env, { text }, gateQuestion());
      if ((gate.answers.gate.noul ?? 0) < 0.3) throw new Reject(422, "That is not a bill. Propose a law, a program, or a policy.");
      draft = await parseBill(this.env, text);
    }
    game.bills.push({ id: game.turn, text, ...draft, offers: {} });
    game.phase = "whip";
  }

  private async whip(game: Game, bill: Bill, draft: BillDraft = bill) {
    const r = await jev(this.env, whipState(game, { ...bill, ...draft }), whipQuestions(game.seated));
    const whip = Object.fromEntries(game.seated.map((s) => [s.id, r.answers[s.id].noul ?? 0]));
    const blocs = Object.fromEntries(Object.entries(r.answers).filter(([k]) => k.startsWith("bloc_")).map(([k, v]) => [k.slice(5), v.score ?? 0]));
    return { whip, blocs, filibuster: r.answers.filibuster.noul ?? 0, constitutional: r.answers.constitutional.noul ?? 0 };
  }

  private async lobby(game: Game, bill: Bill, senatorId: string, action: LobbyAction) {
    if (!game.settings.lobby) throw new Reject(403, "Lobbying is off for this game.");
    if (!bill.whip) throw new Reject(409, "Run the whip count first.");
    const s = game.seated.find((x) => x.id === senatorId);
    const act = LOBBY[action];
    if (!s || !act) throw new Reject(400, "Bad senator or action.");
    if (bill.offers[s.id]) throw new Reject(409, "Already lobbied this senator on this bill.");
    if (game.capital < act.cost) throw new Reject(402, "Not enough political capital.");
    const offer = act.text(s);
    const r = await jev(this.env, whipState(game, bill, offer), { [s.id]: whipQuestions([s])[s.id] });
    bill.whip[s.id] = r.answers[s.id].noul ?? bill.whip[s.id];
    bill.offers[s.id] = offer;
    game.capital -= act.cost;
  }

  private async amend(game: Game, bill: Bill) {
    if (!game.settings.amend) throw new Reject(403, "Amendments are off for this game.");
    if (!bill.whip) throw new Reject(409, "Run the whip count first.");
    if (bill.amendments) throw new Reject(409, "Already amended once.");
    const opponents = game.seated.filter((s) => bill.whip![s.id] < 0.5).sort((a, b) => bill.whip![b.id] - bill.whip![a.id]).slice(0, 5);
    const loudest = Object.entries(bill.blocs ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "business";
    const drafts = await amendBill(this.env, bill, opponents, loudest);
    const counts = await Promise.all(drafts.map((d) => this.whip(game, bill, d)));
    bill.amendments = drafts.map((d, i) => ({ ...d, expected: expectedYes(counts[i].whip), whip: counts[i] }) as any);
  }

  private adopt(bill: Bill, i: number) {
    const a = bill.amendments?.[i] as any;
    if (!a) throw new Reject(400, "No such amendment.");
    Object.assign(bill, { title: a.title, summary: a.summary, tags: a.tags, ...a.whip, offers: {}, amendments: undefined });
  }

  private async vote(game: Game, bill: Bill) {
    if (!bill.whip) throw new Reject(409, "Run the whip count first.");
    applyVote(game, bill);
    const yes = Object.values(bill.votes!).filter(Boolean).length;
    const defectors = game.seated.filter((s) => s.party === game.settings.party && !bill.votes![s.id]).sort((a, b) => bill.whip![b.id] - bill.whip![a.id]).slice(0, 3);
    try { bill.headline = await narrate(this.env, bill, yes, passThreshold(bill), defectors, bill.blocs ?? {}); } catch { /* headline is optional */ }
  }
}

// Old bills lose their per-senator maps on the wire; the client only needs the current one.
function view(game: Game) {
  const bills = game.bills.map((b) => (b.id >= game.turn - 1 ? b : { ...b, whip: undefined, votes: undefined }));
  return { ...game, bills, billsPerTerm: BILLS_PER_TERM[game.settings.mode] === Infinity ? null : BILLS_PER_TERM[game.settings.mode] };
}
