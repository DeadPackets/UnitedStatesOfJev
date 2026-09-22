import { test, expect } from "bun:test";
import {
  applyCitizens, applyLobby, applyVote, continueTerm, decodeCode, director, effectiveWhip, encodeCode, endTerm,
  applyEscalation, belowLine, canAfford, CHEST_CAP, ESCALATION_EFFECTS, FAVOR_OWED, ledgerLine, ledgerValue, pay, PROMISE_AUTHORITY, nationalPopularity, newGame, resolveEvent, runTest, scenarioTag,
  termPoints, threshold, type Bill, type Game,
} from "./engine";
import { easeResistance, holdersOf, nearestLine, raiseResistance, seedHolders, weightOf } from "./engine";
import { advanceWarnings, fireResponse, WARN_TURNS } from "./engine";
import { endTurn } from "./engine";
import { whipState } from "./jev";
import { PackSchema, type Citizen, type Pack } from "./pack";
import type { Calendar } from "./gen/validate";
import mini from "./fixtures/mini.json";

const BLOCS = ["dockworkers", "merchants", "fisherfolk", "clergy", "students"];
const REGIONS = mini.regions.map((r) => r.id);
const CAL: Calendar = { start_date: "0450-05-01", unit: "month" };
const CODE = encodeCode({ scenario: scenarioTag(mini.id), faction: 0, promises: [0, 1, 2], seed: 987654321 });
const PROMISES = ["dockworker-pay", "tariffs", "fish-quotas"];

function citizens(): Citizen[] {
  return BLOCS.flatMap((bloc) => Array.from({ length: 50 }, (_, i) => ({
    id: `${bloc}-${i}`, region: REGIONS[i % REGIONS.length], bloc, name: `Citizen ${bloc} ${i}`,
    age: 20 + (i % 50), job: "harbor worker", town: "Harbor City",
    worldview: "wants the harbor to stay prosperous", issues: ["tariffs", "dockworker-pay"] as [string, string], weight: 1,
  })));
}
const pack: Pack = PackSchema.parse({ ...mini, citizens: citizens() });
const game = () => newGame("g", CODE, pack, "harborites", PROMISES, CAL);
const bill = (g: Game, p: number, extra: Partial<Bill> = {}): Bill => {
  const b: Bill = {
    id: g.turn, text: "", title: `Decree ${g.turn}`, summary: "", tags: ["tariffs"], offers: {},
    whip: Object.fromEntries(g.members.map((m) => [m.id, p])), filibuster: 0, constitutional: 0, ...extra,
  };
  g.bills.push(b);
  return b;
};

test("the code round-trips", () => {
  expect(CODE).toMatch(/^J3-[0-9A-Z]{6}-[0-9A-Z]-[0-9A-Z]{3}-[0-9A-Z]{6}$/);
  expect(decodeCode(CODE)).toEqual({ scenario: scenarioTag(mini.id), faction: 0, promises: [0, 1, 2], seed: 987654321 });
  expect(decodeCode(encodeCode({ scenario: "ZZZZZZ", faction: 11, promises: [7, 0, 3], seed: 1 })).faction).toBe(11);
  expect(() => decodeCode("J1-D55TPL-X-000000")).toThrow();
});

test("a new game reads the pack, not the roster", () => {
  const g = game();
  expect(g.members.length).toBe(pack.chamber.size);
  expect(g.ledgers.loyalty).toBe(pack.starts[0].party);
  expect(Object.keys(g.ledgers.popularity).sort()).toEqual([...REGIONS].sort());
  expect(g.members.filter((m) => m.situation).length).toBe(Math.round(pack.chamber.size * 0.15));
  expect(g.marks.midterm.length).toBe(Math.round(pack.chamber.size / 3));
  expect(g.members.find((m) => m.faction === "harborites")!.loyalty).toBe(100);
  expect(g.members.find((m) => m.faction === "keelwrights")!.loyalty).toBe(25);   // hostile coalition partner
  expect(newGame("g", CODE, pack, "harborites", PROMISES, CAL).ledgers.popularity).toEqual(g.ledgers.popularity);
});

test("a new game opens the five ledgers under their v4 names", () => {
  const g = game();
  expect(Object.keys(g.ledgers).sort()).toEqual(["authority", "chest", "loyalty", "popularity", "treasury"]);
  expect(g.ledgers.authority).toBe(pack.starts[0].capital);
  expect(g.ledgers.loyalty).toBe(pack.starts[0].party);
  expect(g.ledgers.treasury).toBe(0);
  expect(Object.keys(g.ledgers.popularity).sort()).toEqual([...REGIONS].sort());
});

test("the threshold comes from the pack, and rises on a filibuster, a veto or escalation 2", () => {
  const g = game();
  const b = bill(g, 0.9);
  expect(threshold(pack, g, b)).toBe(pack.chamber.threshold);
  expect(threshold(pack, g, { ...b, filibuster: 0.6 })).toBe(pack.chamber.supermajority);
  expect(threshold(pack, g, { ...b, vetoes: { m3: 0.7 } })).toBe(pack.chamber.supermajority);
  g.escalations.push("supermajority_era");
  expect(threshold(pack, g, b)).toBe(pack.chamber.supermajority);
  g.escalations = ["war_footing"];
  expect(threshold(pack, g, { ...b, tags: ["naval-defense"] })).toBe(pack.chamber.supermajority);
  expect(threshold(pack, g, b)).toBe(pack.chamber.threshold);
});

