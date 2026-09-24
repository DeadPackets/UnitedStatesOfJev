import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { DEFAULT_THEME_TOKENS } from "../worker/colour";
import { api, ApiError, type Daily, type GameView, type Offer, type PackView } from "./api";
import Landing from "./Landing";
import Match from "./Match";
import { applyTokens, resetTokens } from "./theme";
// Each screen is its own chunk: the landing never downloads the desk.
const Build = lazy(() => import("./Build"));
const Seat = lazy(() => import("./Seat"));
const Desk = lazy(() => import("./Desk"));
const Midterm = lazy(() => import("./Midterm"));
const Test = lazy(() => import("./Test"));
const Won = lazy(() => import("./Won"));
const Over = lazy(() => import("./Over"));
import "./styles.css";

export type Act = (fn: () => Promise<GameView>) => Promise<boolean>;
type Screen = "landing" | "match" | "build" | "seat";

const SCENARIO = /^\/s\/([a-z0-9-]+)$/i;
// Blocked storage is a browser setting, not a broken game: every read is a miss and every write is dropped.
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* the run stays in memory */
    }
  },
  remove: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* nothing to forget */
    }
  },
};

const go = (path: string, replace = false) => {
  if (location.pathname !== path) history[replace ? "replaceState" : "pushState"](null, "", path);
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [prompt, setPrompt] = useState("");
  const [daily, setDaily] = useState<Daily | null>(null);
  const [dailySeat, setDailySeat] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [scenario, setScenario] = useState<string | null>(null);
  const [pack, setPack] = useState<PackView | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [booting, setBooting] = useState(
    () => !!store.get("usoj:game") || SCENARIO.test(location.pathname),
  );
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Both keys outlive the tab: a reload between the night and the end of the term must not replay it.
  const [revealed, setRevealed] = useState<string | null>(() => store.get("usoj:revealed"));
  const [counted, setCounted] = useState<string | null>(() => store.get("usoj:counted"));
  const [reviewing, setReviewing] = useState(false);

  const fail = (e: unknown) =>
    setToast(e instanceof ApiError ? e.message : "The connection dropped. Try again.");

  /** `/s/<id>` is the one deep link: a ready scenario opens Seat, a running one opens Build. */
  const open = useCallback(async (id: string, push = true) => {
    setBusy(true);
    try {
      const s = await api.scenario(id);
      setScenario(id);
      if (push) go(`/s/${id}`);
      if (s.status === "ready" && s.pack) {
        setPack(s.pack);
        setScreen("seat");
      } else setScreen("build");
    } catch (e) {
      fail(e);
      setScreen("landing");
    } finally {
      setBusy(false);
      setBooting(false);
    }
  }, []);

  const start = useCallback(async (text: string) => {
    setBusy(true);
    try {
      const { id } = await api.build(text);
      setScenario(id);
      setPack(null);
      go(`/s/${id}`);
      setScreen("build");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const m = SCENARIO.exec(location.pathname);
    if (m) {
      open(m[1], false);
      return;
    }
    api
      .daily()
      .then(setDaily)
      .catch(() => {});
    const id = store.get("usoj:game");
    if (!id) return;
    // Only a game the server says is gone drops the pointer: a flat tyre on the way back is not a lost run.
    api
      .load(id)
      .then(setGame)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) store.remove("usoj:game");
        else fail(e);
      })
      .finally(() => setBooting(false));
  }, [open]);

  const playing = !!game;
  useEffect(() => {
    const pop = () => {
      // A running game owns the screen: Back and Forward must not re-fetch a scenario under it.
      if (playing) return;
      const m = SCENARIO.exec(location.pathname);
      if (m) open(m[1], false);
      else {
        setScreen("landing");
        setPack(null);
        setScenario(null);
      }
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, [open, playing]);

  // A game loaded from storage or a share code never passed through Seat, so the theme lands here.
  useEffect(() => {
    if (game) applyTokens(game.pack.themeTokens ?? DEFAULT_THEME_TOKENS);
  }, [game?.pack.id]); // eslint-disable-line

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const keep = (next: GameView) => {
    setGame(next);
    store.set("usoj:game", next.id);
  };
  const recover = (error: unknown) => {
    fail(error);
    // A 409 means the screen argued with a game that already moved; any failure mid-moment reloads the server's word.
    if (game)
      api
        .load(game.id)
        .then(setGame)
        .catch(() => {});
  };

  const act: Act = async (fn) => {
    setBusy(true);
    try {
      keep(await fn());
      return true;
    } catch (e) {
      recover(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const find = async (text: string) => {
    setPrompt(text);
    setBusy(true);
    try {
      const r = await api.match(text);
      if (r.load) {
        await open(r.load);
        return;
      }
      if (r.offer?.length) {
        setOffers(r.offer);
        setScreen("match");
        return;
      }
      await start(text);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // The seat is taken once: the deep link is replaced so a reload finds the saved game, not the Seat screen.
  const resumeId = store.get("usoj:game");
  const resume = () => {
    if (resumeId) act(() => api.load(resumeId));
  };

  const takeSeat = async (faction: string, promises: number[], seed: number, platform: string) => {
    const ok = await act(() =>
      dailySeat === scenario
        ? api.playDaily(faction, promises, platform)
        : api.seat(scenario!, faction, promises, seed, platform),
    );
    if (ok) go("/", true);
    return ok;
  };

  // "Take the seat" on an unplayed day is the one path that spends the attempt; the replay is practice.
  const playDaily = useCallback(
    async (id: string) => {
      setDailySeat(daily?.played ? null : id);
      await open(id);
    },
    [daily, open],
  );

  const restart = useCallback(() => {
    setPack(null);
    setScenario(null);
    setScreen("landing");
    resetTokens();
    go("/");
    api
      .daily()
      .then(setDaily)
      .catch(() => {});
  }, []);
  const quit = () => {
    store.remove("usoj:game");
    setGame(null);
    restart();
  };
  const ready = useCallback((p: PackView) => {
    setPack(p);
    setScreen("seat");
  }, []);

  // The test POST lands the run on `won` or `over`, so the reveal holds the screen until it has played.
  const testKey = game?.test ? `${game.id}#${game.terms.length}` : null;
  const showTest = !!game && (game.stage === "test" || (!!testKey && revealed !== testKey));
  // The midterm POST hands the stage straight back, so the night holds the screen until the player leaves it.
  const midtermKey = game?.midterm ? `${game.id}#${game.term}` : null;
  const showMidterm =
    !!game && (game.stage === "midterm" || (!!midtermKey && counted !== midtermKey));
  // The vote that ends a term flips the stage in the same answer, so the desk keeps the screen while its review
  // is up. The midterm, the test and an impeachment all wait for "Back to the desk".
  const desk = game ? (
    <Desk
      key={game.term}
      game={game}
      act={act}
      onGame={keep}
      onError={recover}
      onQuit={quit}
      onReview={setReviewing}
    />
  ) : null;

  return (
    <>
      {busy || booting ? <div className="progress" aria-hidden="true" /> : null}
      <Suspense fallback={null}>
        {booting ? null : game ? (
          reviewing ? (
            desk
          ) : showTest ? (
            <Test
              game={game}
              act={act}
              busy={busy}
              onDone={() => {
                setRevealed(testKey);
                store.set("usoj:revealed", testKey!);
              }}
            />
          ) : showMidterm ? (
            <Midterm
              game={game}
              act={act}
              busy={busy}
              onDone={() => {
                setCounted(midtermKey);
                store.set("usoj:counted", midtermKey!);
              }}
            />
          ) : game.stage === "won" ? (
            <Won game={game} act={act} busy={busy} />
          ) : game.stage === "over" ? (
            <Over game={game} act={act} busy={busy} onNew={quit} />
          ) : (
            desk
          )
        ) : screen === "seat" && pack && scenario ? (
          <Seat pack={pack} busy={busy} onSeat={takeSeat} />
        ) : screen === "build" && scenario ? (
          <Build id={scenario} onReady={ready} onRestart={restart} />
        ) : screen === "match" ? (
          <Match offers={offers} busy={busy} onPlay={open} onBuild={() => start(prompt)} />
        ) : (
          <Landing
            daily={daily}
            resume={!!resumeId}
            busy={busy}
            onFind={find}
            onResume={resume}
            onCode={(code) => act(() => api.share(code))}
            onPlayDaily={playDaily}
          />
        )}
      </Suspense>
      <div role="status" aria-live="polite">
        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    </>
  );
}
