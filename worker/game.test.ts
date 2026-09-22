import { test, expect, mock } from "bun:test";
// game.ts pulls in `cloudflare:workers` for the Durable Object class, which only workerd resolves.
mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));
const { view, pickStart, GameDO } = await import("./game");
import { encodeCode, newGame, scenarioTag, type Game } from "./engine";
import { PackSchema, type Citizen, type Pack } from "./pack";
import mini from "./fixtures/mini.json";

const citizens = (): Citizen[] => Array.from({ length: 250 }, (_, i) => ({
  id: `c-${i}`, region: mini.regions[i % mini.regions.length].id, bloc: `b0${(i % 5) + 1}`, name: `Citizen ${i}`,
  age: 20 + (i % 50), job: "harbor worker", town: "Harbor City",
  worldview: "wants the harbor to stay prosperous", issues: ["tariffs", "dockworker-pay"] as [string, string], weight: 1,
}));
const pack: Pack = PackSchema.parse({ ...mini, citizens: citizens() });

test("the view strips personas, citizens and the deck", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 42 });
  const game: Game = newGame("g", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
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

test("create() picks the start by faction id, not array position, when starts are shuffled", () => {
  // PackSchema now rejects starts out of factions order, so shuffle after validation: pickStart
  // stays defensive even though a stored pack can no longer reach this shape through the schema.
  const shuffled: Pack = { ...pack, starts: [...pack.starts].reverse() };
  expect(shuffled.starts[0].faction).toBe("tidebound");   // reversed: no longer lines up with factions[0]
  const start = pickStart(shuffled, 0);                   // factions[0] is harborites
  expect(start?.faction).toBe("harborites");
  expect(pickStart(shuffled, 99)).toBeUndefined();
});

test("a second request while one is in flight gets 409 one move at a time", async () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 1 });
  const game: Game = newGame("g-busy", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  const ctx = { storage: { sql: { exec: () => ({ toArray: () => [] }) } } } as any;
  const doInstance = new GameDO(ctx, {} as any);
  (doInstance as any).ctx = ctx;
  (doInstance as any).saved = { game, prose: {} };
  (doInstance as any).pack = pack;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((res) => { entered = res; });
  let resolveSlow!: () => void;
  (doInstance as any).term = () => { entered(); return new Promise<void>((res) => { resolveSlow = res; }); };

  const req = () => new Request("https://do/test", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  const p1 = doInstance.fetch(req());
  await enteredPromise;
  const r2 = await doInstance.fetch(req());
  expect(r2.status).toBe(409);
  expect(await r2.json()).toEqual({ error: "one move at a time" });

  resolveSlow();
  const r1 = await p1;
  expect(r1.status).toBe(200);
});
