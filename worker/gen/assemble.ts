// Generation v2's world to the game's pack. Code builds all structure from the checked roster (ids, holders, the chamber
// and its drawn seats, the chamber as a holder, weights, lines, the seat's backer, the own group, a court when no chamber
// votes) and takes only words and judgements from the world parts. Stage 0's optional fields (glance cards, emblems,
// tints, icons, theme tokens, resource words) are filled here.
import type { Emblem } from "../emblem";
import { STANCE_HI, STANCE_LO } from "../engine";
import {
  ESCALATION_KEYS,
  FILLS,
  FONT_PAIRS,
  KINDS,
  PackSchema,
  VERBS,
  scaleSeats,
  type Citizen,
  type Member,
  type Pack,
  type Storylet,
} from "../pack";
import { MATERIALS, fitContrast, parseThemeTokens, type ThemeTokens, type Tint } from "../tokens";
import { UNIT, days, ymd, type Calendar } from "./calendar-math";
import type { Facts } from "./facts";
import { MAX_CHAMBER, type Frame } from "./frame";
import type { Gathered } from "./gather";
import {
  factionIds,
  hasChamber,
  toGlance,
  type Bible,
  type Plan,
  type Roster,
  type World,
} from "./schemas";
import { UNITS, fromDays } from "./validate";

export const COURT_SEATS = 24; // Decision 4: the members and the vote need seats even where no chamber votes on laws
export const BACKER_AUTHORITY = 3; // TUNE: the seat's backer pays this much authority a turn while it agrees
export const CHAMBER_HOLDER = "the_chamber"; // not "chamber": that word in a veto list means the chamber's vote
const BASE_PRICES: Record<
  (typeof VERBS)[number],
  { authority?: number; treasury?: number; chest?: number }
> = {
  decree: { authority: 3 },
  law: { authority: 1 },
  appoint: { authority: 2 },
  spend: {},
  proclaim: { chest: 2 },
  favour: { authority: 2 },
  force: { authority: 4 },
};
const LOBBY_COSTS = { pork: 10, favor: 15, threat: 20 } as const;
const PALETTE = [
  "#2e6f8e",
  "#8e3b2e",
  "#5a7d2e",
  "#6e4a8e",
  "#8e7a2e",
  "#2e8e7a",
  "#8e2e5f",
  "#4a5a6e",
  "#7a5a3a",
  "#3a7a5a",
  "#5f2e8e",
  "#8e5a2e",
];
const TEXTURE_OF: Record<(typeof MATERIALS)[number], Pack["theme"]["texture"]> = {
  newsprint: "newsprint",
  vellum: "parchment",
  parchment: "parchment",
  linen: "parchment",
  papyrus: "parchment",
  stone: "concrete",
  clay: "concrete",
  brass: "steel",
  steel: "steel",
  terminal: "steel",
  silk: "none",
  glass: "none",
};
const LAYOUT_OF = {
  hemicycle: "hemicycle",
  rows: "benches",
  ring: "circle",
  court: "court",
} as const;

export type BuildParts = {
  id: string;
  prompt: string;
  plan: Plan;
  gathered: Gathered;
  roster: Roster;
  world: World;
  emblems: Record<string, Emblem>;
};
// The people steps start before the other parts land, so their frame needs only the bible, briefing and systems.
export type FrameInput = Omit<BuildParts, "world" | "emblems"> & {
  world: Pick<World, "bible" | "briefing" | "systems"> &
    Partial<Pick<World, "groups" | "chamber" | "theme" | "ledgers">>;
};
export type People = { members: Member[]; citizens: Citizen[]; deck: Storylet[] };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const slug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// The unit whose 20 turns come closest to the plan's term; a week when the dates do not parse.
export function calendarOf(plan: Plan): Calendar {
  const start = ymd(plan.start_date);
  const end = ymd(plan.term_end);
  const span = start && end ? days(end) - days(start) : 20 * UNIT.week;
  const unit = UNITS.reduce((best, candidate) =>
    Math.abs(20 * UNIT[candidate] - span) < Math.abs(20 * UNIT[best] - span) ? candidate : best,
  );
  return { start_date: start ? fromDays(days(start)) : "0001-01-01", unit };
}

