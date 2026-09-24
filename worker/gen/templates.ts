import type { Storylet } from "../pack";

type Condition = NonNullable<Storylet["needs"]>[number];
type Effect = Storylet["results"][number];

// The v2 twenty (the-term-design §6). needs, scored and results are fixed here; Luna only writes title_hint,
// stances and memory. $bloc1..$bloc5 and $patron1..$patron10 are filled with the pack's own ids by slot.
export type Template = {
  id: string;
  note: string;
  stances: 1 | 2 | 3;
  needs: Condition[];
  scored: Storylet["scored"];
  results: Effect[];
};

export const TEMPLATES: Template[] = [
  {
    id: "strike",
    note: "the working people of the capital stop work",
    stances: 3,
    scored: ["blocs", "patrons"],
    needs: [{ ledger: "bloc", id: "$bloc2", op: "<", value: 0.4 }],
    results: [
      { ledger: "party", delta: -4 },
      { ledger: "approval", delta: -2 },
    ],
  },
  {
    id: "disaster",
    note: "a flood, storm, fire or quake hits three regions",
    stances: 3,
    scored: ["blocs"],
    needs: [{ ledger: "turn", op: ">", value: 2 }],
    results: [
      { ledger: "capital", delta: -5 },
      { ledger: "approval", delta: -6 },
    ],
  },
  {
    id: "leak",
    note: "papers about a member under investigation reach the press",
    stances: 3,
    scored: ["blocs"],
    needs: [],
    results: [
      { ledger: "party", delta: -6 },
      { ledger: "seat", set: "hostile", chance: 0.4 },
    ],
  },
  {
    id: "favor-called",
    note: "a member calls in the favor you promised weeks ago",
    stances: 2,
    scored: ["none"],
    needs: [],
    results: [
      { ledger: "capital", delta: -10 },
      { ledger: "seat", set: "kept-word" },
    ],
  },
  {
    id: "primary-threat",
    note: "your own faction lines up a challenger against you",
    stances: 2,
    scored: ["blocs"],
    needs: [{ ledger: "party", op: "<", value: 35 }],
    results: [
      { ledger: "capital", delta: -15 },
      { ledger: "party", delta: 15 },
    ],
  },
  {
    id: "recession",
    note: "trade and wages fall and the treasury feels it",
    stances: 3,
    scored: ["blocs", "patrons"],
    needs: [
      { ledger: "turn", op: ">", value: 6 },
      { ledger: "bloc", id: "$bloc1", op: "<", value: 0.45 },
    ],
    results: [
      { ledger: "approval", delta: -5 },
      { ledger: "chest", delta: -5 },
    ],
  },
  {
    id: "veto-bait",
    note: "a law you passed is challenged as beyond your power",
    stances: 2,
    scored: ["blocs"],
    needs: [],
    results: [
      { ledger: "capital", delta: -5, chance: 0.5 },
      { ledger: "chest", delta: -5 },
    ],
  },
  {
    id: "scandal-ally",
    note: "an ally in your own faction is caught out in public",
    stances: 2,
    scored: ["blocs"],
    needs: [],
    results: [
      { ledger: "party", delta: 4 },
      { ledger: "approval", delta: -2 },
    ],
  },
  {
    id: "foreign",
    note: "a neighbour or rival power forces a decision",
    stances: 3,
    scored: ["blocs", "patrons"],
    needs: [{ ledger: "turn", op: ">", value: 4 }],
    results: [
      { ledger: "approval", delta: -3 },
      { ledger: "capital", delta: -5 },
    ],
  },
  {
    id: "shutdown",
    note: "the money runs out and the chamber will not vote it",
    stances: 2,
    scored: ["blocs"],
    needs: [{ ledger: "capital", op: "<", value: 30 }],
    results: [
      { ledger: "capital", delta: 15 },
      { ledger: "party", delta: -8 },
    ],
  },
  {
    id: "endorsement",
    note: "a famous name offers to back you in public",
    stances: 2,
    scored: ["blocs"],
    needs: [{ ledger: "streak", op: ">", value: 2 }],
    results: [{ ledger: "chest", delta: 10 }],
  },
  {
    id: "poll-shock",
    note: "your standing falls hard in one week and the staff want blood",
    stances: 2,
    scored: ["none"],
    needs: [],
    results: [{ ledger: "party", delta: 3 }],
  },
  {
    id: "relief-goodwill",
    note: "a member offers you their vote without being asked",
    stances: 1,
    scored: ["none"],
    needs: [],
    results: [{ ledger: "seat", set: "favor" }],
  },
  {
    id: "relief-windfall",
    note: "money or good news arrives from somewhere else",
    stances: 1,
    scored: ["none"],
    needs: [],
    results: [
      { ledger: "chest", delta: 8 },
      { ledger: "capital", delta: 10 },
    ],
  },
  {
    id: "relief-quiet",
    note: "nothing much happens and the press writes something soft",
    stances: 1,
    scored: ["none"],
    needs: [],
    results: [{ ledger: "approval", delta: 2 }],
  },
  {
    id: "rival-stunt",
    note: "your rival stages something in public and it lands",
    stances: 2,
    scored: ["blocs"],
    needs: [{ ledger: "turn", op: ">", value: 3 }],
    results: [{ ledger: "approval", delta: -2 }],
  },
  {
    id: "patron-ultimatum",
    note: "a patron you have crossed makes a demand",
    stances: 2,
    scored: ["patrons"],
    needs: [{ ledger: "patron", id: "$patron1", op: "<", value: -1 }],
    results: [
      { ledger: "patron", id: "$patron1", delta: 2 },
      { ledger: "chest", delta: -5 },
    ],
  },
  {
    id: "whistleblower",
    note: "someone inside the government tells the public what it does",
    stances: 2,
    scored: ["blocs"],
    needs: [{ ledger: "turn", op: ">", value: 8 }],
    results: [
      { ledger: "approval", delta: 2 },
      { ledger: "party", delta: -4 },
    ],
  },
  {
    id: "flip-offer",
    note: "a member of the opposition is close enough to be bought",
    stances: 2,
    scored: ["none"],
    needs: [],
    results: [
      { ledger: "capital", delta: -10 },
      { ledger: "seat", set: "courted" },
    ],
  },
  {
    id: "lame-duck",
    note: "late in the term the obituaries of your rule are already written",
    stances: 1,
    scored: ["none"],
    needs: [
      { ledger: "turn", op: ">", value: 17 },
      { ledger: "approval", op: "<", value: 42 },
    ],
    results: [],
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id) as [string, ...string[]];
