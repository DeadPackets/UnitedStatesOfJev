import { useState } from "react";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Num, national } from "./Ledger";

/** Clipboard API first; the textarea covers an insecure origin or a denied permission. */
async function copyText(s: string) {
  try { await navigator.clipboard.writeText(s); return; } catch {}
  const ta = document.createElement("textarea");
  ta.value = s; ta.style.cssText = "position:fixed;opacity:0";
  document.body.append(ta); ta.select();
  try { document.execCommand("copy"); } catch {}
  ta.remove();
}

/** The run is over: the ending, the score term by term, the last term's record, the code. */
export default function Over({ game, act, busy, onNew }: { game: GameView; act: Act; busy: boolean; onNew: () => void }) {
  const [copied, setCopied] = useState(false);
  const pack = game.pack;
  const v = pack.vocabulary;
  const r = game.result;
  const own = pack.factions.find((f) => f.id === game.faction);
  const lost = !!r && r.ending !== "reelected";
  return (
    <main className="over stagger press">
      <div className="kicker" style={{ "--i": 0 } as any}>{pack.title}</div>
      <h1 className={lost ? "lose" : ""} style={{ "--i": 1 } as any}>
        {r ? pack.endings[r.ending] : (game.ending?.title ?? pack.test.name)}
      </h1>
      {game.ending ? (
        <div style={{ "--i": 2 } as any}>
          <p className="lede" style={{ margin: "0 auto 10px" }}>{game.ending.title}</p>
          <p style={{ margin: 0 }}>{game.ending.body}</p>
        </div>
      ) : null}

      {r ? (
        <table className="scorecard" style={{ "--i": 3 } as any}>
          <tbody>
            {game.terms.map((t) => (
              <tr key={t.term}>
                <td className="k">Term {t.term}</td>
                <td><Num value={t.points} /></td>
                <td className="k">× {(1.5 ** (t.term - 1)).toFixed(t.term > 1 ? 2 : 1)}</td>
                <td><Num value={Math.round(t.points * 1.5 ** (t.term - 1))} /></td>
              </tr>
            ))}
            <tr className="total">
              <td className="k">Score</td><td /><td />
              <td><Num value={r.score} /></td>
            </tr>
          </tbody>
        </table>
      ) : null}

      {r ? (
        <div className="ledger" style={{ "--i": 4 } as any}>
          <div><div className="k">Terms served</div><div className="v num">{game.terms.length}</div></div>
          <div><div className="k">{v.approval}</div><div className="v"><Num value={Math.round(national(pack, game.ledgers.approval))} />%</div></div>
          <div><div className="k">Best streak</div><div className="v num">{game.bestStreak}</div></div>
        </div>
      ) : null}

      <div className="panel share" style={{ "--i": 5 } as any}>
        <div className="kicker">The record, term {game.terms.at(-1)?.term ?? game.term}</div>
        <div className="sharecard" style={{ color: own?.color ?? "var(--ink)" }}>
          {game.bills.map((b) => (
            <div key={b.id}>
              <span className={`sq ${b.passed && !b.struck ? "on" : ""}`} />
              <span>{v.bill} {b.id}</span>
            </div>
          ))}
        </div>
        <div className="code" aria-label="Share code">{game.code}</div>
        <button className="btn ghost" onClick={() => { copyText(game.code); setCopied(true); }}>{copied ? "Copied" : "Copy the code"}</button>
      </div>

      <div className="row" style={{ "--i": 6, justifyContent: "center" } as any}>
        <button className={`btn ${busy ? "busy" : ""}`} disabled={busy} onClick={() => act(() => api.share(game.code))}>Run it back</button>
        <button className="btn ghost" onClick={onNew}>New scenario</button>
      </div>
    </main>
  );
}
