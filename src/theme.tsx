import { memo } from "react";
import type { Faction } from "../worker/pack";
import { DEFAULT_THEME_TOKENS, fitContrast } from "../worker/colour";
import type { Palette, ThemeTokens, Tint } from "../worker/tokens";

type Fill = Faction["fill"];

/** hatch and hatch2 are the same stroke turned, so the tile stays one line of geometry. */
const TILT: Partial<Record<Fill, string>> = { hatch: "rotate(45)", hatch2: "rotate(-45)" };

function marks(fill: Fill, ink: string) {
  const line = (d: string, w = 1) => <path d={d} fill="none" stroke={ink} strokeWidth={w} />;
  switch (fill) {
    case "hatch":
    case "hatch2":
      return line("M0 0 V6", 1.2);
    case "cross":
      return line("M0 0 L6 6 M6 0 L0 6");
    case "dots":
      return <circle cx={3} cy={3} r={1.3} fill={ink} />;
    case "rings":
      return <circle cx={3} cy={3} r={1.8} fill="none" stroke={ink} strokeWidth={0.9} />;
    case "hollow":
      return <circle cx={3} cy={3} r={2} fill="var(--paper)" />;
    case "half":
      return <rect y={3} width={6} height={3} fill={ink} />;
    case "wave":
      return line("M0 4 Q1.5 1 3 4 T6 4");
    case "grid":
      return line("M0 0 H6 M0 0 V6");
    case "brick":
      return line("M0 0 H6 M0 3 H6 M0 0 V3 M3 3 V6", 0.9);
    case "check":
      return <path d="M0 0h3v3H0z M3 3h3v3H3z" fill={ink} />;
    default:
      return null;
  }
}

/**
 * One 6x6 pattern per faction: the faction colour with its marks in ink, so the fill reads
 * without colour. `solid` factions get no pattern; `fillFor` hands back their flat colour.
 * `scope` keeps the ids to one chamber: two floors on a page own separate defs.
 */
export const FILL_DEFS = memo(function FILL_DEFS({
  factions,
  scope,
  ink = "var(--ink)",
}: {
  factions: Faction[];
  scope: string;
  ink?: string;
}) {
  return (
    <>
      {factions
        .filter((f) => f.fill !== "solid")
        .map((f) => (
          <pattern
            key={f.id}
            id={`${scope}fill-${f.id}`}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform={TILT[f.fill]}
          >
            <rect width={6} height={6} fill={f.color} />
            {marks(f.fill, ink)}
          </pattern>
        ))}
    </>
  );
});

export const fillFor = (f: Faction, scope: string) =>
  f.fill === "solid" ? f.color : `url(#${scope}fill-${f.id})`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

// ---- world tokens (level B): the palette in both modes, the fonts, radius, texture scale, material, motion, courier ----

