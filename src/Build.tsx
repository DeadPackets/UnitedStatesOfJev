import { useEffect, useRef, useState } from "react";
import { api, type BuildState, type FrameFragment, type PackView } from "./api";
import { Ornament, applyTheme } from "./theme";

const STEPS = [
  "plan",
  "fetch",
  "facts",
  "calendar",
  "frame",
  "constitution",
  "assign",
  "names",
  "personas",
  "dedupe",
  "deck",
  "index",
  "assemble",
] as const;
const PLAIN: Record<string, string> = {
  plan: "Plan the search",
  fetch: "Read the sources",
  facts: "Check names and dates",
  calendar: "Set the calendar",
  frame: "Draw the chamber",
  constitution: "Write the constitution",
  assign: "Fill the seats",
  names: "Name the members",
  personas: "Write the people",
  dedupe: "Clear the repeats",
  deck: "Build the deck",
  index: "File it in the archive",
  assemble: "Bind the pack",
};

type Vocab = PackView["vocabulary"] | undefined;
// Four steps take the pack's own words once the frame carries them; the rest read the same in any era.
const label = (step: string, v: Vocab) => {
  if (!v) return PLAIN[step];
  switch (step) {
    case "frame":
      return `Draw the ${v.chamber}`;
    case "assign":
      return `Fill every ${v.seat}`;
    case "names":
      return `Name the ${v.member}`;
    case "deck":
      return `Build the ${v.bill} deck`;
    default:
      return PLAIN[step];
  }
};

const TOO_LONG = "The build is taking too long. Try again later.";
const find = <T,>(s: BuildState | null, kind: string) =>
  s?.fragments.find((f) => f.kind === kind) as T | undefined;

export default function Build({
  id,
  onReady,
  onRestart,
}: {
  id: string;
  onReady: (pack: PackView) => void;
  onRestart: () => void;
}) {
  const [state, setState] = useState<BuildState | null>(null);
  const [wiping, setWiping] = useState(false);
  const themed = useRef(false);

  useEffect(() => {
    let live = true;
    let timer = 0;
    const started = Date.now();
    const tick = async () => {
      try {
        const s = await api.scenario(id);
        if (!live) return;
        setState(s);
        if (s.status === "ready" || s.status === "failed") return;
      } catch {
        /* a dropped poll is not a failed build; try again on the next tick */
      }
      if (!live) return;
      // A build runs one to two minutes; past 15 the Workflow is gone and no later poll will answer.
      const age = Date.now() - started;
      if (age > 900_000)
        return setState((s) => ({
          status: "failed",
          step: s?.step ?? null,
          fragments: s?.fragments ?? [],
          error: TOO_LONG,
        }));
      timer = setTimeout(tick, age > 120_000 ? 5000 : 2000) as unknown as number;
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id]);

  const frame = find<FrameFragment>(state, "frame");
  const members = find<{ names: string[] }>(state, "members");
  const vocab = state?.pack?.vocabulary ?? frame?.vocabulary;

  // The theme lands mid-build, behind a sheet of paper crossing the page.
  useEffect(() => {
    if (!frame || themed.current) return;
    themed.current = true;
    setWiping(true);
    const paint = setTimeout(() => applyTheme(frame.theme), 300);
    const done = setTimeout(() => setWiping(false), 600);
    return () => {
      clearTimeout(paint);
      clearTimeout(done);
    };
  }, [frame]);

  useEffect(() => {
    if (!wiping && state?.status === "ready" && state.pack) onReady(state.pack);
  }, [wiping, state, onReady]);

  const failed = state?.status === "failed";
  const ready = state?.status === "ready";
  const at = STEPS.indexOf((state?.step ?? "plan") as (typeof STEPS)[number]);

  return (
    <main className="build press">
      {wiping ? <div className="wipe" aria-hidden="true" /> : null}
      <div className="mast">
        <b>{frame?.title ?? "Building the era"}</b>
        <span className="flag">
          <Ornament kind={state?.pack?.theme.ornament ?? "rule"} />
        </span>
        <span>{frame ? `${frame.era} · ${frame.place}` : "One to two minutes"}</span>
      </div>
      {state?.pack?.content_note ? <p className="note">{state.pack.content_note}</p> : null}

      {failed ? (
        <section className="stage">
          <h1>The press jammed.</h1>
          <p className="error">{state?.error ?? "The build stopped before it finished."}</p>
          <button className="btn" onClick={onRestart}>
            Try another prompt
          </button>
        </section>
      ) : (
        <>
          <section className="stage">
            {frame ? (
              <p className="lede">{frame.description}</p>
            ) : (
              <h1>Reading the era, seating the chamber.</h1>
            )}
            {frame ? (
              <div className="chips" style={{ justifyContent: "start" }}>
                {frame.factions.map((f) => (
                  <span
                    key={f.id}
                    className="chip rise"
                    style={{ borderColor: f.color, color: f.color }}
                  >
                    {f.name}
                  </span>
                ))}
              </div>
            ) : null}
            {frame?.problems?.length ? (
              <div className="field">
                <span className="kicker">On the table</span>
                <ul className="memory">
                  {frame.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {members?.names.length ? (
              <div className="field">
                <span className="kicker">{vocab?.member ?? "Members"}</span>
                <p className="small muted">{members.names.join(" · ")}</p>
              </div>
            ) : null}
          </section>
          <aside className="rail" aria-label="Build progress">
            <ol className="steps" aria-live="polite">
              {STEPS.map((s, i) => {
                const st = ready || i < at ? "done" : i === at ? "now" : "wait";
                return (
                  <li key={s} data-state={st}>
                    {label(s, vocab)}
                  </li>
                );
              })}
            </ol>
          </aside>
        </>
      )}
    </main>
  );
}
