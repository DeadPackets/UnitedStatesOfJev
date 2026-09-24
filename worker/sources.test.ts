import { test, expect } from "bun:test";
import { edition, fetchWikipedia, lookupPerson } from "./sources";
import page from "./fixtures/wiki-page.json";
import people from "./fixtures/wiki-people.json";

function mockFetch(map: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    for (const [key, body] of Object.entries(map))
      if (u.includes(key)) return new Response(JSON.stringify(body));
    throw new Error("unmocked url: " + u);
  }) as typeof fetch;
}

test("fetchWikipedia strips templates, tables, refs and resolves piped links", async () => {
  const fetchImpl = mockFetch({
    "action=query": page.lead,
    "prop=sections": page.sections,
    "section=1&": page.wikitext["1"],
    "section=2&": page.wikitext["2"],
    "section=3&": page.wikitext["3"],
  });
  const wiki = await fetchWikipedia("en", "Test Page", [], fetchImpl);
  expect(wiki.title).toBe("Test Page");
  expect(wiki.lead).toContain("fictional article");
  expect(wiki.sections).toHaveLength(3);
  const early = wiki.sections.find((s) => s.heading === "Early life")!;
  expect(early.text).toContain("the city");
  expect(early.text).toContain("After table.");
  expect(early.text).not.toContain("Infobox");
  expect(early.text).not.toContain("{{");
  expect(early.text).not.toContain("<ref");
  expect(early.text).not.toContain("|-");
  expect(wiki.sections.find((s) => s.heading === "Career")!.text).toBe("Served as consul.");
});

test("fetchWikipedia ranks sections by keyword hits", async () => {
  const fetchImpl = mockFetch({
    "action=query": page.lead,
    "prop=sections": page.sections,
    "section=1&": page.wikitext["1"],
    "section=2&": page.wikitext["2"],
    "section=3&": page.wikitext["3"],
  });
  const wiki = await fetchWikipedia("en", "Test Page", ["legacy"], fetchImpl);
  expect(wiki.sections[0].heading).toBe("Legacy");
});

test("lookupPerson rejects a modern person against a 44 BC start", async () => {
  const fx = people.modern;
  const fetchImpl = mockFetch({ wbsearchentities: fx.search, wbgetentities: fx.entities });
  expect(await lookupPerson("Modern Person", "-0044-03-15", fetchImpl)).toBeNull();
});

test("lookupPerson accepts Lepidus born -89 for a -44 start", async () => {
  const fx = people.lepidus89;
  const fetchImpl = mockFetch({ wbsearchentities: fx.search, wbgetentities: fx.entities });
  const person = await lookupPerson("Marcus Aemilius Lepidus", "-0044-03-15", fetchImpl);
  expect(person?.born).toBe(-89);
  expect(person?.qid).toBe("Q2");
});

test("lookupPerson rejects Lepidus born -230 for a -44 start (over 100 years)", async () => {
  const fx = people.lepidus230;
  const fetchImpl = mockFetch({ wbsearchentities: fx.search, wbgetentities: fx.entities });
  expect(await lookupPerson("Someone Old", "-0044-03-15", fetchImpl)).toBeNull();
});

test("fetchWikipedia returns null instead of throwing on a missing page", async () => {
  const queryMissing = mockFetch({
    "action=query": { query: { pages: [{ title: "Nonexistent Page Xyz123", missing: true }] } },
  });
  expect(await fetchWikipedia("en", "Nonexistent Page Xyz123", [], queryMissing)).toBeNull();

  const parseError = mockFetch({
    "action=query": { query: { pages: [{ title: "Weird Page", extract: "stub" }] } },
    "prop=sections": {
      error: { code: "missingtitle", info: "The page you specified doesn't exist." },
    },
  });
  expect(await fetchWikipedia("en", "Weird Page", [], parseError)).toBeNull();
});

test("a lang the model invented never reaches the Wikipedia host", async () => {
  expect(edition("en")).toBe("en");
  expect(edition("pt-BR")).toBe("pt");
  expect(edition("zh-hant")).toBe("zh");
  expect(edition("evil.example/#")).toBe("en");
  expect(edition("en.wikipedia.org@evil.example")).toBe("en");
  expect(edition("")).toBe("en");
  expect(edition("../../etc")).toBe("en");

  const seen: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    seen.push(String(url));
    throw new Error("stop");
  }) as typeof fetch;
  await fetchWikipedia("evil.example/#", "Test Page", [], fetchImpl).catch(() => null);
  expect(seen[0].startsWith("https://en.wikipedia.org/w/api.php")).toBe(true);
});
