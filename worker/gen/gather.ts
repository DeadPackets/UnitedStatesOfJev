// Research for one prompt: the plan's Wikipedia (or Fandom canon) pages, a capped category sweep for the groups of the
// polity with each title's short description, and Wikidata dates and offices for every body and person found. The
// result is plain JSON so a Workflow step can return it.
import type { Plan } from "./schemas";
import {
  compareDates,
  intros,
  qidsOf,
  sweepCategories,
  wikidataFacts,
  type WikidataFacts,
} from "./wikidata";
import { allowedHost, fetchPage, getJson, type Doc } from "./wikipedia";

const WIKIPEDIA = "en.wikipedia.org";
const PAGE_CHARACTERS = 12000;
const TOTAL_CHARACTERS = 120000;
export const SWEEP_TITLE = "Category sweep"; // the roster's checklist; the world calls read the closed roster instead

export type Gathered = {
  docs: Doc[];
  qids: Record<string, string | null>; // Wikipedia title to QID
  facts: Record<string, WikidataFacts>; // by QID
  homeQids: string[];
  spans: Record<string, [string, string]>; // a checklist title's active years
  checklist: string[]; // combatants and swept groups active on the start date: each a roster row or excluded
  wikidataTable: string;
  sweepCategories: string[];
};

// The page by its exact title, else the first search hit on the same wiki.
async function findPage(host: string, title: string, keywords: string[]) {
  const page = await fetchPage(host, title, keywords, PAGE_CHARACTERS);
  if (page || !allowedHost(host)) return page;
  const api = `https://${host}/${host === WIKIPEDIA ? "w/" : ""}api.php`;
  const search = await getJson(
    `${api}?action=query&list=search&srsearch=${encodeURIComponent(title)}&srlimit=1&format=json&formatversion=2`,
  ).catch(() => null);
  const hit = search?.query?.search?.[0]?.title;
  return hit ? fetchPage(host, hit, keywords, PAGE_CHARACTERS) : null;
}

