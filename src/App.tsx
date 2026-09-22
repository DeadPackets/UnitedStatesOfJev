import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type GameView, type Offer, type PackView } from "./api";
import Write from "./Write";
import Match from "./Match";
import Build from "./Build";
import Seat from "./Seat";
import Chamber from "./Chamber";
import Midterm from "./Midterm";
import Campaign from "./Campaign";
import Test from "./Test";
import Won from "./Won";
import Over from "./Over";
import { applyTheme } from "./theme";
import "./styles.css";

export type Act = (fn: () => Promise<GameView>) => Promise<boolean>;
type Screen = "write" | "match" | "build" | "seat";

const SCENARIO = /^\/s\/([a-z0-9]+)$/i;
const go = (path: string, replace = false) => {
  if (location.pathname !== path) history[replace ? "replaceState" : "pushState"](null, "", path);
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("write");
  const [prompt, setPrompt] = useState("");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [scenario, setScenario] = useState<string | null>(null);
  const [pack, setPack] = useState<PackView | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [booting, setBooting] = useState(() => !!localStorage.getItem("usoj:game") || SCENARIO.test(location.pathname));
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Both keys outlive the tab: a reload between the night and the end of the term must not replay it.
  const [revealed, setRevealed] = useState<string | null>(() => localStorage.getItem("usoj:revealed"));
  const [counted, setCounted] = useState<string | null>(() => localStorage.getItem("usoj:counted"));

  const fail = (e: unknown) => setToast(e instanceof ApiError ? e.message : "The connection dropped. Try again.");

  /** `/s/<id>` is the one deep link: a ready scenario opens Seat, a running one opens Build. */
  const open = useCallback(async (id: string, push = true) => {
    setBusy(true);
    try {
      const s = await api.scenario(id);
      setScenario(id);
      if (push) go(`/s/${id}`);
      if (s.status === "ready" && s.pack) { setPack(s.pack); setScreen("seat"); } else setScreen("build");
    } catch (e) { fail(e); setScreen("write"); }
    finally { setBusy(false); setBooting(false); }
  }, []);

  const start = useCallback(async (text: string) => {
    setBusy(true);
    try {
      const { id } = await api.build(text);
      setScenario(id);
      setPack(null);
      go(`/s/${id}`);
      setScreen("build");
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    const m = SCENARIO.exec(location.pathname);
    if (m) { open(m[1], false); return; }
    const id = localStorage.getItem("usoj:game");
    if (!id) return;
    // Only a game the server says is gone drops the pointer: a flat tyre on the way back is not a lost run.
    api.load(id).then(setGame)
      .catch((e) => { if (e instanceof ApiError && e.status === 404) localStorage.removeItem("usoj:game"); else fail(e); })
      .finally(() => setBooting(false));
  }, [open]);

  useEffect(() => {
    const pop = () => {
      const m = SCENARIO.exec(location.pathname);
      if (m) open(m[1], false);
      else { setScreen("write"); setPack(null); setScenario(null); }
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, [open]);

  // A game loaded from storage or a share code never passed through Seat, so the theme lands here.
  useEffect(() => { if (game) applyTheme(game.pack.theme); }, [game?.pack.id]); // eslint-disable-line

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3600); return () => clearTimeout(t); }, [toast]);

  const act: Act = async (fn) => {
    setBusy(true);
    try { const g = await fn(); setGame(g); localStorage.setItem("usoj:game", g.id); return true; }
    catch (e) { fail(e); return false; }
    finally { setBusy(false); }
  };

  const find = async (text: string) => {
    setPrompt(text);
    setBusy(true);
    try {
      const r = await api.match(text);
      if (r.load) { await open(r.load); return; }
      if (r.offer?.length) { setOffers(r.offer); setScreen("match"); return; }
      await start(text);
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  };

  // The seat is taken once: the deep link is replaced so a reload finds the saved game, not the Seat screen.
  const takeSeat = async (faction: string, promises: number[], seed: number) => {
    const ok = await act(() => api.seat(scenario!, faction, promises, seed));
    if (ok) go("/", true);
    return ok;
  };

  const restart = useCallback(() => { setPack(null); setScenario(null); setScreen("write"); go("/"); }, []);
  const quit = () => { localStorage.removeItem("usoj:game"); setGame(null); restart(); };
  const ready = useCallback((p: PackView) => { setPack(p); setScreen("seat"); }, []);

  // The test POST lands the run on `won` or `over`, so the reveal holds the screen until it has played.
  const testKey = game?.test ? `${game.id}#${game.terms.length}` : null;
  const showTest = !!game && (game.stage === "test" || (!!testKey && revealed !== testKey));
  // The midterm POST hands the stage straight back, so the night holds the screen until the player leaves it.
  const midtermKey = game?.midterm ? `${game.id}#${game.term}` : null;
  const showMidterm = !!game && (game.stage === "midterm" || (!!midtermKey && counted !== midtermKey));

  return (
    <>
      {busy || booting ? <div className="progress" aria-hidden="true" /> : null}
      {booting ? null
        : game ? (
            showTest ? <Test game={game} act={act} busy={busy} onDone={() => { setRevealed(testKey); localStorage.setItem("usoj:revealed", testKey!); }} />
            : showMidterm ? <Midterm game={game} act={act} busy={busy} onDone={() => { setCounted(midtermKey); localStorage.setItem("usoj:counted", midtermKey!); }} />
            : game.stage === "campaign" ? <Campaign game={game} act={act} busy={busy} />
            : game.stage === "won" ? <Won game={game} act={act} busy={busy} />
            : game.stage === "over" ? <Over game={game} act={act} busy={busy} onNew={quit} />
            : <Chamber key={game.term} game={game} act={act} busy={busy} onQuit={quit} />)
        : screen === "seat" && pack && scenario ? <Seat pack={pack} busy={busy} onSeat={takeSeat} />
        : screen === "build" && scenario ? <Build id={scenario} onReady={ready} onRestart={restart} />
        : screen === "match" ? <Match offers={offers} busy={busy} onPlay={open} onBuild={() => start(prompt)} />
        : <Write busy={busy} onSubmit={find} />}
      <div role="status" aria-live="polite">{toast ? <div className="toast">{toast}</div> : null}</div>
    </>
  );
}
