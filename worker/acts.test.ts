import { test, expect } from "bun:test";
import {
  available,
  blocker,
  CAMPAIGN_DISCOUNT,
  commit,
  discountOf,
  instrumentOf,
  previewOf,
  priceTag,
  vetoesOf,
  whipBand,
  withdraw,
  WITHDRAW_COST,
} from "./acts";
import {
  applyVote,
  armyHolder,
  CAMPAIGN_FROM,
  encodeCode,
  newGame,
  scenarioTag,
  type Game,
  type Quote,
} from "./engine";
import { PackSchema, type Citizen, type Pack } from "./pack";
import mini from "./fixtures/mini.json";

const REGIONS = mini.regions.map((r) => r.id);
const citizens = (): Citizen[] =>
  Array.from({ length: 250 }, (_, i) => ({
    id: `c-${i}`,
    region: REGIONS[i % REGIONS.length],
    bloc: `b0${(i % 5) + 1}`,
    name: `Citizen ${i}`,
    age: 30,
    job: "harbor worker",
    town: "Harbor City",
    worldview: "wants the harbor to work",
    issues: ["tariffs", "dockworker-pay"] as [string, string],
    weight: 1,
  }));
export const pack: Pack = PackSchema.parse({ ...mini, citizens: citizens() });
const CODE = encodeCode({
  scenario: scenarioTag(mini.id),
  faction: 0,
  promises: [0, 1, 2],
  seed: 11,
});
export const game = (): Game =>
  newGame(
    "g",
    CODE,
    pack,
    "harborites",
    ["dockworker-pay", "tariffs", "fish-quotas"],
    pack.calendar,
  );

export const quote = (over: Partial<Quote> = {}): Quote => ({
  verb: "decree",
  title: "Raise the harbour levy",
  reading: "You raise the levy on the wharf.",
  power: true,
  era: true,
  refusal: null,
  credibility: 1,
  cost: { authority: 0, treasury: 0, chest: 0 },
  revenue: [],
  serves: [],
  hits: [],
  keeps: [],
  targets: null,
  tags: ["tariffs"],
  regions: [],
  promises: [],
  sunset: null,
  template: null,
  ...over,
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
  const t = priceTag(
    pack,
    g,
    quote({
      credibility: 0.6,
      cost: { authority: 0, treasury: 10, chest: 0 },
      revenue: [
        { ledger: "treasury", id: null, delta: 10 },
        { ledger: "treasury", id: null, delta: -10 },
      ],
    }),
  );
  expect(t.charge.treasury).toBe(10); // the sum is charged in full; credibility never cuts a cost
  expect(t.charge.authority).toBe(3); // the decree's standing price
  expect(t.revenue[0].delta).toBe(6); // a gain is scaled
  expect(t.revenue[1].delta).toBe(-10); // a cost is not
});

test("the last four turns of the term cut the price of an act that serves a test holder", () => {
  const g = game();
  expect(discountOf(pack, g, ["council"])).toBe(1);
  g.turn = CAMPAIGN_FROM;
  expect(discountOf(pack, g, ["guard"])).toBe(1); // guard has weight 0, so it is not a test holder
  expect(discountOf(pack, g, ["council"])).toBeCloseTo(1 - CAMPAIGN_DISCOUNT, 5);
  const t = priceTag(
    pack,
    g,
    quote({ serves: ["council"], cost: { authority: 1, treasury: 0, chest: 0 } }),
  );
  expect(t.charge.authority).toBe(3); // the decree's 3 discounted to 2, plus the quoted 1
  expect(t.quoted.authority).toBe(1); // the quoted sum is never discounted
  expect(t.discounted).toBe(true);
});

