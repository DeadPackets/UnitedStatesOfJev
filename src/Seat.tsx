import { useEffect, useMemo, useState } from "react";
import type { PackView } from "./api";
import { Chamber } from "./Hemicycle";
import { Ornament, applyTheme, art, initials } from "./theme";

const hide = (e: { currentTarget: HTMLImageElement }) => { e.currentTarget.style.display = "none"; };
const b36 = (n: number) => n.toString(36);

export default function Seat({ pack, busy, onSeat }: {
  pack: PackView; busy: boolean; onSeat: (faction: string, promises: number[], seed: number) => Promise<boolean>;
}) {
  const [faction, setFaction] = useState(pack.starts[0].faction);
  const [hover, setHover] = useState<string | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [stamped, setStamped] = useState(false);
  const [seed] = useState(() => Math.floor(Math.random() * 36 ** 6));

  useEffect(() => { applyTheme(pack.theme); }, [pack.theme]);

  const seats = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of pack.members) n.set(m.faction, (n.get(m.faction) ?? 0) + 1);
    return n;
  }, [pack.members]);
  const short = useMemo(() => new Map(pack.factions.map((f) => [f.id, f.short])), [pack.factions]);

  const start = pack.starts.find((s) => s.faction === faction)!;
  const own = hover ?? faction;
  const ownStart = pack.starts.find((s) => s.faction === own) ?? start;
  const v = pack.vocabulary;
  const full = picks.length === 3;
  const code = `J3-${pack.id.slice(0, 6)}-${b36(pack.factions.findIndex((f) => f.id === faction))}-${[0, 1, 2].map((i) => (picks[i] === undefined ? "_" : b36(picks[i]))).join("")}-${b36(seed).padStart(6, "0")}`;

  const toggle = (i: number) => setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < 3 ? [...p, i] : p));
  // the stamp runs first, then the call; a refused seat lifts it so the button works again
  const take = () => { setStamped(true); setTimeout(() => onSeat(faction, picks, seed).then((ok) => { if (!ok) setStamped(false); }), 650); };

  return (
    <main className="takeseat press">
      <div className="mast">
        <b>{pack.title}</b>
        <Ornament kind={pack.theme.ornament} />
        <span>{pack.era} · {pack.place}</span>
      </div>

      <section className="stage" aria-label={`${v.chamber} preview`}>
        <div className="stagearea">
          <Chamber pack={pack} members={pack.members} own={own} coalition={ownStart.coalition} onPick={() => {}} />
          <div className={`stamp ${stamped ? "hit" : ""}`} aria-hidden="true">{v.seat}</div>
        </div>
        <h2 className="head">{start.premise}</h2>
        {pack.content_note ? <p className="note">{pack.content_note}</p> : null}
        <div className="field">
          <span className="kicker">Your code</span>
          <div className="code" aria-label="Game code">{code}</div>
          <span className="small muted">{full ? "Same code, same chamber, same luck." : "Pick 3 to finish the code."}</span>
        </div>
      </section>

      <aside className="rail" aria-label="Pick a faction and 3 promises">
        <div className="field">
          <span className="kicker" id="l-faction">Take which seat</span>
          <ul className="picker" role="radiogroup" aria-labelledby="l-faction">
            {pack.factions.map((f) => {
              const s = pack.starts.find((x) => x.faction === f.id);
              if (!s) return null;
              const foes = (s.hostile ?? []).map((id) => short.get(id) ?? id);
              return (
                <li key={f.id}>
                  <button className="fcard" role="radio" aria-checked={faction === f.id}
                    onClick={() => setFaction(f.id)} onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(f.id)} onBlur={() => setHover(null)}>
                    <span className="crest" style={{ color: f.color }} aria-hidden="true">
                      {initials(f.name)}
                      <img src={art(pack.id, `crests/${f.id}.png`)} alt="" onError={hide} />
                    </span>
                    <span className="t">
                      <b style={{ color: f.color }}>{f.name}</b>
                      <span className="small">{s.seat_title} · {seats.get(f.id) ?? 0} of {pack.chamber.size}</span>
                      <span className="small muted">{s.premise}</span>
                      <span className="small">Party mood {s.party}. {foes.length ? `Hostile partners: ${foes.join(", ")}.` : "No hostile partners."}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="field">
          <span className="kicker" id="l-promise">{v.promise} · {picks.length} of 3</span>
          <div className="chips" role="group" aria-labelledby="l-promise" style={{ justifyContent: "start" }}>
            {pack.promises.map((p, i) => (
              <button key={p.tag} className="opt" aria-pressed={picks.includes(i)}
                disabled={full && !picks.includes(i)} onClick={() => toggle(i)}>{p.label}</button>
            ))}
          </div>
        </div>

        <button className={`btn ${busy ? "busy" : ""}`} disabled={!full || busy || stamped} onClick={take}>
          {busy ? `Taking the ${v.seat}` : `Take the ${v.seat}`}
        </button>
      </aside>
    </main>
  );
}
