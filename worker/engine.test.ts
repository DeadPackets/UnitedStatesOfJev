import { test, expect } from "bun:test";
import {
  applyCitizens, applyLobby, applyVote, continueTerm, decodeCode, director, effectiveWhip, encodeCode, endTerm,
  applyEscalation, belowLine, canAfford, CHEST_CAP, ESCALATION_EFFECTS, FAVOR_OWED, ledgerLine, ledgerValue, pay, PROMISE_AUTHORITY, nationalPopularity, newGame, resolveEvent, runTest, scenarioTag,
  termPoints, threshold, type Bill, type Game,
  easeResistance, holdersOf, nearestLine, raiseResistance, weightOf, advanceWarnings, fireResponse, WARN_TURNS,
  endTurn, enact, inForceAge, repeal, STRIKE_HIT, authorPromise, PROMISE_WINDOW, record, RECORD_TOKENS,
  bar, earlyTest, EARLY_WEIGHT, HANDICAP, shortfall, SURVIVAL_BAR,
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

test("a missed promise decays popularity by a share a turn, never a cliff", () => {
  const g = game();
  for (const r of REGIONS) g.ledgers.popularity[r] = 50;   // a flat start so the arithmetic is exact
  g.turn = PROMISE_WINDOW;
  endTurn(pack, g);                                  // the window closes on this boundary
  expect(Object.values(g.promises).every((p) => p.state === "broken")).toBe(true);
  // Three pending promises, each taking PROMISE_SHARE 0.02 of what the one before it left, rounded to one
  // decimal: 50 - round1(1.00) = 49, 49 - round1(0.98) = 48, 48 - round1(0.96) = 47.
  for (const r of REGIONS) expect(g.ledgers.popularity[r]).toBe(r === g.rival!.region ? 47 - RIVAL_HIT : 47);
  endTurn(pack, g);
  // Past the window it keeps taking a share, it does not cliff again:
  // 47 - round1(0.94) = 46.1, 46.1 - round1(0.922) = 45.2, 45.2 - round1(0.904) = 44.3.
  for (const r of REGIONS.filter((x) => x !== g.rival!.region)) expect(g.ledgers.popularity[r]).toBeCloseTo(44.3, 5);
});

test("fickle base shortens the window instead of moving a cliff", () => {
  const g = game();
  g.escalations = ["fickle_base"];
  g.turn = PROMISE_WINDOW - 4;
  endTurn(pack, g);
  expect(Object.values(g.promises).every((p) => p.state === "broken")).toBe(true);
});

test("an authored promise carries its own window and share", () => {
  const g = game();
  authorPromise(g, "harbor-tolls", "Cut the tolls by the spring", 6, 0.05);
  expect(g.promises["harbor-tolls"]).toEqual({ label: "Cut the tolls by the spring", passed: 0, state: "pending", window: 6, share: 0.05, authored: true });
  g.turn = 6;
  endTurn(pack, g);
  expect(g.promises["harbor-tolls"].state).toBe("broken");
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
      // or the test is put straight back in session for the next iteration.
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

test("the bar climbs per term and stops at its cap", () => {
  expect(bar(pack, 1)).toBeCloseTo(0.5, 5);
  expect(bar(pack, 3)).toBeCloseTo(0.56, 5);
  expect(bar(pack, 30)).toBeCloseTo(0.7, 5);
});

test("the mandate is the weighted mean of the counted holders' stances", () => {
  const g = game();
  // council weighs 0.4 and street 0.6 in mini.json; guard and league weigh 0, so their stances are ignored.
  // 0.4 x 0.8 + 0.6 x 0.2 = 0.32 + 0.12 = 0.44, under the term-1 bar of 0.50.
  const r = runTest(pack, g, { council: 0.8, street: 0.2, guard: 1, league: 1 });
  expect(r.mandate).toBeCloseTo(0.44, 5);
  expect(r.bar).toBeCloseTo(0.5, 5);
  expect(r.won).toBe(false);
  expect(r.holders.map((h) => h.id)).toEqual(["council", "guard", "street", "league"]);   // pack order
  expect(r.holders.find((h) => h.id === "guard")!.counted).toBe(false);
  expect(runTest(pack, g, { council: 1, street: 1 }).won).toBe(true);                     // 1.0 clears 0.50
});

test("a minority start prints its shortfall, is handicapped over 6 and wins on survival over 15", () => {
  const thin = (threshold: number, own: number): Pack => ({
    ...pack,
    chamber: { ...pack.chamber, threshold },
    members: pack.members.map((m, i) => ({ ...m, faction: i < own ? "harborites" : "keelwrights" })),
  });
  // mini.json: 13 needed, harborites hold 10 of 24, so the shortfall is 3 and nothing is handicapped.
  expect(shortfall(pack, "harborites")).toBe(3);
  expect(game().ledgers.authority).toBe(pack.starts[0].capital);

  const hard = thin(20, 10);                                             // 20 - 10 = 10, over HANDICAP_SHORTFALL
  expect(shortfall(hard, "harborites")).toBe(10);
  const h = newGame("g-hard", CODE, hard, "harborites", PROMISES, CAL);
  expect(h.ledgers.authority).toBe(pack.starts[0].capital - HANDICAP);   // 40 - 10 = 30

  const alone = thin(20, 2);                                             // 20 - 2 = 18, over SURVIVAL_SHORTFALL
  const a = newGame("g-alone", CODE, alone, "harborites", PROMISES, CAL);
  const r = runTest(alone, a, { council: 0.45, street: 0.45 });
  expect(r.bar).toBeCloseTo(SURVIVAL_BAR, 5);                            // its own bar, not bar(term) 0.50
  expect(r.won).toBe(true);                                              // mandate 0.45 clears 0.40
  expect(runTest(pack, game(), { council: 0.45, street: 0.45 }).won).toBe(false);   // the same room, normal bar
});

test("an early test brings its caller in and renormalises the weights", () => {
  const g = game();
  const r = earlyTest(pack, g, "guard", { council: 1, street: 1, guard: 0 });
  expect(r.early).toBe("guard");
  const total = r.holders.filter((h) => h.counted).reduce((a, h) => a + h.weight, 0);
  expect(total).toBeCloseTo(1, 5);
  expect(r.holders.find((h) => h.id === "guard")!.weight).toBeCloseTo(EARLY_WEIGHT / (1 + EARLY_WEIGHT), 5);
  expect(r.mandate).toBeCloseTo(1 / (1 + EARLY_WEIGHT), 5);

  Object.assign(g, { stage: "test", phase: "over", earlyTest: "guard", turn: 11 });
  endTerm(pack, g, r);                                   // won: the term goes on, into the half-term it cut off
  expect([g.stage, g.earlyTest, g.result, g.terms.length]).toEqual(["midterm", undefined, undefined, 0]);
  endTerm(pack, g, earlyTest(pack, g, "guard", { council: 0, street: 0, guard: 0 }));
  expect(g.stage).toBe("over");                          // lost: the term ends
});

test("a term ends with a score, and another term stacks two escalations", () => {
  const g = game();
  for (let i = 0; i < 4; i++) applyVote(pack, g, bill(g, 1));
  const won = runTest(pack, g, { council: 1, street: 1 });
  endTerm(pack, g, won);
  expect(won.won).toBe(true);                // 0.4 x 1 + 0.6 x 1 = 1.0, over the term-1 bar of 0.50
  expect(g.stage).toBe("won");
  expect(g.result!.ending).toBe("reelected");
  expect(g.result!.score).toBeGreaterThan(0);
  expect(g.terms[0].passed).toBe(4);

  const memory = g.members.map((m) => m.memory.length);
  const popularity = { ...g.ledgers.popularity };
  continueTerm(pack, g);
  expect(g.term).toBe(2);
  expect(g.turn).toBe(1);
  expect(g.escalations).toEqual(["hostile_press", "supermajority_era"]);
  expect(g.members.map((m) => m.memory.length)).toEqual(memory);
  expect(g.ledgers.popularity).toEqual(popularity);
  expect(g.bills.length).toBe(0);
  expect(g.terms.length).toBe(1);
});

test("another term carries the laws and the resistance, and reseeds the half-term class", () => {
  const g = game();
  enact(g, { id: "l1", verb: "law", title: "The harbour levy", perTurn: [{ ledger: "treasury", delta: 6 }], repealConsent: "chamber", sunset: null });
  g.holders.council.resistance = 40;
  g.holders.street.resistance = 80;
  advanceWarnings(pack, g);
  authorPromise(g, "new-quay", "A new quay", 30);
  authorPromise(g, "old-quay", "An old quay", 6);
  g.promises["old-quay"].state = "broken";
  const first = [...g.marks.midterm];
  endTerm(pack, g, runTest(pack, g, { council: 1, street: 1 }));
  continueTerm(pack, g);
  expect(g.term).toBe(2);
  expect(g.inForce.length).toBe(1);
  expect(g.promises["new-quay"]).toMatchObject({ state: "pending", window: 10, authored: true });   // 10 turns left carry over
  expect(g.promises["old-quay"]).toBeUndefined();
  expect(g.holders.council.resistance).toBe(20);
  expect(g.warnings).toEqual([]);
  expect(g.holders.street.warnedAt).toBeNull();
  expect(g.marks.midterm).not.toEqual(first);
  expect(g.marks.midterm.length).toBe(Math.round(pack.chamber.size / 3));
  expect(g.earlyTest).toBeUndefined();
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

test("the v3 test screen still gets its four numbers", () => {
  const g = game();
  const r = runTest(pack, g, { council: 0.8, street: 0.4 });
  expect(r.seats.length).toBe(pack.chamber.size);
  expect(r.regions.length).toBe(pack.regions.length);
  expect(r.drawnPublic).toBeGreaterThanOrEqual(0);
  expect(r.loyalty).toBeCloseTo(0.8, 5);
  expect(r.public).toBeCloseTo(0.4, 5);
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

import { applyMidterm, applyPost, holdP, midtermUp, regionIntent, replacements, runMidterm, TURNS_PER_TERM,
  type Persona, type PriceTag, type Reaction } from "./engine";

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

import { POST_BASELINE, POST_GAIN } from "./engine";

const tagFor = (over: Partial<PriceTag> = {}): PriceTag => ({
  verb: "proclaim", title: "A notice", reading: "You put up a notice.", credibility: 1,
  quoted: { authority: 0, treasury: 0, chest: 0 }, charge: { authority: 0, treasury: 0, chest: 2 },
  discounted: false, revenue: [], serves: [], hits: [], keeps: [], targets: [], tags: [], regions: [],
  member: null, promises: [], sunset: null, template: null, stances: [], ...over,
});
const reactMix = (like: number, boo: number) => {
  const out: Record<string, Reaction> = {};
  const pct = (i: number) => (i * 100) / pack.citizens.length;   // 250 citizens: i % 100 would give the last 50 all likes
  pack.citizens.forEach((c, i) => { out[c.id] = pct(i) < like ? "like" : pct(i) < like + boo ? "boo" : "ignore"; });
  return out;
};
const saidNothing = { replies: [], rival: "They said nothing new." };

const national = (g: Game) => {
  const w = pack.regions.reduce((a, r) => a + r.weight, 0);
  return pack.regions.reduce((a, r) => a + r.weight * g.ledgers.popularity[r.id], 0) / w;
};

test("an average post is worth nothing, a loud one is punished and a strong one pays", () => {
  const g = game();
  const before = { ...g.ledgers.popularity };
  const was = national(g);
  applyPost(pack, g, 1, "a bland notice", reactMix(76, 5), saidNothing, {}, tagFor());
  expect(Math.abs(national(g) - was)).toBeLessThanOrEqual(0.4);

  const bad = game();
  applyPost(pack, bad, 1, "a hated notice", reactMix(40, 30), saidNothing, {}, tagFor());
  expect(bad.ledgers.popularity[REGIONS[0]]).toBeLessThan(before[REGIONS[0]] - 3);

  const good = game();
  applyPost(pack, good, 1, "a sharp notice", reactMix(88, 6), saidNothing, {}, tagFor());
  expect(good.ledgers.popularity[REGIONS[0]]).toBeGreaterThan(before[REGIONS[0]]);
  expect(good.posts[0].targets).toEqual([]);
  expect(POST_BASELINE).toBeCloseTo(0.65, 2);
  expect(POST_GAIN).toBe(10);
});

test("state media damps the boos a post takes", () => {
  const g = game();
  const h = game();
  h.media = 1;
  applyPost(pack, g, 1, "a hated notice", reactMix(40, 30), saidNothing, {}, tagFor());
  applyPost(pack, h, 1, "a hated notice", reactMix(40, 30), saidNothing, {}, tagFor());
  expect(h.ledgers.popularity[REGIONS[0]]).toBeGreaterThan(g.ledgers.popularity[REGIONS[0]]);
});

test("a region where shares lead goes hot and its seats remember the post", () => {
  const g = game();
  const p = applyPost(pack, g, 1, "the harbor tolls", react("share"), said, agreeAll("government"), tagFor());
  expect(p.hot).toEqual(pack.regions.map((r) => r.id));
  expect(p.regions[pack.regions[0].id]).toBeGreaterThan(0);
  const seat = g.members.find((m) => m.region === pack.regions[0].id)!;
  expect(seat.memory.join(" ")).not.toContain("the harbor tolls");
  expect(seat.memory.join(" ")).toContain("passing it on");
});

test("losing the post duel is recorded on the post", () => {
  const g = game();
  expect(applyPost(pack, g, 1, "x", react("ignore"), said, agreeAll("rival"), tagFor()).won).toBe(false);
  expect(applyPost(pack, g, 2, "x", react("ignore"), said, agreeAll("government"), tagFor()).won).toBe(true);
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
  g.ledgers.loyalty = 20;
  for (const r of REGIONS) g.ledgers.popularity[r] = 30;
  expect(belowLine(pack, g)).toEqual([]);   // §4 is strict: < 20 and < 30, so at the line is not under it
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
  const v3: Pack = { ...pack, constitution: undefined };
  expect(holdersOf(v3).map((h) => h.id)).toEqual(["chamber", "street"]);
  expect(weightOf(v3, "street")).toBe(pack.chamber.alpha);
  // A stored v3 pack keeps a winnable test: the chamber and the street, mixed by alpha as in v3.
  expect(runTest(v3, newGame("g-v3", CODE, v3, "harborites", PROMISES, CAL), { chamber: 1, street: 1 }).won).toBe(true);
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
  g.holders.league.resistance = 12.3;
  expect(easeResistance(pack, g, ["league"], 0.1, "a small gift")[0].delta).toBe(-0.1);   // the wire prints no float noise
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
  g.ledgers.loyalty = 20;
  endTurn(pack, g);
  expect(g.revolt).toBeNull();                         // at the line is not under it
  g.ledgers.loyalty = 10;
  endTurn(pack, g);
  expect(g.revolt).toBe(g.turn);                       // the turn about to be played, not the one just ended
  expect(g.marks.midterm.length).toBe(cls * 2);        // 16
  endTurn(pack, g);
  expect(g.revolt).toBe(g.turn);                       // still under the line, still in revolt
  expect(g.marks.midterm.length).toBe(cls * 2);        // and the class does not double again
});

test("the last turn of the term goes straight to the test, with no campaign stage", () => {
  const g = game();
  g.turn = 10;
  endTurn(pack, g);
  expect(g.stage).toBe("midterm");
  const h = game();
  h.turn = TURNS_PER_TERM;
  endTurn(pack, h);
  expect(h.stage).toBe("test");
  expect("campaign" in h).toBe(false);
});

test("popularity under its line puts the early test caller at its line, and it warns and fires", () => {
  const g = game();
  for (const r of REGIONS) g.ledgers.popularity[r] = 20;   // under the line of 30
  const out = endTurn(pack, g);
  expect(out.warned.map((w) => w.holder)).toEqual(["council"]);
  endTurn(pack, g);
  const fired = endTurn(pack, g);
  expect(fired.fired.map((w) => w.holder)).toEqual(["council"]);
  expect(g.stage).toBe("test");
  expect(g.earlyTest).toBe("council");
});

test("a law in force collects every turn until it is repealed", () => {
  const g = game();
  enact(g, { id: "l1", verb: "law", title: "The harbour levy", perTurn: [{ ledger: "treasury", delta: 6 }], repealConsent: "chamber", sunset: null });
  endTurn(pack, g);
  expect(g.ledgers.treasury).toBe(6);
  expect(g.wire.find((w) => w.cause === "The harbour levy")!.delta).toBe(6);
  endTurn(pack, g);
  expect(g.ledgers.treasury).toBe(12);
  expect(repeal(g, "l1")).toBe(true);
  expect(repeal(g, "l1")).toBe(false);
  endTurn(pack, g);
  expect(g.ledgers.treasury).toBe(12);
});

test("an authored sunset lapses the law on its own", () => {
  const g = game();
  enact(g, { id: "l2", verb: "decree", title: "A two tide curfew", perTurn: [{ ledger: "popularity", delta: -2 }], repealConsent: "none", sunset: 2 });
  endTurn(pack, g);
  endTurn(pack, g);
  expect(inForceAge(g, g.inForce[0])).toBe(2);
  endTurn(pack, g);
  expect(g.inForce).toEqual([]);
});

test("a per region rate moves every region", () => {
  const g = game();
  const before = { ...g.ledgers.popularity };
  enact(g, { id: "l3", verb: "law", title: "Relief for the quay", perTurn: [{ ledger: "popularity", delta: 1 }], repealConsent: "chamber", sunset: null });
  endTurn(pack, g);
  for (const r of REGIONS) expect(g.ledgers.popularity[r]).toBe(before[r] + 1 - (r === g.rival!.region ? RIVAL_HIT : 0));
});

test("a court that strikes takes the newest law in force with it", () => {
  const g = game();
  enact(g, { id: "l4", verb: "law", title: "The old levy", perTurn: [{ ledger: "treasury", delta: 1 }], repealConsent: "chamber", sunset: null });
  enact(g, { id: "l5", verb: "decree", title: "The new curfew", perTurn: [{ ledger: "popularity", delta: -1 }], repealConsent: "none", sunset: null });
  const authority = g.ledgers.authority;
  fireResponse(pack, g, { holder: "council", response: "strike", at: 1, fires: 3, number: 70 });
  expect(g.inForce.map((l) => l.id)).toEqual(["l4"]);   // the newest goes, the older one stands
  expect(g.ledgers.authority).toBe(authority - STRIKE_HIT);
});

const estimate = (o: unknown) => Math.ceil(JSON.stringify(o).length / 4);

test("the record is bounded, and drops its softest lines first", () => {
  const g = game();
  g.term = 3;
  for (let i = 0; i < 40; i++) {
    g.bills.push({ id: i, text: "", title: `Decree ${i}`, summary: "", tags: [], offers: {}, headline: { title: `A long headline about decree ${i} and the harbour`.repeat(4), lede: "" } });
    enact(g, { id: `l${i}`, verb: "law", title: `A law with a long name number ${i}`.repeat(3), perTurn: [{ ledger: "treasury", delta: 1 }], repealConsent: "none", sunset: null });
  }
  const full = record(pack, g);
  expect(estimate(full)).toBeLessThanOrEqual(RECORD_TOKENS);
  expect(full.term).toBe(3);
  const tiny = record(pack, g, 60);
  expect(estimate(tiny)).toBeLessThanOrEqual(60);
  expect(tiny.term).toBe(3);
  expect(tiny.headlines).toBeUndefined();
});

import { callsLeft, JEV_CALLS, spendCalls } from "./engine";

test("a new game opens the act state empty and the call budget full", () => {
  const g = game();
  expect(g.tag).toBeNull();
  expect(g.refusal).toBeNull();
  expect(g.acts).toEqual([]);
  expect(g.rival).toBeNull();
  expect(g.calls).toBe(0);
  expect(g.extra).toEqual([]);
  expect(g.emergency).toBeNull();
  expect(g.media).toBe(0);
  expect(g.trust).toBe(1);
  expect(callsLeft(g)).toBe(JEV_CALLS);
});

test("the sixth Jev call of a turn lands and the seventh waits for the boundary", () => {
  const g = game();
  for (let i = 0; i < JEV_CALLS; i++) expect(spendCalls(g)).toBe(true);
  expect(spendCalls(g)).toBe(false);
  expect(callsLeft(g)).toBe(0);
  endTurn(pack, g);
  expect(g.calls).toBe(0);
  expect(callsLeft(g)).toBe(JEV_CALLS);
});

test("the boundary clears the price tag, the refusal and the turn's swing", () => {
  const g = game();
  g.tag = { verb: "decree", title: "A levy", reading: "Raise the levy.", credibility: 1,
    quoted: { authority: 0, treasury: 0, chest: 0 }, charge: { authority: 3, treasury: 0, chest: 0 },
    discounted: false, revenue: [], serves: [], hits: [], keeps: [], targets: null, tags: [], regions: [],
    member: null, promises: [], sunset: null, template: null, stances: [] };
  g.refusal = { line: "The chair cannot do that.", test: "power", cost: 1 };
  g.swing = 9;
  endTurn(pack, g);
  expect(g.tag).toBeNull();
  expect(g.refusal).toBeNull();
  expect(g.swing).toBe(0);
});

import { capSwing, JEV_SWING } from "./engine";

test("one turn's Jev answers can only move the country so far", () => {
  const g = game();
  const all = (d: number) => Object.fromEntries(REGIONS.map((r) => [r, d]));
  const first = capSwing(pack, g, all(-8));
  expect(first[REGIONS[0]]).toBe(-8);
  expect(g.swing).toBeCloseTo(8, 1);
  const second = capSwing(pack, g, all(-8));
  expect(Math.abs(second[REGIONS[0]])).toBeCloseTo(4, 1);       // only 4 of the 12 was left
  expect(g.swing).toBeCloseTo(JEV_SWING, 1);
  const third = capSwing(pack, g, all(-8));
  expect(third[REGIONS[0]]).toBeCloseTo(0, 5);   // round1(-8 * 0) is -0, and Object.is(-0, 0) is false
  endTurn(pack, g);
  expect(g.swing).toBe(0);
});

test("the citizens' read is capped like every other Jev answer", () => {
  const g = game();
  g.swing = JEV_SWING;
  const before = { ...g.ledgers.popularity };
  applyCitizens(pack, g, Object.fromEntries(pack.citizens.map((c) => [c.id, 0])));
  for (const r of REGIONS) expect(g.ledgers.popularity[r]).toBeCloseTo(before[r], 5);
});

import { deckOf, FIC_TURNS, foreignPending, FOREIGN_PRICE, resolveForeign } from "./engine";

test("an abroad holder over half its line puts a foreign move on the desk, and only once a term", () => {
  const g = game();
  expect(foreignPending(pack, g)).toBeNull();
  g.holders.league.resistance = 30;                 // its line is 50
  expect(foreignPending(pack, g)!.id).toBe("league");
  const card = director(g, pack)!;
  expect(card.kind).toBe("foreign");
  expect(card.holder).toBe("league");
  expect(card.stances).toHaveLength(2);
  expect(director(g, pack)?.kind).not.toBe("foreign");
});

test("giving a foreign power what it asks costs treasury and starts its payments", () => {
  const g = game();
  g.ledgers.treasury = 30;
  g.holders.league.resistance = 40;
  const e = { id: "foreign-league-1", turn: 1, relief: false, kind: "foreign" as const, holder: "league", stances: ["Give", "Refuse"] };
  resolveForeign(pack, g, e, 0);
  expect(g.ledgers.treasury).toBe(30 - FOREIGN_PRICE);
  expect(g.holders.league.resistance).toBe(30);
  expect(g.inForce.find((l) => l.id === "gives-league")!.perTurn[0]).toEqual({ ledger: "treasury", delta: 4 });

  const h = game();
  h.holders.league.resistance = 40;
  resolveForeign(pack, h, { ...e }, 1);
  expect(h.holders.league.resistance).toBe(52);      // RESIST_BYPASS
  expect(h.inForce).toEqual([]);
});

test("three quiet turns owe the player a card", () => {
  const g = game();
  endTurn(pack, g);
  expect(g.quiet).toBe(1);                       // no act, no vote, no rate: not one ledger line
  const h = game();
  h.quiet = FIC_TURNS;
  h.director.lastCrisis = h.turn;                // even with a crisis last turn, the floor fires
  const card = director(h, pack);
  expect(card).not.toBeNull();
  expect(card!.relief).toBe(false);
});

test("a black swan waits for a clear turn and fires at most once a term", () => {
  const g = game();
  expect(deckOf(pack, g).filter((s) => s.kind === "swan")).toHaveLength(0);   // mini.json ships none
  const swans = [1, 2, 3].map((i) => ({
    id: `swan-0${i}`, kind: "swan" as const, weight: 1, title_hint: "The mole gives way in a night storm",
    stances: ["Rebuild it now", "Let the ships wait"], scored: ["blocs" as const], results: [], memory: null,
  }));
  g.extra.push(...swans);
  expect(deckOf(pack, g).filter((s) => s.kind === "swan")).toHaveLength(3);

  g.director.lastCrisis = g.turn;                   // the turn after a crisis is never clear
  for (let i = 0; i < 40; i++) expect(director(g, pack)?.kind).not.toBe("swan");

  const h = game();
  h.extra.push(...swans);
  h.director.swan = String(h.term);                 // one a term, and this term already spent it
  for (let i = 0; i < 40; i++) expect(director(h, pack)?.kind).not.toBe("swan");
});

test("a continue turns the calendar's unfired cards into ordinary ones", () => {
  const g = game();
  const dated = pack.deck.filter((s) => s.kind === "dated").map((s) => s.id);
  endTerm(pack, g, runTest(pack, g, { council: 1, street: 1 }));
  continueTerm(pack, g);
  for (const id of dated) expect(g.director.seen).toContain(id);
  expect(g.extra.filter((s) => s.kind === "generic").length).toBe(dated.length);
  expect(deckOf(pack, g).length).toBe(pack.deck.length + dated.length);
});

import { RIVAL_HIT, rivalMove } from "./engine";

test("the rival is a named person backed by a holder, and works the weakest region", () => {
  const g = game();
  g.holders.council.resistance = 44;
  const weakest = [...pack.regions].sort((a, b) => g.ledgers.popularity[a.id] - g.ledgers.popularity[b.id])[0];
  const before = g.ledgers.popularity[weakest.id];
  const out = rivalMove(pack, g)!;
  expect(out.move.name).toBe("Warden Ossin Drell");   // the keelwrights hold 8 seats, the tidebound 6
  expect(out.move.backer).toBe("council");             // the home holder nearest its own line
  expect(out.move.region).toBe(weakest.id);
  expect(out.move.line).toContain(out.move.name);
  expect(g.ledgers.popularity[weakest.id]).toBeCloseTo(before - RIVAL_HIT, 1);
  expect(out.wire.every((w) => w.kind === "ledger")).toBe(true);
});

test("the boundary records the rival's move and prints it when nothing louder is waiting", () => {
  const g = game();
  // The Director must draw nothing, or "A card is on the desk." wins the pending line: the turn after a
  // crisis is never clear, and an exogenous dated card lands whatever the gap, so the deck is spent.
  g.director.lastCrisis = g.turn + 1;
  g.director.seen = pack.deck.map((s) => s.id);
  const out = endTurn(pack, g);
  expect(g.rival!.turn).toBe(1);                 // the turn that just ended, not the one about to be played
  expect(out.pending).toContain(g.rival!.name);
});

test("drift rides on top of every citizen read, so a hardened base stays hardened", () => {
  const g = game();
  const b = pack.blocs[0].id;
  g.drift[b] = 0.2;
  applyCitizens(pack, g, Object.fromEntries(pack.citizens.map((c) => [c.id, 0.5])));
  expect(g.blocs[b]).toBeCloseTo(0.7, 5);
  expect(g.blocs[pack.blocs[1].id]).toBeCloseTo(0.5, 5);
});
