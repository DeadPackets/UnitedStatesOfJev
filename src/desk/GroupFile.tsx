// The glance file (R36), opened from a rim row or a seat: it flies out of what was clicked to the chamber's centre on
// a spring and back into it on close. Ported from the mock's openFile, closeFile and fileHTML. A member's file carries
// the member actions the engine has: Lobby (a bill on the floor) and Do a favour; a hesitant faction's card, its terms.
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { Glance } from "../../worker/pack";
import type { Tint } from "../../worker/tokens";
import type { GamePack, ViewMember } from "../api";
import type { ChamberFaction, Count, RimRow } from "../../worker/desk";
import { meter, reduced, spring } from "./fx";
import { Mark } from "./Emblem";
import { Icon, LINE_ICON } from "./Icon";
import { atStage, standing } from "./paint";

const flyFrom = (from: DOMRect, to: DOMRect) =>
  `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px,${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${Math.max(0.15, from.height / to.height).toFixed(3)})`;

type ShellProps = {
  origin: () => Element | null;
  tint: Tint;
  mark: ReactNode;
  kicker: string;
  title: string;
  face: { name: string; role: string } | null;
  down: boolean;
  fill: number | null; // the support bar's share, 0 to 1, that grows in on open
  onClose: () => void;
  children: ReactNode;
};

function FileShell({
  origin,
  tint,
  mark,
  kicker,
  title,
  face,
  down,
  fill,
  onClose,
  children,
}: ShellProps) {
  const card = useRef<HTMLElement>(null),
    scrim = useRef<HTMLDivElement>(null),
    closing = useRef(false);

  useLayoutEffect(() => {
    const el = card.current!;
    atStage(el);
    el.querySelector<HTMLElement>(".fc-x")!.focus({ preventScroll: true });
    const from = origin();
    if (reduced() || !from) return;
    scrim.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    meter("open a file", 1300);
    el.animate(
      [
        {
          transform: flyFrom(from.getBoundingClientRect(), el.getBoundingClientRect()),
          opacity: 0,
        },
        { opacity: 1, offset: 0.3 },
        { transform: "none", opacity: 1 },
      ],
      spring(230, 24),
    );
    el.querySelectorAll(".st").forEach((part, i) =>
      part.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: 320,
          delay: 140 + i * 55,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "backwards",
        },
      ),
    );
    if (fill !== null)
      el.querySelector(".fc-bar i")?.animate(
        [{ transform: "scaleX(0)" }, { transform: `scaleX(${fill})` }],
        {
          duration: 700,
          delay: 220,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "backwards",
        },
      );
    el.querySelector(".red")?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.07)" }, { transform: "scale(1)" }],
      {
        duration: 420,
        delay: 760,
        easing: "ease-out",
      },
    );
  }, []); // eslint-disable-line

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = card.current!,
      from = origin();
    (from as HTMLElement | null)?.focus?.({ preventScroll: true });
    if (reduced() || !from) return onClose();
    meter("close a file", 400);
    scrim.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" });
    el.animate(
      [
        { transform: "none", opacity: 1 },
        {
          transform: flyFrom(from.getBoundingClientRect(), el.getBoundingClientRect()),
          opacity: 0,
        },
      ],
      { duration: 260, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" },
    ).finished.then(onClose);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === "Escape" && close();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }); // eslint-disable-line

  return (
    <>
      <div className="scrim" ref={scrim} onClick={close} />
      <article
        ref={card}
        className={`fcard${down ? " dn" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fc-n"
        style={{ "--gl": tint.light, "--gd": tint.dark } as CSSProperties}
      >
        <header className="fc-h">
          <span className="fc-i">{mark}</span>
          <div className="fc-hd">
            <p className="fc-k">{kicker}</p>
            <h2 id="fc-n">{title}</h2>
            {face ? (
              <p className="fc-r">
                <b>{face.name}</b>, {face.role.split(";")[0]}
              </p>
            ) : null}
          </div>
          <button className="fc-x" aria-label="Close the file" onClick={close}>
            <Icon id="i-x" />
          </button>
        </header>
        <div className="fc-b">{children}</div>
      </article>
    </>
  );
}

// A tag a model wrote as an id ("thermostat-down") or in lower case still reads as words.
const words = (tag: string) => {
  const text = tag.replaceAll("-", " ");
  return text[0].toUpperCase() + text.slice(1);
};

function GlanceTags({ glance }: { glance: Glance }) {
  const red = glance.hates.find((hate) => hate.redLine);
  return (
    <>
      <div className="fc-t w st">
        <h3>Wants</h3>
        <ul>
          {glance.wants.map((want) => (
            <li key={want} className="tg tw">
              <Icon id="i-check" />
              <span>{words(want)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="fc-t h st">
        <h3>Hates</h3>
        <ul>
          {glance.hates
            .filter((hate) => !hate.redLine)
            .map((hate) => (
              <li key={hate.tag} className="tg th">
                <Icon id="i-x" />
                <span>{words(hate.tag)}</span>
              </li>
            ))}
          {red ? (
            <li className="tg red">
              <Icon id="i-flame" />
              <span>{words(red.tag)}</span>
              <small>Red line</small>
            </li>
          ) : null}
        </ul>
      </div>
      {glance.strike ? (
        <p className="fc-if st">
          <Icon id="i-bolt" />
          <span>
            <b>If it strikes:</b> {glance.strike}
          </span>
        </p>
      ) : null}
    </>
  );
}

type Props = {
  row: RimRow;
  fullName: string;
  kicker: string;
  turn: number;
  turnWord: string;
  onClose: () => void;
};

export function GroupFile({ row, fullName, kicker, turn, turnWord, onClose }: Props) {
  const votes = row.votes ? `${row.votes} of 100 votes on you` : "No vote on you";
  return (
    <FileShell
      origin={() => document.querySelector(`.hm[data-h="${CSS.escape(row.id)}"]`)}
      tint={row.tint}
      mark={<Mark emblem={row.emblem} icon={LINE_ICON[row.icon]} />}
      kicker={kicker}
      title={fullName}
      face={row.glance?.face ?? null}
      down={row.margin < 0}
      fill={row.support / 100}
      onClose={onClose}
    >
      <div className="fc-s st">
        <b className="fc-num num">{row.support}</b>
        <div className="fc-m">
          <span className="fc-bar">
            <i style={{ transform: `scaleX(${row.support / 100})` }} />
            <em style={{ left: `${row.line}%` }}>
              <span className="num">line {row.line}</span>
            </em>
          </span>
          <p className="fc-st">
            {standing(row, turn, turnWord, false)} · {votes}
          </p>
        </div>
      </div>
      {row.glance ? <GlanceTags glance={row.glance} /> : null}
    </FileShell>
  );
}

type MemberProps = {
  member: ViewMember;
  seat: number; // the circle's index, where the card flies from
  pack: GamePack;
  tint: Tint;
  factionName: string;
  lean: "for" | "against" | "hesitant" | null;
  lobby: {
    open: boolean;
    offered: boolean;
    costs: Record<string, number>;
    authority: number;
    word: string;
    clerks: number; // a lobby and a favour each take the clerks' time
  };
  busy: boolean;
  onLobby: (kind: string) => void;
  onFavour: () => void;
  onClose: () => void;
};

const YEARS: Record<string, string> = {
  new: "First term",
  mid: "A few terms in",
  long: "Long in the seat",
};

export function MemberFile({
  member,
  seat,
  pack,
  tint,
  factionName,
  lean,
  lobby,
  busy,
  onLobby,
  onFavour,
  onClose,
}: MemberProps) {
  const words = pack.vocabulary;
  const region =
    pack.regions.find((candidate) => candidate.id === member.region)?.name ?? member.region;
  const kinds = Object.keys(pack.lobby) as (keyof GamePack["lobby"])[];
  return (
    <FileShell
      origin={() => document.querySelector(`#hemi .seat[data-i="${seat}"]`)}
      tint={tint}
      mark={<Icon id="i-cap" />}
      kicker={`${words.member} · ${factionName}`}
      title={member.name}
      face={null}
      down={false}
      fill={member.loyalty / 100}
      onClose={onClose}
    >
      <div className="fc-s st">
        <b className="fc-num num">{member.loyalty}</b>
        <div className="fc-m">
          <span className="fc-bar">
            <i style={{ transform: `scaleX(${member.loyalty / 100})` }} />
          </span>
          <p className="fc-st">
            Loyalty · {region} · {YEARS[member.years] ?? member.years}
            {lean
              ? ` · ${lean === "for" ? "Votes for" : lean === "against" ? "Votes against" : "Hesitates"} on this ${words.bill}`
              : ""}
          </p>
        </div>
      </div>
      {member.glance ? <GlanceTags glance={member.glance} /> : null}
      <div className="fc-t fc-act st">
        <h3>{words.lobby}</h3>
        {lobby.open && !lobby.offered && lobby.clerks > 0 ? (
          <div className="lob">
            {kinds.map((kind) => (
              <button
                key={kind}
                className="btn term"
                title={pack.lobby[kind].text}
                disabled={busy || lobby.authority < (lobby.costs[kind] ?? 0)}
                onClick={() => onLobby(kind)}
              >
                {pack.lobby[kind].label} · {lobby.costs[kind]} {lobby.word}
              </button>
            ))}
          </div>
        ) : (
          <p className="fc-note">
            {lobby.offered
              ? "Already offered something on this one."
              : lobby.open
                ? "The clerks have no time left this turn."
                : `Works on a ${words.bill} waiting for its vote.`}
          </p>
        )}
        <button
          className="btn"
          disabled={busy || member.loyalty >= 100 || lobby.clerks < 1}
          onClick={onFavour}
        >
          <Icon id="i-hand" />
          Do a favour
        </button>
      </div>
    </FileShell>
  );
}

