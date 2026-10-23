import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import {
  sendMail,
  sendAuthMail,
  withMailDelivery,
  smtpOptions,
} from "../src/lib/auth/mail";
import {
  otpMail,
  resetMail,
  emailTemplate,
} from "../src/lib/auth/email-templates";
test("central email transport requires provider acceptance, uses TLS and preserves failure through swallowed plugin callbacks", async () => {
  const original = nodemailer.createTransport;
  const names = [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "MAIL_FROM",
    ],
    saved = names.map((n) => process.env[n]);
  for (const [key, value] of Object.entries({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_USER: "test@example.test",
    SMTP_PASSWORD: "not-a-real-secret",
    MAIL_FROM: "test@example.test",
  }))
    process.env[key] = value;
  try {
    assert.equal(smtpOptions().requireTLS, true);
    assert.equal(smtpOptions().secure, false);
    process.env.SMTP_PORT = "465";
    assert.equal(smtpOptions().secure, true);
    process.env.SMTP_PORT = "587";
    nodemailer.createTransport = (() => ({
      sendMail: async () => ({ accepted: ["test@example.test"], rejected: [] }),
    })) as unknown as typeof original;
    assert.equal(
      (await sendMail("test@example.test", "Test", "Body")).accepted,
      true,
    );
    nodemailer.createTransport = (() => ({
      sendMail: async () => ({ accepted: [], rejected: ["test@example.test"] }),
    })) as unknown as typeof original;
    await assert.rejects(
      () => sendMail("test@example.test", "Test", "Body"),
      /did not confirm/,
    );
    await assert.rejects(
      () =>
        withMailDelivery(async () => {
          await sendAuthMail(
            "test@example.test",
            "Test",
            "Body",
            "<p>Body</p>",
          ).catch(() => {});
          return true;
        }),
      /delivery failed/,
    );
    nodemailer.createTransport = (() => ({
      sendMail: async () => {
        throw Object.assign(new Error("private transport error"), {
          code: "ETIMEDOUT",
        });
      },
    })) as unknown as typeof original;
    await assert.rejects(
      () => sendMail("test@example.test", "Test", "Body"),
      (e: unknown) => {
        assert.equal((e as { code?: string }).code, "ETIMEDOUT");
        assert.ok(!(e as Error).message.includes("private transport error"));
        return true;
      },
    );
  } finally {
    nodemailer.createTransport = original;
    names.forEach((n, i) => {
      if (saved[i] === undefined) delete process.env[n];
      else process.env[n] = saved[i];
    });
  }
});
test("email templates contain text and HTML, clear expiry and escaped untrusted content", () => {
  const otp = otpMail("registration", "012345");
  assert.match(otp.text, /012345/);
  assert.match(otp.html, /5 minutes/);
  assert.match(
    resetMail("https://example.test/reset-password?token=test").text,
    /30 minutes/,
  );
  const html = emailTemplate("<script>", "<&evil>", "123456");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});
