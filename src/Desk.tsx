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
import { ApiError, api, type GameView, type ReviewLine } from "./api";
import type { Act } from "./App";
import { applyTokens, setThemeMode, themeMode } from "./theme";
import { sound } from "./sound";
import type { VerbKey } from "./rules";
import {
  beginMoment,
  cancelMoments,
  centre,
  fpsStart,
  fpsStop,
  mountLayer,
  sleep,
  Stale,
  type Point,
} from "./desk/fx";
import {
  countVotes,
  deliver,
  dropKnots,
  lineSource,
  mergeReview,
  signWave,
  verdictMoment,
  waitFor,
  type Scene,
} from "./desk/flow";
import { Chamber, type ChamberHandle } from "./desk/Chamber";
import { Composer } from "./desk/Composer";
import { EventCard } from "./desk/EventCard";
import { GroupFile, MemberFile, TermsFile } from "./desk/GroupFile";
import { Icon, RESOURCE_ICON } from "./desk/Icon";
import { Live } from "./desk/Live";
import { clearMarks, RESOURCE_TOKEN } from "./desk/paint";
import { FloorSlip, Receipt } from "./desk/Receipt";
import { Review } from "./desk/Review";
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
  | { kind: "picking"; text: string } // the clerk priced a favour with no member: the player picks one
  | { kind: "waiting"; words: string } // End turn is out with the clerks: the printer head waits
  | { kind: "moving" }
  | { kind: "review"; kicker: string; title: string; failed: boolean; lines: ReviewLine[] };
type ReviewSheet = Omit<Extract<Phase, { kind: "review" }>, "kind">;

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
const press = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
};