test("a hostile partner votes as opposition and grudges stick", () => {
  const g = game();
  const b = bill(g, 0.9);
  const whip = effectiveWhip(g, b);
  const hostile = g.members.find((m) => m.faction === "keelwrights")!;
  expect(whip[hostile.id]).toBe(0.15);
  expect(whip[g.members.find((m) => m.faction === "harborites")!.id]).toBe(0.9);
  g.escalations = ["defections"];
  expect(effectiveWhip(g, b)[g.members.find((m) => m.faction === "harborites")!.id]).toBeCloseTo(0.85, 5);
});

test("a passed bill moves the five ledgers", () => {
  const g = game();
  const before = { ...g.ledgers };
  const back = (m: { faction: string }) => (m.faction === "keelwrights" ? 0 : 1);   // 16 of 24, own faction leads the yes votes
  const b = bill(g, 0, { whip: Object.fromEntries(g.members.map((m) => [m.id, back(m)])), blocs: { dockworkers: 0, merchants: 2 }, patrons: { "grand-exchange": 0, "keelwright-hall": 2 } });
  applyVote(pack, g, b);
  endTurn(pack, g);
  expect(b.passed).toBe(true);
  expect(b.yes).toBe(16);
  expect(b.threshold).toBe(pack.chamber.threshold);
  expect(g.ledgers.authority).toBe(before.authority + 2);
  expect(g.ledgers.loyalty).toBe(before.loyalty + 3);
  expect(g.streak).toBe(1);
  expect(g.patrons["grand-exchange"]).toBe(1);
  expect(g.patrons["keelwright-hall"]).toBe(-1);
  expect(g.ledgers.chest).toBe(1);               // sum of the positive patron moods
  expect(g.blocs.dockworkers).toBe(1);
  expect(g.blocs.merchants).toBe(0);
  expect(g.promises.tariffs.passed).toBe(1);
  expect(g.turn).toBe(2);

  applyVote(pack, g, bill(g, 0, { whip: Object.fromEntries(g.members.map((m) => [m.id, back(m)])) }));
  expect(g.promises.tariffs.state).toBe("kept");
  expect(g.ledgers.loyalty).toBe(before.loyalty + 3 + 3 + 5);
  expect(nationalPopularity(pack, g)).toBeGreaterThan(nationalPopularity(pack, game()));
});

test("passing on the other side's votes costs party mood", () => {
  const g = game();
  for (const m of g.members) m.loyalty = 100;
  const before = g.ledgers.loyalty;
  applyVote(pack, g, bill(g, 1));
  expect(g.bills[0].yes).toBe(pack.chamber.size);
  expect(g.ledgers.loyalty).toBe(before - 6);
});

test("a failed bill costs capital and party mood", () => {
  const g = game();
  const before = { ...g.ledgers };
  const b = bill(g, 0);
  applyVote(pack, g, b);
  expect(b.passed).toBe(false);
  expect(g.ledgers.authority).toBe(before.authority - 2);
  expect(g.ledgers.loyalty).toBe(before.loyalty - 2);
  expect(g.streak).toBe(0);
});

test("a struck bill needs 0.7, or 0.5 under a hostile court", () => {
  const g = game();
  applyVote(pack, g, bill(g, 1, { constitutional: 0.6 }));
  expect(g.bills[0].struck).toBe(false);
  g.escalations = ["hostile_court"];
  applyVote(pack, g, bill(g, 1, { constitutional: 0.6 }));
  expect(g.bills[1].struck).toBe(true);
});

test("promise deadlines bite at 12 and 20, or 8 and 16 under fickle base", () => {
  const g = game();
  g.turn = 13;
  applyVote(pack, g, bill(g, 0));
  endTurn(pack, g);
  expect(g.promises.tariffs.state).toBe("broken");

  const h = game();
  h.escalations = ["fickle_base"];
  h.turn = 8;
  applyVote(pack, h, bill(h, 0));
  endTurn(pack, h);
  expect(h.promises.tariffs.state).toBe("broken");
});

test("hostile press costs a point in every region on every verdict", () => {
  const g = game();
  g.escalations = ["hostile_press"];
  const before = { ...g.ledgers.popularity };
  applyVote(pack, g, bill(g, 0));
  for (const r of REGIONS) expect(g.ledgers.popularity[r]).toBe(before[r] - 1);
});

test("lobby costs the v1 table, rises 1.5x under costly favors, and a broken threat leaves a grudge", () => {
  const g = game();
  const b = bill(g, 0);
  const m = g.members[0];
  expect(applyLobby(pack, g, b, m, "favor").cost).toBe(15);
  g.escalations = ["costly_favors"];
  expect(applyLobby(pack, g, b, g.members[1], "threat").cost).toBe(30);
  applyVote(pack, g, b);
  expect(g.members[1].mood).toBe(-0.15);
  expect(g.members[1].memory.length).toBe(1);
});

test("citizens move a region only when its mean moved more than 0.05", () => {
  const g = game();
  const all = (p: number) => Object.fromEntries(pack.citizens.map((c) => [c.id, p]));
  const first = applyCitizens(pack, g, all(0.9));
  expect(Object.keys(first).length).toBe(REGIONS.length);
  for (const d of Object.values(first)) expect(d).toBe(4);
  expect(g.blocs.dockworkers).toBe(0.9);
  expect(applyCitizens(pack, g, all(0.92))).toEqual({});
  const third = applyCitizens(pack, g, all(0));
  expect(Object.values(third)[0]).toBe(-5);
});

