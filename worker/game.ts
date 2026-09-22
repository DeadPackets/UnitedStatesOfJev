import { DurableObject } from "cloudflare:workers";
import {
  applyCitizens, applyLobby, applyVote, continueTerm, director, effectiveWhip, encodeCode, endTerm, expectedYes,
  LOBBY_COSTS, newGame, record, resolveEvent, runTest, scenarioTag, threshold, TURNS_PER_TERM,
  type Bill, type BillDraft, type Game, type LobbyAction, type Member,
} from "./engine";
import {
  citizenQuestions, citizenState, eventQuestions, gateQuestion, jev, memberQuestion, nouls, scores,
  testQuestions, testState, UpstreamError, whipQuestions, whipState, type Env,
} from "./jev";
import { getScenario } from "./db";
import { packView, type Pack } from "./pack";
import { amendBill, cardText, ending, narrate, outcome, parseBill, quotes } from "./luna";

class Reject extends Error { constructor(public status: number, message: string) { super(message); } }

// Starts are matched by faction id, not array position: a pack may list `starts` out of order with `factions`.
export function pickStart(pack: Pack, f: number) {
  const faction = pack.factions[f];
  return faction && pack.starts.find((s) => s.faction === faction.id);
}

type Prose = { ending?: { title: string; body: string } };
type Saved = { game: Game; prose: Prose };
type WhipCount = Pick<Bill, "whip" | "blocs" | "patrons" | "filibuster" | "constitutional" | "vetoes">;
type Amendment = BillDraft & { expected: number; count: WhipCount };
// Per-region approval move from the citizen call, for the map animation. Not persisted: it is one frame.
type Extra = { deltas?: Record<string, number> };

export class GameDO extends DurableObject<Env> {
  private saved?: Saved;
  private pack?: Pack;
  // One move at a time: several actions await Jev before their guard is checked, so a re-entrant
  // request during that window would double-apply. This blocks any second request outright.
  private busy = false;

