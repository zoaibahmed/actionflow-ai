import assert from "node:assert/strict";
import test from "node:test";
import {
  toolSchemas,
  requestSchema,
  dateInstant,
  rejectSecrets,
  redact,
} from "../src/lib/agent/schema";
test("agent tools are narrow, strict and reject authority and query injection", () => {
  assert.equal(Object.keys(toolSchemas).length, 22);
  assert.equal(
    toolSchemas.find_tasks.safeParse({
      query: null,
      scope: "all",
      priority: null,
      user_id: "other",
    }).success,
    false,
  );
  assert.equal(
    toolSchemas.find_tasks.safeParse({
      query: { $ne: "" },
      scope: "all",
      priority: null,
    }).success,
    false,
  );
  assert.equal(
    toolSchemas.propose_task_delete.safeParse({
      reference: "assignment",
      force: true,
    }).success,
    false,
  );
});
test("approval requests cannot substitute payloads or omit a bound revision", () => {
  const base = {
    action: "approve",
    id: crypto.randomUUID(),
    revision: 1,
    hash: "a".repeat(64),
    confirmDates: true,
    secondConfirmation: null,
  };
  assert.ok(requestSchema.safeParse(base).success);
  assert.equal(
    requestSchema.safeParse({ ...base, payload: { kind: "task_delete" } })
      .success,
    false,
  );
  assert.equal(
    requestSchema.safeParse({ ...base, revision: 0 }).success,
    false,
  );
});
test("agent local dates never assume server timezone or invent missing clocks", () => {
  assert.equal(
    dateInstant("2030-01-10", "17:00", "Asia/Karachi"),
    "2030-01-10T12:00:00.000Z",
  );
  assert.equal(dateInstant(null, null, "UTC"), null);
  assert.throws(() => dateInstant("2030-01-10", null, "UTC"));
  assert.throws(() => dateInstant("2030-03-10", "02:30", "America/New_York"));
  assert.throws(() => dateInstant("2030-11-03", "01:30", "America/New_York"));
});
test("obvious credentials are rejected before chat persistence and redacted from record context", () => {
  assert.throws(() => rejectSecrets("mongodb://private.example/secret"));
  assert.throws(() => rejectSecrets("api_key=abcdef123456"));
  assert.equal(redact("Keep this normal task"), "Keep this normal task");
  assert.ok(redact("sk-proj-" + "a".repeat(30)).includes("removed"));
});