test("the Director keeps 4 to 7 crises a term and never two in a row before turn 17", () => {
  const counts: number[] = [];
  for (let t = 0; t < 200; t++) {
    const g = game();
    for (const m of g.members) m.loyalty = 100;
    for (let i = 0; i < 20; i++) {
      // A plausible term: the coalition holds and 7 bills in 10 pass. A term that fails most of its bills
      // spends its turns on relief cards instead, which is the pressure valve working.
      applyVote(pack, g, bill(g, Math.random() < 0.7 ? 1 : 0));
      const out = endTurn(pack, g);
      // The dry run tests the Director, not the endings or the stages, so a run that reaches the half-term
      // or the campaign is put straight back in session for the next iteration.
      g.stage = "session"; g.phase = "draft";
      if (out.event) resolveEvent(pack, g, out.event, 0);
    }
    const exo = new Set(pack.deck.filter((d) => d.exogenous).map((d) => d.id));
    const crises = g.events.filter((e) => !e.relief);
    for (let i = 1; i < crises.length; i++) {
      // An exogenous dated card lands on its turn whatever else happened; every other crisis respects the gap.
      if (crises[i].turn < 17 && !exo.has(crises[i].id)) expect(crises[i].turn - crises[i - 1].turn).toBeGreaterThan(1);
    }
    counts.push(crises.length);
  }
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  expect(avg).toBeGreaterThanOrEqual(4);
  expect(avg).toBeLessThanOrEqual(7);
  expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
});

test("the test mixes public intent and chamber loyalty by the pack's alpha", () => {
  const all = (ids: string[], p: number) => Object.fromEntries(ids.map((id) => [id, p]));
  const citizenIds = pack.citizens.map((c) => c.id);

  const publicOnly: Pack = { ...pack, chamber: { ...pack.chamber, alpha: 1 } };
  let won = 0;
  for (let i = 0; i < 200; i++) {
    const r = runTest(publicOnly, game(), { loyalty: {}, intent: all(citizenIds, 0.9) });
    expect(r.public).toBeCloseTo(0.9, 5);
    expect(r.regions.map((x) => x.weight)).toEqual([...r.regions.map((x) => x.weight)].sort((a, b) => b - a));
    if (r.won) won++;
  }
  expect(won).toBeGreaterThanOrEqual(190);

  const chamberOnly: Pack = { ...pack, chamber: { ...pack.chamber, alpha: 0 } };
  let lost = 0;
  for (let i = 0; i < 200; i++) {
    const g = game();
    const r = runTest(chamberOnly, g, { loyalty: all(g.members.map((m) => m.id), 0.1), intent: all(citizenIds, 1) });
    expect(r.loyalty).toBeCloseTo(0.1, 5);
    expect(r.seats.map((x) => x.p)).toEqual([...r.seats.map((x) => x.p)].sort((a, b) => a - b));
    if (!r.won) lost++;
  }
  expect(lost).toBe(200);
});

test("a term ends with a score, and another term stacks two escalations", () => {
  const g = game();
  for (let i = 0; i < 4; i++) applyVote(pack, g, bill(g, 1));
  const won = runTest(pack, g, {
    loyalty: Object.fromEntries(g.members.map((m) => [m.id, 1])),
    intent: Object.fromEntries(pack.citizens.map((c) => [c.id, 1])),
  });
  endTerm(pack, g, won);
  expect(won.won).toBe(true);
  expect(g.stage).toBe("won");
  expect(g.result!.ending).toBe("reelected");
  expect(g.result!.score).toBeGreaterThan(0);
  expect(g.terms[0].passed).toBe(4);

  const memory = g.members.map((m) => m.memory.length);
  const approval = { ...g.ledgers.popularity };
  continueTerm(pack, g);
  expect(g.term).toBe(2);
  expect(g.turn).toBe(1);
  expect(g.escalations).toEqual(["hostile_press", "supermajority_era"]);
  expect(g.members.map((m) => m.memory.length)).toEqual(memory);
  expect(g.ledgers.popularity).toEqual(approval);
  expect(g.bills.length).toBe(0);
  expect(g.terms.length).toBe(1);
});

test("every escalation of the twenty has a hook or a stored number", () => {
  const g = game();
  for (const e of pack.escalations) {
    const h = ESCALATION_EFFECTS[e.key];
    expect(Object.keys(h).length).toBeGreaterThan(0);
  }
  g.escalations = pack.escalations.map((e) => e.key);
  for (const e of pack.escalations) applyEscalation(pack, g, e.key);
  expect(g.economy).toBe("recession");
  expect(g.ledgers.loyalty).toBe(35);
  expect(g.marks.famine.length).toBe(REGIONS.length);   // the pack has fewer than 10 regions
  expect(g.marks.meddling.length).toBe(2);
  expect(g.members.filter((m) => m.situation === "is under investigation for corruption").length).toBeGreaterThanOrEqual(4);
  expect(Object.keys(g.stageB).sort()).toEqual(["apathy", "loud_opposition", "rival_surge", "split_chamber"]);
});

/* ---------- fix round 1 ---------- */

test("a term cut short still scores its bills and promises", () => {
  const g = game();
  const back = (m: { faction: string }) => (m.faction === "keelwrights" ? 0 : 1);
  for (let i = 0; i < 4; i++) applyVote(pack, g, bill(g, 0, { whip: Object.fromEntries(g.members.map((m) => [m.id, back(m)])) }));
  fireResponse(pack, g, { holder: "guard", response: "coup", at: g.turn, fires: g.turn, number: 90 });
  expect(g.result!.ending).toBe("coup");
  expect(g.terms.length).toBe(1);
  expect(g.terms[0]).toEqual(termPoints(g, 0));
  // 4 passed x 10 = 40, 1 kept promise x 25 = 25, mandate 0, best streak 4 x 5 = 20, and authority:
  // it opens at 40, each of the 4 passed laws pays LAW_PASSED 2, the kept promise pays PROMISE_AUTHORITY 3,
  // so 40 + 8 + 3 = 51, and termPoints adds round(51 / 4) = 13. 40 + 25 + 0 + 20 + 13 = 98.
  expect(g.ledgers.authority).toBe(51);
  expect(g.terms[0].points).toBe(98);
  expect(g.result!.score).toBe(98);
});

