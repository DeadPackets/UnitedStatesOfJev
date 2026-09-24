// Code checks on the plan and the roster (lesson 11: code, not the model, catches the errors). Each failure names its
// check, its row and what to fix, in words the repair call reads. A blocking failure stops the build: the pack cannot
// be assembled around it.
import type { Gathered } from "./gather";
import { hasChamber, type Fail, type Plan, type Roster } from "./schemas";
import { compareDates } from "./wikidata";
import type { Doc } from "./wikipedia";

export type RosterContext = { plan: Plan; gathered: Gathered };

// Lesson 17 and the pack's own limit: at most 10 groups on the desk, the chamber included.
export const MAX_HOLDERS = 10;
export const MAX_HOME = 8;
export const MAX_ABROAD = 5;
export const MIN_HOLDERS = 3;

export const fold = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

// A quote passes when each piece between ellipses appears in the named document.
export function quoted(quote: string | null, doc: number | null, docs: Doc[]): boolean {
  const source = docs.find((candidate) => candidate.index === doc);
  if (!quote || !source) return false;
  const text = fold(source.text);
  const pieces = quote
    .split(/\.\.\.|…/)
    .map((piece) =>
      fold(piece)
        .replace(/^["']|["']$/g, "")
        .trim(),
    )
    .filter((piece) => piece.length > 2);
  return pieces.length > 0 && pieces.every((piece) => text.includes(piece));
}

const SMALL_WORDS = new Set([
  "the",
  "of",
  "and",
  "de",
  "al",
  "el",
  "in",
  "for",
  "to",
  "on",
  "a",
  "an",
  "la",
  "le",
  "du",
  "von",
  "van",
]);
// A Worker has no dictionary file (Decision 13), so the documents are the dictionary: a word they use in lower case is common.
export const lowerWordsOf = (docs: Doc[]): Set<string> =>
  new Set(docs.flatMap((doc) => doc.text.match(/\b[a-z][a-z']*\b/g) ?? []));
const isCommon = (word: string, lower: Set<string>) =>
  [word, word.replace(/s$/, ""), word.replace(/es$/, ""), word.replace(/ies$/, "y")].some((form) =>
    lower.has(form),
  );
export const hasProperNoun = (name: string, lower: Set<string>): boolean =>
  name
    .replace(/[(),'".]/g, " ")
    .split(/[\s-]+/)
    .some(
      (word) =>
        /^\p{Lu}/u.test(word) &&
        !SMALL_WORDS.has(word.toLowerCase()) &&
        !isCommon(word.toLowerCase(), lower),
    );

const GENERIC_NAME =
  /^(the )?(people|public|masses|street|garrison|caste|undergrounds|militias|army|military|nobles|nobility|clergy|merchants|peasants|workers|elders|court|palace|opposition|rebels|loyalists|moderates|radicals|hardliners|reformers|conservatives)$/i;
const JOB_WORD = /\b(guild|directorate|council|committee|caste)\b/i;
// The Brexit build named its public "Leave voters": one side of the divide, not the whole public.
const PUBLIC_CAMP =
  /\b(leave|remain|supporters|loyalists|camp|faction|wing|backers|opponents|partisans|voters)\b/i;
const CLOSED_KINDS = [1, 6, 7];

const bare = (value: string) =>
  fold(value)
    .replace(/\([^)]*\)/g, "")
    .replace(/^the /, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const covers = (group: { name: string; wiki?: string | null }, title: string) => {
  const target = bare(title);
  if (!target) return false;
  return [group.name, group.wiki ?? ""].some((name) => {
    const own = bare(name);
    return !!own && (own === target || own.includes(target) || target.includes(own));
  });
};

// How the roster fills the desk: one holder per group without seats, plus the chamber as one home holder.
export function holderCounts(roster: Roster) {
  const rows = roster.groups.filter((group) => group.seats === null);
  const chamber = hasChamber(roster) ? 1 : 0;
  const home = rows.filter((group) => group.sits === "home").length + chamber;
  const chamberVotes = roster.groups
    .filter((group) => group.seats !== null)
    .some((group) => group.vote_share > 0);
  return {
    total: rows.length + chamber,
    home,
    abroad: rows.length + chamber - home,
    voting: rows.filter((group) => group.vote_share > 0).length + (chamber && chamberVotes ? 1 : 0),
    court: rows.filter((group) => group.sits === "home" && group.kind === "actor").length,
  };
}

// Decision 8: the pledge rule holds for recorded and near-recorded kinds whose ruler is a documented person.
export const isGrounded = (plan: Plan, roster: Roster): boolean =>
  plan.kind <= 5 && !!roster.ruler.name && !!roster.ruler.wiki;

export function checkPlanSeat(prompt: string, plan: Plan): Fail[] {
  // A seat the prompt does not contain is the model's invention, not the player's words.
  if (!plan.prompt_seat || !fold(prompt).includes(fold(plan.prompt_seat))) return [];
  const words = (value: string) =>
    fold(value)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3);
  const named = words(plan.prompt_seat);
  const seat = new Set(
    words(`${plan.seat.office} ${plan.seat.holder ?? ""} ${plan.seat.holder_wiki ?? ""}`),
  );
  if (!named.length || named.some((word) => seat.has(word))) return [];
  return [
    {
      check: "P1",
      row: "seat",
      message: `the prompt names "${plan.prompt_seat}" as the player's seat, but the plan seats ${plan.seat.office}${plan.seat.holder ? ` (${plan.seat.holder})` : ""}; the player holds exactly the seat the prompt names, as that person`,
    },
  ];
}

// One month after a date: a ruler whose start is a month before Wikidata's still counts (Cecil: 20 against 22 November 1558).
function monthLater(date: string): string {
  const negative = date.startsWith("-");
  const [year, month] = date.replace(/^-/, "").split("-").map(Number);
  if (!month) return date;
  const nextYear = month === 12 ? year + 1 : year;
  return `${negative ? "-" : ""}${nextYear}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}`;
}

export function checkRoster(roster: Roster, context: RosterContext): Fail[] {
  const { plan, gathered } = context;
  const kind = plan.kind;
  const start = plan.start_date;
  const fails: Fail[] = [];
  const fail = (check: string, row: string, message: string, extra: Partial<Fail> = {}) =>
    fails.push({ check, row, message, ...extra });
  const ids = new Set(roster.groups.map((group) => group.id));
  const factsOf = (wiki: string | null) => {
    const qid = wiki ? gathered.qids[wiki] : null;
    return qid ? gathered.facts[qid] : undefined;
  };
  const lower = lowerWordsOf(gathered.docs);
  const homeQids = new Set(gathered.homeQids);
  const seen = new Set<string>();

  for (const group of roster.groups) {
    if (seen.has(group.id)) fail("C12", group.id, "duplicate id");
    seen.add(group.id);
    // C1: quotes are copied word for word from the named document.
    if (
      group.grounding !== "premise" &&
      group.grounding !== "divergent" &&
      !quoted(group.quote, group.doc, gathered.docs)
    )
      fail(
        "C1",
        group.id,
        `quote not found word for word in document ${group.doc}: ${JSON.stringify(group.quote)}`,
        {
          docs: group.doc ? [group.doc] : [],
        },
      );
    if (
      group.seats !== null &&
      [1, 3].includes(kind) &&
      !quoted(group.seats_quote, group.seats_doc, gathered.docs)
    )
      fail(
        "C1",
        group.id,
        `seats quote not found in document ${group.seats_doc}: ${JSON.stringify(group.seats_quote)}`,
        {
          docs: group.seats_doc ? [group.seats_doc] : [],
        },
      );
    // C2: closed worlds are record or canon.
    if (CLOSED_KINDS.includes(kind) && !["record", "canon"].includes(group.grounding))
      fail(
        "C2",
        group.id,
        `closed world (kind ${kind}): grounding must be record or canon, not ${group.grounding}`,
      );
    if ([2, 3, 5].includes(kind) && !["record", "canon", "divergent"].includes(group.grounding))
      fail(
        "C2",
        group.id,
        `grounding ${group.grounding} is not allowed in kind ${kind}: record, or divergent with descends_from`,
      );
    if (kind === 4 && !["record", "premise"].includes(group.grounding))
      fail("C2", group.id, "kind 4: record, or premise for the fantastic element's own groups");
    // C3: an invented group in an open world is tied to an analogue and carries a proper noun of the world.
    if (kind >= 8 && !["record", "canon"].includes(group.grounding)) {
      if (!["analogue", "biology", "anthropology", "premise"].includes(group.grounding))
        fail(
          "C3",
          group.id,
          "open world: an invented group's grounding is analogue, biology, anthropology or premise",
        );
      if (!hasProperNoun(group.name, lower))
        fail(
          "C3",
          group.id,
          `name "${group.name}" has no proper noun from the world (a founder, place, document or ship)`,
        );
    }
    // C4: Wikidata's dates win over the model's.
    const facts = factsOf(group.wiki);
    const founded = facts?.founded ?? group.founded;
    const dissolved = facts?.dissolved ?? group.dissolved;
    const at = kind === 2 && plan.divergence ? plan.divergence : start;
    if ([1, 2, 3, 4].includes(kind) && group.grounding === "record") {
      if (founded && compareDates(founded, at) > 0)
        fail(
          "C4",
          group.id,
          `founded ${founded}${facts?.founded ? " (Wikidata)" : ""} after ${at}`,
        );
      // A quoted line dated in the start year outweighs a Wikidata dissolution (the Ottoman Senate, recalled in 1908).
      const year = at.replace(/^(-?\d+).*/, "$1");
      const datedQuote =
        !!group.quote &&
        group.quote.includes(year) &&
        quoted(group.quote, group.doc, gathered.docs);
      if (kind !== 2 && dissolved && compareDates(dissolved, at) < 0 && !datedQuote)
        fail(
          "C4",
          group.id,
          `dissolved ${dissolved}${facts?.dissolved ? " (Wikidata)" : ""} before ${at}; fix the row, or quote a line dated ${year} that shows it active`,
        );
    }
    // C7: only P1001 (applies to jurisdiction) decides; P17 and the seat's country carry modern and ancient states.
    if (
      [1, 2, 3, 4, 5].includes(kind) &&
      facts &&
      homeQids.size &&
      group.sits === "home" &&
      facts.jurisdiction.length &&
      !facts.jurisdiction.some((qid) => homeQids.has(qid))
    )
      fail(
        "C7",
        group.id,
        `sits home, but Wikidata gives its jurisdiction as ${facts.places.filter((place) => facts.jurisdiction.some((qid) => place.startsWith(`${qid}:`))).join(", ")}`,
      );
    if ([8, 9, 13].includes(kind) && group.type === "foreign" && group.sits !== "abroad")
      fail("C7", group.id, "a sponsor or foreign power sits abroad");
    // C9: a divergent group descends from a sourced one.
    if (group.grounding === "divergent") {
      const from = group.descends_from;
      const parent = roster.groups.find(
        (other) => other.id === from || (from && covers(other, from)),
      );
      const sourced = !!from && gathered.docs.some((doc) => covers({ name: doc.title }, from));
      if (!sourced && (!parent || !["record", "canon"].includes(parent.grounding)))
        fail(
          "C9",
          group.id,
          `descends_from ${JSON.stringify(from)} is neither a sourced group in the roster nor a fetched page`,
        );
    }
    // C10, C11: names.
    const recorded = ["record", "canon"].includes(group.grounding) && !!group.wiki;
    if (
      GENERIC_NAME.test(group.name.trim()) ||
      (JOB_WORD.test(group.name) && !hasProperNoun(group.name, lower) && !recorded)
    )
      fail("C10", group.id, `generic name "${group.name}"`);
    if ([11, 12].includes(kind) && /\b(party|parliament|election|senate)\b/i.test(group.name))
      fail("C11", group.id, `era word in "${group.name}"`);
    // C12: links.
    if (!group.wants.trim()) fail("C12", group.id, "no wants");
    if (!ids.has(group.rival) || group.rival === group.id)
      fail("C12", group.id, `rival ${JSON.stringify(group.rival)} is not another group id`);
  }

  // C5: every active combatant and swept group is a row or excluded for a reason that is not its dates.
  if ([1, 2, 3, 4].includes(kind))
    for (const title of gathered.checklist) {
      const excluded = roster.excluded.find((row) => covers({ name: row.name }, title));
      const span = gathered.spans[title];
      if (!roster.groups.some((group) => covers(group, title)) && !excluded)
        fail(
          "C5",
          title,
          `"${title}" (a combatant or category member active on the date) is neither a group nor excluded with a reason`,
        );
      else if (
        excluded &&
        span &&
        compareDates(span[0], start) <= 0 &&
        compareDates(span[1], start) >= 0 &&
        /not active|inactive|defunct|dissolved|disbanded|ended|no longer|revolt-era|not yet|dormant|lapsed/i.test(
          excluded.why,
        )
      )
        fail(
          "C5",
          title,
          `excluded as "${excluded.why}", but its dates (${span[0]} to ${span[1]}) cover ${start}; make it a group, or exclude it for a reason other than dates`,
        );
    }

  // C6 and C12: the chamber's seats.
  const seatRows = roster.groups.filter((group) => group.seats !== null);
  if (roster.chamber) {
    const sum = seatRows.reduce((total, group) => total + (group.seats ?? 0), 0);
    // Sources' own splits may not add up (the 1908 Chamber's ethnic counts sum to 288 of 275): recorded kinds get 10%.
    const recordedKind = [1, 3].includes(kind);
    const allowed = recordedKind ? Math.floor(roster.chamber.real_size * 0.1) : 0;
    if (Math.abs(sum - roster.chamber.real_size) > allowed)
      fail(
        recordedKind ? "C6" : "C12",
        "chamber",
        `seats sum to ${sum}, chamber real_size is ${roster.chamber.real_size}${allowed ? ` (allowed within ${allowed})` : ""}`,
      );
    if (recordedKind && compareDates(roster.chamber.as_of, plan.term_end) > 0)
      fail(
        "C6",
        "chamber",
        `composition as_of ${roster.chamber.as_of} is after the term ends ${plan.term_end}`,
      );
    if (recordedKind && !quoted(roster.chamber.quote, roster.chamber.doc, gathered.docs))
      fail("C1", "chamber", `chamber quote not found in document ${roster.chamber.doc}`, {
        docs: roster.chamber.doc ? [roster.chamber.doc] : [],
      });
    if (!seatRows.length) fail("C12", "chamber", "a chamber exists but no group has seats");
  } else if (seatRows.length) fail("C12", "chamber", "groups have seats but chamber is null");

  // C8: the ruler holds the seat on the start date, by Wikidata.
  const diverged = kind === 2 && !!plan.divergence && compareDates(start, plan.divergence) > 0;
  if ([1, 2, 3, 4].includes(kind) && roster.ruler.name && !diverged) {
    const facts = factsOf(roster.ruler.wiki);
    if (!facts)
      fail(
        "C8",
        "ruler",
        `no Wikidata record for the ruler's wiki title ${JSON.stringify(roster.ruler.wiki)}`,
      );
    else {
      if (facts.died && compareDates(facts.died, start) < 0)
        fail("C8", "ruler", `${facts.label} died ${facts.died}, before ${start}`);
      // Only offices that share a word with the seat count: Johnson's seat in the 57th Parliament is not his premiership.
      const words = (value: string) =>
        new Set(
          fold(value)
            .split(/[^a-z]+/)
            .filter(
              (word) =>
                word.length > 3 &&
                !["united", "kingdom", "empire", "state", "states"].includes(word),
            ),
        );
      const seat = words(roster.ruler.office);
      const mine = facts.positions.filter((position) =>
        [...words(position.position)].some((word) => seat.has(word)),
      );
      const held = mine.filter(
        (position) =>
          position.from &&
          compareDates(position.from, monthLater(start)) <= 0 &&
          (!position.to || compareDates(position.to, start) >= 0),
      );
      if (mine.some((position) => position.from) && !held.length)
        fail(
          "C8",
          "ruler",
          `Wikidata shows the seat not held on ${start}: ${mine.map((position) => `${position.position} ${position.from}..${position.to}`).join("; ")}`,
        );
      const falls = held.filter(
        (position) => position.to && compareDates(position.to, plan.term_end) < 0,
      );
      if (falls.length && !roster.fall)
        fail(
          "C8",
          "fall",
          `Wikidata ends ${falls[0].position} on ${falls[0].to}, inside the term (to ${plan.term_end}); set fall`,
        );
    }
  }

  // C12: the ruler's links.
  if (roster.ruler.above && !ids.has(roster.ruler.above))
    fail("C12", "ruler", `ruler.above ${roster.ruler.above} is not a group id`);
  const own = roster.groups.find((group) => group.id === roster.ruler.own_group);
  if (!own || own.kind === "public")
    fail(
      "C12",
      "ruler",
      `own_group ${JSON.stringify(roster.ruler.own_group)} must be the id of the player's own side, never the public`,
      { blocking: true },
    );
  if (roster.ruler.backer !== null) {
    const backer = roster.groups.find((group) => group.id === roster.ruler.backer);
    if (!backer || backer.seats !== null || backer.sits !== "home" || backer.kind === "public")
      fail(
        "C12",
        "ruler",
        `backer ${JSON.stringify(roster.ruler.backer)} must be a home group without seats, or null`,
      );
  }

  // C13: support judged per group (lesson 15).
  const unseated = roster.groups.filter((group) => group.seats === null);
  for (const group of unseated)
    if (group.support < 30 || group.support > 70)
      fail("C13", group.id, `support ${group.support} is outside 30 to 70`);
  const bySupport = new Map<number, string[]>();
  for (const group of unseated)
    bySupport.set(group.support, [...(bySupport.get(group.support) ?? []), group.id]);
  for (const [value, sharing] of bySupport)
    if (sharing.length > 2)
      fail(
        "C13",
        sharing.join(","),
        `${sharing.length} groups share support ${value}; at most 2 may, so judge each one for this ruler at this date`,
      );
  const values = unseated.map((group) => group.support);
  if (values.length && Math.max(...values) - Math.min(...values) < 25)
    fail(
      "C13",
      "support",
      `support spans ${Math.max(...values) - Math.min(...values)} points; it must span at least 25`,
    );

  // C14: actors and one public group, which is the whole public (lesson 14).
  const publicIds = roster.groups
    .filter((group) => group.kind === "public")
    .map((group) => group.id);
  if (publicIds.length !== 1)
    fail(
      "C14",
      publicIds.join(",") || "public",
      `${publicIds.length} public groups; exactly one group stands for the people at large`,
      { blocking: true },
    );
  for (const group of roster.groups) {
    if ((group.name.match(/ and /g)?.length ?? 0) + (group.name.match(/, /g)?.length ?? 0) >= 2)
      fail(
        "C14",
        group.id,
        `"${group.name}" joins 3 or more bodies; merge only bodies under one command, at most two names`,
      );
    if (group.kind === "public" && PUBLIC_CAMP.test(group.name))
      fail(
        "C14",
        group.id,
        `the public group "${group.name}" reads as one side; name the whole population as the period would ("the people of Palestine", "the British public")`,
      );
  }

  // C15: the desk's counts (lesson 17; W9 moved here, since a world repair cannot fix them).
  const counts = holderCounts(roster);
  const tooMany =
    "merge bodies under one command, or remove the least important group and add it to excluded as an outside power";
  if (counts.total > MAX_HOLDERS)
    fail(
      "C15",
      "groups",
      `${counts.total} groups would sit on the desk (the chamber counts as one); at most ${MAX_HOLDERS}: ${tooMany}`,
      { blocking: true },
    );
  if (counts.home > MAX_HOME)
    fail(
      "C15",
      "groups",
      `${counts.home} groups sit at home (the chamber counts as one); at most ${MAX_HOME}: ${tooMany}`,
    );
  if (counts.abroad > MAX_ABROAD)
    fail("C15", "groups", `${counts.abroad} groups sit abroad; at most ${MAX_ABROAD}: ${tooMany}`);
  if (counts.abroad < 1)
    fail(
      "C15",
      "groups",
      "no group sits abroad; add the foreign power, sponsor or neighbour that matters most",
    );
  if (counts.total < MIN_HOLDERS)
    fail("C15", "groups", `${counts.total} groups on the desk; at least ${MIN_HOLDERS}`, {
      blocking: true,
    });
  if (counts.voting < 2)
    fail(
      "C15",
      "groups",
      "fewer than two groups vote in the final test; give vote_share to the groups that decide whether the player stays",
    );
  if (!hasChamber(roster) && counts.court < 2)
    fail(
      "C15",
      "groups",
      "no chamber votes, so the court is the home groups that act; at least two are needed",
      { blocking: true },
    );
  // The pack holds 2 to 12 factions.
  if (hasChamber(roster) && (seatRows.length < 2 || seatRows.length > 12))
    fail(
      "C15",
      "chamber",
      `${seatRows.length} chamber blocs; write 2 to 12 (split one label by the lines deputies voted on, or merge the smallest)`,
      { blocking: true },
    );
  return fails;
}

// The last word on counts after the repair: move the least important groups out as outside powers, never the one above
// the seat, the backer, the player's own side, the public, or a group with a veto or the power to dismiss.
export function fitHolderCount(roster: Roster): Roster {
  const kept = new Set(
    [roster.ruler.above, roster.ruler.backer, roster.ruler.own_group].filter(Boolean),
  );
  let fitted = roster;
  for (;;) {
    const counts = holderCounts(fitted);
    const side =
      counts.abroad > MAX_ABROAD
        ? "abroad"
        : counts.home > MAX_HOME
          ? "home"
          : counts.total > MAX_HOLDERS
            ? counts.abroad > 1
              ? "abroad"
              : "home"
            : null;
    if (!side) return fitted;
    const movable = fitted.groups
      .map((group, order) => ({ group, order }))
      .filter(
        ({ group }) =>
          group.seats === null &&
          group.sits === side &&
          group.kind === "actor" &&
          !kept.has(group.id) &&
          !group.veto &&
          !group.can_dismiss,
      )
      // The lowest vote goes first; on a tie, the later row, since the roster lists the groups that matter first.
      .sort((a, b) => a.group.vote_share - b.group.vote_share || b.order - a.order);
    const out = movable[0]?.group;
    if (!out) return fitted;
    fitted = {
      ...fitted,
      groups: fitted.groups.filter((group) => group.id !== out.id),
      excluded: [
        ...fitted.excluded,
        { name: out.name, why: "outside power: the desk holds at most 10 groups" },
      ],
    };
  }
}
