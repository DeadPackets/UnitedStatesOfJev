// Faction and group emblems: the stored shape, the sanitizer that turns a model's SVG-as-JSON into it, and the
// shapes the desk draws. An emblem is data, never markup: the desk builds each shape with createElement from an
// allowlisted tag, so no model text is ever parsed as HTML or SVG. Generation sanitizes on write; the desk checks
// again on render and falls back to the line icon when the check fails.
import { z } from "zod";

export const EMBLEM_TAGS = ["path", "circle", "ellipse", "rect", "polygon", "line"] as const;
export const EMBLEM_PAINTS = ["ink", "accent", "paper", "none"] as const;
export const EMBLEM_LIMIT = 12;

const NUMBER_KEYS = [
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "width",
  "height",
  "x1",
  "y1",
  "x2",
  "y2",
  "strokeWidth",
] as const;
// Path commands and numbers only: no letter outside the command set, so no url(), no javascript:, no entity.
const PATTERNS = {
  d: /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]{1,1500}$/,
  points: /^[0-9eE.,\s+-]{1,600}$/,
  transform: /^\s*((translate|rotate|scale|matrix|skewX|skewY)\(\s*[-0-9eE.,\s]*\)\s*)+$/,
};
const ATTRIBUTE_NAMES: Record<string, string> = {
  "stroke-width": "strokeWidth",
  "fill-rule": "fillRule",
};
// The model may name a paint by its token or by the CSS the lab used; anything else is painted in ink.
const PAINT_ALIASES: Record<string, EmblemPaint> = {
  ink: "ink",
  currentcolor: "ink",
  accent: "accent",
  "var(--accent)": "accent",
  paper: "paper",
  "var(--paper)": "paper",
  none: "none",
};
const PAINT_CSS: Record<EmblemPaint, string> = {
  ink: "currentColor",
  accent: "var(--accent)",
  paper: "var(--paper)",
  none: "none",
};

export type EmblemTag = (typeof EMBLEM_TAGS)[number];
export type EmblemPaint = (typeof EMBLEM_PAINTS)[number];

const coordinate = z.number().optional();
const EmblemElementSchema = z.strictObject({
  tag: z.enum(EMBLEM_TAGS),
  d: z.string().regex(PATTERNS.d).optional(),
  points: z.string().regex(PATTERNS.points).optional(),
  transform: z.string().regex(PATTERNS.transform).optional(),
  cx: coordinate,
  cy: coordinate,
  r: coordinate,
  rx: coordinate,
  ry: coordinate,
  x: coordinate,
  y: coordinate,
  width: coordinate,
  height: coordinate,
  x1: coordinate,
  y1: coordinate,
  x2: coordinate,
  y2: coordinate,
  strokeWidth: coordinate,
  fill: z.enum(EMBLEM_PAINTS).optional(),
  stroke: z.enum(EMBLEM_PAINTS).optional(),
  fillRule: z.enum(["nonzero", "evenodd"]).optional(),
});
export type EmblemElement = z.infer<typeof EmblemElementSchema>;

function elementProblem(element: EmblemElement, size: number): string | null {
  for (const key of NUMBER_KEYS) {
    const value = element[key];
    if (value !== undefined && Math.abs(value) > size * 2)
      return `${key} ${value} is off the emblem`;
  }
  if ((element.strokeWidth ?? 0) > size / 4) return "stroke wider than a quarter of the emblem";
  if (element.tag === "path" && !element.d) return "a path needs d";
  if (element.tag !== "path" && element.d !== undefined) return "only a path takes d";
  if (element.tag === "polygon" && !element.points) return "a polygon needs points";
  if (element.tag !== "polygon" && element.points !== undefined)
    return "only a polygon takes points";
  return null;
}

// The stored shape. size is the viewBox edge: "0 0 24 24" or "0 0 64 64".
export const EmblemSchema = z
  .strictObject({
    size: z.union([z.literal(24), z.literal(64)]),
    elements: z.array(EmblemElementSchema).min(1).max(EMBLEM_LIMIT),
  })
  .superRefine((emblem, context) => {
    for (const element of emblem.elements) {
      const problem = elementProblem(element, emblem.size);
      if (problem) context.addIssue({ code: "custom", message: problem });
    }
  });
export type Emblem = z.infer<typeof EmblemSchema>;