test("vetoes and availability come from the constitution and the failure lines", () => {
  const g = game();
  expect(vetoesOf(pack, g, "law")).toEqual(["chamber"]);
  expect(vetoesOf(pack, g, "force")).toEqual(["guard"]); // an old pack's consent "army" is the holder force moves
  expect(available(pack, g, "force")).toBe(true);
  g.ledgers.authority = 0;
  g.ledgers.treasury = 0;
  expect(available(pack, g, "force")).toBe(false); // authority at its line leaves proclaim and spend
  expect(available(pack, g, "proclaim")).toBe(true);
  expect(available(pack, g, "spend")).toBe(false); // treasury is also at 0, which blocks spending
  g.ledgers.treasury = 20;
  expect(available(pack, g, "spend")).toBe(true);
});

// R29: every veto holder must agree; a group agrees at or over its line, the chamber while its backing seats carry the vote.
const vetoed = (vetoes: string[]): Pack => ({
  ...pack,
  constitution: {
    ...pack.constitution!,
    instruments: {
      ...pack.constitution!.instruments,
      decree: { ...pack.constitution!.instruments.decree, vetoes },
    },
  },
});
for (const [vetoes, set, blocked] of [
  [[], {}, undefined],
  [["guard"], { guard: 55 }, undefined],
  [["guard"], { guard: 54 }, "guard"],
  [["guard", "league"], { guard: 60, league: 10 }, "league"],
  [["chamber"], { council: (13 / 24) * 100 }, undefined],
  [["chamber"], { council: (12 / 24) * 100 }, "council"],
  [["chamber_supermajority"], { council: (15 / 24) * 100 }, "council"],
] as [string[], Record<string, number>, string | undefined][]) {
  test(`a decree vetoed by ${vetoes.join(" and ") || "no one"} with ${JSON.stringify(set)} is blocked by ${blocked ?? "no one"}`, () => {
    const g = game();
    for (const [id, s] of Object.entries(set)) {
      g.holders[id].support = s;
      g.holders[id].line = id === "guard" ? 55 : g.holders[id].line;
    }
    const p = vetoed(vetoes);
    expect(blocker(p, g, "decree")?.id).toBe(blocked);
    expect(priceTag(p, g, quote()).vetoes!.find((v) => !v.agrees)?.id).toBe(blocked);
  });
}

test("the palace that can dismiss you is not the army: force is vetoed by the holder force moves", () => {
  const palace = {
    ...pack.constitution!.holders[1],
    id: "palace",
    name: "The Palace",
    levers: ["appoint"],
    response: "dismiss" as const,
  };
  const p = PackSchema.parse({
    ...mini,
    citizens: pack.citizens,
    constitution: { ...mini.constitution, holders: [palace, ...mini.constitution.holders] },
  });
  expect(armyHolder(p)!.id).toBe("guard");
  expect(vetoesOf(p, game(), "force")).toEqual(["guard"]);
});

test("the tag prints each named holder's support and line", () => {
  const g = game();
  g.holders.league.support = 43;
  const t = priceTag(pack, g, quote({ serves: ["council"], hits: ["league"] }));
  expect(t.stances.map((s) => s.id)).toEqual(["council", "league"]);
  expect(t.stances[1]).toEqual({ id: "league", name: "the Grain League", support: 43, line: 40 });
});

// R30: a card answers an act the clerk did not aim at its group: red line first, then each want in order.
const card = {
  base: "Grain factors of the upper quay",
  redLine: "Troops on the quay",
  redMatch: ["verb:force"],
  wants: [
    {
      want: "Low tariffs",
      yes: ["Cut the grain tariff"],
      no: ["Raise the grain tariff"],
      match: { yes: ["tariffs"], no: ["serves:street"] },
    },
  ],
  price: { takes: "a seat on the harbour board", refuses: "cash" },
  face: { name: "Ada Voss", role: "League factor", line: "Cut it and we pay." },
  rival: "street",
  tension: "Wants free trade, but hoards grain in a famine.",
};
const carded: Pack = {
  ...pack,
  constitution: {
    ...pack.constitution!,
    holders: pack.constitution!.holders.map((h) => (h.id === "league" ? { ...h, card } : h)),
  },
};
for (const [over, move, reason] of [
  [{ tags: ["tariffs"] }, 4, "Backs Cut the grain tariff"],
  [{ tags: ["tariffs"], serves: ["street"] }, -5, "Fights Raise the grain tariff"], // the first want decides: its no before its yes
  [{ verb: "force", tags: ["tariffs"] }, -10, "Red line: Troops on the quay"],
  [{ tags: ["fish-quotas"] }, 0, undefined],
  [{ tags: ["tariffs"], hits: ["league"] }, -8, undefined], // named by the clerk: SUPPORT_HIT only
] as [Partial<Quote>, number, string | undefined][]) {
  test(`a carded group answers ${JSON.stringify(over)} by ${move}`, () => {
    const g = game();
    g.holders.league.support = 50;
    const tag = priceTag(carded, g, quote(over));
    expect(tag.stances.find((s) => s.id === "league")?.reason).toBe(reason);
    commit(carded, g, tag);
    expect(g.holders.league.support).toBe(50 + move);
  });
}

