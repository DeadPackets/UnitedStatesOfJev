import { test, expect, mock } from "bun:test";

// db.ts pulls in `cloudflare:workers` for its Durable Object class, which only workerd resolves.
// Stub it so this file's offline unit test can import parseRow directly.
mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));
const { parseRow } = await import("./db");

test("parseRow fails soft when the stored pack no longer matches the schema", () => {
  const row = { id: "x", status: "ready", step: "ready", pack: JSON.stringify({ not: "a valid pack" }), fragments: null };
  const parsed = parseRow(row);
  expect(parsed.pack).toBeNull();
  expect(parsed.status).toBe("failed");
  expect(parsed.error).toBe("pack no longer matches the schema");
});
