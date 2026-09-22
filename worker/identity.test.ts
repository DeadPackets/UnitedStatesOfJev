import { test, expect } from "bun:test";
import { IDENTITY_COOKIE, cookieOf, identity, setCookie, signId, verifyId } from "./identity";

const SECRET = "test-secret-not-the-real-one";

test("a signed id verifies, and a tampered one does not", async () => {
  const signed = await signId(SECRET, "11111111-2222-3333-4444-555555555555");
  expect(await verifyId(SECRET, signed)).toBe("11111111-2222-3333-4444-555555555555");
  expect(await verifyId(SECRET, signed.replace(/.$/, "x"))).toBeNull();
  expect(await verifyId("another-secret", signed)).toBeNull();
  expect(await verifyId(SECRET, "11111111-2222-3333-4444-555555555555.")).toBeNull();
  expect(await verifyId(SECRET, "not-a-uuid.signature")).toBeNull();
});

test("a request with no cookie gets a fresh identity and the header that sets it", async () => {
  const fresh = await identity(SECRET, new Request("https://x/"));
  expect(fresh.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(fresh.header).toContain(`${IDENTITY_COOKIE}=`);
  expect(fresh.header).toContain("HttpOnly");
  expect(fresh.header).toContain("SameSite=Lax");

  const signed = await signId(SECRET, fresh.id);
  const back = await identity(SECRET, new Request("https://x/", { headers: { cookie: `other=1; ${IDENTITY_COOKIE}=${signed}` } }));
  expect(back.id).toBe(fresh.id);
  expect(back.header).toBeUndefined();
});

test("a forged cookie is replaced, never trusted", async () => {
  const req = new Request("https://x/", { headers: { cookie: `${IDENTITY_COOKIE}=11111111-2222-3333-4444-555555555555.forged` } });
  const who = await identity(SECRET, req);
  expect(who.id).not.toBe("11111111-2222-3333-4444-555555555555");
  expect(who.header).toBeDefined();
});

test("cookieOf reads only its own cookie", () => {
  expect(cookieOf(new Request("https://x/", { headers: { cookie: "a=1; usoj_id=abc; b=2" } }))).toBe("abc");
  expect(cookieOf(new Request("https://x/"))).toBeNull();
  expect(setCookie("abc")).toContain("Path=/");
});