// R30: a chamber faction's card shifts its seats' chances, and the preview buckets them from the same numbers.
const floor: Pack = {
  ...pack,
  factions: pack.factions.map((f) =>
    f.id === "tidebound"
      ? {
          ...f,
          card: {
            ...card,
            redMatch: ["piracy"],
            wants: [{ ...card.wants[0], match: { yes: ["tariffs"], no: ["fish-quotas"] } }],
          },
        }
      : f,
  ),
};
for (const [tags, bucket, reason] of [
  [["harbor-tolls"], "hesitant", "Nothing in it decides them"], // 0.6
  [["tariffs"], "for", "Backs Cut the grain tariff"], // 0.7
  [["fish-quotas"], "hesitant", "Fights Raise the grain tariff"], // 0.5
  [["piracy"], "against", "Red line: Troops on the quay"], // 0.3
] as [string[], "for" | "against" | "hesitant", string][]) {
  test(`a law on ${tags} puts the carded faction's seats ${bucket}`, () => {
    const g = game();
    for (const m of g.members) {
      m.mood = 0;
      m.loyalty = 100;
    }
    const tag = priceTag(floor, g, quote({ verb: "law", tags }));
    tag.count = { whip: Object.fromEntries(g.members.map((m) => [m.id, 0.6])) };
    const row = previewOf(floor, g, tag)!.factions.find((f) => f.id === "tidebound")!;
    expect(row[bucket]).toBe(6);
    expect(row.reason).toBe(reason);
  });
}

test("a veto group refuses an act over its red line whatever its support", () => {
  const g = game();
  g.holders.league.support = 90;
  const p: Pack = {
    ...carded,
    constitution: {
      ...carded.constitution!,
      instruments: {
        ...carded.constitution!.instruments,
        force: { ...carded.constitution!.instruments.force, vetoes: ["league"] },
      },
    },
  };
  expect(priceTag(p, g, quote({ verb: "force" })).vetoes).toEqual([
    {
      id: "league",
      name: "the Grain League",
      agrees: false,
      reason: "Red line: Troops on the quay",
    },
  ]);
  expect(priceTag(p, g, quote({ verb: "force", tags: [] })).vetoes![0].agrees).toBe(false);
  expect(blocker(p, g, "force")).toBeUndefined(); // with no act in hand, only its support counts
});

test("a decree is paid for, costs support where it hits and wins it where it serves", () => {
  const g = game();
  g.holders.guard.support = 40;
  const street = g.holders.street.support;
  const before = g.ledgers.authority;
  const tag = priceTag(pack, g, quote({ serves: ["guard"], hits: ["league", "street"] }));
  const wire = commit(pack, g, tag);
  expect(g.ledgers.authority).toBe(before - 3);
  expect(g.holders.league.support).toBe(42); // SUPPORT_HIT 8
  expect(g.holders.street.support).toBeCloseTo(street - 8, 0);
  expect(g.holders.guard.support).toBe(50); // SUPPORT_SERVE 10
  expect(g.holders.own.support).toBe(55); // it was neither served nor hit
  expect(wire.some((w) => w.kind === "support")).toBe(true);
  expect(g.acts.at(-1)).toMatchObject({
    turn: 1,
    verb: "decree",
    title: "Raise the harbour levy",
    credibility: 1,
  });
  expect(g.tag).toBeNull();
});

