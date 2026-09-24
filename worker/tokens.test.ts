import { expect, test } from "bun:test";
import {
  contrastRatio,
  DEFAULT_THEME_TOKENS,
  fitContrast,
  fitThemeTokens,
  MIN_CONTRAST,
  parseThemeTokens,
} from "./tokens";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test("contrast ratios match WCAG's own figures", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  expect(contrastRatio("#ffffff", "#777777")).toBeCloseTo(4.48, 2);
});

for (const [label, foreground, backgrounds] of [
  ["grey text on parchment", "#a79a82", ["#e8d7b0", "#f1e4c5"]],
  ["a red accent on cream", "#ef5a62", ["#f4f0e6", "#fbf9f3"]],
  ["navy on a dark surface", "#1f3a6e", ["#0c111a", "#141b27"]],
  ["the paper's own colour", "#f4f0e6", ["#f4f0e6"]],
  ["pure yellow on white", "#ffff00", ["#ffffff"]],
  ["upper-case hex", "#A79A82", ["#E8D7B0"]],
  ["black on black", "#000000", ["#000000"]],
  ["white on white", "#ffffff", ["#ffffff"]],
  ["mid grey on itself", "#777777", ["#777777"]],
  ["black on white and black", "#000000", ["#ffffff", "#000000"]],
] as [string, string, string[]][]) {
  test(`fitContrast lifts ${label} to ${MIN_CONTRAST}:1 on every background`, () => {
    const fitted = fitContrast(foreground, backgrounds);
    expect(fitted).toMatch(/^#[0-9a-f]{6}$/);
    for (const background of backgrounds)
      expect(contrastRatio(fitted!, background)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
}

for (const [label, foreground, backgrounds] of [
  ["a colour name", "red", ["#ffffff"]],
  ["a background carrying CSS", "#121a2b", ["#fff;background:url(x)"]],
  ["two mid greys no lightness reads on", "#00ff00", ["#6f6f6f", "#7b7b7b"]],
] as [string, string, string[]][]) {
  test(`fitContrast gives null for ${label}`, () => {
    expect(fitContrast(foreground, backgrounds)).toBeNull();
  });
}

test("for any colours, fitContrast reads at 4.5:1 on every background or gives null", () => {
  let seed = 1;
  const colour = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return `#${(seed % 0x1000000).toString(16).padStart(6, "0")}`;
  };
  for (let i = 0; i < 300; i++) {
    const backgrounds = [colour(), colour()];
    const fitted = fitContrast(colour(), backgrounds);
    if (fitted === null) continue;
    for (const background of backgrounds)
      expect(contrastRatio(fitted, background)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  }
});

test("a colour that already reads comes back unchanged", () => {
  expect(fitContrast("#121A2B", ["#f4f0e6", "#fbf9f3"])).toBe("#121a2b");
});

test("the fix keeps the hue: a red stays red", () => {
  const [red, green, blue] = rgb(fitContrast("#ef5a62", ["#f4f0e6", "#fbf9f3"]));
  expect(red).toBeGreaterThan(green + 40);
  expect(red).toBeGreaterThan(blue + 40);
});

const valid = {
  ...DEFAULT_THEME_TOKENS,
  light: { ...DEFAULT_THEME_TOKENS.light, muted: "#b8b0a0" },
};
for (const [label, raw] of [
  ["null", null],
  ["an empty object", {}],
  ["a font off the list", { ...valid, display: "Comic Sans MS" }],
  ["a colour name", { ...valid, light: { ...valid.light, ink: "red" } }],
  ["a colour carrying CSS", { ...valid, light: { ...valid.light, ink: "#fff;background:url(x)" } }],
  ["a three-digit colour", { ...valid, dark: { ...valid.dark, ink: "#fff" } }],
  ["a radius past 18", { ...valid, radius: 40 }],
  ["an unknown courier", { ...valid, courier: "rocket" }],
] as [string, unknown][]) {
  test(`${label} gives the default theme and says why`, () => {
    const result = parseThemeTokens(raw);
    expect(result.tokens).toEqual(DEFAULT_THEME_TOKENS);
    expect(result.fixes[0]).toStartWith("default theme:");
  });
}

test("valid tokens with a faint muted colour are fitted, every text colour reads, and a second pass changes nothing", () => {
  const first = parseThemeTokens(valid);
  expect(first.fixes).toEqual([expect.stringContaining("light.muted #b8b0a0 ->")]);
  for (const mode of ["light", "dark"] as const) {
    const palette = first.tokens[mode];
    for (const key of ["ink", "muted", "accent"] as const)
      for (const background of [palette.paper, palette.surface])
        expect(contrastRatio(palette[key], background)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  }
  expect(parseThemeTokens(first.tokens)).toEqual({ tokens: first.tokens, fixes: [] });
});

test("a mode whose text cannot read on its paper and surface takes the default palette for that mode", () => {
  const result = parseThemeTokens({
    ...valid,
    dark: { ...valid.dark, paper: "#6f6f6f", surface: "#7b7b7b" },
  });
  expect(result.tokens.dark).toEqual(DEFAULT_THEME_TOKENS.dark);
  expect(result.tokens.light.muted).not.toBe(DEFAULT_THEME_TOKENS.light.muted);
  expect(result.fixes).toContain("dark: default palette, ink cannot read on its paper and surface");
});

test("the default theme needs no fix", () => {
  expect(fitThemeTokens(DEFAULT_THEME_TOKENS).fixes).toEqual([]);
});
