import type { GameView } from "../../src/api";
import type { BotAct, Verb } from "./api";

export type Policy = { name: string; style: boolean; acts(g: GameView, rnd: () => number): BotAct[] };

export const STYLES = ["strongman", "populist", "broker", "idealist"];

// R23: the median run of a style must end by that style's own failure, not by a shared one.
export const OWN_FAILURE: Record<string, string[]> = {
  strongman: ["coup", "impeached"],
  populist: ["defeated", "lame_duck"],
  broker: ["defeated"],
  idealist: ["impeached", "defeated"],
};

/** A seeded generator, so a bot run with the same seed replays act for act. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Era-neutral and place-neutral, so the plausibility gate takes them in any polity. Three of each, cycled.
const WORKS = [
  "Repair the roads, the water supply and the public buildings, and publish the accounts of the works each month.",
  "Fund the supply of food and fuel for the coming year out of the treasury, and fix the duties charged on what is brought in.",
  "Set new rules for the officials who govern: fixed terms, published accounts, and a court that hears claims of extortion.",
];
const ORDERS = [
  "Order the public granaries opened and the price of bread held at last year's figure until the harvest is in.",
  "Order every office of the government to publish its accounts within the month, and suspend any officer who does not.",
  "Order a general levy on the largest estates to pay for the repair of the roads and the water supply.",
];
const POSTS = [
  "The roads, the water and the public buildings get fixed this year, and the accounts of every work go up in public each month. Read them.",
  "Food and fuel for the coming year are paid for out of the treasury, and the duties are fixed. No family here eats worse because a merchant found a price.",
  "An official who robs the public will answer for it in a court, with a fixed term and published books. The people who fear that rule are telling you who they are.",
];
const pick = <T,>(xs: T[], n: number) => xs[Math.abs(n) % xs.length];

const can = (g: GameView, v: Verb) => {
  const i = (g as never as { instruments?: Partial<Record<Verb, { available: boolean; affordable?: boolean }>> }).instruments?.[v];
  return !!i?.available && i.affordable !== false;
};
const holders = (g: GameView) => (g as never as { holders?: { id: string; name: string; support: number; line: number; weight: number }[] }).holders ?? [];
const nearestLine = (g: GameView) => holders(g).slice().sort((a, b) => (a.support - a.line) - (b.support - b.line))[0];
const heaviest = (g: GameView) => holders(g).slice().sort((a, b) => b.weight - a.weight)[0];
const weakestRegion = (g: GameView) => {
  const pop = (g as never as { regions?: Record<string, number> }).regions ?? {};
  return Object.entries(pop).sort((a, b) => a[1] - b[1])[0]?.[0];
};
// Stage B's price call takes a memberId and nothing else: every other target is named in the text itself.
const regionName = (g: GameView, id: string | undefined) => g.pack.regions.find((r) => r.id === id)?.name ?? "the region that needs it most";
const firstMember = (g: GameView) => g.members[0]?.id;
const firstAvailable = (g: GameView, vs: Verb[]) => vs.find((v) => can(g, v));

export const POLICIES: Policy[] = [
  {
    name: "random", style: false,
    acts(g, rnd) {
      const open: Verb[] = (["decree", "law", "appoint", "spend", "proclaim", "favour", "force"] as Verb[]).filter((v) => can(g, v));
      const verb = open[Math.floor(rnd() * open.length)] ?? "proclaim";
      const text = verb === "proclaim" ? pick(POSTS, Math.floor(rnd() * 3)) : verb === "law" ? pick(WORKS, Math.floor(rnd() * 3)) : pick(ORDERS, Math.floor(rnd() * 3));
      return [{ verb, text }];
    },
  },
  {
    name: "greedy", style: false,
    // One step of popularity and nothing else: no promise tracking, no holder tracking (challenge-design §4).
    acts(g) {
      const out: BotAct[] = [];
      if (can(g, "proclaim")) out.push({ verb: "proclaim", text: pick(POSTS, g.turn) });
      const region = weakestRegion(g);
      if (can(g, "spend") && region) out.push({ verb: "spend", text: `Send relief to ${regionName(g, region)}, where the need is plainest.` });
      return out.length ? out : [{ verb: firstAvailable(g, ["law", "decree"]) ?? "law", text: pick(WORKS, g.turn) }];
    },
  },
  {
    name: "strongman", style: true,
    acts(g) {
      const out: BotAct[] = [];
      if (can(g, "appoint") && g.turn === 1) out.push({ verb: "appoint", text: "Put a loyal officer at the head of the security service." });
      if (can(g, "decree")) out.push({ verb: "decree", text: pick(ORDERS, g.turn) });
      const over = holders(g).find((h) => h.support < h.line);
      if (over && can(g, "force")) out.push({ verb: "force", text: `Put a curfew on the districts where ${over.name} will not settle.` });
      return out.length ? out : [{ verb: firstAvailable(g, ["law", "proclaim"]) ?? "law", text: pick(WORKS, g.turn) }];
    },
  },
  {
    name: "populist", style: true,
    acts(g) {
      const out: BotAct[] = [];
      if (can(g, "proclaim")) out.push({ verb: "proclaim", text: pick(POSTS, g.turn) });
      const region = weakestRegion(g);
      if (can(g, "spend") && region) out.push({ verb: "spend", text: `Pay relief straight to the households of ${regionName(g, region)}.` });
      if (can(g, "decree") && g.turn % 4 === 0) out.push({ verb: "decree", text: pick(ORDERS, g.turn) });
      return out.length ? out : [{ verb: "law", text: pick(WORKS, g.turn) }];
    },
  },
  {
    name: "broker", style: true,
    acts(g) {
      const out: BotAct[] = [];
      const near = nearestLine(g);
      const member = firstMember(g);
      if (near && member && can(g, "favour")) out.push({ verb: "favour", text: `A place at the table and a share of the works, for a vote with ${near.name}.`, memberId: member });
      if (can(g, "law")) out.push({ verb: "law", text: pick(WORKS, g.turn) });
      const big = heaviest(g);
      if (big && can(g, "appoint") && g.turn % 6 === 0) out.push({ verb: "appoint", text: `Give the post to ${big.name}, which holds the most weight of any of them.` });
      return out.length ? out : [{ verb: "proclaim", text: pick(POSTS, g.turn) }];
    },
  },
  {
    name: "idealist", style: true,
    // Keeps the promises, never takes the two verbs that buy consent by force.
    acts(g) {
      const pending = Object.entries(g.promises ?? {}).find(([, p]) => (p as { state: string }).state === "pending");
      const out: BotAct[] = [];
      if (can(g, "law")) out.push({ verb: "law", text: pending ? `Write into law what was promised: ${(pending[1] as { label: string }).label}.` : pick(WORKS, g.turn) });
      if (can(g, "proclaim")) out.push({ verb: "proclaim", text: pick(POSTS, g.turn) });
      return out.length ? out : [{ verb: "spend", text: `Send relief to ${regionName(g, weakestRegion(g))}, where the need is plainest.` }];
    },
  },
];
