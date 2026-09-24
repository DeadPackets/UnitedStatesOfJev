// The world step of generation v2 (SPEED.md experiment 1): one bible call fixes the canon (voice, words, names, faces,
// terms and their aliases), then parallel part calls write the rest from the same cached block of documents and roster.
// Code gives each part its ids, checks each part, and re-runs only a part that fails; a part is never asked to fix a
// roster-level count (lesson 24). Each row comes from the chunk that owns it (lesson 25).
import type { z } from "zod";
import { ESCALATION_KEYS } from "../pack";
import { fold, isGrounded, quoted } from "./checks";
import { SWEEP_TITLE, docBlock, type Gathered } from "./gather";
import { GROK, ModelStop, OPUS, type CallRequest, type Caller } from "./openrouter";
import {
  BibleSchema,
  PartSchemas,
  factionIds,
  hasChamber,
  toGlance,
  type Bible,
  type Fail,
  type FactionRow,
  type GroupRow,
  type PartKind,
  type Parts,
  type Plan,
  type Roster,
  type World,
} from "./schemas";
import { WORLD_SYSTEM } from "./writing";

const WORLD_DOC_CHARACTERS = 6000; // each document in the cached block; the roster call reads them whole
export const CHUNK = 4; // measured: one 11-group call took 151 s of a 193 s step; chunks of 4 cut it to 108 s

export type Job = { name: string; kind: PartKind; ids: string[] | null };
export type WorldContext = {
  prefix: string;
  roster: Roster;
  bible: Bible;
  model: string; // the model the bible came from: Grok after a filtered bible, so the parts skip the refusal
  plan: Plan;
  gathered: Gathered;
};

// Opus refuses some premises (lesson 6). A filtered world call goes once to Grok: a new call to another model, not a
// retry. A length stop is not resent, since the same call would stop the same way.
export async function worldCall<T>(
  call: Caller,
  request: CallRequest<T>,
): Promise<{ data: T; model: string }> {
  const model = request.model ?? OPUS;
  try {
    return { data: await call({ ...request, model }), model };
  } catch (error) {
    if (!(error instanceof ModelStop) || error.reason !== "content_filter" || model === GROK)
      throw error;
    return { data: await call({ ...request, model: GROK }), model: GROK };
  }
}

export function worldPrefix(
  prompt: string,
  plan: Plan,
  roster: Roster,
  gathered: Gathered,
): string {
  const table = JSON.stringify({
    grounding_line: roster.grounding_line,
    ruler: roster.ruler,
    fall: roster.fall,
    chamber: roster.chamber,
    groups: roster.groups.map(({ doc, quote, seats_doc, seats_quote, ...group }) => group),
  });
  const sources = gathered.docs.filter((doc) => doc.title !== SWEEP_TITLE);
  return `${docBlock(sources, WORLD_DOC_CHARACTERS)}

<roster>
${table}
</roster>

<world>
Prompt: ${prompt}. Kind: ${plan.kind}. Start date: ${plan.start_date}; each turn is ${plan.turn_length}; the term ends ${plan.term_end}.
The roster is checked and closed: use exactly its groups, names, seats, rulers and the fall. Play every premise straight.
</world>`;
}

const failureBlock = (earlier: unknown, fails: Fail[]) => `
<earlier_answer>
${JSON.stringify(earlier)}
</earlier_answer>
<failures>
${fails.map((fail) => `- ${fail.check} ${fail.row}: ${fail.message}`).join("\n")}
</failures>
Code checks found the failures above in your earlier answer. Return the whole answer again with each one fixed and everything else kept.`;

const BIBLE_TASK = `Write the world bible: the canon every part copies from. Every other writer waits for it, so keep each field short.
- house_voice: one line naming the record this world keeps of itself (e.g. "district officer's memo, 1946"). tone: exactly 3 lines on how the prose sounds (sentence length, register, what it never does).
- grounding: the roster's grounding line. title: the masthead title. era: the span of the term in words ("Egypt, 2012 to 2013"). place: the seat of power. year: the start year (negative for BC; the in-world number for invented calendars).
- vocabulary: every key, in this world's own words.
- terms: 8 to 20 named things the parts may mention that are not roster groups (places, offices, documents, laws, events, objects, and people other than the faces), each with one line and its aliases: every other name the documents use for the same thing. The parts may use no other proper nouns, so include every name the briefing, pledges, problems and cards will need.
- history: 3 to 6 dated beats up to the start date, then the fall if the roster has one.
- groups: one row per roster group, in roster order: id, name (the roster name), short (at most 16 characters, no acronyms), identity (at most 20 words: who they are and what they want from the player now), face (the real leader or spokesperson on the start date where the record has one, else an invented voice named from the world), face_role (title and place; add "an invented voice" when invented).
- regions: 6 to 8 regions of the public (split by community where the country was divided that way): id (lower case) and name.`;

