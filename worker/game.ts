import { DurableObject } from "cloudflare:workers";
import {
  applyCitizens, applyLobby, applyMidterm, applyPost, applyVote, continueTerm,
  earlyTest, effectiveWhip, encodeCode, endTerm, endTurn, expectedYes, LOBBY_COSTS, lobbyCost, nationalPopularity,
  newGame, PROMISE_SHARE, PROMISE_WINDOW, record, replacements, resolveEvent, rng, runMidterm, runTest, scenarioTag, score,
  holdersOf, threshold, TURNS_PER_TERM, bar, canAfford, HANDICAP, HANDICAP_SHORTFALL, nearestLine, shortfall, weightOf,
  pay, pushWire, REFUSAL_COST, spendCalls,
  type Bill, type BillDraft, type Game, type LobbyAction, type Member, type Reaction, type HolderView, type InstrumentView,
} from "./engine";
import {
  agreeQuestions, agreeState, choices, citizenQuestions, citizenState, eventQuestions, HOLDER_SAMPLE, holderQuestions,
  holderStance, holderState, jev, memberQuestion, nouls, reactQuestions, reactState, scores, UpstreamError, voteQuestions,
  voteState, whipQuestions, whipState, type Env,
} from "./jev";
import { getScenario } from "./db";
import { packView, VERBS, type Citizen, type Pack, type Verb } from "./pack";
import { amendBill, cardText, ending, halfTerm, narrate, newMembers, outcome, priceAct, quotes, replies } from "./luna";
import { available, priceTag } from "./acts";
import { portraitSheet, SHEET } from "./build";
import { chunk } from "./gen/prompts";

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
      // Engine mutations run before the Jev awaits, so an upstream failure would leave the cached game
      // half-applied and the next save would persist it. Roll back to the state the request started from.
      const before = structuredClone(s);
      let extra: Extra = {};
      try {
        switch (parts[0]) {
          case "bills": extra = await this.bill(game, pack, parts, body); break;
          case "acts": extra = await this.acts(game, pack, parts, body); break;
          case "events": extra = await this.event(game, pack, Number(parts[1]), Number(body.stance)); break;
          case "midterm": await this.midterm(game, pack); break;
          case "post": await this.post(game, pack, String(body.text ?? "")); break;
          case "test": await this.term(s, pack); break;
          case "turn": if (parts[1] !== "end") throw new Reject(404, "Unknown action"); await this.end(game, pack); break;
          case "continue":
            if (game.stage !== "won") throw new Reject(409, "The term is not won.");
            continueTerm(pack, game); s.prose = {};
            break;
          case "stop":
            if (game.stage !== "won") throw new Reject(409, "There is nothing to stop.");
            game.stage = "over"; game.phase = "over";
            game.result = { ending: "stopped", score: score(game) };
            s.prose = {};
            break;
          default: throw new Reject(404, "Unknown action");
        }
        await this.epilogue(s, pack);
        this.save(s);
      } catch (e) {
        if (!(e instanceof Reject)) this.saved = before;
        throw e;
      } finally {
        this.busy = false;
      }
      return this.reply(s, pack, extra);
    } catch (e) {
      if (e instanceof Reject) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof UpstreamError) return Response.json({ error: "The chamber is in recess. Try again." }, { status: 503 });
      // Whatever broke, the player gets the same sentence: a D1 message or a TypeError is not for them.
      console.error(e);
      return Response.json({ error: "The turn did not finish. Try again." }, { status: 502 });
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
    migrate(saved.game);
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
    if (game.stage !== "session") throw new Reject(409, game.stage === "midterm" ? `The ${pack.vocabulary.midterm} comes first.` : "The term is over.");
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

  private async acts(game: Game, pack: Pack, parts: string[], body: Record<string, unknown>): Promise<Extra> {
    if (game.stage !== "session" && game.stage !== "midterm") throw new Reject(409, "Not now.");
    switch (parts[1] ?? "") {
      case "price": return this.price(game, pack, String(body.text ?? ""), body.verb as Verb | undefined);
      default: throw new Reject(404, "Unknown action");
    }
  }

  // A refusal is a 200 because it costs 1 authority, and a Reject would keep the charge without the answer.
  private async price(game: Game, pack: Pack, raw: string, verb?: Verb): Promise<Extra> {
    const text = raw.trim().slice(0, 1200);
    if (text.length < 12) throw new Reject(400, "Write a little more.");
    if (verb && !available(pack, game, verb)) throw new Reject(400, "That instrument is not available.");
    // C5: a tag the player never commits still spent its call.
    if (!spendCalls(game)) throw new Reject(409, `The clerks have done all they can this ${pack.vocabulary.turn}. End the turn.`);
    const q = await priceAct(this.env, pack, game, text, verb).catch((e) => {
      if (e instanceof UpstreamError) throw e;
      throw new Reject(503, "The clerk did not answer. Try again.");
    });
    if (!available(pack, game, q.verb)) throw new Reject(400, "That instrument is not available.");
    if (!q.power || !q.era) {
      game.tag = null;
      game.refusal = { line: q.refusal ?? "That cannot be done here.", test: q.power ? "era" : "power", cost: REFUSAL_COST };
      pushWire(game, pay(pack, game, { authority: REFUSAL_COST, treasury: 0, chest: 0 }, "the clerk refused the act"));
      return {};
    }
    game.refusal = null;
    game.tag = priceTag(pack, game, q);
    return {};
  }

  private async draft(_game: Game, _pack: Pack, _raw: string) {
    throw new Reject(410, "Use the act composer.");
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
    if (!m || !Object.hasOwn(LOBBY_COSTS, action)) throw new Reject(400, `Bad ${pack.vocabulary.member} or action.`);
    if (bill.offers[m.id]) throw new Reject(409, "Already offered them something on this one.");
    // Gating on the priced cost stops applyLobby's clamp at 0 from ever handing out a free offer.
    if (game.ledgers.authority < lobbyCost(game, action)) throw new Reject(402, `Not enough ${pack.vocabulary.capital}.`);
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
    return { deltas };
  }

  private async midterm(game: Game, pack: Pack) {
    if (game.stage !== "midterm") throw new Reject(409, `The ${pack.vocabulary.midterm} is not due.`);
    const r = await jev(this.env, voteState(pack, game, []), voteQuestions(pack, game, pack.citizens, {}, {}));
    const draw = runMidterm(pack, game, nouls(r.answers, "vote_"));
    const slots = replacements(pack, game, draw);
    const personas = await newMembers(this.env, pack, slots).catch(() => []);
    applyMidterm(pack, game, draw, personas);
    const fresh = game.members.filter((m) => slots.some((s) => s.id === m.id));
    // Portraits never gate play: initials stand in until the sheets land (v3 spec §5).
    for (const group of chunk(fresh, SHEET)) this.ctx.waitUntil(portraitSheet(this.env, pack.id, pack, group));
    const head = await halfTerm(this.env, pack, {
      ...record(pack, game),
      seats_lost: draw.lostOwn, seats_changed: draw.lost.length, seats_up: draw.up.length,
      [pack.vocabulary.approval]: Math.round(nationalPopularity(pack, game)),
    }).catch(() => undefined);
    if (head && game.midterm) game.midterm.headline = head;
  }

  private async post(game: Game, pack: Pack, raw: string) {
    if (game.stage !== "session") throw new Reject(409, "Not now.");
    const text = raw.trim();
    if (!text.length || text.length > 240) throw new Reject(400, "240 characters at most.");
    if (game.posts.some((p) => p.turn === game.turn)) throw new Reject(409, "One a turn.");
    const sample = seededSample(game, pack.citizens, 50);
    const r = await jev(this.env, reactState(pack, game, text), reactQuestions(pack, pack.citizens));
    const reactions = choices(r.answers, "react_") as Record<string, Reaction>;
    const loudest = [...pack.citizens]
      .filter((c) => reactions[c.id] === "share" || reactions[c.id] === "boo")
      .sort((a, b) => b.weight - a.weight).slice(0, 3)
      .map((c) => ({ name: c.name, town: c.town, worldview: c.worldview, reaction: reactions[c.id] }));
    const said = await replies(this.env, pack, text, loudest, record(pack, game)).catch(() => ({ replies: [], rival: "" }));
    const duel = said.rival
      ? choices((await jev(this.env, agreeState(pack, text, said.rival), agreeQuestions(pack, sample))).answers, "agree_")
      : {};
    const post = applyPost(pack, game, game.turn, text, reactions, said, duel as Record<string, "government" | "rival">);
    if (!said.rival) post.won = false;
  }

  private async event(game: Game, pack: Pack, i: number, stance: number): Promise<Extra> {
    if (game.stage !== "session" && game.stage !== "midterm") throw new Reject(409, "Not now.");
    const event = game.events[i];
    if (!event) throw new Reject(404, "No such card.");
    if (event.stance !== undefined) throw new Reject(409, "That card is already answered.");
    if (!(Number.isInteger(stance) && stance >= 0 && stance < event.stances.length)) throw new Reject(400, "Pick a stance.");
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

  private async end(game: Game, pack: Pack) {
    if (game.stage !== "session") throw new Reject(409, "Not now.");
    if (game.events.some((e) => e.stance === undefined)) throw new Reject(409, "Answer the card on the desk first.");
    const out = endTurn(pack, game);
    if (out.event) {
      const storylet = pack.deck.find((s) => s.id === out.event!.id);
      if (storylet) out.event.card = await cardText(this.env, pack, storylet, record(pack, game)).catch(() => undefined);
    }
  }

  private async term(s: Saved, pack: Pack) {
    const { game } = s;
    if (game.stage !== "test") throw new Reject(409, `The ${pack.vocabulary.test} is not due yet.`);
    const hs = holdersOf(pack);
    // One call per holder, each with that holder's own numbers: the v3 single call measured 93% of the cap.
    const reads = await Promise.all(hs.map(async (h) => {
      const rows = {
        seats: h.members === "seats" ? game.members : [],
        citizens: h.members === "citizens" ? streetSample(game, pack.citizens, HOLDER_SAMPLE) : [],
      };
      const r = await jev(this.env, holderState(pack, game, h), holderQuestions(pack, game, h, rows));
      return [h.id, holderStance(pack, h, r.answers)] as const;
    }));
    const stances = Object.fromEntries(reads);
    const result = game.earlyTest ? earlyTest(pack, game, game.earlyTest, stances) : runTest(pack, game, stances);
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

// Every v3 save reaches v4 through here: the four old ledgers become five.
export function migrate(game: Game): void {
  const g = game as unknown as Record<string, unknown>;
  const L = g.ledgers as Record<string, unknown>;
  if (L && L.capital !== undefined) {
    g.ledgers = { treasury: 0, authority: L.capital, chest: L.chest, loyalty: L.party, popularity: L.approval };
  }
  game.posts ??= [];
  game.revolt ??= null;
  game.holders ??= {};
  game.warnings ??= [];
  game.inForce ??= [];
  game.wire ??= [];
  game.pending ??= null;
  game.tag ??= null;
  game.refusal ??= null;
  game.acts ??= [];
  game.rival ??= null;
  game.calls ??= 0;
  game.swing ??= 0;
  game.quiet ??= 0;
  game.drift ??= {};
  game.media ??= 0;
  game.trust ??= 1;
  game.emergency ??= null;
  game.extra ??= [];
  game.wireTurn ??= game.turn;
  game.director.swan ??= null;
  for (const p of Object.values(game.promises)) {
    p.window ??= PROMISE_WINDOW;
    p.share ??= PROMISE_SHARE;
    p.authored ??= false;
  }
}

export const seededSample = <T>(game: Game, xs: T[], n: number): T[] => {
  const r = rng(game.seed ^ 0xfeed ^ game.turn);
  return [...xs].sort(() => r() - 0.5).slice(0, n);
};

// Every bloc in its share of the roll: a plain draw of 50 can put 15 of one bloc on the street and tilt the test.
export const streetSample = (game: Game, cs: Citizen[], n: number): Citizen[] => {
  const size = new Map<string, number>(), seen = new Map<string, number>(), rank = new Map<Citizen, number>();
  for (const c of cs) size.set(c.bloc, (size.get(c.bloc) ?? 0) + 1);
  for (const c of seededSample(game, cs, cs.length)) {
    const i = seen.get(c.bloc) ?? 0;
    seen.set(c.bloc, i + 1);
    rank.set(c, (i + 0.5) / size.get(c.bloc)!);
  }
  return [...rank.keys()].sort((a, b) => rank.get(a)! - rank.get(b)!).slice(0, n);
};

// Priced and marked here so the Desk never reads the pack's own numbers, the same reason lobbyCosts exists.
const room = (pack: Pack, game: Game): HolderView[] => {
  const near = nearestLine(game);
  return holdersOf(pack).map((h) => {
    const s = game.holders[h.id];
    return {
      id: h.id, name: h.name, where: h.where, stance: s?.stance ?? h.stance, resistance: s?.resistance ?? 0,
      line: s?.line ?? h.line, response: s?.response ?? h.response, weight: s?.weight ?? weightOf(pack, h.id),
      levers: h.levers, warnedAt: s?.warnedAt ?? null, nearest: h.id === near,
      persona: { name: h.persona.name, role: h.persona.role },
    };
  });
};

const instrumentRows = (pack: Pack, game: Game): Partial<Record<Verb, InstrumentView>> => {
  const out: Partial<Record<Verb, InstrumentView>> = {};
  for (const v of VERBS) {
    const i = pack.constitution?.instruments[v];
    if (i) out[v] = { ...i, affordable: i.available && canAfford(pack, game, i.price) };
  }
  return out;
};

// Personas never leave the Worker: members lose bio and tell, citizens keep five fields, the deck stays behind.
export function view(pack: Pack, { game, prose }: Saved, extra: Extra = {}) {
  const { director: _hidden, members, bills, ...rest } = game;
  const pv = packView(pack);
  const start = pack.starts.find((x) => x.faction === game.faction);
  return {
    ...rest, ...extra,
    // Stage C replaces the screens; until then the v3 names ride beside the v4 ones.
    ledgers: { ...game.ledgers, approval: game.ledgers.popularity, capital: game.ledgers.authority, party: game.ledgers.loyalty },
    scenario: game.pack, pack: pv,
    // What an offer costs this term, priced here so the drawer never reads the pack's own number.
    lobbyCosts: Object.fromEntries((Object.keys(LOBBY_COSTS) as LobbyAction[])
      .map((k) => [k, lobbyCost(game, k)])) as Record<LobbyAction, number>,
    holders: room(pack, game),
    instruments: instrumentRows(pack, game),
    bar: bar(pack, game.term),
    ruler: pack.constitution?.ruler ?? { role: start?.seat_title ?? "the government", faction: game.faction },
    // §6: the Seat screen prints these two; the difficulty label they feed is Stage C's.
    shortfall: shortfall(pack, game.faction),
    handicap: shortfall(pack, game.faction) > HANDICAP_SHORTFALL ? HANDICAP : 0,
    members: members.map(({ bio, tell, ...m }) => m),
    bills: bills.map((b) => {
      const cur = b.id < game.turn ? { ...b, vetoes: undefined, offers: {} } : b;
      if (cur.id < game.turn - 1) return { ...cur, whip: undefined, votes: undefined, quotes: undefined };
      if (cur.votes) return cur;
      // The bar a bill has to clear is known the moment it is drafted, escalations and all.
      if (!cur.whip) return { ...cur, needed: threshold(pack, game, cur) };
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