type TermsProps = {
  faction: ChamberFaction;
  row: Count["factions"][number];
  costs: (term: { cost: Record<string, number> }) => string;
  busy: boolean;
  onTake: (kind: string) => void;
  onClose: () => void;
};

/** A hesitant faction's terms on the priced law (R30): each one re-prices the law with the deal. */
export function TermsFile({ faction, row, costs, busy, onTake, onClose }: TermsProps) {
  const parts = [
    row.for && `${row.for} for`,
    row.hesitant && `${row.hesitant} hesitant`,
    row.against && `${row.against} against`,
  ];
  return (
    <FileShell
      origin={() => document.querySelector(`.gleg [data-f="${CSS.escape(faction.id)}"]`)}
      tint={faction.tint}
      mark={<Mark emblem={faction.emblem} icon="i-cap" />}
      kicker="Their terms"
      title={faction.name}
      face={null}
      down={false}
      fill={null}
      onClose={onClose}
    >
      <p className="fc-st st">
        {parts.filter(Boolean).join(", ")}: {row.reason}
      </p>
      <div className="lob st">
        {row.terms?.map((term) => (
          <button
            key={term.kind}
            className="btn term"
            disabled={busy}
            onClick={() => onTake(term.kind)}
          >
            {term.label} · {costs(term)}
          </button>
        ))}
      </div>
    </FileShell>
  );
}
