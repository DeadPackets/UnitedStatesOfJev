import { belowLine, CAMPAIGN_FROM, holdersOf, weightOf, type Game, type PriceTag, type Quote } from "./engine";
import type { Consent, Instrument, Pack, Price, Verb } from "./pack";

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
