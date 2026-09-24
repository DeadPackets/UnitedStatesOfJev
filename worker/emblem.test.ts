import { expect, test } from "bun:test";
import { checkEmblem, EMBLEM_LIMIT, EmblemSchema, emblemShapes, sanitizeEmblem } from "./emblem";

const CIRCLE = { tag: "circle", cx: 12, cy: 12, r: 5 };
const box = (elements: unknown[], viewBox: unknown = "0 0 24 24") =>
  sanitizeEmblem({ viewBox, elements });
const one = (element: unknown) => box([element]).emblem?.elements[0];

for (const tag of [
  "script",
  "foreignObject",
  "image",
  "use",
  "a",
  "style",
  "text",
  "animate",
  "set",
  "g",
  "iframe",
  "SCRIPT",
]) {
  test(`a <${tag}> element never survives`, () => {
    const result = box([{ tag, d: "M0 0", href: "javascript:alert(1)" }, CIRCLE]);
    expect(result.emblem?.elements.map((element) => element.tag)).toEqual(["circle"]);
  });
}

test("only allowlisted attributes survive: handlers, links, styles and classes are dropped", () => {
  const element = one({
    tag: "path",
    d: "M2 2L20 20",
    onload: "alert(1)",
    onclick: "x()",
    href: "#a",
    "xlink:href": "#b",
    style: "fill:red",
    class: "c",
    id: "i",
    filter: "url(#f)",
    mask: "url(#m)",
    "clip-path": "url(#c)",
  });
  expect(element).toEqual({ tag: "path", d: "M2 2L20 20", fill: "ink" });
});

