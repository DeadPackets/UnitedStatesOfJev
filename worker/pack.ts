import { z } from "zod";
import { TEMPERAMENTS } from "./engine";

export const FONT_PAIRS = [
  "Big Shoulders Display + Public Sans",
  "Playfair Display + Source Sans 3",
  "Cinzel + EB Garamond",
  "Space Grotesk + IBM Plex Sans",
  "Fraunces + Inter",
  "Oswald + Lora",
  "Cormorant Garamond + Work Sans",
  "Archivo Black + Archivo",
] as const;
export const FILLS = ["solid", "hatch", "hatch2", "cross", "dots", "rings", "hollow", "half", "wave", "grid", "brick", "check"] as const;
export const LAYOUTS = ["hemicycle", "benches", "horseshoe", "circle", "classroom", "court"] as const;
export const ESCALATION_KEYS = [
  "hostile_press", "supermajority_era", "recession", "scandal_season", "short_fuse",
  "split_chamber", "costly_favors", "fickle_base", "empty_chest", "hostile_court",
  "rival_surge", "apathy", "defections", "loud_opposition", "crisis_fatigue",
  "leaks", "war_footing", "famine", "succession_crisis", "foreign_meddling",
] as const;
export const VERBS = ["decree", "law", "appoint", "spend", "proclaim", "favour", "force"] as const;
export const HOLDER_RESPONSES = ["early_test", "coup", "strike", "refuse_levy", "riot", "excommunicate", "embargo", "none"] as const;
export const CONSENTS = ["none", "chamber", "chamber_supermajority", "army"] as const;
// A new list: pack.ts's LEDGERS is the storylet effect target enum and every stored deck depends on it.
export const LEDGERS_V4 = ["treasury", "authority", "chest", "loyalty", "popularity"] as const;

const SEAT_FLAGS = ["veto", "army", "clergy", "court", "crown"] as const;
const YEARS = ["new", "mid", "long"] as const;
export const GENDERS = ["woman", "man"] as const;
const LEDGERS = ["approval", "capital", "party", "chest", "bloc", "patron", "streak", "turn"] as const;

const IdNum = z.object({ id: z.string(), value: z.number() });
const IdStr = z.object({ id: z.string(), value: z.string() });
const LobbyText = z.object({ cost: z.number(), label: z.string(), text: z.string() });

const FactionSchema = z.object({
  id: z.string(), name: z.string(), short: z.string(), color: z.string(),
  fill: z.enum(FILLS), ideology: z.string(), leader: z.string(),
});
const RegionSchema = z.object({ id: z.string(), name: z.string(), weight: z.number(), lean: z.array(IdNum) });
const BlocSchema = z.object({ id: z.string(), name: z.string(), description: z.string() });
const PatronSchema = z.object({ id: z.string(), name: z.string(), wants: z.array(z.string()), hates: z.array(z.string()) });
const PriceSchema = z.object({
  authority: z.number().default(0), treasury: z.number().default(0), chest: z.number().default(0),
});
const InstrumentSchema = z.object({
  name: z.string(), consent: z.enum(CONSENTS), price: PriceSchema, available: z.boolean(),
});
const HolderSchema = z.object({
  id: z.string(), name: z.string(), where: z.enum(["home", "abroad"]),
  persona: z.object({ name: z.string(), role: z.string(), bio: z.string(), tell: z.string() }),
  members: z.enum(["seats", "citizens", "patrons", "blocs", "none"]).default("none"),
  stance: z.number().min(0).max(1).default(0.5),
  line: z.number().min(1).max(100),
  response: z.enum(HOLDER_RESPONSES),
  levers: z.array(z.enum(VERBS)).default([]),
  wants: z.array(z.string()).default([]),
  redLines: z.array(z.string()).default([]),
  gives: z.object({ ledger: z.enum(["treasury", "chest"]), amount: z.number(), per: z.enum(["turn", "once"]) }).nullable().default(null),
  responses: z.array(z.string()).default([]),
});
// R24: what a pack stores beyond what the generator writes. A holder with `support` has a support line; one
// without it is a pack from before R24, whose stance and resistance line the engine maps on load.
const HolderReadSchema = HolderSchema.extend({
  support: z.number().min(0).max(100).optional(),
});
const LedgerNameSchema = z.object({ name: z.string(), line: z.number() });