// The real people of the world, for the check that no invented member carries one of their names.
export function factsOf(plan: Plan, roster: Roster, bible: Bible): Facts {
  const names = [
    ...new Set(
      [
        roster.ruler.name,
        plan.seat.holder,
        ...plan.people,
        ...bible.groups.map((group) => group.face),
      ].filter((name): name is string => !!name?.trim()),
    ),
  ];
  return {
    people: names.map((name) => ({
      name,
      role: "",
      born: null,
      died: null,
      alive_on_start_date: true,
    })),
    bodies: [],
    groupings: [],
    dated_events: bible.history.map((beat) => ({ date: beat.date, title: beat.beat })),
    anchor: -1,
  };
}

// Decision 5: the own group when it sits in the chamber (or the court); else the faction with the most support.
export function rulerFaction(roster: Roster): string {
  const ids = factionIds(roster);
  if (ids.includes(roster.ruler.own_group)) return roster.ruler.own_group;
  const supportOf = (id: string) => roster.groups.find((group) => group.id === id)?.support ?? 0;
  return [...ids].sort((a, b) => supportOf(b) - supportOf(a))[0];
}

function chamberOf(roster: Roster, world: FrameInput["world"]) {
  if (hasChamber(roster)) {
    const rows = roster.groups.filter((group) => group.seats !== null);
    const real = Math.max(roster.chamber!.real_size, rows.length);
    const size = Math.min(MAX_CHAMBER, real);
    const seats = scaleSeats(
      Object.fromEntries(rows.map((group) => [group.id, Math.max(group.seats ?? 0, 0)])),
      size,
    );
    const written = world.chamber?.threshold ?? Math.floor(real / 2) + 1;
    // Lesson 12: the threshold scales from the real chamber; a clamp once gave 100 of 100.
    const threshold = clamp(Math.round(real > size ? (written * size) / real : written), 1, size);
    return { size, threshold, seats };
  }
  const ids = new Set(factionIds(roster));
  const court = roster.groups.filter((group) => ids.has(group.id));
  const seats = scaleSeats(
    Object.fromEntries(court.map((group) => [group.id, Math.max(group.vote_share, 0.05)])),
    COURT_SEATS,
  );
  return { size: COURT_SEATS, threshold: Math.floor(COURT_SEATS / 2) + 1, seats };
}

function tagsOf(world: FrameInput["world"]): string[] {
  const pledged = world.briefing.pledges.map((pledge) => slug(pledge.tag));
  return [...new Set([...pledged, ...world.systems.tags.map(slug)])].filter(Boolean).slice(0, 24);
}

function oldTheme(tokens: ThemeTokens, shape: keyof typeof LAYOUT_OF): Pack["theme"] {
  return {
    fonts: FONT_PAIRS.find((pair) => pair.startsWith(`${tokens.display} +`)) ?? "Fraunces + Inter",
    ink: tokens.light.ink,
    paper: tokens.light.paper,
    accent: tokens.light.accent,
    texture: TEXTURE_OF[tokens.material],
    ornament: "none", // no logos, stamps or crests at world level
    layout: LAYOUT_OF[shape],
  };
}

// The first two sentences of the situation, at most 60 words: the match card's description.
const describe = (situation: string) =>
  situation
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ")
    .split(/\s+/)
    .slice(0, 60)
    .join(" ");

