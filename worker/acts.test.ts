import { test, expect } from "bun:test";
import { available, CAMPAIGN_DISCOUNT, commit, consentOf, discountOf, instrumentOf, priceTag, whipBand, withdraw, WITHDRAW_COST } from "./acts";
import { CAMPAIGN_FROM, encodeCode, newGame, scenarioTag, type Game, type Quote } from "./engine";
import { PackSchema, type Citizen, type Pack } from "./pack";
import mini from "./fixtures/mini.json";

const REGIONS = mini.regions.map((r) => r.id);
const citizens = (): Citizen[] => Array.from({ length: 250 }, (_, i) => ({
  id: `c-${i}`, region: REGIONS[i % REGIONS.length], bloc: `b0${(i % 5) + 1}`, name: `Citizen ${i}`,
  age: 30, job: "harbor worker", town: "Harbor City", worldview: "wants the harbor to work",
  issues: ["tariffs", "dockworker-pay"] as [string, string], weight: 1,
}));
export const pack: Pack = PackSchema.parse({ ...mini, citizens: citizens() });
const CODE = encodeCode({ scenario: scenarioTag(mini.id), faction: 0, promises: [0, 1, 2], seed: 11 });
export const game = (): Game => newGame("g", CODE, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);

export const quote = (over: Partial<Quote> = {}): Quote => ({
  verb: "decree", title: "Raise the harbour levy", reading: "You raise the levy on the wharf.",
  power: true, era: true, refusal: null, credibility: 1,
  cost: { authority: 0, treasury: 0, chest: 0 }, revenue: [],
  serves: [], hits: [], keeps: [], targets: null, tags: ["tariffs"], regions: [],
  promises: [], sunset: null, template: null, ...over,
});

test("the charge is the instrument's price plus what Luna quoted", () => {
  const g = game();
  expect(instrumentOf(pack, "decree")!.price.authority).toBe(3);
  const t = priceTag(pack, g, quote({ cost: { authority: 1, treasury: 4, chest: 0 } }));
  expect(t.charge).toEqual({ authority: 4, treasury: 4, chest: 0 });
  expect(t.discounted).toBe(false);
});

test("credibility scales what the act gains and never what it costs", () => {
  const g = game();
  const t = priceTag(pack, g, quote({
    credibility: 0.6, cost: { authority: 0, treasury: 10, chest: 0 },
    revenue: [{ ledger: "treasury", id: null, delta: 10 }, { ledger: "treasury", id: null, delta: -10 }],
  }));
  expect(t.charge.treasury).toBe(10);            // the sum is charged in full; credibility never cuts a cost
  expect(t.charge.authority).toBe(3);            // the decree's standing price
  expect(t.revenue[0].delta).toBe(6);            // a gain is scaled
  expect(t.revenue[1].delta).toBe(-10);          // a cost is not
});

test("the last four turns of the term cut the price of an act that serves a test holder", () => {
  const g = game();
  expect(discountOf(pack, g, ["council"])).toBe(1);
  g.turn = CAMPAIGN_FROM;
  expect(discountOf(pack, g, ["guard"])).toBe(1);          // guard has weight 0, so it is not a test holder
  expect(discountOf(pack, g, ["council"])).toBeCloseTo(1 - CAMPAIGN_DISCOUNT, 5);
  const t = priceTag(pack, g, quote({ serves: ["council"], cost: { authority: 1, treasury: 0, chest: 0 } }));
  expect(t.charge.authority).toBe(3);                       // the decree's 3 discounted to 2, plus the quoted 1
  expect(t.quoted.authority).toBe(1);                       // the quoted sum is never discounted
  expect(t.discounted).toBe(true);
});

test("consent and availability come from the constitution and the failure lines", () => {
  const g = game();
  expect(consentOf(pack, g, "law")).toBe("chamber");
  expect(consentOf(pack, g, "force")).toBe("army");
  expect(available(pack, g, "force")).toBe(true);
  g.ledgers.authority = 0;
  expect(available(pack, g, "force")).toBe(false);          // authority at its line leaves proclaim and spend
  expect(available(pack, g, "proclaim")).toBe(true);
  expect(available(pack, g, "spend")).toBe(false);          // treasury is also at 0, which blocks spending
  g.ledgers.treasury = 20;
  expect(available(pack, g, "spend")).toBe(true);
});

