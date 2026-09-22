export const IDENTITY_COOKIE = "usoj_id";
const MAX_AGE = 34_560_000;   // 400 days, the longest life a browser keeps a cookie for
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const bytes = (s: string) => new TextEncoder().encode(s);
const b64url = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const keyOf = (secret: string) =>
  crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

export async function signId(secret: string, id: string): Promise<string> {
  return `${id}.${b64url(await crypto.subtle.sign("HMAC", await keyOf(secret), bytes(id)))}`;
}

// Re-sign and compare the whole value: a timing oracle on a value the attacker already chose buys nothing.
export async function verifyId(secret: string, value: string): Promise<string | null> {
  const id = value.split(".")[0];
  if (!UUID.test(id)) return null;
  return (await signId(secret, id)) === value ? id : null;
}

export function cookieOf(req: Request): string | null {
  const hit = (req.headers.get("cookie") ?? "").split(";").map((p) => p.trim())
    .find((p) => p.startsWith(`${IDENTITY_COOKIE}=`));
  return hit ? hit.slice(IDENTITY_COOKIE.length + 1) : null;
}

export const setCookie = (signed: string) =>
  `${IDENTITY_COOKIE}=${signed}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;

/** The identity a daily route works with, and the Set-Cookie header to send when it is new. */
export async function identity(secret: string, req: Request): Promise<{ id: string; header?: string }> {
  const raw = cookieOf(req);
  if (raw) {
    const id = await verifyId(secret, raw);
    if (id) return { id };
  }
  const id = crypto.randomUUID();
  return { id, header: setCookie(await signId(secret, id)) };
}