export const ConstitutionSchema = z.object({
  ruler: z.object({ role: z.string(), faction: z.string() }),
  holders: z.array(HolderSchema).min(3).max(10),
  instruments: z.object({
    decree: InstrumentSchema, law: InstrumentSchema, appoint: InstrumentSchema, spend: InstrumentSchema,
    proclaim: InstrumentSchema, favour: InstrumentSchema, force: InstrumentSchema,
  }),
  retention: z.object({
    name: z.string(),
    weights: z.array(IdNum).default([]),
    bar: z.object({
      start: z.number().min(0).max(1).default(0.5),
      step: z.number().min(0).max(0.2).default(0.03),
      cap: z.number().min(0).max(1).default(0.7),
    }).default({ start: 0.5, step: 0.03, cap: 0.7 }),
  }),
  halfTerm: z.object({ holder: z.string(), name: z.string() }),
  ledgers: z.object({
    treasury: LedgerNameSchema, authority: LedgerNameSchema, chest: LedgerNameSchema,
    loyalty: LedgerNameSchema, popularity: LedgerNameSchema,
  }),
  briefing: z.object({ situation: z.string(), room: z.string(), you: z.string() }),
});
// What the engine reads. ConstitutionSchema above stays the generator's strict output shape (every key required).
const PackConstitutionSchema = ConstitutionSchema.extend({
  holders: z.array(HolderReadSchema).min(3).max(10),
  publicGroup: z.string().optional(),   // R24: the holder whose support by region was popularity
  ownGroup: z.string().optional(),      // R24: the holder whose support was loyalty
  ledgers: z.object({
    treasury: LedgerNameSchema, authority: LedgerNameSchema, chest: LedgerNameSchema,
    loyalty: LedgerNameSchema.optional(), popularity: LedgerNameSchema.optional(),
  }),
});
const MemberSchema = z.object({
  id: z.string(), seat: z.string(), region: z.string(), faction: z.string(), name: z.string(), bio: z.string(),
  core_issues: z.array(z.string()), temperament: z.enum(TEMPERAMENTS), tell: z.string(), patrons: z.array(z.string()),
  years: z.enum(YEARS), flags: z.array(z.enum(SEAT_FLAGS)), portrait: z.string(),
  // Optional: packs stored before names carried them are re-validated on read.
  gender: z.enum(GENDERS).optional(), look: z.string().optional(),
});
const CitizenSchema = z.object({
  id: z.string(), region: z.string(), bloc: z.string(), name: z.string(), age: z.number(), job: z.string(), town: z.string(),
  worldview: z.string(), issues: z.tuple([z.string(), z.string()]), weight: z.number(),
});
const StartSchema = z.object({
  faction: z.string(), seat_title: z.string(), coalition: z.array(z.string()), premise: z.string(),
  party: z.number(), capital: z.number(), hostile: z.array(z.string()).nullable().optional(),
});
const ConditionSchema = z.object({
  ledger: z.enum(LEDGERS), id: z.string().nullable().optional(), op: z.enum(["<", ">"]), value: z.number(),
});
const EffectSchema = z.object({
  ledger: z.enum([...LEDGERS, "seat"]), id: z.string().nullable().optional(), delta: z.number().nullable().optional(),
  set: z.string().nullable().optional(), chance: z.number().nullable().optional(),
});
// Signed ISO day: a BC year is negative and every part is zero-padded, e.g. -0044-03-15.
export const DATE_RE = /^-?\d{1,6}-\d{2}-\d{2}$/;
const StoryletSchema = z.object({
  id: z.string(), kind: z.enum(["generic", "dated", "swan", "foreign"]), turn: z.number().nullable().optional(),
  date: z.string().regex(DATE_RE).nullable().optional(),
  exogenous: z.boolean().nullable().optional(), needs: z.array(ConditionSchema).nullable().optional(),
  weight: z.number(), title_hint: z.string(), stances: z.array(z.string()),
  scored: z.array(z.enum(["blocs", "patrons", "none"])), results: z.array(EffectSchema), memory: z.string().nullable().optional(),
});

