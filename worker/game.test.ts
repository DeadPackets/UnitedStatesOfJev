import { test, expect, mock, afterEach } from "bun:test";
// game.ts pulls in `cloudflare:workers` for the Durable Object class, and build.ts for the portrait sheet;
// only workerd resolves either module.
mock.module("cloudflare:workers", () => ({ DurableObject: class {}, WorkflowEntrypoint: class {} }));
mock.module("cloudflare:workflows", () => ({ NonRetryableError: class extends Error {} }));
const { view, pickStart, GameDO, seededSample, streetSample } = await import("./game");
import { encodeCode, hash, newGame, scenarioTag, type Game } from "./engine";
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

test("the view carries the room, the instruments and the bar", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 55 });
  const game: Game = newGame("g-view", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  game.holders.guard.resistance = 50;
  const v = view(pack, { game, prose: {} });
  expect(v.holders.map((h) => h.id)).toEqual(["council", "guard", "street", "league"]);
  expect(v.holders.find((h) => h.id === "council")!.weight).toBe(0.4);
  expect(v.holders.find((h) => h.id === "guard")!.nearest).toBe(true);   // 50 of 55 against 0 of 60, 70 and 50
  expect(v.instruments.law!.name).toBe("a decree of the council");
  expect(v.instruments.force!.affordable).toBe(true);
  expect(v.bar).toBeCloseTo(0.5, 5);
  expect(v.ruler.role).toBe("Consul");
  expect(v.shortfall).toBe(3);                                            // 13 needed, harborites hold 10
  expect(v.handicap).toBe(0);
  // "Counts coins while he talks." is the guard holder's tell in mini.json: the prose stays in the Worker.
  expect(JSON.stringify(v)).not.toContain("Counts coins while he talks.");
});

test("a pack with no constitution ships the v3 room of chamber and street", () => {
  const bare: Pack = { ...pack, constitution: undefined };
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 56 });
  const game: Game = newGame("g-bare", code, bare, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], bare.calendar);
  const v = view(bare, { game, prose: {} });
  expect(v.holders.map((h) => h.id)).toEqual(["chamber", "street"]);
  expect(Object.keys(v.instruments)).toEqual(["law", "proclaim"]);   // the two doors v3 had, so its screens still work
  expect(v.bar).toBeCloseTo(0.5, 5);
  expect(v.ruler.role).toBe("Consul");     // the start's seat_title, since no constitution names one
});

test("the view prices every lobby offer, escalations included", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 3 });
  const game: Game = newGame("g-cost", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  expect(view(pack, { game, prose: {} }).lobbyCosts).toEqual({ pork: 10, favor: 15, threat: 20 });
  game.escalations.push("costly_favors");
  expect(view(pack, { game, prose: {} }).lobbyCosts).toEqual({ pork: 15, favor: 23, threat: 30 });
});

test("a drafted bill already carries the bar it has to clear", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 4 });
  const game: Game = newGame("g-need", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  game.bills.push({ id: game.turn, title: "A bill", summary: "", text: "", tags: [], offers: {} });
  expect(view(pack, { game, prose: {} }).bills[0].needed).toBe(pack.chamber.threshold);
  game.bills[0].whip = Object.fromEntries(game.members.map((m) => [m.id, 0.5]));
  const row = view(pack, { game, prose: {} }).bills[0];
  expect(row.band![0]).toBeLessThanOrEqual(row.expected!);
  expect(row.band![1]).toBeGreaterThanOrEqual(row.expected!);
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

test("a game stored before the feed or the v4 ledgers existed still loads", async () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 7 });
  const { posts: _none, ledgers, ...rest } = newGame("g-old", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  const old = { ...rest, ledgers: { approval: ledgers.popularity, capital: 40, party: 55, chest: 3 },
    stage: "campaign", campaign: { drafts: [], messages: [], turns: [], rival: [], intent: {} } };
  const row = { v: JSON.stringify({ game: old, prose: {} }) };
  const ctx = { storage: { sql: { exec: () => ({ toArray: () => [row] }) } } } as any;
  const doInstance = new GameDO(ctx, {} as any) as any;
  doInstance.ctx = ctx; doInstance.env = {};
  doInstance.pack = pack;
  const r = await doInstance.fetch(new Request("https://do/state"));
  expect(r.status).toBe(200);
  const v = await r.json() as any;
  expect(v.posts).toEqual([]);
  expect(v.ledgers.authority).toBe(40);
  expect(v.ledgers.loyalty).toBe(55);
  expect(v.ledgers.treasury).toBe(0);
  expect(v.ledgers.capital).toBe(40);
  expect(v.stage).toBe("test");
  expect("campaign" in v).toBe(false);
});

