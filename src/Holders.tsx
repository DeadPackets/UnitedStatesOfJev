import type { GameView } from "./api";
import { Icon } from "./icons";

type H = GameView["holders"][number];

const RESPONSE: Record<string, string> = {
  early_test: "can call the test early", coup: "can end the run", strike: "can strike a decree",
  refuse_levy: "can refuse a levy", riot: "can riot", excommunicate: "can excommunicate",
  embargo: "can embargo", none: "cannot remove you",
};

/** One plate per holder: its support, the resistance against its line, and the one nearest its line marked. */
export function HolderPlate({ h, warned, onPick }: { h: H; warned: boolean; onPick: (id: string) => void }) {
  const over = h.resistance >= h.line;
  return (
    <button className={`plateh ${h.nearest ? "near" : ""} ${over ? "over" : ""}`} onClick={() => onPick(h.id)}
      aria-label={`${h.name}, support ${Math.round(h.stance * 100)} percent, resistance ${Math.round(h.resistance)} of ${h.line}, ${RESPONSE[h.response] ?? h.response}`}>
      <span className="ph">
        <Icon name={h.where === "abroad" ? "abroad" : "seat"} sm />
        <b>{h.name}</b>
        {h.weight ? <span className="chip faint num">{h.weight.toFixed(2)}</span> : null}
      </span>
      <span className="mood num">{Math.round(h.stance * 100)}%<small> support</small></span>
      <span className="res" aria-hidden="true">
        <i style={{ width: `${Math.min(100, h.resistance)}%` }} />
        <b style={{ left: `${Math.min(100, h.line)}%` }} />
      </span>
      <span className="small num" aria-hidden="true">resistance {Math.round(h.resistance)} of {h.line}</span>
      <span className="small muted">{warned ? "Warned" : h.nearest ? "Nearest its line" : RESPONSE[h.response] ?? h.response}</span>
    </button>
  );
}

export default function Holders({ holders, warnings, onPick }: {
  holders: H[]; warnings: GameView["warnings"]; onPick: (id: string) => void;
}) {
  const warned = new Set(warnings.map((w) => w.holder));
  const rows: [string, H[]][] = [
    ["At home", holders.filter((h) => h.where === "home")],
    ["Abroad", holders.filter((h) => h.where === "abroad")],
  ];
  return (
    <div className="holders">
      {rows.map(([label, list]) => (list.length ? (
        <div key={label} className="holderrow">
          <div className="kicker">{label}</div>
          <div className="plates">{list.map((h) => <HolderPlate key={h.id} h={h} warned={warned.has(h.id)} onPick={onPick} />)}</div>
        </div>
      ) : null))}
    </div>
  );
}
