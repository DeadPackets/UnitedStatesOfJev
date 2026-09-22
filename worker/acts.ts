import {
  authorPromise, belowLine, CAMPAIGN_FROM, canAfford, clamp, easeResistance, enact, holdersOf, keepPromise, pay,
  pushWire, raiseResistance, repeal, RESIST_BYPASS, RESIST_HIT, RESIST_SERVE, weightOf,
  type Game, type PriceTag, type Quote, type WireLine,
} from "./engine";
import type { Consent, Holder, Instrument, Pack, Price, Verb } from "./pack";

export const CAMPAIGN_DISCOUNT = 0.25;  // TUNE, C4

const round1 = (x: number) => Math.round(x * 10) / 10;

export const instrumentOf = (pack: Pack, verb: Verb): Instrument | null => pack.constitution?.instruments[verb] ?? null;

export function consentOf(pack: Pack, game: Game, verb: Verb): Consent {
  const c = instrumentOf(pack, verb)?.consent ?? "none";
  // R19: emergency powers set the chamber aside while they hold.
  if (game.emergency !== null && game.turn <= game.emergency && (c === "chamber" || c === "chamber_supermajority")) return "none";
  return c;
}

export function available(pack: Pack, game: Game, verb: Verb): boolean {
  const i = instrumentOf(pack, verb);
  if (!i?.available) return false;
  const below = belowLine(pack, game);
  // §4: at 0 authority only proclaim and spend are left; at 0 treasury no spending act passes.
  if (below.includes("authority") && verb !== "proclaim" && verb !== "spend") return false;
  if (below.includes("treasury") && verb === "spend") return false;
  return true;
}

// C4: in the last four turns an act aimed at a holder that votes in the test costs less.
export function discountOf(pack: Pack, game: Game, serves: string[]): number {
  if (game.turn < CAMPAIGN_FROM) return 1;
  return serves.some((id) => weightOf(pack, id) > 0) ? 1 - CAMPAIGN_DISCOUNT : 1;
}

export function priceTag(pack: Pack, game: Game, q: Quote, member: string | null = null): PriceTag {
  const base = instrumentOf(pack, q.verb)?.price ?? { authority: 0, treasury: 0, chest: 0 };
  const d = discountOf(pack, game, q.serves);
  // C4 discounts the instrument's standing price only. The quoted sum is the act's own size, and every
  // effect is derived from it, so discounting it would make a spend buy less for less and change nothing.
  const charge: Price = {
    authority: Math.round(base.authority * d) + q.cost.authority,
    treasury: Math.round(base.treasury * d) + q.cost.treasury,
    chest: Math.round(base.chest * d) + q.cost.chest,
  };
  // §7: credibility multiplies what the act wins, never what it costs.
  const revenue = q.revenue.map((r) => ({ ...r, delta: r.delta > 0 ? round1(r.delta * q.credibility) : r.delta }));
  const named = [...q.serves, ...q.hits.filter((id) => !q.serves.includes(id))];
  const stances = named.flatMap((id) => {
    const h = holdersOf(pack).find((x) => x.id === id);
    const s = game.holders[id];
    return h ? [{ id, name: h.name, stance: s?.stance ?? h.stance, resistance: s?.resistance ?? 0, line: s?.line ?? h.line }] : [];
  });
  return {
    verb: q.verb, title: q.title, reading: q.reading, credibility: q.credibility,
    quoted: { authority: q.cost.authority, treasury: q.cost.treasury, chest: q.cost.chest },
    charge, discounted: d < 1, revenue,
    serves: q.serves, hits: q.hits, keeps: q.keeps, targets: q.targets, tags: q.tags, regions: q.regions,
    member, promises: q.promises, sunset: q.sunset, template: q.template, stances,
  };
}

export const WITHDRAW_COST = 2;   // TUNE, R11: a decree can be taken back for authority

const chamberHolder = (pack: Pack): Holder | null => holdersOf(pack).find((h) => h.members === "seats") ?? null;

// Spec §2: a hit holder gains resistance, a served one eases, and a decree bypasses the chamber on top.
function touch(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  const wire: WireLine[] = [];
  wire.push(...raiseResistance(pack, game, tag.hits, RESIST_HIT, tag.title));
  wire.push(...easeResistance(pack, game, tag.serves, RESIST_SERVE, tag.title));
  if (tag.verb === "decree") {
    const ch = chamberHolder(pack);
    if (ch) wire.push(...raiseResistance(pack, game, [ch.id], RESIST_BYPASS, `${tag.title}, made without the chamber`));
  }
  return wire;
}

export function commit(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  if (!canAfford(pack, game, tag.charge)) throw new Error("The ledgers cannot afford that act.");
  const wire = pay(pack, game, tag.charge, tag.title);
  wire.push(...touch(pack, game, tag));
  if (tag.revenue.length) {
    enact(game, {
      id: `act-${game.term}-${game.turn}-${game.acts.length}`, verb: tag.verb, title: tag.title,
      perTurn: tag.revenue, repealConsent: consentOf(pack, game, tag.verb), sunset: tag.sunset,
    });
  }
  for (const t of tag.keeps) keepPromise(pack, game, t);
  for (const p of tag.promises) authorPromise(game, p.tag, p.label, game.turn + p.window);
  if (tag.verb === "law") {
    game.bills.push({ id: game.turn, text: tag.reading, title: tag.title, summary: tag.reading, tags: tag.tags, offers: {} });
    game.phase = "whip";
  }
  game.acts.push({
    term: game.term, turn: game.turn, verb: tag.verb, title: tag.title,
    reading: tag.reading, credibility: tag.credibility, charge: tag.charge,
  });
  game.tag = null;
  pushWire(game, wire);
  return wire;
}

// R11: an act whose repeal needs no consent can be taken back; a law needs a repeal through the same door.
export function withdraw(pack: Pack, game: Game, id: string): WireLine[] {
  const law = game.inForce.find((l) => l.id === id);
  if (!law) throw new Error("No such act.");
  if (law.repealConsent !== "none") throw new Error("That one needs a repeal.");
  const price: Price = { authority: WITHDRAW_COST, treasury: 0, chest: 0 };
  if (!canAfford(pack, game, price)) throw new Error("The ledgers cannot afford that act.");
  const wire = pay(pack, game, price, `withdrew ${law.title}`);
  repeal(game, id);
  pushWire(game, wire);
  return wire;
}

// The floor is a sum of independent draws, so its spread is the square root of the sum of p(1-p).
export function whipBand(whip: Record<string, number>): [number, number] {
  const ps = Object.values(whip);
  const yes = ps.reduce((a, b) => a + b, 0);
  const sd = Math.sqrt(ps.reduce((a, p) => a + p * (1 - p), 0));
  const r = (x: number) => Math.round(clamp(x, 0, ps.length) * 10) / 10;
  return [r(yes - 1.96 * sd), r(yes + 1.96 * sd)];
}
