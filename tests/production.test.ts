import test from "node:test";
import assert from "node:assert/strict";
import { productionConfiguration } from "../src/lib/production-config";
const valid = {
  MONGODB_URI: "mongodb://127.0.0.1/test",
  MONGODB_DB: "actionflow_ai",
  BETTER_AUTH_URL: "https://actionflow.example.com",
  BETTER_AUTH_SECRET: "x".repeat(48),
  OPENAI_API_KEY: "test",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "test@example.com",
  SMTP_PASSWORD: "example",
  MAIL_FROM: "test@example.com",
  REMINDER_WORKER_SECRET: "y".repeat(48),
};
test("production configuration fails closed without exposing secret values", () => {
  assert.equal(productionConfiguration(valid).errors.length, 0);
  const result = productionConfiguration({
    ...valid,
    BETTER_AUTH_URL: "http://public.example",
    SMTP_PORT: "25",
    BETTER_AUTH_SECRET: "private-test-value",
  });
  assert.ok(result.errors.length >= 3);
  assert.ok(!JSON.stringify(result).includes("private-test-value"));
  assert.ok(
    productionConfiguration({
      ...valid,
      OPENAI_BASE_URL: "http://127.0.0.1:1234",
    }).errors.some((e) => e.includes("OPENAI_BASE_URL")),
  );
});
test("production configuration requires paired providers and bounded quotas", () => {
  assert.ok(
    productionConfiguration({
      ...valid,
      GOOGLE_CLIENT_ID: "configured",
      AGENT_DAILY_LIMIT: "-1",
      VAPID_PUBLIC_KEY: "partial",
    }).errors.length >= 3,
  );
  assert.ok(
    productionConfiguration({
      ...valid,
      BETTER_AUTH_URL: "http://localhost:3000",
    }).warnings.some((w) => w.includes("Loopback")),
  );
});
