import { Hono } from "hono";
import { decodeCode, dailyCode } from "./engine";
import type { Env } from "./jev";
export { GameDO } from "./game";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
  // 40/min: a turn is 3-7 requests; a nonstop abuser costs about $2.40 an hour at this cap.
  const { success } = await c.env.RL.limit({ key: c.req.header("cf-connecting-ip") ?? "local" });
  if (!success) return c.json({ error: "Slow down." }, 429);
  await next();
});

const stub = (c: any, id: string) => c.env.GAME.get(c.env.GAME.idFromName(id));
const forward = (c: any, id: string, path: string, body?: unknown) =>
  stub(c, id).fetch(new Request(`https://do/${path}`, body ? { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}));

app.get("/api/health", (c) => forward(c, "health", "health"));
app.get("/api/daily", (c) => c.json({ code: dailyCode() }));
app.post("/api/games", async (c) => {
  const { code } = await c.req.json<{ code: string }>();
  try { decodeCode(code); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  const id = crypto.randomUUID();
  return forward(c, id, "new", { id, code });
});
app.get("/api/games/:id", (c) => forward(c, c.req.param("id"), "state"));
app.post("/api/games/:id/bills", async (c) => forward(c, c.req.param("id"), "bills", await c.req.json()));
app.post("/api/games/:id/bills/:b/:action/:i?", async (c) => {
  const { id, b, action, i } = c.req.param();
  return forward(c, id, `bills/${b}/${action}${i !== undefined ? "/" + i : ""}`, await c.req.json());
});

export default app;
