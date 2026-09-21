import { useMemo } from "react";
import { geoPath, geoIdentity } from "d3-geo";
import { feature } from "topojson-client";
import atlas from "us-atlas/states-albers-10m.json";
import { STATES, STATE_IDS } from "../worker/states";

const byName = Object.fromEntries(STATE_IDS.map((id) => [STATES[id].name, id]));
const STEPS = ["#c9584c", "#e0a49d", "#d8d4cb", "#9fb3c9", "#4f6f96"];

export default function Map({ approval }: { approval: Record<string, number> }) {
  const { path, feats } = useMemo(() => {
    const fc = feature(atlas as any, (atlas as any).objects.states) as any;
    return { path: geoPath(geoIdentity()), feats: fc.features as any[] };
  }, []);
  return (
    <div className="map card"><div className="eyebrow" style={{ marginBottom: 8 }}>Approval by state</div>
      <svg viewBox="0 0 975 610" role="img" aria-label="Approval map">
        {feats.map((f) => { const id = byName[f.properties.name]; const a = id ? approval[id] : undefined; const fill = a === undefined ? "var(--paper-2)" : STEPS[Math.min(4, Math.max(0, Math.floor((a - 30) / 10)))];
          return <path key={f.id} d={path(f) ?? ""} fill={fill} stroke="var(--paper)" strokeWidth={1}><title>{f.properties.name}{a !== undefined ? ` · ${Math.round(a)}%` : ""}</title></path>; })}
      </svg></div>
  );
}