test("a decree that could have been a law costs the chamber seats on top", () => {
  const g = game();
  const tag = priceTag(pack, g, quote({ hits: [] }));
  commit(pack, g, tag);
  expect(g.holders.council.support).toBe(29.2); // SUPPORT_BYPASS 12 is 3 of 24 seats: 10 back you, then 7
});

test("an act with a rate goes on the books and can be withdrawn for authority", () => {
  const g = game();
  const tag = priceTag(pack, g, quote({ revenue: [{ ledger: "treasury", id: null, delta: 6 }] }));
  commit(pack, g, tag);
  expect(g.inForce).toHaveLength(1);
  expect(g.inForce[0].perTurn[0].delta).toBe(6);
  expect(g.inForce[0].repealVetoes).toEqual([]);
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
  commit(
    pack,
    g,
    priceTag(
      pack,
      g,
      quote({ promises: [{ tag: "new-quay", label: "A new quay by winter", window: 6 }] }),
    ),
  );
  // Stage A stores the window as an absolute turn: turn 1 plus the 6 the ruler gave themselves.
  expect(g.promises["new-quay"]).toMatchObject({
    label: "A new quay by winter",
    window: 7,
    authored: true,
    state: "pending",
  });
});

test("a law tag puts a bill on the floor, and its rate and promise wait for the vote", () => {
  const g = game();
  commit(
    pack,
    g,
    priceTag(
      pack,
      g,
      quote({
        verb: "law",
        keeps: ["tariffs"],
        tags: ["tariffs"],
        revenue: [{ ledger: "treasury", id: null, delta: 5 }],
      }),
    ),
  );
  expect(g.bills).toHaveLength(1);
  expect(g.bills[0].id).toBe(g.turn);
  expect(g.bills[0].tags).toEqual(["tariffs"]);
  expect(g.bills[0].title).toBe("Raise the harbour levy");
  expect(g.phase).toBe("whip");
  expect(g.holders.council.support).toBe(41.7); // a law is the chamber's own door, so no bypass cost
  expect(g.inForce).toEqual([]);
  expect(g.promises.tariffs.passed).toBe(0);
  g.bills[0].whip = Object.fromEntries(g.members.map((m) => [m.id, 1]));
  applyVote(pack, g, g.bills[0]);
  expect(g.bills[0].passed).toBe(true);
  expect(g.inForce.map((l) => l.perTurn)).toEqual([[{ ledger: "treasury", id: null, delta: 5 }]]);
  expect(g.promises.tariffs.passed).toBe(1); // counted once, though it is both a tag and a keep
});

test("the band is the 95% spread of the yes count, not a point", () => {
  const sure = whipBand({ a: 1, b: 1, c: 1, d: 0 });
  expect(sure).toEqual([3, 3]);
  const [lo, hi] = whipBand(
    Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`m${i}`, 0.5])),
  );
  expect(lo).toBeCloseTo(30 - 1.96 * Math.sqrt(15), 0);
  expect(hi).toBeCloseTo(30 + 1.96 * Math.sqrt(15), 0);
  expect(lo).toBeGreaterThanOrEqual(0);
});

import { SPEND_LIFT } from "./acts";

test("spending on two regions lifts only those two, scaled by credibility", () => {
  const g = game();
  g.ledgers.treasury = 40;
  const before = { ...g.regions };
  const two = [pack.regions[0].id, pack.regions[1].id];
  const tag = priceTag(
    pack,
    g,
    quote({
      verb: "spend",
      credibility: 0.8,
      regions: two,
      serves: ["guard"],
      cost: { authority: 0, treasury: 20, chest: 0 },
    }),
  );
  commit(pack, g, tag);
  expect(g.ledgers.treasury).toBe(20);
  const lift = Math.round(((20 * SPEND_LIFT * 0.8) / 2) * 10) / 10;
  expect(g.regions[two[0]]).toBeCloseTo(before[two[0]] + lift, 1);
  expect(g.regions[two[1]]).toBeCloseTo(before[two[1]] + lift, 1);
  expect(g.regions[pack.regions[2].id]).toBeCloseTo(before[pack.regions[2].id], 5);
});

