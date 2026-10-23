import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { AuthFlow, verified, login, origin } from "./helpers/auth-flow";
assert.match(process.env.MONGODB_URI ?? "", /^mongodb:\/\/127.0.0.1:/);
assert.match(process.env.MONGODB_DB ?? "", /^actionflow_ai_auth_e_f_/);
assert.ok(!process.env.SMTP_HOST);
const client = new MongoClient(process.env.MONGODB_URI!),
  db = client.db(process.env.MONGODB_DB);
let a: AuthFlow, b: AuthFlow, owner: string;
before(async () => {
  await client.connect();
  const first = await verified();
  a = first.flow;
  await login(a, first.email, first.password);
  const second = await verified();
  b = second.flow;
  await login(b, second.email, second.password);
  owner = (await a.session()).user.id;
});
after(() => client.close());
const post = (flow: AuthFlow, body: unknown) =>
  flow.post("/api/workspace", body);
let noteId: string, version: number;
test("workspace HTTP rejects unauthenticated, foreign-origin and malformed requests", async () => {
  assert.equal(
    (await post(new AuthFlow(), { action: "focus_state" })).status,
    401,
  );
  assert.equal(
    (
      await fetch(origin + "/api/workspace", {
        method: "POST",
        headers: { Origin: "https://invalid.example", Cookie: a.cookie },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (await post(a, { action: "search", query: { $ne: "" }, page: 0 })).status,
    400,
  );
  assert.equal(
    (await post(a, { action: "insights", days: 999, timezone: "UTC" })).status,
    400,
  );
  const raw = await fetch(origin + "/api/workspace", {
    method: "POST",
    headers: { Origin: origin, Cookie: a.cookie },
    body: "invalid",
  });
  assert.equal(raw.status, 400);
});
test("notes HTTP create, autosave, reload, pin and stale edit checks persist real MongoDB data", async () => {
  noteId = randomUUID();
  const input = {
    title: "HTTP note",
    content: "A real autosave",
    pinned: false,
    linkedTaskId: null,
  };
  let r = await post(a, { action: "note_save", id: noteId, version: 0, input });
  assert.equal(r.status, 200);
  version = (await r.json()).version;
  r = await post(a, {
    action: "note_save",
    id: noteId,
    version,
    input: { ...input, pinned: true },
  });
  assert.equal(r.status, 200);
  version = (await r.json()).version;
  assert.equal(
    (await (await post(a, { action: "note_read", id: noteId })).json()).content,
    input.content,
  );
  assert.equal(
    (await post(a, { action: "note_save", id: noteId, version: 1, input }))
      .status,
    409,
  );
  assert.equal(
    (await post(b, { action: "note_read", id: noteId })).status,
    409,
  );
  const rows = await (
    await post(b, {
      action: "notes",
      query: "HTTP",
      sort: "updatedAt",
      page: 0,
    })
  ).json();
  assert.equal(rows.notes.length, 0);
});
test("focus HTTP state recovers across requests and completion never duplicates", async () => {
  const id = randomUUID();
  let r = await post(a, {
    action: "focus_start",
    id,
    input: { minutes: 1, taskId: null },
  });
  assert.equal(r.status, 200);
  r = await post(a, { action: "focus_change", id, version: 1, mode: "pause" });
  assert.equal(r.status, 200);
  assert.equal(
    (await post(a, { action: "focus_change", id, version: 1, mode: "resume" }))
      .status,
    409,
  );
  assert.equal(
    (await (await post(a, { action: "focus_state" })).json()).active.status,
    "paused",
  );
  assert.equal(
    (await post(a, { action: "focus_change", id, version: 2, mode: "resume" }))
      .status,
    200,
  );
  assert.equal(
    (await post(b, { action: "focus_change", id, version: 3, mode: "cancel" }))
      .status,
    409,
  );
  await db
    .collection<{ _id: string; resumedAt: Date }>("focusSessions")
    .updateOne(
      { _id: id, user_id: owner },
      { $set: { resumedAt: new Date(Date.now() - 61000) } },
    );
  const state = await (await post(a, { action: "focus_state" })).json();
  assert.equal(state.active, null);
  assert.equal(state.totals.count, 1);
  assert.equal(
    (await (await post(a, { action: "focus_state" })).json()).totals.count,
    1,
  );
});
test("search and insights HTTP return scoped real records and note deletion is version-bound", async () => {
  const result = await (
    await post(a, { action: "search", query: "HTTP", page: 0 })
  ).json();
  assert.ok(result.results.some((r: { id: string }) => r.id === noteId));
  const insight = await post(a, {
    action: "insights",
    days: 7,
    timezone: "Asia/Karachi",
  });
  assert.equal(insight.status, 200);
  assert.equal((await insight.json()).focusWeekMinutes, 1);
  assert.equal(
    (await post(b, { action: "note_delete", id: noteId, version })).status,
    409,
  );
  assert.equal(
    (await post(a, { action: "note_delete", id: noteId, version })).status,
    200,
  );
  assert.equal(
    await db.collection("notes").countDocuments({ user_id: owner }),
    0,
  );
});
test("workspace rate limits persist server-side and reject excess requests", async () => {
  const key = `workspace:${owner}:${Math.floor(Date.now() / 60000)}`;
  await db
    .collection<{ _id: string; count: number }>("captureUsage")
    .updateOne({ _id: key }, { $set: { count: 100 } }, { upsert: true });
  assert.equal((await post(a, { action: "focus_state" })).status, 429);
});
