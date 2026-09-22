import { Hono } from "hono";
import { decodeCode, scenarioTag } from "./engine";
import type { Env } from "./jev";
import { getScenario, newScenario } from "./db";
import { packView } from "./pack";
import { match } from "./match";
export { GameDO } from "./game";
export { BuildsDO } from "./db";
export { ScenarioBuild } from "./build";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
  // 40/min: a turn is 3-7 requests; a nonstop abuser costs about $2.40 an hour at this cap.
  // Art is exempt: one seat coin per member is up to 100 requests when a pack screen opens.
  if (!c.req.path.includes("/art/")) {
    const { success } = await c.env.RL.limit({ key: c.req.header("cf-connecting-ip") ?? "local" });
    if (!success) return c.json({ error: "Slow down." }, 429);
  }
  await next();
});

type Ctx = { env: Env };
const forward = (c: Ctx, id: string, path: string, body?: unknown) =>
  c.env.GAME.get(c.env.GAME.idFromName(id))
    .fetch(new Request(`https://do/${path}`, body ? { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}));

// The share code carries a 6-char hash of the scenario id, not the id itself.
// ponytail: scans the ready ids and hashes each; add an indexed tag column if the archive outgrows one page.
async function scenarioFromTag(env: Env, tag: string): Promise<string | null> {
  const { results } = await env.DB.prepare("SELECT id FROM scenarios WHERE status = 'ready'").all<{ id: string }>();
  return results.find((r) => scenarioTag(r.id) === tag)?.id ?? null;
}

app.get("/api/health", (c) => forward(c, "health", "health"));

type Seat = { scenario?: string; faction?: string | number; promises?: number[]; seed?: number; code?: string };
app.post("/api/games", async (c) => {
  const body = await c.req.json<Seat>().catch(() => ({} as Seat));
  let seat: Seat;
  if (body.code) {
    let code;
    try { code = decodeCode(body.code); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
    const scenario = await scenarioFromTag(c.env, code.scenario);
    if (!scenario) return c.json({ error: "That code names a scenario this archive does not have." }, 404);
    seat = { scenario, faction: code.faction, promises: code.promises, seed: code.seed };
  } else {
    if (typeof body.scenario !== "string") return c.json({ error: "Name a scenario." }, 400);
    seat = { scenario: body.scenario, faction: body.faction, promises: body.promises, seed: body.seed };
  }
  const id = crypto.randomUUID();
  const r = await forward(c, id, "new", { id, ...seat });
  if (r.ok) await c.env.DB.prepare("UPDATE scenarios SET builds = builds + 1 WHERE id = ?").bind(seat.scenario).run();
  return r;
});
// 6 base36 characters: 2.2 billion ids, short enough to read out.
const scenarioId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => (b % 36).toString(36)).join("");

app.post("/api/scenarios/match", async (c) => {
  const { prompt } = await c.req.json<{ prompt?: string }>();
  if (typeof prompt !== "string" || prompt.trim().length < 3) return c.json({ error: "Name a place and a time." }, 400);
  return c.json(await match(c.env, prompt.trim()));
});

app.post("/api/scenarios", async (c) => {
  const { prompt } = await c.req.json<{ prompt?: string }>();
  if (typeof prompt !== "string" || prompt.trim().length < 3) return c.json({ error: "Name a place and a time." }, 400);
  const builds = c.env.BUILDS.get(c.env.BUILDS.idFromName("builds"));
  if (!(await builds.spaced(c.req.header("cf-connecting-ip") ?? "local"))) {
    return c.json({ error: "One build every 10 minutes. Load a scenario in the meantime." }, 429);
  }
  if (!(await builds.take())) return c.json({ error: "Today's builds are used up. Try again tomorrow." }, 429);
  const id = scenarioId();
  await newScenario(c.env, id, prompt.trim());
  await c.env.BUILD.create({ id, params: { id, prompt: prompt.trim() } });
  return c.json({ id }, 202);
});

app.get("/api/scenarios/:id/art/*", async (c) => {
  const key = `scenarios/${c.req.param("id")}/${c.req.path.split("/art/").slice(1).join("/art/")}`;
  const obj = await c.env.ART.get(key);
  if (!obj) return c.json({ error: "No such image." }, 404);
  return new Response(obj.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
});

app.get("/api/scenarios/:id", async (c) => {
  const row = await getScenario(c.env, c.req.param("id"));
  if (!row) return c.json({ error: "No such scenario." }, 404);
  return c.json({
    status: row.status, step: row.step, fragments: row.fragments,
    ...(row.pack ? { pack: packView(row.pack) } : {}),
    ...(row.error ? { error: row.error } : {}),
  });
});

app.get("/api/games/:id", (c) => forward(c, c.req.param("id"), "state"));
app.post("/api/games/:id/bills", async (c) => forward(c, c.req.param("id"), "bills", await c.req.json()));
app.post("/api/games/:id/bills/:b/:action/:i?", async (c) => {
  const { id, b, action, i } = c.req.param();
  return forward(c, id, `bills/${b}/${action}${i !== undefined ? "/" + i : ""}`, await c.req.json());
});
app.post("/api/games/:id/events/:i", async (c) => forward(c, c.req.param("id"), `events/${c.req.param("i")}`, await c.req.json()));
// test, continue and stop take no turn: the term is already over when they are legal.
for (const action of ["test", "continue", "stop"]) {
  app.post(`/api/games/:id/${action}`, (c) => forward(c, c.req.param("id"), action, {}));
}

export default app;
