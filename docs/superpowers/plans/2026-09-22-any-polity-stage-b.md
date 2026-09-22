# Any Polity, Stage B: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The term gets its spectacle: a Feed the citizens answer, a midterm night that swaps real seats for new members, four campaign turns with two levers and an honest forecast, and a weighted-tile reveal that plays the test like an election night.

**Architecture:** Stage A's engine already owns every number and stores the four Stage B escalation values on `game.stageB`. Stage B adds four pure engine blocks (Feed effects, midterm draw, campaign levers, turnout) and their four escalation hooks, then wires them through the GameDO as five new actions, then four screens. Every model call still goes through `luna()` or `jev()`: Jev judges the reactions, the votes and the post duel; Luna writes replies, drafts, the half-term headline and the new members' prose; no Luna call decides an outcome.

**Tech Stack:** Cloudflare Workers, Durable Objects, D1, R2, Workflows; Hono; TypeScript; Zod 4; Vite + React 19; Bun for scripts and tests; muse-image via OpenRouter `/api/v1/images`; `@cf-wasm/photon` for the portrait sheet.

**Spec:** `docs/superpowers/specs/2026-09-22-any-polity-design.md` (v3) §7 and §11, with `docs/superpowers/specs/2026-09-22-the-term-design.md` (v2) §7 midterm, §8 campaign, §9 election night, §12 the Feed, §13 the Jev and Luna catalog, §14 the API, §15 the front end, §16 the experiments. Stage A plan: `docs/superpowers/plans/2026-09-22-any-polity-stage-a.md`. Interfaces as built: `.superpowers/sdd/2026-09-22-any-polity-stage-a/task-{6,8,9,10,11,12}-report.md`.

**Precondition:** Stage A task 13 (`src/Test.tsx`, `src/Won.tsx`, `App.tsx` routing on `game.stage`) must be committed on `any-polity` before Task 7 of this plan runs. Tasks 1 to 6 do not touch those files.

## Global constraints

- Code proposes, Jev judges, Luna narrates, the generator fills a fixed schema. No Luna call decides a number.
- Luna: `openai/gpt-5.6-luna`, `reasoning: { effort: "none" }`, `provider: { sort: "latency" }`, strict `json_schema` from `z.toJSONSchema`, STYLE block appended by `luna()`. Jev: `typesafe/jev-1.13`, state ≤ 32k tokens, request ≤ 64k.
- Seeds fix the start; votes, Director rolls, midterm draws, campaign draws and the test use `crypto.getRandomValues`.
- Fixed pace: 20 turns, midterm after turn 10, 4 campaign turns, the test.
- No persistent progression. Share code `J3-<scenario6>-<f>-<ppp>-<seed6>`.
- Content rule in every generation prompt (v3 spec §4). Grok retry only for benign refusals.
- Out of scope, unchanged: daily mode, leaderboards, private scenarios, a second chamber, sandbox, multiplayer, voice, generated likenesses of living people, any state that outlives a run.
- Surgical diffs, no comments unless a constraint cannot be read from the code, tests only where logic branches: the Feed formula, the midterm probability and draw, the campaign levers, the turnout multiplier, the treemap.
- **Vocabulary rule (from task-12):** a pack word is printed bare, never inside an English sentence frame. `pack.vocabulary.bill`, `seat`, `member`, `turn`, `test`, `promise`, `patron` are plain nouns and may sit in a sentence. `whip`, `lobby`, `feed`, `post`, `midterm`, `campaign`, `pass`, `fail` are whole phrases in some packs: print them alone as a button label, a tab label or a kicker, never as "Run the {whip}" or "Write a {post} about it". Counts read `10 of 24`, never `{n} {vocabulary.seat}`.
- **Copy rule:** no em dashes anywhere in UI copy, prompts or comments. Straight quotes only. Luna's STYLE block already forbids them; the same holds for hand-written strings.
- Every task ends with `bunx tsc -b` and `bun test worker src` green, plus a commit.
- **Verification route: production is not deployed during Stage B.** Tasks that touch the Worker verify against a local `wrangler dev` on port 8799 with an **uncommitted** `wrangler.dev.jsonc` (see Task 3 step 1), and front-end tasks verify in Chrome against that dev Worker. `scripts/term.ts` is extended, never replaced. No `wrangler deploy`, no `wrangler versions upload`.

## File map

| File | Stage B responsibility |
|---|---|
| `worker/engine.ts` | Feed effects, midterm draw and swap, campaign levers and forecast, turnout; the four Stage B escalation hooks |
| `worker/engine.test.ts` | the eleven new tests |
| `worker/jev.ts` | `reactQuestions`, `agreeQuestions`, `voteQuestions`, `choices()` |
| `worker/luna.ts` | `replies`, `messages`, `halfTerm`, `newMembers` |
| `worker/build.ts` | `portraitSheet()` extracted from `portraitsStep` so the DO can reuse it |
| `worker/game.ts` | `post`, `midterm`, `campaign/drafts`, `campaign` actions; the replacement personas and the background portrait sheet; `view()` ships `posts`, `midterm`, `campaign` |
| `worker/index.ts` | the four new routes |
| `src/api.ts` | `post`, `midterm`, `drafts`, `campaign` |
| `src/Feed.tsx` | the Feed tab: post box, reactions, replies, the rival's post, the verdict |
| `src/Midterm.tsx` | midterm night: the class, the swaps one by one, the bar, the half-term headline |
| `src/Campaign.tsx` | four campaign turns: three drafts, the two levers, the alpha-weighted gains, the forecast band |
| `src/Tiles.tsx`, `src/tiles.test.ts` | squarified treemap of region tiles, used by the reveal and the campaign |
| `src/Test.tsx` | the region half of the reveal becomes the tiles |
| `src/Chamber.tsx` | the rail gains the two tabs |
| `src/styles.css` | tiles, tabs, feed, campaign, midterm |
| `scripts/term.ts` | posts, the midterm, four campaign turns |

Nothing is deleted. `worker/states.ts`, `worker/roster.json`, `worker/agendas.json` and the three unused map dependencies stay as Stage A left them.

---

### Task 1: Engine, the Stage B math

**Files:**
- Modify: `worker/engine.ts`
- Test: `worker/engine.test.ts`

**Interfaces:**
- Consumes (Stage A, unchanged): `Game`, `Member`, `clamp`, `rng`, `roll` (module-private), `seeded`, `leanOf`, `bump` (module-private), `LOBBY_COSTS`, `TEMPERAMENTS`, `TURNS_PER_TERM`, `loyaltyOf` (module-private), `termPoints`, `score`, `on`/`first` (module-private), `runTest`, `applyVote`.
- Produces:

```ts
export const CAMPAIGN_TURNS = 4;
export const SPEND_STEPS = [0, 5, 10] as const;
export const RIVAL_SPEND = 5;                      // per targeted region per campaign turn
export const SPEND_LIFT: Record<number, number> = { 0: 0, 5: 0.02, 10: 0.04 };
export const FAVOR_LIFT = 0.3;                     // modelled confidence lift on one seat
export type Reaction = "like" | "boo" | "share" | "ignore";

export interface Post {
  turn: number; text: string;
  likes: number; boos: number; shares: number; ignores: number;
  regions: Record<string, number>;                 // approval delta applied, per region
  hot: string[];                                   // regions where shares led
  replies: { name: string; text: string }[];
  rival: string;
  agree: { mine: number; rival: number };
  won: boolean;
}
export interface MidtermDraw {
  up: { seat: string; memberId: string; faction: string; p: number }[];
  forced: string[];                                // seat ids split_chamber took before any draw
  lost: { seat: string; memberId: string; from: string; to: string }[];
  wipeout: boolean;
}
export interface Replacement {
  id: string; seat: string; region: string; faction: string;
  temperament: (typeof TEMPERAMENTS)[number]; years: "new" | "mid" | "long";
  flags: Member["flags"]; patrons: string[];
}
export interface Persona { id: string; name: string; bio: string; tell: string; core_issues: string[] }
export interface Midterm { up: string[]; lost: MidtermDraw["lost"]; wipeout: boolean; headline?: { title: string; lede: string } }
export type Lever = { kind: "spend"; regions: { id: string; amount: number }[] } | { kind: "favor"; memberId: string };
export interface CampaignTurn {
  n: number; message: string; lever: Lever; cost: { chest: number; capital: number };
  intent: Record<string, number>; public: number; band: [number, number]; rival: string[];
}
export interface Campaign { drafts: string[]; messages: string[]; turns: CampaignTurn[]; rival: string[]; intent: Record<string, number> }

// Game gains: posts: Post[]; midterm?: Midterm; campaign?: Campaign;

export const lobbyCost: (game: Game, action: LobbyAction) => number;
export const feedMemory: (region: string, text: string) => string;
export function applyPost(pack: Pack, game: Game, turn: number, text: string,
  reactions: Record<string, Reaction>,                       // citizen id -> reaction
  said: { replies: { name: string; text: string }[]; rival: string },
  agree: Record<string, "government" | "rival">): Post;
export function midtermUp(game: Game): Member[];
export function regionIntent(pack: Pack, intent: Record<string, number>): Record<string, number>;
export function holdP(pack: Pack, game: Game, m: Member, byRegion: Record<string, number>): number;
export function runMidterm(pack: Pack, game: Game, intent: Record<string, number>): MidtermDraw;
export function replacements(pack: Pack, game: Game, draw: MidtermDraw): Replacement[];
export function applyMidterm(pack: Pack, game: Game, draw: MidtermDraw, personas: Persona[]): void;
export function startCampaign(pack: Pack, game: Game): void;
export function rivalTargets(pack: Pack, game: Game, byRegion: Record<string, number>): string[];
export function leverCost(game: Game, lever: Lever): { chest: number; capital: number };
export function leverGain(pack: Pack, lever: Lever): number;
export function forecast(pack: Pack, byRegion: Record<string, number>): { public: number; band: [number, number] };
export function applyCampaign(pack: Pack, game: Game, message: string, lever: Lever, intent: Record<string, number>): CampaignTurn;
export function baseBlocs(game: Game, n?: number): string[];
```

- [ ] **Step 1: Write the failing tests**

Append to `worker/engine.test.ts`. The file's existing `pack`, `game()` and `bill()` helpers are reused.

```ts
import { applyCampaign, applyMidterm, applyPost, baseBlocs, CAMPAIGN_TURNS, forecast, holdP,
  leverCost, leverGain, midtermUp, regionIntent, replacements, rivalTargets, runMidterm, startCampaign,
  type Persona, type Reaction } from "./engine";

const allIntent = (p: number) => Object.fromEntries(pack.citizens.map((c) => [c.id, p]));
const react = (r: Reaction) => Object.fromEntries(pack.citizens.map((c) => [c.id, r]));
const said = { replies: [{ name: "A", text: "x" }], rival: "y" };
const agreeAll = (who: "government" | "rival") => Object.fromEntries(pack.citizens.slice(0, 50).map((c) => [c.id, who]));

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
  expect(seat.memory.some((l) => l.includes("the harbor tolls"))).toBe(true);
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
  const draw = runMidterm(pack, g, allIntent(1));                    // nothing can fall on its own
  const ownUp = midtermUp(g).filter((m) => m.faction === "harborites").length;
  expect(draw.forced.length).toBe(Math.min(8, ownUp));
  expect(draw.lost.length).toBe(draw.forced.length);
  expect(draw.lost.every((l) => l.from === "harborites" && l.to !== "harborites")).toBe(true);
});

test("the midterm swaps only the seats it lost, and the new members start empty", () => {
  const g = game();
  const draw = runMidterm(pack, g, allIntent(0));                    // every seat falls
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

test("losing a third of the class ends the run as a lame duck with a scored term", () => {
  const g = game();
  g.turn = 11;
  const draw = runMidterm(pack, g, allIntent(0));
  expect(draw.wipeout).toBe(true);
  applyMidterm(pack, g, draw, replacements(pack, g, draw).map((s) => ({ id: s.id, name: "n", bio: "b", tell: "t", core_issues: [pack.tags[0]] })));
  expect(g.stage).toBe("over");
  expect(g.result!.ending).toBe("lame_duck");
  expect(g.terms.length).toBe(1);
});

test("the campaign follows turn 20, not the test", () => {
  const g = game();
  g.turn = 20;
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

test("a campaign turn charges its lever and the rival doubles under a surge", () => {
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
  expect(applyCampaign(pack, g, "m3", { kind: "spend", regions: [] }, allIntent(0.5)).rival.length).toBe(2);
  applyCampaign(pack, g, "m4", { kind: "spend", regions: [] }, allIntent(0.5));
  expect(g.campaign!.turns.length).toBe(CAMPAIGN_TURNS);
  expect(g.stage).toBe("test");
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
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test worker/engine.test.ts`
Expected: FAIL, "Export named 'applyPost' not found in module".

