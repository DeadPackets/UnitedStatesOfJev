// Wikidata facts for the roster checks: a Wikipedia title's QID through pageprops (never a label search, which mixed up
// the Najjada and Najdat), founding and dissolution dates, birth and death, places, and the offices a person held. Also
// the capped category sweep and each swept title's intro with its short description, which carries its dates.
import { getJson } from "./wikipedia";

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php?format=json&formatversion=2&redirects=1";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php?format=json&languages=en";
const SWEEP_PER_CATEGORY = 50; // lesson 9
const SWEEP_TITLES = 180; // lesson 9
const SWEEP_CATEGORIES = 8;

export type WikidataFacts = {
  qid: string;
  label: string;
  founded: string | null;
  dissolved: string | null;
  born: string | null;
  died: string | null;
  places: string[];
  jurisdiction: string[];
  positions: { position: string; from: string | null; to: string | null }[];
};

const inChunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

export async function qidsOf(
  titles: string[],
): Promise<Map<string, { title: string; qid: string | null }>> {
  const found = new Map<string, { title: string; qid: string | null }>();
  for (const batch of inChunks([...new Set(titles)], 50)) {
    const reply = await getJson(
      `${WIKIPEDIA_API}&action=query&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(batch.join("|"))}`,
    );
    const renamed = new Map<string, string>();
    for (const step of [...(reply.query?.normalized ?? []), ...(reply.query?.redirects ?? [])])
      renamed.set(step.from, step.to);
    const pages = new Map<string, any>(
      (reply.query?.pages ?? []).map((page: any) => [page.title, page]),
    );
    for (const title of batch) {
      let target = title;
      for (let hops = 0; hops < 3 && renamed.has(target); hops++) target = renamed.get(target)!;
      const page = pages.get(target);
      found.set(title, {
        title: target,
        qid: page && !page.missing ? (page.pageprops?.wikibase_item ?? null) : null,
      });
    }
  }
  return found;
}

// A Wikidata time at its own precision: day (11), month (10) or year (9 and coarser). BC years keep their minus sign.
export function formatTime(
  value: { time?: string; precision?: number } | undefined,
): string | null {
  const match = value?.time?.match(/^([+-])(\d+)-(\d\d)-(\d\d)/);
  if (!match) return null;
  const year = (match[1] === "-" ? "-" : "") + match[2].replace(/^0+(?=\d{4})/, "");
  const precision = value?.precision ?? 9;
  return precision >= 11
    ? `${year}-${match[3]}-${match[4]}`
    : precision === 10
      ? `${year}-${match[3]}`
      : year;
}

async function entities(ids: string[]): Promise<Map<string, any>> {
  const found = new Map<string, any>();
  for (const batch of inChunks([...new Set(ids.filter(Boolean))], 50)) {
    const reply = await getJson(
      `${WIKIDATA_API}&action=wbgetentities&ids=${batch.join("|")}&props=claims|labels`,
    );
    for (const [id, entity] of Object.entries(reply.entities ?? {})) found.set(id, entity);
  }
  return found;
}

const claimValues = (entity: any, property: string) =>
  (entity?.claims?.[property] ?? [])
    .filter((claim: any) => claim.rank !== "deprecated")
    .map((claim: any) => claim.mainsnak?.datavalue?.value);
const claimIds = (entity: any, property: string): string[] =>
  claimValues(entity, property)
    .map((value: any) => value?.id)
    .filter(Boolean);
const COUNTRY_CLASSES = new Set([
  "Q3624078",
  "Q6256",
  "Q3024240",
  "Q7275",
  "Q1763527",
  "Q417175",
  "Q48349",
]);

