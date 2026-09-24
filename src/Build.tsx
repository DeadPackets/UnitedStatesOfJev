// The build wait: the steps of the world's build, and each readable part of the world as its fragment lands (the plan,
// the sources, the roster, the canon, the groups, the briefing, the theme, the emblems), so the player reads the
// world while it is written. Reads generation v2's steps and fragments, and v1's (frame, members) for older builds.
import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { parseThemeTokens } from "../worker/tokens";
import { api, type BuildState, type Fragment, type FrameFragment, type PackView } from "./api";
import { Mark } from "./desk/Emblem";
import { LINE_ICON } from "./desk/Icon";
import { applyTokens } from "./theme";

const PHASES = [
  "plan",
  "gather",
  "roster",
  "check",
  "bible",
  "sections",
  "people",
  "finish",
] as const;
type Phase = (typeof PHASES)[number];
const LABEL: Record<Phase, string> = {
  plan: "Plan the search",
  gather: "Read the sources",
  roster: "Draw up the roster",
  check: "Check the roster",
  bible: "Fix the canon",
  sections: "Write the world",
  people: "Name the people",
  finish: "Bind the pack",
};
// Generation v1's steps, so a build started before v2 still moves the list.
const OLD_STEP: Record<string, Phase> = {
  fetch: "gather",
  facts: "check",
  calendar: "check",
  frame: "bible",
  constitution: "sections",
  assign: "sections",
  names: "people",
  personas: "people",
  dedupe: "people",
  deck: "people",
  index: "finish",
  assemble: "finish",
};

// The plan's dates are YYYY-MM-DD with BC years negative (-0044-03-15); anything else prints as written.
function dated(date: string): string {
  const parts = /^(-?)(\d{1,6})-(\d{2})-(\d{2})$/.exec(date);
  if (!parts) return date;
  const [, bc, year, month, day] = parts;
  const name = new Date(Date.UTC(2000, Number(month) - 1)).toLocaleString("en", {
    month: "long",
    timeZone: "UTC",
  });
  return `${Number(day)} ${name} ${Number(year)}${bc ? " BC" : ""}`;
}

type Timed = { at?: number };
type PlanFragment = Timed & { seat: string; holder: string; start: string; end: string };
type SourcesFragment = Timed & { pages: string[] };
type RosterFragment = Timed & {
  groups: {
    id: string;
    name: string;
    sits: "home" | "abroad";
    seats: number | null;
    wants: string;
  }[];
};
type BibleFragment = Timed & {
  title: string;
  era: string;
  place: string;
  groups: { id: string; name: string; short: string; identity: string }[];
};
type GroupsFragment = Timed & {
  rows: { id: string; icon: string; color: string; wants: string }[];
};
type ChamberFragment = Timed & { name: string; factions: { id: string; color: string }[] };
type BriefingFragment = Timed & {
  role: string;
  situation: string;
  problems: string[];
  pledges: string[];
};

const TOO_LONG = "The build is taking too long. Try again later.";
// A step that retries can add its kind twice: the last one wins.
const last = <T,>(fragments: Fragment[], kind: string) =>
  [...fragments].reverse().find((fragment) => fragment.kind === kind) as T | undefined;
