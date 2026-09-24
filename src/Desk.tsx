// The desk: the approved mock (docs/design/mock/desk.html) in React. React draws the structure from the server's
// DeskView; the desk's moments (the receipt's printing here, the flows in src/desk/flow.ts) animate that DOM by ref
// and hand the new view back to React only when they end, so nothing re-renders while anything moves.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { ApiError, api, type GameView } from "./api";
import type { Act } from "./App";
import { applyTokens, setThemeMode, themeMode } from "./theme";
import { sound } from "./sound";
import type { VerbKey } from "./rules";
import { cancelMoments, mountLayer } from "./desk/fx";
import { Chamber, type ChamberHandle } from "./desk/Chamber";
import { Composer } from "./desk/Composer";
import { EventCard } from "./desk/EventCard";
import { GroupFile, MemberFile } from "./desk/GroupFile";
import { Icon, RESOURCE_ICON } from "./desk/Icon";
import { Live } from "./desk/Live";
import { clearMarks, RESOURCE_TOKEN } from "./desk/paint";
import { FloorSlip, Receipt } from "./desk/Receipt";
import { Rim } from "./desk/Rim";
import { Sheet } from "./desk/Sheet";
import "./desk/desk.css";

type Props = {
  game: GameView;
  act: Act;
  onGame: (game: GameView) => void;
  onError: (error: unknown) => void;
  onQuit: () => void;
  onReview: (active: boolean) => void;
};
type Phase =
  | { kind: "idle" }
  | { kind: "pricing" }
  | { kind: "printing"; next: GameView }
  | { kind: "priced" }
  | { kind: "picking"; text: string }; // the clerk priced a favour with no member: the player picks one

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
const press = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
};