test("a spend that names no region is spread over the whole polity", () => {
  const g = game();
  g.ledgers.chest = 30;
  const before = { ...g.regions };
  commit(
    pack,
    g,
    priceTag(pack, g, quote({ verb: "spend", cost: { authority: 0, treasury: 0, chest: 12 } })),
  );
  for (const r of pack.regions) expect(g.regions[r.id]).toBeGreaterThan(before[r.id]);
});

test("the campaign discount cuts a price and never what the money buys", () => {
  const g = game(),
    h = game();
  h.turn = CAMPAIGN_FROM;
  g.ledgers.treasury = 40;
  h.ledgers.treasury = 40;
  const one = pack.regions[0].id;
  const q = quote({
    verb: "spend",
    serves: ["council"],
    regions: [one],
    cost: { authority: 0, treasury: 20, chest: 0 },
  });
  const early = priceTag(pack, g, q),
    late = priceTag(pack, h, q);
  expect(late.discounted).toBe(true);
  expect(late.charge.treasury).toBe(early.charge.treasury); // a spend's own sum is outside the discount
  commit(pack, g, early);
  commit(pack, h, late);
  expect(h.regions[one]).toBeCloseTo(g.regions[one], 5);
});

test("an appointment wins the post's support and a second one replaces the first", () => {
  const g = game();
  g.holders.guard.support = 40;
  commit(
    pack,
    g,
    priceTag(
      pack,
      g,
      quote({ verb: "appoint", title: "A captain of the watch", serves: ["guard"] }),
    ),
  );
  expect(g.holders.guard.support).toBe(50); // SUPPORT_SERVE
  expect(g.inForce.map((l) => l.id)).toEqual(["appoint-guard"]);
  expect(g.inForce[0].verb).toBe("appoint");

  g.turn = 4;
  commit(
    pack,
    g,
    priceTag(pack, g, quote({ verb: "appoint", title: "A new captain", serves: ["guard"] })),
  );
  expect(g.inForce.map((l) => l.id)).toEqual(["appoint-guard"]); // replaced, not stacked
  expect(g.inForce[0].title).toBe("A new captain");
  expect(g.inForce[0].turn).toBe(4);

  commit(
    pack,
    g,
    priceTag(
      pack,
      g,
      quote({ verb: "appoint", title: "A clerk of the roll", serves: ["council"] }),
    ),
  );
  expect(g.inForce.map((l) => l.id).sort()).toEqual(["appoint-council", "appoint-guard"]);
});

import { FAVOUR_LOYALTY, FAVOUR_MOOD, FAVOUR_STEP, favourCost } from "./acts";

test("a favour costs more the further the member is from the government", () => {
  const g = game();
  const own = g.members.find((m) => m.faction === "harborites")!;
  const far = [...g.members].sort((a, b) => a.loyalty - b.loyalty)[0];
  expect(own.loyalty).toBe(100);
  expect(favourCost(pack, g, own).authority).toBe(2);
  expect(favourCost(pack, g, far).authority).toBe(
    Math.round(2 * (1 + (100 - far.loyalty) * FAVOUR_STEP)),
  );
  expect(favourCost(pack, g, far).authority).toBeGreaterThan(favourCost(pack, g, own).authority);
  const tag = priceTag(pack, g, quote({ verb: "favour" }), far.id);
  expect(tag.member).toBe(far.id);
  expect(tag.charge.authority).toBe(favourCost(pack, g, far).authority);
});