export async function writeBible(
  call: Caller,
  prefix: string,
  earlier?: { bible: Bible; fails: Fail[]; model: string },
): Promise<{ bible: Bible; model: string }> {
  const { data, model } = await worldCall(call, {
    name: earlier ? "bible-repair" : "bible",
    schema: BibleSchema,
    system: WORLD_SYSTEM,
    prefix: [prefix],
    user: `<task>\n${BIBLE_TASK}\n</task>${earlier ? failureBlock(earlier.bible, earlier.fails) : ""}`,
    maxTokens: 32000,
    model: earlier?.model,
  });
  return { bible: data, model };
}

export function checkBible(bible: Bible, roster: Roster): Fail[] {
  const fails: Fail[] = [];
  const fail = (row: string, message: string) =>
    fails.push({ check: "B1", row, message, job: "bible" });
  const written = new Set(bible.groups.map((group) => group.id));
  for (const group of roster.groups)
    if (!written.has(group.id))
      fail(
        group.id,
        `no bible row for roster group ${group.id}; write one row per roster group, in roster order`,
      );
  if (bible.regions.length < 6 || bible.regions.length > 8)
    fail("regions", `${bible.regions.length} regions; write 6 to 8`);
  for (const [key, value] of Object.entries(bible.vocabulary))
    if (key !== "abroad" && !String(value ?? "").trim())
      fail("vocabulary", `vocabulary.${key} is empty`);
  return fails;
}

export function planJobs(roster: Roster): Job[] {
  const chunks = (ids: string[]) =>
    Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) =>
      ids.slice(i * CHUNK, (i + 1) * CHUNK),
    );
  const unseated = roster.groups.filter((group) => group.seats === null).map((group) => group.id);
  const seated = hasChamber(roster)
    ? roster.groups.filter((group) => group.seats !== null).map((group) => group.id)
    : [];
  return [
    ...chunks(unseated).map((ids, i): Job => ({ name: `groups${i + 1}`, kind: "groups", ids })),
    ...chunks(seated).map(
      (ids, i): Job =>
        i === 0
          ? { name: "chamber", kind: "chamber", ids }
          : { name: `factions${i + 1}`, kind: "factions", ids },
    ),
    ...(["briefing", "ledgers", "instruments", "systems", "theme"] as const).map(
      (kind): Job => ({ name: kind, kind, ids: null }),
    ),
  ];
}

const PART_RULES = `You write one part of the world file. Other writers write the other parts at the same time from the same roster and this bible.
The bible is canon: keep its house voice and tone, its vocabulary, its group names, faces and terms, and its history. Name no person, place, body, document or event that is not in the bible, the roster or the documents; when you need a name the bible lacks, describe the thing without naming it. Write a term by its bible name, never by one of its aliases. Describe each group only as itself: never give a group a second name, and never write a roster group into a part as if it were someone else.`;

const CARD_RULE = `wants: 2 or 3 tags of acts the group wants. hates: 2 or 3 tags of acts it fights, exactly one with red_line true; a group that will not take money for its support has the hate tag "Bribes". strike: one short line, third person, on what it does when it turns on the player. Each tag is 1 to 3 words a player's act would do ("Relief checks", "Tax the lords"), decidable from the act's text alone. The whole card is about 20 words.`;