export function frameOf(input: FrameInput): Frame {
  const { plan, roster, world } = input;
  const { bible, briefing, systems } = world;
  const chamber = chamberOf(roster, world);
  const tags = tagsOf(world);
  const known = (list: string[]) =>
    list
      .map(slug)
      .filter((tag) => tags.includes(tag))
      .slice(0, 3);
  const ruler = rulerFaction(roster);
  const withYou = (world.chamber?.factions ?? [])
    .filter((row) => row.with_you)
    .map((row) => row.id);
  const ownSupport =
    roster.groups.find((group) => group.id === roster.ruler.own_group)?.support ?? 50;
  const tokens = parseThemeTokens(world.theme ?? null).tokens;
  const factionIdsList = factionIds(roster);
  const factions = factionIdsList.map((id, index) => {
    const group = roster.groups.find((candidate) => candidate.id === id)!;
    const entry = bible.groups.find((candidate) => candidate.id === id);
    const written =
      world.chamber?.factions.find((row) => row.id === id) ??
      world.groups?.find((row) => row.id === id);
    return {
      id,
      name: group.name,
      short: entry?.short || group.name,
      color: written?.color ?? PALETTE[index % PALETTE.length],
      fill: FILLS[index % FILLS.length],
      ideology: entry?.identity ?? group.wants,
      leader: entry?.face ?? "",
      seats: chamber.seats[id] ?? 0,
    };
  });
  const regionRows = new Map(systems.regions.map((region) => [region.id, region]));
  const regionWeights = bible.regions.map((region) =>
    Math.max(regionRows.get(region.id)?.weight ?? 0, 0),
  );
  const weightTotal = regionWeights.reduce((total, weight) => total + weight, 0);
  const vocabulary = bible.vocabulary;
  return {
    title: bible.title,
    era: bible.era,
    place: bible.place,
    description: describe(briefing.briefing.situation),
    content_note: null,
    vocabulary: {
      seat: vocabulary.seat,
      chamber: vocabulary.chamber,
      member: vocabulary.member,
      bill: vocabulary.bill,
      pass: vocabulary.pass,
      fail: vocabulary.fail,
      capital: vocabulary.capital,
      turn: vocabulary.turn,
      midterm: vocabulary.midterm,
      campaign: vocabulary.campaign,
      test: vocabulary.test,
      feed: vocabulary.feed,
      post: vocabulary.post,
      whip: vocabulary.whip,
      lobby: vocabulary.lobby,
      promise: vocabulary.promise,
      patron: vocabulary.patron,
      approval: vocabulary.approval,
    },
    theme: oldTheme(tokens, world.chamber?.shape ?? (hasChamber(roster) ? "hemicycle" : "court")),
    chamber: {
      size: chamber.size,
      threshold: chamber.threshold,
      supermajority: clamp(
        Math.ceil((chamber.size * 2) / 3),
        Math.min(chamber.threshold + 1, chamber.size),
        chamber.size,
      ),
      alpha: 0.5, // read only by packs without a constitution
      veto: null,
    },
    factions,
    regions: bible.regions.map((region, index) => ({
      id: region.id,
      name: region.name,
      weight: weightTotal > 0 ? regionWeights[index] / weightTotal : 1 / bible.regions.length,
      lean: factionIdsList.map((id) => ({
        id,
        value: clamp(
          regionRows.get(region.id)?.lean.find((lean) => lean.faction === id)?.value ?? 0,
          -1,
          1,
        ),
      })),
    })),
    blocs: systems.blocs
      .slice(0, 5)
      .map((bloc, index) => ({
        id: slug(bloc.id) || `bloc-${index + 1}`,
        name: bloc.name,
        description: bloc.description,
      })),
    patrons: systems.patrons.slice(0, 10).map((patron, index) => {
      const wants = known(patron.wants);
      const hates = known(patron.hates).filter((tag) => !wants.includes(tag));
      return {
        id: slug(patron.id) || `patron-${index + 1}`,
        name: patron.name,
        wants: wants.length ? wants : [tags[index % tags.length]],
        hates: hates.length ? hates : [tags[(index + 1) % tags.length]],
      };
    }),
    tags,
    problems: briefing.problems.slice(0, 12),
    promises: briefing.pledges
      .slice(0, 8)
      .map((pledge) => ({ tag: slug(pledge.tag), label: pledge.text })),
    starts: factions.map((faction) => ({
      faction: faction.id,
      seat_title: vocabulary.seat,
      coalition:
        faction.id === ruler
          ? [faction.id, ...withYou.filter((id) => id !== faction.id)]
          : [faction.id],
      premise: faction.ideology,
      party: ownSupport,
      capital: clamp(Math.round(world.ledgers?.authority.start ?? 40), 0, 100),
      hostile: [],
    })),
    test: systems.test,
    endings: {
      reelected: systems.endings.reelected,
      defeated: systems.endings.defeated,
      lame_duck: systems.endings.lame_duck,
      impeached: systems.endings.impeached,
    },
    lobby: {
      pork: { cost: LOBBY_COSTS.pork, ...systems.lobby.pork },
      favor: { cost: LOBBY_COSTS.favor, ...systems.lobby.favor },
      threat: { cost: LOBBY_COSTS.threat, ...systems.lobby.threat },
    },
    escalations: ESCALATION_KEYS.map((key) => {
      const row = systems.escalations.find((escalation) => escalation.key === key);
      return { key, name: row?.name ?? key.replace(/_/g, " "), headline: row?.headline ?? "" };
    }),
    start_date: calendarOf(plan).start_date,
  };
}

