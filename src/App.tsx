import { useEffect, useState } from "react";
import { api, ApiError, type GameView } from "./api";
import Setup from "./Setup";
import Chamber from "./Chamber";
import Over from "./Over";
import "./styles.css";

export type Act = (fn: () => Promise<GameView>) => Promise<boolean>;

export default function App() {
  const [game, setGame] = useState<GameView | null>(null);
  const [booting, setBooting] = useState(() => !!localStorage.getItem("usoj:game"));
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("usoj:game");
    if (!id) return;
    api.load(id).then(setGame).catch(() => localStorage.removeItem("usoj:game")).finally(() => setBooting(false));
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3600); return () => clearTimeout(t); }, [toast]);

  const act: Act = async (fn) => {
    setBusy(true);
    try { const g = await fn(); setGame(g); localStorage.setItem("usoj:game", g.id); return true; }
    catch (e) { setToast(e instanceof ApiError ? e.message : "Network hiccup. Try again."); return false; }
    finally { setBusy(false); }
  };
  const quit = () => { localStorage.removeItem("usoj:game"); setGame(null); };

  return (
    <>
      {busy || booting ? <div className="progress" aria-hidden="true" /> : null}
      {booting ? null : !game ? <Setup onStart={(code) => act(() => api.create(code))} busy={busy} />
        : game.phase === "over" ? <Over game={game} onNew={quit} />
        : <Chamber game={game} act={act} busy={busy} onQuit={quit} />}
      <div role="status" aria-live="polite">{toast ? <div className="toast">{toast}</div> : null}</div>
    </>
  );
}
