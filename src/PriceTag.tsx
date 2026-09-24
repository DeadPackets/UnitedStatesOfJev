import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Icon, type IconName } from "./icons";
import { hueClass, type LedgerKey } from "./rules";

// `as const`, not `LedgerKey[]`: Price has three keys and indexing it by a five-member union is a tsc error.
const CHARGED = ["treasury", "authority", "chest"] as const;

/** Named `Tag`, because `PriceTag` is Stage B's type name and both land in `src/Desk.tsx`. */
export default function Tag({
  game,
  act,
  busy,
  onDone,
}: {
  game: GameView;
  act: Act;
  busy: boolean;
  onDone: () => void;
}) {
  const names = game.pack.constitution?.ledgers;
  const v = game.pack.vocabulary;
  if (game.refusal) {
    return (
      <figure className="tag refused">
        <figcaption className="tag-h">
          <span>The clerk returns it</span>
          <span className="num">{game.refusal.cost} authority</span>
        </figcaption>
        <div className="tag-b">
          <p>{game.refusal.line}</p>
          <p className="small muted">
            It failed the {game.refusal.test} test. Write it another way and price it again.
          </p>
        </div>
      </figure>
    );
  }
  const t = game.tag;
  if (!t) return null;
  const chips = (k: string, xs: string[]) =>
    xs.length ? (
      <div className="tagr">
        <span className="k">{k}</span>
        <span className="vs">
          {xs.map((x) => (
            <span key={x} className="chip faint">
              {x}
            </span>
          ))}
        </span>
      </div>
    ) : null;
  return (
    <figure className="tag" data-tour="tag">
      <figcaption className="tag-h">
        <span>Price tag{t.discounted ? ", a quarter off" : ""}</span>
        <span className="num">credibility {t.credibility.toFixed(2)}</span>
      </figcaption>
      <div className="tag-b">
        <h3>{t.title}</h3>
        <p className="small">{t.reading}</p>
        <dl className="fig">
          {CHARGED.map((k) =>
            t.charge[k] ? (
              <div key={k} className={hueClass(k)}>
                <dt>
                  <Icon name={k as IconName} sm /> {names?.[k]?.name ?? k}
                </dt>
                <dd className="num">
                  {"−"}
                  {t.charge[k]}
                  {t.discounted && t.quoted[k] !== t.charge[k] ? (
                    <span className="was num"> was {t.quoted[k]}</span>
                  ) : null}
                </dd>
              </div>
            ) : null,
          )}
          {t.revenue.map((r, i) => (
            <div key={`r${i}`} className={hueClass(r.ledger as LedgerKey)}>
              <dt>
                <Icon name={r.ledger as IconName} sm /> {names?.[r.ledger]?.name ?? r.ledger}
                {r.id ? `, ${game.pack.regions.find((g) => g.id === r.id)?.name ?? r.id}` : ""},
                each {v.turn}
              </dt>
              <dd className="num">{r.delta > 0 ? `+${r.delta}` : `${"−"}${Math.abs(r.delta)}`}</dd>
            </div>
          ))}
        </dl>
        {chips("Serves", t.serves)}
        {chips("Hits", t.hits)}
        {chips("Keeps", t.keeps)}
        {t.stances.length ? (
          <div className="tagr">
            <span className="k">Room</span>
            <span className="vs">
              {t.stances.map((r) => (
                <span key={r.id} className="chip red num">
                  {r.name} at {Math.round(r.support)}, line {r.line}
                </span>
              ))}
            </span>
          </div>
        ) : null}
        {t.promises.length ? (
          <p className="small">
            Read as a promise:{" "}
            {t.promises.map((x) => `${x.label}, by ${v.turn} ${x.window}`).join("; ")}.
          </p>
        ) : null}
        {t.sunset ? (
          <p className="small num">
            It ends at {v.turn} {t.sunset}.
          </p>
        ) : null}
        <span className="priced">Priced</span>
      </div>
      <div className="actions">
        <button
          className={`btn ${busy ? "busy" : ""}`}
          data-primary
          disabled={busy}
          onClick={() =>
            act(() => api.act(game)).then((ok) => {
              if (ok) onDone();
            })
          }
        >
          {busy ? "Committing" : "Commit"}
        </button>
        <span className="small muted">
          Price something else to replace this, or end the {v.turn} to drop it.
        </span>
      </div>
    </figure>
  );
}
