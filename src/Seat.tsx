import { useEffect, useMemo, useRef, useState } from "react";
import type { PackView } from "./api";
import { Chamber } from "./Hemicycle";
import Tiles, { shortNames, type TileDatum } from "./Tiles";
import { DEFAULT_THEME_TOKENS } from "../worker/tokens";
import { applyTokens } from "./theme";
import { allRead, barAt, difficulty, LEDGER_KEYS } from "./rules";
import { sound } from "./sound";

const b36 = (n: number) => n.toString(36);
const PAGES = ["The situation", "The room", "You"] as const;

export default function Seat({
  pack,
  busy,
  onSeat,
}: {
  pack: PackView;
  busy: boolean;
  onSeat: (faction: string, promises: number[], seed: number, platform: string) => Promise<boolean>;
}) {
  const [page, setPage] = useState(0);
  const [read, setRead] = useState<ReadonlySet<number>>(() => new Set([0]));
  const go = (p: number) => {
    setPage(p);
    setRead((r) => new Set(r).add(p));
  };
  const [picks, setPicks] = useState<number[]>([]);
  const [platform, setPlatform] = useState("");
  const [stamped, setStamped] = useState(false);
  const [seed] = useState(() => Math.floor(Math.random() * 36 ** 6));
  useEffect(() => {
    applyTokens(pack.themeTokens ?? DEFAULT_THEME_TOKENS);
  }, [pack.themeTokens]);

  const c = pack.constitution;
  // The pack names the office holder's own party, so there is no picker (planning brief).
  const start = pack.starts.find((s) => s.faction === c?.ruler.faction) ?? pack.starts[0];
  const own = pack.members.filter((m) => m.faction === start.faction).length;
  const gap = pack.chamber.threshold - own;
  const v = pack.vocabulary;
  const full = picks.length === 3;
  const readAll = allRead(read, PAGES.length);
  const code = `J3-${pack.id.slice(0, 6)}-${b36(pack.factions.findIndex((f) => f.id === start.faction))}-${[0, 1, 2].map((i) => (picks[i] === undefined ? "_" : b36(picks[i]))).join("")}-${b36(seed).padStart(6, "0")}`;
  const toggle = (i: number) =>
    setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < 3 ? [...p, i] : p));

  const shorts = useMemo(() => shortNames(pack.regions.map((r) => r.name)), [pack.regions]);
  const wsum = pack.regions.reduce((a, r) => a + r.weight, 0) || 1;
  const tiles: TileDatum[] = pack.regions.map((r, i) => ({
    id: r.id,
    name: r.name,
    short: shorts[i],
    weight: r.weight / wsum,
    p: r.lean.find((l) => l.id === start.faction)?.value ?? 0.5,
  }));
  const weight = (id: string) => c?.retention.weights.find((w) => w.id === id)?.value ?? 0;

  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const take = () => {
    setStamped(true);
    sound.play("gavel");
    timer.current = setTimeout(
      () =>
        onSeat(start.faction, picks, seed, platform.trim()).then((ok) => {
          if (!ok) setStamped(false);
        }),
      650,
    ) as unknown as number;
  };

  return (
    <main className="takeseat press" onPointerDown={sound.unlock}>
      <div className="mast">
        <b>{pack.title}</b>
        <span className="flag" />
        <span>
          {pack.era} · {pack.place}
        </span>
      </div>

      {stamped ? <div className="wipe" aria-hidden="true" /> : null}
      <div className="sr" role="status" aria-live="polite">
        {stamped ? `Sworn in. ${pack.title}.` : ""}
      </div>

      <section className="stage" aria-label={PAGES[page]}>
        <div className="stagearea">
          <div className="kicker">
            {page + 1} of 3 · {PAGES[page]}
          </div>
          {page === 0 ? (
            <>
              <h2 className="head">{start.premise}</h2>
              <p>{c?.briefing.situation}</p>
              {pack.content_note ? <p className="note">{pack.content_note}</p> : null}
              <Tiles
                items={tiles}
                label="The regions by weight"
                foot={(d) => `${Math.round(d.p * 100)}`}
              />
            </>
          ) : page === 1 ? (
            <>
              <p>{c?.briefing.room}</p>
              <Chamber
                pack={pack}
                members={pack.members}
                own={start.faction}
                coalition={start.coalition}
              />
              <ul className="causes" aria-label="Who can stop you">
                {(c?.holders ?? []).map((h) => (
                  <li key={h.id}>
                    <b className="num">{Math.round(h.stance * 100)}</b>
                    <span>
                      {h.name}, {h.where === "abroad" ? "abroad" : "at home"}, weight{" "}
                      {weight(h.id).toFixed(2)}, line {h.line}, {h.response.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p>{c?.briefing.you}</p>
              <ul className="causes" aria-label="The five ledgers here">
                {LEDGER_KEYS.map((k) => (
                  <li key={k}>
                    <b className="num">{c?.ledgers?.[k]?.line ?? 0}</b>
                    <span>{c?.ledgers?.[k]?.name ?? k}, fails at that number</span>
                  </li>
                ))}
              </ul>
              <p className="small num">
                {c?.retention.name ?? pack.test.name} asks for {(barAt(pack, 1) * 100).toFixed(0)}{" "}
                of the room at the end of the term.
              </p>
              <p className="small">
                {difficulty(gap)}. You hold {own} of {pack.chamber.size}, and{" "}
                {pack.chamber.threshold} carries a vote.
              </p>
            </>
          )}
        </div>
      </section>

      <aside className="rail" aria-label="Take the seat">
        <div className="field">
          <span className="kicker" id="l-promise">
            {v.promise} · {picks.length} of 3
          </span>
          <div
            className="chips"
            role="group"
            aria-labelledby="l-promise"
            style={{ justifyContent: "start" }}
          >
            {pack.promises.map((p, i) => (
              <button
                key={p.tag}
                className="opt"
                aria-pressed={picks.includes(i)}
                disabled={full && !picks.includes(i)}
                onClick={() => toggle(i)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="kicker" htmlFor="platform">
            Your platform, one sentence. Optional.
          </label>
          <textarea
            id="platform"
            className="ask"
            rows={2}
            maxLength={240}
            value={platform}
            spellCheck={false}
            placeholder="What you are standing for, and by when."
            onChange={(e) => setPlatform(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="kicker">Your code</span>
          <div className="code" aria-label="Game code">
            {code}
          </div>
          <span className="small muted">
            {full ? "Same code, same room." : "Pick 3 to finish the code."}
          </span>
        </div>
        <div className="row">
          <button className="btn ghost" disabled={page === 0} onClick={() => go(page - 1)}>
            Back
          </button>
          <button className="btn ghost" disabled={page === 2} onClick={() => go(page + 1)}>
            Next
          </button>
        </div>
        <div className="pagedots" role="list" aria-label="Pages read">
          {PAGES.map((t, i) => (
            <span
              key={t}
              role="listitem"
              title={t}
              aria-current={page === i ? "page" : undefined}
              className={`${read.has(i) ? "on" : ""} ${page === i ? "here" : ""}`}
              aria-label={`${t}, ${read.has(i) ? "read" : "not read"}`}
            />
          ))}
        </div>
        {readAll ? null : <span className="small muted">Read all three pages first.</span>}
        <button
          className={`btn ${busy ? "busy" : ""}`}
          disabled={!full || !readAll || busy || stamped}
          onClick={take}
        >
          {busy ? "Taking the oath" : `Take the oath${c?.ruler.role ? ` as ${c.ruler.role}` : ""}`}
        </button>
      </aside>
    </main>
  );
}
