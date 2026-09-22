import {
  ARMY_STANCE, armyAllows, armyHolder, authorPromise, belowLine, CAMPAIGN_FROM, canAfford, clamp, easeResistance, enact, FAVOR_OWED, holdersOf, keepPromise, movePopularity, pay,
  pushWire, raiseResistance, repeal, RESIST_BYPASS, RESIST_HIT, RESIST_SERVE, weightOf,
  type Game, type Member, type PriceTag, type Quote, type WireLine,
} from "./engine";
import type { Consent, Holder, Instrument, Pack, Price, Verb } from "./pack";

export const CAMPAIGN_DISCOUNT = 0.25;  // TUNE, C4

const round1 = (x: number) => Math.round(x * 10) / 10;

// A pack built before v4 has no constitution: it keeps the two doors v3 had, the bill and the post, free as they were.
const v3Instrument = (pack: Pack, verb: Verb): Instrument | null => verb === "law" || verb === "proclaim"
  ? { name: verb === "law" ? pack.vocabulary.bill : pack.vocabulary.post, consent: verb === "law" ? "chamber" : "none",
      price: { authority: 0, treasury: 0, chest: 0 }, available: true }
  : null;

export const instrumentOf = (pack: Pack, verb: Verb): Instrument | null =>
  pack.constitution ? pack.constitution.instruments[verb] ?? null : v3Instrument(pack, verb);

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
  if (verb === "force" && i.consent === "army" && !armyAllows(pack, game)) return false;
  return true;
}

// C4: in the last four turns an act aimed at a holder that votes in the test costs less.
export function discountOf(pack: Pack, game: Game, serves: string[]): number {
  if (game.turn < CAMPAIGN_FROM) return 1;
  return serves.some((id) => weightOf(pack, id) > 0) ? 1 - CAMPAIGN_DISCOUNT : 1;
}