export function jobTask(job: Job, roster: Roster, bible: Bible, grounded = false): string {
  const nameOf = (id: string) =>
    bible.groups.find((group) => group.id === id)?.name ??
    roster.groups.find((group) => group.id === id)?.name ??
    id;
  const unseated = roster.groups.filter((group) => group.seats === null);
  const seated = roster.groups.filter((group) => group.seats !== null);
  const mine = (id: string) => !job.ids || job.ids.includes(id);
  const factions = factionIds(roster);
  const ids = `${job.ids ? "Write only the rows listed above. " : ""}Ids you may refer to: groups ${unseated.map((group) => group.id).join(", ")}; chamber blocs ${seated.map((group) => group.id).join(", ") || "none"}; regions ${bible.regions.map((region) => region.id).join(", ")}.`;
  const groupLines = unseated
    .filter((group) => mine(group.id))
    .map(
      (group) =>
        `- ${group.id}: ${nameOf(group.id)}; ${group.sits}; support ${group.support}${group.can_dismiss ? "; can dismiss the player" : ""}${group.veto ? "; has a veto" : ""}; rival ${group.rival}`,
    )
    .join("\n");
  const seatLines = seated
    .filter((group) => mine(group.id))
    .map(
      (group) =>
        `- ${group.id}: ${nameOf(group.id)}; ${group.seats} seats; support ${group.support}; rival ${group.rival}`,
    )
    .join("\n");
  const factionRule = `color: the party's own colour as #rrggbb where it has one, else one that suits it, distinct from the others. with_you: true for a bloc outside the player's own party that votes with the player. ${CARD_RULE}`;
  switch (job.kind) {
    case "groups":
      return `Write groups: exactly one row per id below, in this order, each with that id. icon: the line icon for its role. color: its colour as #rrggbb, distinct from the others. line: its warning line, 10 to 25 below its support. response: what it does when it strikes; a group that can dismiss the player has "dismiss". ${CARD_RULE}\n${groupLines}\n${ids}`;
    case "chamber":
      return `Write chamber (other writers write the blocs not listed below): name (the bible's vocabulary.chamber), shape, threshold (the votes needed to pass in the real chamber of ${roster.chamber?.real_size} seats), tie (who breaks a tied vote in the player's favour, or null), and factions: exactly one row per id below, in this order, each with that id. ${factionRule}\n${seatLines}\n${ids}`;
    case "factions":
      return `Write factions of the chamber (another writer writes the chamber's name and its other blocs): exactly one row per id below, in this order, each with that id. ${factionRule}\n${seatLines}\n${ids}`;
    case "briefing":
      return `Write ruler (role: the office in this world's words; removed_by: one sentence for the first page naming who can remove the player and how; the roster says: ${roster.ruler.removed_by}), briefing (situation: what is happening and what the player wants; room: who can stop the player and how; you: what the player holds and what ${bible.vocabulary.test} asks; each at most 90 words, second person), problems (8 one-line problems, the three most pressing first) and pledges: exactly 8 promises the player can make on day one. Each pledge: text (the promise, at most 8 words), tag (2 to 4 lower-case words joined by hyphens, unique), for (the id of the group, chamber bloc or region it is made to; the player's own party may be one), quote and doc. ${grounded ? `The ruler is ${roster.ruler.name}, a real person: at least 5 of the 8 pledges are promises ${roster.ruler.name} really made, each with quote (at most 25 words copied exactly from the numbered document that records the promise) and doc (that document's index). Code checks every quote against the documents. The other pledges have quote and doc null.` : "quote and doc are null."}\n${ids}`;
    case "ledgers":
      return `Write ledgers: the five fixed resources named in this world's words (name at most 13 characters, sentence case), each with start and line: treasury start 30 to 60, line 0; authority start 30 to 60, line 0; chest start 10 to 30, line 0; loyalty start 50 to 70, line 20; popularity start 40 to 60, line 30. Treasury, authority and chest also get for (one sentence: what it is in this world), earn (2 short lines: what fills it), spend (2 or 3 short lines: what drains it), fails (the words after "At 0", e.g. "the domes cannot pay for new air.") and icon. Every word comes from this world: no taxes in a world without money, no banks on Mars.`;
    case "instruments":
      return `Write instruments: one per verb (decree, law, appoint, spend, proclaim, favour, force), each named in this world's words, with available (false when this polity cannot use it${roster.chamber ? "" : "; law is false here, since no assembly votes on laws"}) and vetoes: who must agree before such an act lands, as group ids and/or "chamber" or "chamber_supermajority"; [] when no one can stop it in advance (a court that strikes later is not a veto). At most 2 per act, only veto players who would disagree with each other; force usually lists the group that commands the army. Each of these has a veto and appears in at least one act: ${
        unseated
          .filter((group) => group.veto)
          .map((group) => group.id)
          .join(", ") || "none"
      }.\n${groupLines}\n${ids}`;
    case "systems":
      return `Write the game's systems in this world's words:
- tags: 16 to 20 policy areas of this world, each 1 to 3 lower-case words joined by hyphens.
- blocs: exactly 5 groups of ordinary people (voters, subjects, workers, castes): id, name and a one-line description.
- patrons: exactly 10 lobbies or interests: id, name, and wants and hates as tags from your tags list.
- regions: one row per region id below: weight (its share of the population; the rows sum to 1) and lean, one entry per faction id below (value -1 to 1: how much the region favours it).
- test: the end-of-term test: name, win and lose (one sentence each), reveal (regions, seats or both).
- endings: a short title for each way the term ends (reelected, defeated, lame_duck, impeached, coup, stopped, dismissed; null for one this world cannot have).
- lobby: this world's words for a pork offer, a traded favour and a threat: label (at most 4 words) and text (one sentence).
- escalations: all 20 keys, in this order, each with a name and a one-line headline in this world's words: ${ESCALATION_KEYS.join(", ")}.
Regions: ${bible.regions.map((region) => `${region.id} (${region.name})`).join("; ")}. Faction ids: ${factions.map((id) => `${id} (${nameOf(id)})`).join("; ")}.`;
    case "theme":
      return `Write theme: the look of this world's own records, to match the bible's house voice, era and place. A display and body font from the lists, weight and case; a light and a dark palette (paper, surface, ink, muted, accent, accent2, rule as #rrggbb; ink, muted and accent must read at 4.5:1 on paper and surface); the material and texture of its paper; a radius; a rule style; a motion personality; and the courier shape that carries a change across the desk.`;
  }
}

export async function runJob(
  call: Caller,
  job: Job,
  context: WorldContext,
  earlier?: { part: unknown; fails: Fail[] },
): Promise<unknown> {
  const { data } = await worldCall(call, {
    name: earlier ? `${job.name}-repair` : job.name,
    schema: PartSchemas[job.kind] as z.ZodType<unknown>,
    system: WORLD_SYSTEM,
    // The bible is a second cached block: every part reads it, so only the first parts to start pay to send it.
    prefix: [context.prefix, `<bible>\n${JSON.stringify(context.bible)}\n</bible>`],
    user: `<task>\n${PART_RULES}\n${jobTask(job, context.roster, context.bible, isGrounded(context.plan, context.roster))}\n</task>${earlier ? failureBlock(earlier.part, earlier.fails) : ""}`,
    maxTokens: 48000,
    model: context.model,
  });
  return data;
}

export function checkPart(job: Job, part: unknown, context: WorldContext): Fail[] {
  const { roster, bible } = context;
  const fails: Fail[] = [];
  // A count the pack cannot be built without blocks the build if the part's one repair does not fix it.
  const fail = (check: string, row: string, message: string, blocking = false) =>
    fails.push({ check, row, message, job: job.name, ...(blocking ? { blocking } : {}) });
  const cards = (rows: (GroupRow | FactionRow)[]) => {
    for (const id of job.ids ?? []) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) fail("W2", id, `no row for ${id}; write exactly one row for each id listed`);
      else if (!toGlance(row))
        fail(
          "W7",
          id,
          "the card breaks its shape: 1 to 3 wants and 1 to 3 hates, each tag at most 48 characters, exactly one hate with red_line true, and a strike line",
        );
    }
  };
  switch (job.kind) {
    case "groups":
      cards((part as Parts["groups"]).groups);
      break;
    case "chamber":
      cards((part as Parts["chamber"]).chamber.factions);
      break;
    case "factions":
      cards((part as Parts["factions"]).factions);
      break;
    case "briefing": {
      const written = part as Parts["briefing"];
      if (written.pledges.length !== 8)
        fail("W6", "pledges", `${written.pledges.length} pledges; write exactly 8`, true);
      if (written.problems.length < 8 || written.problems.length > 12)
        fail("W6", "problems", `${written.problems.length} problems; write 8 to 12`, true);
      const targets = new Set([
        ...roster.groups.map((group) => group.id),
        ...bible.regions.map((region) => region.id),
      ]);
      for (const pledge of written.pledges)
        if (!targets.has(pledge.for))
          fail(
            "W6",
            "pledges",
            `pledge "${pledge.text}" is for ${pledge.for}, which is not a group, chamber bloc or region id`,
          );
      const tags = written.pledges.map((pledge) => fold(pledge.tag));
      if (new Set(tags).size !== tags.length)
        fail("W6", "pledges", "two pledges share a tag; each tag is unique");
      if (isGrounded(context.plan, roster)) {
        const verified = written.pledges.filter((pledge) =>
          quoted(pledge.quote, pledge.doc, context.gathered.docs),
        ).length;
        if (verified < 4)
          fail(
            "W10",
            "pledges",
            `${verified} of 8 pledges quote ${roster.ruler.name}'s own promise word for word from its numbered document; at least 4 must, so give 5 real promises with exact quotes`,
          );
      }
      break;
    }
    case "instruments": {
      const listed = new Set(
        Object.values((part as Parts["instruments"]).instruments).flatMap(
          (instrument) => instrument.vetoes,
        ),
      );
      for (const group of roster.groups)
        if (group.seats === null && group.veto && !listed.has(group.id))
          fail("W5", group.id, `${group.id} has a veto in the roster but no act lists it`);
      break;
    }
    case "systems": {
      const written = part as Parts["systems"];
      if (written.blocs.length !== 5)
        fail("W11", "blocs", `${written.blocs.length} blocs; write exactly 5`, true);
      if (written.patrons.length !== 10)
        fail("W11", "patrons", `${written.patrons.length} patrons; write exactly 10`, true);
      const tags = new Set(written.tags.map(fold)).size;
      if (tags < 16) fail("W11", "tags", `${tags} different tags; write 16 to 20`, true);
      const keys = new Set(written.escalations.map((escalation) => escalation.key));
      const missing = ESCALATION_KEYS.filter((key) => !keys.has(key));
      if (missing.length)
        fail("W11", "escalations", `missing escalation keys: ${missing.join(", ")}`);
      const rows = new Set(written.regions.map((region) => region.id));
      const unwritten = bible.regions
        .filter((region) => !rows.has(region.id))
        .map((region) => region.id);
      if (unwritten.length)
        fail("W11", "regions", `no weight and lean for regions ${unwritten.join(", ")}`);
      break;
    }
  }
  return fails;
}

