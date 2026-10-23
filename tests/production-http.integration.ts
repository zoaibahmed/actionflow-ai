import test from "node:test";
import assert from "node:assert/strict";
const origin = process.env.BETTER_AUTH_URL || "http://localhost:3001";
assert.ok(
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin),
  "Local test origin only",
);
test("liveness is minimal, uncached and protected by browser headers", async () => {
  const r = await fetch(origin + "/api/health");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: "ok" });
  assert.match(r.headers.get("cache-control") || "", /no-store/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.equal(r.headers.get("x-powered-by"), null);
});
test("worker rejects missing and unequal-byte tokens without throwing", async () => {
  for (const token of [
    "",
    "x".repeat(64),
    "é".repeat((process.env.REMINDER_WORKER_SECRET || "").length),
  ]) {
    // HTTP header encodings differ across runtimes; Latin-1 is intentionally valid here.
    const r = await fetch(origin + "/api/reminders/worker", {
      method: "POST",
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    assert.equal(r.status, 401);
  }
});
