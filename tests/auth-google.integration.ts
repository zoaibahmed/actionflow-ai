import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import { getAuth } from "../src/lib/auth/server";
import { getDatabase, getMongoClient } from "../src/lib/db/mongo";
import { verified, login } from "./helpers/auth-flow";
import { withMailDelivery } from "../src/lib/auth/mail";
assert.ok(process.env.MONGODB_URI?.startsWith("mongodb://127.0.0.1:"));
assert.match(process.env.MONGODB_DB || "", /^actionflow_ai_auth_e_/);
const base = process.env.BETTER_AUTH_URL!,
  originalFetch = globalThis.fetch;
process.env.GOOGLE_CLIENT_ID = "mock-google-client";
process.env.GOOGLE_CLIENT_SECRET = "mock-google-secret";
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
let identity = {
    email: `google-${randomUUID()}@example.test`,
    sub: randomUUID(),
    verified: true,
  },
  nonce: string | null = null;
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
function jwt() {
  const enc = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000),
    raw =
      enc({ alg: "RS256", kid: "test-key" }) +
      "." +
      enc({
        iss: "https://accounts.google.com",
        aud: "mock-google-client",
        sub: identity.sub,
        email: identity.email,
        email_verified: identity.verified,
        name: "Google Test",
        iat: now,
        exp: now + 300,
        ...(nonce ? { nonce } : {}),
      });
  return (
    raw +
    "." +
    sign("RSA-SHA256", Buffer.from(raw), privateKey).toString("base64url")
  );
}
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://oauth2.googleapis.com/token")
    return Response.json({
      access_token: "mock-access",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: jwt(),
    });
  if (url === "https://www.googleapis.com/oauth2/v3/certs")
    return Response.json({ keys: [jwk] });
  if (url.includes("googleapis.com") || url.includes("accounts.google.com"))
    throw new Error("Unexpected external OAuth request blocked in test");
  return originalFetch(input, init);
}) as typeof fetch;
const auth = getAuth();
class Flow {
  jar = new Map<string, string>();
  get cookie() {
    return Array.from(this.jar, ([k, v]) => `${k}=${v}`).join("; ");
  }
  async call(path: string, body?: unknown) {
    const r = await withMailDelivery(() =>
      auth.handler(
        new Request(base + "/api/auth" + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: base,
            "Content-Type": "application/json",
            Cookie: this.cookie,
            "X-Forwarded-For":
              "203.0.113." + (Math.floor(Math.random() * 240) + 1),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      ),
    );
    for (const c of r.headers.getSetCookie()) {
      const raw = c.split(";")[0],
        i = raw.indexOf("=");
      this.jar.set(raw.slice(0, i), raw.slice(i + 1));
    }
    return r;
  }
}
async function oauth(flow: Flow) {
  const start = await flow.call("/sign-in/social", {
    provider: "google",
    callbackURL: base + "/dashboard",
    errorCallbackURL: base + "/login?notice=oauth",
  });
  assert.equal(start.status, 200);
  const url = new URL((await start.json()).url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.ok(!url.searchParams.get("scope")?.includes("gmail"));
  nonce = url.searchParams.get("nonce");
  return flow.call(
    "/callback/google?code=mock-code&state=" +
      encodeURIComponent(url.searchParams.get("state")!),
  );
}
test.after(async () => {
  globalThis.fetch = originalFetch;
  await getMongoClient().close();
});
test("Google OAuth validates signed mocked tokens, registers once and returns the same owned account without credential OTP", async () => {
  const f = new Flow();
  const r = await oauth(f);
  assert.ok([302, 303].includes(r.status));
  assert.equal(
    new URL(r.headers.get("location")!, base).pathname,
    "/dashboard",
  );
  const session = await (await f.call("/get-session")).json();
  assert.equal(session.user.email, identity.email);
  assert.equal(session.session.authPolicyVersion, 2);
  const id = session.user.id;
  const other = new Flow();
  await oauth(other);
  assert.equal((await (await other.call("/get-session")).json()).user.id, id);
  assert.equal(
    await getDatabase()
      .collection("user")
      .countDocuments({ email: identity.email }),
    1,
  );
});
test("OAuth state tampering and unverified Google claims cannot establish a session", async () => {
  const f = new Flow();
  const bad = await f.call("/callback/google?code=mock-code&state=wrong");
  assert.ok(bad.status >= 300);
  assert.equal(await (await f.call("/get-session")).json(), null);
  identity = {
    email: `unverified-${randomUUID()}@example.test`,
    sub: randomUUID(),
    verified: false,
  };
  const u = new Flow();
  await oauth(u);
  assert.equal(await (await u.call("/get-session")).json(), null);
});
test("a matching email never implicitly links Google into an existing credential account", async () => {
  const local = new Flow(),
    email = `collision-${randomUUID()}@example.test`;
  assert.equal(
    (
      await local.call("/sign-up/email", {
        email,
        password: `Test-${randomUUID()}!`,
        name: "Existing User",
      })
    ).status,
    200,
  );
  identity = { email, sub: randomUUID(), verified: true };
  const f = new Flow();
  await oauth(f);
  assert.equal(await (await f.call("/get-session")).json(), null);
  assert.equal(
    await getDatabase().collection("user").countDocuments({ email }),
    1,
  );
});

test("explicit same-email linking requires a completed session and preserves the existing owner", async () => {
  const local = await verified();
  await login(local.flow, local.email, local.password);
  const owner = (await local.flow.session()).user.id;
  identity = { email: local.email, sub: randomUUID(), verified: true };
  const noSession = new Flow();
  assert.notEqual(
    (
      await noSession.call("/link-social", {
        provider: "google",
        callbackURL: base + "/dashboard/settings",
      })
    ).status,
    200,
  );
  const f = new Flow();
  f.jar = new Map(local.flow.jar);
  const r = await f.call("/link-social", {
    provider: "google",
    callbackURL: base + "/dashboard/settings",
  });
  assert.equal(r.status, 200);
  const u = new URL((await r.json()).url);
  nonce = u.searchParams.get("nonce");
  const callback = await f.call(
    "/callback/google?code=mock-code&state=" +
      encodeURIComponent(u.searchParams.get("state")!),
  );
  assert.ok([302, 303].includes(callback.status));
  const next = new Flow();
  await oauth(next);
  assert.equal((await (await next.call("/get-session")).json()).user.id, owner);
  assert.equal(
    await getDatabase()
      .collection("user")
      .countDocuments({ email: local.email }),
    1,
  );
});