// onReview is Task 4's: the review holds the desk on screen whatever the stage.
export default function Desk({ game, act, onGame, onError, onQuit }: Props) {
  // `shown` is what the desk draws; it follows `game` except while a moment holds it (frozen).
  const [shown, setShown] = useState(game);
  const frozen = useRef(false);
  useEffect(() => {
    if (!frozen.current) setShown(game);
  }, [game]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [torn, setTorn] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [seat, setSeat] = useState<{ member: string; index: number } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [dark, setDark] = useState(() => themeMode() === "dark");
  const [muted, setMuted] = useState(sound.muted);
  const [composerKey, setComposerKey] = useState(0);
  const [acting, setActing] = useState(false);
  const deskRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chamberRef = useRef<ChamberHandle>(null);

  const view = shown.desk;
  const pack = shown.pack;
  const words = view.vocabulary;
  const place = pack.place.replace(/,.*$/, "");
  const receipt = torn ? null : view.receipt;
  const floor = receipt ? null : view.floor;
  const count = receipt?.count ?? floor?.count ?? null;

  useLayoutEffect(() => {
    applyTokens(view.theme, [
      ...view.rim.map((row) => row.tint),
      ...view.factions.map((faction) => faction.tint),
    ]);
  }, [game.scenario]); // eslint-disable-line
  useEffect(() => {
    const unmount = mountLayer(canvasRef.current!);
    return () => {
      cancelMoments();
      unmount();
    };
  }, []);

  // A request with no moment of its own: the view lands when it answers.
  const run = async (request: () => Promise<GameView>) => {
    if (frozen.current || acting) return false;
    setActing(true);
    const ok = await act(request);
    setActing(false);
    return ok;
  };

  const resourceNames = new Map(view.resources.map((card) => [card.key, card.name]));
  const costs = useCallback(
    (term: { cost: Record<string, number> }) =>
      Object.entries(term.cost)
        .filter(([, amount]) => amount > 0)
        .map(
          ([key, amount]) => `${amount} ${(resourceNames.get(key as never) ?? key).toLowerCase()}`,
        )
        .join(", ") || "free",
    [view.resources], // eslint-disable-line
  );
  const negotiate = useCallback(
    (faction: string, term: string) => {
      if (!frozen.current) act(() => api.negotiate(game, faction, term));
    },
    [act, game],
  );

  const price = async (text: string, verb?: VerbKey, member?: string) => {
    if (frozen.current) return;
    frozen.current = true;
    clearMarks(deskRef.current!);
    setTorn(false);
    setPhase({ kind: "pricing" });
    try {
      const next = await api.price(game, text, verb, member);
      if (!next.desk.receipt) {
        frozen.current = false;
        setPhase({ kind: "idle" });
        onGame(next); // a refusal: the placeholder says why
        return;
      }
      setPhase({ kind: "printing", next });
    } catch (error) {
      frozen.current = false;
      // The clerk read a favour and the server needs its member: ask for one instead of failing (lead ruling 3).
      if (
        !member &&
        error instanceof ApiError &&
        error.status === 400 &&
        error.message === `Bad ${pack.vocabulary.member}.`
      ) {
        setPhase({ kind: "picking", text });
        return;
      }
      setPhase({ kind: "idle" });
      onError(error);
    }
  };
  const printed = () => {
    if (phase.kind !== "printing") return;
    frozen.current = false;
    setShown(phase.next);
    onGame(phase.next);
    setPhase({ kind: "priced" });
  };
  const tear = () => {
    clearMarks(deskRef.current!);
    setTorn(true);
    setPhase({ kind: "idle" });
  };

  // Task 4 replaces these with moments; until then each lands the new view at once.
  const sign = async () => {
    const law = view.receipt?.verb === "law";
    clearMarks(deskRef.current!);
    await act(async () => {
      const signed = await api.act(game);
      return law ? api.vote(signed) : signed;
    });
    setPhase({ kind: "idle" });
    setComposerKey((key) => key + 1);
  };
  const endTurn = () => act(() => api.endTurn(game));
  const openEvent = game.events.findIndex((event) => event.stance === undefined && !event.declined);
  const answer = (stance: number) => act(() => api.resolve(game, openEvent, stance));
  const decline = () => act(() => api.decline(game, openEvent));
  const withdraw = (id: string) => act(() => api.withdraw(game, id));

  // The engine amends and lobbies only a tabled bill, so Amend on a receipt signs the law first (lead ruling 4).
  const amend = async () => {
    clearMarks(deskRef.current!);
    if (await run(async () => api.amend(await api.act(game)))) setPhase({ kind: "idle" });
    setComposerKey((key) => key + 1);
  };
  const vote = () => run(() => api.vote(game));
  const favour = (member: string) => {
    const name = shown.members.find((candidate) => candidate.id === member)?.name ?? member;
    setSeat(null);
    price(`Do ${name} a favour.`, "favour", member);
  };
  const onSeat = useCallback(
    (member: string, index: number) => {
      if (phase.kind === "picking") return void price(phase.text, "favour", member);
      if (!frozen.current) setSeat({ member, index });
    },
    [phase], // eslint-disable-line
  );
  const eligible = useMemo(
    () =>
      phase.kind === "picking"
        ? new Set(shown.members.filter((member) => member.loyalty < 100).map((member) => member.id))
        : null,
    [phase.kind, shown.members],
  );

  const signable =
    !!receipt &&
    !receipt.blocked &&
    receipt.now.every(
      (line) =>
        line.target !== "resource" ||
        (view.resources.find((card) => card.key === line.id)?.value ?? 0) + line.delta >= 0,
    );
  const busy = phase.kind === "pricing" || phase.kind === "printing" || acting;
  const chamberRow =
    pack.constitution?.holders.find((holder) => holder.members === "seats")?.id ?? null;
  const fileRow = file ? game.desk.rim.find((row) => row.id === file) : undefined;
  const seated = seat ? shown.members.find((member) => member.id === seat.member) : undefined;
  const seatFaction = seated
    ? view.factions.find((faction) => faction.id === seated.faction)
    : undefined;
  const event = openEvent >= 0 && !frozen.current ? game.events[openEvent] : undefined;
  const authority = view.resources.find((card) => card.key === "authority");

  return (
    <div className="desk" ref={deskRef}>
      <main id="dk" className="dk" ref={mainRef}>
        <header className="top sf">
          <div className="id">
            <div>
              <b className="dname">{pack.title}</b>
              <span className="turn">
                {capitalise(words.turn)} {shown.turn} of {shown.turnsPerTerm} · {pack.place} · clerk{" "}
                {shown.calls.cap - shown.calls.spent} of {shown.calls.cap}
              </span>
            </div>
            <span className="tools">
              <button
                onClick={() => {
                  setThemeMode(dark ? "light" : "dark");
                  setDark(!dark);
                }}
              >
                {dark ? "Light" : "Dark"}
              </button>
              <button
                aria-pressed={!muted}
                onClick={() => {
                  sound.muted = !muted;
                  setMuted(!muted);
                }}
              >
                {muted ? "Sound off" : "Sound on"}
              </button>
              <button onClick={onQuit}>Leave</button>
            </span>
          </div>
          <div className="leds">
            {view.resources.map((card) => (
              <div
                key={card.key}
                className="led"
                data-r={card.key}
                role="button"
                tabIndex={0}
                aria-label={`${card.name}: open resources`}
                style={{ "--c": `var(--${RESOURCE_TOKEN[card.key]})` } as CSSProperties}
                onClick={() => !frozen.current && setSheet(true)}
                onKeyDown={press(() => !frozen.current && setSheet(true))}
              >
                <Icon id={RESOURCE_ICON[card.icon]} />
                <span className="lk">{card.name}</span>
                <Live className="n num" text={card.value} />
                <span className="dx" />
              </div>
            ))}
          </div>
          <div
            id="fv"
            className={`fv ${view.finalVote.value >= view.finalVote.need ? "over" : "under"}`}
          >
            <span className="fk">Final vote</span>
            <Live className="n num" text={view.finalVote.value} />
            <span className="fo">of 100, need {view.finalVote.need}</span>
            <i className="bar">
              <i style={{ width: `${view.finalVote.value}%` }} />
              <i className="ln" style={{ left: `${view.finalVote.need}%` }} />
            </i>
            <span className="dx" />
          </div>
        </header>
        <Rim
          side="home"
          heading={`In ${place}`}
          rows={view.rim.filter((row) => row.where === "home")}
          turn={shown.turn}
          turnWord={words.turn}
          testWord={pack.vocabulary.test}
          fileWord={words.file}
          open={file}
          onOpen={(id) => !frozen.current && setFile(id)}
        />
        <Chamber
          ref={chamberRef}
          factions={view.factions}
          members={shown.members}
          label={capitalise(pack.vocabulary.chamber)}
          need={count?.need ?? pack.chamber.threshold}
          count={count}
          eligible={eligible}
          costs={costs}
          onTerm={negotiate}
          onSeat={onSeat}
        />
        <Rim
          side="abroad"
          heading={`Beyond ${place}`}
          rows={view.rim.filter((row) => row.where !== "home")}
          turn={shown.turn}
          turnWord={words.turn}
          testWord={pack.vocabulary.test}
          fileWord={words.file}
          open={file}
          onOpen={(id) => !frozen.current && setFile(id)}
        />
        <div className="tagw" id="tagw">
          {phase.kind === "pricing" ? (
            <div className="rc" id="pb">
              <div className="head wait">
                <i />
                <i />
                <span>The clerk prices your act</span>
              </div>
            </div>
          ) : phase.kind === "printing" ? (
            <Receipt
              receipt={phase.next.desk.receipt!}
              words={words}
              chamberRow={chamberRow}
              size={pack.chamber.size}
              printing
              signable={false}
              onPrinted={printed}
              onReveal={() => chamberRef.current?.reveal(phase.next.desk.receipt?.count ?? null)}
              onSign={() => {}}
              onTear={() => {}}
            />
          ) : phase.kind === "picking" ? (
            <div className="tag0 sf pick" id="tag">
              <span>
                <Icon id="i-hand" />
                Pick the member this favour is for
                <button className="btn" onClick={() => setPhase({ kind: "idle" })}>
                  Cancel
                </button>
              </span>
            </div>
          ) : receipt ? (
            <Receipt
              receipt={receipt}
              words={words}
              chamberRow={chamberRow}
              size={pack.chamber.size}
              printing={false}
              signable={signable && !busy}
              onPrinted={() => {}}
              onReveal={() => {}}
              onSign={sign}
              onTear={tear}
              onAmend={busy ? undefined : amend}
            />
          ) : floor ? (
            <FloorSlip
              floor={floor}
              size={pack.chamber.size}
              busy={busy}
              onVote={vote}
              onAmend={() => run(() => api.amend(game))}
              onAdopt={(draft) => run(() => api.adopt(game, draft))}
            />
          ) : (
            <div className={`tag0 sf${shown.refusal ? " bad" : ""}`} id="tag">
              <span>
                <Icon id="i-scroll" />
                {shown.refusal
                  ? `The clerk will not price it: ${shown.refusal.line}`
                  : "The clerk prices your act here. Nothing lands until you sign it."}
              </span>
              {shown.pending ? <small>{shown.pending}</small> : null}
            </div>
          )}
        </div>
        <Composer
          key={composerKey}
          instruments={shown.instruments}
          priced={(receipt?.verb as VerbKey | undefined) ?? null}
          priceable={!busy && !receipt && phase.kind !== "picking"}
          endLabel={`End ${words.turn} ${shown.turn}`}
          endable={!busy && openEvent < 0 && !floor}
          onPrice={(text) => price(text)}
          onEnd={endTurn}
        />
      </main>
      <canvas id="fx" ref={canvasRef} aria-hidden="true" />
      {fileRow ? (
        <GroupFile
          key={fileRow.id}
          row={fileRow}
          fullName={game.holders.find((holder) => holder.id === fileRow.id)?.name ?? fileRow.name}
          kicker={`${words.file} · ${fileRow.where === "home" ? "At home" : capitalise(words.abroad)}`}
          turn={game.turn}
          turnWord={words.turn}
          onClose={() => setFile(null)}
        />
      ) : null}
      {seated && seatFaction && seat ? (
        <MemberFile
          key={seated.id}
          member={seated}
          seat={seat.index}
          pack={pack}
          tint={seatFaction.tint}
          factionName={seatFaction.name}
          lean={count?.leans[seated.id] ?? null}
          lobby={{
            open: !!floor?.count,
            offered: !!floor?.lobbied.includes(seated.id),
            costs: shown.lobbyCosts,
            authority: authority?.value ?? 0,
            word: (authority?.name ?? "authority").toLowerCase(),
          }}
          busy={busy}
          onLobby={(kind) => run(() => api.lobby(game, seated.id, kind as never))}
          onFavour={() => favour(seated.id)}
          onClose={() => setSeat(null)}
        />
      ) : null}
      {sheet ? (
        <Sheet
          resources={game.desk.resources}
          turnWord={words.turn}
          inForce={game.inForce}
          onWithdraw={(id) => withdraw(id)}
          onClose={() => setSheet(false)}
        />
      ) : null}
      {event && !file && !sheet && !seat ? (
        <EventCard
          key={event.id}
          event={event}
          turnWord={words.turn}
          busy={busy}
          onAnswer={(stance) => answer(stance)}
          onDecline={() => decline()}
        />
      ) : null}
    </div>
  );
}
