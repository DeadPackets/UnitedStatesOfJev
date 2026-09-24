// The world's theme tokens (level B): what a build may choose for the desk's look, the default when it chose
// badly, and the contrast fix that keeps text readable. The model picks values from these lists; it never writes
// CSS. Generation runs parseThemeTokens on write; the desk runs it again on render.
import { z } from "zod";
import { DEFAULT_THEME_TOKENS, HEX, fitContrast } from "./colour";

// The client imports these from ./colour, which carries no zod.
export { DEFAULT_THEME_TOKENS, MIN_CONTRAST, contrastRatio, fitContrast } from "./colour";

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

export const ColourSchema = z.string().regex(HEX);
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