- [ ] **Step 3: The Feed block**

In `worker/engine.ts`, after `applyCitizens`:

```ts
export const feedMemory = (region: string, text: string) => `Constituents in ${region} are loud about "${text}".`;

// v2 §12 counts one region's own citizens, so the denominator is that region's sample, not the 250.
export function applyPost(pack: Pack, game: Game, turn: number, text: string,
  reactions: Record<string, Reaction>, said: { replies: { name: string; text: string }[]; rival: string },
  agree: Record<string, "government" | "rival">): Post {
  const loud = game.stageB.loud_opposition ?? 1;
  const tally = { like: 0, boo: 0, share: 0, ignore: 0 };
  const per = new Map(pack.regions.map((r) => [r.id, { like: 0, boo: 0, share: 0, ignore: 0, n: 0 }]));
  for (const c of pack.citizens) {
    const r = reactions[c.id];
    if (!r) continue;
    tally[r] += 1;
    const g = per.get(c.region);
    if (g) { g[r] += 1; g.n += 1; }
  }
  const regions: Record<string, number> = {}, hot: string[] = [];
  for (const r of pack.regions) {
    const g = per.get(r.id)!;
    if (!g.n) continue;
    const d = round1(clamp(((g.like + 2 * g.share - 2 * g.boo * loud) / g.n) * 4, -6, 6));
    if (d !== 0) { regions[r.id] = d; bump(game, r.id, d); }
    if (g.share > g.like && g.share > g.boo) {
      hot.push(r.id);
      const line = feedMemory(r.name, text.slice(0, 60));
      for (const m of game.members) if (m.region === r.id) m.memory = [...m.memory, line].slice(-5);
    }
  }
  const votes = Object.values(agree);
  const mine = votes.filter((v) => v === "government").length;
  const post: Post = {
    turn, text, likes: tally.like, boos: tally.boo, shares: tally.share, ignores: tally.ignore,
    regions, hot, replies: said.replies.slice(0, 3), rival: said.rival,
    agree: { mine, rival: votes.length - mine }, won: mine >= votes.length - mine,
  };
  game.posts.push(post);
  return post;
}
```

Add `posts: Post[]` to `Game`, and `posts: []` to the `newGame` literal next to `bills: []`. Add `game.posts = []` to `continueTerm` next to `game.bills = []`.

- [ ] **Step 4: The midterm block**

First, split the existing private `loyaltyOf` so a replacement can be scored from its faction id alone, with no
persona to hand. One line changes, one is added:

```ts
const loyaltyFor = (start: Pack["starts"][number], faction: string, own: string) =>
  faction === own ? 100 : (start.hostile ?? []).includes(faction) ? 25 : start.coalition.includes(faction) ? 70 : 0;
const loyaltyOf = (start: Pack["starts"][number], m: PackMember, own: string) => loyaltyFor(start, m.faction, own);
```

Then the block itself:

```ts
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const ownSide = (pack: Pack, game: Game, faction: string) => {
  const start = pack.starts.find((s) => s.faction === game.faction);
  return faction === game.faction || (start?.coalition ?? []).includes(faction);
};

export const midtermUp = (game: Game): Member[] =>
  game.members.filter((m) => (game.marks.midterm ?? []).includes(m.seat));

export function regionIntent(pack: Pack, intent: Record<string, number>): Record<string, number> {
  const per = new Map(pack.regions.map((r) => [r.id, { w: 0, s: 0 }]));
  for (const c of pack.citizens) {
    const g = per.get(c.region);
    if (g && intent[c.id] !== undefined) { g.w += c.weight; g.s += c.weight * intent[c.id]; }
  }
  return Object.fromEntries(pack.regions.map((r) => { const g = per.get(r.id)!; return [r.id, g.w ? g.s / g.w : 0.5]; }));
}

// v2 §7: half the seat's fate is the region's approval, half is its citizens' intent. The odds flip for a
// seat the government does not hold.
export function holdP(pack: Pack, game: Game, m: Member, byRegion: Record<string, number>): number {
  const base = 0.5 * sigmoid(((game.ledgers.approval[m.region] ?? 50) - 50) / 8) + 0.5 * (byRegion[m.region] ?? 0.5);
  return clamp(ownSide(pack, game, m.faction) ? base : 1 - base, 0, 1);
}

// The seat goes to the faction the region leans to most, the loser excluded: code picks it, not a model.
const winnerOf = (pack: Pack, region: string, loser: string) =>
  [...pack.factions].filter((f) => f.id !== loser).sort((a, b) => leanOf(pack, region, b.id) - leanOf(pack, region, a.id))[0]?.id ?? loser;

export function runMidterm(pack: Pack, game: Game, intent: Record<string, number>): MidtermDraw {
  const byRegion = regionIntent(pack, intent);
  const cls = midtermUp(game);
  const up = cls.map((m) => ({ seat: m.seat, memberId: m.id, faction: m.faction, p: round1(holdP(pack, game, m, byRegion) * 100) / 100 }));
  const n = game.stageB.split_chamber ?? 0;
  const forced = new Set(seeded(game, 0x5b1e, cls.filter((m) => ownSide(pack, game, m.faction)), n).map((m) => m.seat));
  const lost: MidtermDraw["lost"] = [];
  for (const m of cls) {
    const held = !forced.has(m.seat) && roll() < holdP(pack, game, m, byRegion);
    if (!held) lost.push({ seat: m.seat, memberId: m.id, from: m.faction, to: winnerOf(pack, m.region, m.faction) });
  }
  return { up, forced: [...forced], lost, wipeout: lost.length * 3 >= cls.length && cls.length > 0 };
}

// Identity is code's: the seat, the region, the winning faction, a cycled temperament, the seat's own flags.
export function replacements(pack: Pack, game: Game, draw: MidtermDraw): Replacement[] {
  return draw.lost.map((l, i) => {
    const old = game.members.find((m) => m.seat === l.seat)!;
    return {
      id: `r${game.term}-${l.seat}`, seat: l.seat, region: old.region, faction: l.to,
      temperament: TEMPERAMENTS[(hash(l.seat) + i) % TEMPERAMENTS.length],
      years: "new", flags: old.flags, patrons: [],
    };
  });
}

export function applyMidterm(pack: Pack, game: Game, draw: MidtermDraw, personas: Persona[]): void {
  const start = pack.starts.find((s) => s.faction === game.faction) ?? pack.starts[0];
  const by = new Map(personas.map((p) => [p.id, p]));
  for (const slot of replacements(pack, game, draw)) {
    const p = by.get(slot.id);
    const i = game.members.findIndex((m) => m.seat === slot.seat);
    if (i < 0) continue;
    const core = (p?.core_issues ?? []).filter((t) => pack.tags.includes(t));
    game.members[i] = {
      id: slot.id, seat: slot.seat, region: slot.region, faction: slot.faction,
      name: p?.name ?? slot.id, bio: p?.bio ?? "", tell: p?.tell ?? "",
      core_issues: core.length ? core : [pack.tags[0]], temperament: slot.temperament,
      patrons: slot.patrons, years: slot.years, flags: slot.flags, portrait: `members/${slot.id}.png`,
      memory: [], loyalty: loyaltyFor(start, slot.faction, game.faction), mood: 0,
    };
  }
  game.midterm = { up: draw.up.map((u) => u.seat), lost: draw.lost, wipeout: draw.wipeout };
  if (draw.wipeout) {
    game.stage = "over"; game.phase = "over";
    game.terms.push(termPoints(game, 0));
    game.result = { ending: "lame_duck", score: score(game) };
  } else {
    game.stage = "session";
  }
}
```

- [ ] **Step 5: The campaign block**

```ts
export const lobbyCost = (game: Game, action: LobbyAction) => Math.round(LOBBY_COSTS[action] * (first(game, "lobbyCost") ?? 1));

export function startCampaign(pack: Pack, game: Game): void {
  const intent = Object.fromEntries(pack.regions.map((r) => [r.id, clamp((game.ledgers.approval[r.id] ?? 50) / 100, 0, 1)]));
  game.campaign = { drafts: [], messages: [], turns: [], rival: rivalTargets(pack, game, intent), intent };
}

// The rival goes where the government is weakest but not yet lost: two regions, its own money, every turn.
export function rivalTargets(pack: Pack, game: Game, byRegion: Record<string, number>): string[] {
  const live = pack.regions.filter((r) => (byRegion[r.id] ?? 0.5) >= 0.35);
  const pool = live.length >= 2 ? live : pack.regions;
  return [...pool].sort((a, b) => (byRegion[a.id] ?? 0.5) - (byRegion[b.id] ?? 0.5)).slice(0, 2).map((r) => r.id);
}

export function leverCost(game: Game, lever: Lever): { chest: number; capital: number } {
  return lever.kind === "spend"
    ? { chest: lever.regions.reduce((a, r) => a + r.amount, 0), capital: 0 }
    : { chest: 0, capital: lobbyCost(game, "favor") };
}

// What the UI shows: alpha x the public move, or (1 - alpha) x the chamber move. Code's estimate, not Jev's.
export function leverGain(pack: Pack, lever: Lever): number {
  const a = pack.chamber.alpha;
  if (lever.kind === "spend") {
    return a * lever.regions.reduce((s, r) => s + (pack.regions.find((x) => x.id === r.id)?.weight ?? 0) * (SPEND_LIFT[r.amount] ?? 0), 0);
  }
  return (1 - a) * (FAVOR_LIFT / pack.chamber.size);
}

// A band, not a point: the standard error of the weighted share the reveal will draw.
export function forecast(pack: Pack, byRegion: Record<string, number>): { public: number; band: [number, number] } {
  const w = pack.regions.reduce((a, r) => a + r.weight, 0) || 1;
  const pub = pack.regions.reduce((a, r) => a + r.weight * (byRegion[r.id] ?? 0.5), 0) / w;
  const varr = pack.regions.reduce((a, r) => { const p = byRegion[r.id] ?? 0.5; return a + (r.weight / w) ** 2 * p * (1 - p); }, 0);
  const se = Math.sqrt(varr);
  return { public: pub, band: [clamp(pub - 1.96 * se, 0, 1), clamp(pub + 1.96 * se, 0, 1)] };
}

export function applyCampaign(pack: Pack, game: Game, message: string, lever: Lever, intent: Record<string, number>): CampaignTurn {
  const c = game.campaign!;
  const cost = leverCost(game, lever);
  game.ledgers.chest = round1(clamp(game.ledgers.chest - cost.chest, 0, 9999));
  game.ledgers.capital = clamp(game.ledgers.capital - cost.capital, 0, 200);
  if (lever.kind === "favor") {
    const m = game.members.find((x) => x.id === lever.memberId);
    if (m) {
      m.loyalty = clamp(m.loyalty + 10, 0, 100);
      m.mood = clamp(round1(m.mood + 0.1), -1, 1);
      m.memory = [...m.memory, "The government promised them support before the vote at the end of the term."].slice(-5);
    }
  }
  const byRegion = regionIntent(pack, intent);
  const f = forecast(pack, byRegion);
  c.messages.push(message);
  c.intent = byRegion;
  c.rival = rivalTargets(pack, game, byRegion);
  const turn: CampaignTurn = { n: c.turns.length + 1, message, lever, cost, intent: byRegion, public: round1(f.public * 1000) / 1000, band: f.band, rival: c.rival };
  c.turns.push(turn);
  c.drafts = [];
  if (c.turns.length >= CAMPAIGN_TURNS) { game.stage = "test"; game.phase = "over"; }
  return turn;
}
```

