// Wikipedia and Fandom pages as source documents: infoboxes kept as "key: value" lines, the lead, then the sections that
// best match the plan's keywords, up to a cap. Only en.wikipedia.org and a *.fandom.com wiki are ever fetched, because
// the canon host is the model's choice.
const USER_AGENT = "USOJ/1.0 (youssef@ctf.ae)";
const WIKIPEDIA = "en.wikipedia.org";

export type Doc = {
  index: number;
  source: string;
  title: string;
  text: string;
  combatants?: string[];
  categories?: string[];
};

export const allowedHost = (host: string): boolean =>
  host === WIKIPEDIA || /^[a-z0-9-]+\.fandom\.com$/.test(host);

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Wikipedia answers a burst with 429; waits of 0.8, 1.6 and 2.4 s cover it. Any other 4xx is final.
export async function getJson(url: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt >= 3) throw error;
    }
    if (response?.ok) return response.json();
    if (response && response.status < 500 && response.status !== 429)
      throw new Error(`${url} answered ${response.status}`);
    if (attempt >= 3) throw new Error(`${url} answered ${response?.status ?? "nothing"}`);
    await sleep(800 * (attempt + 1));
  }
}

const LIST_TEMPLATES =
  /^(plainlist|plain list|ubl|unbulleted list|flatlist|hlist|collapsible list|bulleted list|marriage)$/i;
const FIRST_ARGUMENT_TEMPLATES =
  /^(nowrap|small|big|nobold|sup|nobr|flag|flagcountry|flagu|flagdeco|abbr|lang-..|transl|tooltip|sortname|nbsp|ill|interlanguage link|anchor|sclass|ship|hms|uss|awrap)$/i;

// One template's text: dates as YYYY-MM-DD, lists joined by "; ", wrappers as their first argument, the rest dropped.
function templateText(inner: string): string {
  const parts = inner.split("|");
  const name = parts[0].trim();
  const positional = parts
    .slice(1)
    .filter((part) => !/^\s*[\w ]+=/.test(part))
    .map((part) => part.trim());
  if (/^lang$/i.test(name) || /^lang-/i.test(name)) return positional[positional.length - 1] ?? "";
  if (/(start|end|birth|death) date|^date$/i.test(name))
    return positional.filter((part) => /^\d+$/.test(part)).join("-");
  if (/^convert$/i.test(name)) return positional.slice(0, 2).join(" ");
  if (LIST_TEMPLATES.test(name))
    return positional
      .join("; ")
      .replace(/\n\s*\*\s*/g, "; ")
      .replace(/^;\s*/, "");
  if (FIRST_ARGUMENT_TEMPLATES.test(name)) return positional[0] ?? "";
  return "";
}