test("the seeded region lists differ by seed", () => {
  const sets = new Set<string>();
  for (let seed = 1; seed <= 10; seed++) {
    const g = newGame("g", encodeCode({ scenario: scenarioTag(mini.id), faction: 0, promises: [0, 1, 2], seed }), pack, "harborites", PROMISES, CAL);
    applyEscalation(pack, g, "foreign_meddling");
    applyEscalation(pack, g, "famine");
    sets.add(`${g.marks.meddling.join(",")}|${g.marks.famine.join(",")}`);
  }
  expect(sets.size).toBeGreaterThanOrEqual(2);
});

// A deck whose generic cards can never fire, so only the dated card under test can draw.
const datedPack = (turn: number, exogenous: boolean): Pack => ({
  ...pack,
  deck: [
    ...pack.deck.filter((s) => s.kind === "generic").map((s) => ({ ...s, needs: [{ ledger: "turn" as const, id: null, op: "<" as const, value: 0 }] })),
    { id: "dat-x", kind: "dated", date: null, turn, exogenous, needs: null, weight: 1, title_hint: "x", stances: ["a"], scored: ["none"], results: [], memory: null },
  ] as Pack["deck"],
});

test("an exogenous dated card fires on its turn even right after a crisis", () => {
  const g = game();
  g.turn = 5;
  g.director.lastCrisis = 5;                // gap 0: a generic crisis would be blocked
  expect(director(g, datedPack(5, true))!.id).toBe("dat-x");
});

// Two exogenous cards on one turn, so the second has to wait a turn for its slot.
const twoDatedPack = (turn: number): Pack => ({
  ...datedPack(turn, true),
  deck: [
    ...datedPack(turn, true).deck,
    { id: "dat-y", kind: "dated", date: null, turn, exogenous: true, needs: null, weight: 1, title_hint: "y", stances: ["a"], scored: ["none"], results: [], memory: null },
  ] as Pack["deck"],
});

test("a card dated turn 1 still fires: the Director first runs after the turn-1 vote", () => {
  const g = game();
  g.turn = 2;
  expect(director(g, datedPack(1, true))!.id).toBe("dat-x");
});

test("two exogenous cards due on one turn both fire, one turn apart", () => {
  const p = twoDatedPack(5);
  const g = game();
  g.turn = 5;
  expect(director(g, p)!.id).toBe("dat-x");
  g.turn = 6;
  expect(director(g, p)!.id).toBe("dat-y");
  g.turn = 7;
  expect(director(g, p)).toBeNull();
});

test("a dated card that fired in term 1 does not fire again on the same date of term 2", () => {
  const p = datedPack(5, true);
  const g = game();
  g.turn = 5;
  expect(director(g, p)!.id).toBe("dat-x");
  continueTerm(p, g);
  expect(g.events).toEqual([]);
  expect(g.director.seen).toContain("dat-x");
  g.turn = 5;
  expect(director(g, p)).toBeNull();
});

test("a conditional dated card waits for a clear turn, up to two turns late", () => {
  const p = datedPack(5, false);
  const blocked = game();
  blocked.turn = 5;
  blocked.director.lastCrisis = 5;
  expect(director(blocked, p)).toBeNull();
  blocked.turn = 6;
  expect(director(blocked, p)).toBeNull();  // gap 1, still blocked
  blocked.turn = 7;
  expect(director(blocked, p)!.id).toBe("dat-x");

  const dropped = game();
  dropped.turn = 8;                         // three turns late
  dropped.director.lastCrisis = 5;
  expect(director(dropped, p)).toBeNull();
});

test("the test draws both halves whatever the reveal order is", () => {
  const seatsOnly: Pack = { ...pack, test: { ...pack.test, reveal: "seats" }, chamber: { ...pack.chamber, alpha: 1 } };
  const intent = Object.fromEntries(pack.citizens.map((c) => [c.id, 0.5]));
  const drawn = new Set<number>();
  for (let i = 0; i < 50; i++) {
    const r = runTest(seatsOnly, game(), { loyalty: {}, intent });
    expect(r.public).toBeCloseTo(0.5, 5);
    drawn.add(r.drawnPublic);
  }
  expect(drawn.size).toBeGreaterThan(1);    // the tally is the drawn count, never the mean
});

test("a hostile party shows in the whip state, and a favor comes back as capital", () => {
  const g = game();
  expect(JSON.stringify(whipState(pack, g, bill(g, 0)))).not.toContain("party_leadership");
  g.ledgers.loyalty = 20;
  expect(JSON.stringify(whipState(pack, g, bill(g, 0)))).toContain('"party_leadership":"hostile"');

  const h = game();
  const b = bill(h, 0);
  const m = h.members[0];
  applyLobby(pack, h, b, m, "favor");
  expect(m.memory).toContain(FAVOR_OWED);
  applyVote(pack, h, b);                    // the bill the favor bought does not repay it
  expect(m.memory).toContain(FAVOR_OWED);
  const authority = h.ledgers.authority;
  applyVote(pack, h, bill(h, 0, { whip: Object.fromEntries(h.members.map((x) => [x.id, x.id === m.id ? 1 : 0])) }));
  expect(h.ledgers.authority).toBe(authority - 2 + 1);
  expect(m.memory).not.toContain(FAVOR_OWED);
});