In `applyVote`, the branch `else if (game.turn > TURNS_PER_TERM) { game.stage = "test"; game.phase = "over"; }` becomes:

```ts
  } else if (game.turn > TURNS_PER_TERM) { game.stage = "campaign"; game.phase = "over"; startCampaign(pack, game); }
```

In `continueTerm`, add `game.campaign = undefined; game.midterm = undefined;` beside `game.test = undefined;`. Replace the two `Math.round(LOBBY_COSTS[action] * (first(game, "lobbyCost") ?? 1))` lines in `applyLobby` with `lobbyCost(game, action)`.

- [ ] **Step 6: Turnout, and the four escalation hooks**

```ts
// The pack names no base bloc, so the player's base is the groups that approve of them most at term end.
export const baseBlocs = (game: Game, n = 2): string[] =>
  Object.entries(game.blocs).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
```

Inside `runTest`, the citizen loop takes the multiplier:

```ts
  const apathy = game.stageB.apathy;
  const thin = new Set(apathy ? baseBlocs(game) : []);
  for (const c of pack.citizens) {
    const g = per.get(c.region);
    if (!g) continue;
    const w = c.weight * (thin.has(c.bloc) ? apathy! : 1);
    g.w += w; g.s += w * (answers.intent[c.id] ?? 0);
  }
```

The four Stage B numbers now all have a reader. Update the comments in `ESCALATION_EFFECTS`:
`split_chamber: { stageB: 8 },  // runMidterm` / `rival_surge: { stageB: 2 },  // rivalTargets spend` /
`apathy: { stageB: 0.8 },  // runTest turnout` / `loud_opposition: { stageB: 1.5 },  // applyPost`.
Leave the existing "every escalation has a hook or a stored number" test untouched: it still passes.

- [ ] **Step 7: Run the tests until green**

Run: `bun test worker/engine.test.ts`
Expected: PASS, 25 existing plus 11 new.

Run: `bunx tsc -b && bun test worker src`
Expected: exit 0, all green.

- [ ] **Step 8: Commit**

```bash
git add worker/engine.ts worker/engine.test.ts
git commit -m "Stage B engine: Feed, midterm, campaign, turnout"
```

---

### Task 2: The Jev and Luna calls Stage B needs

**Files:**
- Modify: `worker/jev.ts`, `worker/luna.ts`
- Test: `worker/jev.test.ts` (create)

**Interfaces:**
- Consumes: `jev()`, `Question`, `Answers`, `citizenPersona` (module-private), `luna()`, `world()` (module-private), `clip()` (module-private), `Pack`, `Citizen`, `Game`, `record()`, `Replacement`, `Persona`.
- Produces:

```ts
// worker/jev.ts
export const choices: (answers: Answers, prefix: string) => Record<string, string>;
export function reactQuestions(pack: Pack, citizens: Citizen[]): Record<string, Question>;      // react_<citizenId>
export const reactState: (pack: Pack, game: Game, text: string) => unknown;
export function agreeQuestions(pack: Pack, citizens: Citizen[]): Record<string, Question>;      // agree_<citizenId>
export const agreeState: (pack: Pack, mine: string, rival: string) => unknown;
export function voteQuestions(pack: Pack, game: Game, citizens: Citizen[],
  spend: Record<string, number>, rivalSpend: Record<string, number>): Record<string, Question>; // vote_<citizenId>
export const voteState: (pack: Pack, game: Game, messages: string[]) => unknown;

// worker/luna.ts
export async function replies(env: Env, pack: Pack, text: string,
  loudest: { name: string; town: string; worldview: string; reaction: string }[], state: unknown):
  Promise<{ replies: { name: string; text: string }[]; rival: string }>;
export async function messages(env: Env, pack: Pack, state: unknown): Promise<string[]>;         // exactly 3
export async function halfTerm(env: Env, pack: Pack, state: unknown): Promise<{ title: string; lede: string }>;
export async function newMembers(env: Env, pack: Pack, slots: Replacement[]): Promise<Persona[]>;
```

- [ ] **Step 1: Write the failing test**

Create `worker/jev.test.ts`:

```ts
import { test, expect } from "bun:test";
import { agreeQuestions, choices, reactQuestions, voteQuestions } from "./jev";
import { newGame, encodeCode, scenarioTag } from "./engine";
import { PackSchema, type Citizen, type Pack } from "./pack";
import mini from "./fixtures/mini.json";

const BLOCS = ["dockworkers", "merchants", "fisherfolk", "clergy", "students"];
const REGIONS = mini.regions.map((r) => r.id);
const citizens = (): Citizen[] => BLOCS.flatMap((bloc) => Array.from({ length: 50 }, (_, i) => ({
  id: `${bloc}-${i}`, region: REGIONS[i % REGIONS.length], bloc, name: `C ${bloc} ${i}`, age: 30,
  job: "docker", town: "Harbor City", worldview: "wants work", issues: ["tariffs", "fish-quotas"] as [string, string], weight: 1,
})));
const pack: Pack = PackSchema.parse({ ...mini, citizens: citizens() });
const game = newGame("g", encodeCode({ scenario: scenarioTag(mini.id), faction: 0, promises: [0, 1, 2], seed: 1 }),
  pack, "harborites", ["dockworker-pay", "tariffs", "fish-quotas"], { start_date: "0450-05-01", unit: "month" });

test("every citizen gets one reaction choice with four options", () => {
  const qs = reactQuestions(pack, pack.citizens);
  expect(Object.keys(qs).length).toBe(250);
  const q = qs[`react_${pack.citizens[0].id}`] as { type: string; options: string[] };
  expect(q.type).toBe("choice");
  expect(q.options).toEqual(["like", "boo", "share", "ignore"]);
});

test("the duel asks the sample which post it agrees with", () => {
  const qs = agreeQuestions(pack, pack.citizens.slice(0, 50));
  expect(Object.keys(qs).length).toBe(50);
  expect((qs[`agree_${pack.citizens[0].id}`] as { options: string[] }).options).toEqual(["government", "rival"]);
});

test("a citizen sees the money spent in their own region, not the whole map", () => {
  const spend = { [REGIONS[0]]: 10 }, rival = { [REGIONS[1]]: 5 };
  const qs = voteQuestions(pack, game, pack.citizens, spend, rival);
  const here = pack.citizens.find((c) => c.region === REGIONS[0])!;
  const there = pack.citizens.find((c) => c.region === REGIONS[2])!;
  expect(JSON.stringify((qs[`vote_${here.id}`] as { instructions: unknown }).instructions)).toContain("10");
  expect(JSON.stringify((qs[`vote_${there.id}`] as { instructions: unknown }).instructions)).toContain('"spend_here":0');
});

test("choices reads the top probability and strips the prefix", () => {
  expect(choices({ react_a: { probabilities: { like: 0.2, boo: 0.7, share: 0.1 } }, other: { noul: 1 } }, "react_")).toEqual({ a: "boo" });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test worker/jev.test.ts`
Expected: FAIL, "Export named 'reactQuestions' not found in module".

- [ ] **Step 3: Write the Jev question shapes**

Append to `worker/jev.ts`:

```ts
export const choices = (answers: Answers, prefix: string): Record<string, string> =>
  Object.fromEntries(Object.entries(answers)
    .filter(([k, v]) => k.startsWith(prefix) && v.probabilities)
    .map(([k, v]) => [k.slice(prefix.length), Object.entries(v.probabilities!).sort((a, b) => b[1] - a[1])[0][0]]));

export function reactQuestions(pack: Pack, citizens: Citizen[]): Record<string, Question> {
  const qs: Record<string, Question> = {};
  for (const c of citizens) qs[`react_${c.id}`] = {
    type: "choice",
    instructions: { citizen: citizenPersona(pack, c), question: "How does this person react to `post` from the government?" },
    options: ["like", "boo", "share", "ignore"],
  };
  return qs;
}
export const reactState = (pack: Pack, game: Game, text: string) => ({ post: text, record: record(pack, game) });

export function agreeQuestions(pack: Pack, citizens: Citizen[]): Record<string, Question> {
  const qs: Record<string, Question> = {};
  for (const c of citizens) qs[`agree_${c.id}`] = {
    type: "choice",
    instructions: { citizen: citizenPersona(pack, c), question: "Which of the two posts in `duel` does this person agree with?" },
    options: ["government", "rival"],
  };
  return qs;
}
export const agreeState = (pack: Pack, mine: string, rival: string) => ({ duel: { government: mine, rival } });

// The money in this person's own region sits in their question; the messages and the record sit in the state.
export function voteQuestions(pack: Pack, game: Game, citizens: Citizen[],
  spend: Record<string, number>, rivalSpend: Record<string, number>): Record<string, Question> {
  const title = pack.starts.find((s) => s.faction === game.faction)?.seat_title ?? "the government";
  const qs: Record<string, Question> = {};
  for (const c of citizens) qs[`vote_${c.id}`] = {
    type: "noul",
    instructions: {
      citizen: citizenPersona(pack, c), spend_here: spend[c.region] ?? 0, rival_spend_here: rivalSpend[c.region] ?? 0,
      question: `Would this person vote to keep the ${title} in power?`,
    },
    criteria: {
      true: `The record and the messages in \`campaign\` are good enough to keep the ${title}.`,
      false: `The record and the messages in \`campaign\` are not good enough, or the rival has made the better case.`,
    },
  };
  return qs;
}
export const voteState = (pack: Pack, game: Game, messages: string[]) =>
  ({ campaign: { [pack.vocabulary.test]: pack.test.name, messages }, record: record(pack, game) });
```

- [ ] **Step 4: Write the Luna calls**

Append to `worker/luna.ts`:

```ts
const RepliesSchema = z.object({ replies: z.array(z.object({ name: z.string(), text: z.string() })), rival: z.string() });
const MessagesSchema = z.object({ messages: z.array(z.string()) });
const PersonaSchema = (pack: Pack) => z.object({ rows: z.array(z.object({
  id: z.string(), name: z.string(), bio: z.string(), tell: z.string(),
  core_issues: z.array(z.enum(pack.tags as [string, ...string[]])).min(1).max(3),
})) });

export async function replies(env: Env, pack: Pack, text: string,
  loudest: { name: string; town: string; worldview: string; reaction: string }[], state: unknown) {
  const d = await luna(env, RepliesSchema, "replies",
    `You write what people said back to the government's ${pack.vocabulary.post}. One reply per person given, at most 25 words each, in their own voice, copy the name as given. Then write the rival's answer post, at most 240 characters, sharper than the government's.${world(pack)}`,
    JSON.stringify({ post: text, people: loudest, record: state }), 240);
  return { replies: d.replies.slice(0, 3).map((r) => ({ name: clip(r.name, 60), text: clip(r.text, 220) })), rival: clip(d.rival, 240) };
}

export async function messages(env: Env, pack: Pack, state: unknown): Promise<string[]> {
  const d = await luna(env, MessagesSchema, "messages",
    `You write the three lines the government could run on this ${pack.vocabulary.turn} of the race, from the record given. Each at most 20 words, each a different argument: one on what was kept, one on the biggest fight, one on what the other side would do.${world(pack)}`,
    JSON.stringify(state), 160);
  const out = d.messages.slice(0, 3).map((m) => clip(m, 160));
  while (out.length < 3) out.push(out[0] ?? "");
  return out;
}

export async function halfTerm(env: Env, pack: Pack, state: unknown) {
  const d = await luna(env, HeadlineSchema, "halfterm",
    `You write for ${pack.vocabulary.feed} the morning after the seats changed hands. One headline, at most 12 words, and a two-sentence lede on where the government stands at the half of its term.${world(pack)}`,
    JSON.stringify(state), 220);
  return { title: clip(d.title, 90), lede: clip(d.lede, 300) };
}

