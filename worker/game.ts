import { DurableObject } from "cloudflare:workers";

export class GameDO extends DurableObject {
  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/health") return Response.json({ ok: true });
    return new Response("Not found", { status: 404 });
  }
}
