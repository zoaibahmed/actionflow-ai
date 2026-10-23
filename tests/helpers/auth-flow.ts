import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export const origin = process.env.BETTER_AUTH_URL || "http://localhost:3001";
export class AuthFlow {
  ip =
    "2001:db8:" +
    randomUUID().replace(/-/g, "").slice(0, 24).match(/.{4}/g)!.join(":");
  jar = new Map<string, string>();
  get cookie() {
    return Array.from(this.jar, ([k, v]) => `${k}=${v}`).join("; ");
  }
  async post(path: string, body: unknown, auth = true) {
    const r = await fetch(origin + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Forwarded-For": this.ip,
        Cookie: auth ? this.cookie : "",
      },
      body: JSON.stringify(body),
      redirect: "manual",
    });
    if (auth)
      for (const c of r.headers.getSetCookie()) {
        const value = c.split(";")[0],
          i = value.indexOf("=");
        this.jar.set(value.slice(0, i), value.slice(i + 1));
      }
    return r;
  }
  async session() {
    return (
      await fetch(origin + "/api/auth/get-session", {
        headers: { Cookie: this.cookie, "X-Forwarded-For": this.ip },
      })
    ).json();
  }
}
export async function localMail(email: string, subject: string) {
  assert.equal(process.env.MAIL_MODE, "file");
  assert.ok(!process.env.SMTP_HOST, "Isolated file-mail only");
  for (let i = 0; i < 60; i++) {
    for (const file of (await readdir(".local-mail"))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()) {
      const m = JSON.parse(await readFile(".local-mail/" + file, "utf8"));
      if (m.to === email && m.subject === subject)
        return m as { text: string; html: string };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Expected private test mail missing");
}
export const mailCode = (mail: { text: string }) => {
  const code = mail.text.match(/\b\d{6}\b/)?.[0];
  assert.ok(code, "Expected six-digit test code");
  return code;
};
export async function signup(flow = new AuthFlow()) {
  const email = `auth-e-${randomUUID()}@example.test`,
    password = `Test-${randomUUID()}!`;
  assert.equal(
    (
      await flow.post("/api/auth/sign-up/email", {
        name: "Checkpoint E Test",
        email,
        password,
      })
    ).status,
    200,
  );
  return { flow, email, password };
}
export async function verified() {
  const a = await signup();
  const otp = mailCode(
    await localMail(a.email, "Verify your ActionFlow email"),
  );
  assert.equal(
    (
      await a.flow.post("/api/auth/email-otp/verify-email", {
        email: a.email,
        otp,
      })
    ).status,
    200,
  );
  return { ...a, otp };
}
export async function login(flow: AuthFlow, email: string, password: string) {
  const r = await flow.post("/api/auth/sign-in/email", { email, password });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).twoFactorRedirect, true);
  assert.equal(await flow.session(), null);
  assert.equal(
    (await flow.post("/api/auth/two-factor/send-otp", {})).status,
    200,
  );
  const code = mailCode(await localMail(email, "Your ActionFlow sign-in code"));
  assert.equal(
    (await flow.post("/api/auth/two-factor/verify-otp", { code })).status,
    200,
  );
  assert.equal((await flow.session()).user.email, email);
  return code;
}