// The fixed colours (resources, danger, change), fitted per world at 4.6:1 on its grounds, as the mock did.
const FIXED = [
  {
    tre: "#227f53",
    aut: "#623e96",
    che: "#8a6d24",
    danger: "#bb0916",
    up: "#1d7a4a",
    dn: "#c2410c",
  },
  {
    tre: "#6dc393",
    aut: "#a37fde",
    che: "#f1cc7e",
    danger: "#ff7b72",
    up: "#6dc393",
    dn: "#ff9d5c",
  },
];
const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** `from` moved `share` of the way to `to` in sRGB, as the mock's mix(). */
export const mix = (from: string, to: string, share: number) => {
  const target = hexToRgb(to);
  return `#${hexToRgb(from)
    .map((channel, i) =>
      Math.round(channel + (target[i] - channel) * share)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

function paletteRules(palette: Palette, dark: boolean, tints: Tint[]): string {
  const tone = mix(palette.ink, palette.paper, dark ? 0.9 : 0.92);
  const grounds = [palette.paper, palette.surface, tone];
  // Danger and the change colours also sit on every rim row's deepest wash (16% of the group's hue), so they are
  // fitted there too.
  const washes = tints.map((tint) => mix(palette.surface, dark ? tint.dark : tint.light, 0.16));
  const fixed = Object.entries(FIXED[dark ? 1 : 0]).map(
    ([key, colour]) =>
      `--${key}:${fitContrast(colour, ["danger", "up", "dn"].includes(key) ? [...grounds, ...washes] : grounds, 4.6) ?? colour}`,
  );
  return [
    `--paper:${palette.paper}`,
    `--card:${palette.surface}`,
    `--ink:${palette.ink}`,
    `--ink-2:${palette.muted}`,
    `--rule:${palette.rule}`,
    `--tone:${tone}`,
    `--accent:${palette.accent}`,
    `--navy:${palette.accent2}`,
    `--sh:${dark ? "rgba(0,0,0,.55)" : `${palette.ink}38`}`,
    ...fixed,
  ].join(";");
}

// The curated body and mono faces that ship less than 400 to 700 (Google Fonts css2, checked 2026-09-24). Google
// answers 400 for the whole request, dropping all three faces, when none of a family's asked weights exist.
const WEIGHTS: Record<string, string> = {
  Cardo: "400;700",
  "Old Standard TT": "400;700",
  Tajawal: "400;500;700",
  "Space Mono": "400;700",
  "Courier Prime": "400;700",
  "DM Mono": "400;500",
  "Share Tech Mono": "400",
  VT323: "400",
};

/** Paints a world: its palette (both modes), its two or three fonts, radius, texture scale, material, motion and courier. */
export function applyTokens(tokens: ThemeTokens, tints: Tint[] = []) {
  const root = document.documentElement;
  const families = [...new Set([tokens.display, tokens.body, tokens.mono ?? tokens.body])];
  const href = `https://fonts.googleapis.com/css2?${families
    .map(
      (family) =>
        `family=${family.replace(/ /g, "+")}${family === tokens.display ? "" : `:wght@${WEIGHTS[family] ?? "400;500;600;700"}`}`,
    )
    .join("&")}&display=swap`;
  let fonts = document.getElementById("world-fonts") as HTMLLinkElement | null;
  if (!fonts) {
    fonts = Object.assign(document.createElement("link"), { id: "world-fonts", rel: "stylesheet" });
    document.head.append(fonts);
  }
  if (fonts.href !== href) fonts.href = href;
  // Blackletter and small-caps faces set poor figures, so numbers fall back to the body face there (the mock's rule).
  const numerals = /IM Fell| SC$|Unifraktur/.test(tokens.display) ? tokens.body : tokens.display;
  const shared = [
    `--disp:"${tokens.display}",Georgia,serif`,
    `--ui:"${tokens.body}",system-ui,sans-serif`,
    `--mono:"${tokens.mono ?? tokens.body}",ui-monospace,monospace`,
    `--numf:"${numerals}",Georgia,serif`,
    `--r:${tokens.radius / 16}rem`,
    `--tex:${tokens.textureScale}`,
    `--fs:${tokens.bodySize / 16}rem`,
  ].join(";");
  let style = document.getElementById("world-tokens");
  if (!style) {
    style = Object.assign(document.createElement("style"), { id: "world-tokens" });
    document.head.append(style);
  }
  style.textContent = `:root{${shared};${paletteRules(tokens.light, false, tints)}}:root[data-theme=dark]{${paletteRules(tokens.dark, true, tints)}}`;
  Object.assign(root.dataset, {
    material: tokens.material,
    texture: tokens.texture,
    motion: tokens.motion,
    courier: tokens.courier,
  });
}

/** Back to the default world, so the next pack never starts from the last one's look. */
export const resetTokens = () => applyTokens(DEFAULT_THEME_TOKENS);

const MODE_KEY = "usoj:theme";
export function themeMode(): "light" | "dark" {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* blocked storage: follow the system */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function setThemeMode(mode: "light" | "dark") {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* the choice lasts this visit */
  }
}
