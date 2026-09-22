import { useEffect, useMemo, useRef, useState } from "react";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import Tiles, { shortNames, type TileDatum } from "./Tiles";
import { Num, national } from "./Ledger";
import { Ornament } from "./theme";
import { CAMPAIGN_TURNS, SPEND_STEPS, type Lever } from "../worker/engine";
import { radioKeys } from "./keys";

type Props = { game: GameView; act: Act; busy: boolean };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const points = (x: number) => `+${(x * 100).toFixed(2)}`;
const LEVERS = ["spend", "favor"] as const;

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
    act(() => api.drafts(game)).then((ok) => { if (!ok) setFailed(true); });
  };
  // A failed fetch waits for the button; the effect only asks once per turn.
  useEffect(() => { if (!c.drafts.length && !busy && !failed && asked.current !== n) draw(); }, [n, c.drafts.length, busy, failed]); // eslint-disable-line
  useEffect(() => { setMessage(""); setSpend({}); setSeat(""); }, [n]);

  const picked = Object.entries(spend).filter(([, a]) => a > 0);
  const lever: Lever = kind === "spend"
    ? { kind: "spend", regions: picked.map(([id, amount]) => ({ id, amount })) }
    : { kind: "favor", memberId: seat };
  // Priced here, not by the engine: the client never imports the engine's escalation tables.
  const cost = kind === "spend"
    ? { chest: picked.reduce((s, [, a]) => s + a, 0), capital: 0 }
    : { chest: 0, capital: c.gains.favorCost };
  const spendGain = picked.reduce((s, [id, a]) => s + (c.gains.spend[id]?.[SPEND_STEPS.indexOf(a as (typeof SPEND_STEPS)[number])] ?? 0), 0);
  const favorGain = c.gains.favor;
  // With neither a region step nor the favor affordable, the turn still has to run: an empty spend costs nothing.
  const stuck = game.ledgers.chest < SPEND_STEPS[1] && game.ledgers.capital < c.gains.favorCost;
  const run: Lever = stuck ? { kind: "spend", regions: [] } : lever;
  const ready = !!message && (stuck || ((kind === "spend" ? picked.length > 0 : !!seat)
    && cost.chest <= game.ledgers.chest && cost.capital <= game.ledgers.capital));

  const regionName = useMemo(() => new Map(pack.regions.map((r) => [r.id, r.name])), [pack.regions]);
  const factionColour = useMemo(() => new Map(pack.factions.map((f) => [f.id, f.color])), [pack.factions]);

  const last = c.turns.at(-1);
  const lastP = useMemo(() => new Map(last?.regions.map((r) => [r.id, r.p])), [last]);
  const pWin = (id: string) => lastP.get(id)
    ?? 1 / (1 + Math.exp(-((c.intent[id] ?? 0.5) - 0.5) * 12));
  const wsum = pack.regions.reduce((a, r) => a + r.weight, 0) || 1;
  const shorts = shortNames(pack.regions.map((r) => r.name));
  const items: TileDatum[] = pack.regions.map((r, i) => ({
    id: r.id, name: r.name, short: shorts[i], weight: r.weight / wsum, p: pWin(r.id),
  }));
  const point = last ? last.public : national(pack, Object.fromEntries(pack.regions.map((r) => [r.id, (c.intent[r.id] ?? 0.5) * 100]))) / 100;

  // The chamber half is the confidence whip across every seat, so a favor may go to any member.
  const weakest = useMemo(() => [...game.members].sort((a, b) => a.loyalty - b.loyalty), [game.members]);

  const pick = (id: string) => setSpend((s) => {
    if (id in s) { const next = { ...s }; delete next[id]; return next; }
    if (Object.values(s).filter((a) => a > 0).length >= 2) return s;
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
          {c.drafts.map((d, i) => (
            <button key={d} className="opt2" role="radio" aria-checked={message === d}
              tabIndex={message === d || (!message && i === 0) ? 0 : -1}
              onKeyDown={radioKeys(i, c.drafts.length, (j) => setMessage(c.drafts[j]))}
              onClick={() => setMessage(d)}>{d}</button>
          ))}
          {!c.drafts.length ? (
            failed ? <button className="btn ghost" disabled={busy} onClick={draw}>Ask for the drafts</button>
              : <p className="muted small">Luna is writing.</p>
          ) : null}
        </div>

        <div className="panel levers">
          <div className="kicker">One lever</div>
          <div className="row tworadio" role="radiogroup" aria-label="One lever">
            {LEVERS.map((k, i) => (
              <button key={k} className="opt" role="radio" aria-checked={kind === k} tabIndex={kind === k ? 0 : -1}
                onKeyDown={radioKeys(i, LEVERS.length, (j) => setKind(LEVERS[j]))}
                onClick={() => setKind(k)}>{k === "spend" ? "Regions" : v.seat}</button>
            ))}
          </div>

          {kind === "spend" ? (
            <>
              <p className="muted small">Two regions at most. Tap a tile, then set what it costs.</p>
              {picked.map(([id, amount]) => (
                <div key={id} className="row step">
                  <span>{regionName.get(id)}</span>
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
                {weakest.map((m, i) => (
                  <li key={m.id}>
                    <button className="fcard" role="radio" aria-checked={seat === m.id}
                      tabIndex={seat === m.id || (!seat && i === 0) ? 0 : -1}
                      onKeyDown={radioKeys(i, weakest.length, (j) => setSeat(weakest[j].id))}
                      onClick={() => setSeat(m.id)}>
                      <span className="sq on" style={{ color: factionColour.get(m.faction) ?? "var(--ink)" }} />
                      <span className="t"><b>{m.name}</b><span className="muted small">{regionName.get(m.region) ?? m.region}</span></span>
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
          {stuck ? <p className="muted small">Nothing left to spend</p> : null}

          <button className={`btn ${busy ? "busy" : ""}`} disabled={busy || !ready}
            onClick={() => act(() => api.campaign(game, message, run))}>
            {busy ? "Counting" : n === CAMPAIGN_TURNS ? v.test : `Run the ${v.turn}`}
          </button>
        </div>
      </aside>
    </main>
  );
}