// Only the flipped seats. Identity is already fixed by code: the model writes prose and a name.
export async function newMembers(env: Env, pack: Pack, slots: { id: string; seat: string; region: string; faction: string; temperament: string; years: string }[]) {
  if (!slots.length) return [];
  const name = (id: string, xs: { id: string; name: string }[]) => xs.find((x) => x.id === id)?.name ?? id;
  const d = await luna(env, PersonaSchema(pack), "newmembers",
    `You write the people who just won these seats. Each row has its seat, region, faction, temperament and years: never change them. Write name, bio (at most 40 words), tell (one visible habit, at most 18 words) and 1 to 3 core_issues from the tags. Names are invented, plausible for the period and place, never a real person. Every row is a different person.`,
    JSON.stringify({
      tags: pack.tags,
      rows: slots.map((s) => ({ id: s.id, region: name(s.region, pack.regions), faction: name(s.faction, pack.factions), temperament: s.temperament, years: s.years })),
    }), Math.min(4000, 400 + slots.length * 160));
  return d.rows.slice(0, slots.length).map((r) => ({ id: r.id, name: clip(r.name, 60), bio: clip(r.bio, 400), tell: clip(r.tell, 200), core_issues: r.core_issues }));
}
```

`newMembers` takes a structural subset of `Replacement`, so `worker/luna.ts` keeps importing no engine values, only types it already has.

- [ ] **Step 5: Run the tests**

Run: `bun test worker/jev.test.ts && bunx tsc -b && bun test worker src`
Expected: PASS, 4 new tests, exit 0.

- [ ] **Step 6: Commit**

```bash
git add worker/jev.ts worker/luna.ts worker/jev.test.ts
git commit -m "Stage B calls: reactions, the duel, vote intent, replies, drafts, new members"
```

---

### Task 3: GameDO, midterm night

**Files:**
- Modify: `worker/game.ts`, `worker/index.ts`, `worker/build.ts`, `src/api.ts`
- Test: `worker/game.test.ts`
- Create, uncommitted: `wrangler.dev.jsonc`

**Interfaces:**
- Consumes: `runMidterm`, `replacements`, `applyMidterm`, `midtermUp`, `regionIntent`, `voteQuestions`, `voteState`, `nouls`, `newMembers`, `halfTerm`, `record`, `nationalApproval`, `portraitSheet`.
- Produces:
  - `POST /api/games/:id/midterm` `{ turn }` -> the view with `midterm` filled.
  - `worker/build.ts`: `export async function portraitSheet(env: Env, scenario: string, pack: Pack, group: Member[]): Promise<boolean>` — one muse call, one alignment retry, face and plate per member into R2, `true` when the sheet landed.
  - `src/api.ts`: `midterm: (g: GameView) => Promise<GameView>`.

- [ ] **Step 1: Write the dev config, uncommitted**

```bash
cd /Users/deadpackets/workspace/UnitedStatesOfJev/.worktrees/any-polity
python3 - <<'PY'
import json, re
src = open("wrangler.jsonc").read()
cfg = json.loads(re.sub(r"^\s*//.*$", "", src, flags=re.M))
cfg.pop("routes", None)
cfg.pop("assets", None)
for k in ("d1_databases", "vectorize", "r2_buckets"):
    for b in cfg.get(k, []):
        b["remote"] = True
cfg["ai"]["remote"] = True
open("wrangler.dev.jsonc", "w").write(json.dumps(cfg, indent=2) + "\n")
PY
grep -q '^wrangler.dev.jsonc$' .gitignore || echo "wrangler.dev.jsonc is untracked on purpose; never stage it"
git status --porcelain wrangler.dev.jsonc
```

Expected: `?? wrangler.dev.jsonc`. Never `git add` it. Delete it at the end of the task.

- [ ] **Step 2: Write the failing test**

Append to `worker/game.test.ts`, following the file's existing style of driving `GameDO.fetch` with a stubbed `jev`/`luna`:

```ts
test("the midterm swaps the seats it lost and ships the new members in the view", async () => {
  const { do_, view } = await seatedGame();                    // the file's existing helper
  await playTo(do_, 10);                                       // the file's existing helper: ten voted turns
  const before = view().members.map((m) => m.id);
  const r = await do_.fetch(new Request("https://do/midterm", { method: "POST", body: JSON.stringify({ turn: 11 }) }));
  expect(r.status).toBe(200);
  const g = await r.json() as GameView;
  expect(g.stage === "session" || g.stage === "over").toBe(true);
  expect(g.midterm!.up.length).toBe(Math.round(g.pack.chamber.size / 3));
  expect(g.members.length).toBe(g.pack.chamber.size);
  for (const l of g.midterm!.lost) {
    const seat = g.members.find((m) => m.seat === l.seat)!;
    expect(before).not.toContain(seat.id);
    expect(seat.faction).toBe(l.to);
    expect(seat.name.length).toBeGreaterThan(0);
    expect(seat.memory).toEqual([]);
  }
});

test("the midterm is refused outside its stage", async () => {
  const { do_ } = await seatedGame();
  const r = await do_.fetch(new Request("https://do/midterm", { method: "POST", body: JSON.stringify({ turn: 1 }) }));
  expect(r.status).toBe(409);
});
```

If `seatedGame` and `playTo` do not exist in `worker/game.test.ts`, write them in this task: `seatedGame()` builds a `GameDO` against the mini fixture with `getScenario` stubbed, and `playTo(do_, n)` drafts, whips and votes `n` turns with `jev` and `luna` stubbed to fixed answers.

- [ ] **Step 3: Run it and watch it fail**

Run: `bun test worker/game.test.ts`
Expected: FAIL, 404 "Unknown action" instead of 200.

- [ ] **Step 4: Extract the portrait sheet from the Workflow**

In `worker/build.ts`, split `portraitsStep`'s body so one sheet is reusable, keeping the existing prompt, the alignment retry and the R2 keys:

```ts
export async function portraitSheet(env: Env, scenario: string, pack: Pack, group: Member[]): Promise<boolean> {
  const ink = rgb(pack.theme.ink), paper = rgb(pack.theme.paper);
  try {
    const prompt = sheetPrompt(pack, group);
    let cut = cells(await muse(env, prompt, "1:1"));
    if (!alignment(cut).ok) cut = cells(await muse(env, prompt, "1:1"));
    await Promise.all(group.map(async (m, i) => {
      const cell = cut[i];
      if (!cell) return;
      await put(env, `scenarios/${scenario}/members/${m.id}.png`, face(cell));
      await put(env, `scenarios/${scenario}/members/${m.id}-plate.png`, plate(cell, ink, paper));
    }));
    return true;
  } catch (e) {
    console.warn(`portraits ${scenario}`, plain(e));
    return false;
  }
}
```

`portraitsStep` now maps its chunks onto `portraitSheet` and flips the D1 marker from its boolean. The D1 marker is for pack members only: a replacement's sheet never calls `markPortrait`, because replacements live on the game, not the pack.

- [ ] **Step 5: Write the midterm action**

In `worker/game.ts`, two Stage A lines have to go first, or the midterm never blocks anything:

1. In `vote()`, delete the last two lines
   `// The midterm draw is Stage B, so the stage goes straight back to the session.` and
   `if (game.stage === "midterm") game.stage = "session";`. `applyMidterm` owns that transition now.
2. In `bill()`, the guard `if (game.stage !== "session" && game.stage !== "midterm")` becomes
   `if (game.stage !== "session")`, with the message
   ``throw new Reject(409, game.stage === "midterm" ? `The ${pack.vocabulary.midterm} comes first.` : "The term is over.")``.
   A drafted bill must not jump the midterm.

`playTo(do_, n)` in the test file therefore calls `POST /midterm` when the view comes back on stage `midterm`.

Then add to the action switch, after `case "events"`:

```ts
          case "midterm": await this.midterm(game, pack); break;
```

and the method:

```ts
  private async midterm(game: Game, pack: Pack) {
    if (game.stage !== "midterm") throw new Reject(409, `The ${pack.vocabulary.midterm} is not due.`);
    const r = await jev(this.env, voteState(pack, game, []), voteQuestions(pack, game, pack.citizens, {}, {}));
    const draw = runMidterm(pack, game, nouls(r.answers, "vote_"));
    const slots = replacements(pack, game, draw);
    const personas = await newMembers(this.env, pack, slots).catch(() => []);
    applyMidterm(pack, game, draw, personas);
    const fresh = game.members.filter((m) => slots.some((s) => s.id === m.id));
    if (fresh.length) {
      // Portraits never gate play: initials stand in until the sheet lands (v3 spec §5).
      this.ctx.waitUntil(portraitSheet(this.env, pack.id, pack, fresh.slice(0, 16)));
    }
    const head = await halfTerm(this.env, pack, {
      ...record(pack, game),
      seats_lost: draw.lost.length, seats_up: draw.up.length,
      [pack.vocabulary.approval]: Math.round(nationalApproval(pack, game)),
    }).catch(() => undefined);
    if (head && game.midterm) game.midterm.headline = head;
  }
```

`view()` already spreads the rest of `Game`, so `midterm`, `posts` and `campaign` ship with no change there; the replacement members ship through the existing `members.map(({ bio, tell, ...m }) => m)`, exactly like pack members.

In `worker/index.ts`, beside the events route:

```ts
app.post("/api/games/:id/midterm", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json(badJson, 400);
  return forward(c, c.req.param("id"), "midterm", body);
});
```

In `src/api.ts`: `midterm: (g: GameView) => call<GameView>(\`/games/${g.id}/midterm\`, { turn: g.turn }),`.

- [ ] **Step 6: Run the tests**

Run: `bun test worker src && bunx tsc -b`
Expected: PASS, exit 0.

- [ ] **Step 7: Prove it against the real bindings**

```bash
bunx wrangler dev --config ./wrangler.dev.jsonc --port 8799 &
sleep 8
bun scripts/term.ts http://127.0.0.1:8799
```

The script does not call the midterm yet (Task 4 adds it), so drive it by hand once:

```bash
curl -s -XPOST localhost:8799/api/games -H 'content-type: application/json' \
  -d '{"scenario":"v3nj3k","faction":"caesarians","promises":[0,5,7]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])'
```

Play to turn 10 with `scripts/term.ts`'s loop or ten curl rounds, then:

```bash
curl -s -XPOST localhost:8799/api/games/<id>/midterm -H 'content-type: application/json' -d '{"turn":11}' \
  | python3 -c 'import sys,json;g=json.load(sys.stdin);m=g["midterm"];print(len(m["up"]),"up",len(m["lost"]),"lost",m.get("headline",{}).get("title"));print([x["name"] for x in g["members"] if x["id"].startswith("r1-")])'
```