export function priceTag(pack: Pack, game: Game, q: Quote, member: string | null = null): PriceTag {
  const seat = member ? game.members.find((m) => m.id === member) : undefined;
  const base = q.verb === "favour" && seat
    ? favourCost(pack, game, seat)
    : instrumentOf(pack, q.verb)?.price ?? { authority: 0, treasury: 0, chest: 0 };
  const d = discountOf(pack, game, q.serves);
  // C4 discounts the instrument's standing price only. The quoted sum is the act's own size, and every
  // effect is derived from it, so discounting it would make a spend buy less for less and change nothing.
  const charge: Price = {
    authority: Math.round(base.authority * d) + q.cost.authority,
    treasury: Math.round(base.treasury * d) + q.cost.treasury,
    chest: Math.round(base.chest * d) + q.cost.chest,
  };
  // A power grab is never cheapened by the campaign, so the surcharge lands after the discount.
  if (q.template === "emergency_powers") charge.authority += EMERGENCY_COST;
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

export const SPEND_LIFT = 0.4;   // TUNE: popularity points per unit of treasury or chest handed out

// The lift reads the quoted sum, never tag.charge, so the campaign discount cannot shrink what a spend buys.
function applySpend(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  const spent = tag.quoted.treasury + tag.quoted.chest;
  const rs = tag.regions.length ? tag.regions : pack.regions.map((r) => r.id);
  const d = Math.round((spent * SPEND_LIFT * tag.credibility) / rs.length * 10) / 10;
  return movePopularity(pack, game, tag.regions, d, tag.title);
}

export const FAVOUR_STEP = 0.02;    // TUNE: each loyalty point below 100 adds this much to the price
export const FAVOUR_LOYALTY = 10;   // TUNE: what one favour is worth to the seat it buys
export const FAVOUR_MOOD = 0.1;     // TUNE: how much warmer the seat is on the floor afterwards

// §2: a favour is priced by the member. A hostile seat costs up to three times a co-factional one.
export function favourCost(pack: Pack, _game: Game, m: Member): Price {
  const base = instrumentOf(pack, "favour")?.price ?? { authority: 0, treasury: 0, chest: 0 };
  const k = 1 + (100 - clamp(m.loyalty, 0, 100)) * FAVOUR_STEP;
  return { authority: Math.round(base.authority * k), treasury: Math.round(base.treasury * k), chest: Math.round(base.chest * k) };
}

function applyFavour(_pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  const m = game.members.find((x) => x.id === tag.member);
  if (!m) return [];
  m.loyalty = clamp(m.loyalty + FAVOUR_LOYALTY, 0, 100);
  m.mood = clamp(Math.round((m.mood + FAVOUR_MOOD) * 10) / 10, -1, 1);
  m.memory = [...m.memory, FAVOR_OWED].slice(-5);
  return [];
}

export const FORCE_ARMY_EASE = 5;      // TUNE, §2: they like being used
export const FORCE_ARMY_RISE = 10;     // TUNE, §2: they do not
export const FORCE_POP_HIT = 4;        // TUNE: what the region and the street pay
// Resistance, not stance: the holder read rewrites stance every turn, so a stance drop here would not last.
export const FORCE_RESENT = 6;         // TUNE: what the holders it fell on go on resenting

function applyForce(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  const wire: WireLine[] = [];
  const a = armyHolder(pack);
  if (a) {
    const willing = (game.holders[a.id]?.stance ?? a.stance) >= ARMY_STANCE;
    wire.push(...(willing
      ? easeResistance(pack, game, [a.id], FORCE_ARMY_EASE, tag.title)
      : raiseResistance(pack, game, [a.id], FORCE_ARMY_RISE, tag.title)));
  }
  const street = holdersOf(pack).find((h) => h.members === "citizens");
  if (street) wire.push(...raiseResistance(pack, game, [street.id], FORCE_POP_HIT, tag.title));
  wire.push(...raiseResistance(pack, game, tag.hits, FORCE_RESENT, tag.title));
  wire.push(...movePopularity(pack, game, tag.regions, -FORCE_POP_HIT, tag.title));
  return wire;
}

function applyVerb(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  switch (tag.verb) {
    case "spend": return applySpend(pack, game, tag);
    case "favour": return applyFavour(pack, game, tag);
    case "force": return applyForce(pack, game, tag);
    default: return [];
  }
}

export const DRIFT_GAIN = 0.06;     // TUNE, R19: what a partisan notice adds to the base it speaks to
export const DRIFT_LOSS = 0.03;     // TUNE, R19: what it takes from the middle
export const MEDIA_STEP = 0.2;      // TUNE, R19: how much of the boo wave one step of state media damps
export const TRUST_STEP = 0.05;     // TUNE, R19: what the Feed stops believing in return
export const EMERGENCY_TURNS = 4;   // TUNE, R19
export const EMERGENCY_COST = 12;   // TUNE, R19: the authority a power grab costs on top of the decree
export const DRIFT_CAP = 0.5;       // TUNE, R19: how far a bloc can be pushed off its own read

const round2 = (x: number) => Math.round(x * 100) / 100;

// R19: three named paths, each priced inside a verb the ruler already has.
function applyTemplate(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  switch (tag.template) {
    case "bloc_drift": {
      const aimed = new Set(tag.targets ?? []);
      for (const b of pack.blocs) {
        const d = aimed.has(b.id) ? DRIFT_GAIN : -DRIFT_LOSS;
        game.drift[b.id] = round2(clamp((game.drift[b.id] ?? 0) + d, -DRIFT_CAP, DRIFT_CAP));
      }
      return [];
    }
    case "state_media": {
      game.media = round2(clamp(game.media + MEDIA_STEP, 0, 1));
      game.trust = round2(clamp(game.trust - TRUST_STEP, 0, 1));
      const pushed = holdersOf(pack).filter((h) => h.response === "strike" || h.members === "patrons").map((h) => h.id);
      return raiseResistance(pack, game, pushed, RESIST_HIT, tag.title);
    }
    case "emergency_powers":
      game.emergency = game.turn + EMERGENCY_TURNS;
      return [];
    default: return [];
  }
}

export function commit(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  if (!canAfford(pack, game, tag.charge)) throw new Error("The ledgers cannot afford that act.");
  const wire = pay(pack, game, tag.charge, tag.title);
  wire.push(...touch(pack, game, tag));
  wire.push(...applyVerb(pack, game, tag));
  wire.push(...applyTemplate(pack, game, tag));
  // R11: an appointment holds until another names the same post, so its row carries the holder's own id.
  const post = tag.verb === "appoint" ? tag.serves[0] ?? tag.hits[0] ?? null : null;
  const id = post ? `appoint-${post}` : `act-${game.term}-${game.turn}-${game.acts.length}`;
  if (post) repeal(game, id);
  // A law's rates and kept promises wait for the vote: applyVote enacts them only when it passes.
  if (tag.verb === "law") {
    game.bills.push({
      id: game.turn, text: tag.reading, title: tag.title, summary: tag.reading, tags: tag.tags, offers: {},
      rates: tag.revenue, keeps: tag.keeps, sunset: tag.sunset,
    });
    game.phase = "whip";
  } else {
    if (tag.revenue.length || tag.verb === "appoint") {
      enact(game, {
        id, verb: tag.verb, title: tag.title, perTurn: tag.revenue,
        repealConsent: consentOf(pack, game, tag.verb), sunset: tag.sunset,
      });
    }
    for (const t of tag.keeps) keepPromise(pack, game, t);
  }
  for (const p of tag.promises) authorPromise(game, p.tag, p.label, game.turn + p.window);
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
