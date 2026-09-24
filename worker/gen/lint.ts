// Style lint on the merged world (lesson 18): AI tells, the game's own words in player copy, length caps, and a bible
// alias written in place of its term. Every flagged field goes to one cheap rewrite call; straight quotes are code's job.
import { fold } from "./checks";
import type { Caller } from "./openrouter";
import { RewriteSchema, type World } from "./schemas";
import { worldCall } from "./world";
import { REWRITE_SYSTEM } from "./writing";

export type LintIssue = { path: string; text: string; issues: string[] };

const TELLS: [RegExp, string][] = [
  [/\u2014|\s\u2013\s|\s--\s/, "uses a dash as punctuation; use a comma, colon or full stop"],
  [/\bnot (just|only|merely)\b[^.]*\bbut\b/i, 'uses "not just X but Y"'],
  [
    /, (reflecting|ensuring|highlighting|underscoring|showcasing|signall?ing|cementing|fostering|marking|creating|contributing|emphasi[sz]ing|illustrating|demonstrating|solidifying)\b/i,
    'ends a clause on an -ing tail (", reflecting ...")',
  ],
  [
    /\b(pivotal|testament|tapestry|delves?|underscores?|crucial|vibrant|intricate|multifaceted|beacon|bustling|nestled|palpable|unwavering|meticulous|seamless|robust|moreover|additionally|furthermore|showcases?|stands as|serves as|a reminder that|in the heart of|rich history|ever-shifting|delicate balance|navigat(e|es|ing) the)\b/i,
    "uses an inflated or stock word",
  ],
  [
    /\b(observers|critics|experts|analysts|many) (say|believe|note|argue|warn)\b/i,
    "quotes unnamed observers",
  ],
];
const ENGINE_WORDS =
  /\b(instruments?|priced|consent|stance|weights?|responses?|resistance|director|template|holders?)\b/i;
// The prose a player reads. Pledge quotes and all tags are sourced or matched text, never rewritten.
const PLAYER_COPY =
  /^(bible\.(groups\[\d+\]\.identity|history\[\d+\]\.beat)|briefing\.(ruler\.removed_by|briefing\.\w+|problems\[\d+\]|pledges\[\d+\]\.text)|ledgers\.\w+\.(for|earn\[\d+\]|spend\[\d+\]|fails)|systems\.(test\.(win|lose)|escalations\[\d+\]\.headline|blocs\[\d+\]\.description)|(groups|chamber\.factions)\[\d+\]\.strike)$/;
const wordCount = (text: string) => text.trim().split(/\s+/).length;
const CAPS: [RegExp, (text: string) => string | null][] = [
  [
    /^briefing\.briefing\.\w+$/,
    (text) => (wordCount(text) > 90 ? `${wordCount(text)} words; at most 90` : null),
  ],
  [
    /^bible\.groups\[\d+\]\.short$/,
    (text) => (text.length > 16 ? `${text.length} characters; at most 16` : null),
  ],
  [
    /^ledgers\.\w+\.name$/,
    (text) => (text.length > 13 ? `${text.length} characters; at most 13` : null),
  ],
  [
    /^bible\.vocabulary\.file$/,
    (text) => (text.length > 18 ? `${text.length} characters; at most 18` : null),
  ],
  [
    /^bible\.vocabulary\.abroad$/,
    (text) => (text.length > 22 ? `${text.length} characters; at most 22` : null),
  ],
];
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) =>
      strings(item, path ? `${path}.${key}` : key),
    );
  return [];
}

export function lint(world: World): LintIssue[] {
  const aliases = world.bible.terms.flatMap((term) =>
    term.aliases
      .filter((alias) => alias.trim() && fold(alias) !== fold(term.term))
      .map((alias) => ({
        alias,
        term: term.term,
        pattern: new RegExp(`\\b${escapePattern(alias)}\\b`, "i"),
      })),
  );
  const found: LintIssue[] = [];
  for (const [path, text] of strings(world)) {
    const issues: string[] = [];
    if (PLAYER_COPY.test(path)) {
      if (text.includes(" "))
        for (const [pattern, why] of TELLS) if (pattern.test(text)) issues.push(why);
      const engine = text.match(ENGINE_WORDS);
      if (engine)
        issues.push(
          `player copy uses the game's word "${engine[0]}"; say support, agree, votes or the clerk's price`,
        );
      // The Palestine bible named the Jewish Resistance Movement; the briefing called it by another name (SPEED.md).
      for (const { alias, term, pattern } of aliases)
        if (pattern.test(text) && !text.includes(term))
          issues.push(`uses "${alias}" for ${term}; write "${term}"`);
    }
    for (const [pattern, check] of CAPS)
      if (pattern.test(path)) {
        const problem = check(text);
        if (problem) issues.push(problem);
      }
    if (issues.length) found.push({ path, text, issues });
  }
  return found;
}

// Curly quotes are mechanical, so code straightens them rather than the model.
export const straighten = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value)
      .replace(/[\u201c\u201d]/g, '\\"')
      .replace(/[\u2018\u2019]/g, "'"),
  );

export function setPath(target: unknown, path: string, text: string) {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let node: any = target;
  for (const key of keys.slice(0, -1)) node = node?.[key];
  const last = keys[keys.length - 1];
  if (node && typeof node[last] === "string") node[last] = text;
}

// One rewrite call for every flagged field. A rewrite that fails leaves the prose as written: it is style, not structure.
export async function rewriteWorld(
  call: Caller,
  world: World,
  model: string,
): Promise<{ world: World; before: LintIssue[]; after: LintIssue[] }> {
  const before = lint(world);
  if (!before.length) return { world: straighten(world), before, after: [] };
  const flagged = new Set(before.map((issue) => issue.path));
  const answer = await worldCall(call, {
    name: "rewrite",
    schema: RewriteSchema,
    system: REWRITE_SYSTEM,
    user: `House voice: ${world.bible.house_voice}\n\n${JSON.stringify(
      before.map((issue) => ({
        path: issue.path,
        text: issue.text,
        problem: issue.issues.join("; "),
      })),
      null,
      1,
    )}\n\nReturn each field rewritten.`,
    maxTokens: 16000,
    strict: true,
    model,
  }).catch(() => null);
  if (!answer) return { world: straighten(world), before, after: before };
  const rewritten = structuredClone(world);
  for (const field of answer.data.fields)
    if (flagged.has(field.path)) setPath(rewritten, field.path, field.text);
  const fixed = straighten(rewritten);
  return { world: fixed, before, after: lint(fixed) };
}
