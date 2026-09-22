import type { Faction } from "../worker/pack";

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
 */
export function FILL_DEFS({ factions, ink = "var(--ink)" }: { factions: Faction[]; ink?: string }) {
  return (
    <>
      {factions.filter((f) => f.fill !== "solid").map((f) => (
        <pattern key={f.id} id={`fill-${f.id}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform={TILT[f.fill]}>
          <rect width={6} height={6} fill={f.color} />
          {marks(f.fill, ink)}
        </pattern>
      ))}
    </>
  );
}

export const fillFor = (f: Faction) => (f.fill === "solid" ? f.color : `url(#fill-${f.id})`);

/** R2 art, served by the Worker: `members/<id>.png`, `members/<id>-plate.png`, `masthead.png`, `crests/<id>.png`. */
export const art = (packId: string, file: string) => `/api/scenarios/${packId}/art/${file}`;

export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
