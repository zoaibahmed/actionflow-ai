import test from "node:test";
import assert from "node:assert/strict";
import {
  noteInput,
  focusInput,
  focusElapsed,
  workspaceRequest,
  searchInput,
  insightInput,
} from "../src/lib/workspace/schema";
test("notes enforce bounded text and reject browser authority", () => {
  const n = {
    title: "Meeting",
    content: "<script>alert(1)</script>",
    pinned: false,
    linkedTaskId: null,
  };
  assert.ok(noteInput.safeParse(n).success);
  for (const x of [
    { ...n, title: " " },
    { ...n, content: "a".repeat(30001) },
    { ...n, user_id: "other" },
  ])
    assert.equal(noteInput.safeParse(x).success, false);
});
test("focus derives elapsed from timestamps, clamps background time and never counts pause twice", () => {
  const s = {
    elapsedMs: 3000,
    durationMs: 60000,
    resumedAt: new Date(10000),
    status: "running",
  };
  assert.equal(focusElapsed(s, 15000), 8000);
  assert.equal(focusElapsed(s, 100000), 60000);
  assert.equal(focusElapsed({ ...s, status: "paused" }, 500000), 3000);
  assert.equal(focusElapsed(s, 5000), 3000);
  for (const minutes of [0, 181, 1.5])
    assert.equal(
      focusInput.safeParse({ minutes, taskId: null }).success,
      false,
    );
});
test("workspace requests strictly validate identifiers, versions, ranges and literal search", () => {
  assert.equal(
    workspaceRequest.safeParse({
      action: "note_save",
      id: crypto.randomUUID(),
      version: -1,
      input: {},
    }).success,
    false,
  );
  for (const query of ["", { $ne: "" }, "a".repeat(101)])
    assert.equal(searchInput.safeParse({ query, page: 0 }).success, false);
  assert.ok(searchInput.safeParse({ query: ".*", page: 0 }).success);
  assert.equal(
    insightInput.safeParse({ days: 365, timezone: "UTC" }).success,
    false,
  );
  assert.equal(
    insightInput.safeParse({ days: 7, timezone: "Unknown/City" }).success,
    false,
  );
});
