import { Hono } from "hono";
export { GameDO } from "./game";

type Env = { GAME: DurableObjectNamespace; RL: RateLimit; OPENROUTER_API_KEY: string };

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const { success } = await c.env.RL.limit({ key: ip });
  if (!success) return c.json({ error: "Slow down." }, 429);
  await next();
});

app.get("/api/health", async (c) => {
  const stub = c.env.GAME.get(c.env.GAME.idFromName("health"));
  return stub.fetch(new Request("https://do/health"));
});

export default app;
