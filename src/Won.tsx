import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Num } from "./Ledger";
import { barAt } from "./rules";
import { Ornament } from "./theme";

/** The term was won: the inaugural page, the term's score, and what another term brings. */
export default function Won({ game, act, busy }: { game: GameView; act: Act; busy: boolean }) {
  const pack = game.pack;
  const v = pack.vocabulary;
  const t = game.terms.at(-1);
  const i = 2 * (game.term - 1);
  const next = [pack.escalations[i], pack.escalations[i + 1]].filter((e) => !!e);
  return (
    <main className="over stagger press">
      <div className="mast" style={{ "--i": 0 } as any}><b>{pack.test.name}</b><span className="flag"><Ornament kind={pack.theme.ornament} /></span></div>
      <h1 style={{ "--i": 1 } as any}>{game.ending?.title ?? pack.endings.reelected}</h1>
      {game.ending ? <p style={{ "--i": 2 } as any}>{game.ending.body}</p> : null}

      {t ? (
        <div className="ledger" style={{ "--i": 3 } as any}>
          <div><div className="k">Score, term {t.term}</div><div className="v"><Num value={t.points} /></div></div>
          <div><div className="k">{pack.constitution?.retention.name ?? pack.test.name}</div><div className="v"><Num value={Math.round(t.mandate * 100)} /> of <span className="num">{Math.round(game.bar * 100)}</span></div></div>
          <div><div className="k">{v.pass}</div><div className="v"><Num value={t.passed} /></div></div>
        </div>
      ) : null}

      <div className="panel escal" style={{ "--i": 4 } as any}>
        <div className="kicker">Another term asks for {Math.round(barAt(pack, game.term + 1) * 100)} of the room</div>
        {next.length ? next.map((e) => (
          <div key={e!.key}><h3>{e!.name}</h3><p className="muted small">{e!.headline}</p></div>
        )) : <p className="muted small">Nothing new is dealt for it.</p>}
      </div>

      <div className="row" style={{ "--i": 5 } as any}>
        <button className={`btn ${busy ? "busy" : ""}`} disabled={busy} onClick={() => act(() => api.continue(game))}>Another term</button>
        <button className="btn ghost" disabled={busy} onClick={() => act(() => api.stop(game))}>Stop here</button>
        <span className="small muted">Another term carries every act in force, every appointment and every grudge. Stopping here banks the score and writes the last page.</span>
      </div>
    </main>
  );
}
