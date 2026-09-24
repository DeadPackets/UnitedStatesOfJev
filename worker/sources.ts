const UA = "USOJ/1.0 (youssef@ctf.ae)";

async function apiFetch(url: string, fetchImpl: typeof fetch): Promise<any> {
  const r = await fetchImpl(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

// Templates, tables and refs first (they can contain [[links]]), then links, then stray markup.
function stripWikitext(text: string): string {
  let s = text.replace(/^==+\s*[^=]+?\s*==+\s*\n?/, "");
  s = s.replace(/<ref[^>]*\/>/gi, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  s = s.replace(/\{\|[\s\S]*?\|\}/g, "");
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\{\{[^{}]*\}\}/g, "");
  } while (s !== prev);
  s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1");
  s = s.replace(/<[^>]+>/g, "").replace(/'''''|'''|''/g, "");
  s = s.replace(/==+\s*([^=\n]+?)\s*==+/g, "$1");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function pickSections<T extends { line: string }>(sections: T[], keywords: string[]): T[] {
  const scored = sections.map((s, i) => ({
    s,
    i,
    hits: keywords.filter((k) => s.line.toLowerCase().includes(k.toLowerCase())).length,
  }));
  const matched = scored.filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits || a.i - b.i);
  return (matched.length ? matched : scored).slice(0, 3).map((x) => x.s);
}

// `lang` is a model's answer and it becomes the host of every call below, so nothing but a BCP 47 code passes.
const LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;
export const edition = (lang: string) => {
  const s = String(lang ?? "").toLowerCase();
  return LANG.test(s) ? s.split("-")[0] : "en";
};

export async function fetchWikipedia(
  rawLang: string,
  title: string,
  keywords: string[],
  fetchImpl: typeof fetch = fetch,
) {
  const lang = edition(rawLang);
  const base = `https://${lang}.wikipedia.org/w/api.php`;
  const common = "format=json&formatversion=2&origin=*";
  const t = encodeURIComponent(title);
  const lead = await apiFetch(
    `${base}?action=query&prop=extracts&exintro=1&explaintext=1&titles=${t}&${common}`,
    fetchImpl,
  );
  const page = lead.query.pages[0];
  if (page.missing) return null;
  const list = await apiFetch(`${base}?action=parse&page=${t}&prop=sections&${common}`, fetchImpl);
  if (list.error) return null;
  const allSections: { index: string; line: string }[] = list.parse.sections;
  const picked = pickSections(allSections, keywords);
  const sections = await Promise.all(
    picked.map(async (sec) => {
      const wt = await apiFetch(
        `${base}?action=parse&page=${t}&section=${sec.index}&prop=wikitext&${common}`,
        fetchImpl,
      );
      return { heading: sec.line, text: stripWikitext(wt.parse.wikitext).slice(0, 6000) };
    }),
  );
  return {
    title: page.title as string,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    lead: (page.extract as string | undefined) ?? "",
    sections,
  };
}

function wikidataYear(time: string | undefined): number | null {
  const m = time?.match(/^([+-]\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

function isoYear(date: string): number | null {
  const m = date.match(/^(-?\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

export async function lookupPerson(
  label: string,
  startDate: string,
  fetchImpl: typeof fetch = fetch,
) {
  const startYear = isoYear(startDate);
  const search = await apiFetch(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(label)}&language=en&type=item&format=json&origin=*`,
    fetchImpl,
  );
  for (const hit of (search.search ?? []).slice(0, 5)) {
    const ent = await apiFetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit.id}&props=claims&format=json&origin=*`,
      fetchImpl,
    );
    const claims = ent.entities[hit.id].claims ?? {};
    const isHuman = claims.P31?.some((c: any) => c.mainsnak?.datavalue?.value?.id === "Q5");
    if (!isHuman) continue;
    const born = wikidataYear(claims.P569?.[0]?.mainsnak?.datavalue?.value?.time);
    if (born === null) continue;
    if (startYear !== null && !(startYear - 100 <= born && born <= startYear)) continue;
    const died = wikidataYear(claims.P570?.[0]?.mainsnak?.datavalue?.value?.time);
    return { label: (hit.label as string) ?? label, qid: hit.id as string, born, died };
  }
  return null;
}

export async function lookupParty(label: string, fetchImpl: typeof fetch = fetch) {
  const search = await apiFetch(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(label)}&language=en&type=item&format=json&origin=*`,
    fetchImpl,
  );
  const hit = search.search?.[0];
  if (!hit) return null;
  const ent = await apiFetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit.id}&props=claims&format=json&origin=*`,
    fetchImpl,
  );
  const claims = ent.entities[hit.id].claims ?? {};
  const color = claims.P465?.[0]?.mainsnak?.datavalue?.value as string | undefined;
  const seatsAmount =
    claims.P1410?.[0]?.mainsnak?.datavalue?.value?.amount ??
    claims.P1342?.[0]?.mainsnak?.datavalue?.value?.amount;
  const seats =
    seatsAmount !== undefined ? parseInt(String(seatsAmount).replace("+", ""), 10) : undefined;
  return {
    label: (hit.label as string) ?? label,
    qid: hit.id as string,
    ...(color ? { color } : {}),
    ...(seats !== undefined ? { seats } : {}),
  };
}

export type WikiPage = NonNullable<Awaited<ReturnType<typeof fetchWikipedia>>>;
export type Person = NonNullable<Awaited<ReturnType<typeof lookupPerson>>>;
export type Party = NonNullable<Awaited<ReturnType<typeof lookupParty>>>;
export type Sources = { wikipedia: WikiPage[]; people: Person[]; parties: Party[] };