// Scale, then clamp to the 0.15 to 0.6 band, the scale found by bisection so the weights sum to 1 (from constitution.ts).
function band(values: number[]): number[] {
  const LOW = 0.15;
  const HIGH = 0.6;
  if (!values.length) return [];
  if (values.length * LOW > 1 || values.length * HIGH < 1) {
    const total = values.reduce((sum, value) => sum + value, 0);
    return values.map((value) => value / total);
  }
  const at = (scale: number) => values.map((value) => Math.min(HIGH, Math.max(LOW, value * scale)));
  let low = 0;
  let high = HIGH / Math.min(...values);
  for (let i = 0; i < 100; i++) {
    const scale = (low + high) / 2;
    if (at(scale).reduce((sum, value) => sum + value, 0) < 1) low = scale;
    else high = scale;
  }
  return at(high);
}

function tintOf(color: string | undefined, tokens: ThemeTokens): Tint | undefined {
  if (!color) return undefined;
  const light = fitContrast(color, [tokens.light.paper, tokens.light.surface]);
  const dark = fitContrast(color, [tokens.dark.paper, tokens.dark.surface]);
  return light && dark ? { light, dark } : undefined;
}

export function packOf(parts: BuildParts, people: People): Pack {
  const { plan, roster, world, emblems, gathered } = parts;
  const { bible } = world;
  const frame = frameOf(parts);
  const tokens = parseThemeTokens(world.theme).tokens;
  const entryOf = (id: string) => bible.groups.find((group) => group.id === id);
  const faceOf = (id: string) => {
    const entry = entryOf(id);
    return entry ? { name: entry.face, role: entry.face_role } : undefined;
  };
  const groupRowOf = (id: string) => world.groups.find((row) => row.id === id);
  const factionRowOf = (id: string) =>
    world.chamber?.factions.find((row) => row.id === id) ?? groupRowOf(id);
  const forceVetoes = new Set(world.instruments.force.vetoes);
  const unseated = roster.groups.filter((group) => group.seats === null);
  const holders: Record<string, unknown>[] = unseated.map((group) => {
    const row = groupRowOf(group.id);
    const face = faceOf(group.id);
    const glance = row ? toGlance(row, face) : null;
    return {
      id: group.id,
      name: group.name,
      short: entryOf(group.id)?.short,
      where: group.sits,
      persona: {
        name: face?.name ?? group.name,
        role: face?.role ?? "",
        bio: entryOf(group.id)?.identity ?? group.wants,
        tell: "",
      },
      members: group.kind === "public" ? "citizens" : "none",
      stance: clamp(group.support / 100, STANCE_LO, STANCE_HI),
      support: group.support,
      // Lesson 15: a line sits 10 to 25 below day-one support.
      line: clamp(
        row?.line ?? group.support - 15,
        Math.max(1, group.support - 25),
        Math.max(1, group.support - 10),
      ),
      response: group.can_dismiss ? "dismiss" : (row?.response ?? "none"),
      levers: forceVetoes.has(group.id) ? ["force"] : [],
      wants: glance?.wants ?? [],
      redLines: glance?.hates.filter((hate) => hate.redLine).map((hate) => hate.tag) ?? [],
      gives:
        group.id === roster.ruler.backer && group.sits === "home"
          ? { ledger: "authority", amount: BACKER_AUTHORITY, per: "turn" }
          : null,
      responses: [],
      icon: row?.icon,
      glance: glance ?? undefined,
      emblem: emblems[group.id],
      tint: tintOf(row?.color, tokens),
    };
  });
  const chamberId = roster.groups.some((group) => group.id === CHAMBER_HOLDER)
    ? `${CHAMBER_HOLDER}_2`
    : CHAMBER_HOLDER;
  const withYou = new Set(
    (world.chamber?.factions ?? []).filter((row) => row.with_you).map((row) => row.id),
  );
  if (hasChamber(roster)) {
    const backing = frame.factions
      .filter((faction) => faction.id === roster.ruler.own_group || withYou.has(faction.id))
      .reduce((total, faction) => total + faction.seats, 0);
    const support = clamp(Math.round((100 * backing) / frame.chamber.size), 5, 95);
    const name = world.chamber?.name ?? bible.vocabulary.chamber;
    holders.push({
      id: chamberId,
      name,
      where: "home",
      persona: { name, role: bible.vocabulary.member, bio: "", tell: "" },
      members: "seats",
      stance: clamp(support / 100, STANCE_LO, STANCE_HI),
      support,
      line: Math.max(1, support - 15),
      response: "early_test",
      levers: [],
      wants: [],
      redLines: [],
      gives: null,
      responses: [],
      icon: "chamber",
    });
  }
  const seatShare = roster.groups
    .filter((group) => group.seats !== null)
    .reduce((total, group) => total + Math.max(group.vote_share, 0), 0);
  const voters: [string, number][] = [
    ...unseated
      .filter((group) => group.vote_share > 0)
      .map((group): [string, number] => [group.id, group.vote_share]),
    ...(hasChamber(roster) && seatShare > 0 ? [[chamberId, seatShare] as [string, number]] : []),
  ];
  const banded = band(voters.map(([, share]) => share));
  const holderIds = new Set(holders.map((holder) => holder.id as string));
  const allowed = (veto: string) =>
    holderIds.has(veto) ||
    (hasChamber(roster) && (veto === "chamber" || veto === "chamber_supermajority"));
  const instruments = Object.fromEntries(
    VERBS.map((verb) => {
      const written = world.instruments[verb];
      const vetoes = [...new Set(written.vetoes)].filter(allowed).slice(0, 2);
      const consent = vetoes.includes("chamber_supermajority")
        ? "chamber_supermajority"
        : vetoes.includes("chamber")
          ? "chamber"
          : vetoes.some((veto) => forceVetoes.has(veto))
            ? "army"
            : "none";
      return [
        verb,
        {
          name: written.name,
          consent,
          price: { authority: 0, treasury: 0, chest: 0, ...BASE_PRICES[verb] },
          available: verb === "law" && !hasChamber(roster) ? false : written.available,
          vetoes,
        },
      ];
    }),
  );
  const publicGroup = roster.groups.find((group) => group.kind === "public")!.id;
  const resource = (ledger: World["ledgers"]["treasury"]) => ({
    name: ledger.name,
    line: ledger.line,
    icon: ledger.icon,
    for: ledger.for,
    earn: ledger.earn,
    spend: ledger.spend,
    fails: ledger.fails,
  });
  return PackSchema.parse({
    ...frame,
    v: 1,
    id: parts.id,
    lang: "en",
    prompt: parts.prompt,
    fiction: plan.kind >= 6,
    kind: KINDS[plan.kind - 1],
    grounding: roster.grounding_line,
    history: { fall: roster.fall ? { date: roster.fall.date, what: roster.fall.what } : null },
    sources: gathered.docs
      .filter((doc) => doc.title !== "Category sweep")
      .map((doc) => {
        const host = doc.source.startsWith("Wikipedia")
          ? "en.wikipedia.org"
          : doc.source.split(":")[0];
        return {
          title: doc.title,
          url: `https://${host}/wiki/${encodeURIComponent(doc.title.replace(/ /g, "_"))}`,
        };
      }),
    vocabulary: {
      ...frame.vocabulary,
      file: bible.vocabulary.file,
      ...(bible.vocabulary.abroad ? { abroad: bible.vocabulary.abroad } : {}),
    },
    factions: frame.factions.map((faction) => {
      const row = factionRowOf(faction.id);
      return {
        ...faction,
        glance: (row && toGlance(row, faceOf(faction.id))) ?? undefined,
        emblem: emblems[faction.id],
        tint: tintOf(faction.color, tokens),
      };
    }),
    calendar: calendarOf(plan),
    members: people.members,
    citizens: people.citizens,
    deck: people.deck,
    endings: world.systems.endings,
    constitution: {
      ruler: {
        role: world.briefing.ruler.role,
        faction: rulerFaction(roster),
        above: roster.ruler.above && holderIds.has(roster.ruler.above) ? roster.ruler.above : null,
        removedBy: world.briefing.ruler.removed_by,
      },
      holders,
      instruments,
      retention: {
        name: bible.vocabulary.test,
        weights: voters.map(([id], index) => ({
          id,
          value: Math.round(banded[index] * 1000) / 1000,
        })),
      },
      halfTerm: { holder: publicGroup, name: bible.vocabulary.midterm },
      ledgers: {
        treasury: resource(world.ledgers.treasury),
        authority: resource(world.ledgers.authority),
        chest: resource(world.ledgers.chest),
        loyalty: { name: world.ledgers.loyalty.name, line: world.ledgers.loyalty.line },
        popularity: { name: world.ledgers.popularity.name, line: world.ledgers.popularity.line },
      },
      briefing: world.briefing.briefing,
      publicGroup,
      ownGroup: roster.ruler.own_group,
    },
    themeTokens: tokens,
  });
}
