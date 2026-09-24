import type { Offer } from "./api";
import { Ornament } from "./theme";

export default function Match({
  offers,
  busy,
  onPlay,
  onBuild,
}: {
  offers: Offer[];
  busy: boolean;
  onPlay: (id: string) => void;
  onBuild: () => void;
}) {
  return (
    <main className="match press">
      <div className="mast">
        <b>The archive</b>
        <span className="flag">
          <Ornament kind="rule" />
        </span>
        <span>{offers.length === 1 ? "One match" : `${offers.length} matches`}</span>
      </div>
      <h1>Someone already wrote this era.</h1>
      <ul className="cards">
        {offers.map((o, i) => (
          <li key={o.id} className="card rise" style={{ animationDelay: `${i * 90}ms` }}>
            <div className="kicker">
              {o.era} · {o.place}
            </div>
            <h2>{o.title}</h2>
            <p className="small">{o.description}</p>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => onPlay(o.id)}>
                Play this
              </button>
              <span className="chip faint num">{Math.round(o.p * 100)} percent match</span>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn ghost" disabled={busy} onClick={onBuild}>
        Build mine instead
      </button>
    </main>
  );
}
