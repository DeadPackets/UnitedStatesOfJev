import { ESCALATION_KEYS, FILLS, FONT_PAIRS, LAYOUTS } from "../pack";
import type { Facts } from "./facts";
import type { Frame } from "./frame";

// Test-only: the smallest frame that passes every validator, for the tests to break one field at a time.
const n = (i: number) => String(i + 1).padStart(2, "0");

export function mkFrame(over: Partial<Frame> = {}): Frame {
  const tags = Array.from({ length: 16 }, (_, i) => `tag-${n(i)}`);
  const factions = [
    { id: "reds", name: "Red Party", short: "RED", color: "#aa2222", fill: FILLS[0], ideology: "land reform", leader: "Aulus Red", seats: 50 },
    { id: "blues", name: "Blue Party", short: "BLU", color: "#2222aa", fill: FILLS[1], ideology: "trade first", leader: "Bella Blue", seats: 30 },
    { id: "greys", name: "Grey Bloc", short: "GRY", color: "#666666", fill: FILLS[2], ideology: "the old order", leader: "Cato Grey", seats: 20 },
  ];
  const weights = [0.3, 0.2, 0.2, 0.1, 0.1, 0.1];
  return {
    title: "The Council", era: "1920s", place: "Harbor", description: "A council of the harbor city.", content_note: null,
    vocabulary: {
      seat: "seat", chamber: "council", member: "councilor", bill: "motion", pass: "carried", fail: "lost", capital: "standing",
      turn: "week", midterm: "canvass", campaign: "canvass", test: "vote of confidence", feed: "the papers", post: "notice",
      whip: "count", lobby: "favor", promise: "pledge", patron: "backer", approval: "standing",
    },
    theme: { fonts: FONT_PAIRS[0], ink: "#111111", paper: "#f4f1e8", accent: "#aa2222", texture: "newsprint", ornament: "rule", layout: LAYOUTS[0] },
    chamber: { size: 100, threshold: 51, supermajority: 67, alpha: 0.4, veto: null },
    factions,
    regions: weights.map((w, i) => ({ id: `r${n(i)}`, name: `Region ${n(i)}`, weight: w, lean: factions.map((f) => ({ id: f.id, value: 0.1 })) })),
    blocs: Array.from({ length: 5 }, (_, i) => ({ id: `b${n(i)}`, name: `Bloc ${n(i)}`, description: "a group of voters" })),
    patrons: Array.from({ length: 10 }, (_, i) => ({ id: `p${n(i)}`, name: `Patron ${n(i)}`, wants: [tags[i]], hates: [tags[15 - i]] })),
    tags,
    problems: Array.from({ length: 8 }, (_, i) => `Problem ${n(i)}`),
    promises: Array.from({ length: 8 }, (_, i) => ({ tag: tags[i], label: `Pledge ${n(i)}` })),
    starts: factions.map((f) => ({ faction: f.id, seat_title: "Consul", coalition: [f.id], premise: "You hold the chair. The harbor is restless.", party: 50, capital: 50, hostile: [] })),
    test: { name: "vote of confidence", win: "You keep the chair.", lose: "You lose the chair.", reveal: "seats" },
    endings: { reelected: "Kept", defeated: "Turned out", lame_duck: "Ignored", impeached: "Removed" },
    lobby: {
      pork: { cost: 10, label: "Promise a project", text: "A new warehouse for the district." },
      favor: { cost: 15, label: "Trade a favor", text: "Back their petition next week." },
      threat: { cost: 20, label: "Threaten a challenger", text: "Back a rival at the next canvass." },
    },
    escalations: ESCALATION_KEYS.map((k) => ({ key: k, name: k.replace(/_/g, " "), headline: `The ${k.replace(/_/g, " ")} sets in.` })),
    start_date: "1921-03-01",
    ...over,
  };
}

export const mkFacts = (over: Partial<Facts> = {}): Facts => ({
  people: [
    { name: "Aulus Red", role: "party leader", born: "1870", died: null, alive_on_start_date: true },
    { name: "Bella Blue", role: "party leader", born: "1875", died: null, alive_on_start_date: true },
    { name: "Cato Grey", role: "party leader", born: "1860", died: null, alive_on_start_date: true },
  ],
  bodies: [{ name: "The Council", size: 100, how_chosen: "elected" }],
  groupings: [],
  dated_events: [{ date: "1921-06-14", title: "The harbor strike" }],
  anchor: 0,
  ...over,
});
