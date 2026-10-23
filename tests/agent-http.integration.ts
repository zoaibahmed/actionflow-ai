import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { verified, login as secureLogin } from "./helpers/auth-flow";
import { MongoClient } from "mongodb";

test("agent HTTP routes enforce sessions/origins, hold edits, commit only approval and isolate history", async () => {
  assert.ok(
    process.env.MONGODB_URI?.startsWith("mongodb://127.0.0.1:"),
    "Disposable database only",
  );
  assert.match(process.env.MONGODB_DB ?? "", /^actionflow_ai_(agent|auth_e)_/);
  const base = process.env.BETTER_AUTH_URL!;
  assert.equal(new URL(base).port, "3001");
  const post = (path: string, body: unknown, cookie = "", origin = base) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  assert.equal((await post("/api/agent", { action: "list" })).status, 401);
  const account = await verified();
  const email = account.email;
  await secureLogin(account.flow, account.email, account.password);
  const cookie = account.flow.cookie;
  assert.equal(
    (
      await post(
        "/api/agent",
        { action: "list" },
        cookie,
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (await post("/api/agent", { action: "list", user_id: "other" }, cookie))
      .status,
    400,
  );
  const body = {
    action: "message",
    conversationId: null,
    requestId: randomUUID(),
    text: "Create an undated task to study AI",
    timezone: "Asia/Karachi",
  };
  const draftResponse = await post("/api/agent", body, cookie);
  assert.equal(draftResponse.status, 200);
  const c = await draftResponse.json();
  assert.equal(c.actions.length, 1);
  const client = new MongoClient(process.env.MONGODB_URI!);
  try {
    const db = client.db(process.env.MONGODB_DB);
    const user = await db.collection("user").findOne({ email });
    assert.ok(user);
    const owner = String(user._id);
    assert.equal(
      await db.collection("tasks").countDocuments({ user_id: owner }),
      0,
    );
    const a = c.actions[0],
      approval = {
        action: "approve",
        id: a.id,
        revision: a.revision,
        hash: a.hash,
        confirmDates: true,
        secondConfirmation: null,
      };
    assert.equal(
      (
        await post(
          "/api/agent",
          { ...approval, payload: { kind: "task_delete" } },
          cookie,
        )
      ).status,
      400,
    );
    const replay = await post("/api/agent", body, cookie);
    assert.equal((await replay.json()).id, c.id);
    assert.equal(
      (
        await post(
          "/api/agent",
          { action: "load", conversationId: randomUUID() },
          cookie,
        )
      ).status,
      404,
    );
    assert.equal((await post("/api/agent", approval, cookie)).status, 200);
    const retry = await post("/api/agent", approval, cookie);
    assert.equal((await retry.json()).duplicate, true);
    assert.equal(
      await db.collection("tasks").countDocuments({ user_id: owner }),
      1,
    );
    const list = await post("/api/agent", { action: "list" }, cookie);
    assert.equal((await list.json()).conversations.length, 1);
    assert.equal(
      (
        await post(
          "/api/agent",
          { action: "delete_conversation", conversationId: c.id },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "/api/agent",
          { action: "load", conversationId: c.id },
          cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      await db.collection("tasks").countDocuments({ user_id: owner }),
      1,
    );
  } finally {
    await client.close();
  }
});
