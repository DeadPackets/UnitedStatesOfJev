import { test, expect, mock, afterEach } from "bun:test";
// game.ts pulls in `cloudflare:workers` for the Durable Object class, and build.ts for the portrait sheet;
// only workerd resolves either module.
mock.module("cloudflare:workers", () => ({ DurableObject: class {}, WorkflowEntrypoint: class {} }));
mock.module("cloudflare:workflows", () => ({ NonRetryableError: class extends Error {} }));
const { view, pickStart, GameDO, seededSample } = await import("./game");
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
  game.escalations.push("supermajority_era");
  expect(view(pack, { game, prose: {} }).bills[0].needed).toBe(pack.chamber.supermajority);
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

test("a game stored before the feed existed still loads and ships an empty feed", async () => {
  const code = encodeCode({ scenario: scenarioTag(pack.id), faction: 0, promises: [0, 1, 2], seed: 7 });
  const { posts: _none, ...old } = newGame("g-old", code, pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], pack.calendar);
  const row = { v: JSON.stringify({ game: old, prose: {} }) };
  const ctx = { storage: { sql: { exec: () => ({ toArray: () => [row] }) } } } as any;
  const doInstance = new GameDO(ctx, {} as any) as any;
  doInstance.ctx = ctx;
  doInstance.pack = pack;
  const r = await doInstance.fetch(new Request("https://do/state"));
  expect(r.status).toBe(200);
  expect((await r.json() as any).posts).toEqual([]);
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

// Every model call goes out through one fetch: `systemone` is Jev, `chat/completions` is Luna, keyed by schema name.
const canned = (name: string, user: string): unknown => {
  switch (name) {
    case "bill": return { title: "Harbor Levy", summary: "It raises the levy on the wharf.", tags: ["tariffs"] };
    case "headline": case "halfterm": return { title: "The seats change hands", lede: "The council woke up smaller. Nobody in the chair slept." };
    case "quotes": return { quotes: [] };
    case "replies": return { replies: [{ name: "Citizen 1", text: "The wharf still floods." }], rival: "They promised the accounts and published nothing." };
    case "messages": return { messages: ["We kept the levy honest.", "We won the fight over the wharf.", "They would sell the harbor."] };
    case "outcome": return { line: "It held." };
    case "card": return { title: "A storm", body: "The wharf floods.", stances: ["Hold the line"] };
    case "ending": return { title: "Out", body: "The term ends." };
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
    for (const path of ["bills", `bills/${turn}/whip`, `bills/${turn}/vote`]) {
      const r = await post(path, { turn, text: "Raise the harbor levy on the wharf and publish the accounts each month." });
      if (r.status !== 200) throw new Error(`${path} on turn ${turn}: ${r.status}`);
    }
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

test("one post a turn, 240 characters, and the view carries the reactions", async () => {
  stubModels(0.5);
  const { post } = seatedGame(12);
  const ok = await post("post", { turn: 1, text: "Tolls come down at the harbour." });
  expect(ok.status).toBe(200);
  const p = ok.body.posts.at(-1)!;
  expect(p.likes + p.boos + p.shares + p.ignores).toBe(250);
  expect(p.replies.length).toBeGreaterThan(0);
  expect(typeof p.rival).toBe("string");
  expect(typeof p.won).toBe("boolean");
  expect((await post("post", { turn: 1, text: "Twice." })).status).toBe(409);
  expect((await post("post", { turn: 1, text: "x".repeat(241) })).status).toBe(400);
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

  const { post } = seatedGame(21);
  const ok = await post("post", { turn: 1, text: "Tolls come down at the harbour." });
  expect(ok.status).toBe(200);
  const p = ok.body.posts.at(-1)!;
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
});

test("a campaign turn needs a draft, a lever it can pay for, and four of them reach the test", async () => {
  stubModels(1);
  const { game, post } = seatedGame(13);
  await playTo(post, game, 10);
  // Saturated approval settles every midterm roll, so the class holds and the term reaches the campaign.
  for (const r of pack.regions) game.ledgers.popularity[r.id] = 999;
  game.ledgers.authority = 200; game.ledgers.loyalty = 100;   // and no impeachment before the campaign starts
  await playTo(post, game, 20);
  expect(game.stage).toBe("campaign");
  stubModels(0.6);

  const d = (await post("campaign/drafts", {})).body;
  expect(d.stage).toBe("campaign");
  expect(d.campaign.drafts.length).toBe(3);
  expect(d.campaign.gains.spend[pack.regions[0].id].length).toBe(3);
  const three = [0, 1, 2].map((i) => ({ id: pack.regions[i % pack.regions.length].id, amount: 10 }));
  expect((await post("campaign", { n: 0, message: d.campaign.drafts[0], lever: { kind: "spend", regions: three } })).status).toBe(400);
  expect((await post("campaign", { n: 0, message: "", lever: { kind: "spend", regions: [] } })).status).toBe(400);
  // The campaign does not move game.turn, so the turn index is what a repeated POST is caught by.
  expect((await post("campaign", { n: 1, message: d.campaign.drafts[0], lever: { kind: "spend", regions: [] } })).status).toBe(409);

  // The favor is the one lever that spends capital, so it is priced before it is charged.
  const own = game.members.find((m) => m.faction === game.faction)!;
  const authority = game.ledgers.authority;
  let g = (await post("campaign", { n: 0, message: d.campaign.drafts[0], lever: { kind: "favor", memberId: own.id } })).body;
  expect(g.campaign.turns[0].lever.kind).toBe("favor");
  expect(g.ledgers.capital).toBeLessThan(authority);
  g = (await post("campaign/drafts", {})).body;
  game.ledgers.authority = 0;
  expect((await post("campaign", { n: 1, message: g.campaign.drafts[0], lever: { kind: "favor", memberId: own.id } })).status).toBe(402);
  // A replayed turn is refused, and the one it replays is still there to play.
  expect((await post("campaign", { n: 0, message: g.campaign.drafts[0], lever: { kind: "spend", regions: [] } })).status).toBe(409);

  for (let i = 1; i < 4; i++) {
    if (!g.campaign.drafts.length) g = (await post("campaign/drafts", {})).body;
    g = (await post("campaign", { n: g.campaign.turns.length, message: g.campaign.drafts[0], lever: { kind: "spend", regions: [] } })).body;
  }
  expect(g.campaign.turns.length).toBe(4);
  expect(g.stage).toBe("test");
  expect(g.campaign.turns[0].band[0]).toBeLessThan(g.campaign.turns[0].public);
  expect((await post("campaign/drafts", {})).status).toBe(409);
});

test("a Jev failure mid-vote leaves the stored game exactly as the request found it", async () => {
  stubModels(0.9);
  const { do_, post } = seatedGame(31);
  expect((await post("bills", { turn: 1, text: "Raise the harbor levy on the wharf and publish the accounts each month." })).status).toBe(200);
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

test("blank campaign drafts are a 503 the player can retry, not three lines nobody can pick", async () => {
  stubModels(0.6);
  const { do_, post } = seatedGame(41);
  do_.saved.game.stage = "campaign";
  do_.saved.game.campaign = { drafts: [], messages: [], turns: [], rival: [], intent: {} };

  const ok = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.response_format?.json_schema?.name === "messages") {
      return Response.json({ choices: [{ message: { content: JSON.stringify({ messages: ["", "   ", ""] }) } }] });
    }
    return ok(url as never, init);
  }) as unknown as typeof fetch;

  const r = await post("campaign/drafts", {});
  expect(r.status).toBe(503);
  expect(do_.saved.game.campaign.drafts).toEqual([]);

  globalThis.fetch = ok;
  expect((await post("campaign/drafts", {})).body.campaign.drafts).toHaveLength(3);
});

test("a crafted body is a 400 with a plain reason, not a 502 carrying a TypeError", async () => {
  stubModels(0.9);
  const { do_, game, post } = seatedGame(51);
  game.stage = "campaign";
  game.campaign = { drafts: ["Keep the course."], messages: [], turns: [], rival: [], intent: {} };
  const body = (lever: unknown) => ({ n: 0, message: "Keep the course.", lever });
  const r = pack.regions[0].id;

  expect((await post("campaign", body({ kind: "spend", regions: 5 }))).status).toBe(400);
  expect((await post("campaign", body({ kind: "spend", regions: [{ id: r, amount: 5 }, { id: r, amount: 5 }] }))).body.error)
    .toBe("One row per region.");
  expect(game.campaign.turns).toHaveLength(0);

  game.stage = "session";
  const own = game.members[0];
  expect((await post("bills", { turn: 1, text: "Raise the harbor levy on the wharf and publish the accounts each month." })).status).toBe(200);
  expect((await post("bills/1/whip", { turn: 1 })).status).toBe(200);
  const authority = game.ledgers.authority;
  expect((await post("bills/1/lobby", { turn: 1, memberId: own.id, action: "toString" })).status).toBe(400);
  expect(game.ledgers.authority).toBe(authority);

  // A card left open is answered on the floor, never after the term is scored.
  game.events.push({ id: "gen-01", turn: 1, relief: false, stances: ["Hold", "Fold"] });
  expect((await post("events/0", { turn: game.turn, stance: 1.5 })).status).toBe(400);
  game.stage = "campaign";
  expect((await post("events/0", { stance: 0 })).status).toBe(409);
  expect(do_.saved.game.events[0].stance).toBeUndefined();
});