test("the tag prints each named holder's last stance", () => {
  const g = game();
  g.holders.league.resistance = 30;
  const t = priceTag(pack, g, quote({ serves: ["council"], hits: ["league"] }));
  expect(t.stances.map((s) => s.id)).toEqual(["council", "league"]);
  expect(t.stances[1]).toEqual({ id: "league", name: "the Grain League", stance: 0.5, resistance: 30, line: 50 });
});

test("a decree is paid for, raises resistance where it hits and eases it where it serves", () => {
  const g = game();
  g.holders.council.resistance = 20;
  const before = g.ledgers.authority;
  const tag = priceTag(pack, g, quote({ serves: ["council"], hits: ["league", "street"] }));
  const wire = commit(pack, g, tag);
  expect(g.ledgers.authority).toBe(before - 3);
  expect(g.holders.league.resistance).toBe(8);        // RESIST_HIT
  expect(g.holders.street.resistance).toBe(8);
  expect(g.holders.council.resistance).toBe(22);      // 20, eased 10 for the service, then 12 for the bypass
  expect(g.holders.guard.resistance).toBe(0);         // it was neither served nor hit
  expect(wire.some((w) => w.kind === "resistance")).toBe(true);
  expect(g.acts.at(-1)).toMatchObject({ turn: 1, verb: "decree", title: "Raise the harbour levy", credibility: 1 });
  expect(g.tag).toBeNull();
});

test("a decree that could have been a law raises the chamber's resistance on top", () => {
  const g = game();
  const tag = priceTag(pack, g, quote({ hits: [] }));
  commit(pack, g, tag);
  expect(g.holders.council.resistance).toBe(12);      // RESIST_BYPASS: the council could have made this
});

test("an act with a rate goes on the books and can be withdrawn for authority", () => {
  const g = game();
  const tag = priceTag(pack, g, quote({ revenue: [{ ledger: "treasury", id: null, delta: 6 }] }));
  commit(pack, g, tag);
  expect(g.inForce).toHaveLength(1);
  expect(g.inForce[0].perTurn[0].delta).toBe(6);
  expect(g.inForce[0].repealConsent).toBe("none");
  const id = g.inForce[0].id;
  const a = g.ledgers.authority;
  withdraw(pack, g, id);
  expect(g.inForce).toEqual([]);
  expect(g.ledgers.authority).toBe(a - WITHDRAW_COST);
});

test("an act the ledgers cannot pay for is refused before anything moves", () => {
  const g = game();
  g.ledgers.authority = 1;
  const tag = priceTag(pack, g, quote());
  expect(() => commit(pack, g, tag)).toThrow("afford");
  expect(g.ledgers.authority).toBe(1);
});

test("an authored promise from the act's own words starts its window", () => {
  const g = game();
  commit(pack, g, priceTag(pack, g, quote({ promises: [{ tag: "new-quay", label: "A new quay by winter", window: 6 }] })));
  // Stage A stores the window as an absolute turn: turn 1 plus the 6 the ruler gave themselves.
  expect(g.promises["new-quay"]).toMatchObject({ label: "A new quay by winter", window: 7, authored: true, state: "pending" });
});

test("a law tag puts a bill on the floor with the act's own tags", () => {
  const g = game();
  commit(pack, g, priceTag(pack, g, quote({ verb: "law", keeps: ["tariffs"], tags: ["tariffs"] })));
  expect(g.bills).toHaveLength(1);
  expect(g.bills[0].id).toBe(g.turn);
  expect(g.bills[0].tags).toEqual(["tariffs"]);
  expect(g.bills[0].title).toBe("Raise the harbour levy");
  expect(g.phase).toBe("whip");
  expect(g.holders.council.resistance).toBe(0);   // a law is the chamber's own door, so no bypass rise
});