test("the midterm follows turn 10's vote", () => {
  const early = game();
  early.turn = 9;
  applyVote(pack, early, bill(early, 0));
  endTurn(pack, early);
  expect(early.stage).toBe("session");
  const g = game();
  g.turn = 10;
  applyVote(pack, g, bill(g, 0));
  endTurn(pack, g);
  expect(g.turn).toBe(11);
  expect(g.stage).toBe("midterm");
});

test("a storylet streak effect counts toward the best streak", () => {
  const p: Pack = { ...pack, deck: pack.deck.map((s) => (s.id === "gen-01" ? { ...s, results: [{ ledger: "streak" as const, id: null, delta: 3, set: null, chance: null }] } : s)) };
  const g = game();
  resolveEvent(p, g, { id: "gen-01", turn: 1, relief: false, stances: [] }, 0);
  expect(g.streak).toBe(3);
  expect(g.bestStreak).toBe(3);
});

test("a code that is not a string is a bad code", () => {
  expect(() => decodeCode(undefined as unknown as string)).toThrow("Bad code");
  expect(() => decodeCode(42 as unknown as string)).toThrow("Bad code");
  expect(() => decodeCode({} as unknown as string)).toThrow("Bad code");
});

import { applyCampaign, applyMidterm, applyPost, baseBlocs, CAMPAIGN_TURNS, forecast, holdP,
  leverCost, leverGain, midtermUp, regionIntent, replacements, rivalTargets, runMidterm, startCampaign,
  type Persona, type Reaction } from "./engine";

const allIntent = (p: number) => Object.fromEntries(pack.citizens.map((c) => [c.id, p]));
const react = (r: Reaction) => Object.fromEntries(pack.citizens.map((c) => [c.id, r]));
const said = { replies: [{ name: "A", text: "x" }], rival: "y" };
const agreeAll = (who: "government" | "rival") => Object.fromEntries(pack.citizens.slice(0, 50).map((c) => [c.id, who]));
// holdP reads the approval ledger raw, so 999 and -999 saturate the sigmoid and settle every draw before it rolls.
const midtermWorld = (g: Game, hold: boolean) => {
  const own = new Set(midtermUp(g).filter((m) => m.faction === "harborites").map((m) => m.region));
  for (const r of pack.regions) g.ledgers.popularity[r.id] = own.has(r.id) === hold ? 999 : -999;
  return Object.fromEntries(pack.citizens.map((c) => [c.id, own.has(c.region) === hold ? 1 : 0]));
};

test("boos cost approval, and loud opposition makes them cost half again as much", () => {
  const a = game(), b = game();
  b.stageB.loud_opposition = 1.5;
  const pa = applyPost(pack, a, 1, "a post", react("boo"), said, agreeAll("government"));
  const pb = applyPost(pack, b, 1, "a post", react("boo"), said, agreeAll("government"));
  const one = pack.regions[0].id;
  expect(pa.boos).toBe(250);
  expect(pa.regions[one]).toBeLessThan(0);
  expect(pb.regions[one]).toBeLessThan(pa.regions[one]);
  expect(a.ledgers.popularity[one]).toBeGreaterThan(b.ledgers.popularity[one]);
});

test("a region where shares lead goes hot and its seats remember the post", () => {
  const g = game();
  const p = applyPost(pack, g, 1, "the harbor tolls", react("share"), said, agreeAll("government"));
  expect(p.hot).toEqual(pack.regions.map((r) => r.id));
  expect(p.regions[pack.regions[0].id]).toBeGreaterThan(0);
  const seat = g.members.find((m) => m.region === pack.regions[0].id)!;
  expect(seat.memory.join(" ")).not.toContain("the harbor tolls");
  expect(seat.memory.join(" ")).toContain("passing it on");
});

test("losing the post duel is recorded on the post", () => {
  const g = game();
  expect(applyPost(pack, g, 1, "x", react("ignore"), said, agreeAll("rival")).won).toBe(false);
  expect(applyPost(pack, g, 2, "x", react("ignore"), said, agreeAll("government")).won).toBe(true);
});

test("a seat holds on approval and intent, and the odds flip for the opposition", () => {
  const g = game();
  for (const r of pack.regions) g.ledgers.popularity[r.id] = 66;      // (66 - 50) / 8 = 2, sigmoid 0.8808
  const byRegion = regionIntent(pack, allIntent(0.7));
  const own = g.members.find((m) => m.faction === "harborites")!;
  const opp = g.members.find((m) => m.faction === "tidebound")!;
  expect(holdP(pack, g, own, byRegion)).toBeCloseTo(0.5 * 0.8808 + 0.5 * 0.7, 3);
  expect(holdP(pack, g, opp, byRegion)).toBeCloseTo(1 - (0.5 * 0.8808 + 0.5 * 0.7), 3);
});

test("split chamber takes the player's seats before any draw", () => {
  const g = game();
  g.stageB.split_chamber = 8;
  const draw = runMidterm(pack, g, midtermWorld(g, true));            // nothing can fall on its own
  const ownUp = midtermUp(g).filter((m) => m.faction === "harborites").length;
  expect(draw.forced.length).toBe(Math.min(8, ownUp));
  expect(draw.lost.length).toBe(draw.forced.length);
  expect(draw.lost.every((l) => l.from === "harborites" && l.to !== "harborites")).toBe(true);
});

