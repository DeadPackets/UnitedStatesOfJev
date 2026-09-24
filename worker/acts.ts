import {
  actTokens, agrees, armyHolder, CARD_MOVE, cardLean, cardShift, votePreview, authorPromise, belowLine, CAMPAIGN_FROM, canAfford, chamberHolder, clamp, enact, FAVOR_OWED, holdersOf, keepPromise, movePopularity, moveSupport, pay,
  publicHolder, pushWire, repeal, SUPPORT_BYPASS, SUPPORT_HIT, SUPPORT_SERVE, weightOf,
  type Bill, type Game, type Member, type Preview, type PriceTag, type Quote, type Term, type Veto, type WireLine,
} from "./engine";
import type { Instrument, Pack, Price, Verb } from "./pack";

export const CAMPAIGN_DISCOUNT = 0.25;  // TUNE, C4

const round1 = (x: number) => Math.round(x * 10) / 10;

// A pack built before v4 has no constitution: it keeps the two doors v3 had, the bill and the post, free as they were.
const v3Instrument = (pack: Pack, verb: Verb): Instrument | null => verb === "law" || verb === "proclaim"
  ? { name: verb === "law" ? pack.vocabulary.bill : pack.vocabulary.post, vetoes: verb === "law" ? ["chamber"] : [],
      price: { authority: 0, treasury: 0, chest: 0 }, available: true }
  : null;

export const instrumentOf = (pack: Pack, verb: Verb): Instrument | null =>
  pack.constitution ? pack.constitution.instruments[verb] ?? null : v3Instrument(pack, verb);

const CHAMBER = new Set(["chamber", "chamber_supermajority"]);

// R29: who must agree to this verb. R19: emergency powers set the chamber aside while they hold.
export function vetoesOf(pack: Pack, game: Game, verb: Verb): string[] {
  const v = instrumentOf(pack, verb)?.vetoes ?? [];
  return game.emergency !== null && game.turn <= game.emergency ? v.filter((x) => !CHAMBER.has(x)) : v;
}

// R29, the rule this build chose: a group agrees while its support is at or over its line, the same line whose
// crossing starts its warning. A law's chamber agrees through the floor vote, so it is not asked here; on any
// other verb the chamber agrees while the seats backing you carry a vote (a supermajority where one is written).
// R30: a veto group whose red line the act crosses refuses whatever its support.
export function vetoRows(pack: Pack, game: Game, verb: Verb, tokens?: Set<string>): Veto[] {
  return vetoesOf(pack, game, verb).flatMap((veto): Veto[] => {
    if (CHAMBER.has(veto)) {
      const chamber = chamberHolder(pack);
      if (verb === "law" || !chamber) return [];
      const seats = Math.round(((game.holders[chamber.id]?.support ?? 0) * pack.chamber.size) / 100);
      const need = veto === "chamber" ? pack.chamber.threshold : pack.chamber.supermajority;
      const reason = `${seats} of ${pack.chamber.size} seats back you; it needs ${need}`;
      return [{ id: chamber.id, name: chamber.name, agrees: seats >= need, reason }];
    }
    const holder = holdersOf(pack).find((candidate) => candidate.id === veto);
    const state = game.holders[veto];
    if (!holder || !state) return [];
    const redLine = tokens ? cardLean(holder.card, tokens) : null;
    if (redLine?.lean === -2) return [{ id: veto, name: holder.name, agrees: false, reason: redLine.reason }];
    const reason = `support ${Math.round(state.support)}, its line ${state.line}`;
    return [{ id: veto, name: holder.name, agrees: agrees(game, veto), reason }];
  });
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

// The first group that will not agree: the act can be priced, so the tag shows who refuses, but not signed.
export const blocker = (pack: Pack, game: Game, verb: Verb, tokens?: Set<string>): Veto | undefined =>
  vetoRows(pack, game, verb, tokens).find((veto) => !veto.agrees);

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
  const tokens = actTokens(q);
  // The named holders, then every other holder whose card the act touches, with the card's reason (as touch() moves them).
  const stances = holdersOf(pack).flatMap((holder) => {
    const state = game.holders[holder.id];
    const named = q.serves.includes(holder.id) || q.hits.includes(holder.id);
    const { lean, reason } = named ? { lean: 0, reason: "" } : cardLean(holder.card, tokens);
    if (!state || (!named && !lean)) return [];
    const row = { id: holder.id, name: holder.name, support: state.support, line: state.line };
    return [reason ? { ...row, reason } : row];
  }).sort((first, second) => rank(q, first.id) - rank(q, second.id));
  return {
    verb: q.verb, title: q.title, reading: q.reading, credibility: q.credibility,
    quoted: { authority: q.cost.authority, treasury: q.cost.treasury, chest: q.cost.chest },
    charge, discounted: d < 1, revenue,
    serves: q.serves, hits: q.hits, keeps: q.keeps, targets: q.targets, tags: q.tags, regions: q.regions,
    member, promises: q.promises, sunset: q.sunset, template: q.template, stances,
    vetoes: vetoRows(pack, game, q.verb, tokens),
    ...(q.verb === "law" ? { shift: cardShift(pack, tokens) } : {}),
  };
}
const rank = (q: Quote, id: string) => (q.serves.includes(id) ? 0 : q.hits.includes(id) ? 1 : 2);