export default function Desk({ game, act, onGame, onError, onQuit, onReview }: Props) {
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
  const [terms, setTerms] = useState<string | null>(null); // the faction whose terms card is open
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
  const costs = (term: { cost: Record<string, number> }) =>
    Object.entries(term.cost)
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => `${amount} ${(resourceNames.get(key as never) ?? key).toLowerCase()}`)
      .join(", ") || "free";
  // Stable, so neither the chamber nor a rim repaints mid-moment for a new handler.
  const openTerms = useCallback((faction: string) => !frozen.current && setTerms(faction), []);
  const openFile = useCallback((id: string) => !frozen.current && setFile(id), []);
  const [home, abroad] = useMemo(
    () => [
      view.rim.filter((row) => row.where === "home"),
      view.rim.filter((row) => row.where !== "home"),
    ],
    [view.rim],
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
        // A refusal: the placeholder says why, and what it cost travels first.
        if (next.desk.review?.length)
          changes(
            async () => next,
            tagCentre(),
            next.refusal?.line ?? "The clerk refused",
            "What the refusal cost",
            null,
          );
        else onGame(next);
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
      // The clerk read a kind of act a ledger at 0 has shut: say which, and what is still open.
      const shut =
        view.shut &&
        error instanceof ApiError &&
        error.message === "That instrument is not available." &&
        new ApiError(400, `The clerk read it as a kind of act you cannot use now. ${view.shut}`);
      onError(shut || error);
    }
  };
  const printed = () => {
    if (phase.kind !== "printing") return;
    frozen.current = false;
    setShown(phase.next);
    onGame(phase.next);
    setPhase({ kind: "priced" });
  };
  // Price it is disabled once the receipt is up, so the keyboard moves on to the receipt.
  useEffect(() => {
    if (phase.kind !== "priced") return;
    const sign = document.getElementById("sign") as HTMLButtonElement | null;
    (sign?.disabled ? document.getElementById("tear") : sign)?.focus({ preventScroll: true });
  }, [phase.kind]);
  const tear = () => {
    clearMarks(deskRef.current!);
    setTorn(true);
    setPhase({ kind: "idle" });
  };

  // A moment: React state changes here and at its end only; everything between moves the DOM by ref (src/desk/flow.ts).
  const scene = (): Scene => ({
    desk: deskRef.current!,
    main: mainRef.current!,
    spots: chamberRef.current!.spots,
    rows: new Map(view.rim.map((row) => [row.id, row])),
    names: new Map(shown.members.map((member) => [member.id, member.name])),
    turn: shown.turn,
    turnWord: words.turn,
    need: view.finalVote.need,
  });
  const start = (phaseNow: Phase, keepSheet = false) => {
    frozen.current = true;
    beginMoment();
    onReview(true);
    setFile(null);
    setSeat(null);
    setTerms(null);
    if (!keepSheet) setSheet(false);
    setPhase(phaseNow);
  };
  // The moment is over but its marks stay: `shown` stays frozen until Back to the desk, the new game goes to App now.
  const finish = (next: GameView, review: ReviewSheet) => {
    for (const lock of deskRef.current!.querySelectorAll(".lockb")) lock.remove();
    onGame(next);
    setPhase({ kind: "review", ...review });
  };
  const unmark = () => {
    clearMarks(deskRef.current!);
    mainRef.current!.classList.remove("floor");
    mainRef.current!.querySelector("#stfx")?.replaceChildren();
    mainRef.current!.querySelector(".hemi-w")?.classList.remove("dim");
  };
  const failed = (error: unknown) => {
    if (error instanceof Stale) return;
    fpsStop();
    cancelMoments();
    unmark();
    frozen.current = false;
    onReview(false);
    setPhase({ kind: "idle" });
    onError(error); // App toasts and reloads the server's game
  };
  const back = (next = game) => {
    unmark();
    frozen.current = false;
    setShown(next);
    setTorn(false);
    setPhase({ kind: "idle" });
    setComposerKey((key) => key + 1);
    onReview(false);
    requestAnimationFrame(() => document.getElementById("actx")?.focus({ preventScroll: true }));
  };
  const verdictReview = (title: string, voted: GameView, ...reviews: (ReviewLine[] | null)[]) => {
    const verdict = voted.desk.verdict!;
    return {
      kicker: `${title} · ${verdict.passed ? words.pass : words.fail} ${verdict.yes} to ${verdict.no}`,
      title: verdict.passed ? "What it changed" : "What the defeat cost you",
      failed: !verdict.passed,
      lines: mergeReview(...reviews),
    };
  };
  // The count, the verdict, and then every change of the vote travels from `source`.
  const roll = async (stage: Scene, voted: GameView, source: (line: ReviewLine) => Point) => {
    const verdict = voted.desk.verdict!;
    fpsStart("the count");
    await countVotes(stage, verdict);
    fpsStop();
    fpsStart("verdict");
    await verdictMoment(stage, verdict, words);
    fpsStop();
    fpsStart("couriers");
    if (!verdict.passed) await dropKnots(stage);
    await deliver(voted.desk.review ?? [], source, stage);
    fpsStop();
  };

  const sign = async () => {
    const button = document.getElementById("sign");
    if (frozen.current || !view.receipt || !button) return;
    const law = view.receipt.verb === "law";
    const title = view.receipt.title;
    start({ kind: "moving" });
    button.setAttribute("disabled", "");
    const signing = api.act(shown);
    const voting = law ? signing.then((signed) => api.vote(signed)) : null;
    voting?.catch(() => {}); // handled where it is awaited
    try {
      const stage = scene();
      fpsStart("sign: charge and shockwave");
      await signWave(stage, button);
      const signed = await signing;
      const pen = centre(button);
      await deliver(
        signed.desk.review ?? [],
        (line) => (line.target === "resource" ? pen : lineSource(stage, "now", line)),
        stage,
      );
      fpsStop();
      await sleep(250);
      if (!voting) {
        finish(signed, {
          kicker: `${title} · signed`,
          title: "What it changed",
          failed: false,
          lines: mergeReview(signed.desk.review),
        });
        return;
      }
      const voted = await waitFor(voting, stage, "The clerk calls the roll");
      const passed = voted.desk.verdict!.passed;
      await roll(stage, voted, (line) => lineSource(stage, passed ? "pass" : "fail", line));
      finish(voted, verdictReview(title, voted, signed.desk.review, voted.desk.review));
    } catch (error) {
      failed(error);
    }
  };
  // A signed law waiting on the floor (after Amend, or a vote that failed to answer): the count, verdict and couriers.
  const callVote = async () => {
    if (frozen.current) return;
    const title = view.floor?.title ?? "The act";
    const from = tagCentre();
    start({ kind: "moving" });
    try {
      const stage = scene();
      const voted = await waitFor(api.vote(shown), stage, "The clerk calls the roll");
      await roll(stage, voted, () => from);
      finish(voted, verdictReview(title, voted, voted.desk.review));
    } catch (error) {
      failed(error);
    }
  };
  // The engine amends only a tabled bill, so Amend signs the law first (lead ruling 4): the pen's wave and its costs
  // travel, the clerks draft, and the desk lands on the floor slip with the drafts.
  const amend = async () => {
    const button = document.getElementById("sign");
    if (frozen.current || !button) return;
    start({ kind: "moving" });
    const signing = api.act(shown);
    try {
      const stage = scene();
      await signWave(stage, button);
      const signed = await signing;
      const pen = centre(button);
      await deliver(
        signed.desk.review ?? [],
        (line) => (line.target === "resource" ? pen : lineSource(stage, "now", line)),
        stage,
      );
      const tabled = await waitFor(api.amend(signed), stage, "The clerks draft three amendments");
      onGame(tabled);
      back(tabled);
    } catch (error) {
      failed(error);
    }
  };

  // End turn, a card's answer or decline, a withdrawal: the request, then every change travels from where it began.
  const changes = async (
    request: () => Promise<GameView>,
    origin: Point,
    kicker: string,
    title: string,
    waiting: string | null,
    keepSheet = false,
  ) => {
    if (frozen.current) return;
    start(waiting ? { kind: "waiting", words: waiting } : { kind: "moving" }, keepSheet);
    try {
      const next = await request();
      setPhase({ kind: "moving" });
      await sleep(0);
      fpsStart(kicker);
      await deliver(next.desk.review ?? [], () => origin, scene());
      fpsStop();
      finish(next, { kicker, title, failed: false, lines: mergeReview(next.desk.review) });
    } catch (error) {
      failed(error);
    }
  };
  const tagCentre = () => centre(document.getElementById("tagw")!);
  const endTurn = () =>
    changes(
      () => api.endTurn(shown),
      tagCentre(),
      `End of ${words.turn} ${shown.turn}`,
      `What the ${words.turn} changed`,
      "The clerks read every group that moved",
    );
  const openEvent = game.events.findIndex((event) => event.stance === undefined && !event.declined);
  const cardTitle = () => game.events[openEvent]?.card?.title ?? "A card";
  const answer = (stance: number, button: HTMLElement) =>
    changes(
      () => api.resolve(shown, openEvent, stance),
      centre(button),
      cardTitle(),
      "What your answer changed",
      null,
    );
  const decline = (button: HTMLElement) =>
    changes(
      () => api.decline(shown, openEvent),
      centre(button),
      cardTitle(),
      "What declining it cost",
      null,
    );
  const withdraw = (id: string, button: HTMLElement) =>
    changes(
      () => api.withdraw(shown, id),
      centre(button),
      `${game.inForce.find((law) => law.id === id)?.title ?? "The act"} · withdrawn`,
      "What withdrawing it changed",
      null,
      true, // the sheet stays open, so its card counts down and Drains it lights
    );
  const favour = (member: string) => {
    const name = shown.members.find((candidate) => candidate.id === member)?.name ?? member;
    setSeat(null);
    price(`Do ${name} a favour.`, "favour", member);
  };
  // Stable, so the chamber never repaints mid-moment for a new handler; it reads the phase through a ref.
  const seatClick = useRef<(member: string, index: number) => void>(() => {});
  seatClick.current = (member, index) => {
    if (phase.kind === "picking") {
      if (eligible?.has(member)) price(phase.text, "favour", member);
      return;
    }
    if (!frozen.current) setSeat({ member, index });
  };
  const onSeat = useCallback(
    (member: string, index: number) => seatClick.current(member, index),
    [],
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
  const calm = phase.kind === "idle" || phase.kind === "priced";
  // The clerks' time left this turn: pricing, a term and a lobby take 1, the vote 1, Amend 3 (so 4 with its vote).
  const clerks = shown.calls.cap - shown.calls.spent;
  const busy = !calm || acting;
  const chamberRow =
    pack.constitution?.holders.find((holder) => holder.members === "seats")?.id ?? null;
  const fileRow = file ? game.desk.rim.find((row) => row.id === file) : undefined;
  const seated = seat ? shown.members.find((member) => member.id === seat.member) : undefined;
  const seatFaction = seated
    ? view.factions.find((faction) => faction.id === seated.faction)
    : undefined;
  const event = openEvent >= 0 && calm && !frozen.current ? game.events[openEvent] : undefined;
  const authority = view.resources.find((card) => card.key === "authority");
  const termsRow = terms ? receipt?.count?.factions.find((row) => row.id === terms) : undefined;
  const termsFaction = terms ? view.factions.find((faction) => faction.id === terms) : undefined;

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
          rows={home}
          turn={shown.turn}
          turnWord={words.turn}
          testWord={pack.vocabulary.test}
          fileWord={words.file}
          open={file}
          onOpen={openFile}
        />
        <Chamber
          ref={chamberRef}
          factions={view.factions}
          members={shown.members}
          label={capitalise(pack.vocabulary.chamber)}
          unit={`${pack.vocabulary.member.replace(/([^aeiou])y$/, "$1ie")}s`}
          need={count?.need ?? pack.chamber.threshold}
          count={count}
          eligible={eligible}
          onTerms={openTerms}
          onSeat={onSeat}
        />
        <Rim
          side="abroad"
          heading={`Beyond ${place}`}
          rows={abroad}
          turn={shown.turn}
          turnWord={words.turn}
          testWord={pack.vocabulary.test}
          fileWord={words.file}
          open={file}
          onOpen={openFile}
        />
        <div className="tagw" id="tagw">
          {phase.kind === "review" ? (
            <Review
              kicker={phase.kicker}
              title={phase.title}
              failed={phase.failed}
              lines={phase.lines}
              rows={view.rim}
              resources={view.resources}
              onBack={() => back()}
            />
          ) : phase.kind === "waiting" ? (
            <div className="rc" id="pb">
              <div className="head wait">
                <i />
                <i />
                <span>{phase.words}</span>
              </div>
            </div>
          ) : phase.kind === "pricing" ? (
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
              busy
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
              busy={busy}
              signable={signable && !busy}
              onPrinted={() => {}}
              onReveal={() => {}}
              onSign={sign}
              onTear={tear}
              onAmend={clerks >= 4 ? amend : undefined}
            />
          ) : floor ? (
            <FloorSlip
              floor={floor}
              size={pack.chamber.size}
              busy={busy}
              clerks={clerks}
              turnWord={words.turn}
              onVote={callVote}
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
              {view.shut ? <small className="shut">{view.shut}</small> : null}
              {clerks < 1 ? (
                <small className="shut">
                  The clerks have done all they can this {words.turn}. End the {words.turn}.
                </small>
              ) : null}
            </div>
          )}
        </div>
        <Composer
          key={composerKey}
          instruments={shown.instruments}
          priced={(receipt?.verb as VerbKey | undefined) ?? null}
          priceable={!busy && !receipt && !floor && clerks > 0}
          endLabel={`End ${words.turn} ${shown.turn}`}
          endable={!busy && openEvent < 0}
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
            clerks,
            word: (authority?.name ?? "authority").toLowerCase(),
          }}
          busy={busy}
          onLobby={(kind) => run(() => api.lobby(game, seated.id, kind as never))}
          onFavour={() => favour(seated.id)}
          onClose={() => setSeat(null)}
        />
      ) : null}
      {termsRow && termsFaction ? (
        <TermsFile
          key={termsFaction.id}
          faction={termsFaction}
          row={termsRow}
          costs={costs}
          busy={busy || clerks < 1}
          onTake={(kind) => {
            setTerms(null);
            run(() => api.negotiate(game, termsFaction.id, kind));
          }}
          onClose={() => setTerms(null)}
        />
      ) : null}
      {sheet ? (
        <Sheet
          resources={game.desk.resources}
          turnWord={words.turn}
          inForce={game.inForce}
          onWithdraw={withdraw}
          onClose={() => setSheet(false)}
        />
      ) : null}
      {event && !file && !sheet && !seat && !terms ? (
        <EventCard
          key={event.id}
          event={event}
          turnWord={words.turn}
          busy={busy}
          onAnswer={answer}
          onDecline={decline}
        />
      ) : null}
    </div>
  );
}