test("a forced seat never flips to a coalition partner still inside ownSide", () => {
  // tidebound drops harborites from its own hostile list: it becomes a true, friendly coalition partner.
  const friendly: Pack = { ...pack, starts: pack.starts.map((s) => (s.faction === "tidebound" ? { ...s, hostile: [] } : s)) };
  const g = game();
  g.stageB.split_chamber = 8;
  const draw = runMidterm(friendly, g, midtermWorld(g, true));
  expect(draw.forced.length).toBeGreaterThan(0);
  expect(draw.lost.every((l) => l.to !== "harborites" && l.to !== "tidebound")).toBe(true);
});

test("the midterm swaps only the seats it lost, and the new members start empty", () => {
  const g = game();
  const draw = runMidterm(pack, g, midtermWorld(g, false));           // every seat falls
  const slots = replacements(pack, g, draw);
  expect(slots.length).toBe(draw.lost.length);
  expect(slots.every((s) => !pack.members.some((m) => m.id === s.id))).toBe(true);
  const personas: Persona[] = slots.map((s) => ({ id: s.id, name: `New ${s.id}`, bio: "b", tell: "t", core_issues: [pack.tags[0]] }));
  const kept = g.members.filter((m) => !draw.lost.some((l) => l.seat === m.seat)).map((m) => m.id);
  applyMidterm(pack, g, draw, personas);
  expect(g.members.length).toBe(pack.chamber.size);
  expect(g.members.filter((m) => kept.includes(m.id)).length).toBe(kept.length);
  const fresh = g.members.find((m) => m.id === slots[0].id)!;
  expect(fresh.memory).toEqual([]);
  expect(fresh.faction).toBe(draw.lost[0].to);
  expect(fresh.seat).toBe(draw.lost[0].seat);
  expect(g.midterm!.lost.length).toBe(draw.lost.length);
});

test("opposition seats swapping among themselves never end a run", () => {
  const g = game();
  g.turn = 11;
  const draw = runMidterm(pack, g, midtermWorld(g, false));           // every up-seat changes hands
  expect(draw.lost.length).toBe(8);
  expect(draw.lostOwn).toBe(2);                                       // only the 2 harborite seats in the class are ownSide
  expect(draw.wipeout).toBe(false);
  applyMidterm(pack, g, draw, replacements(pack, g, draw).map((s) => ({ id: s.id, name: "n", bio: "b", tell: "t", core_issues: [pack.tags[0]] })));
  expect(g.stage).toBe("session");
});

test("losing 40% of the class on the government's own side ends the run as a lame duck with a scored term", () => {
  const friendly: Pack = { ...pack, starts: pack.starts.map((s) => (s.faction === "tidebound" ? { ...s, hostile: [] } : s)) };
  const g = game();
  g.turn = 11;
  g.stageB.split_chamber = 4;                                         // forces every ownSide seat (harborites + tidebound) in the class
  const draw = runMidterm(friendly, g, {});
  expect(draw.lostOwn).toBe(4);
  expect(draw.wipeout).toBe(true);
  applyMidterm(friendly, g, draw, replacements(friendly, g, draw).map((s) => ({ id: s.id, name: "n", bio: "b", tell: "t", core_issues: [friendly.tags[0]] })));
  expect(g.stage).toBe("over");
  expect(g.result!.ending).toBe("lame_duck");
  expect(g.terms.length).toBe(1);
});

test("the campaign follows turn 20, not the test", () => {
  const g = game();
  g.turn = 20;
  for (const r of pack.regions) g.ledgers.popularity[r.id] = 80;   // the three promises break on this vote: stay off the lame duck floor
  applyVote(pack, g, bill(g, 0.9));
  endTurn(pack, g);
  expect(g.stage).toBe("campaign");
  expect(g.campaign!.turns.length).toBe(0);
});

test("the two levers are weighted by the pack's alpha", () => {
  const spend = { kind: "spend" as const, regions: [{ id: pack.regions[0].id, amount: 10 }] };
  const favor = { kind: "favor" as const, memberId: "m1" };
  const pub: Pack = { ...pack, chamber: { ...pack.chamber, alpha: 1 } };
  const seats: Pack = { ...pack, chamber: { ...pack.chamber, alpha: 0 } };
  expect(leverGain(pub, favor)).toBe(0);
  expect(leverGain(pub, spend)).toBeCloseTo(pack.regions[0].weight * 0.04, 6);
  expect(leverGain(seats, spend)).toBe(0);
  expect(leverGain(seats, favor)).toBeCloseTo(0.3 / pack.chamber.size, 6);
});

test("a campaign turn charges its lever and records the rival's targets", () => {
  const g = game();
  g.turn = 21;
  startCampaign(pack, g);
  g.ledgers.chest = 40;
  const before = g.ledgers.chest;
  const t = applyCampaign(pack, g, "a message", { kind: "spend", regions: [{ id: pack.regions[0].id, amount: 10 }] }, allIntent(0.5));
  expect(t.cost.chest).toBe(10);
  expect(g.ledgers.chest).toBe(before - 10);
  expect(t.rival.length).toBe(2);
  expect(t.band[0]).toBeLessThan(t.public);
  expect(t.band[1]).toBeGreaterThan(t.public);
  const capital = g.ledgers.authority;
  applyCampaign(pack, g, "m2", { kind: "favor", memberId: g.members[0].id }, allIntent(0.5));
  expect(g.ledgers.authority).toBe(capital - leverCost(g, { kind: "favor", memberId: g.members[0].id }).capital);
  expect(g.members[0].memory.length).toBe(1);
  g.stageB.rival_surge = 2;
  const surged = applyCampaign(pack, g, "m3", { kind: "spend", regions: [] }, allIntent(0.5));
  expect(surged.rival.length).toBe(2);
  expect(g.campaign!.rival).toEqual(surged.rival);                   // recorded, Jev prices the surge itself
  expect(rivalTargets(pack, g, surged.intent)).toEqual(surged.rival);
  expect(forecast(pack, surged.intent).public).toBeCloseTo(surged.public, 3);
  applyCampaign(pack, g, "m4", { kind: "spend", regions: [] }, allIntent(0.5));
  expect(g.campaign!.turns.length).toBe(CAMPAIGN_TURNS);
  expect(g.stage).toBe("test");
});

