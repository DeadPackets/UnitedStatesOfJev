import { useState } from "react";
import type { Daily } from "./api";
import { Ornament } from "./theme";
import { shareText, squareClass } from "./rules";

export default function Landing({
  daily,
  resume,
  busy,
  onFind,
  onResume,
  onCode,
  onPlayDaily,
}: {
  daily: Daily | null;
  resume: boolean;
  busy: boolean;
  onFind: (prompt: string) => void;
  onResume: () => void;
  onCode: (code: string) => void;
  onPlayDaily: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const ready = text.trim().length >= 3;
  const send = () => {
    if (ready && !busy) onFind(text.trim());
  };
  return (
    <main className="landing press">
      <div className="mast">
        <b>United States of Jev</b>
        <span className="flag">
          <Ornament kind="rule" />
        </span>
        <span>Any polity, one term</span>
      </div>

      <section className="panel door" aria-label="Today's term">
        <div className="kicker">Today's term</div>
        {daily ? (
          <>
            <h2>{daily.title}</h2>
            <p className="small muted">
              {daily.era} · {daily.place}
            </p>
            {daily.played && daily.grid ? (
              <div className="sharecard" aria-label="Today's result">
                {daily.grid.map((s, i) => (
                  <div key={i}>
                    <span className={squareClass(s.ledger)} />
                    <span>{i + 1}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {daily.played && daily.grid ? (
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => {
                  navigator.clipboard
                    .writeText(shareText(daily.title, daily.day, daily.grid!, daily.streak))
                    .then(
                      () => setCopied(true),
                      () => setCopied(false),
                    );
                }}
              >
                {copied ? "Copied" : "Copy the grid"}
              </button>
            ) : null}
            <div className="row">
              <button
                className={`btn ${daily.played ? "ghost" : ""}`}
                disabled={busy}
                onClick={() => onPlayDaily(daily.scenario)}
              >
                {daily.played ? "Play it again as practice" : "Take the seat"}
              </button>
              <span className="small muted num">
                Streak {daily.streak} · played {daily.plays}
              </span>
            </div>
          </>
        ) : (
          <p className="note">Today's term is not up yet. Name a place and a time instead.</p>
        )}
      </section>

      <section className="panel door" aria-label="Any polity">
        <div className="kicker">Any polity</div>
        <h2>Name a place and a time.</h2>
        <p className="muted">Rome in 44 BC, or a Mars colony in 2091. Write it in any language.</p>
        <textarea
          className="ask"
          rows={2}
          value={text}
          spellCheck={false}
          placeholder="Egypt after the 2011 revolution"
          aria-label="Name a place and a time"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="row">
          <button className={`btn ${busy ? "busy" : ""}`} disabled={!ready || busy} onClick={send}>
            {busy ? "Finding it" : "Find it"}
          </button>
          <span className="small muted">Command or Control plus Enter sends it.</span>
        </div>
      </section>

      {resume ? (
        <section className="panel door" aria-label="Resume">
          <div className="kicker">Where you left off</div>
          <button className="btn" disabled={busy} onClick={onResume}>
            Back to the desk
          </button>
        </section>
      ) : null}

      <section className="panel door" aria-label="A friend's code">
        <div className="kicker">A friend's code</div>
        <div className="field">
          <input
            className="code"
            value={code}
            spellCheck={false}
            aria-label="A friend's code"
            placeholder="J3-XXXXXX-0-012-000000"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            className="btn ghost"
            disabled={busy || code.trim().length < 8}
            onClick={() => onCode(code.trim())}
          >
            Play that seat
          </button>
        </div>
      </section>
    </main>
  );
}
