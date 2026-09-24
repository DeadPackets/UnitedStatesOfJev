import { afterEach, expect, test } from "bun:test";
import { compareDates, formatTime, sweepCategories } from "./wikidata";
import { allowedHost, cleanWikitext, fetchPage, infoboxes, pageSections } from "./wikipedia";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test.each([
  ["[[Rome|the city]] and [[Senate]]", "the city and Senate"],
  ["Born<ref name=a>cite</ref> here<ref/>.", "Born here."],
  ["{{start date|1908|07|24}}", "1908-07-24"],
  ["{{lang|tr|Meclis-i Mebusan}}", "Meclis-i Mebusan"],
  ["{{convert|5|km}}", "5 km"],
  ["{{ubl|Talaat|Enver}}", "Talaat; Enver"],
  ["'''Bold''' and ''italic''", "Bold and italic"],
  ["Text {|\n|a||b\n|} after", "Text after"],
  ["{{cite web|url=x}}Kept", "Kept"],
  ["Before [[File:Map.png|thumb|A [[map]]]] after", "Before after"],
  ["a<br/>b", "a; b"],
])("wikitext %p reads as %p", (wikitext, text) => {
  expect(cleanWikitext(wikitext)).toBe(text);
});

test("an infobox keeps its fields as text and its links, and drops image fields", () => {
  const [box] = infoboxes(
    "{{Infobox political party\n| name = Committee of Union and Progress\n| founded = {{start date|1889}}\n| leader = [[Talaat Pasha]]\n| image = CUP.png\n}}\nLead text.",
  );
  expect(box.type).toBe("political party");
  expect(box.fields).toEqual([
    ["name", "Committee of Union and Progress"],
    ["founded", "1889"],
    ["leader", "Talaat Pasha"],
  ]);
  expect(box.links.leader).toEqual(["Talaat Pasha"]);
});

test("sections keep the lead and drop the reference sections", () => {
  expect(
    pageSections("Lead\n==History==\nA\n==References==\nB").map((section) => section.heading),
  ).toEqual(["Lead", "History"]);
});

// Security: the canon host comes from the model (the v3 bug hunt found an SSRF through a model-chosen language).
test.each([
  ["en.wikipedia.org", true],
  ["iceandfire.fandom.com", true],
  ["de.wikipedia.org", false],
  ["evil.com", false],
  ["en.wikipedia.org.evil.com", false],
  ["fandom.com", false],
  ["x.fandom.com@evil.com", false],
  ["iceandfire.fandom.com/../x", false],
  ["169.254.169.254", false],
  ["localhost", false],
])("host %p is allowed: %p", (host, allowed) => {
  expect(allowedHost(host)).toBe(allowed);
});

test("a page on a host outside the allowlist is never fetched", async () => {
  let fetched = 0;
  globalThis.fetch = (async () => {
    fetched++;
    return new Response("{}");
  }) as unknown as typeof fetch;
  expect(await fetchPage("evil.com", "Anything", [])).toBeNull();
  expect(fetched).toBe(0);
});

test.each([
  [{ time: "+1908-07-24T00:00:00Z", precision: 11 }, "1908-07-24"],
  [{ time: "+1908-07-00T00:00:00Z", precision: 10 }, "1908-07"],
  [{ time: "+00000001908-00-00T00:00:00Z", precision: 9 }, "1908"],
  [{ time: "-0044-03-15T00:00:00Z", precision: 11 }, "-0044-03-15"],
  [undefined, null],
])("Wikidata time %p reads as %p", (value, text) => {
  expect(formatTime(value)).toBe(text);
});

test.each([
  ["1908", "1908-08-05", 0],
  ["1908-07-24", "1908-08-05", -1],
  ["1909", "1908-12-31", 1],
  ["-0044-03-15", "0001-01-01", -1],
])("comparing %p with %p at the coarser precision gives %p", (first, second, sign) => {
  expect(Math.sign(compareDates(first, second))).toBe(sign);
});

// Lesson 9: 50 titles per category and 180 in all, or small groups are starved.
test("the sweep takes at most 50 members a category, skips lists and stops at 180 titles", async () => {
  globalThis.fetch = (async (url: string) => {
    const category = new URL(url).searchParams.get("cmtitle") ?? "";
    const members = Array.from({ length: 60 }, (_, i) => ({
      ns: 0,
      title: i === 0 ? `List of ${category}` : `${category} member ${i}`,
    }));
    return new Response(JSON.stringify({ query: { categorymembers: members } }));
  }) as unknown as typeof fetch;
  const sweep = await sweepCategories(["A", "B", "C", "D"]);
  expect(sweep.categories).toEqual(["Category:A", "Category:B", "Category:C", "Category:D"]);
  expect(sweep.titles).toHaveLength(180);
  expect(sweep.titles.some((title) => title.startsWith("List of"))).toBe(false);
  expect(sweep.titles.filter((title) => title.startsWith("Category:A ")).length).toBe(49);
});
