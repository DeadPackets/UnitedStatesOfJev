import { test, expect, mock } from "bun:test";

// db.ts pulls in `cloudflare:workers` for its Durable Object class, which only workerd resolves.
// Stub it so this file's offline unit test can import parseRow directly.
mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));
const { parseRow, BuildsDO } = await import("./db");

test("parseRow fails soft when the stored pack no longer matches the schema", () => {
  const row = { id: "x", status: "ready", step: "ready", pack: JSON.stringify({ not: "a valid pack" }), fragments: null };
  const parsed = parseRow(row);
  expect(parsed.pack).toBeNull();
  expect(parsed.status).toBe("failed");
  expect(parsed.error).toBe("pack no longer matches the schema");
});

// workerd delivers one RPC at a time: a method runs to its end before the next is delivered. The bug was
// that the window check, the daily slot and the mark were three methods, so a burst passed the window together.
function gated<T extends object>(target: T): T {
  let queue: Promise<unknown> = Promise.resolve();
  return new Proxy(target, {
    get(t, k) {
      const v = Reflect.get(t, k);
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => (queue = queue.then(() => v.apply(t, args)));
    },
  });
}

function buildsDO(env: Record<string, string>) {
  const store = new Map<string, unknown>();
  const storage = {
    get: async (k: string) => store.get(k),
    put: async (k: string, v: unknown) => { store.set(k, v); },
    list: async () => new Map(),
    delete: async () => {},
  };
  const instance = new (BuildsDO as any)({ storage }, env);
  instance.ctx = { storage };
  instance.env = env;
  return { store, builds: gated(instance) as any };
}

test("two builds from one IP at once take one slot between them", async () => {
  const { store, builds } = buildsDO({ DAILY_BUILD_CAP: "50" });
  const both = await Promise.all([
    builds.claim("1.2.3.4", "build", 600_000, true),
    builds.claim("1.2.3.4", "build", 600_000, true),
  ]);
  expect(both.filter((r: string) => r === "ok")).toHaveLength(1);
  expect(both).toContain("spaced");
  expect(store.get(`count:${new Date().toISOString().slice(0, 10)}`)).toBe(1);
});

test("a cap that is not a number closes the gate instead of opening it", async () => {
  const { builds } = buildsDO({});
  expect(await builds.claim("1.2.3.4", "build", 600_000, true)).toBe("capped");
  expect(await builds.takeGame()).toBe(false);
});
