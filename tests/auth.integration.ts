import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
import {
  AuthFlow,
  origin,
  signup,
  verified,
  login,
  localMail,
  mailCode,
} from "./helpers/auth-flow";
assert.ok(
  process.env.MONGODB_URI?.startsWith("mongodb://127.0.0.1:"),
  "Disposable local replica set only",
);
assert.match(process.env.MONGODB_DB || "", /^actionflow_ai_auth_e_/);
const client = new MongoClient(process.env.MONGODB_URI!),
  db = client.db(process.env.MONGODB_DB);
test.after(async () => client.close());
test("registration uses hashed six-digit OTP, verification, invalid/expired codes, replay and resend limits", async () => {
  const a = await signup();
  const otp = mailCode(
    await localMail(a.email, "Verify your ActionFlow email"),
  );
  assert.equal(await a.flow.session(), null);
  assert.equal(
    (
      await a.flow.post("/api/auth/sign-in/email", {
        email: a.email,
        password: a.password,
      })
    ).status,
    403,
  );
  const records = await db
    .collection("verification")
    .find({
      identifier: { $regex: a.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") },
    })
    .toArray();
  assert.ok(records.length);
  assert.ok(records.every((r) => !String(r.value).includes(otp)));
  assert.notEqual(
    (
      await a.flow.post("/api/auth/email-otp/verify-email", {
        email: a.email,
        otp: "000000" === otp ? "111111" : "000000",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await a.flow.post("/api/auth/email-otp/send-verification-otp", {
        email: a.email,
        type: "email-verification",
      })
    ).status,
    429,
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
  assert.notEqual(
    (
      await a.flow.post("/api/auth/email-otp/verify-email", {
        email: a.email,
        otp,
      })
    ).status,
    200,
  );
  assert.equal(await a.flow.session(), null);
  const expired = await signup();
  const old = mailCode(
    await localMail(expired.email, "Verify your ActionFlow email"),
  );
  await db.collection("verification").updateMany(
    {
      identifier: {
        $regex: expired.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      },
    },
    { $set: { expiresAt: new Date(0) } },
  );
  assert.notEqual(
    (
      await expired.flow.post("/api/auth/email-otp/verify-email", {
        email: expired.email,
        otp: old,
      })
    ).status,
    200,
  );
});
test("password plus OTP cannot be bypassed through pending cookies or passwordless/plugin APIs", async () => {
  const a = await verified();
  assert.notEqual(
    (
      await a.flow.post("/api/auth/sign-in/email", {
        email: a.email,
        password: "wrong-password",
      })
    ).status,
    200,
  );
  const r = await a.flow.post("/api/auth/sign-in/email", {
    email: a.email,
    password: a.password,
  });
  assert.equal((await r.json()).twoFactorRedirect, true);
  assert.equal(await a.flow.session(), null);
  for (const path of [
    "/api/agent",
    "/api/planner",
    "/api/reminders",
    "/api/capture/analyze",
    "/api/capture/save",
  ])
    assert.equal((await a.flow.post(path, {})).status, 401, path);
  const dash = await fetch(origin + "/dashboard", {
    headers: { Cookie: a.flow.cookie },
    redirect: "manual",
  });
  assert.ok([200, 307].includes(dash.status));
  if (dash.status === 200)
    assert.match(await dash.text(), /NEXT_REDIRECT|login/);
  for (const path of [
    "/sign-in/email-otp",
    "/email-otp/get-verification-otp",
    "/two-factor/disable",
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
  ])
    assert.notEqual(
      (
        await a.flow.post("/api/auth" + path, {
          email: a.email,
          otp: a.otp,
          code: "000000",
          password: a.password,
        })
      ).status,
      200,
    );
  assert.equal(
    (await a.flow.post("/api/auth/two-factor/send-otp", {})).status,
    200,
  );
  const code = mailCode(
    await localMail(a.email, "Your ActionFlow sign-in code"),
  );
  const heldJar = new Map(a.flow.jar);
  assert.equal(
    (await a.flow.post("/api/auth/two-factor/send-otp", {})).status,
    429,
  );
  assert.notEqual(
    (
      await a.flow.post("/api/auth/two-factor/verify-otp", {
        code,
        trustDevice: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await a.flow.post("/api/auth/two-factor/verify-otp", { code })).status,
    200,
  );
  const session = await a.flow.session();
  assert.equal(session.user.email, a.email);
  assert.equal(session.session.authPolicyVersion, 2);
  const replay = new AuthFlow();
  replay.jar = heldJar;
  assert.notEqual(
    (await replay.post("/api/auth/two-factor/verify-otp", { code })).status,
    200,
  );
  const other = await verified();
  await login(other.flow, other.email, other.password);
  assert.equal(
    (
      await a.flow.post("/api/agent", {
        action: "load",
        conversationId: randomUUID(),
      })
    ).status,
    404,
  );
  const foreign = await fetch(origin + "/api/auth/sign-out", {
    method: "POST",
    headers: {
      Origin: "https://attacker.invalid",
      Cookie: a.flow.cookie,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(foreign.status, 403);
  assert.equal((await a.flow.post("/api/auth/sign-out", {})).status, 200);
  assert.equal(await a.flow.session(), null);
});
test("existing credential users enroll safely without replacing their records or owned data", async () => {
  const a = await verified();
  const u = await db.collection("user").findOne({ email: a.email });
  assert.ok(u);
  await db
    .collection("user")
    .updateOne({ _id: u._id }, { $unset: { twoFactorEnabled: "" } });
  await login(a.flow, a.email, a.password);
  assert.equal(
    (await db.collection("user").findOne({ email: a.email }))?._id.toString(),
    u._id.toString(),
  );
  assert.equal(
    (await db.collection("user").findOne({ _id: u._id }))?.twoFactorEnabled,
    true,
  );
});
test("password reset is expiring, single-use, redirect-safe, neutral and revokes existing sessions", async () => {
  const a = await verified();
  await login(a.flow, a.email, a.password);
  const oldCookie = a.flow.cookie;
  const unknown = await a.flow.post("/api/auth/request-password-reset", {
    email: randomUUID() + "@example.test",
    redirectTo: origin + "/reset-password",
  });
  assert.equal(unknown.status, 200);
  assert.equal(
    (
      await a.flow.post("/api/auth/request-password-reset", {
        email: a.email,
        redirectTo: "https://attacker.invalid",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await a.flow.post("/api/auth/request-password-reset", {
        email: a.email,
        redirectTo: origin + "/reset-password",
      })
    ).status,
    200,
  );
  const m = await localMail(a.email, "Reset your ActionFlow password"),
    link = m.text.match(/https?:\/\/\S+/)?.[0];
  assert.ok(link);
  const response = await fetch(link, { redirect: "manual" });
  const token = new URL(
    response.headers.get("location")!,
    origin,
  ).searchParams.get("token");
  assert.ok(token);
  const newPassword = `New-${randomUUID()}!`;
  assert.equal(
    (await a.flow.post("/api/auth/reset-password", { token, newPassword }))
      .status,
    200,
  );
  assert.equal(
    await (
      await fetch(origin + "/api/auth/get-session", {
        headers: { Cookie: oldCookie },
      })
    ).json(),
    null,
  );
  assert.notEqual(
    (
      await a.flow.post("/api/auth/reset-password", {
        token,
        newPassword: a.password,
      })
    ).status,
    200,
  );
  assert.notEqual(
    (
      await a.flow.post("/api/auth/reset-password", {
        token: "expired",
        newPassword,
      })
    ).status,
    200,
  );

  const expired = await verified();
  assert.equal(
    (
      await expired.flow.post("/api/auth/request-password-reset", {
        email: expired.email,
        redirectTo: origin + "/reset-password",
      })
    ).status,
    200,
  );
  const expiredMail = await localMail(
      expired.email,
      "Reset your ActionFlow password",
    ),
    expiredLink = expiredMail.text.match(/https?:\/\/\S+/)?.[0];
  assert.ok(expiredLink);
  const expiredToken = new URL(expiredLink).pathname.split("/").at(-1)!;
  const record = await db
    .collection("verification")
    .findOne({ identifier: "reset-password:" + expiredToken });
  assert.ok(record);
  await db
    .collection("verification")
    .updateOne({ _id: record._id }, { $set: { expiresAt: new Date(0) } });
  assert.notEqual(
    (
      await expired.flow.post("/api/auth/reset-password", {
        token: expiredToken,
        newPassword,
      })
    ).status,
    200,
  );
});
test("unknown and unfinished signups receive no reset email or token, including legacy pending-account links", async () => {
  const pending = await signup();
  const unknownEmail = randomUUID() + "@example.test";
  const user = await db.collection("user").findOne({ email: pending.email });
  assert.ok(user);
  const before = await db
    .collection("verification")
    .countDocuments({ identifier: { $regex: "^reset-password:" } });
  for (const email of [unknownEmail, pending.email]) {
    const r = await pending.flow.post("/api/auth/request-password-reset", {
      email,
      redirectTo: origin + "/reset-password",
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), {
      status: true,
      message:
        "If this address belongs to a verified account, we’ll email a reset link. If you haven’t verified your email, finish signup first.",
    });
  }
  assert.equal(
    await db.collection("user").countDocuments({ email: unknownEmail }),
    0,
  );
  assert.equal(
    await db
      .collection("verification")
      .countDocuments({ identifier: { $regex: "^reset-password:" } }),
    before,
  );
  for (const file of (await readdir(".local-mail")).filter((f) =>
    f.endsWith(".json"),
  )) {
    const m = JSON.parse(await readFile(".local-mail/" + file, "utf8"));
    assert.ok(
      !(
        [unknownEmail, pending.email].includes(m.to) &&
        m.subject === "Reset your ActionFlow password"
      ),
    );
  }
  const token = randomUUID();
  await db
    .collection("verification")
    .insertOne({
      identifier: "reset-password:" + token,
      value: String(user._id),
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  assert.notEqual(
    (
      await pending.flow.post("/api/auth/reset-password", {
        token,
        newPassword: "Do-not-apply-this-password!",
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.collection("user").findOne({ email: pending.email }))
      ?.emailVerified,
    false,
  );
});
test("Google missing configuration and invalid callback state fail safely", async () => {
  const flow = new AuthFlow();
  const social = await flow.post("/api/auth/sign-in/social", {
    provider: "google",
    callbackURL: origin + "/dashboard",
  });
  assert.notEqual(social.status, 200);
  const callback = await fetch(
    origin + "/api/auth/callback/google?code=invalid&state=invalid",
    { redirect: "manual" },
  );
  assert.ok(callback.status >= 300);
  assert.equal(await flow.session(), null);
});

test("second-factor OTP is hashed, expires and locks after five failed codes", async () => {
  const a = await verified();
  assert.equal(
    (
      await a.flow.post("/api/auth/sign-in/email", {
        email: a.email,
        password: a.password,
      })
    ).status,
    200,
  );
  assert.equal(
    (await a.flow.post("/api/auth/two-factor/send-otp", {})).status,
    200,
  );
  const code = mailCode(
    await localMail(a.email, "Your ActionFlow sign-in code"),
  );
  const pendingCookie = a.flow.cookie;
  const key = decodeURIComponent(
    a.flow.jar.get("better-auth.two_factor")!,
  ).split(".")[0];
  const row = await db
    .collection("verification")
    .findOne({ identifier: "2fa-otp-" + key });
  assert.ok(row);
  assert.ok(!String(row.value).includes(code));
  for (let i = 0; i < 5; i++) {
    a.flow.ip = "198.51.100." + (i + 1);
    assert.notEqual(
      (
        await a.flow.post("/api/auth/two-factor/verify-otp", {
          code: code === "000000" ? "111111" : "000000",
        })
      ).status,
      200,
    );
  }
  a.flow.ip = "198.51.100.99";
  assert.notEqual(
    (await a.flow.post("/api/auth/two-factor/verify-otp", { code })).status,
    200,
  );
  assert.equal(await a.flow.session(), null);
  const e = await verified();
  await e.flow.post("/api/auth/sign-in/email", {
    email: e.email,
    password: e.password,
  });
  await e.flow.post("/api/auth/two-factor/send-otp", {});
  const expired = mailCode(
    await localMail(e.email, "Your ActionFlow sign-in code"),
  );
  const ekey = decodeURIComponent(
    e.flow.jar.get("better-auth.two_factor")!,
  ).split(".")[0];
  await db
    .collection("verification")
    .updateMany(
      { identifier: { $in: [ekey, "2fa-otp-" + ekey] } },
      { $set: { expiresAt: new Date(0) } },
    );
  assert.notEqual(
    (await e.flow.post("/api/auth/two-factor/verify-otp", { code: expired }))
      .status,
    200,
  );
  assert.equal(await e.flow.session(), null);
  assert.ok(pendingCookie);
});

test("migration preserves users/domain data and compatible sessions while expiring legacy password-only sessions", async () => {
  const a = await verified();
  await login(a.flow, a.email, a.password);
  const session = await a.flow.session(),
    owner = session.user.id;
  const id = randomUUID();
  await db
    .collection<{ _id: string; [key: string]: unknown }>("session")
    .insertOne({
      _id: randomUUID(),
      token: randomUUID(),
      userId: owner,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  const task = {
    _id: id,
    user_id: owner,
    title: "Preserved migration task",
    description: null,
    priority: "high",
    status: "todo",
    due_at: null,
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
  await db
    .collection<{ _id: string; [key: string]: unknown }>("tasks")
    .insertOne(task);
  const { up } = await import("../migrations/006-auth-security.mjs");
  await up(db);
  assert.equal((await a.flow.session()).user.id, owner);
  assert.ok(
    await db.collection("tasks").findOne({ _id: id as never, user_id: owner }),
  );
  assert.equal(
    await db.collection("session").countDocuments({
      userId: owner,
      authPolicyVersion: { $ne: 2 },
      expiresAt: { $gt: new Date() },
    }),
    0,
  );
});

test("resend cooldown is atomic and the latest rotated verification code remains usable", async () => {
  const a = await signup();
  await localMail(a.email, "Verify your ActionFlow email");
  const id =
    "verification-send:" + createHash("sha256").update(a.email).digest("hex");
  await db
    .collection("authCooldowns")
    .updateOne({ _id: id as never }, { $set: { until: new Date(0) } });
  const replies = await Promise.all(
    [1, 2, 3].map(() =>
      a.flow.post("/api/auth/email-otp/send-verification-otp", {
        email: a.email,
        type: "email-verification",
      }),
    ),
  );
  assert.equal(replies.filter((r) => r.status === 200).length, 1);
  assert.ok(replies.filter((r) => r.status === 429).length >= 1);
  const latest = mailCode(
    await localMail(a.email, "Verify your ActionFlow email"),
  );
  assert.equal(
    (
      await a.flow.post("/api/auth/email-otp/verify-email", {
        email: a.email,
        otp: latest,
      })
    ).status,
    200,
  );
});
