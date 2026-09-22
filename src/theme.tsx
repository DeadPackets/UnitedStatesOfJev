import { memo } from "react";
import type { Faction, Pack } from "../worker/pack";

type Fill = Faction["fill"];

/** hatch and hatch2 are the same stroke turned, so the tile stays one line of geometry. */
const TILT: Partial<Record<Fill, string>> = { hatch: "rotate(45)", hatch2: "rotate(-45)" };

function marks(fill: Fill, ink: string) {
  const line = (d: string, w = 1) => <path d={d} fill="none" stroke={ink} strokeWidth={w} />;
  switch (fill) {
    case "hatch": case "hatch2": return line("M0 0 V6", 1.2);
    case "cross": return line("M0 0 L6 6 M6 0 L0 6");
    case "dots": return <circle cx={3} cy={3} r={1.3} fill={ink} />;
    case "rings": return <circle cx={3} cy={3} r={1.8} fill="none" stroke={ink} strokeWidth={0.9} />;
    case "hollow": return <circle cx={3} cy={3} r={2} fill="var(--paper)" />;
    case "half": return <rect y={3} width={6} height={3} fill={ink} />;
    case "wave": return line("M0 4 Q1.5 1 3 4 T6 4");
    case "grid": return line("M0 0 H6 M0 0 V6");
    case "brick": return line("M0 0 H6 M0 3 H6 M0 0 V3 M3 3 V6", 0.9);
    case "check": return <path d="M0 0h3v3H0z M3 3h3v3H3z" fill={ink} />;
    default: return null;
  }
}

/**
 * One 6x6 pattern per faction: the faction colour with its marks in ink, so the fill reads
 * without colour. `solid` factions get no pattern; `fillFor` hands back their flat colour.
 * `scope` keeps the ids to one chamber: two floors on a page own separate defs.
 */
export const FILL_DEFS = memo(function FILL_DEFS({ factions, scope, ink = "var(--ink)" }: { factions: Faction[]; scope: string; ink?: string }) {
  return (
    <>
      {factions.filter((f) => f.fill !== "solid").map((f) => (
        <pattern key={f.id} id={`${scope}fill-${f.id}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform={TILT[f.fill]}>
          <rect width={6} height={6} fill={f.color} />
          {marks(f.fill, ink)}
        </pattern>
      ))}
    </>
  );
});

export const fillFor = (f: Faction, scope: string) => (f.fill === "solid" ? f.color : `url(#${scope}fill-${f.id})`);

/** R2 art, served by the Worker: `members/<id>.png`, `members/<id>-plate.png`, `masthead.png`, `crests/<id>.png`. */
export const art = (packId: string, file: string) => `/api/scenarios/${packId}/art/${file}`;

/** An R2 image that never landed leaves the initials under it, not a broken-image glyph. */
export const hideBroken = (e: { currentTarget: HTMLElement | SVGElement }) => { e.currentTarget.style.display = "none"; };

export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();

// ---- page theme ----

const SERIF = new Set(["Playfair Display", "Cinzel", "EB Garamond", "Fraunces", "Lora", "Cormorant Garamond"]);
// Google's css2 API returns 400 for a weight a family does not ship, so these four override the defaults below.
const WEIGHTS: Record<string, string> = { "Archivo Black": "", "Space Grotesk": "600;700", Oswald: "600;700", "Cormorant Garamond": "600;700" };

const famq = (name: string, fallback: string) => {
  const w = WEIGHTS[name] ?? fallback;
  return `family=${name.replace(/ /g, "+")}${w ? `:wght@${w}` : ""}`;
};
const stack = (name: string) => `"${name}", ${SERIF.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}`;

/**
 * Re-skins the page from the pack. Takes a partial, because the build's `frame` fragment carries
 * only fonts, ink, paper and accent; texture and ornament land with the pack.
 */
export function applyTheme(t: Partial<Pack["theme"]>) {
  const root = document.documentElement;
  const set = (k: string, v?: string) => { if (v) root.style.setProperty(k, v); };
  set("--ink", t.ink);
  set("--paper", t.paper);
  set("--bg", t.paper);
  set("--accent", t.accent);
  if (t.fonts) {
    const [display, sans] = t.fonts.split(" + ");
    set("--display", stack(display));
    set("--sans", stack(sans));
    let link = document.getElementById("packfonts") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = "packfonts";
      link.rel = "stylesheet";
      document.head.append(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${famq(display, "700;800")}&${famq(sans, "400;500;600")}&display=swap`;
  }
  if (t.texture) root.dataset.texture = t.texture;
  if (t.ornament) root.dataset.ornament = t.ornament;
}

/** Back to the stylesheet's own look: the next pack starts from the default, not from the last one. */
export function resetTheme() {
  const root = document.documentElement;
  for (const k of ["--ink", "--paper", "--bg", "--accent", "--display", "--sans"]) root.style.removeProperty(k);
  document.getElementById("packfonts")?.remove();
  delete root.dataset.texture;
  delete root.dataset.ornament;
}

type OrnamentKind = Pack["theme"]["ornament"];

const ORNAMENTS: Record<OrnamentKind, string> = {
  laurel: "M12 21C7 18 5 13 6 5M12 21c5-3 7-8 6-16M6 10 3 9M7 14H4M9 18l-3 1M18 10l3-1M17 14h3M15 18l3 1",
  eagle: "M2 9l10 4 10-4M7 12l5 6 5-6M12 13v6",
  star: "M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6-5.5-3-5.5 3 1.2-6L3.2 9.4l6.1-.8z",
  crescent: "M15.5 3.5a9 9 0 100 17 11 11 0 010-17z",
  cross: "M12 3v18M5 9h14",
  gear: "M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  rule: "M2 12h7M15 12h7M12 9l3 3-3 3-3-3z",
  none: "",
};

/** The masthead flourish: one ink glyph, no fill, so it prints on any paper. */
export function Ornament({ kind }: { kind: OrnamentKind }) {
  const d = ORNAMENTS[kind];
  if (!d) return null;
  return <svg className="orn" viewBox="0 0 24 24" width={22} height={22} aria-hidden="true"><path d={d} /></svg>;
}