export const PackSchema = z.object({
  v: z.literal(1), id: z.string(), lang: z.string(), prompt: z.string(),
  title: z.string(), era: z.string(), place: z.string(), description: z.string(),
  fiction: z.boolean(), sources: z.array(z.object({ title: z.string(), url: z.string() })),
  content_note: z.string().nullable().optional(),
  vocabulary: z.object({
    seat: z.string(), chamber: z.string(), member: z.string(), bill: z.string(), pass: z.string(), fail: z.string(),
    capital: z.string(), turn: z.string(), midterm: z.string(), campaign: z.string(), test: z.string(), feed: z.string(),
    post: z.string(), whip: z.string(), lobby: z.string(), promise: z.string(), patron: z.string(), approval: z.string(),
  }),
  theme: z.object({
    fonts: z.enum(FONT_PAIRS), ink: z.string(), paper: z.string(), accent: z.string(),
    texture: z.enum(["newsprint", "parchment", "concrete", "steel", "none"]),
    ornament: z.enum(["laurel", "eagle", "star", "crescent", "cross", "gear", "rule", "none"]),
    layout: z.enum(LAYOUTS),
  }),
  chamber: z.object({
    size: z.number(), threshold: z.number(), supermajority: z.number(), alpha: z.number().min(0).max(1),
    veto: z.object({ flag: z.enum(SEAT_FLAGS), text: z.string() }).nullable().optional(),
  }),
  calendar: z.object({ start_date: z.string(), unit: z.enum(["day", "week", "month", "season"]) }),
  factions: z.array(FactionSchema).min(2).max(12),
  regions: z.array(RegionSchema).min(6).max(60),
  blocs: z.array(BlocSchema).length(5),
  patrons: z.array(PatronSchema).length(10),
  members: z.array(MemberSchema),
  citizens: z.array(CitizenSchema).length(250),
  starts: z.array(StartSchema),
  problems: z.array(z.string()).min(8).max(12),
  promises: z.array(z.object({ tag: z.string(), label: z.string() })).length(8),
  tags: z.array(z.string()).min(16).max(24),
  deck: z.array(StoryletSchema).min(20),
  escalations: z.array(z.object({ key: z.enum(ESCALATION_KEYS), name: z.string(), headline: z.string() })).length(20)
    .refine((a) => new Set(a.map((e) => e.key)).size === 20),
  test: z.object({ name: z.string(), win: z.string(), lose: z.string(), reveal: z.enum(["regions", "seats", "both"]) }),
  endings: z.object({
    reelected: z.string(), defeated: z.string(), lame_duck: z.string(), impeached: z.string(),
    coup: z.string().nullable().optional(), stopped: z.string().nullable().optional(),
  }),
  lobby: z.object({ pork: LobbyText, favor: LobbyText, threat: LobbyText }),
  // portraits: one entry per contact sheet, "done" or "failed"; the client polls it and stops when none are pending.
  art: z.object({ masthead: z.string(), crests: z.array(IdStr), portraits: z.array(IdStr).default([]) }),
  constitution: PackConstitutionSchema.optional(),
}).refine((p) => p.members.length === p.chamber.size, "members must equal chamber.size")
  .refine((p) => p.starts.length === p.factions.length, "one start per faction")
  .refine((p) => p.starts.every((s, i) => s.faction === p.factions[i].id), "starts must follow factions order");

export type Pack = z.infer<typeof PackSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Citizen = z.infer<typeof CitizenSchema>;
export type Faction = z.infer<typeof FactionSchema>;
export type Region = z.infer<typeof RegionSchema>;
export type Storylet = z.infer<typeof StoryletSchema>;
export type Verb = (typeof VERBS)[number];
export type HolderResponse = (typeof HOLDER_RESPONSES)[number];
export type Consent = (typeof CONSENTS)[number];
export type LedgerV4 = (typeof LEDGERS_V4)[number];
export type Constitution = z.infer<typeof ConstitutionSchema>;
export type Holder = z.infer<typeof HolderReadSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type Price = z.infer<typeof PriceSchema>;

// Largest remainder method, minimum one seat per faction that held any share.
export function scaleSeats(shares: Record<string, number>, size: number): Record<string, number> {
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  const keys = Object.keys(shares);
  const quotas = new Map(keys.map((k) => [k, (shares[k] / total) * size]));
  const seats = new Map(keys.map((k) => [k, Math.max(Math.floor(quotas.get(k)!), shares[k] > 0 ? 1 : 0)]));
  let over = [...seats.values()].reduce((a, b) => a + b, 0) - size;
  while (over > 0) {
    const [maxKey] = [...seats.entries()].filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1])[0];
    seats.set(maxKey, seats.get(maxKey)! - 1);
    over--;
  }
  let remaining = size - [...seats.values()].reduce((a, b) => a + b, 0);
  const ranked = [...keys].sort((a, b) => {
    const remA = quotas.get(a)! - Math.floor(quotas.get(a)!), remB = quotas.get(b)! - Math.floor(quotas.get(b)!);
    return remB - remA;
  });
  for (const k of ranked) {
    if (remaining <= 0) break;
    seats.set(k, seats.get(k)! + 1);
    remaining--;
  }
  return Object.fromEntries(seats);
}

// Client-facing view: drops citizens, the deck and member personas (bio, tell) so no spoilers leave the Worker.
export function packView(pack: Pack) {
  const { citizens, deck, ...rest } = pack;
  return {
    ...rest,
    members: rest.members.map(({ bio, tell, ...m }) => m),
    constitution: rest.constitution && {
      ...rest.constitution,
      holders: rest.constitution.holders.map((h) => ({ ...h, persona: { name: h.persona.name, role: h.persona.role } })),
    },
  };
}

export type PackView = ReturnType<typeof packView>;
