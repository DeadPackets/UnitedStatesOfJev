import { useEffect, useState } from "react";
import { api, ApiError, type GameView } from "./api";
import Setup from "./Setup";
import Chamber from "./Chamber";
import Over from "./Over";
import "./styles.css";

export type Act = (fn: () => Promise<GameView>) => Promise<boolean>;

export default function App() {
  const [game, setGame] = useState<GameView | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("usoj:game");
    if (id) api.load(id).then(setGame).catch(() => localStorage.removeItem("usoj:game"));
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);

  const act: Act = async (fn) => {
    setBusy(true);
    try { const g = await fn(); setGame(g); localStorage.setItem("usoj:game", g.id); return true; }
    catch (e) { setToast(e instanceof ApiError ? e.message : "Network hiccup. Try again."); return false; }
    finally { setBusy(false); }
  };
  const quit = () => { localStorage.removeItem("usoj:game"); setGame(null); };

  return (
    <>
      {!game ? <Setup onStart={(code) => act(() => api.create(code))} busy={busy} />
        : game.phase === "over" ? <Over game={game} onNew={quit} />
        : <Chamber game={game} act={act} busy={busy} onQuit={quit} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
