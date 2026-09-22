import { useEffect, useRef, useState } from "react";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import Tiles, { type TileDatum } from "./Tiles";
import { Num, national } from "./Ledger";
import { Ornament } from "./theme";
import { CAMPAIGN_TURNS, SPEND_STEPS, leverCost, type Lever } from "../worker/engine";

type Props = { game: GameView; act: Act; busy: boolean };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const points = (x: number) => `+${(x * 100).toFixed(2)}`;

/**
 * The four closing turns: one message of three, then one lever. The gains are the engine's own
 * estimate, already weighted by alpha, so the two levers can be read against each other.
 */
export default function Campaign({ game, act, busy }: Props) {
  const pack = game.pack;
  const v = pack.vocabulary;
  const c = game.campaign!;
  const n = c.turns.length + 1;
  const alpha = pack.chamber.alpha;
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"spend" | "favor">("spend");
  const [spend, setSpend] = useState<Record<string, number>>({});
  const [seat, setSeat] = useState("");
  const [failed, setFailed] = useState(false);
  const asked = useRef(0);

  const draw = () => {
    asked.current = n; setFailed(false);
    act(() => api.drafts(game)).then((ok) => { if (!ok) { asked.current = 0; setFailed(true); } });
  };
  useEffect(() => { if (!c.drafts.length && !busy && asked.current !== n) draw(); }, [n, c.drafts.length, busy]); // eslint-disable-line
  useEffect(() => { setMessage(""); setSpend({}); setSeat(""); }, [n]);

  const picked = Object.entries(spend).filter(([, a]) => a > 0);
  const lever: Lever = kind === "spend"
    ? { kind: "spend", regions: picked.map(([id, amount]) => ({ id, amount })) }
    : { kind: "favor", memberId: seat };
  const cost = leverCost(game as never, lever);
  const spendGain = picked.reduce((s, [id, a]) => s + (c.gains.spend[id]?.[SPEND_STEPS.indexOf(a as (typeof SPEND_STEPS)[number])] ?? 0), 0);
  const favorGain = c.gains.favor;
  const ready = !!message && (kind === "spend" ? picked.length > 0 : !!seat)
    && cost.chest <= game.ledgers.chest && cost.capital <= game.ledgers.capital;

  const last = c.turns.at(-1);
  const pWin = (id: string) => last?.regions.find((r) => r.id === id)?.p
    ?? 1 / (1 + Math.exp(-((c.intent[id] ?? 0.5) - 0.5) * 12));
  const wsum = pack.regions.reduce((a, r) => a + r.weight, 0) || 1;
  const items: TileDatum[] = pack.regions.map((r) => ({
    id: r.id, name: r.name, short: r.name.slice(0, 3).toUpperCase(), weight: r.weight / wsum, p: pWin(r.id),
  }));
  const point = last ? last.public : national(pack, Object.fromEntries(pack.regions.map((r) => [r.id, (c.intent[r.id] ?? 0.5) * 100]))) / 100;

  // The chamber half is the confidence whip across every seat, so a favor may go to any member.
  const weakest = [...game.members].sort((a, b) => a.loyalty - b.loyalty);
  const colour = (id: string) => pack.factions.find((f) => f.id === id)?.color ?? "var(--ink)";

  const pick = (id: string) => setSpend((s) => {
    if (s[id]) { const next = { ...s }; delete next[id]; return next; }
    if (Object.keys(s).length >= 2) return s;
    return { ...s, [id]: 5 };
  });

  return (
    <main className="chamber press campaign">
      <header className="topbar">
        <h1>{pack.title}</h1>
        <nav aria-label={v.campaign}>
          <Ornament kind={pack.theme.ornament} />
          <span className="chip">{v.campaign}</span>
          <span className="num" style={{ padding: "0 8px" }}>{n} of {CAMPAIGN_TURNS}</span>
        </nav>
      </header>

      <section className="stage" aria-label={v.campaign}>
        <div className="kicker">The count as it stands</div>
        <div className="forecast">
          <Num value={point * 100} decimals={1} className="n" />
          <span className="muted small num">
            {last ? `band ${pct(last.band[0])} to ${pct(last.band[1])}` : "no count yet"}
          </span>
        </div>
        <div className="whipbar band" role="meter" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(point * 100)} aria-label="Forecast">
          {last ? <div className="seg" style={{ left: `${last.band[0] * 100}%`, width: `${(last.band[1] - last.band[0]) * 100}%` }} /> : null}
          <div className="pt" style={{ left: `${point * 100}%` }} />
          <div className="tick" style={{ left: "50%" }}><span className="num">50</span></div>
        </div>
        <Tiles items={items} label={v.campaign}
          selected={kind === "spend" ? picked.map(([id]) => id) : []}
          state={Object.fromEntries(c.rival.map((id) => [id, "lost" as const]))}
          onPick={kind === "spend" ? pick : undefined}
          foot={(d) => `${Math.round(d.p * 100)}%${c.rival.includes(d.id) ? " · rival" : ""}`} />
      </section>

      <aside className="rail" aria-label={v.campaign}>
        <div className="panel drafts" role="radiogroup" aria-label="Three drafts">
          <div className="kicker">Three drafts</div>
          {c.drafts.map((d) => (
            <button key={d} className="opt2" role="radio" aria-checked={message === d} onClick={() => setMessage(d)}>{d}</button>
          ))}
          {!c.drafts.length ? (
            failed ? <button className="btn ghost" disabled={busy} onClick={draw}>Ask for the drafts</button>
              : <p className="muted small">Luna is writing.</p>
          ) : null}
        </div>

        <div className="panel levers">
          <div className="kicker">One lever</div>
          <div className="row tworadio" role="radiogroup" aria-label="One lever">
            <button className="opt" role="radio" aria-checked={kind === "spend"} onClick={() => setKind("spend")}>Regions</button>
            <button className="opt" role="radio" aria-checked={kind === "favor"} onClick={() => setKind("favor")}>{v.seat}</button>
          </div>

          {kind === "spend" ? (
            <>
              <p className="muted small">Two regions at most. Tap a tile, then set what it costs.</p>
              {picked.map(([id, amount]) => (
                <div key={id} className="row step">
                  <span>{pack.regions.find((r) => r.id === id)?.name}</span>
                  {SPEND_STEPS.map((a) => (
                    <button key={a} className="opt" aria-pressed={amount === a}
                      onClick={() => setSpend((s) => ({ ...s, [id]: a }))}>{a}</button>
                  ))}
                </div>
              ))}
              <p className="small num">
                Chest {game.ledgers.chest.toFixed(1)}, this costs {cost.chest}, {(game.ledgers.chest - cost.chest).toFixed(1)} left
              </p>
            </>
          ) : (
            <>
              <p className="muted small">The weakest first. One {v.member}, {cost.capital} {v.capital}.</p>
              <ul className="picker seats" role="radiogroup" aria-label={v.seat}>
                {weakest.map((m) => (
                  <li key={m.id}>
                    <button className="fcard" role="radio" aria-checked={seat === m.id} onClick={() => setSeat(m.id)}>
                      <span className="sq on" style={{ color: colour(m.faction) }} />
                      <span className="t"><b>{m.name}</b><span className="muted small">{pack.regions.find((r) => r.id === m.region)?.name ?? m.region}</span></span>
                      <span className="num">{m.loyalty}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="small num">{v.capital} {game.ledgers.capital}, this costs {cost.capital}</p>
            </>
          )}

          <div className="gains">
            <div className={kind === "spend" ? "on" : ""}>
              <div className="kicker">Regions</div>
              <b className="num">{points(spendGain)}</b>
              <span className="muted small"> public × α</span>
            </div>
            <div className={kind === "favor" ? "on" : ""}>
              <div className="kicker">{v.seat}</div>
              <b className="num">{points(favorGain)}</b>
              <span className="muted small"> loyalty × (1 - α)</span>
            </div>
          </div>
          <p className="muted small num">α {alpha.toFixed(2)} public to {(1 - alpha).toFixed(2)} chamber</p>

          <button className={`btn ${busy ? "busy" : ""}`} disabled={busy || !ready}
            onClick={() => act(() => api.campaign(game, message, lever))}>
            {busy ? "Counting" : n === CAMPAIGN_TURNS ? v.test : `Run the ${v.turn}`}
          </button>
        </div>
      </aside>
    </main>
  );
}
