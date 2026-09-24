import "./base.css";
import { createRoot } from "react-dom/client";
import { DEFAULT_THEME_TOKENS } from "../worker/tokens";
import App from "./App";
import { applyTokens, themeMode } from "./theme";

document.documentElement.dataset.theme = themeMode();
applyTokens(DEFAULT_THEME_TOKENS);
// The desk's moments read the `rm` class, so reduced motion is one switch the page can also flip live.
const quiet = matchMedia("(prefers-reduced-motion: reduce)");
const syncMotion = () => document.documentElement.classList.toggle("rm", quiet.matches);
syncMotion();
quiet.addEventListener("change", syncMotion);

createRoot(document.getElementById("root")!).render(<App />);