export const WITHDRAW_COST = 2;   // TUNE, R11: a decree can be taken back for authority

// Spec §2: a hit holder loses support, a served one gains it, and a decree bypasses the chamber on top.
function touch(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  const wire: WireLine[] = [];
  wire.push(...moveSupport(pack, game, tag.hits, -SUPPORT_HIT, tag.title));
  wire.push(...moveSupport(pack, game, tag.serves, SUPPORT_SERVE, tag.title));
  if (tag.verb === "decree") {
    const ch = chamberHolder(pack);
    if (ch) wire.push(...moveSupport(pack, game, [ch.id], -SUPPORT_BYPASS, `${tag.title}, made without the chamber`));
  }
  // R30: a group the clerk did not name still answers by its card.
  const tokens = actTokens(tag);
  for (const holder of holdersOf(pack)) {
    if (tag.serves.includes(holder.id) || tag.hits.includes(holder.id)) continue;
    const { lean, reason } = cardLean(holder.card, tokens);
    if (lean) wire.push(...moveSupport(pack, game, [holder.id], CARD_MOVE[lean], `${tag.title}: ${reason}`));
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
export const FORCE_RESENT = 6;         // TUNE: what the holders it fell on go on resenting

function applyForce(pack: Pack, game: Game, tag: PriceTag): WireLine[] {
  const wire: WireLine[] = [];
  const a = armyHolder(pack);
  if (a) {
    const willing = agrees(game, a.id);
    wire.push(...moveSupport(pack, game, [a.id], willing ? FORCE_ARMY_EASE : -FORCE_ARMY_RISE, tag.title));
  }
  // R24 folds the street's resistance and the region's popularity into one number, so both hits land on it.
  const street = publicHolder(pack);
  if (street) wire.push(...moveSupport(pack, game, [street.id], -FORCE_POP_HIT, tag.title));
  wire.push(...moveSupport(pack, game, tag.hits, -FORCE_RESENT, tag.title));
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
      return moveSupport(pack, game, pushed, -SUPPORT_HIT, tag.title);
    }
    case "emergency_powers":
      game.emergency = game.turn + EMERGENCY_TURNS;
      return [];
    default: return [];
  }
}

// The bill a priced law tables, with the count and shifts the tag already holds.
export const billOf = (game: Game, tag: PriceTag): Bill => ({
  id: game.turn, text: tag.reading, title: tag.title, summary: tag.reading, tags: tag.tags, offers: {},
  rates: tag.revenue, keeps: tag.keeps, sunset: tag.sunset, ...tag.count, ...(tag.shift ? { shift: { ...tag.shift } } : {}),
});

