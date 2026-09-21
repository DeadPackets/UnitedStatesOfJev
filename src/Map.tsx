import { useMemo } from "react";
import { geoPath, geoIdentity } from "d3-geo";
import { feature } from "topojson-client";
import atlas from "us-atlas/states-albers-10m.json";
import { STATES, STATE_IDS } from "../worker/states";

const byName = Object.fromEntries(STATE_IDS.map((id) => [STATES[id].name, id]));
const STEPS = ["oklch(0.55 0.15 30)", "oklch(0.70 0.08 30)", "oklch(0.72 0.01 260)", "oklch(0.68 0.07 250)", "oklch(0.55 0.12 250)"];
const step = (a: number) => STEPS[Math.min(4, Math.max(0, Math.floor((a - 30) / 10)))];

export default function Map({ approval }: { approval: Record<string, number> }) {
  const { path, feats } = useMemo(() => {
    const fc = feature(atlas as any, (atlas as any).objects.states) as any;
    return { path: geoPath(geoIdentity()), feats: fc.features as any[] };
  }, []);
  return (
    <div className="map card"><div className="kicker" style={{ marginBottom: 8 }}>Approval by state</div>
      <svg viewBox="0 0 975 610" role="img" aria-label="Approval by state, red is low, blue is high">
        {feats.map((f) => { const id = byName[f.properties.name]; const a = id ? approval[id] : undefined;
          return <path key={f.id} d={path(f) ?? ""} fill={a === undefined ? "var(--surface-2)" : step(a)} stroke="var(--bg)" strokeWidth={1}><title>{f.properties.name}{a !== undefined ? ` · ${Math.round(a)}%` : ""}</title></path>; })}
      </svg></div>
  );
}
