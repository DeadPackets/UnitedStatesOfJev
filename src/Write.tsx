import { useState } from "react";
import { Ornament } from "./theme";

export default function Write({ busy, onSubmit }: { busy: boolean; onSubmit: (prompt: string) => void }) {
  const [text, setText] = useState("");
  const ready = text.trim().length >= 3;
  const send = () => { if (ready && !busy) onSubmit(text.trim()); };

  return (
    <main className="write press">
      <div className="mast"><b>United States of Jev</b><span className="flag"><Ornament kind="rule" /></span><span>Any polity, one term</span></div>
      <h1>Name a place and a time.</h1>
      <p className="muted">Germany in 2021. Rome in 44 BC. A Mars colony in 2091. Write it in any language.</p>
      <textarea className="ask" rows={3} value={text} autoFocus spellCheck={false}
        placeholder="Egypt after the 2011 revolution" aria-label="Name a place and a time"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
      <div className="row">
        <button className={`btn ${busy ? "busy" : ""}`} disabled={!ready || busy} onClick={send}>
          {busy ? "Finding this era" : "Find this era"}
        </button>
        <span className="small muted">Command or Control plus Enter sends it.</span>
      </div>
    </main>
  );
}
