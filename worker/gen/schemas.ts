// What every generation call returns and the merged world those answers build: the research plan, the roster and its
// repair patch, the world bible, each world part, the lint rewrite and the emblem calls. zod checks every answer before
// code reads it, and .describe() carries a field's rule into the JSON Schema the model sees. Two small helpers read the
// roster and a card row the same way in every stage.
import { z } from "zod";
import {
  ESCALATION_KEYS,
  GlanceSchema,
  HOLDER_RESPONSES,
  LINE_ICONS,
  RESOURCE_ICONS,
  type Glance,
} from "../pack";
import { ColourSchema, ThemeTokensSchema } from "../tokens";

const phrase = z.string();
const whole = z.number().int();

export const PlanSchema = z.object({
  kind: whole.min(1).max(14),
  prompt_seat: phrase
    .nullable()
    .describe(
      "The seat, office or person the prompt names as the player's, copied from the prompt; null when it names none.",
    ),
  seat: z.object({ office: phrase, holder: phrase.nullable(), holder_wiki: phrase.nullable() }),
  start_date: phrase,
  turn_length: phrase,
  term_end: phrase,
  above: z.array(z.object({ name: phrase, power: phrase })),
  grounding_line: phrase,
  divergence: phrase.nullable(),
  home_places: z.array(phrase),
  lookups: z.array(phrase),
  conflicts: z.array(phrase),
  categories: z.array(phrase),
  canon: z.object({ host: phrase, titles: z.array(phrase) }).nullable(),
  analogues: z.array(phrase),
  people: z.array(phrase),
  keywords: z.array(phrase),
});
export type Plan = z.infer<typeof PlanSchema>;

export const GROUP_TYPES = [
  "party",
  "armed",
  "body",
  "foreign",
  "bloc",
  "crown",
  "clergy",
  "people",
  "caste",
  "kin",
  "role",
] as const;
export const GROUNDINGS = [
  "record",
  "canon",
  "analogue",
  "biology",
  "anthropology",
  "divergent",
  "premise",
] as const;

export const GroupSchema = z.object({
  id: phrase,
  name: phrase,
  kind: z.enum(["actor", "public"]),
  wiki: phrase.nullable(),
  type: z.enum(GROUP_TYPES),
  doc: whole.nullable(),
  quote: phrase.nullable(),
  grounding: z.enum(GROUNDINGS),
  descends_from: phrase.nullable(),
  founded: phrase.nullable(),
  dissolved: phrase.nullable(),
  sits: z.enum(["home", "abroad"]),
  sits_where: phrase,
  seats: whole.nullable(),
  seats_doc: whole.nullable(),
  seats_quote: phrase.nullable(),
  vote_share: z.number(),
  veto: z.boolean(),
  can_dismiss: z.boolean(),
  support: whole,
  support_why: phrase,
  wants: phrase,
  rival: phrase,
});
export type Group = z.infer<typeof GroupSchema>;

export const RosterSchema = z.object({
  grounding_line: phrase,
  ruler: z.object({
    name: phrase.nullable(),
    office: phrase,
    wiki: phrase.nullable(),
    start_date: phrase,
    doc: whole.nullable(),
    quote: phrase.nullable(),
    above: phrase.nullable(),
    removed_by: phrase,
    own_group: phrase.describe(
      "The id of the player's own side; when that party sits in the chamber, its bloc's row.",
    ),
    backer: phrase
      .nullable()
      .describe(
        "The id of the home group without seats whose backing keeps the ruler in the seat day to day, or null.",
      ),
  }),
  fall: z
    .object({ date: phrase, what: phrase, doc: whole.nullable(), quote: phrase.nullable() })
    .nullable(),
  chamber: z
    .object({
      name: phrase,
      real_size: whole,
      as_of: phrase,
      doc: whole.nullable(),
      quote: phrase.nullable(),
    })
    .nullable(),
  groups: z.array(GroupSchema),
  excluded: z.array(z.object({ name: phrase, why: phrase })),
});
export type Roster = z.infer<typeof RosterSchema>;

export const RosterPatchSchema = z.object({
  groups: z.array(GroupSchema),
  remove: z
    .array(phrase)
    .describe(
      "Ids of groups to take out, only to fix a C15 failure; add each one to excluded with its reason.",
    ),
  excluded: RosterSchema.shape.excluded,
  ruler: RosterSchema.shape.ruler.nullable(),
  fall: RosterSchema.shape.fall,
  fall_clear: z.boolean(),
  chamber: RosterSchema.shape.chamber,
  chamber_clear: z.boolean(),
});
export type RosterPatch = z.infer<typeof RosterPatchSchema>;