  async fetch(req: Request): Promise<Response> {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    try {
      if (parts[0] === "health") return Response.json({ ok: true });
      const body = req.method === "POST" ? (await req.json().catch(() => ({}))) as Record<string, unknown> : {};
      if (parts[0] === "new") return this.reply(await this.create(body));
      const s = await this.load();
      const pack = await this.loadPack(s.game.pack);
      if (req.method === "GET") return this.reply(s, pack);
      const { game } = s;
      if (game.result && game.stage !== "won") throw new Reject(409, "This run is over.");
      if (body.turn !== undefined && body.turn !== game.turn) throw new Reject(409, "Stale turn. Reload the game.");
      if (this.busy) throw new Reject(409, "one move at a time");
      this.busy = true;
      let extra: Extra = {};
      try {
        switch (parts[0]) {
          case "bills": extra = await this.bill(game, pack, parts, body); break;
          case "events": extra = await this.event(game, pack, Number(parts[1]), Number(body.stance)); break;
          case "test": await this.term(s, pack); break;
          case "continue":
            if (game.stage !== "won") throw new Reject(409, "The term is not won.");
            continueTerm(pack, game); s.prose = {};
            break;
          case "stop":
            if (game.stage !== "won") throw new Reject(409, "There is nothing to stop.");
            game.stage = "over";
            break;
          default: throw new Reject(404, "Unknown action");
        }
        await this.epilogue(s, pack);
        this.save(s);
      } finally {
        this.busy = false;
      }
      return this.reply(s, pack, extra);
    } catch (e) {
      if (e instanceof Reject) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof UpstreamError) return Response.json({ error: "The chamber is in recess. Try again." }, { status: 503 });
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 502 });
    }
  }

  private async reply(s: Saved, pack?: Pack, extra: Extra = {}) {
    return Response.json(view(pack ?? await this.loadPack(s.game.pack), s, extra));
  }

  /* ---------- storage ---------- */

  private async create(body: Record<string, unknown>): Promise<Saved> {
    const id = String(body.id ?? "");
    const pack = await this.loadPack(String(body.scenario ?? ""));
    const f = typeof body.faction === "number" ? body.faction : pack.factions.findIndex((x) => x.id === body.faction);
    const start = pickStart(pack, f);
    if (!start) throw new Reject(400, "No start for that faction.");
    const raw = Array.isArray(body.promises) ? body.promises.map(Number) : [];
    const promises = raw.filter((p) => Number.isInteger(p) && p >= 0 && p < pack.promises.length);
    if (promises.length !== 3 || new Set(promises).size !== 3) throw new Reject(400, `Pick three different ${pack.vocabulary.promise}s.`);
    const seed = Number.isInteger(body.seed) ? Number(body.seed) & 0x7fffffff : crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
    const code = encodeCode({ scenario: scenarioTag(pack.id), faction: f, promises: promises as [number, number, number], seed });
    const game = newGame(id, code, pack, start.faction, promises.map((p) => pack.promises[p].tag), pack.calendar);
    const s: Saved = { game, prose: {} };
    this.save(s);
    return s;
  }

  private async load(): Promise<Saved> {
    if (this.saved) return this.saved;
    const row = this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS game(k TEXT PRIMARY KEY, v TEXT); SELECT v FROM game WHERE k='game'").toArray()[0];
    const saved = row ? JSON.parse(row.v as string) as Saved : null;
    if (!saved?.game) throw new Reject(404, "No such game.");
    return (this.saved = saved);
  }

  private save(s: Saved) {
    this.saved = s;
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS game(k TEXT PRIMARY KEY, v TEXT); INSERT OR REPLACE INTO game(k, v) VALUES ('game', ?)", JSON.stringify(s));
  }

  // One D1 read per DO lifetime: the pack is 400 KB of the same JSON on every request of a term.
  private async loadPack(id: string): Promise<Pack> {
    if (this.pack) return this.pack;
    const row = await getScenario(this.env, id);
    if (!row) throw new Reject(404, "No such scenario.");
    if (!row.pack) throw new Reject(409, row.status === "ready" ? "That scenario is broken." : "That scenario is still building.");
    return (this.pack = row.pack);
  }

  /* ---------- the floor ---------- */

  private async bill(game: Game, pack: Pack, parts: string[], body: Record<string, unknown>): Promise<Extra> {
    if (game.stage !== "session" && game.stage !== "midterm") throw new Reject(409, "The term is over. Run the test.");
    const action = parts.length === 1 ? "draft" : parts[2];
    // The path segment is the bill's id, which is the turn it was drafted on, not its index.
    const bill = parts[1] !== undefined ? game.bills.find((b) => b.id === Number(parts[1])) : undefined;
    if (action !== "draft" && (!bill || bill.id !== game.turn)) throw new Reject(409, `Not the current ${pack.vocabulary.bill}.`);
    switch (action) {
      case "draft": await this.draft(game, pack, String(body.text ?? "")); return {};
      case "whip":
        if (bill!.whip) throw new Reject(409, "Already counted.");
        Object.assign(bill!, await this.count(game, pack, bill!));
        return {};
      case "lobby": await this.lobby(game, pack, bill!, String(body.memberId ?? ""), body.action as LobbyAction); return {};
      case "amend":
        parts[3] !== undefined ? this.adopt(bill!, Number(parts[3])) : await this.amend(game, pack, bill!);
        return {};
      case "vote": return this.vote(game, pack, bill!);
      default: throw new Reject(404, "Unknown action");
    }
  }

  private async draft(game: Game, pack: Pack, raw: string) {
    if (game.phase !== "draft") throw new Reject(409, `A ${pack.vocabulary.bill} is already on the floor.`);
    const text = raw.trim().slice(0, 1200);
    if (text.length < 12) throw new Reject(400, "Write a little more.");
    const gate = await jev(this.env, { text }, gateQuestion(pack));
    let noul = gate.answers.gate?.noul;
    if (noul === undefined) { console.warn("gate: missing answer for gate.noul"); noul = 0.5; }
    if (noul < 0.3) throw new Reject(422, `That is not a ${pack.vocabulary.bill}. Propose a law, a program, or a policy.`);
    const draft = await parseBill(this.env, pack, text).catch((e) => {
      if (e instanceof UpstreamError) throw e;
      throw new Reject(503, "The narrator did not answer. Try again.");
    });
    game.bills.push({ id: game.turn, text, ...draft, offers: {} });
    game.phase = "whip";
  }

  private async count(game: Game, pack: Pack, bill: Bill, draft: BillDraft = bill): Promise<WhipCount> {
    const r = await jev(this.env, whipState(pack, game, { ...bill, ...draft }), whipQuestions(pack, game.members));
    return {
      whip: Object.fromEntries(game.members.map((m) => [m.id, r.answers[m.id]?.noul ?? 0])),
      blocs: scores(r.answers, "bloc_"), patrons: scores(r.answers, "patron_"), vetoes: nouls(r.answers, "veto_"),
      filibuster: r.answers.filibuster?.noul ?? 0, constitutional: r.answers.constitutional?.noul ?? 0,
    };
  }

  private async lobby(game: Game, pack: Pack, bill: Bill, memberId: string, action: LobbyAction) {
    if (!bill.whip) throw new Reject(409, `Run the ${pack.vocabulary.whip} first.`);
    const m = game.members.find((x) => x.id === memberId);
    if (!m || !(action in LOBBY_COSTS)) throw new Reject(400, `Bad ${pack.vocabulary.member} or action.`);
    if (bill.offers[m.id]) throw new Reject(409, "Already offered them something on this one.");
    // 1.5 is the costly_favors multiplier. Gating on the worst case stops applyLobby's clamp at 0 from ever
    // handing out a free offer.
    if (game.ledgers.capital < LOBBY_COSTS[action] * 1.5) throw new Reject(402, `Not enough ${pack.vocabulary.capital}.`);
    const whip = bill.whip;
    const { offer } = applyLobby(pack, game, bill, m, action);
    const r = await jev(this.env, whipState(pack, game, bill), { [m.id]: memberQuestion(pack, m, offer) });
    whip[m.id] = r.answers[m.id]?.noul ?? whip[m.id];
  }

  private async amend(game: Game, pack: Pack, bill: Bill) {
    if (!bill.whip) throw new Reject(409, `Run the ${pack.vocabulary.whip} first.`);
    if (bill.amendments) throw new Reject(409, "Already amended once.");
    const whip = bill.whip;
    const opponents = game.members.filter((m) => (whip[m.id] ?? 0) < 0.5).sort((a, b) => (whip[b.id] ?? 0) - (whip[a.id] ?? 0)).slice(0, 5);
    const loudest = Object.entries(bill.blocs ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? pack.blocs[0].id;
    const drafts = await amendBill(this.env, pack, bill, opponents, pack.blocs.find((b) => b.id === loudest)?.name ?? loudest).catch((e) => {
      if (e instanceof UpstreamError) throw e;
      throw new Reject(503, "The narrator did not answer. Try again.");
    });
    const counts = await Promise.all(drafts.map((d) => this.count(game, pack, bill, d)));
    const amendments: Amendment[] = drafts.map((d, i) => ({
      ...d, count: counts[i], expected: Math.round(expectedYes(effectiveWhip(game, { ...bill, ...d, ...counts[i] })) * 10) / 10,
    }));
    bill.amendments = amendments;
  }

  private adopt(bill: Bill, i: number) {
    const a = bill.amendments?.[i] as Amendment | undefined;
    if (!a) throw new Reject(400, "No such amendment.");
    Object.assign(bill, { title: a.title, summary: a.summary, tags: a.tags, ...a.count, offers: {}, acts: {}, amendments: [] });
  }

  private async vote(game: Game, pack: Pack, bill: Bill): Promise<Extra> {
    if (!bill.whip) throw new Reject(409, `Run the ${pack.vocabulary.whip} first.`);
    const before = effectiveWhip(game, bill);
    applyVote(pack, game, bill);
    const votes = bill.votes!;
    const gap = (m: Member) => Math.abs((votes[m.id] ? 1 : 0) - (before[m.id] ?? 0));
    const speakers = [...game.members].sort((a, b) => gap(b) - gap(a)).slice(0, 2);
    const defectors = game.members.filter((m) => m.faction === game.faction && !votes[m.id])
      .sort((a, b) => (bill.whip![b.id] ?? 0) - (bill.whip![a.id] ?? 0)).slice(0, 3);
    const verdict = {
      [pack.vocabulary.bill]: bill.title, summary: bill.summary,
      outcome: bill.passed ? pack.vocabulary.pass : pack.vocabulary.fail,
      yes: bill.yes, needed: bill.threshold, struck_down: bill.struck,
    };
    // Headline, quotes and the 250 citizens are one beat: nothing reads another's result.
    const [headline, said, citizens] = await Promise.all([
      narrate(this.env, pack, bill, defectors).catch(() => undefined),
      quotes(this.env, pack, bill, speakers).catch(() => []),
      jev(this.env, citizenState(pack, game, verdict), citizenQuestions(pack, pack.citizens, "vote")),
    ]);
    if (headline) bill.headline = headline;
    if (said.length) bill.quotes = said;
    const deltas = applyCitizens(pack, game, nouls(citizens.answers, ""));

    const event = director(game, pack);
    if (event) {
      const storylet = pack.deck.find((s) => s.id === event.id);
      if (storylet) event.card = await cardText(this.env, pack, storylet, record(pack, game)).catch(() => undefined);
    }
    // The midterm draw is Stage B, so the stage goes straight back to the session.
    if (game.stage === "midterm") game.stage = "session";
    return { deltas };
  }

  private async event(game: Game, pack: Pack, i: number, stance: number): Promise<Extra> {
    const event = game.events[i];
    if (!event) throw new Reject(404, "No such card.");
    if (event.stance !== undefined) throw new Reject(409, "That card is already answered.");
    if (!(stance >= 0 && stance < event.stances.length)) throw new Reject(400, "Pick a stance.");
    const storylet = pack.deck.find((s) => s.id === event.id);
    const taken = event.stances[stance];
    const state = { event: event.card ?? { title: storylet?.title_hint ?? event.id }, stance: taken, record: record(pack, game) };
    const questions = storylet ? eventQuestions(pack, storylet.scored) : {};
    let scored: Record<string, number> | undefined;
    if (Object.keys(questions).length) {
      const r = await jev(this.env, state, questions);
      scored = { ...scores(r.answers, "bloc_"), ...scores(r.answers, "patron_") };
    }
    resolveEvent(pack, game, event, stance, scored);
    const [line, citizens] = await Promise.all([
      outcome(this.env, pack, event, taken, record(pack, game)).catch(() => undefined),
      jev(this.env, citizenState(pack, game, { ...state.event, stance_taken: taken }), citizenQuestions(pack, pack.citizens, "crisis")),
    ]);
    if (line) event.outcome = line;
    return { deltas: applyCitizens(pack, game, nouls(citizens.answers, "")) };
  }

  private async term(s: Saved, pack: Pack) {
    const { game } = s;
    if (game.stage !== "test") throw new Reject(409, `The ${pack.vocabulary.test} is not due yet.`);
    const r = await jev(this.env, testState(pack, game), testQuestions(pack, game));
    const result = runTest(pack, game, { loyalty: nouls(r.answers, "loyalty_"), intent: nouls(r.answers, "intent_") });
    endTerm(pack, game, result);
  }

  // Luna's last page, written once: after the test, and after a term impeachment or a lame duck cuts short.
  private async epilogue(s: Saved, pack: Pack) {
    const { game } = s;
    if (!game.result || s.prose.ending) return;
    const state = { ...record(pack, game), mandate: game.test ? Math.round(game.test.mandate * 100) : null, score: game.result.score, terms: game.terms };
    s.prose.ending = await ending(this.env, pack, game.result.ending, state).catch(() => undefined);
  }
}