test("the forecast band is the sampling error of intent, not of a single regional draw", () => {
  const regions5 = pack.regions.slice(0, 5);
  const mkCitizens = (n: number): Citizen[] => Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, region: regions5[i % 5].id, bloc: BLOCS[0], name: `c${i}`, age: 30, job: "harbor worker", town: "Harbor City",
    worldview: "w", issues: ["tariffs", "dockworker-pay"] as [string, string], weight: 1,
  }));
  const intent = Object.fromEntries(regions5.map((r) => [r.id, 0.5]));
  const wide = forecast({ ...pack, regions: regions5, citizens: mkCitizens(5) }, intent);
  const narrow = forecast({ ...pack, regions: regions5, citizens: mkCitizens(250) }, intent);
  expect(narrow.band[1] - narrow.band[0]).toBeLessThan(0.15);      // 250 citizens over 5 regions: a tight forecast
  expect(wide.band[1] - wide.band[0]).toBeGreaterThan(0.3);        // 5 citizens total: barely a sample
  expect(narrow.public).toBeCloseTo(0.5, 6);
  expect(narrow.regions).toEqual(regions5.map((r) => ({ id: r.id, p: 0.5 })));   // sigmoid((0.5 - 0.5) * 12) = 0.5
});

test("apathy thins the turnout of the player's strongest groups at the test", () => {
  const g = game(), h = game();
  for (const b of pack.blocs) { g.blocs[b.id] = 0.2; h.blocs[b.id] = 0.2; }
  g.blocs.dockworkers = 0.9; g.blocs.merchants = 0.8;
  h.blocs.dockworkers = 0.9; h.blocs.merchants = 0.8;
  h.stageB.apathy = 0.8;
  expect(baseBlocs(g)).toEqual(["dockworkers", "merchants"]);
  const answers = {
    loyalty: Object.fromEntries(g.members.map((m) => [m.id, 0.5])),
    intent: Object.fromEntries(pack.citizens.map((c) => [c.id, c.bloc === "dockworkers" || c.bloc === "merchants" ? 1 : 0])),
  };
  expect(runTest(pack, h, answers).public).toBeLessThan(runTest(pack, g, answers).public);
});

test("each ledger has a failure line, the pack may rename it and the engine reads both", () => {
  const g = game();
  expect(ledgerLine(pack, "loyalty")).toBe(20);
  expect(ledgerLine(pack, "popularity")).toBe(30);
  expect(ledgerValue(pack, g, "authority")).toBe(g.ledgers.authority);
  expect(ledgerValue(pack, g, "popularity")).toBeCloseTo(nationalPopularity(pack, g), 5);
  // A new game opens treasury 0 and chest 0, and both lines are 0, so both are already at the line.
  expect(belowLine(pack, g)).toEqual(["treasury", "chest"]);
  g.ledgers.loyalty = 10;
  expect(belowLine(pack, g)).toEqual(["treasury", "chest", "loyalty"]);   // LEDGERS_V4 order, no sort
  g.ledgers.treasury = 5; g.ledgers.chest = 5; g.ledgers.loyalty = 55;
  expect(belowLine(pack, g)).toEqual([]);
});

test("an act is paid from three ledgers and refused when one is short", () => {
  const g = game();
  g.ledgers.treasury = 10;
  expect(canAfford(pack, g, { authority: 5, treasury: 10, chest: 0 })).toBe(true);
  expect(canAfford(pack, g, { authority: 5, treasury: 11, chest: 0 })).toBe(false);
  const wire = pay(pack, g, { authority: 5, treasury: 10, chest: 0 }, "a decree");
  expect(g.ledgers.treasury).toBe(0);
  expect(wire.map((w) => w.ledger)).toEqual(["authority", "treasury"]);   // the loop's order, chest skipped at 0
  expect(wire[0].cause).toBe("a decree");
  expect(wire.every((w) => w.kind === "ledger")).toBe(true);
});

test("spec section 4's sources pay: a kept promise, and the chest capped per verdict", () => {
  const g = game();
  const back = (m: { faction: string }) => (m.faction === "keelwrights" ? 0 : 1);
  const pass = () => applyVote(pack, g, bill(g, 0, { whip: Object.fromEntries(g.members.map((m) => [m.id, back(m)])) }));
  pass();
  const before = g.ledgers.authority;
  pass();                                              // the second pass on the tariffs tag keeps the promise
  expect(g.promises.tariffs.state).toBe("kept");
  expect(g.ledgers.authority).toBe(before + 2 + PROMISE_AUTHORITY);   // the law passed, then the promise kept

  const h = game();
  for (const p of pack.patrons) h.patrons[p.id] = 2;   // every one of the pack's ten patrons at its ceiling
  applyVote(pack, h, bill(h, 0, { whip: Object.fromEntries(h.members.map((m) => [m.id, back(m)])) }));
  // 10 patrons x 2 = 20, which is exactly CHEST_CAP: the cap is the ceiling a ten-patron pack already sits
  // at, and it binds only where Stage B raises a patron's payout above 2.
  expect(h.ledgers.chest).toBe(CHEST_CAP);
  applyVote(pack, h, bill(h, 0, { whip: Object.fromEntries(h.members.map((m) => [m.id, back(m)])) }));
  expect(h.ledgers.chest).toBe(CHEST_CAP * 2);         // it is a cap a verdict, not a cap a term
});

