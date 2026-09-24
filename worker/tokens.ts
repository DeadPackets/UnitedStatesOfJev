// The world's theme tokens (level B): what a build may choose for the desk's look, the default when it chose
// badly, and the contrast fix that keeps text readable. The model picks values from these lists; it never writes
// CSS. Generation runs parseThemeTokens on write; the desk runs it again on render.
import { z } from "zod";

// The curated Google Fonts (docs THEME.md): a world loads its display, body and mono faces and no other.
export const DISPLAY_FONTS = [
  "Cinzel",
  "Cinzel Decorative",
  "Cormorant",
  "Cormorant SC",
  "Playfair Display",
  "Playfair Display SC",
  "IM Fell English",
  "IM Fell English SC",
  "IM Fell DW Pica",
  "UnifrakturMaguntia",
  "UnifrakturCook",
  "Pirata One",
  "Grenze Gotisch",
  "Libre Caslon Display",
  "Abril Fatface",
  "Rozha One",
  "DM Serif Display",
  "Fraunces",
  "Bodoni Moda",
  "Rye",
  "Bebas Neue",
  "Oswald",
  "Anton",
  "Archivo Black",
  "Big Shoulders Display",
  "Syne",
  "Unbounded",
  "Orbitron",
  "Audiowide",
  "Michroma",
  "Chakra Petch",
  "Space Grotesk",
  "Tektur",
  "Marcellus",
  "Marcellus SC",
  "Tenor Sans",
  "Forum",
  "Philosopher",
  "Amiri",
  "Reem Kufi",
  "Aref Ruqaa",
  "Lalezar",
  "Marhey",
  "El Messiri",
  "Noto Kufi Arabic",
  "Noto Naskh Arabic",
  "Vazirmatn",
  "Gulzar",
] as const;
export const BODY_FONTS = [
  "EB Garamond",
  "Crimson Pro",
  "Libre Baskerville",
  "Source Serif 4",
  "Newsreader",
  "Lora",
  "Spectral",
  "Alegreya",
  "Cardo",
  "Old Standard TT",
  "Literata",
  "Public Sans",
  "IBM Plex Sans",
  "Inter Tight",
  "Work Sans",
  "Instrument Sans",
  "Figtree",
  "Manrope",
  "Rubik",
  "Noto Sans Arabic",
  "Cairo",
  "Tajawal",
] as const;
export const MONO_FONTS = [
  "IBM Plex Mono",
  "JetBrains Mono",
  "Space Mono",
  "Share Tech Mono",
  "VT323",
  "Martian Mono",
  "Courier Prime",
  "DM Mono",
] as const;
export const MATERIALS = [
  "newsprint",
  "vellum",
  "parchment",
  "linen",
  "papyrus",
  "stone",
  "brass",
  "steel",
  "terminal",
  "silk",
  "clay",
  "glass",
] as const;
export const TEXTURES = [
  "halftone",
  "lines",
  "crosshatch",
  "grid",
  "stars",
  "hex",
  "weave",
  "noise",
  "scanlines",
  "none",
] as const;
export const RULE_STYLES = ["single", "double", "dotted", "ornate", "notched", "none"] as const;
export const MOTIONS = ["stately", "brisk", "mechanical", "fluid"] as const;
// Each shape is one the desk mock already draws: dot and coin couriers, shard and fleck bursts.
export const COURIERS = ["dot", "coin", "shard", "fleck"] as const;
export const MIN_CONTRAST = 4.5;

// Six-digit hex only: a colour lands in a CSS custom property, so a wider string could smuggle in a declaration.
export const ColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// A group's hue in each mode: its rim row's wash, bar and disc, and its seats.
export const TintSchema = z.object({ light: ColourSchema, dark: ColourSchema });
export type Tint = z.infer<typeof TintSchema>;
const PaletteSchema = z.object({
  paper: ColourSchema,
  surface: ColourSchema,
  ink: ColourSchema,
  muted: ColourSchema,
  accent: ColourSchema,
  accent2: ColourSchema,
  rule: ColourSchema,
});
export type Palette = z.infer<typeof PaletteSchema>;