// R30: the preview a priced law shows; it needs the whip count, so a tag priced without one has none.
// A faction with hesitant seats that has not dealt on this act yet lists its terms.
export function previewOf(pack: Pack, game: Game, tag: PriceTag): Preview | null {
  if (tag.verb !== "law" || !tag.count) return null;
  const preview = votePreview(pack, game, billOf(game, tag), actTokens(tag));
  if (!preview) return null;
  const dealt = tag.negotiated ?? [];
  const factions = preview.factions.map((faction) => {
    if (!faction.hesitant || dealt.includes(faction.id)) return faction;
    return { ...faction, terms: termsOf(pack, game, faction.id, faction.hesitant) };
  });
  return { ...preview, factions };
}

export const NEGOTIATE_LIFT = 0.34;   // TUNE: lifts a hesitant seat (under 2/3) over the for line, an against seat to hesitant
export const PLEDGE_DUE = 4;          // TUNE, the mock's: turns to deliver what was pledged
export const SEAT_PRICE = 2;          // TUNE, the mock's: chest per hesitant seat

// R30: a pledge to the first thing its card backs that no promise holds yet, a post, or money for its hesitant seats.
export function termsOf(pack: Pack, game: Game, factionId: string, hesitant: number): Term[] {
  const faction = pack.factions.find((candidate) => candidate.id === factionId);
  if (!faction) return [];
  const free: Price = { authority: 0, treasury: 0, chest: 0 };
  const terms: Term[] = [];
  for (const want of faction.card?.wants ?? []) {
    const subject = want.match.yes.find((cardTag) => pack.tags.includes(cardTag) && !game.promises[cardTag]);
    if (!subject) continue;
    terms.push({ kind: "pledge", label: want.yes[0] ?? want.want, cost: free, tag: subject, due: game.turn + PLEDGE_DUE });
    break;
  }
  const postPrice = instrumentOf(pack, "appoint")?.price ?? free;
  terms.push({ kind: "post", label: `A post for ${faction.card?.face.name ?? faction.leader}`, cost: postPrice });
  const money = SEAT_PRICE * hesitant;
  terms.push({ kind: "money", label: `${money} from the chest`, cost: { ...free, chest: money } });
  return terms;
}

// Accepting a term pays it and lifts the faction's seats for this act. A pledge is the promise machinery: one
// passed law on its subject keeps it; past its turn it breaks and decays as any promise does.
export function negotiate(pack: Pack, game: Game, tag: PriceTag, factionId: string, term: Term): WireLine[] {
  const name = pack.factions.find((faction) => faction.id === factionId)?.name ?? factionId;
  const wire = pay(pack, game, term.cost, `terms with ${name}`);
  if (term.kind === "pledge" && term.tag) {
    authorPromise(game, term.tag, term.label, term.due);
    game.promises[term.tag].passed = 1;
  }
  if (term.kind === "post") {
    const postId = `appoint-${factionId}`;
    repeal(game, postId);
    enact(game, { id: postId, verb: "appoint", title: term.label, perTurn: [], repealVetoes: [], sunset: null });
  }
  tag.shift = { ...tag.shift, [factionId]: (tag.shift?.[factionId] ?? 0) + NEGOTIATE_LIFT };
  tag.negotiated = [...(tag.negotiated ?? []), factionId];
  tag.preview = previewOf(pack, game, tag);
  pushWire(game, wire);
  return wire;
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
    game.bills.push(billOf(game, tag));
    game.phase = "whip";
  } else {
    if (tag.revenue.length || tag.verb === "appoint") {
      enact(game, {
        id, verb: tag.verb, title: tag.title, perTurn: tag.revenue,
        repealVetoes: vetoesOf(pack, game, tag.verb), sunset: tag.sunset,
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
  if (law.repealVetoes.length) throw new Error("That one needs a repeal.");
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