test("a new game opens one holder state per holder in the constitution", () => {
  const g = game();
  expect(Object.keys(g.holders).sort()).toEqual(["council", "guard", "league", "street"]);
  expect(g.holders.council.weight).toBe(0.4);
  expect(g.holders.guard.weight).toBe(0);
  expect(g.holders.street.resistance).toBe(0);
  expect(g.holders.street.line).toBe(70);
  expect(g.holders.guard.response).toBe("coup");
  expect(weightOf(pack, "street")).toBe(0.6);
  expect(holdersOf({ ...pack, constitution: undefined }).length).toBe(0);
});

test("a bypass raises resistance, a favour lowers it and the nearest to its line is named", () => {
  const g = game();
  const up = raiseResistance(pack, g, ["council", "guard"], 12, "ruled by edict");
  expect(g.holders.council.resistance).toBe(12);
  expect(up[0].cause).toBe("ruled by edict");
  expect(up[0]).toEqual({ kind: "resistance", id: "council", delta: 12, cause: "ruled by edict" });   // no ledger
  easeResistance(pack, g, ["council"], 10, "a petition granted");
  expect(g.holders.council.resistance).toBe(2);
  expect(nearestLine(g)).toBe("guard");   // 12 of 55 against 2 of 60 and 0 of 70
  raiseResistance(pack, g, ["council"], 999, "everything at once");
  expect(g.holders.council.resistance).toBe(100);
});

test("a holder over its line warns once and fires two turns later", () => {
  const g = game();
  g.holders.street.resistance = 80;         // over its line of 70
  const first = advanceWarnings(pack, g);
  expect(first.warned.map((w) => w.holder)).toEqual(["street"]);
  expect(first.fired).toEqual([]);
  expect(g.warnings[0].fires).toBe(g.turn + WARN_TURNS);
  expect(g.warnings[0].number).toBe(80);

  g.turn += 1;
  expect(advanceWarnings(pack, g).fired).toEqual([]);   // still over, still waiting
  g.turn += 1;
  const third = advanceWarnings(pack, g);
  expect(third.fired.map((w) => w.holder)).toEqual(["street"]);
  expect(g.warnings).toEqual([]);
});

test("a warning drops when the holder comes back under its line", () => {
  const g = game();
  g.holders.street.resistance = 80;
  advanceWarnings(pack, g);
  g.holders.street.resistance = 10;
  g.turn += 2;
  const r = advanceWarnings(pack, g);
  expect(r.fired).toEqual([]);
  expect(g.warnings).toEqual([]);
  expect(g.holders.street.warnedAt).toBeNull();
});

test("each response does its own thing and a coup ends the run", () => {
  const g = game();
  const before = nationalPopularity(pack, g);
  fireResponse(pack, g, { holder: "street", response: "riot", at: 1, fires: 3, number: 80 });
  expect(nationalPopularity(pack, g)).toBeLessThan(before);

  g.ledgers.treasury = 20;
  fireResponse(pack, g, { holder: "league", response: "embargo", at: 1, fires: 3, number: 60 });
  expect(g.ledgers.treasury).toBeLessThan(20);

  fireResponse(pack, g, { holder: "council", response: "early_test", at: 1, fires: 3, number: 70 });
  expect(g.earlyTest).toBe("council");
  expect(g.stage).toBe("test");

  const h = game();
  fireResponse(pack, h, { holder: "guard", response: "coup", at: 1, fires: 3, number: 70 });
  expect(h.stage).toBe("over");
  expect(h.result!.ending).toBe("coup");
  expect(h.terms.length).toBe(1);
});

test("a vote no longer moves the clock; End turn does", () => {
  const g = game();
  applyVote(pack, g, bill(g, 1));
  expect(g.turn).toBe(1);
  expect(g.phase).toBe("over");
  const out = endTurn(pack, g);
  expect(g.turn).toBe(2);
  expect(g.phase).toBe("draft");
  expect(out.wire.every((w) => typeof w.cause === "string")).toBe(true);
});

test("the boundary decays resistance, advances warnings and prints the pending item", () => {
  const g = game();
  g.holders.council.resistance = 20;
  g.holders.street.resistance = 80;
  const out = endTurn(pack, g);
  expect(g.holders.council.resistance).toBe(19);
  expect(out.warned.map((w) => w.holder)).toEqual(["street"]);
  expect(g.pending).toContain("70");
});

test("loyalty under its line is a revolt for one turn, and the class doubles once", () => {
  const g = game();
  const cls = Math.round(pack.chamber.size / 3);       // 24 / 3 = 8
  expect(g.marks.midterm.length).toBe(cls);
  g.ledgers.loyalty = 10;
  endTurn(pack, g);
  expect(g.revolt).toBe(g.turn);                       // the turn about to be played, not the one just ended
  expect(g.marks.midterm.length).toBe(cls * 2);        // 16
  endTurn(pack, g);
  expect(g.revolt).toBe(g.turn);                       // still under the line, still in revolt
  expect(g.marks.midterm.length).toBe(cls * 2);        // and the class does not double again
});

test("the half-term still follows turn 10 and the campaign still follows turn 20", () => {
  const g = game();
  g.turn = 10;
  endTurn(pack, g);
  expect(g.stage).toBe("midterm");
  const h = game();
  h.turn = 20;
  endTurn(pack, h);
  expect(h.stage).toBe("campaign");
  expect(h.campaign!.turns).toEqual([]);
});
