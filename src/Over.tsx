import { useState } from "react";
import { nationalApproval } from "../worker/engine";
import type { GameView } from "./api";
import Map from "./Map";

export default function Over({ game, onNew }: { game: GameView; onNew: () => void }) {
  const [copied, setCopied] = useState(false);
  const passed = game.bills.filter((b) => b.passed && !b.struck).length;
  const r = game.result!;
  return (
    <main className="over">
      <div className="eyebrow">Term over</div>
      <h1>{r.reelected ? "Re-elected." : "Voted out."}</h1>
      <div className="ledger" style={{ textAlign: "center" }}>
        <div><div className="k">Score</div><div className="v num">{r.score}</div></div>
        <div><div className="k">Bills passed</div><div className="v num">{passed} / {game.bills.length}</div></div>
        <div><div className="k">Approval</div><div className="v num">{Math.round(nationalApproval(game))}%</div></div>
      </div>
      <Map approval={game.approval} />
      <div className="card" style={{ display: "grid", gap: 8 }}><div className="eyebrow">Share this chamber</div><div className="code">{game.code}</div>
        <button className="btn ghost" onClick={() => { navigator.clipboard.writeText(game.code); setCopied(true); }}>{copied ? "Copied" : "Copy code"}</button></div>
      <div><button className="btn" onClick={onNew}>New term</button></div>
    </main>
  );
}
