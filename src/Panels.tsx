import { useMemo } from "react";
import type { GameView } from "./api";
import Tiles, { shortNames, type TileDatum } from "./Tiles";
import type { PinItem } from "./Peek";
import { difficulty } from "./rules";

/** The rubric R8 asks to be printed, in the Record tab, in plain words. */
const RUBRIC = [
  "Power. Can this ruler and this body do this at all.",
  "Era. Does the mechanism exist in this year.",
  "A refusal costs 1 authority and never reaches the room.",
  "Scale is priced by a credibility factor from 0.6 to 1.0 that multiplies revenue and popularity.",
];

export function Country({ game }: { game: GameView }) {
  const regions = game.pack.regions;
  const wsum = regions.reduce((a, r) => a + r.weight, 0) || 1;
  const shorts = useMemo(() => shortNames(regions.map((r) => r.name)), [regions]);
  const items: TileDatum[] = regions.map((r, i) => ({
    id: r.id, name: r.name, short: shorts[i], weight: r.weight / wsum,
    p: (game.regions[r.id] ?? 50) / 100,
  }));
  const low = [...regions].sort((a, b) => (game.regions[a.id] ?? 50) - (game.regions[b.id] ?? 50))[0];
  return (
    <>
      <Tiles items={items} label="The country by weight" foot={(d) => `${Math.round(d.p * 100)}`} />
      {low ? <p className="note">{low.name} at {Math.round(game.regions[low.id] ?? 50)} is the drag.</p> : null}
    </>
  );
}

export function Room({ game, selected, onPick, onPin }: {
  game: GameView; selected: string | null; onPick: (id: string) => void; onPin: (item: PinItem) => void;
}) {
  const h = game.holders.find((x) => x.id === selected);
  // §9's rail zone is members and blocs, and a holder's members live on the pack, not on HolderView
  const members = game.pack.constitution?.holders.find((x) => x.id === selected)?.members;
  return (
    <>
      <ul className="causes" aria-label="The room">
        {game.holders.map((x) => (
          <li key={x.id}>
            <button className="rowbtn" aria-current={x.id === selected} onClick={() => onPick(x.id)}>
              <b className="num">{Math.round(x.support)}</b>
              <span>{x.name}, {x.where === "abroad" ? "abroad" : "at home"}, line {x.line}</span>
            </button>
          </li>
        ))}
      </ul>
      {h ? (
        <div className="panel">
          <div className="kicker">{h.persona.role}</div>
          <h3>{h.persona.name}</h3>
          <p className="small">Weight {h.weight.toFixed(2)}. Moved by {h.levers.map((l) => game.instruments[l]?.name ?? l).join(", ")}.</p>
          {members === "blocs" || members === "citizens" ? (
            <ul className="causes" aria-label="Its people">
              {game.pack.blocs.map((b) => (
                <li key={b.id}><b className="num">{Math.round((game.blocs[b.id] ?? 0.5) * 100)}</b><span>{b.name}</span></li>
              ))}
            </ul>
          ) : null}
          <button className="btn sm" onClick={() => onPin({
            key: `holder:${h.id}`, title: h.name, hue: "",
            lines: [["Support", String(Math.round(h.support))], ["Line", String(h.line)], ["Weight", h.weight.toFixed(2)]],
          })}>Pin</button>
        </div>
      ) : null}
    </>
  );
}

export function RecordTab({ game }: { game: GameView }) {
  const v = game.pack.vocabulary;
  const promises = Object.values(game.promises);
  // sunset is turns of life from enactment, as the engine counts it in inForceAge
  const left = (f: GameView["inForce"][number]) => f.sunset! - ((game.term - f.term) * game.turnsPerTerm + (game.turn - f.turn));
  return (
    <>
      <div className="panel">
        <div className="kicker">In force</div>
        <ul className="causes">
          {game.inForce.length ? game.inForce.map((f) => (
            <li key={f.id}>
              <b className="num">{f.perTurn.reduce((a, p) => a + p.delta, 0)}</b>
              <span>{f.title}, each {v.turn}, repeal needs {f.repealVetoes.join(", ").replace(/_/g, " ") || "none"}{f.sunset ? `, lapses in ${Math.max(0, left(f))}` : ""}</span>
            </li>
          )) : <li><span>Nothing is in force yet.</span></li>}
        </ul>
      </div>
      <div className="panel">
        <div className="kicker">{v.promise}</div>
        <div className="pledges">
          {promises.map((p) => (
            <span key={p.label} className={`stampsm tiny ${p.state === "kept" ? "pass" : p.state === "broken" ? "fail" : "wait"}`}>
              {p.label}{p.state === "pending" ? ` · ${Math.max(0, p.window - game.turn)}` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="kicker">This term brings</div>
        <ul className="causes">
          {game.escalations.slice(0, 2 * game.term).map((k) => {
            const e = game.pack.escalations.find((x) => x.key === k);
            return e ? <li key={k}><span>{e.name}. {e.headline}</span></li> : null;
          })}
        </ul>
      </div>
      <div className="panel">
        <div className="kicker">Where you stand</div>
        <p className="small">{difficulty(game.shortfall)}. {game.shortfall > 0 ? <>You need <span className="num">{game.shortfall}</span> more votes than you hold</> : "You hold enough votes alone"}
          {game.handicap ? <>, and you opened with <span className="num">{game.handicap}</span> less authority</> : null}.</p>
      </div>
      <div className="panel">
        <div className="kicker">What the clerk checks</div>
        <ul className="causes">{RUBRIC.map((r) => <li key={r}><span>{r}</span></li>)}</ul>
      </div>
    </>
  );
}