test("the view still answers to the v3 ledger names until Stage C", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 9 });
  const game: Game = newGame("g-compat", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  const v = view(pack, { game, prose: {} });
  expect(v.ledgers.capital).toBe(game.ledgers.authority);
  expect(v.ledgers.party).toBe(game.ledgers.loyalty);
  expect(v.ledgers.approval).toEqual(game.ledgers.popularity);
});

test("a second request while one is in flight gets 409 one move at a time", async () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 1 });
  const game: Game = newGame("g-busy", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  const ctx = { storage: { sql: { exec: () => ({ toArray: () => [] }) } } } as any;
  const doInstance = new GameDO(ctx, {} as any);
  (doInstance as any).ctx = ctx; (doInstance as any).env = {};
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

let refuse = false;
let lawTag = false;
let postTag = false;

// Every model call goes out through one fetch: `systemone` is Jev, `chat/completions` is Luna, keyed by schema name.
const canned = (name: string, user: string): unknown => {
  switch (name) {
    case "price": return refuse
      ? { verb: "decree", title: "A satellite over the harbour", reading: "You put a satellite over the harbour.",
          power: true, era: false, refusal: "This age cannot lift anything over the harbour.", credibility: 0.6,
          cost: { authority: 0, treasury: 0, chest: 0 }, revenue: [], serves: [], hits: [], keeps: [],
          targets: null, tags: [], regions: [], promises: [], sunset: null, template: null }
      : { verb: postTag ? "proclaim" : lawTag ? "law" : "decree", title: "Raise the harbour levy", reading: "You raise the levy on the wharf.",
          power: true, era: true, refusal: null, credibility: 0.9,
          cost: { authority: 0, treasury: 0, chest: 0 },
          revenue: [{ ledger: "treasury", id: null, delta: 6 }],
          serves: ["guard"], hits: ["league"], keeps: ["tariffs"], targets: postTag ? [pack.blocs[0].id] : null,
          tags: ["tariffs"], regions: [], promises: [], sunset: null, template: null };
    case "bill": return { title: "Harbor Levy", summary: "It raises the levy on the wharf.", tags: ["tariffs"] };
    case "headline": case "halfterm": return { title: "The seats change hands", lede: "The council woke up smaller. Nobody in the chair slept." };
    case "quotes": return { quotes: [] };
    case "replies": return { replies: [{ name: "Citizen 1", text: "The wharf still floods." }], rival: "They promised the accounts and published nothing." };
    case "outcome": return { line: "It held." };
    case "card": return { title: "A storm", body: "The wharf floods.", stances: ["Hold the line"] };
    case "ending": return { title: "Out", body: "The term ends." };
    case "freshcards": return { cards: [
      { title_hint: "The mole cracks", stances: ["Rebuild it", "Let it go"], results: [{ ledger: "capital", id: null, delta: -4 }] },
      { title_hint: "A rival fleet calls", stances: ["Open the port", "Close it"], results: [{ ledger: "approval", id: null, delta: 2 }] },
    ] };
    case "newmembers": return {
      rows: (JSON.parse(user).rows as { id: string }[]).map((r, i) => ({
        id: r.id, name: `Newcomer ${i + 1}`, bio: "Won the seat in the swing.", tell: "Reads the roll twice.", core_issues: ["tariffs"],
      })),
    };
    default: return {};
  }
};

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubModels(intent: number) {
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.questions) {
      // A citizen's vote intent drives the midterm draw; every other answer is a comfortable yes.
      // A choice question goes on the wire as criteria keys, and answers with probabilities over them.
      const answers = Object.fromEntries(Object.entries(body.questions as Record<string, any>).map(([k, q]) =>
        [k, q.type === "choice"
          ? { probabilities: Object.fromEntries(Object.keys(q.criteria).map((o, i) => [o, i === 0 ? 0.7 : 0.1])) }
          : { noul: k.startsWith("vote_") ? intent : 0.9, score: 0.5 }]));
      return Response.json({ answers, usage: { input_tokens: 1 } });
    }
    const name = body.response_format?.json_schema?.name;
    if (!name) return Response.json({});   // the portrait sheet's image call, which has no schema and no answer here
    return Response.json({ choices: [{ message: { content: JSON.stringify(canned(name, body.messages[1].content)) } }] });
  }) as unknown as typeof fetch;
}

