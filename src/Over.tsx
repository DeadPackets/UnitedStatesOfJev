import { useState } from "react";
import type { GameView } from "./api";
import { national } from "./Ledger";

/** Task 13 owns this screen; it is kept to the view's own fields so the term can end without a crash. */
export default function Over({ game, onNew }: { game: GameView; onNew: () => void }) {
  const [copied, setCopied] = useState(false);
  const pack = game.pack;
  const v = pack.vocabulary;
  const r = game.result;
  const passed = game.bills.filter((b) => b.passed && !b.struck).length;
  return (
    <main className="over stagger press">
      <div className="kicker" style={{ "--i": 0 } as any}>{pack.title}</div>
      <h1 className={r && r.ending !== "reelected" ? "lose" : ""} style={{ "--i": 1 } as any}>
        {game.ending?.title ?? (r ? pack.endings[r.ending] : `The ${v.test} is due.`)}
      </h1>
      {game.ending ? <p style={{ "--i": 2 } as any}>{game.ending.body}</p> : null}
      {r ? (
        <div className="ledger" style={{ "--i": 3 } as any}>
          <div><div className="k">Score</div><div className="v num">{r.score}</div></div>
          <div><div className="k">{v.pass}</div><div className="v num">{passed} / {game.bills.length}</div></div>
          <div><div className="k">{v.approval}</div><div className="v num">{Math.round(national(pack, game.ledgers.approval))}%</div></div>
        </div>
      ) : null}
      <div className="panel" style={{ "--i": 4, display: "grid", gap: 10, width: "100%", maxWidth: 520 } as any}>
        <div className="kicker">Share this {v.chamber}</div>
        <div className="code" aria-label="Share code">{game.code}</div>
        <button className="btn ghost" onClick={() => { navigator.clipboard.writeText(game.code); setCopied(true); }}>{copied ? "Copied" : "Copy the code"}</button>
      </div>
      <div style={{ "--i": 5 } as any}><button className="btn" onClick={onNew}>Start a new term</button></div>
    </main>
  );
}