export const ThemeTokensSchema = z.object({
  display: z.enum(DISPLAY_FONTS),
  displayWeight: z.number().int().min(300).max(900),
  displayCase: z.enum(["none", "upper", "small-caps"]),
  displayTracking: z.number().min(-0.05).max(0.2),
  body: z.enum(BODY_FONTS),
  bodySize: z.number().min(16).max(19),
  mono: z.enum(MONO_FONTS).nullable(),
  light: PaletteSchema,
  dark: PaletteSchema,
  material: z.enum(MATERIALS),
  texture: z.enum(TEXTURES),
  textureScale: z.number().min(0.6).max(2),
  radius: z.number().min(0).max(18),
  ruleStyle: z.enum(RULE_STYLES),
  motion: z.enum(MOTIONS),
  courier: z.enum(COURIERS),
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

// The approved desk's own look (docs/mocks/v4/feel/desk.html on the Biden world).
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  display: "Libre Caslon Display",
  displayWeight: 400,
  displayCase: "none",
  displayTracking: 0,
  body: "Public Sans",
  bodySize: 17,
  mono: "IBM Plex Mono",
  light: {
    paper: "#f4f0e6",
    surface: "#fbf9f3",
    ink: "#121a2b",
    muted: "#4f5668",
    accent: "#b3202e",
    accent2: "#1f3a6e",
    rule: "#c9bfa9",
  },
  dark: {
    paper: "#0c111a",
    surface: "#141b27",
    ink: "#ece5d5",
    muted: "#9ba2b2",
    accent: "#ef5a62",
    accent2: "#8eaaf0",
    rule: "#263044",
  },
  material: "linen",
  texture: "crosshatch",
  textureScale: 0.8,
  radius: 4,
  ruleStyle: "double",
  motion: "brisk",
  courier: "dot",
};

type Rgb = [number, number, number];
const hexToRgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

// WCAG 2 relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const [red, green, blue] = hexToRgb(hex).map(toLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

// OKLab (Björn Ottosson, 2020): lightness moves evenly to the eye, so a fix keeps the colour's character.
function toOklch(hex: string): Rgb {
  const [red, green, blue] = hexToRgb(hex).map(toLinear);
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  return [lightness, Math.hypot(a, b), Math.atan2(b, a)];
}
function oklchToLinear(lightness: number, chroma: number, hue: number): Rgb {
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}
const inGamut = (rgb: Rgb) => rgb.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);
// Out of the sRGB gamut, chroma gives way first so the hue holds.
function fromOklch(lightness: number, chroma: number, hue: number): string {
  let low = 0;
  let high = chroma;
  if (!inGamut(oklchToLinear(lightness, chroma, hue))) {
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if (inGamut(oklchToLinear(lightness, middle, hue))) low = middle;
      else high = middle;
    }
  } else low = chroma;
  const rgb = oklchToLinear(lightness, low, hue);
  return `#${rgb
    .map((channel) =>
      Math.round(fromLinear(Math.min(1, Math.max(0, channel))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// The foreground itself when it already reads on every background; otherwise the nearest colour of the same hue,
// walked in OKLCH lightness away from the backgrounds, that does. null when no lightness of that hue reads on every
// background (a dark paper with a light surface) or a colour is not six-digit hex: the caller keeps its default.
export function fitContrast(
  foreground: string,
  backgrounds: string[],
  minimum = MIN_CONTRAST,
): string | null {
  if (![foreground, ...backgrounds].every((colour) => ColourSchema.safeParse(colour).success))
    return null;
  const passes = (colour: string) =>
    backgrounds.every((background) => contrastRatio(colour, background) >= minimum);
  const start = foreground.toLowerCase();
  if (passes(start)) return start;
  const [lightness, chroma, hue] = toOklch(start);
  const meanLuminance =
    backgrounds.reduce((sum, background) => sum + luminance(background), 0) / backgrounds.length;
  // 0.179 is where black and white give the same contrast: above it darker text reads better, so that way is walked
  // first. The other way still finds the mid-tone that reads between a light and a dark background.
  const darker = meanLuminance > 0.179 ? 0 : 1;
  // Steps of a thousandth: the band that reads on both white and black is under a hundredth of lightness wide.
  const steps = 1000;
  for (const target of [darker, 1 - darker])
    for (let step = 1; step <= steps; step++) {
      const candidate = fromOklch(lightness + ((target - lightness) * step) / steps, chroma, hue);
      if (passes(candidate)) return candidate;
    }
  return null;
}

// Every text colour of each mode (ink, muted, accent) against both of its backgrounds (paper, surface). A mode where
// one of them cannot read takes the default palette for that mode whole.
export function fitThemeTokens(tokens: ThemeTokens): { tokens: ThemeTokens; fixes: string[] } {
  const fixes: string[] = [];
  const fitPalette = (mode: "light" | "dark"): Palette => {
    const palette = { ...tokens[mode] };
    const changes: string[] = [];
    for (const key of ["ink", "muted", "accent"] as const) {
      const fitted = fitContrast(palette[key], [palette.paper, palette.surface]);
      if (fitted === null) {
        fixes.push(`${mode}: default palette, ${key} cannot read on its paper and surface`);
        return DEFAULT_THEME_TOKENS[mode];
      }
      if (fitted !== palette[key].toLowerCase())
        changes.push(`${mode}.${key} ${palette[key]} -> ${fitted}`);
      palette[key] = fitted;
    }
    fixes.push(...changes);
    return palette;
  };
  return { tokens: { ...tokens, light: fitPalette("light"), dark: fitPalette("dark") }, fixes };
}

// Anything to tokens the desk can use: the default theme when it does not parse, fitted tokens when it does.
export function parseThemeTokens(raw: unknown): { tokens: ThemeTokens; fixes: string[] } {
  const parsed = ThemeTokensSchema.safeParse(raw);
  if (parsed.success) return fitThemeTokens(parsed.data);
  const issue = parsed.error.issues[0];
  return {
    tokens: DEFAULT_THEME_TOKENS,
    fixes: [`default theme: ${issue?.path.join(".") || "tokens"} ${issue?.message ?? "invalid"}`],
  };
}