// Dates, places (P1001, P17 and the country of the P159 seat) and offices held (P39), with labels.
export async function wikidataFacts(qids: string[]): Promise<Map<string, WikidataFacts>> {
  const main = await entities(qids);
  const seats = await entities([...main.values()].flatMap((entity) => claimIds(entity, "P159")));
  const labelled = await entities(
    [
      ...[...main.values()].flatMap((entity) => [
        ...claimIds(entity, "P39"),
        ...claimIds(entity, "P1001"),
        ...claimIds(entity, "P17"),
      ]),
      ...[...seats.values()].flatMap((entity) => claimIds(entity, "P17")),
    ].filter((qid) => !main.has(qid)),
  );
  const lookup = (qid: string) => main.get(qid) ?? labelled.get(qid) ?? seats.get(qid);
  const label = (qid: string): string => lookup(qid)?.labels?.en?.value ?? qid;
  const isCountry = (qid: string) =>
    claimIds(lookup(qid), "P31").some((kind) => COUNTRY_CLASSES.has(kind));
  const found = new Map<string, WikidataFacts>();
  for (const [qid, entity] of main) {
    const places = [
      ...claimIds(entity, "P1001"),
      ...claimIds(entity, "P17"),
      ...claimIds(entity, "P159"),
    ];
    found.set(qid, {
      qid,
      label: label(qid),
      founded: formatTime(claimValues(entity, "P571")[0]),
      dissolved: formatTime(claimValues(entity, "P576")[0]),
      born: formatTime(claimValues(entity, "P569")[0]),
      died: formatTime(claimValues(entity, "P570")[0]),
      places: [...new Set(places)].map((place) => `${place}:${label(place)}`),
      jurisdiction: claimIds(entity, "P1001").filter(isCountry),
      positions: (entity.claims?.P39 ?? []).map((claim: any) => ({
        position: label(claim.mainsnak?.datavalue?.value?.id),
        from: formatTime(claim.qualifiers?.P580?.[0]?.datavalue?.value),
        to: formatTime(claim.qualifiers?.P582?.[0]?.datavalue?.value),
      })),
    });
  }
  return found;
}

// Compares two dates at the coarser precision of the two, so "1908" equals "1908-08-05". Negative years are BC.
export function compareDates(first: string, second: string): number {
  const parts = (date: string) => date.replace(/^-/, "").split("-").length;
  const precision = Math.min(parts(first), parts(second));
  const key = (date: string) => {
    const negative = date.startsWith("-");
    const [year, month = 0, day = 0] = date
      .replace(/^-/, "")
      .split("-")
      .slice(0, precision)
      .map(Number);
    return (negative ? -year : year) * 10000 + month * 100 + day;
  };
  return key(first) - key(second);
}

// The named categories plus one level of political or armed subcategories, 50 members each and 180 titles in all.
export async function sweepCategories(
  names: string[],
): Promise<{ categories: string[]; titles: string[] }> {
  const seen = new Set<string>();
  const titles = new Set<string>();
  const used: string[] = [];
  const queue = names.map((name) => (name.startsWith("Category:") ? name : `Category:${name}`));
  while (queue.length && used.length < SWEEP_CATEGORIES) {
    const category = queue.shift()!;
    if (seen.has(category)) continue;
    seen.add(category);
    const reply = await getJson(
      `${WIKIPEDIA_API}&action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=200&cmnamespace=0|14`,
    ).catch(() => null);
    const members = reply?.query?.categorymembers ?? [];
    if (!members.length) continue;
    used.push(category);
    for (const member of members.slice(0, SWEEP_PER_CATEGORY)) {
      if (member.ns === 14) {
        if (
          / (in|of) /.test(member.title) &&
          !/attack|member|people|politicians|operation|battle|history|by |incident|bombing|assassinat/i.test(
            member.title,
          ) &&
          /politic|militant|paramilitar|armed|insurg|rebel|resistance|guerr|youth organi|jewish organi|arab organi/i.test(
            member.title,
          ) &&
          names.length + used.length < 12
        )
          queue.push(member.title);
      } else if (!/^List of/.test(member.title)) titles.add(member.title);
    }
  }
  return { categories: used, titles: [...titles].slice(0, SWEEP_TITLES) };
}

// Each title's short description in brackets ("[Palestinian militant group, 1935–1948]"), then the first 200 characters
// of its intro: enough to judge it and to quote it. The whole 500-character intro made Ottoman's sweep 71k characters.
export async function intros(titles: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const batch of inChunks(titles, 20)) {
    const reply = await getJson(
      `${WIKIPEDIA_API}&action=query&prop=extracts|pageprops&ppprop=wikibase-shortdesc&exintro=1&explaintext=1&exlimit=20&titles=${encodeURIComponent(batch.join("|"))}`,
    );
    for (const page of reply.query?.pages ?? []) {
      if (!page.extract) continue;
      const described = page.pageprops?.["wikibase-shortdesc"];
      found.set(
        page.title,
        `${described ? `[${described}] ` : ""}${page.extract.replace(/\s+/g, " ").slice(0, 200)}`,
      );
    }
  }
  return found;
}