test("__proto__, constructor and toString keys from parsed JSON are dropped and pollute nothing", () => {
  const element = one(
    JSON.parse(
      '{"tag":"circle","cx":1,"cy":1,"r":1,"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"toString":"x"}',
    ),
  );
  expect(element).toEqual({ tag: "circle", cx: 1, cy: 1, r: 1, fill: "ink" });
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

let deep: unknown = 5;
for (let i = 0; i < 100_000; i++) deep = [deep];
for (const [label, element, kept] of [
  ["a number in an array", { ...CIRCLE, r: [5] }, false],
  ["a number nested 100,000 deep", { ...CIRCLE, r: deep }, false],
  ["a tag in an array", { ...CIRCLE, tag: ["circle"] }, false],
  ["a boolean", { ...CIRCLE, cx: true }, false],
  ["a null", { ...CIRCLE, cy: null }, false],
  ["path data in an object", { tag: "path", d: { toString: () => "M0 0" } }, false],
  ["a paint in an object", { ...CIRCLE, fill: { toString: () => "accent" } }, true],
] as [string, unknown, boolean][]) {
  test(`${label} is never read as text: the element is ${kept ? "painted in ink" : "dropped"}`, () => {
    const result = box([element]);
    expect(result.emblem?.elements ?? null).toEqual(kept ? [{ ...CIRCLE, fill: "ink" }] : null);
  });
}

for (const d of [
  "M0 0 javascript:alert(1)",
  "M0 0 url(#x)",
  "M0 0 <script>",
  "M0 0 &#106;",
  "M0 0 expression(1)",
  "",
  `M${"1".repeat(1500)}`,
]) {
  test(`path data ${JSON.stringify(d.slice(0, 30))} drops the path`, () => {
    expect(box([{ tag: "path", d }]).emblem).toBeNull();
  });
}

test("polygon points outside numbers drop the polygon", () => {
  expect(box([{ tag: "polygon", points: "0,0 10,10 url(x)" }]).emblem).toBeNull();
});

for (const [transform, kept] of [
  ["translate(2,3) scale(1.1)", true],
  ["rotate(45 12 12)", true],
  ["rotate(45 12 12) url(x)", false],
  ["translate(1,2);fill:red", false],
  ["scale(2) javascript:", false],
  ["rotate(calc(1))", false],
  ["scale(1)".repeat(25), true],
  ["scale(1)".repeat(26), false],
] as [string, boolean][]) {
  test(`transform ${transform.slice(0, 40)} (${transform.length} characters) is ${kept ? "kept" : "refused"}`, () => {
    expect(one({ ...CIRCLE, transform })?.transform).toBe(kept ? transform : undefined);
  });
}

test("a long transform is refused in linear time, on write and on render", () => {
  const transform = `scale(${" ".repeat(100_000)}x`;
  const started = performance.now();
  expect(one({ ...CIRCLE, transform })).toBeUndefined();
  expect(checkEmblem({ size: 24, elements: [{ ...CIRCLE, transform }] })).toBeNull();
  expect(performance.now() - started).toBeLessThan(50);
});

for (const [paint, token] of [
  ["url(#g)", "ink"],
  ["#ff0000", "ink"],
  ["red", "ink"],
  ["var(--x);background:url(y)", "ink"],
  ["currentColor", "ink"],
  ["ink", "ink"],
  ["var(--accent)", "accent"],
  ["ACCENT", "accent"],
  ["var(--paper)", "paper"],
  ["none", "none"],
  ["constructor", "ink"],
  ["__proto__", "ink"],
  ["hasOwnProperty", "ink"],
]) {
  test(`fill ${paint} is stored as ${token}`, () => {
    expect(one({ ...CIRCLE, fill: paint })?.fill).toBe(token as never);
  });
}

for (const [viewBox, size] of [
  ["0 0 24 24", 24],
  [" 0  0 64 64 ", 64],
  ["0 0 100 100", null],
  ["-10 0 64 64", null],
  ["0 0 24", null],
  ["", null],
  ["0 0 24 24; x", null],
  [["0 0 24 24"], null],
] as [unknown, number | null][]) {
  test(`viewBox ${JSON.stringify(viewBox)} gives size ${size}`, () => {
    expect(box([CIRCLE], viewBox).emblem?.size ?? null).toBe(size);
  });
}

for (const [key, value] of [
  ["r", "NaN"],
  ["r", "Infinity"],
  ["r", "1e400"],
  ["r", "12px"],
  ["r", ""],
  ["cx", 49],
  ["cx", -49],
] as [string, string | number][]) {
  test(`${key}=${JSON.stringify(value)} drops the element`, () => {
    expect(box([{ ...CIRCLE, [key]: value }]).emblem).toBeNull();
  });
}

test("a coordinate at twice the box is kept, and a wide stroke is cut to a quarter of it", () => {
  expect(one({ ...CIRCLE, cx: 48 })?.cx).toBe(48);
  expect(one({ ...CIRCLE, "stroke-width": 20 })?.strokeWidth).toBe(6);
  expect(one({ ...CIRCLE, strokeWidth: 2 })?.strokeWidth).toBe(2);
});

test("more than the limit is cut to the limit, and the cut is reported", () => {
  const result = box(Array.from({ length: 15 }, () => CIRCLE));
  expect(result.emblem?.elements).toHaveLength(EMBLEM_LIMIT);
  expect(result.fixes).toContain(`cut 15 elements to ${EMBLEM_LIMIT}`);
});

test("a path with no d and a polygon with no points are dropped; d on a circle is dropped alone", () => {
  expect(box([{ tag: "path", fill: "ink" }, { tag: "polygon" }]).emblem).toBeNull();
  expect(one({ ...CIRCLE, d: "M0 0" })).toEqual({ ...CIRCLE, fill: "ink" });
});

for (const raw of [null, "svg", 42, [], { viewBox: "0 0 24 24", elements: "x" }]) {
  test(`input ${JSON.stringify(raw)} gives no emblem`, () => {
    expect(sanitizeEmblem(raw).emblem).toBeNull();
  });
}

test("whatever goes in, what comes out passes the stored schema", () => {
  const messy = [
    { tag: "PATH", d: "M2 2L20 20", fill: "url(#g)", onload: "x" },
    { tag: "rect", x: "1", y: "1", width: "5", height: "5", transform: "rotate(45 12 12)" },
    { tag: "line", x1: 0, y1: 0, x2: 24, y2: 24, stroke: "var(--accent)", "stroke-width": 20 },
    { tag: "polygon", points: "1,1 5,1 3,4", "fill-rule": "evenodd" },
    { tag: "ellipse", cx: 12, cy: 12, rx: 4, ry: 2, fill: "paper" },
  ];
  const result = box(messy);
  expect(result.emblem?.elements).toHaveLength(5);
  expect(EmblemSchema.safeParse(result.emblem).success).toBe(true);
});

for (const [label, stored] of [
  ["an extra onload key", { size: 24, elements: [{ tag: "path", d: "M0 0", onload: "x" }] }],
  ["a size of 32", { size: 32, elements: [CIRCLE] }],
  ["a coordinate off the box", { size: 24, elements: [{ ...CIRCLE, cx: 999 }] }],
  ["a script in d", { size: 24, elements: [{ tag: "path", d: "M0 0 javascript:" }] }],
  ["a raw colour", { size: 24, elements: [{ ...CIRCLE, fill: "#ff0000" }] }],
  ["no elements", { size: 24, elements: [] }],
  ["an infinite radius", JSON.parse('{"size":24,"elements":[{"tag":"circle","r":1e400}]}')],
  ["a NaN radius", { size: 24, elements: [{ ...CIRCLE, r: Number.NaN }] }],
  ["thirteen elements", { size: 24, elements: Array.from({ length: 13 }, () => CIRCLE) }],
] as [string, unknown][]) {
  test(`checkEmblem refuses a stored emblem with ${label}`, () => {
    expect(checkEmblem(stored)).toBeNull();
  });
}

test("the desk's shapes carry only geometry and a style with the paint's CSS", () => {
  const emblem = box([
    { ...CIRCLE, fill: "accent", stroke: "ink", "stroke-width": 2 },
    { tag: "path", d: "M1 1L2 2", fill: "paper" },
  ]).emblem!;
  expect(checkEmblem(emblem)).toEqual(emblem);
  expect(emblemShapes(emblem)).toEqual([
    {
      tag: "circle",
      props: {
        cx: 12,
        cy: 12,
        r: 5,
        strokeWidth: 2,
        style: { fill: "var(--accent)", stroke: "currentColor" },
      },
    },
    { tag: "path", props: { d: "M1 1L2 2", style: { fill: "var(--paper)" } } },
  ]);
});