// Each id from the chunk that owns it; else from any chunk that wrote it (lesson 25); else missing.
export function mergeWorld(
  roster: Roster,
  bible: Bible,
  parts: Record<string, unknown>,
  jobs: Job[],
): World {
  const rowFinder = <T extends { id: string }>(
    kinds: PartKind[],
    read: (part: any) => T[] | undefined,
  ) => {
    const owners = jobs.filter((job) => kinds.includes(job.kind));
    return (id: string): T | undefined => {
      const owner = owners.find((job) => job.ids?.includes(id));
      const own = owner ? read(parts[owner.name])?.find((row) => row.id === id) : undefined;
      return (
        own ??
        owners.map((job) => read(parts[job.name])?.find((row) => row.id === id)).find(Boolean)
      );
    };
  };
  const groupRow = rowFinder<GroupRow>(["groups"], (part) => part?.groups);
  const factionRow = rowFinder<FactionRow>(
    ["chamber", "factions"],
    (part) => part?.chamber?.factions ?? part?.factions,
  );
  const present = <T>(row: T | undefined): row is T => !!row;
  const chamber = parts.chamber as Parts["chamber"] | undefined;
  return {
    bible,
    groups: roster.groups
      .filter((group) => group.seats === null)
      .map((group) => groupRow(group.id))
      .filter(present),
    chamber: chamber
      ? {
          ...chamber.chamber,
          factions: roster.groups
            .filter((group) => group.seats !== null)
            .map((group) => factionRow(group.id))
            .filter(present),
        }
      : null,
    briefing: parts.briefing as Parts["briefing"],
    ledgers: (parts.ledgers as Parts["ledgers"]).ledgers,
    instruments: (parts.instruments as Parts["instruments"]).instruments,
    systems: parts.systems as Parts["systems"],
    theme: (parts.theme as Parts["theme"] | undefined)?.theme ?? null,
  };
}
