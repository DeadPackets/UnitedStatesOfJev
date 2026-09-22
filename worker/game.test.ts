import { test, expect, mock } from "bun:test";
// game.ts pulls in `cloudflare:workers` for the Durable Object class, which only workerd resolves.
mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));
const { calendarOf, view } = await import("./game");
import { encodeCode, newGame, scenarioTag, type Game } from "./engine";
import { PackSchema, type Citizen, type Pack } from "./pack";
import { turnOf } from "./gen/validate";
import mini from "./fixtures/mini.json";

const citizens = (): Citizen[] => Array.from({ length: 250 }, (_, i) => ({
  id: `c-${i}`, region: mini.regions[i % mini.regions.length].id, bloc: `b0${(i % 5) + 1}`, name: `Citizen ${i}`,
  age: 20 + (i % 50), job: "harbor worker", town: "Harbor City",
  worldview: "wants the harbor to stay prosperous", issues: ["tariffs", "dockworker-pay"] as [string, string], weight: 1,
}));
const pack: Pack = PackSchema.parse({ ...mini, citizens: citizens() });
const withDeck = (deck: Pack["deck"]): Pack => ({ ...pack, deck });
const dated = (id: string, date: string, turn: number) => ({ ...pack.deck[0], id, kind: "dated" as const, date, turn });

// The seven dated cards of the live Rome pack (v3nj3k), which the deck step numbered against a week calendar.
const ROME: [string, number][] = [
  ["-0044-03-17", 1], ["-0044-03-20", 1], ["-0044-04-18", 5], ["-0044-05-01", 7],
  ["-0044-06-05", 12], ["-0044-06-10", 13], ["-0044-07-20", 19],
];

test("the calendar is recovered from the dated cards", () => {
  const deck = ROME.map(([d, t], i) => dated(`dat-0${i + 1}`, d, t));
  const cal = calendarOf(withDeck(deck));
  expect(cal.unit).toBe("week");
  for (const s of deck) expect(turnOf(s.date, cal.start_date, cal.unit)).toBe(s.turn);
});

test("a deck no calendar fits falls back to the stored turns", () => {
  const cal = calendarOf(withDeck([dated("dat-01", "0450-06-01", 4), dated("dat-02", "0451-11-20", 12)]));
  expect(turnOf("0450-06-01", cal.start_date, cal.unit)).toBeNull();
});

test("the view strips personas, citizens and the deck", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 42 });
  const game: Game = newGame("g", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], calendarOf(pack));
  const v = view(pack, { game, prose: {} });
  expect(v.scenario).toBe(pack.id);
  expect("deck" in v.pack).toBe(false);
  expect(v.pack.members.some((m) => "bio" in m || "tell" in m)).toBe(false);
  expect(v.members.some((m) => "bio" in m || "tell" in m)).toBe(false);
  expect(v.members).toHaveLength(pack.chamber.size);
  expect(Object.keys(v.citizens[0])).toEqual(["id", "region", "bloc", "name", "weight"]);
  expect(v.citizens).toHaveLength(250);
  expect("director" in v).toBe(false);
  expect(v.coalition).not.toContain("harborites");   // partners only, never the player's own faction
  expect(v.turnsPerTerm).toBe(20);
});