export async function gather(plan: Plan): Promise<Gathered> {
  const wanted: [string, string][] = [
    ...[...plan.lookups, ...plan.conflicts, ...plan.analogues].map((title): [string, string] => [
      WIKIPEDIA,
      title,
    ]),
    ...(plan.canon?.titles ?? []).map((title): [string, string] => [plan.canon!.host, title]),
  ];
  const pages = (
    await Promise.all(
      wanted.map(([host, title]) => findPage(host, title, plan.keywords).catch(() => null)),
    )
  ).filter((page): page is NonNullable<typeof page> => !!page);
  const docs: Doc[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const page of pages) {
    if (seen.has(page.source) || total > TOTAL_CHARACTERS) continue;
    seen.add(page.source);
    total += page.text.length;
    docs.push({ ...page, index: docs.length + 1 });
  }
  const conflictTitles = new Set(plan.conflicts.map((title) => title.toLowerCase()));
  const combatants = docs
    .filter(
      (doc) => conflictTitles.has(doc.title.toLowerCase()) || (doc.combatants?.length ?? 0) > 0,
    )
    .flatMap((doc) => doc.combatants ?? []);

  // The plan's categories plus the organisation categories found on the fetched pages of this polity.
  const homes = plan.home_places.map((place) => place.toLowerCase());
  const organisationCategories = [...new Set(docs.flatMap((doc) => doc.categories ?? []))].filter(
    (category) =>
      homes.some((home) => category.toLowerCase().includes(home)) &&
      // Not "politic": for Ottoman it let in "Politics of X" (laws, eras, ideas) and "X politicians" (people).
      /organi[sz]ations|parties|militant|paramilitar|nationalis|insurg|resistance|youth/i.test(
        category,
      ),
  );
  const swept =
    plan.kind <= 5 && (plan.categories.length || organisationCategories.length)
      ? await sweepCategories([...plan.categories, ...organisationCategories].slice(0, 6))
      : { categories: [], titles: [] };

  const people = [
    ...new Set([...(plan.seat.holder_wiki ? [plan.seat.holder_wiki] : []), ...plan.people]),
  ];
  const titles = [
    ...new Set([
      ...people,
      ...plan.home_places,
      ...swept.titles,
      ...combatants,
      ...docs.filter((doc) => doc.source.startsWith("Wikipedia")).map((doc) => doc.title),
    ]),
  ];
  const qids: Record<string, string | null> = {};
  for (const [title, found] of await qidsOf(titles)) qids[title] = found.qid;
  const facts: Record<string, WikidataFacts> = {};
  for (const [qid, fact] of await wikidataFacts([
    ...new Set(Object.values(qids).filter((qid): qid is string => !!qid)),
  ]))
    facts[qid] = fact;
  const factsOf = (title: string) => facts[qids[title] ?? ""];
  const homeQids = plan.home_places
    .map((place) => qids[place])
    .filter((qid): qid is string => !!qid);

  // A body active on the start date. A person is never one: 69 of Ottoman's 158 checklist names were people from the
  // swept categories, and each one cost an excluded row in the roster's answer.
  const active = (title: string) => {
    const fact = factsOf(title);
    if (!fact) return true;
    return (
      !fact.born &&
      (!fact.founded || compareDates(fact.founded, plan.start_date) <= 0) &&
      (!fact.dissolved || compareDates(fact.dissolved, plan.start_date) >= 0)
    );
  };
  const sweptActive = swept.titles.filter(active);
  const spans: Record<string, [string, string]> = {};
  if (sweptActive.length) {
    const intro = await intros(sweptActive);
    // Active years per checklist name: Wikidata first, else the short description's "1935–1948".
    for (const title of sweptActive) {
      const fact = factsOf(title);
      const described = intro.get(title)?.match(/^\[[^\]]*?\b(\d{4})\s*[–-]\s*(\d{4})\b/);
      if (fact?.founded && fact?.dissolved) spans[title] = [fact.founded, fact.dissolved];
      else if (described) spans[title] = [described[1], described[2]];
    }
    const lines = sweptActive.map((title) => {
      const fact = factsOf(title);
      return `- ${title} (${fact?.founded ?? "?"} to ${fact?.dissolved ?? "?"}): ${intro.get(title) ?? ""}`;
    });
    docs.push({
      index: docs.length + 1,
      source: `Wikipedia category sweep: ${swept.categories.join("; ")}`,
      title: SWEEP_TITLE,
      text: lines.join("\n"),
    });
  }
  const checklist = [...new Set([...combatants.filter(active), ...sweptActive])];

  const personLine = (title: string) => {
    const fact = factsOf(title);
    if (!fact) return `${title} | not found`;
    const offices = fact.positions
      .filter((position) => position.from)
      .map((position) => `${position.position} ${position.from} to ${position.to ?? "?"}`)
      .join("; ");
    return `${title} | ${fact.qid} | born ${fact.born ?? "?"} | died ${fact.died ?? "alive"} | offices: ${offices || "none listed"}`;
  };
  const bodyLine = (title: string) => {
    const fact = factsOf(title);
    return fact
      ? `${title} | ${fact.qid} | founded ${fact.founded ?? "?"} | dissolved ${fact.dissolved ?? "?"} | places ${fact.places.join(", ") || "?"}`
      : null;
  };
  const wikidataTable = [
    people.length
      ? `People (title | qid | born | died | offices):\n${people.map(personLine).join("\n")}`
      : "",
    `Bodies (title | qid | founded | dissolved | places):\n${[
      ...new Set([...combatants, ...docs.map((doc) => doc.title), ...sweptActive]),
    ]
      .map(bodyLine)
      .filter(Boolean)
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    docs,
    qids,
    facts,
    homeQids,
    spans,
    checklist,
    wikidataTable,
    sweepCategories: swept.categories,
  };
}

// The documents block every roster and world call reads; cap cuts each document (the world calls read 6,000 each).
export const docBlock = (docs: Doc[], cap = Number.POSITIVE_INFINITY): string =>
  `<documents>\n${docs
    .map(
      (doc) =>
        `<document index="${doc.index}"><source>${doc.source}</source><document_content>\n${doc.text.slice(0, cap)}\n</document_content></document>`,
    )
    .join("\n")}\n</documents>`;