Expected: the class is a third of the seats, the new names are period names, the headline is one line. Then, after about 60 s:

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:8799/api/scenarios/v3nj3k/art/members/r1-seat-07.png
```

Expected: 200 for a seat that flipped (substitute a real flipped seat id). A 404 is acceptable only if the sheet failed, which the `wrangler dev` log prints as `portraits v3nj3k`.

- [ ] **Step 8: Commit and clean up**

```bash
rm wrangler.dev.jsonc
git add worker/game.ts worker/index.ts worker/build.ts worker/game.test.ts src/api.ts
git commit -m "Midterm night in the GameDO, with lazy replacement members"
```

---

### Task 4: GameDO, the Feed and the campaign

**Files:**
- Modify: `worker/game.ts`, `worker/index.ts`, `src/api.ts`, `scripts/term.ts`
- Test: `worker/game.test.ts`
- Create, uncommitted: `wrangler.dev.jsonc` (same recipe as Task 3 step 1)

**Interfaces:**
- Consumes: `applyPost`, `startCampaign`, `applyCampaign`, `leverCost`, `leverGain`, `rivalTargets`, `CAMPAIGN_TURNS`, `RIVAL_SPEND`, `SPEND_STEPS`, `reactQuestions`, `reactState`, `agreeQuestions`, `agreeState`, `voteQuestions`, `voteState`, `choices`, `nouls`, `replies`, `messages`.
- Produces:
  - `POST /api/games/:id/post` `{ turn, text }` -> view with `posts[-1]` filled.
  - `POST /api/games/:id/campaign/drafts` `{}` -> view with `campaign.drafts` filled (idempotent).
  - `POST /api/games/:id/campaign` `{ message, lever }` -> view with `campaign.turns[-1]` filled.
  - `src/api.ts`: `post`, `drafts`, `campaign`.

```ts
// the campaign body, validated in the DO
type CampaignBody = { message?: string; lever?: { kind: "spend"; regions?: { id: string; amount: number }[] } | { kind: "favor"; memberId?: string } };
```

- [ ] **Step 1: Write the failing tests**

Append to `worker/game.test.ts`:

```ts
test("one post a turn, 240 characters, and the view carries the reactions", async () => {
  const { do_ } = await seatedGame();
  const ok = await do_.fetch(new Request("https://do/post", { method: "POST", body: JSON.stringify({ turn: 1, text: "Tolls come down at the harbour." }) }));
  expect(ok.status).toBe(200);
  const g = await ok.json() as GameView;
  const p = g.posts.at(-1)!;
  expect(p.likes + p.boos + p.shares + p.ignores).toBe(250);
  expect(p.replies.length).toBeGreaterThan(0);
  expect(typeof p.rival).toBe("string");
  const again = await do_.fetch(new Request("https://do/post", { method: "POST", body: JSON.stringify({ turn: 1, text: "Twice." }) }));
  expect(again.status).toBe(409);
  const long = await do_.fetch(new Request("https://do/post", { method: "POST", body: JSON.stringify({ turn: 1, text: "x".repeat(241) }) }));
  expect(long.status).toBe(400);
});