test("a favour lifts the member and leaves a favour owed", () => {
  const g = game();
  const m = [...g.members].sort((a, b) => a.loyalty - b.loyalty)[0];
  const was = m.loyalty;
  commit(
    pack,
    g,
    priceTag(pack, g, quote({ verb: "favour", title: "A place on the harbour board" }), m.id),
  );
  expect(m.loyalty).toBe(was + FAVOUR_LOYALTY);
  expect(m.mood).toBeCloseTo(FAVOUR_MOOD, 5);
  expect(m.memory.some((l) => l.includes("favor"))).toBe(true);
});

import { FORCE_ARMY_EASE, FORCE_ARMY_RISE, FORCE_POP_HIT, FORCE_RESENT } from "./acts";
import { armyAllows, endTurn } from "./engine";

test("force needs the army's support, and moves the army's support either way", () => {
  const g = game();
  expect(armyAllows(pack, g)).toBe(true); // the guard opens at 50
  const before = { ...g.regions };
  const [one, two] = [pack.regions[0].id, pack.regions[1].id];
  commit(
    pack,
    g,
    priceTag(
      pack,
      g,
      quote({ verb: "force", title: "The watch turned out", regions: [one], hits: ["street"] }),
    ),
  );
  expect(g.holders.guard.support).toBe(50 + FORCE_ARMY_EASE);
  // Every region pays SUPPORT_HIT 8 from touch(), the street's own answer and the resentment of the group it fell
  // on; the region it fell in pays FORCE_POP_HIT once more.
  expect(g.regions[two]).toBeCloseTo(before[two] - 8 - FORCE_POP_HIT - FORCE_RESENT, 1);
  expect(g.regions[one]).toBeCloseTo(
    before[one] - 8 - FORCE_POP_HIT - FORCE_RESENT - FORCE_POP_HIT,
    1,
  );
});

test("an unwilling army is turned out anyway and resents it", () => {
  const h = game();
  h.holders.guard.support = 20;
  expect(armyAllows(pack, h)).toBe(false);
  expect(blocker(pack, h, "force")?.id).toBe("guard");

  commit(pack, h, priceTag(pack, h, quote({ verb: "force", title: "A curfew" })));
  expect(h.holders.guard.support).toBe(20 - FORCE_ARMY_RISE);
});

import {
  DRIFT_GAIN,
  DRIFT_LOSS,
  EMERGENCY_COST,
  EMERGENCY_TURNS,
  MEDIA_STEP,
  TRUST_STEP,
} from "./acts";

test("bloc drift grows the base the post speaks to and empties the middle", () => {
  const g = game();
  const [one, two] = pack.blocs.map((b) => b.id);
  commit(
    pack,
    g,
    priceTag(pack, g, quote({ verb: "proclaim", template: "bloc_drift", targets: [one] })),
  );
  expect(g.drift[one]).toBeCloseTo(DRIFT_GAIN, 5);
  expect(g.drift[two]).toBeCloseTo(-DRIFT_LOSS, 5);
});

test("state media damps the feed and costs it trust", () => {
  const g = game();
  commit(
    pack,
    g,
    priceTag(pack, g, quote({ verb: "appoint", template: "state_media", serves: ["council"] })),
  );
  expect(g.media).toBeCloseTo(MEDIA_STEP, 5);
  expect(g.trust).toBeCloseTo(1 - TRUST_STEP, 5);
});

test("emergency powers cost a lot, set the chamber aside, and lapse when the army turns", () => {
  const g = game();
  g.ledgers.authority = 60;
  const tag = priceTag(pack, g, quote({ verb: "decree", template: "emergency_powers" }));
  expect(tag.charge.authority).toBe(3 + EMERGENCY_COST);
  commit(pack, g, tag);
  expect(g.emergency).toBe(g.turn + EMERGENCY_TURNS);
  expect(vetoesOf(pack, g, "law")).toEqual([]);
  g.holders.guard.support = 20;
  expect(armyAllows(pack, g)).toBe(false);
  endTurn(pack, g);
  expect(g.emergency).toBeNull();
  expect(vetoesOf(pack, g, "law")).toEqual(["chamber"]);
});