// Personas never leave the Worker: members lose bio and tell, citizens keep five fields, the deck stays behind.
export function view(pack: Pack, { game, prose }: Saved, extra: Extra = {}) {
  const { director: _hidden, members, bills, ...rest } = game;
  const pv = packView(pack);
  const start = pack.starts.find((x) => x.faction === game.faction);
  return {
    ...rest, ...extra,
    scenario: game.pack, pack: pv,
    members: members.map(({ bio, tell, ...m }) => m),
    bills: bills.map((b) => {
      const cur = b.id < game.turn ? { ...b, vetoes: undefined, offers: {} } : b;
      if (cur.id < game.turn - 1) return { ...cur, whip: undefined, votes: undefined, quotes: undefined };
      if (!cur.whip || cur.votes) return cur;
      const whip = effectiveWhip(game, cur);
      return { ...cur, whip, expected: Math.round(expectedYes(whip) * 10) / 10, needed: threshold(pack, game, cur) };
    }),
    citizens: pack.citizens.map(({ id, region, bloc, name, weight }) => ({ id, region, bloc, name, weight })),
    coalition: (start?.coalition ?? []).filter((f) => f !== game.faction),
    seatTitle: start?.seat_title ?? "the government",
    turnsPerTerm: TURNS_PER_TERM,
    ending: prose.ending,
  };
}