test("a campaign turn needs a draft, a lever it can pay for, and four of them reach the test", async () => {
  const { do_ } = await seatedGame();
  await playTo(do_, 20);
  const d = await (await do_.fetch(new Request("https://do/campaign/drafts", { method: "POST", body: "{}" }))).json() as GameView;
  expect(d.stage).toBe("campaign");
  expect(d.campaign!.drafts.length).toBe(3);
  const broke = await do_.fetch(new Request("https://do/campaign", { method: "POST", body: JSON.stringify({ message: d.campaign!.drafts[0], lever: { kind: "spend", regions: [{ id: d.pack.regions[0].id, amount: 10 }, { id: d.pack.regions[1].id, amount: 10 }, { id: d.pack.regions[2].id, amount: 10 }] } }) }));
  expect(broke.status).toBe(400);                                   // at most two regions
  let g = d;
  for (let i = 0; i < 4; i++) {
    if (!g.campaign!.drafts.length) g = await (await do_.fetch(new Request("https://do/campaign/drafts", { method: "POST", body: "{}" }))).json() as GameView;
    g = await (await do_.fetch(new Request("https://do/campaign", { method: "POST", body: JSON.stringify({ message: g.campaign!.drafts[0], lever: { kind: "spend", regions: [] } }) }))).json() as GameView;
  }
  expect(g.campaign!.turns.length).toBe(4);
  expect(g.stage).toBe("test");
  expect(g.campaign!.turns[0].band[0]).toBeLessThan(g.campaign!.turns[0].public);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test worker/game.test.ts`
Expected: FAIL, 404 "Unknown action".

- [ ] **Step 3: Write the post action**

In `worker/game.ts`'s switch:

```ts
          case "post": await this.post(game, pack, String(body.text ?? "")); break;
          case "campaign":
            parts[1] === "drafts" ? await this.drafts(game, pack) : await this.campaign(game, pack, body as CampaignBody);
            break;
```

```ts
  private async post(game: Game, pack: Pack, raw: string) {
    if (game.stage !== "session") throw new Reject(409, "Not now.");
    const text = raw.trim();
    if (!text.length || text.length > 240) throw new Reject(400, "240 characters at most.");
    if (game.posts.some((p) => p.turn === game.turn)) throw new Reject(409, "One a turn.");
    const sample = seededSample(game, pack.citizens, 50);
    const r = await jev(this.env, reactState(pack, game, text), reactQuestions(pack, pack.citizens));
    const reactions = choices(r.answers, "react_") as Record<string, Reaction>;
    const loudest = [...pack.citizens]
      .filter((c) => reactions[c.id] === "share" || reactions[c.id] === "boo")
      .sort((a, b) => b.weight - a.weight).slice(0, 3)
      .map((c) => ({ name: c.name, town: c.town, worldview: c.worldview, reaction: reactions[c.id] }));
    const said = await replies(this.env, pack, text, loudest, record(pack, game)).catch(() => ({ replies: [], rival: "" }));
    const duel = said.rival
      ? choices((await jev(this.env, agreeState(pack, text, said.rival), agreeQuestions(pack, sample))).answers, "agree_")
      : {};
    applyPost(pack, game, game.turn, text, reactions, said, duel as Record<string, "government" | "rival">);
  }
```

`seededSample(game, xs, n)` is one line beside `view()` in `game.ts`: `[...xs].sort(() => rng(game.seed ^ 0xfeed)() - 0.5).slice(0, n)` with the generator hoisted out of the comparator, the same shape `newGame` uses.

- [ ] **Step 4: Write the campaign actions**

```ts
  private async drafts(game: Game, pack: Pack) {
    if (game.stage !== "campaign") throw new Reject(409, `The ${pack.vocabulary.campaign} has not started.`);
    const c = game.campaign!;
    if (c.drafts.length === 3) return;
    c.drafts = await messages(this.env, pack, { ...record(pack, game), said_so_far: c.messages, of: CAMPAIGN_TURNS, so_far: c.turns.length })
      .catch(() => ["Keep the course.", "The work is not finished.", "The other side would undo it."]);
  }

  private async campaign(game: Game, pack: Pack, body: CampaignBody) {
    if (game.stage !== "campaign") throw new Reject(409, `The ${pack.vocabulary.campaign} has not started.`);
    const c = game.campaign!;
    const message = String(body.message ?? "").trim().slice(0, 200);
    if (!message) throw new Reject(400, "Pick a message.");
    const lever = readLever(pack, game, body.lever);
    const cost = leverCost(game, lever);
    if (cost.chest > game.ledgers.chest) throw new Reject(402, "Not enough in the chest.");
    if (cost.capital > game.ledgers.capital) throw new Reject(402, `Not enough ${pack.vocabulary.capital}.`);
    const spend: Record<string, number> = {};
    if (lever.kind === "spend") for (const r of lever.regions) spend[r.id] = r.amount;
    const rivalAmount = RIVAL_SPEND * (game.stageB.rival_surge ?? 1);
    const rivalSpend = Object.fromEntries(c.rival.map((id) => [id, rivalAmount]));
    const r = await jev(this.env, voteState(pack, game, [...c.messages, message]),
      voteQuestions(pack, game, pack.citizens, spend, rivalSpend));
    applyCampaign(pack, game, message, lever, nouls(r.answers, "vote_"));
  }
```

`readLever` sits beside `pickStart` at the top of `game.ts`:

```ts
// Two levers, nothing else: up to two regions at 0, 5 or 10 from the chest, or one seat favor from capital.
function readLever(pack: Pack, game: Game, raw: CampaignBody["lever"]): Lever {
  if (raw?.kind === "favor") {
    const m = game.members.find((x) => x.id === raw.memberId);
    if (!m) throw new Reject(400, `Bad ${pack.vocabulary.member}.`);
    return { kind: "favor", memberId: m.id };
  }
  const rows = (raw?.kind === "spend" ? raw.regions ?? [] : []).slice(0, 3);
  if (rows.length > 2) throw new Reject(400, "Two regions at most.");
  for (const r of rows) {
    if (!pack.regions.some((x) => x.id === r.id)) throw new Reject(400, "No such region.");
    if (!(SPEND_STEPS as readonly number[]).includes(r.amount)) throw new Reject(400, "Spend 0, 5 or 10.");
  }
  return { kind: "spend", regions: rows };
}
```

Routes in `worker/index.ts`:

```ts
for (const action of ["post", "campaign", "campaign/drafts"]) {
  app.post(`/api/games/:id/${action}`, async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json(badJson, 400);
    return forward(c, c.req.param("id"), action, body);
  });
}
```

`src/api.ts`:

```ts
  post: (g: GameView, text: string) => call<GameView>(`/games/${g.id}/post`, { turn: g.turn, text }),
  drafts: (g: GameView) => call<GameView>(`/games/${g.id}/campaign/drafts`, {}),
  campaign: (g: GameView, message: string, lever: Lever) => call<GameView>(`/games/${g.id}/campaign`, { message, lever }),
```

with `import type { Lever } from "../worker/engine";` and `export type { Lever };`.

- [ ] **Step 5: Extend the term script**

In `scripts/term.ts`, inside the turn loop after the vote and before the card, post on odd turns:

```ts
  if (turn % 2 === 1) {
    g = await api(`/games/${g.id}/post`, { turn, text: `The ${V.bill} on ${voted.title} is what this year is about.`.slice(0, 240) });
    const p = g.posts.at(-1)!;
    console.log(`     ${V.post}: ${p.likes} like ${p.boos} boo ${p.shares} share -> ${p.won ? "won" : "lost"} the reply`);
  }
```

after the loop's `while` condition sees `stage === "midterm"`, call the midterm once:

```ts
  if (g.stage === "midterm") {
    const t0 = performance.now();
    g = await api(`/games/${g.id}/midterm`, { turn: g.turn });
    const m = g.midterm!;
    console.log(`\n${V.midterm}: ${m.up.length} up, ${m.lost.length} lost in ${ms(t0)} | ${m.headline?.title ?? "(no headline)"}`);
    if (m.wipeout) console.log("wipeout: the run ends as a lame duck");
  }
```

and, before the test block, the four campaign turns:

```ts
while (g.stage === "campaign") {
  const t0 = performance.now();
  if (!g.campaign!.drafts.length) g = await api(`/games/${g.id}/campaign/drafts`, {});
  const c = g.campaign!;
  const target = c.rival[0] ?? g.pack.regions[0].id;
  const lever = g.ledgers.chest >= 10 ? { kind: "spend", regions: [{ id: target, amount: 10 }] } : { kind: "spend", regions: [] };
  g = await api(`/games/${g.id}/campaign`, { message: c.drafts[0], lever });
  const t = g.campaign!.turns.at(-1)!;
  console.log(`${V.campaign} ${t.n}/4 "${t.message}" | public ${(t.public * 100).toFixed(1)}% band ${(t.band[0] * 100).toFixed(1)}-${(t.band[1] * 100).toFixed(1)} | rival in ${t.rival.join(", ")} | ${ms(t0)}`);
}
```

The while loop over `session | midterm` must not swallow the midterm stage: change its condition to `while (g.stage === "session")` and run the midterm block inside the loop, right after the card, when `g.stage === "midterm"`.

- [ ] **Step 6: Run everything**

```bash
bun test worker src && bunx tsc -b
bunx wrangler dev --config ./wrangler.dev.jsonc --port 8799 &
sleep 8
bun scripts/term.ts http://127.0.0.1:8799
```

Expected: 20 turns, 10 posts, one midterm, 4 campaign turns, the test, an ending, every request 200, under 8 minutes (Stage A ran 20 turns in 213 s; the Feed adds about 2.5 s a post and the campaign about 3 s a turn). Record the per-route timings in the report.

- [ ] **Step 7: Commit and clean up**

```bash
rm wrangler.dev.jsonc
git add worker/game.ts worker/index.ts worker/game.test.ts src/api.ts scripts/term.ts
git commit -m "Feed and campaign in the GameDO, and the term script plays them"
```

---

### Task 5: The Feed tab

**Files:**
- Create: `src/Feed.tsx`
- Modify: `src/Chamber.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `api.post`, `GameView`, `GamePack`, `Act` from `App.tsx`, `Meter` and `Num` from `Ledger.tsx`, `pack.vocabulary.feed`, `pack.vocabulary.post`, `pack.vocabulary.turn`.
- Produces: `export default function Feed({ game, act, busy }: { game: GameView; act: Act; busy: boolean })` and `export function FeedLine({ game }: { game: GameView })`, the one-line summary the Turn tab shows.

- [ ] **Step 1: Write the Feed panel**

`src/Feed.tsx`:

```tsx
import { useState } from "react";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Meter } from "./Ledger";

const LIMIT = 240;

export function FeedLine({ game }: { game: GameView }) {
  const p = game.posts.find((x) => x.turn === game.turn);
  if (!p) return <span className="small muted">Nothing sent this {game.pack.vocabulary.turn}.</span>;
  return (
    <span className="small num">
      {p.likes} · {p.boos} · {p.shares} <span className={p.won ? "muted" : "fail"}>{p.won ? "ahead" : "behind"}</span>
    </span>
  );
}

export default function Feed({ game, act, busy }: { game: GameView; act: Act; busy: boolean }) {
  const v = game.pack.vocabulary;
  const [text, setText] = useState("");
  const post = game.posts.find((p) => p.turn === game.turn);
  const left = LIMIT - text.length;

  if (!post) return (
    <div className="feed panel">
      <div className="kicker">{v.post}</div>
      <textarea id="post" value={text} maxLength={LIMIT} rows={3} onChange={(e) => setText(e.target.value)}
        placeholder={`Up to ${LIMIT} characters. Optional.`} />
      <div className="actions">
        <button className={`btn ${busy ? "busy" : ""}`} disabled={busy || !text.trim()}
          onClick={() => act(() => api.post(game, text.trim())).then((ok) => { if (ok) setText(""); })}>{v.post}</button>
        <span className={`small num ${left < 20 ? "fail" : "muted"}`}>{left}</span>
      </div>
    </div>
  );

  const total = post.likes + post.boos + post.shares + post.ignores || 1;
  return (
    <div className="feed panel">
      <div className="kicker">{v.post}</div>
      <p className="lede" style={{ margin: "0 0 10px" }}>{post.text}</p>
      <div className="meters">
        <Meter k="likes" value={post.likes} fill={post.likes / total} i={0} />
        <Meter k="boos" value={post.boos} fill={post.boos / total} i={1} />
        <Meter k="shares" value={post.shares} fill={post.shares / total} i={2} />
        <Meter k="quiet" value={post.ignores} fill={post.ignores / total} i={3} />
      </div>
      {post.hot.length ? (
        <p className="small muted">Loud in {post.hot.map((id) => game.pack.regions.find((r) => r.id === id)?.name ?? id).join(", ")}.</p>
      ) : null}
      <div className="quotes">
        {post.replies.map((r, i) => (
          <blockquote key={r.name} className="pull rise" style={{ animationDelay: `${120 + i * 120}ms` }}>
            {r.text}<cite>{r.name}</cite>
          </blockquote>
        ))}
      </div>
      {post.rival ? (
        <div className="rival rise" style={{ animationDelay: "480ms" }}>
          <div className="kicker">The other side</div>
          <p style={{ margin: "4px 0 0" }}>{post.rival}</p>
        </div>
      ) : null}
      <div className={`stampsm tiny ${post.won ? "pass" : "fail"}`}>
        {post.agree.mine}–{post.agree.rival}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Put the two tabs in the rail**

In `src/Chamber.tsx`, add `const [tab, setTab] = useState<"turn" | "feed">("turn");` and, as the first child of `<aside className="rail">`:

```tsx
        <div className="tabs" role="tablist" aria-label={v.feed}>
          <button role="tab" aria-selected={tab === "turn"} onClick={() => setTab("turn")}>{v.turn}</button>
          <button role="tab" aria-selected={tab === "feed"} onClick={() => setTab("feed")}>{v.feed}</button>
          {tab === "turn" ? <FeedLine game={game} /> : null}
        </div>
```

Wrap the existing rail contents (Ledger, bill pad or bill card, headline, quotes) in `{tab === "turn" ? (<>…</>) : <Feed game={game} act={act} busy={busy} />}`. The tab labels are the pack's words printed bare, which the vocabulary rule allows.

- [ ] **Step 3: Style the tabs and the Feed**

In `src/styles.css`, beside `.rail`:

```css
.tabs { display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--line); }
.tabs button { min-height: 44px; padding: 0 10px; border: 0; background: none; color: var(--ink-2);
  font: 600 12px/1 var(--sans); letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
.tabs button[aria-selected="true"] { color: var(--ink); box-shadow: inset 0 -2px 0 var(--ink); }
.tabs .small { margin-left: auto; }
.feed textarea { width: 100%; }
.feed .rival { border-left: 2px solid var(--accent); padding-left: 10px; margin-top: 12px; }
```

- [ ] **Step 4: See it work**

```bash
bunx wrangler dev --config ./wrangler.dev.jsonc --port 8799 &
bun run dev
```

In Chrome on the Vite URL: take the Rome seat, play one turn, open the second tab, write a post under 240 characters, send it. Expected: four meters that sum to 250, up to three replies with names, the rival's post under the accent rule, the duel score stamped, and the first tab's one-line summary showing the same three numbers. Check 390 px with the iframe trick: the tabs stay on one row and nothing crosses 391.

- [ ] **Step 5: Commit**

```bash
git add src/Feed.tsx src/Chamber.tsx src/styles.css
git commit -m "The Feed as the rail's second tab"
```

---

### Task 6: Midterm night

**Files:**
- Create: `src/Midterm.tsx`
- Modify: `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `api.midterm`, `Chamber` and `orderMembers` from `Hemicycle.tsx`, `national` from `Ledger.tsx`, `GameView`, `useReducedMotion`, `sound`.
- Produces: `export default function Midterm({ game, act, busy }: { game: GameView; act: Act; busy: boolean })`. `App.tsx` routes `game.stage === "midterm"` here, before the `Chamber` branch.

- [ ] **Step 1: Write the screen**

`src/Midterm.tsx`, the swap clock modelled on the roll call's rAF loop:

```tsx
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { api, type GameView, type ViewMember } from "./api";
import type { Act } from "./App";
import { Chamber as ChamberFloor } from "./Hemicycle";
import { sound } from "./sound";

export default function Midterm({ game, act, busy }: { game: GameView; act: Act; busy: boolean }) {
  const v = game.pack.vocabulary;
  const reduced = useReducedMotion();
  const before = useRef<ViewMember[]>(game.members);
  const [shown, setShown] = useState(0);
  const result = game.midterm;
  const lost = result?.lost ?? [];
  const done = !result || shown >= lost.length;

  useEffect(() => {
    if (!result || reduced) { setShown(lost.length); return; }
    let i = 0;
    const step = Math.max(240, Math.min(900, 9000 / Math.max(1, lost.length)));
    const t = setInterval(() => {
      i += 1; setShown(i); sound.play("tick", { pitch: i });
      if (i >= lost.length) { clearInterval(t); sound.play(lost.length ? "thud" : "gavel"); }
    }, step);
    return () => clearInterval(t);
  }, [result]); // eslint-disable-line

  // Seats swap one at a time: a seat past the clock still shows who held it.
  const swapped = new Set(lost.slice(0, shown).map((l) => l.seat));
  const members = result
    ? game.members.map((m) => (lost.some((l) => l.seat === m.seat) && !swapped.has(m.seat)
      ? before.current.find((b) => b.seat === m.seat) ?? m : m))
    : game.members;
  const mine = members.filter((m) => m.faction === game.faction || game.coalition.includes(m.faction)).length;
  const size = game.pack.chamber.size;

  return (
    <main className="chamber press midtermnight">
      <header className="topbar"><h1>{game.pack.title}</h1><nav><span className="chip">{v.midterm}</span></nav></header>
      <section className="stage" aria-label={v.chamber}>
        <ChamberFloor pack={game.pack} members={members} own={game.faction} coalition={game.coalition}
          hot={result && !done ? [lost[shown]?.seat ?? ""] : undefined} onPick={() => {}} />
        <div className="whipbar" role="meter" aria-valuemin={0} aria-valuemax={size} aria-valuenow={mine}>
          <div className="fill" style={{ width: `${(mine / size) * 100}%` }} />
          <div className="tick" style={{ left: `${(game.pack.chamber.threshold / size) * 100}%` }}>
            <span className="num">{game.pack.chamber.threshold}</span>
          </div>
        </div>
        <p className="num">{mine} of {size}</p>
      </section>
      <aside className="rail">
        {!result ? (
          <div className="panel">
            <p className="lede">A third of the seats are up.</p>
            <button className={`btn ${busy ? "busy" : ""}`} disabled={busy} onClick={() => act(() => api.midterm(game))}>
              {busy ? "Counting" : "Hold the vote"}
            </button>
          </div>
        ) : (
          <div className="panel rise">
            <div className="kicker num">{result.up.length} up · {lost.length} changed hands</div>
            {done && result.headline ? (<><h2>{result.headline.title}</h2><p className="muted">{result.headline.lede}</p></>) : null}
            {done && result.wipeout ? <p className="fail">The class is gone. The rest of the term is borrowed time.</p> : null}
            {done && !result.wipeout ? <button className="btn" onClick={() => act(() => api.load(game.id))}>Back to the floor</button> : null}
          </div>
        )}
      </aside>
    </main>
  );
}
```

- [ ] **Step 2: Route it**

In `src/App.tsx`, inside the `game ?` branch, before the `Chamber` case:

```tsx
: game.stage === "midterm" ? <Midterm game={game} act={act} busy={busy} />
```

`applyMidterm` sets the stage back to `session` (or `over` on a wipeout), so the screen leaves itself the moment the action returns and the "Back to the floor" reload is only a courtesy for a player who lingers on the headline. Keep the screen mounted until the player presses it by holding a local `const [read, setRead] = useState(false)` if the stage flips underneath; the simplest version above is enough because the view still carries `midterm` after the swap.

- [ ] **Step 3: Style**

```css
.midtermnight .stage p.num { font: 900 clamp(28px, 6vw, 48px)/1 var(--display); margin: 8px 0 0; text-align: center; }
```

- [ ] **Step 4: See it work**

Run the dev Worker and Vite as in Task 5. Play ten turns (or replay a saved game id at turn 11), press "Hold the vote". Expected: the seats flip one at a time, the bar and the count follow, the headline lands after the last swap, and a wipeout shows the lame duck line and routes to Over. Check 390 px.

- [ ] **Step 5: Commit**

```bash
git add src/Midterm.tsx src/App.tsx src/styles.css
git commit -m "Midterm night"
```

---

### Task 7: Weighted tiles, and the reveal

**Files:**
- Create: `src/Tiles.tsx`, `src/tiles.test.ts`
- Modify: `src/Test.tsx`, `src/styles.css`

**Precondition:** Stage A task 13 has committed `src/Test.tsx`.

**Interfaces:**
- Consumes: `game.test.regions` = `{ id, weight, p, yes }[]`, `pack.regions`, `pack.test`, `pack.chamber.alpha`.
- Produces:

```ts
export type Box = { x: number; y: number; w: number; h: number };
export type TileDatum = { id: string; name: string; short: string; weight: number; p: number };
export type Tile<T> = Box & { d: T };
export function squarify<T extends { weight: number }>(items: T[], box: Box): Tile<T>[];
export type TileState = "" | "won" | "lost" | "flash";
export default function Tiles({ items, state, hit, selected, onPick, foot }: {
  items: TileDatum[]; state?: Record<string, TileState>; hit?: string;
  selected?: string[]; onPick?: (id: string) => void; foot?: (d: TileDatum) => string;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

`src/tiles.test.ts`:

```ts
import { test, expect } from "bun:test";
import { squarify } from "./Tiles";

const items = [
  { id: "a", weight: 0.4 }, { id: "b", weight: 0.25 }, { id: "c", weight: 0.15 },
  { id: "d", weight: 0.1 }, { id: "e", weight: 0.06 }, { id: "f", weight: 0.04 },
];

test("the tiles fill the box, in proportion, without overlapping", () => {
  const box = { x: 0, y: 0, w: 100, h: 62 };
  const out = squarify(items, box);
  expect(out.length).toBe(items.length);
  const area = out.reduce((a, r) => a + r.w * r.h, 0);
  expect(area).toBeCloseTo(box.w * box.h, 4);
  for (const r of out) {
    expect(r.w * r.h).toBeCloseTo(r.d.weight * box.w * box.h, 4);
    expect(r.x).toBeGreaterThanOrEqual(-1e-9);
    expect(r.y).toBeGreaterThanOrEqual(-1e-9);
    expect(r.x + r.w).toBeLessThanOrEqual(box.w + 1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(box.h + 1e-9);
  }
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const a = out[i], b = out[j];
    const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
                  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    expect(overlap).toBeLessThan(1e-9);
  }
});

test("one tile takes the whole box", () => {
  const out = squarify([{ id: "only", weight: 1 }], { x: 0, y: 0, w: 60, h: 40 });
  expect(out[0]).toMatchObject({ x: 0, y: 0, w: 60, h: 40 });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/tiles.test.ts`
Expected: FAIL, cannot resolve `./Tiles`.

- [ ] **Step 3: Port the demo's squarify and write the component**

`src/Tiles.tsx`. `squarify` and `worst` are ported from the working demo at `scratchpad/art/reveal/tiles.html`, typed, with the item's own `weight` as the size key:

```tsx
import { useEffect, useRef, useState } from "react";

export type Box = { x: number; y: number; w: number; h: number };
export type Tile<T> = Box & { d: T };
export type TileDatum = { id: string; name: string; short: string; weight: number; p: number };
export type TileState = "" | "won" | "lost" | "flash";

const worst = (row: number[], short: number) => {
  const s = row.reduce((a, b) => a + b, 0), mx = Math.max(...row), mn = Math.min(...row);
  return Math.max((short * short * mx) / (s * s), (s * s) / (short * short * mn));
};

// Squarified treemap: rows are laid along the short side and closed when the aspect stops improving.
export function squarify<T extends { weight: number }>(items: T[], box: Box): Tile<T>[] {
  const out: Tile<T>[] = [];
  const total = items.reduce((s, d) => s + d.weight, 0) || 1;
  const vals = items.map((d) => (d.weight * (box.w * box.h)) / total);
  let { x, y, w, h } = box, i = 0;
  while (i < vals.length) {
    const short = Math.min(w, h);
    const row = [vals[i]];
    let j = i + 1;
    while (j < vals.length && worst(row.concat(vals[j]), short) <= worst(row, short)) row.push(vals[j++]);
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const rw = sum / h;
      let cy = y;
      row.forEach((val, k) => { const rh = val / rw; out.push({ d: items[i + k], x, y: cy, w: rw, h: rh }); cy += rh; });
      x += rw; w -= rw;
    } else {
      const rh = sum / w;
      let cx = x;
      row.forEach((val, k) => { const rw2 = val / rh; out.push({ d: items[i + k], x: cx, y, w: rw2, h: rh }); cx += rw2; });
      y += rh; h -= rh;
    }
    i = j;
  }
  return out;
}

export default function Tiles({ items, state = {}, hit, selected = [], onPick, foot }: {
  items: TileDatum[]; state?: Record<string, TileState>; hit?: string;
  selected?: string[]; onPick?: (id: string) => void; foot?: (d: TileDatum) => string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 100, h: 62 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth || 100, h: el.clientHeight || 62 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hu = (100 * box.h) / (box.w || 1);
  const rects = squarify([...items].sort((a, b) => b.weight - a.weight), { x: 0, y: 0, w: 100, h: hu });
  return (
    <div className="tiles" ref={stage}>
      {rects.map((r) => {
        const px = (r.w / 100) * box.w, py = (r.h / hu) * box.h, tiny = px < 100 || py < 46;
        const cls = ["tile", tiny ? "tiny" : "", state[r.d.id] ?? "", hit === r.d.id ? "hit" : "", selected.includes(r.d.id) ? "on" : ""].filter(Boolean).join(" ");
        const Tag = onPick ? "button" : "div";
        return (
          <Tag key={r.d.id} className={cls} onClick={onPick ? () => onPick(r.d.id) : undefined}
            style={{ left: `${r.x}%`, top: `${(r.y / hu) * 100}%`, width: `${r.w}%`, height: `${(r.h / hu) * 100}%` }}>
            <span className="nm">{tiny ? r.d.short : r.d.name}</span>
            <span className="wt num">{foot ? foot(r.d) : `${(r.d.weight * 100).toFixed(1)}%`}</span>
          </Tag>
        );
      })}
    </div>
  );
}
```

CSS ported from the demo, with the demo's `--red` flash swapped for `--accent` per the Stage A ruling that the accent carries marks:

```css
.tiles { position: relative; width: 100%; aspect-ratio: 100/62; border: 1px solid var(--ink); background: var(--paper); }
@media (max-width: 560px) { .tiles { aspect-ratio: 100/125; } }
.tile { position: absolute; border: 1px solid var(--ink); background: var(--paper); overflow: hidden;
  padding: 5px 6px; text-align: left; color: var(--ink); font: inherit; cursor: default;
  transition: background-color 220ms var(--ease), color 220ms var(--ease), border-color 220ms; }
.tile .nm { font: 700 13px/1.05 var(--display); letter-spacing: .05em; text-transform: uppercase; display: block; }
.tile .wt { font-size: 10px; color: var(--ink-2); display: block; margin-top: 2px; }
.tile.tiny { display: grid; place-items: center; padding: 0; }
.tile.tiny .nm { font-size: 11px; } .tile.tiny .wt { display: none; }
.tile.lost { background-image: repeating-linear-gradient(45deg, var(--ink-2) 0 1px, transparent 1px 7px); }
.tile.lost .nm, .tile.lost .wt { background: var(--paper); width: fit-content; padding-right: 4px; }
.tile.won { background-color: var(--ink); color: var(--paper); background-image: none; }
.tile.won .wt { color: var(--tone); }
.tile.flash { background-color: var(--accent) !important; background-image: none !important; border-color: var(--accent); color: var(--paper); }
.tile.on { outline: 3px solid var(--ink); outline-offset: -3px; }
.tile.hit { animation: hit 420ms var(--ease); }
@keyframes hit { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0); } }
button.tile { cursor: pointer; min-height: 44px; }
```

- [ ] **Step 4: Run the test**

Run: `bun test src/tiles.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Put the tiles in the reveal**

In `src/Test.tsx`, replace the region-list walk used by `reveal === "regions"` and the region half of `"both"`. The seat walk stays exactly as Stage A wrote it. The region half becomes:

```tsx
  const regions = game.test!.regions;                                  // weight descending, from the engine
  const order = [...regions].sort((a, b) => a.weight - b.weight);      // smallest first: the big ones decide it
  const STEP = Math.max(400, Math.min(1400, 40000 / Math.max(1, order.length)));
  const [in_, setIn] = useState(0);
  const [flash, setFlash] = useState<string>();
  const share = order.slice(0, in_).reduce((a, r) => a + (r.yes ? r.weight : 0), 0)
    / (regions.reduce((a, r) => a + r.weight, 0) || 1);

  useEffect(() => {
    if (reduced) { setIn(order.length); return; }
    let i = 0;
    const t = setInterval(() => {
      const r = order[i];
      i += 1; setIn(i);
      sound.play("tick", { pitch: i });
      if (r && r.yes !== r.p >= 0.5) { setFlash(r.id); setTimeout(() => setFlash(undefined), 420); }
      if (i >= order.length) { clearInterval(t); sound.play(game.test!.won ? "gavel" : "thud"); }
    }, STEP);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  const state = Object.fromEntries(order.slice(0, in_).map((r) => [r.id, flash === r.id ? "flash" : r.yes ? "won" : "lost"]));
  const items = regions.map((r) => {
    const g = game.pack.regions.find((x) => x.id === r.id);
    return { id: r.id, name: g?.name ?? r.id, short: (g?.name ?? r.id).slice(0, 3).toUpperCase(), weight: r.weight, p: r.p };
  });
```

and the frame around it:

```tsx
  <div className="gauge"><div className="fill" style={{ width: `${Math.min(100, share * 100)}%` }} />
    <div className="tick"><span className="kicker">needed 50%</span></div></div>
  <Num value={share * 100} decimals={1} className={`n ${share >= 0.5 ? "accent" : ""}`} />
  <Tiles items={items} state={state} hit={order[in_ - 1]?.id} foot={(d) => `${(d.weight * 100).toFixed(1)}%`} />
```

The gauge reuses the demo's two rules:

```css
.gauge { position: relative; height: 16px; border-bottom: 1px solid var(--ink); margin-bottom: 6px; }
.gauge .fill { position: absolute; left: 0; top: 4px; bottom: 0; background: var(--ink); width: 0; transition: width 220ms var(--ease); }
.gauge .tick { position: absolute; left: 50%; top: -2px; bottom: -4px; border-left: 1px solid var(--ink); }
.gauge .tick span { position: absolute; left: 5px; bottom: -1px; white-space: nowrap; }
```

Keep Stage A's rules: the first view of a run cannot be skipped, a replay can. `reveal === "both"` runs the tiles first and then the seat walk, as Stage A already sequences them. Under `prefers-reduced-motion` every tile lands at once and the share shows its final figure, which the `reduced` branch above already does.

- [ ] **Step 6: See it work**

Run the dev Worker and Vite. Load a game at the test and press through. Expected on a 16-region pack: about 40 s total, tiles filling in ink smallest to largest, lost regions hatched, one accent beat on a region whose draw contradicted its own forecast, the numeral counting to the weighted share with the 50% mark, and the mandate line at the end. On an 8-region pack the step is capped at 1400 ms so the whole reveal still reads as one piece. Check 390 px: the tiles switch to the tall aspect and the short names.

- [ ] **Step 7: Commit**

```bash
git add src/Tiles.tsx src/tiles.test.ts src/Test.tsx src/styles.css
git commit -m "The region reveal is a weighted treemap"
```

---

### Task 8: The campaign screen

**Files:**
- Create: `src/Campaign.tsx`
- Modify: `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `api.drafts`, `api.campaign`, `Tiles` and `TileDatum` from `Tiles.tsx`, `Num` and `Meter` from `Ledger.tsx`, `leverGain` and `leverCost` and `SPEND_STEPS` and `CAMPAIGN_TURNS` from `worker/engine` (pure, no runtime import of the Worker: `src/api.ts` already type-imports the engine, and these four are values, so import them directly — the engine module has no Worker-only imports at module scope).
- Produces: `export default function Campaign({ game, act, busy }: { game: GameView; act: Act; busy: boolean })`, routed from `App.tsx` on `game.stage === "campaign"`.

- [ ] **Step 1: Check the engine import is safe for the client**

Run: `bun run build && grep -c "zod" dist/client/assets/*.js`
Expected: build clean, `0` zod hits. `worker/engine.ts` imports `./pack` for types only and `./gen/templates` and `./gen/validate` for values; if the bundle grows by more than 10 kB or pulls zod in, copy the four constants into `src/Campaign.tsx` instead and say so in the report under Deviations. Measure before writing the screen.

- [ ] **Step 2: Write the screen**

```tsx
import { useEffect, useState } from "react";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import Tiles from "./Tiles";
import { Num } from "./Ledger";
import { CAMPAIGN_TURNS, SPEND_STEPS, leverCost, leverGain } from "../worker/engine";
import type { Lever } from "../worker/engine";

export default function Campaign({ game, act, busy }: { game: GameView; act: Act; busy: boolean }) {
  const v = game.pack.vocabulary;
  const c = game.campaign!;
  const n = c.turns.length + 1;
  const [message, setMessage] = useState<string>("");
  const [kind, setKind] = useState<"spend" | "favor">("spend");
  const [spend, setSpend] = useState<Record<string, number>>({});
  const [seat, setSeat] = useState<string>("");

  useEffect(() => { if (!c.drafts.length && !busy) act(() => api.drafts(game)); }, [c.drafts.length]); // eslint-disable-line
  useEffect(() => { setMessage(""); setSpend({}); setSeat(""); }, [n]);

  const picked = Object.entries(spend).filter(([, a]) => a > 0);
  const lever: Lever = kind === "spend"
    ? { kind: "spend", regions: picked.map(([id, amount]) => ({ id, amount })) }
    : { kind: "favor", memberId: seat };
  const cost = leverCost(game as never, lever);
  const gain = leverGain(game.pack as never, lever);
  const other: Lever = kind === "spend" ? { kind: "favor", memberId: seat || game.members[0].id } : { kind: "spend", regions: picked.map(([id, amount]) => ({ id, amount })) };
  const last = c.turns.at(-1);
  const ready = !!message && (kind === "spend" ? picked.length <= 2 : !!seat)
    && cost.chest <= game.ledgers.chest && cost.capital <= game.ledgers.capital;

  const items = game.pack.regions.map((r) => ({
    id: r.id, name: r.name, short: r.name.slice(0, 3).toUpperCase(), weight: r.weight, p: c.intent[r.id] ?? 0.5,
  }));

  return (
    <main className="chamber press campaign">
      <header className="topbar">
        <h1>{game.pack.title}</h1>
        <nav><span className="chip">{v.campaign}</span><span className="num">{n} of {CAMPAIGN_TURNS}</span></nav>
      </header>

      <section className="stage">
        <div className="forecast">
          <Num value={(last?.public ?? 0) * 100} decimals={1} className="n" />
          <span className="muted small">
            {last ? `band ${(last.band[0] * 100).toFixed(1)} to ${(last.band[1] * 100).toFixed(1)}` : "no count yet"}
          </span>
        </div>
        <Tiles items={items} selected={Object.keys(spend).filter((id) => spend[id] > 0)}
          onPick={kind === "spend" ? (id) => setSpend((s) => ({ ...s, [id]: s[id] ? 0 : 5 })) : undefined}
          foot={(d) => `${Math.round(d.p * 100)}${c.rival.includes(d.id) ? " · rival" : ""}`} />
      </section>

      <aside className="rail">
        <div className="panel">
          <div className="kicker">Three drafts</div>
          {c.drafts.map((d) => (
            <button key={d} className="opt2" aria-pressed={message === d} onClick={() => setMessage(d)}>{d}</button>
          ))}
        </div>

        <div className="panel">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={kind === "spend"} onClick={() => setKind("spend")}>Regions</button>
            <button role="tab" aria-selected={kind === "favor"} onClick={() => setKind("favor")}>{v.seat}</button>
          </div>
          {kind === "spend" ? (
            <>
              <p className="small muted">Two regions at most. Tap a tile, then set what it costs.</p>
              {Object.keys(spend).filter((id) => spend[id] > 0).map((id) => (
                <div key={id} className="row">
                  <span>{game.pack.regions.find((r) => r.id === id)?.name}</span>
                  {SPEND_STEPS.map((amount) => (
                    <button key={amount} className="opt" aria-pressed={spend[id] === amount}
                      onClick={() => setSpend((s) => ({ ...s, [id]: amount }))}>{amount}</button>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <select value={seat} onChange={(e) => setSeat(e.target.value)}>
              <option value="">Pick one</option>
              {game.members.filter((m) => m.faction !== game.faction).map((m) => (
                <option key={m.id} value={m.id}>{m.name} · {m.faction}</option>
              ))}
            </select>
          )}
          <ul className="gains">
            <li>This lever: <b className="num">+{(gain * 100).toFixed(2)}</b> on the mandate, {cost.chest ? `${cost.chest} from the chest` : `${cost.capital} ${v.capital}`}</li>
            <li className="muted">The other: <span className="num">+{(leverGain(game.pack as never, other) * 100).toFixed(2)}</span></li>
            <li className="muted small">Weighted by the pack's alpha, {game.pack.chamber.alpha.toFixed(2)} public to {(1 - game.pack.chamber.alpha).toFixed(2)} chamber.</li>
          </ul>
          <button className={`btn ${busy ? "busy" : ""}`} disabled={busy || !ready}
            onClick={() => act(() => api.campaign(game, message, lever))}>
            {busy ? "Counting" : n === CAMPAIGN_TURNS ? v.test : "Next"}
          </button>
        </div>
      </aside>
    </main>
  );
}
```

The `as never` casts on `leverCost` and `leverGain` are because the view's `game` and `pack` are the stripped types; both functions read only `stageB`/`escalations` and `chamber.alpha`/`regions`, which the view carries. If `tsc` accepts the honest types, drop the casts.

- [ ] **Step 3: Route it**

In `src/App.tsx`, beside the midterm branch: `: game.stage === "campaign" ? <Campaign game={game} act={act} busy={busy} />`.

- [ ] **Step 4: Style**

```css
.campaign .forecast { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.campaign .row { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
.campaign .row span { flex: 1 1 auto; }
.campaign .gains { list-style: none; padding: 0; margin: 12px 0; }
.campaign .opt { min-height: 44px; padding: 0 12px; border: 1.5px solid var(--ink); background: var(--paper); }
.campaign .opt[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
```

- [ ] **Step 5: See it work**

Play or replay to turn 21 against the dev Worker. Expected: three drafts appear on their own, tapping two tiles and setting 10 each shows a chest cost of 20 and a gain that is exactly `alpha x Σ weight x 0.04`, switching to the seat lever shows a gain of `(1 - alpha) x 0.3 / size` and a capital cost of 15 (or 22 under costly favors), the rival's two regions are named on their tiles, the band moves after each turn, and the fourth turn's button reads the pack's test word and lands on the test screen. Check 390 px.

- [ ] **Step 6: Commit**

```bash
git add src/Campaign.tsx src/App.tsx src/styles.css
git commit -m "Campaign turns with two levers and an honest band"
```

---

### Task 9: One full run, docs, memory

**Files:**
- Modify: `README.md`, `DESIGN.md`, `docs/experiments.md`, `.superpowers/sdd/.../progress.md`
- Memory: `/Users/deadpackets/.claude/projects/-Users-deadpackets-workspace-UnitedStatesOfJev/memory/united-states-of-jev-project.md`

- [ ] **Step 1: Full scripted run**

```bash
bunx wrangler dev --config ./wrangler.dev.jsonc --port 8799 &
sleep 8
bun scripts/term.ts http://127.0.0.1:8799 2>&1 | tee /tmp/stageb-term.log
```

Expected, all in one run: 20 turns, 10 posts, one midterm with a headline, 4 campaign turns with a band, the test, an ending, every request 200, no 5xx. Repeat once with the Germany scenario `1wybd8` and the SPD to prove a 25-seat chamber and a 16-region map.

- [ ] **Step 2: Full run in Chrome**

Take the Rome seat as the Liberators. Play to turn 10 with at least three posts, hold the midterm, keep playing to 20, run all four campaign turns, watch the reveal, then continue one term so `split_chamber`, `rival_surge`, `loud_opposition` or `apathy` can stack, and stop or lose. Fix what breaks; list anything left in the report under **Left for later**.

- [ ] **Step 3: Write the numbers down**

In `docs/experiments.md`, add a Stage B section with the measured figures from the two scripted runs: seconds and cost per post, per midterm, per campaign turn; reactions split by bloc on one partisan and one neutral post (v2 §16 experiment 1's target: bloc means differ by at least 0.2 on a partisan post); the intent move from a 10-unit spend (v2 §16 experiment 2's target: 0.03 to 0.06); and the campaign's forecast band against the drawn share at the test (v2 §16 experiment 4's shape).

- [ ] **Step 4: Docs**

`README.md`: the term now runs turns, Feed, midterm, campaign, test; the four new routes; the dev recipe with `wrangler.dev.jsonc`. `DESIGN.md`: the treemap and its choreography, the two campaign levers and the alpha weighting, the midterm swap, the Feed formula and which escalations bite where.

- [ ] **Step 5: Memory**

Append to the project memory file: Stage B landed on `any-polity`, the four Stage B escalations now have live hooks, the treemap reveal replaces the region list, replacement members live on the game and not the pack, and the dev-only `wrangler.dev.jsonc` recipe.

- [ ] **Step 6: Commit**

```bash
rm wrangler.dev.jsonc
git add README.md DESIGN.md docs/experiments.md
git commit -m "Stage B docs and measurements"
```

---

## Self-review

**Spec coverage.** v3 §7's four Stage B escalation keys: `split_chamber` Task 1 step 4 and its test, `rival_surge` Task 1 step 5 and Task 4 step 4, `loud_opposition` Task 1 step 3, `apathy` Task 1 step 6. v3 §11 Stage B contents: the Feed Tasks 1, 2, 4, 5; midterm night Tasks 1, 2, 3, 6; campaign turns Tasks 1, 2, 4, 8; the election-style reveal Task 7. v2 §7 midterm: the seeded third (`game.marks.midterm`, already seeded by Stage A's `newGame`), the hold probability, true-random draws, the swap with empty memory, the animated swaps with the bar recomputing, the wipeout ending, the half-term headline. v2 §8 campaign: three drafts from the record, up to two regions, 0/5/10, the rival's two weakest winnable regions, Jev `vote` with messages and spend, region intent as the weight-mean, a band rather than a point. v2 §9 election night: the draw is Stage A's `runTest`; the reveal is Task 7, with tiles in place of a US map, the count-up numeral, the 50% mark, the accent beat on a contradicted forecast, about 40 s, replay skippable. v2 §12 Feed: one post a turn, 240 characters, optional, Jev reactions, the approval formula per region, `hot` regions writing a member memory line, three replies plus the rival's post, the 50-citizen duel, a loss recorded for `rival-stunt`. v2 §13 catalog: `react`, `agree`, `vote` in Task 2's `worker/jev.ts`; `replies`, `messages`, `ending`-shaped `halfTerm` in Task 2's `worker/luna.ts`. v2 §14 API: `post`, `midterm`, `campaign` (plus `campaign/drafts`, which the spec's table implies but does not name). v2 §15 front end: the rail's Feed strip is a tab (owner's decision), midterm night, campaign with the map left and the rail right, election night full width. v2 §16 experiments: Task 9 step 3.

**Gaps accepted, each with its reason.** `rival-stunt`'s Director prerequisite has no `feed` ledger in `PackSchema`'s `Condition` grammar and the generator may not add effect types, so a lost duel is recorded on `post.won` and read by nothing in the deck: the card can still fire on its other prerequisites. Closing it properly means a new condition ledger in the pack schema, which is a schema change Stage B does not own. The three replies are written from the loudest personas by weight, not by "weight x share", because a citizen has one reaction, not a share count.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Every code step carries the code. Every test step carries the assertions and the command. The one deliberately conditional step is Task 8 step 1, which measures the bundle before choosing between an import and four copied constants, and names both branches.

**Type consistency.** `Post`, `MidtermDraw`, `Midterm`, `Replacement`, `Persona`, `Lever`, `CampaignTurn`, `Campaign`, `Reaction` are defined once in Task 1 and used with the same names in Tasks 2 to 8. `applyPost`, `runMidterm`, `replacements`, `applyMidterm`, `startCampaign`, `applyCampaign`, `leverCost`, `leverGain`, `rivalTargets`, `forecast`, `baseBlocs`, `midtermUp`, `regionIntent`, `holdP`, `lobbyCost` keep one spelling throughout. Jev keys are `react_`, `agree_`, `vote_`, read back by `choices(answers, "react_")`, `choices(answers, "agree_")` and `nouls(answers, "vote_")`, matching Stage A's `nouls`/`scores` prefix convention. `portraitSheet` is produced in Task 3 and used only there. `api.post`, `api.midterm`, `api.drafts`, `api.campaign` match the four routes. `Tiles`' `TileDatum` uses `weight`, which is what `squarify` sizes on, and both Task 7 and Task 8 build it the same way.
