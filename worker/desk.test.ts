import { expect, test } from "bun:test";
import { commit, priceTag } from "./acts";
import { deskView } from "./desk";
import { applyVote, encodeCode, newGame, scenarioTag, type Game, type Quote } from "./engine";
import { PackSchema, type Pack, type Verb } from "./pack";

const load = async (file: string) =>
  PackSchema.parse(await Bun.file(`${import.meta.dir}/fixtures/${file}.json`).json());
function seat(pack: Pack, ruler: string): Game {
  const code = encodeCode({
    scenario: scenarioTag(pack.id),
    faction: pack.factions.findIndex((faction) => faction.id === ruler),
    promises: [0, 1, 2],
    seed: 7,
  });
  const promises = pack.promises.slice(0, 3).map((promise) => promise.tag);
  return newGame("g", code, pack, ruler, promises, pack.calendar);
}
const quote = (verb: Verb, touches: string[] = []): Quote => ({
  verb,
  title: "The act",
  reading: "You act.",
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
  tags: [],
  touches,
  regions: [],
  promises: [],
  sunset: null,
  template: null,
});

for (const [file, ruler, verb, veto] of [
  ["westeros", "baratheon", "force", "houses"],
  ["biden-2021", "dem", "appoint", "congress"],
] as const) {
  test(`${file}: the blocked veto follows ${veto}'s support after the act was priced`, async () => {
    const pack = await load(file);
    const game = seat(pack, ruler);
    game.tag = priceTag(pack, game, quote(verb));
    game.holders[veto].support = 100;
    expect(deskView(pack, game).receipt!.blocked).toBeNull();
    game.holders[veto].support = 0;
    expect(deskView(pack, game).receipt!.blocked!.id).toBe(veto);
  });
}

test("an emblem that fails the check draws the line icon, and every row keeps one", async () => {
  const pack = await load("biden-2021");
  const game = seat(pack, "dem");
  pack.constitution!.holders[0].emblem = { size: 24, elements: [{ tag: "script" }] } as never;
  const rim = deskView(pack, game).rim;
  expect(rim[0].emblem).toBeNull();
  expect(rim.every((row) => row.icon)).toBe(true);
  expect(new Set(rim.map((row) => row.id)).size).toBe(pack.constitution!.holders.length); // own party once
  expect(deskView(pack, game).factions.find((faction) => faction.id === "ind")!.emblem).toBeNull();
});

test("a law's receipt counts every seat, names each hesitant one, and its defeat costs what its passage pays", async () => {
  const pack = await load("biden-2021");
  const game = seat(pack, "dem");
  for (const member of game.members) member.mood = 0; // the whip below alone decides who hesitates
  const tag = priceTag(pack, game, quote("law", ["relief checks"]));
  tag.count = {
    whip: Object.fromEntries(game.members.map((member, i) => [member.id, (i % 3) / 2])),
    blocs: {},
    patrons: {},
    vetoes: {},
    filibuster: 0,
    constitutional: 0,
  };
  game.tag = tag;
  const receipt = deskView(pack, game).receipt!;
  const count = receipt.count!;
  expect(count.factions.reduce((sum, f) => sum + f.for + f.against + f.hesitant, 0)).toBe(
    game.members.length,
  );
  for (const faction of count.factions) {
    expect(faction.hesitantNames).toHaveLength(faction.hesitant);
    // a seat opens the member it shows: each faction's leans add up to its split
    const leans = game.members
      .filter((m) => m.faction === faction.id)
      .map((m) => count.leans[m.id]);
    expect([faction.for, faction.against, faction.hesitant]).toEqual(
      ["for", "against", "hesitant"].map((lean) => leans.filter((l) => l === lean).length),
    );
  }
  const authority = (lines: typeof receipt.pass) =>
    lines.find((line) => line.id === "authority")?.delta ?? 0;
  expect(authority(receipt.pass)).toBeGreaterThan(0);
  expect(authority(receipt.fail)).toBeLessThan(0);

  commit(pack, game, tag);
  // tabled, it waits on the floor with the count the receipt showed, until the vote
  expect(deskView(pack, game).floor!.count!.factions).toEqual(
    count.factions.map(({ terms, ...f }) => f),
  );
  const tabled = structuredClone(game);
  applyVote(pack, game, game.bills.at(-1)!);
  // a vote moves moods (a threatened seat that voted no sulks): the call still follows the count as it was shown
  for (const member of game.members) member.mood -= 0.2;
  expect(deskView(pack, game).floor).toBeNull();
  const verdict = deskView(pack, game, tabled).verdict!;
  // the seats called by name are the ones the count showed hesitant
  expect(
    verdict.order
      .filter((seat) => seat.hesitant)
      .map((seat) => seat.member)
      .sort(),
  ).toEqual(
    Object.keys(count.leans)
      .filter((id) => count.leans[id] === "hesitant")
      .sort(),
  );
  expect(new Set(verdict.order.map((seat) => seat.member)).size).toBe(game.members.length);
  const hesitant = verdict.order.map((seat) => seat.hesitant);
  expect(hesitant).toEqual([...hesitant].sort()); // every sure seat is called before any hesitant one
  expect(verdict.order.filter((seat) => seat.yes)).toHaveLength(verdict.yes);
});

for (const [file, ruler] of [
  ["westeros", "baratheon"],
  ["biden-2021", "dem"],
] as const) {
  test(`${file}: at 0 authority the desk names what the clerk can still price before any call`, async () => {
    const pack = await load(file);
    const game = seat(pack, ruler);
    expect(deskView(pack, game).shut).toBeNull();
    game.ledgers.authority = 0;
    const shut = deskView(pack, game).shut!;
    const name = (verb: Verb) => pack.constitution!.instruments[verb]!.name;
    expect(shut).toContain(`${name("spend")}, ${name("proclaim")}`);
    expect(shut).not.toContain(name("decree"));
  });
}
