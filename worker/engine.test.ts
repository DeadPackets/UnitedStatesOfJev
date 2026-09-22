import { test, expect } from "bun:test";
import {
  applyCitizens, applyLobby, applyVote, continueTerm, decodeCode, director, effectiveWhip, encodeCode, endTerm,
  applyEscalation, ESCALATION_EFFECTS, FAVOR_OWED, nationalApproval, newGame, resolveEvent, runTest, scenarioTag,
  termPoints, threshold, type Bill, type Game,
} from "./engine";
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
  expect(g.ledgers.party).toBe(pack.starts[0].party);
  expect(Object.keys(g.ledgers.approval).sort()).toEqual([...REGIONS].sort());
  expect(g.members.filter((m) => m.situation).length).toBe(Math.round(pack.chamber.size * 0.15));
  expect(g.marks.midterm.length).toBe(Math.round(pack.chamber.size / 3));
  expect(g.members.find((m) => m.faction === "harborites")!.loyalty).toBe(100);
  expect(g.members.find((m) => m.faction === "keelwrights")!.loyalty).toBe(25);   // hostile coalition partner
  expect(newGame("g", CODE, pack, "harborites", PROMISES, CAL).ledgers.approval).toEqual(g.ledgers.approval);
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
  expect(b.passed).toBe(true);
  expect(b.yes).toBe(16);
  expect(b.threshold).toBe(pack.chamber.threshold);
  expect(g.ledgers.capital).toBe(before.capital + 5);
  expect(g.ledgers.party).toBe(before.party + 3);
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
  expect(g.ledgers.party).toBe(before.party + 3 + 3 + 5);
  expect(nationalApproval(pack, g)).toBeGreaterThan(nationalApproval(pack, game()));
});

test("passing on the other side's votes costs party mood", () => {
  const g = game();
  for (const m of g.members) m.loyalty = 100;
  const before = g.ledgers.party;
  applyVote(pack, g, bill(g, 1));
  expect(g.bills[0].yes).toBe(pack.chamber.size);
  expect(g.ledgers.party).toBe(before - 6);
});

test("a failed bill costs capital and party mood", () => {
  const g = game();
  const before = { ...g.ledgers };
  const b = bill(g, 0);
  applyVote(pack, g, b);
  expect(b.passed).toBe(false);
  expect(g.ledgers.capital).toBe(before.capital - 5);
  expect(g.ledgers.party).toBe(before.party - 2);
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
  expect(g.promises.tariffs.state).toBe("broken");

  const h = game();
  h.escalations = ["fickle_base"];
  h.turn = 8;
  applyVote(pack, h, bill(h, 0));
  expect(h.promises.tariffs.state).toBe("broken");
});

test("hostile press costs a point in every region on every verdict", () => {
  const g = game();
  g.escalations = ["hostile_press"];
  const before = { ...g.ledgers.approval };
  applyVote(pack, g, bill(g, 0));
  for (const r of REGIONS) expect(g.ledgers.approval[r]).toBe(before[r] - 1);
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
      // The dry run tests the Director, not the endings, so a run that ends early keeps going.
      g.stage = "session";
      const e = director(g, pack);
      if (e) resolveEvent(pack, g, e, 0);
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
  const approval = { ...g.ledgers.approval };
  continueTerm(pack, g);
  expect(g.term).toBe(2);
  expect(g.turn).toBe(1);
  expect(g.escalations).toEqual(["hostile_press", "supermajority_era"]);
  expect(g.members.map((m) => m.memory.length)).toEqual(memory);
  expect(g.ledgers.approval).toEqual(approval);
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
  expect(g.ledgers.party).toBe(35);
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
  g.ledgers.capital = 5;
  g.ledgers.party = 15;
  applyVote(pack, g, bill(g, 0));
  expect(g.result!.ending).toBe("impeached");
  expect(g.terms.length).toBe(1);
  expect(g.terms[0]).toEqual(termPoints(g, 0));
  // 4 passed x 10 + 1 kept promise x 25 + mandate 0 + capital 0 + best streak 4 x 5
  expect(g.terms[0].points).toBe(85);
  expect(g.result!.score).toBe(85);
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
  g.ledgers.party = 20;
  expect(JSON.stringify(whipState(pack, g, bill(g, 0)))).toContain('"party_leadership":"hostile"');

  const h = game();
  const b = bill(h, 0);
  const m = h.members[0];
  applyLobby(pack, h, b, m, "favor");
  expect(m.memory).toContain(FAVOR_OWED);
  applyVote(pack, h, b);                    // the bill the favor bought does not repay it
  expect(m.memory).toContain(FAVOR_OWED);
  const capital = h.ledgers.capital;
  applyVote(pack, h, bill(h, 0, { whip: Object.fromEntries(h.members.map((x) => [x.id, x.id === m.id ? 1 : 0])) }));
  expect(h.ledgers.capital).toBe(capital - 5 + 10);
  expect(m.memory).not.toContain(FAVOR_OWED);
});

test("the midterm follows turn 10's vote", () => {
  const early = game();
  early.turn = 9;
  applyVote(pack, early, bill(early, 0));
  expect(early.stage).toBe("session");
  const g = game();
  g.turn = 10;
  applyVote(pack, g, bill(g, 0));
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
  for (const r of pack.regions) g.ledgers.approval[r.id] = own.has(r.id) === hold ? 999 : -999;
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
  expect(a.ledgers.approval[one]).toBeGreaterThan(b.ledgers.approval[one]);
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
  for (const r of pack.regions) g.ledgers.approval[r.id] = 66;      // (66 - 50) / 8 = 2, sigmoid 0.8808
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
  for (const r of pack.regions) g.ledgers.approval[r.id] = 80;   // the three promises break on this vote: stay off the lame duck floor
  applyVote(pack, g, bill(g, 0.9));
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
  const capital = g.ledgers.capital;
  applyCampaign(pack, g, "m2", { kind: "favor", memberId: g.members[0].id }, allIntent(0.5));
  expect(g.ledgers.capital).toBe(capital - leverCost(g, { kind: "favor", memberId: g.members[0].id }).capital);
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
