import { useState } from "react";
import { nationalApproval } from "../worker/engine";
import type { GameView } from "./api";
import Map from "./Map";

export default function Over({ game, onNew }: { game: GameView; onNew: () => void }) {
  const [copied, setCopied] = useState(false);
  const passed = game.bills.filter((b) => b.passed && !b.struck).length;
  const r = game.result!;
  return (
    <main className="over stagger press">
      <div className="kicker" style={{ "--i": 0 } as any}>Term over</div>
      <h1 className={r.reelected ? "" : "lose"} style={{ "--i": 1 } as any}>{r.reelected ? "Re-elected." : "Voted out."}</h1>
      <div className="ledger" style={{ "--i": 2 } as any}>
        <div><div className="k">Score</div><div className="v num">{r.score}</div></div>
        <div><div className="k">Bills passed</div><div className="v num">{passed} / {game.bills.length}</div></div>
        <div><div className="k">Approval</div><div className="v num">{Math.round(nationalApproval(game))}%</div></div>
      </div>
      <div className="map" style={{ "--i": 3 } as any}><Map approval={game.approval} /></div>
      <div className="panel" style={{ "--i": 4, display: "grid", gap: 10, width: "100%", maxWidth: 520 } as any}><div className="kicker">Share this chamber</div><div className="code" aria-label="Share code">{game.code}</div>
        <button className="btn ghost" onClick={() => { navigator.clipboard.writeText(game.code); setCopied(true); }}>{copied ? "Copied" : "Copy share code"}</button></div>
      <div style={{ "--i": 5 } as any}><button className="btn" onClick={onNew}>Start a new term</button></div>
    </main>
  );
}