export type SanitizedEmblem =
  | { emblem: Emblem; fixes: string[] }
  | { emblem: null; reason: string; fixes: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// One model element to a stored element, or null (with the reason in fixes) when it cannot be made safe.
function cleanElement(item: unknown, size: 24 | 64, fixes: string[]): EmblemElement | null {
  if (!isRecord(item)) {
    fixes.push("dropped an element that is not an object");
    return null;
  }
  const tag = String(item.tag ?? "").toLowerCase();
  if (!(EMBLEM_TAGS as readonly string[]).includes(tag)) {
    fixes.push(`dropped <${tag.slice(0, 20)}>`);
    return null;
  }
  const element: Record<string, unknown> = { tag };
  for (const [rawKey, rawValue] of Object.entries(item)) {
    if (rawKey === "tag") continue;
    const key = ATTRIBUTE_NAMES[rawKey] ?? rawKey;
    const value = String(rawValue).trim();
    if ((NUMBER_KEYS as readonly string[]).includes(key)) {
      const number = Number(value);
      if (value === "" || !Number.isFinite(number) || Math.abs(number) > size * 2) {
        fixes.push(`dropped <${tag}>: ${key}=${value.slice(0, 20)}`);
        return null;
      }
      element[key] = key === "strokeWidth" ? Math.min(number, size / 4) : number;
    } else if (key === "d" || key === "points" || key === "transform") {
      const owner = key === "d" ? "path" : key === "points" ? "polygon" : tag;
      if (owner !== tag) {
        fixes.push(`dropped ${key} on <${tag}>`);
        continue;
      }
      if (!PATTERNS[key].test(value)) {
        fixes.push(`dropped <${tag}>: ${key} failed the pattern`);
        return null;
      }
      element[key] = value;
    } else if (key === "fill" || key === "stroke") {
      const paint = PAINT_ALIASES[value.toLowerCase()];
      if (!paint) fixes.push(`${key} ${value.slice(0, 24)} -> ink`);
      element[key] = paint ?? "ink";
    } else if (key === "fillRule") {
      element.fillRule = value === "evenodd" ? "evenodd" : "nonzero";
    } else {
      fixes.push(`dropped ${rawKey.slice(0, 20)}`);
    }
  }
  if (tag === "path" && element.d === undefined) {
    fixes.push("dropped <path> with no d");
    return null;
  }
  if (tag === "polygon" && element.points === undefined) {
    fixes.push("dropped <polygon> with no points");
    return null;
  }
  // SVG paints a shape with no fill black; ink follows the row's hue in both themes.
  element.fill ??= "ink";
  return element as EmblemElement;
}

// The model's emblem ({ viewBox, elements: [{ tag, ...attributes }] }) to the stored shape, with every change listed.
export function sanitizeEmblem(raw: unknown): SanitizedEmblem {
  const fixes: string[] = [];
  if (!isRecord(raw)) return { emblem: null, reason: "not an object", fixes };
  const viewBox = String(raw.viewBox ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const size = viewBox === "0 0 24 24" ? 24 : viewBox === "0 0 64 64" ? 64 : null;
  if (!size) return { emblem: null, reason: `viewBox ${viewBox.slice(0, 40)}`, fixes };
  const elements: EmblemElement[] = [];
  for (const item of Array.isArray(raw.elements) ? raw.elements : []) {
    const element = cleanElement(item, size, fixes);
    if (element) elements.push(element);
  }
  if (elements.length > EMBLEM_LIMIT) {
    fixes.push(`cut ${elements.length} elements to ${EMBLEM_LIMIT}`);
    elements.length = EMBLEM_LIMIT;
  }
  if (!elements.length) return { emblem: null, reason: "no element survived", fixes };
  // cleanElement enforces every rule of the schema, so a failure here is a bug in this file, refused rather than shipped.
  const parsed = EmblemSchema.safeParse({ size, elements });
  if (!parsed.success)
    return { emblem: null, reason: parsed.error.issues[0]?.message ?? "invalid", fixes };
  return { emblem: parsed.data, fixes };
}

// The desk's check before it draws: a stored emblem that no longer passes the schema is not drawn.
export function checkEmblem(value: unknown): Emblem | null {
  const parsed = EmblemSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type EmblemShape = {
  tag: EmblemTag;
  props: Record<string, string | number | Record<string, string>>;
};
// What React draws: one createElement(tag, props) per shape inside <svg viewBox={`0 0 ${size} ${size}`}>. Paint goes
// through style, because var() is reliable in CSS and not in SVG presentation attributes.
export function emblemShapes(emblem: Emblem): EmblemShape[] {
  return emblem.elements.map(({ tag, fill, stroke, ...geometry }) => ({
    tag,
    props: {
      ...geometry,
      style: {
        fill: PAINT_CSS[fill ?? "ink"],
        ...(stroke ? { stroke: PAINT_CSS[stroke] } : {}),
      },
    },
  }));
}