test("the band is the 95% spread of the yes count, not a point", () => {
  const sure = whipBand({ a: 1, b: 1, c: 1, d: 0 });
  expect(sure).toEqual([3, 3]);
  const [lo, hi] = whipBand(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`m${i}`, 0.5])));
  expect(lo).toBeCloseTo(30 - 1.96 * Math.sqrt(15), 0);
  expect(hi).toBeCloseTo(30 + 1.96 * Math.sqrt(15), 0);
  expect(lo).toBeGreaterThanOrEqual(0);
});

import { SPEND_LIFT } from "./acts";

test("spending on two regions lifts only those two, scaled by credibility", () => {
  const g = game();
  g.ledgers.treasury = 40;
  const before = { ...g.ledgers.popularity };
  const two = [pack.regions[0].id, pack.regions[1].id];
  const tag = priceTag(pack, g, quote({
    verb: "spend", credibility: 0.8, regions: two, serves: ["street"],
    cost: { authority: 0, treasury: 20, chest: 0 },
  }));
  commit(pack, g, tag);
  expect(g.ledgers.treasury).toBe(20);
  const lift = Math.round((20 * SPEND_LIFT * 0.8) / 2 * 10) / 10;
  expect(g.ledgers.popularity[two[0]]).toBeCloseTo(before[two[0]] + lift, 1);
  expect(g.ledgers.popularity[two[1]]).toBeCloseTo(before[two[1]] + lift, 1);
  expect(g.ledgers.popularity[pack.regions[2].id]).toBeCloseTo(before[pack.regions[2].id], 5);
});

test("a spend that names no region is spread over the whole polity", () => {
  const g = game();
  g.ledgers.chest = 30;
  const before = { ...g.ledgers.popularity };
  commit(pack, g, priceTag(pack, g, quote({ verb: "spend", cost: { authority: 0, treasury: 0, chest: 12 } })));
  for (const r of pack.regions) expect(g.ledgers.popularity[r.id]).toBeGreaterThan(before[r.id]);
});

test("the campaign discount cuts a price and never what the money buys", () => {
  const g = game(), h = game();
  h.turn = CAMPAIGN_FROM;
  g.ledgers.treasury = 40; h.ledgers.treasury = 40;
  const one = pack.regions[0].id;
  const q = quote({ verb: "spend", serves: ["council"], regions: [one], cost: { authority: 0, treasury: 20, chest: 0 } });
  const early = priceTag(pack, g, q), late = priceTag(pack, h, q);
  expect(late.discounted).toBe(true);
  expect(late.charge.treasury).toBe(early.charge.treasury);   // a spend's own sum is outside the discount
  commit(pack, g, early);
  commit(pack, h, late);
  expect(h.ledgers.popularity[one]).toBeCloseTo(g.ledgers.popularity[one], 5);
});

test("an appointment lowers the post's resistance and a second one replaces the first", () => {
  const g = game();
  g.holders.guard.resistance = 40;
  commit(pack, g, priceTag(pack, g, quote({ verb: "appoint", title: "A captain of the watch", serves: ["guard"] })));
  expect(g.holders.guard.resistance).toBe(30);           // RESIST_SERVE
  expect(g.inForce.map((l) => l.id)).toEqual(["appoint-guard"]);
  expect(g.inForce[0].verb).toBe("appoint");

  g.turn = 4;
  commit(pack, g, priceTag(pack, g, quote({ verb: "appoint", title: "A new captain", serves: ["guard"] })));
  expect(g.inForce.map((l) => l.id)).toEqual(["appoint-guard"]);   // replaced, not stacked
  expect(g.inForce[0].title).toBe("A new captain");
  expect(g.inForce[0].turn).toBe(4);

  commit(pack, g, priceTag(pack, g, quote({ verb: "appoint", title: "A clerk of the roll", serves: ["council"] })));
  expect(g.inForce.map((l) => l.id).sort()).toEqual(["appoint-council", "appoint-guard"]);
});