const clock = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
const At = ({ at }: Timed) =>
  at === undefined ? null : <span className="at num">{clock(at)}</span>;

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
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);

  useEffect(() => {
    let live = true;
    let timer = 0;
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
      // A build runs three to four minutes; past 15 the Workflow is gone and no later poll will answer.
      const age = Date.now() - started;
      if (age > 900_000)
        return setState((s) => ({
          status: "failed",
          step: s?.step ?? null,
          fragments: s?.fragments ?? [],
          error: TOO_LONG,
        }));
      timer = setTimeout(tick, age > 300_000 ? 5000 : 2000) as unknown as number;
    };
    tick();
    const second = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live = false;
      clearTimeout(timer);
      clearInterval(second);
    };
  }, [id, started]);

  const fragments = state?.fragments ?? [];
  const plan = last<PlanFragment>(fragments, "plan");
  const sources = last<SourcesFragment>(fragments, "sources");
  const roster = last<RosterFragment>(fragments, "roster");
  const bible = last<BibleFragment>(fragments, "bible");
  const chamber = last<ChamberFragment>(fragments, "chamber");
  const briefing = last<BriefingFragment>(fragments, "briefing");
  const theme = last<Timed & { tokens: unknown }>(fragments, "theme");
  const emblems = last<{ emblems: Record<string, unknown> }>(fragments, "emblems")?.emblems ?? {};
  const rows = new Map(
    fragments
      .filter((fragment) => fragment.kind === "groups")
      .flatMap((fragment) => (fragment as unknown as GroupsFragment).rows)
      .map((row) => [row.id, row]),
  );
  const groupsAt = fragments.filter((fragment) => fragment.kind === "groups").at(-1)?.at as
    | number
    | undefined;
  // The build's own clock (v2 fragments carry it), so a reload mid-build does not restart the count.
  const latest = Math.max(0, ...fragments.map((fragment) => Number(fragment.at) || 0));
  const frame = last<FrameFragment>(fragments, "frame");
  const members = last<{ names: string[] }>(fragments, "members");

  // The world's own look lands with its theme part; the tokens are parsed again here, as the desk does.
  useLayoutEffect(() => {
    if (theme) applyTokens(parseThemeTokens(theme.tokens).tokens);
  }, [theme]);
  useEffect(() => {
    if (state?.status === "ready" && state.pack) onReady(state.pack);
  }, [state, onReady]);

  const failed = state?.status === "failed";
  const ready = state?.status === "ready";
  const step = state?.step ?? "plan";
  const at = PHASES.indexOf((OLD_STEP[step] ?? step) as Phase);
  const title = bible?.title ?? frame?.title;
  const where = bible ?? frame;
  const groups = (roster?.groups ?? []).map((group) => {
    const canon = bible?.groups.find((entry) => entry.id === group.id);
    const row = rows.get(group.id);
    const colour =
      row?.color ?? chamber?.factions.find((faction) => faction.id === group.id)?.color;
    return {
      ...group,
      name: canon?.short || group.name,
      about: canon?.identity ?? row?.wants ?? group.wants,
      colour,
      icon: row?.icon,
    };
  });

  return (
    <main className="build">
      <div className="mast">
        <b>{title ?? "Building the world"}</b>
        <span className="flag" />
        <span>
          {where ? `${where.era} · ${where.place}` : "Three to four minutes"}
          {failed ? null : <span className="num"> · {clock(Math.max(now - started, latest))}</span>}
        </span>
      </div>
      {state?.pack?.content_note ? <p className="note">{state.pack.content_note}</p> : null}

      {failed ? (
        <section className="stage">
          <h1>The build stopped.</h1>
          <p className="error">{state?.error ?? "The build stopped before it finished."}</p>
          <button className="btn" onClick={onRestart}>
            Try another prompt
          </button>
        </section>
      ) : (
        <>
          <section className="stage bstage">
            {briefing ? (
              <div className="bpart sf rise">
                <span className="kicker">
                  {briefing.role} <At at={briefing.at} />
                </span>
                <p className="bsit">{briefing.situation}</p>
                <div className="bcols">
                  <div>
                    <span className="kicker">On the table</span>
                    <ul className="memory">
                      {briefing.problems.map((problem) => (
                        <li key={problem}>{problem}</li>
                      ))}
                    </ul>
                  </div>
                  {briefing.pledges.length ? (
                    <div>
                      <span className="kicker">What you can promise</span>
                      <ul className="memory">
                        {briefing.pledges.map((pledge) => (
                          <li key={pledge}>{pledge}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : frame ? (
              <p className="lede">{frame.description}</p>
            ) : plan ? (
              <p className="lede rise">
                {plan.holder}, {plan.seat}, from {dated(plan.start)} to {dated(plan.end)}.
              </p>
            ) : (
              <h1>Reading the world, seating the chamber.</h1>
            )}
            {groups.length ? (
              <div className="bpart rise">
                <span className="kicker">
                  {chamber?.name ? `Who matters · ${chamber.name}` : "Who matters"}{" "}
                  <At at={groupsAt ?? bible?.at ?? roster?.at} />
                </span>
                <div className="bgroups">
                  {(["home", "abroad"] as const).map((side) => (
                    <div key={side}>
                      {groups
                        .filter((group) => group.sits === side)
                        .map((group) => (
                          <div
                            key={group.id}
                            className="bgroup sf"
                            style={
                              group.colour ? ({ "--gl": group.colour } as CSSProperties) : undefined
                            }
                          >
                            <span className="hi">
                              <Mark
                                emblem={emblems[group.id]}
                                icon={
                                  LINE_ICON[group.icon as keyof typeof LINE_ICON] ?? "i-council"
                                }
                              />
                            </span>
                            <span>
                              <b>{group.name}</b>
                              {group.seats ? (
                                <span className="num"> · {group.seats} seats</span>
                              ) : null}
                              <small>{group.about}</small>
                            </span>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : frame ? (
              <div className="chips" style={{ justifyContent: "start" }}>
                {frame.factions.map((faction) => (
                  <span
                    key={faction.id}
                    className="chip rise"
                    style={{ borderColor: faction.color, color: faction.color }}
                  >
                    {faction.name}
                  </span>
                ))}
              </div>
            ) : null}
            {!briefing && frame?.problems?.length ? (
              <div className="field">
                <span className="kicker">On the table</span>
                <ul className="memory">
                  {frame.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {members?.names.length ? (
              <div className="field">
                <span className="kicker">{state?.pack?.vocabulary.member ?? "Members"}</span>
                <p className="small muted">{members.names.join(" · ")}</p>
              </div>
            ) : null}
            {sources?.pages.length && !briefing ? (
              <p className="small muted rise">
                Read {sources.pages.length} pages: {sources.pages.slice(0, 6).join(" · ")}
                {sources.pages.length > 6 ? " …" : ""} <At at={sources.at} />
              </p>
            ) : null}
          </section>
          <aside className="rail" aria-label="Build progress">
            <ol className="steps" aria-live="polite">
              {PHASES.map((phase, i) => (
                <li key={phase} data-state={ready || i < at ? "done" : i === at ? "now" : "wait"}>
                  {LABEL[phase]}
                </li>
              ))}
            </ol>
          </aside>
        </>
      )}
    </main>
  );
}