export const VocabularySchema = z.object({
  seat: phrase.describe("the player's office as a noun: President, King, Grand Vizier"),
  chamber: phrase.describe("the body that votes on laws, or the court when none does"),
  member: phrase,
  bill: phrase,
  pass: phrase,
  fail: phrase,
  capital: phrase.describe("political capital: authority, favour, standing"),
  turn: phrase.describe("one turn: week, moon, day"),
  midterm: phrase.describe("the half-term test's name"),
  campaign: phrase,
  test: phrase.describe("the end-of-term test: an election, a confidence vote, the clear-out"),
  feed: phrase.describe("where public talk happens: the press, the forum, the market square"),
  post: phrase.describe("one public message the player sends"),
  whip: phrase,
  lobby: phrase,
  promise: phrase,
  patron: phrase,
  approval: phrase.describe("public support"),
  file: phrase.describe(
    "what this world calls a file on a group, at most 18 characters: Senate file, Herald's roll",
  ),
  abroad: phrase
    .nullable()
    .describe(
      "this world's own words for abroad, lower case, at most 22 characters (beyond the domes); null when abroad fits",
    ),
});

export const BibleSchema = z.object({
  house_voice: phrase,
  tone: z.array(phrase),
  grounding: phrase,
  title: phrase,
  era: phrase,
  place: phrase,
  year: z.number(),
  vocabulary: VocabularySchema,
  terms: z.array(
    z.object({
      term: phrase,
      meaning: phrase,
      aliases: z
        .array(phrase)
        .describe(
          "other names the documents use for it; every part writes the term, never an alias",
        ),
    }),
  ),
  history: z.array(z.object({ date: phrase, beat: phrase })),
  groups: z.array(
    z.object({
      id: phrase,
      name: phrase,
      short: phrase,
      identity: phrase,
      face: phrase,
      face_role: phrase,
    }),
  ),
  regions: z.array(z.object({ id: phrase, name: phrase })),
});
export type Bible = z.infer<typeof BibleSchema>;

const Tag = phrase.describe(
  "1 to 3 words an act would do, decidable from its text: Relief checks, Tax the lords",
);
const CardFields = {
  wants: z.array(Tag).describe("2 or 3 acts the group wants"),
  hates: z
    .array(z.object({ tag: Tag, red_line: z.boolean() }))
    .describe(
      "2 or 3 acts it fights, exactly one with red_line true; the tag Bribes for a group that takes no money",
    ),
  strike: phrase.describe(
    "what it does when it turns on the player, one short line in the third person",
  ),
};
export const GroupRowSchema = z.object({
  id: phrase,
  icon: z.enum(LINE_ICONS),
  color: ColourSchema,
  line: whole,
  response: z.enum(HOLDER_RESPONSES),
  ...CardFields,
});
export type GroupRow = z.infer<typeof GroupRowSchema>;
export const FactionRowSchema = z.object({
  id: phrase,
  color: ColourSchema,
  with_you: z.boolean(),
  ...CardFields,
});
export type FactionRow = z.infer<typeof FactionRowSchema>;

const ResourceSchema = z.object({
  name: phrase,
  start: z.number(),
  line: z.number(),
  for: phrase,
  earn: z.array(phrase),
  spend: z.array(phrase),
  fails: phrase,
  icon: z.enum(RESOURCE_ICONS),
});
const MeterSchema = z.object({ name: phrase, start: z.number(), line: z.number() });
const InstrumentSchema = z.object({
  name: phrase,
  available: z.boolean(),
  vetoes: z.array(phrase),
});
const OfferSchema = z.object({ label: phrase, text: phrase });