// Links first, so their pipes do not split templates; then templates innermost first, then tables and markup.
export function cleanWikitext(wikitext: string): string {
  let text = wikitext
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/\[\[(?:File|Image):(?:[^[\]]|\[\[[^\]]*\]\])*\]\]/gi, "");
  text = text.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1");
  text = text.replace(/\[https?:\/\/\S+\s([^\]]*)\]/g, "$1");
  let previous: string;
  do {
    previous = text;
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => templateText(inner));
  } while (text !== previous);
  text = text.replace(/\{\|[\s\S]*?\|\}/g, "");
  text = text
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<[^>]+>/g, "")
    .replace(/'''''|'''|''/g, "")
    .replace(/&nbsp;/g, " ");
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ ([.,;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Top-level {{Infobox ...}} blocks by brace depth, each as its type, text fields and the link targets of each field.
export function infoboxes(
  wikitext: string,
): { type: string; fields: [string, string][]; links: Record<string, string[]> }[] {
  const boxes = [];
  let rest = wikitext;
  let start: number;
  while ((start = rest.search(/\{\{\s*Infobox/i)) >= 0) {
    let depth = 0;
    let end = start;
    for (; end < rest.length; end++) {
      if (rest.startsWith("{{", end)) {
        depth++;
        end++;
      } else if (rest.startsWith("}}", end)) {
        depth--;
        end++;
        if (depth === 0) break;
      }
    }
    const inner = rest.slice(start + 2, end - 1);
    rest = rest.slice(end + 1);
    const parameters = inner.split(/\n\s*\|/);
    const type = parameters[0]
      .replace(/^\s*Infobox\s*/i, "")
      .split("|")[0]
      .trim();
    const links: Record<string, string[]> = {};
    const fields: [string, string][] = [];
    for (const parameter of parameters.slice(1)) {
      const match = parameter.match(/^\s*([^=]+?)\s*=([\s\S]*)$/);
      if (!match) continue;
      links[match[1]] = [...match[2].matchAll(/\[\[([^\]|#]+)/g)]
        .map((link) => link[1].trim())
        .filter((target) => !/^(File|Image):/i.test(target));
      const value = cleanWikitext(match[2]).replace(/\n+/g, "; ");
      if (
        value &&
        !/^(image|logo|flag|map|caption|alt|image_size|signature|symbol)/i.test(match[1])
      )
        fields.push([match[1], value.slice(0, 400)]);
    }
    boxes.push({ type, fields, links });
  }
  return boxes;
}

const SKIPPED_SECTIONS =
  /^(references|notes|see also|external links|further reading|bibliography|sources|citations|footnotes|gallery)$/i;

export function pageSections(wikitext: string): { heading: string; text: string }[] {
  const parts = wikitext.split(/^(==+)\s*([^=\n]+?)\s*\1\s*$/m);
  const sections = [{ heading: "Lead", text: parts[0] }];
  for (let i = 1; i < parts.length; i += 3)
    sections.push({ heading: parts[i + 1], text: parts[i + 2] ?? "" });
  return sections.filter((section) => !SKIPPED_SECTIONS.test(section.heading));
}

// One page as a document: infoboxes, the lead, then keyword-scored sections up to the cap.
export async function fetchPage(
  host: string,
  title: string,
  keywords: string[],
  cap = 16000,
): Promise<Omit<Doc, "index"> | null> {
  if (!allowedHost(host)) return null;
  const api = `https://${host}/${host === WIKIPEDIA ? "w/" : ""}api.php`;
  const reply = await getJson(
    `${api}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext|categories&format=json&formatversion=2&redirects=1`,
  ).catch(() => null);
  if (!reply?.parse) return null;
  const wikitext: string = reply.parse.wikitext;
  const boxes = infoboxes(wikitext);
  const boxText = boxes
    .map(
      (box) =>
        `[Infobox ${box.type}]\n${box.fields.map(([key, value]) => `${key}: ${value}`).join("\n")}`,
    )
    .join("\n\n")
    .slice(0, 7000);
  const sections = pageSections(wikitext).map((section, order) => ({
    ...section,
    order,
    text: cleanWikitext(section.text),
    hits: keywords.filter((keyword) =>
      `${section.heading} ${section.text.slice(0, 3000)}`
        .toLowerCase()
        .includes(keyword.toLowerCase()),
    ).length,
  }));
  const lead = sections[0]?.text.slice(0, 5000) ?? "";
  let body = "";
  let left = cap - lead.length - boxText.length;
  for (const section of sections.slice(1).sort((a, b) => b.hits - a.hits || a.order - b.order)) {
    if (left < 400) break;
    const text = section.text.slice(0, Math.min(6000, left));
    body += `\n\n### ${section.heading}\n${text}`;
    left -= text.length;
  }
  const combatants = boxes
    .filter((box) => /military conflict|civil conflict|war/i.test(box.type))
    .flatMap((box) =>
      Object.entries(box.links)
        .filter(([key]) => /^combatant\d/.test(key))
        .flatMap(([, targets]) => targets),
    );
  const categories = (reply.parse.categories ?? [])
    .filter((category: { hidden?: boolean }) => !category.hidden)
    .map((category: { category: string }) => category.category.replace(/_/g, " "));
  return {
    source: `${host === WIKIPEDIA ? "Wikipedia" : host}: ${reply.parse.title}`,
    title: reply.parse.title,
    text: `${boxText}\n\n${lead}${body}`.trim(),
    combatants: [...new Set(combatants)],
    categories,
  };
}
