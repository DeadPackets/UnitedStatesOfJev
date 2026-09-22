import { test, expect } from "bun:test";
import { available, CAMPAIGN_DISCOUNT, consentOf, discountOf, instrumentOf, priceTag } from "./acts";
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