function seatedGame(seed: number) {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed });
  const game: Game = newGame("g-mid", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  const background: Promise<unknown>[] = [];
  const ctx = { storage: { sql: { exec: () => ({ toArray: () => [] }) } }, waitUntil: (p: Promise<unknown>) => background.push(p) } as any;
  const do_ = new GameDO(ctx, {} as any) as any;
  do_.ctx = ctx; do_.env = { OPENROUTER_API_KEY: "test" };
  do_.saved = { game, prose: {} };
  do_.pack = pack;
  const post = async (path: string, body: unknown) => {
    const r = await do_.fetch(new Request(`https://do/${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
    return { status: r.status, body: await r.json() as any };
  };
  return { do_, game, background, post, view: () => view(pack, do_.saved) };
}

async function playTo(post: (p: string, b: unknown) => Promise<{ status: number }>, game: Game, n: number) {
  while (game.turn <= n && (game.stage === "session" || game.stage === "midterm")) {
    const turn = game.turn;
    if (game.stage === "midterm") {
      const r = await post("midterm", { turn });
      if (r.status !== 200) throw new Error(`midterm on turn ${turn}: ${r.status}`);
      continue;
    }
    if (game.phase === "draft") {
      game.bills.push({ id: turn, text: "", title: "Harbor Levy", summary: "It raises the levy.", tags: ["tariffs"], offers: {} });
      game.phase = "whip";
    }
    for (const path of [`bills/${turn}/whip`, `bills/${turn}/vote`]) {
      const r = await post(path, { turn, text: "Raise the harbor levy on the wharf and publish the accounts each month." });
      if (r.status !== 200) throw new Error(`${path} on turn ${turn}: ${r.status}`);
    }
    // The Director draws at the boundary now, so last turn's card is on the desk and holds this one.
    for (const [i, e] of game.events.entries()) {
      if (e.stance !== undefined) continue;
      const r = await post(`events/${i}`, { turn, stance: 0 });
      if (r.status !== 200) throw new Error(`events/${i} on turn ${turn}: ${r.status}`);
    }
    const end = await post("turn/end", { turn });
    if (end.status !== 200) throw new Error(`turn/end on turn ${turn}: ${end.status}`);
    if (game.turn === turn) throw new Error(`turn ${turn} did not advance`);
  }
}

test("the midterm swaps the seats it lost and ships the new members in the view", async () => {
  stubModels(0);
  const { game, background, post, view: current } = seatedGame(7);
  await playTo(post, game, 10);
  expect(game.stage).toBe("midterm");
  // A tanked ledger settles the draw before the roll: the government's seats fall, the opposition's hold.
  for (const r of pack.regions) game.ledgers.popularity[r.id] = -999;
  const before = current().members.map((m) => m.id);

  const r = await post("midterm", { turn: 11 });
  expect(r.status).toBe(200);
  const g = r.body;
  expect(g.stage === "session" || g.stage === "over").toBe(true);
  expect(g.midterm.up.length).toBe(Math.round(g.pack.chamber.size / 3));
  expect(g.midterm.headline.title.length).toBeGreaterThan(0);
  expect(g.members.length).toBe(g.pack.chamber.size);
  expect(g.midterm.lost.length).toBeGreaterThan(0);
  for (const l of g.midterm.lost) {
    const seat = g.members.find((m: any) => m.seat === l.seat)!;
    expect(before).not.toContain(seat.id);
    expect(seat.id).toBe(`r${hash("g-mid").toString(36)}-1-${l.seat}`);
    expect(seat.faction).toBe(l.to);
    expect(seat.name.length).toBeGreaterThan(0);
    expect(seat.memory).toEqual([]);
    expect(seat.portrait).toBe(`members/r${hash("g-mid").toString(36)}-1-${l.seat}.png`);
    expect("bio" in seat || "tell" in seat).toBe(false);
  }
  expect(background.length).toBe(1);        // the portrait sheet runs after the answer, never before it
  await Promise.all(background);
});

test("a midterm that is not a wipeout hands the chamber back to the session", async () => {
  stubModels(0);
  const { game, background, post } = seatedGame(9);
  game.stage = "midterm";
  game.marks.midterm = ["seat-01", "seat-11", "seat-12", "seat-13", "seat-19", "seat-20"];   // one government seat in six
  for (const r of pack.regions) game.ledgers.popularity[r.id] = -999;

  const { status, body } = await post("midterm", { turn: game.turn });
  expect(status).toBe(200);
  expect(body.stage).toBe("session");
  expect(body.phase).toBe("draft");
  expect(body.midterm.lost.map((l: any) => l.seat)).toEqual(["seat-01"]);
  expect(body.members).toHaveLength(pack.chamber.size);
  expect(body.members.find((m: any) => m.seat === "seat-01").id).toBe(`r${hash("g-mid").toString(36)}-1-seat-01`);
  await Promise.all(background);
});

test("the midterm is refused outside its stage, and a bill cannot jump it", async () => {
  stubModels(0);
  const { game, post } = seatedGame(8);
  expect((await post("midterm", { turn: 1 })).status).toBe(409);
  game.stage = "midterm";
  const blocked = await post("bills", { turn: 1, text: "Raise the harbor levy on the wharf and publish the accounts." });
  expect(blocked.status).toBe(409);
  expect(blocked.body.error).toBe(`The ${pack.vocabulary.midterm} comes first.`);
});

test("amend after adopt is refused: adopt leaves an empty amendments array, not an absent one", async () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 2 });
  const game: Game = newGame("g-amend", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  const ctx = { storage: { sql: { exec: () => ({ toArray: () => [] }) } } } as any;
  const doInstance = new GameDO(ctx, {} as any) as any;
  const count = { whip: {}, blocs: {}, patrons: {}, vetoes: {}, filibuster: 0, constitutional: 0 };
  const bill: any = {
    id: game.turn, text: "raise the harbor levy", title: "Old", summary: "s", tags: [], offers: {}, whip: {},
    amendments: [{ title: "New", summary: "s2", tags: [], count, expected: 1 }],
  };

  doInstance.adopt(bill, 0);
  expect(bill.title).toBe("New");
  expect(bill.amendments).toEqual([]);
  await expect(doInstance.amend(game, pack, bill)).rejects.toMatchObject({ status: 409 });
});

test("one proclamation a turn, and the view carries the reactions", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(65);
  game.ledgers.chest = 10;                       // newGame opens the chest at 0 and a notice costs 2
  postTag = true;
  expect((await post("acts/price", { turn: 1, text: "The accounts of every work go up in public each month." })).status).toBe(200);
  const r = await post("acts", { turn: 1 });
  expect(r.status).toBe(200);
  const p = r.body.posts.at(-1);
  expect(p.likes + p.boos + p.shares + p.ignores).toBe(250);
  expect(p.targets).toEqual([pack.blocs[0].id]);
  expect(game.ledgers.chest).toBe(8);
  expect((await post("acts/price", { turn: 1, text: "A second notice this turn about the wharf." })).status).toBe(200);
  expect((await post("acts", { turn: 1 })).status).toBe(409);
  const calls = game.calls;
  expect((await post("acts/price", { turn: 1, verb: "proclaim", text: "A third notice this turn about the wharf." })).status).toBe(409);
  expect(game.calls).toBe(calls);                 // refused before the clerk is asked
  postTag = false;
  expect(game.posts).toHaveLength(1);
  expect(game.acts).toHaveLength(1);              // the refused second notice paid nothing
  expect(game.ledgers.chest).toBe(8);
});

test("a rival post that never lands is a loss, not a free win, and skips the agree call", async () => {
  let agreeCalled = false;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.questions) {
      if (Object.keys(body.questions).some((k) => k.startsWith("agree_"))) agreeCalled = true;
      const answers = Object.fromEntries(Object.entries(body.questions as Record<string, any>).map(([k, q]) =>
        [k, q.type === "choice"
          ? { probabilities: Object.fromEntries(Object.keys(q.criteria).map((o, i) => [o, i === 0 ? 0.7 : 0.1])) }
          : { noul: 0.9, score: 0.5 }]));
      return Response.json({ answers, usage: { input_tokens: 1 } });
    }
    const name = body.response_format?.json_schema?.name;
    if (!name) return Response.json({});
    if (name === "replies") return Response.json({ choices: [{ message: { content: JSON.stringify({ replies: [], rival: "" }) } }] });
    return Response.json({ choices: [{ message: { content: JSON.stringify(canned(name, body.messages[1].content)) } }] });
  }) as unknown as typeof fetch;

  const { game, post } = seatedGame(21);
  game.ledgers.chest = 10;
  postTag = true;
  await post("acts/price", { turn: 1, text: "The accounts of every work go up in public each month." });
  const r = await post("acts", { turn: 1 });
  postTag = false;
  expect(r.status).toBe(200);
  const p = r.body.posts.at(-1)!;
  expect(p.rival).toBe("");
  expect(p.won).toBe(false);
  expect(agreeCalled).toBe(false);
});

test("seededSample draws a different jury each turn", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 5 });
  const game: Game = newGame("g-sample", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  game.turn = 3;
  const three = seededSample(game, pack.citizens, 50).map((c) => c.id);
  game.turn = 4;
  const four = seededSample(game, pack.citizens, 50).map((c) => c.id);
  expect(three).not.toEqual(four);
  // The street's sample holds each of the five blocs in its share of the roll, whatever the seed drew.
  const blocs: Record<string, number> = {};
  for (const c of streetSample(game, pack.citizens, 50)) blocs[c.bloc] = (blocs[c.bloc] ?? 0) + 1;
  expect(Object.values(blocs)).toEqual([10, 10, 10, 10, 10]);
});

test("a Jev failure mid-vote leaves the stored game exactly as the request found it", async () => {
  stubModels(0.9);
  const { do_, game, post } = seatedGame(31);
  game.bills.push({ id: 1, text: "", title: "Harbor Levy", summary: "It raises the levy.", tags: ["tariffs"], offers: {} });
  game.phase = "whip";
  expect((await post(`bills/1/whip`, { turn: 1 })).status).toBe(200);
  const before = structuredClone(do_.saved);

  // applyVote has already moved the turn, the ledgers and the members when the citizen call goes out.
  const ok = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.questions && Object.keys(body.questions).some((k) => k.startsWith("c-"))) {
      return new Response("upstream is down", { status: 503 });
    }
    return ok(url as never, init);
  }) as unknown as typeof fetch;

  const r = await post("bills/1/vote", { turn: 1 });
  expect(r.status).toBe(503);
  expect(do_.saved).toEqual(before);
  expect(do_.saved.game.turn).toBe(1);
});

test("a crafted body is a 400 with a plain reason, not a 502 carrying a TypeError", async () => {
  stubModels(0.9);
  const { do_, game, post } = seatedGame(51);
  const own = game.members[0];
  game.bills.push({ id: 1, text: "", title: "Harbor Levy", summary: "It raises the levy.", tags: ["tariffs"], offers: {} });
  game.phase = "whip";
  expect((await post("bills/1/whip", { turn: 1 })).status).toBe(200);
  const authority = game.ledgers.authority;
  expect((await post("bills/1/lobby", { turn: 1, memberId: own.id, action: "toString" })).status).toBe(400);
  expect(game.ledgers.authority).toBe(authority);

  // A card left open is answered on the floor, never after the term is scored.
  game.events.push({ id: "gen-01", turn: 1, relief: false, stances: ["Hold", "Fold"] });
  expect((await post("events/0", { turn: game.turn, stance: 1.5 })).status).toBe(400);
  game.stage = "test";
  expect((await post("events/0", { stance: 0 })).status).toBe(409);
  expect(do_.saved.game.events[0].stance).toBeUndefined();
});

test("End turn moves the clock, draws the card and prints the wire", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(21);
  game.bills.push({ id: 1, text: "", title: "Harbor Levy", summary: "It raises the levy.", tags: ["tariffs"], offers: {} });
  game.phase = "whip";
  expect((await post("bills/1/whip", { turn: 1 })).status).toBe(200);
  expect((await post("bills/1/vote", { turn: 1 })).status).toBe(200);
  expect(game.turn).toBe(1);
  const r = await post("turn/end", { turn: 1 });
  expect(r.status).toBe(200);
  expect(r.body.turn).toBe(2);
  expect(Array.isArray(r.body.wire)).toBe(true);
  expect((await post("turn/end", { turn: 1 })).status).toBe(409);   // the stale-turn guard
  game.stage = "test";
  expect((await post("turn/end", { turn: 2 })).status).toBe(409);
  game.stage = "midterm";
  expect((await post("turn/end", { turn: 2 })).body.error).toBe("Not now.");   // the half-term draw cannot be skipped
});

test("a card on the desk holds the boundary", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(22);
  game.events.push({ id: "gen-01", turn: 1, relief: false, stances: ["Hold", "Pay"] });
  const r = await post("turn/end", { turn: 1 });
  expect(r.status).toBe(409);
  expect(r.body.error).toContain("card");
});

test("the test reads each holder in its own Jev call, and an early test names its caller", async () => {
  for (const early of [undefined, "guard"]) {
    stubModels(0.9);
    const sizes: number[] = [];
    const stub = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const q = JSON.parse(String(init.body)).questions;
      if (q) sizes.push(Object.keys(q).length);
      return stub(url, init);
    }) as unknown as typeof fetch;
    const { game, post } = seatedGame(23);
    game.stage = "test";
    game.earlyTest = early;
    const r = await post("test", {});
    expect(r.status).toBe(200);
    expect(sizes.sort((a, b) => a - b)).toEqual([1, 1, pack.chamber.size, 50]);   // guard, league, council, street sample
    if (early) expect([r.body.stage, r.body.test, r.body.result]).toEqual(["session", undefined, undefined]);   // survived: the term goes on
    else expect(r.body.test.holders.length).toBe(4);
  }
});

test("stopping here writes an ending and banks the score, and continue opens the next term", async () => {
  for (const action of ["stop", "continue"]) {
    stubModels(0.9);
    const { game, post } = seatedGame(41);
    game.stage = "won";
    game.result = { ending: "reelected", score: 120 };
    game.terms.push({ term: 1, passed: 1, kept: 0, broken: 0, mandate: 0.6, points: 120 });
    const r = await post(action, {});
    expect(r.status).toBe(200);
    if (action === "stop") {
      expect(r.body.stage).toBe("over");
      expect(r.body.result.ending).toBe("stopped");
      expect(r.body.ending.title).toBe("Out");
    } else {
      expect([r.body.term, r.body.turn, r.body.stage]).toEqual([2, 1, "session"]);
      expect(r.body.result).toBeUndefined();
    }
  }
});

test("pricing an act writes the tag, and a refusal is a 200 that costs one authority", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(60);
  const before = game.ledgers.authority;
  const r = await post("acts/price", { turn: 1, text: "Raise the harbour levy on the wharf and publish the accounts." });
  expect(r.status).toBe(200);
  expect(r.body.tag.verb).toBe("decree");
  expect(r.body.tag.charge.authority).toBe(3);
  expect(r.body.tag.reading.length).toBeGreaterThan(0);
  expect(r.body.refusal).toBeNull();
  expect(game.ledgers.authority).toBe(before);       // pricing costs no ledger
  expect(game.calls).toBe(1);                        // C5: it does cost one of the turn's six calls

  refuse = true;
  const no = await post("acts/price", { turn: 1, text: "Launch a satellite over the harbour this month." });
  expect(no.status).toBe(200);
  expect(no.body.refusal.line).toContain("cannot");
  expect(no.body.refusal.test).toBe("era");
  expect(no.body.tag).toBeNull();
  expect(game.ledgers.authority).toBe(before - 1);
  refuse = false;

  expect((await post("acts/price", { turn: 1, text: "too short" })).status).toBe(400);
  game.stage = "test";
  expect((await post("acts/price", { turn: 1, text: "Raise the harbour levy on the wharf." })).status).toBe(409);
});

test("price then commit moves the ledgers once, and a second commit has nothing to apply", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(61);
  const before = game.ledgers.authority;
  expect((await post("acts/price", { turn: 1, text: "Raise the harbour levy on the wharf." })).status).toBe(200);
  const r = await post("acts", { turn: 1 });
  expect(r.status).toBe(200);
  expect(r.body.tag).toBeNull();
  expect(r.body.acts).toHaveLength(1);
  expect(game.ledgers.authority).toBe(before - 3);
  expect((await post("acts", { turn: 1 })).status).toBe(409);
});

test("committing a law tables it, counts the whip once and prints the band", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(62);
  lawTag = true;
  expect((await post("acts/price", { turn: 1, text: "Raise the harbour levy on the wharf." })).status).toBe(200);
  const r = await post("acts", { turn: 1 });
  lawTag = false;
  expect(r.status).toBe(200);
  expect(r.body.bills).toHaveLength(1);
  expect(r.body.bills[0].needed).toBe(pack.chamber.supermajority);   // the stub answers the filibuster at 0.9
  expect(r.body.bills[0].band[0]).toBeLessThanOrEqual(r.body.bills[0].expected);
  expect(r.body.bills[0].band[1]).toBeGreaterThanOrEqual(r.body.bills[0].expected);
  expect(game.calls).toBe(2);                       // one for the price call, one for the whip count
  expect((await post("bills", { turn: 1, text: "anything at all here" })).status).toBe(404);
  expect((await post("bills/1/vote", { turn: 1 })).status).toBe(200);
  const authority = game.ledgers.authority;
  expect((await post("bills/1/vote", { turn: 1 })).status).toBe(409);   // a decided bill is never voted twice
  expect(game.ledgers.authority).toBe(authority);
});

test("a favour names a seat, and a body that names none is a 400", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(63);
  const m = game.members[0];
  const r = await post("acts/price", { turn: 1, text: "Give them the harbour board seat they asked for.", memberId: m.id });
  expect(r.status).toBe(200);
  expect(r.body.tag.member).toBe(m.id);
  expect((await post("acts/price", { turn: 1, text: "Give them the harbour board seat.", memberId: "nobody" })).status).toBe(400);
});

test("force is refused while the army will not carry it", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(64);
  game.holders.guard.stance = 0.2;
  expect((await post("acts/price", { turn: 1, verb: "force", text: "Turn the watch out on the north quay." })).status).toBe(400);
});

test("another term comes with two cards the last term never saw", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(66);
  game.stage = "won";
  game.result = { ending: "reelected", score: 100 };
  const r = await post("continue", {});
  expect(r.status).toBe(200);
  expect(r.body.term).toBe(2);
  expect(game.extra.filter((s) => s.id.startsWith("new-2-"))).toHaveLength(2);
});

test("the view carries the tag, the acts, the budget and the rival, and hides the Director", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 67 });
  const game: Game = newGame("g-b-view", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  game.calls = 2;
  game.turn = 18;
  const v = view(pack, { game, prose: {} });
  expect(v.tag).toBeNull();
  expect(v.refusal).toBeNull();
  expect(v.acts).toEqual([]);
  expect(v.rival).toBeNull();
  expect(v.calls).toEqual({ spent: 2, cap: 6 });
  expect(v.discount).toBeCloseTo(0.75, 5);
  expect(v.emergency).toBeNull();
  expect(v.media).toBe(0);
  expect(v.trust).toBe(1);
  expect("extra" in v).toBe(false);          // the fresh cards are deck, and the deck stays in the worker
  expect("director" in v).toBe(false);
  expect(JSON.stringify(v)).not.toContain("swan");
});

test("the holders an act moved are read again before the turn ends", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(68);
  expect((await post("acts/price", { turn: 1, text: "Raise the harbour levy on the wharf." })).status).toBe(200);
  await post("acts", { turn: 1 });               // serves guard, hits league, bypasses the council
  expect(game.holders.league.stance).toBe(0.5);
  const r = await post("turn/end", { turn: 1 });
  expect(r.status).toBe(200);
  expect(game.holders.league.stance).toBeCloseTo(0.9, 5);   // the stub answers 0.9 to every stance question
  expect(game.holders.street.stance).toBe(0.5);             // the street never moved, so it was never asked
  expect(game.turn).toBe(2);
});

test("the read never spends more than the turn has left", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(69);
  await post("acts/price", { turn: 1, text: "Raise the harbour levy on the wharf." });
  await post("acts", { turn: 1 });
  game.calls = 6;
  const r = await post("turn/end", { turn: 1 });
  expect(r.status).toBe(200);
  expect(game.holders.league.stance).toBe(0.5);             // nothing left to spend, so nothing was asked
});

test("last turn's wire moves no holder into this turn's read", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(70);
  await post("acts/price", { turn: 1, text: "Raise the harbour levy on the wharf." });
  await post("acts", { turn: 1 });
  await post("turn/end", { turn: 1 });
  game.holders.league.stance = 0.5;
  game.events = [];
  expect((await post("turn/end", { turn: 2 })).status).toBe(200);
  expect(game.holders.league.stance).toBe(0.5);
});

test("the clerks stop at six calls a turn, whichever route asks", async () => {
  stubModels(0.9);
  const { game, post } = seatedGame(70);
  game.bills.push({
    id: 1, text: "", title: "Harbor Levy", summary: "It raises the levy.", tags: ["tariffs"], offers: {},
    whip: Object.fromEntries(game.members.map((m) => [m.id, 0.5])),
  } as never);
  game.phase = "whip";
  game.calls = 6;                                    // JEV_CALLS, the whole turn spent
  for (const path of ["bills/1/lobby", "bills/1/amend", "bills/1/vote"]) {
    const r = await post(path, { turn: 1, memberId: game.members[0].id, action: "pork" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("The clerks have done all they can");
  }
  expect((await post("acts/price", { turn: 1, text: "Raise the harbour levy on the wharf." })).status).toBe(409);
  const count = { whip: {}, blocs: {}, patrons: {}, vetoes: {}, filibuster: 0, constitutional: 0 };
  (game.bills[0] as any).amendments = [{ title: "New", summary: "s2", tags: [], count, expected: 1 }];
  expect((await post("bills/1/amend/0", { turn: 1 })).status).toBe(200);   // adopting a draft calls no model
  expect(game.calls).toBe(6);

  game.calls = 0;
  expect((await post("bills/1/lobby", { turn: 1, memberId: "nobody", action: "pork" })).status).toBe(400);
  expect(game.calls).toBe(0);   // a refused route gives its charge back
  expect((await post("bills/1/vote", { turn: 1 })).status).toBe(200);
  expect(game.calls).toBe(1);
});

test("the platform sentence is authored onto the new game", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({
    promises: [{ tag: "temple-funding", label: "Restore the temple stipend", window: 6 }],
  }) } }] })) as unknown as typeof fetch;
  try {
    const ctx = { storage: { sql: { exec: () => ({ toArray: () => [] }) } } } as any;
    const do_ = new GameDO(ctx, {} as any) as any;
    do_.ctx = ctx; do_.env = { OPENROUTER_API_KEY: "test" };
    do_.pack = pack;    // loadPack answers from the cache, so the test needs no D1
    const s = await do_.create({ id: "g-platform", scenario: pack.id, faction: 0, promises: [0, 1, 2], platform: "I will restore the temple stipend." });
    expect(Object.keys(s.game.promises)).toHaveLength(4);
    // window is absolute: six turns from turn 1
    expect(s.game.promises["temple-funding"]).toMatchObject({ label: "Restore the temple stipend", window: 7, authored: true });
  } finally { globalThis.fetch = real; }
});

test("a seat with no platform sentence reaches no model at all", async () => {
  const real = globalThis.fetch;
  let called = false;   // platformPromises swallows a throw, so the throw alone proves nothing
  globalThis.fetch = (async () => { called = true; throw new Error("the seat called a model"); }) as unknown as typeof fetch;
  try {
    const ctx = { storage: { sql: { exec: () => ({ toArray: () => [] }) } } } as any;
    const do_ = new GameDO(ctx, {} as any) as any;
    do_.ctx = ctx; do_.env = { OPENROUTER_API_KEY: "test" };
    do_.pack = pack;
    const s = await do_.create({ id: "g-bare", scenario: pack.id, faction: 0, promises: [0, 1, 2] });
    expect(Object.keys(s.game.promises)).toHaveLength(3);
    expect(called).toBe(false);
  } finally { globalThis.fetch = real; }
});

test("a game saved before the daily existed loads as free play with an empty log", async () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 9 });
  const game: Game = newGame("g-old", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  delete (game as Partial<Game>).mode;
  delete (game as Partial<Game>).day;
  delete (game as Partial<Game>).log;
  const rows = [{ v: JSON.stringify({ game, prose: {} }) }];
  const ctx = { storage: { sql: { exec: () => ({ toArray: () => rows }) } } };
  const do_ = new (GameDO as any)(ctx, {});
  do_.ctx = ctx;
  const loaded = await do_.load();
  expect(loaded.game.mode).toBe("free");
  expect(loaded.game.day).toBeNull();
  expect(loaded.game.log).toEqual([]);
});

test("newGame marks a daily run with its day and starts the log empty", () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 9 });
  const free = newGame("g-f", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  expect(free.mode).toBe("free");
  expect(free.day).toBeNull();
  const daily = newGame("g-d", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar, { day: "2026-09-22" });
  expect(daily.mode).toBe("daily");
  expect(daily.day).toBe("2026-09-22");
  expect(daily.log).toEqual([]);
});

test("a daily run writes its grid to the play row exactly once, and a free run writes nothing", async () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 11 });
  const writes: unknown[][] = [];
  const env = { DB: { prepare: (sql: string) => ({ bind: (...a: unknown[]) => ({ run: async () => { writes.push([sql, ...a]); return { meta: { changes: 1 } }; } }) }) } } as never;

  const run = async (mode: "daily" | "free") => {
    const game: Game = newGame("g-" + mode, code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar,
      mode === "daily" ? { day: "2026-09-22" } : undefined);
    game.log = [{ turn: 1, ledger: "authority", delta: 6, cause: "a decree" }, { turn: 2, ledger: "treasury", delta: 9, cause: "the works" }];
    game.result = { ending: "reelected", score: 10 };
    game.test = { won: true } as never;
    const do_ = new (GameDO as any)({ storage: {} }, env);
    do_.env = env;
    // The prose is already written, so `epilogue` closes the play row and returns before it calls Luna.
    await do_.epilogue({ game, prose: { ending: { title: "t", body: "b" } } }, pack);
  };

  await run("free");
  expect(writes).toHaveLength(0);
  await run("daily");
  expect(writes).toHaveLength(1);
  expect(String(writes[0][0])).toContain("UPDATE daily_plays");
  expect(JSON.parse(String(writes[0][1])).map((r: { ledger: string }) => r.ledger)).toEqual(["authority", "treasury"]);
  expect(writes[0][2]).toBe(1);
});