export const PartSchemas = {
  groups: z.object({ groups: z.array(GroupRowSchema) }),
  chamber: z.object({
    chamber: z.object({
      name: phrase,
      shape: z.enum(["hemicycle", "rows", "ring", "court"]),
      threshold: whole,
      tie: phrase.nullable(),
      factions: z.array(FactionRowSchema),
    }),
  }),
  factions: z.object({ factions: z.array(FactionRowSchema) }),
  briefing: z.object({
    ruler: z.object({ role: phrase, removed_by: phrase }),
    briefing: z.object({ situation: phrase, room: phrase, you: phrase }),
    problems: z.array(phrase),
    pledges: z.array(
      z.object({
        text: phrase,
        tag: phrase,
        for: phrase,
        quote: phrase.nullable(),
        doc: whole.nullable(),
      }),
    ),
  }),
  ledgers: z.object({
    ledgers: z.object({
      treasury: ResourceSchema,
      authority: ResourceSchema,
      chest: ResourceSchema,
      loyalty: MeterSchema,
      popularity: MeterSchema,
    }),
  }),
  instruments: z.object({
    instruments: z.object({
      decree: InstrumentSchema,
      law: InstrumentSchema,
      appoint: InstrumentSchema,
      spend: InstrumentSchema,
      proclaim: InstrumentSchema,
      favour: InstrumentSchema,
      force: InstrumentSchema,
    }),
  }),
  systems: z.object({
    tags: z.array(phrase),
    blocs: z.array(z.object({ id: phrase, name: phrase, description: phrase })),
    patrons: z.array(
      z.object({ id: phrase, name: phrase, wants: z.array(phrase), hates: z.array(phrase) }),
    ),
    regions: z.array(
      z.object({
        id: phrase,
        weight: z.number(),
        lean: z.array(z.object({ faction: phrase, value: z.number() })),
      }),
    ),
    test: z.object({
      name: phrase,
      win: phrase,
      lose: phrase,
      reveal: z.enum(["regions", "seats", "both"]),
    }),
    endings: z.object({
      reelected: phrase,
      defeated: phrase,
      lame_duck: phrase,
      impeached: phrase,
      coup: phrase.nullable(),
      stopped: phrase.nullable(),
      dismissed: phrase.nullable(),
    }),
    lobby: z.object({ pork: OfferSchema, favor: OfferSchema, threat: OfferSchema }),
    escalations: z.array(
      z.object({ key: z.enum(ESCALATION_KEYS), name: phrase, headline: phrase }),
    ),
  }),
  theme: z.object({ theme: ThemeTokensSchema }),
};
export type PartKind = keyof typeof PartSchemas;
export type Parts = { [Kind in PartKind]: z.infer<(typeof PartSchemas)[Kind]> };

// The world after merge: one row per roster group without seats and one faction row per chamber bloc (either list may
// miss a row a part never wrote), then the other parts as written. theme is whatever the theme part returned, or null.
export type World = {
  bible: Bible;
  groups: GroupRow[];
  chamber: (Omit<Parts["chamber"]["chamber"], "factions"> & { factions: FactionRow[] }) | null;
  briefing: Parts["briefing"];
  ledgers: Parts["ledgers"]["ledgers"];
  instruments: Parts["instruments"]["instruments"];
  systems: Parts["systems"];
  theme: unknown;
};

export type Fail = {
  check: string;
  row: string;
  message: string;
  docs?: number[]; // the document indexes a repair should read
  job?: string; // the world part that fails, for a part-scoped repair
  blocking?: boolean; // the pack cannot be assembled around it
};

export const EmblemReplySchema = z.object({
  emblems: z.array(
    z.object({
      id: phrase,
      motif: phrase,
      viewBox: phrase,
      elements: z.array(z.object({ tag: phrase }).catchall(z.union([phrase, z.number()]))),
    }),
  ),
});
export const EmblemReviewSchema = z.object({
  emblems: z.array(
    z.object({ id: phrase, legible: z.boolean(), canon: z.enum(["fits", "wrong", "none"]) }),
  ),
});
export const RewriteSchema = z.object({
  fields: z.array(z.object({ path: phrase, text: phrase })),
});

// A chamber exists when the roster names one and at least one group holds seats in it.
export const hasChamber = (roster: Roster): boolean =>
  !!roster.chamber && roster.groups.some((group) => group.seats !== null);

// The pack's factions: the chamber blocs, or, with no chamber, the court of home groups that act (Decision 4).
export const factionIds = (roster: Roster): string[] =>
  hasChamber(roster)
    ? roster.groups.filter((group) => group.seats !== null).map((group) => group.id)
    : roster.groups
        .filter((group) => group.seats === null && group.sits === "home" && group.kind === "actor")
        .map((group) => group.id);

// A card row as the model writes it (red_line) to the pack's glance card (redLine), or null when it breaks R36.
export function toGlance(
  row: { wants?: string[]; hates?: { tag: string; red_line: boolean }[]; strike?: string },
  face?: { name: string; role: string },
): Glance | null {
  if (!row.wants || !row.hates || typeof row.strike !== "string") return null;
  const parsed = GlanceSchema.safeParse({
    ...(face ? { face } : {}),
    wants: row.wants,
    hates: row.hates.map((hate) => ({ tag: hate.tag, redLine: hate.red_line })),
    strike: row.strike,
  });
  return parsed.success ? parsed.data : null;
}
