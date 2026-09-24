// The composer: the instrument chip, the act typed in the player's own words, Price it, and End turn.
import { memo, useState } from "react";
import type { GameView } from "../api";
import { settleVerb, type VerbKey } from "../rules";
import { play } from "./fx";
import { Icon, VERB_ICON } from "./Icon";

type Props = {
  instruments: GameView["instruments"];
  priced: VerbKey | null;
  priceable: boolean;
  endLabel: string;
  endable: boolean;
  onPrice: (text: string) => void;
  onEnd: () => void;
};

export const Composer = memo(function Composer({
  instruments,
  priced,
  priceable,
  endLabel,
  endable,
  onPrice,
  onEnd,
}: Props) {
  const [text, setText] = useState("");
  const verb = priced ?? settleVerb(text, instruments);
  const ready = priceable && text.trim().length >= 12;
  const go = (button: HTMLElement | null) => {
    if (!ready) return;
    if (button) play(button, { scale: [1, 0.94, 1] }, { duration: 0.18 }).catch(() => {});
    onPrice(text);
  };
  return (
    <div className="cmp">
      <div className="cbox sf">
        <span className="vpick">
          <Icon id={VERB_ICON[verb ?? "decree"]} />
          <span>{verb ? (instruments[verb]?.name ?? verb) : "Act"}</span>
        </span>
        <input
          className="actx"
          id="actx"
          aria-label="Your act"
          placeholder="Type an act, then price it"
          maxLength={1200}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && go(document.getElementById("go"))}
        />
        <button
          className="btn accent"
          id="go"
          disabled={!ready}
          onClick={(event) => go(event.currentTarget)}
        >
          <Icon id="i-ballot" />
          Price it
        </button>
      </div>
      <button className="btn endt" disabled={!endable} onClick={onEnd}>
        {endLabel}
      </button>
    </div>
  );
});
