import { test, expect } from "bun:test";
import { encodeCode, decodeCode, seatChamber, drawVotes, applyVote, newGame, dailyCode, type RosterSenator, type Settings, type Bill } from "./engine";
import { STATE_IDS } from "./states";

const roster: RosterSenator[] = STATE_IDS.flatMap((st) => [1, 2].flatMap((n) => (["D", "R"] as const).map((party) => ({
  id: `${st}-${n}-${party}`, seat: `${st}-${n}`, state: st, party, name: `Sen ${st}${n}${party}`, bio: "", core_issues: ["taxes", "guns"],
  temperament: "loyalist", tell: "", donors: ["banks"], years_in_office: "mid" as const,
}))));
const settings: Settings = { v: 1, party: "D", seats: 55, mode: "term", pop: 1, lobby: true, amend: false, agenda: 0, seed: 123456789 };

test("code round-trips", () => {
  const code = encodeCode(settings);
  expect(code).toMatch(/^J1-D55TPL-X-[0-9A-Z]{6}$/);
  expect(decodeCode(code)).toEqual(settings);
  expect(decodeCode(dailyCode(new Date("2026-09-21"))).mode).toBe("agenda");
  expect(() => decodeCode("J1-D65TPL-X-000000")).toThrow();
});

test("seating is deterministic and honors the split", () => {
  const a = seatChamber(roster, settings), b = seatChamber(roster, settings);
  expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
  expect(a.filter((s) => s.party === "D").length).toBe(55);
  expect(a.filter((s) => s.situation).length).toBe(15);
  expect(seatChamber(roster, { ...settings, party: "R", seats: 40 }).filter((s) => s.party === "R").length).toBe(40);
  expect(a.find((s) => s.state === "VT")!.party).toBe("D");
  expect(a.find((s) => s.state === "WY")!.party).toBe("R");
});

test("votes reproduce and consequences stay bounded", () => {
  const game = newGame("g", encodeCode(settings), roster);
  const whip = Object.fromEntries(game.seated.map((s) => [s.id, s.party === "D" ? 0.9 : 0.1]));
  expect(drawVotes(whip, 1, 0)).toEqual(drawVotes(whip, 1, 0));
  const bill: Bill = { id: 0, text: "", title: "Test Act", summary: "", tags: [], offers: { [game.seated[0].id]: "x" }, whip, filibuster: 0.2, blocs: { labor: 2 }, constitutional: 0 };
  game.bills.push(bill);
  applyVote(game, bill);
  expect(bill.passed).toBe(true);
  expect(game.turn).toBe(1);
  expect(game.seated[0].memory.length).toBe(1);
  for (const v of Object.values(game.approval)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  for (let i = 1; i < 40; i++) { const b = { ...bill, id: i, offers: {} }; game.bills.push(b); applyVote(game, b); }
  expect(game.phase).toBe("over");
  expect(game.result!.score).toBeGreaterThan(0);
});
