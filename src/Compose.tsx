import type { KeyboardEvent } from "react";
import { api, type GameView } from "./api";
import type { Act } from "./App";
import { Icon } from "./icons";
import { VERBS, type VerbKey } from "./rules";

/** Seven fixed instruments, pack named and pack priced, greyed when this turn cannot afford them (R6). */
export default function Compose({ game, act, busy, verb, onVerb, text, onText }: {
  game: GameView; act: Act; busy: boolean;
  verb: VerbKey | null; onVerb: (v: VerbKey) => void; text: string; onText: (s: string) => void;
}) {
  const list = VERBS.filter((v) => game.instruments[v]);
  const i = verb ? list.indexOf(verb) : 0;
  const keys = (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const j = d ? (i + d + list.length) % list.length : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    onVerb(list[j]);
    document.getElementById(`verb-${list[j]}`)?.focus();
  };
  const price = () => act(() => api.price(game, text.trim(), verb ?? undefined));
  return (
    <>
      <div className="verbs" role="tablist" aria-label="The seven instruments" data-tour="compose">
        {list.map((v) => {
          const ins = game.instruments[v]!;
          return (
            <button key={v} id={`verb-${v}`} role="tab" aria-selected={verb === v} tabIndex={verb === v ? 0 : -1}
              disabled={!ins.affordable} title={ins.affordable ? undefined : "Not affordable this turn"}
              onKeyDown={keys} onClick={() => onVerb(v)}>{ins.name}</button>
          );
        })}
      </div>
      <label className="kicker" htmlFor="actpad"><Icon name="act" sm /> On your desk, {game.pack.vocabulary.turn} {game.turn}</label>
      <textarea id="actpad" className="billpad" value={text} maxLength={1200} rows={3} spellCheck={false}
        placeholder="Say what you are doing, and who pays for it." onChange={(e) => onText(e.target.value)} />
      <div className="actions">
        <button className={`btn ${busy ? "busy" : ""}`} disabled={busy || !verb || text.trim().length < 12} onClick={price}>
          {busy ? "Pricing" : "Price it"}
        </button>
      </div>
    </>
  );
}
