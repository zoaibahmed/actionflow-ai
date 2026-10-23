import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { MongoClient } from "mongodb";
import { taskRepository } from "../src/lib/tasks/repository";
loadEnvConfig(process.cwd());
test("MongoDB enforces schema; repositories isolate owners and persist completion consistently", async () => {
  const client = new MongoClient(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 10000,
  });
  const db = client.db(process.env.MONGODB_DB || "actionflow_ai");
  const ownerA = `test-${randomUUID()}`,
    ownerB = `test-${randomUUID()}`;
  const a = taskRepository(db, ownerA),
    b = taskRepository(db, ownerB);
  const input = {
    title: "$literal-title",
    description: "$literal-description",
    priority: "high" as const,
    status: "todo" as const,
    due_at: new Date().toISOString(),
  };
  try {
    const created = await a.create(input);
    assert.equal(created.title, "$literal-title");
    assert.equal(created.description, "$literal-description");
    assert.equal(created.completed_at, null);
    assert.equal((await a.list()).length, 1);
    assert.equal((await b.list()).length, 0);
    assert.equal(
      await b.update(created.id, { ...input, title: "Stolen" }),
      null,
    );
    assert.equal(await b.complete(created.id, true), null);
    assert.equal(await b.delete(created.id), false);
    const completed = await a.complete(created.id, true);
    assert.ok(completed?.completed_at);
    assert.equal(completed?.status, "done");
    assert.equal(
      (await a.complete(created.id, true))?.completed_at,
      completed?.completed_at,
    );
    const reopened = await a.complete(created.id, false);
    assert.equal(reopened?.completed_at, null);
    assert.equal(reopened?.status, "todo");
    const edited = await a.update(created.id, {
      ...input,
      title: "Persisted edit",
      status: "in_progress",
    });
    assert.equal(edited?.title, "Persisted edit");
    assert.equal(
      (await taskRepository(db, ownerA).list())[0].status,
      "in_progress",
    );
    await assert.rejects(() =>
      db
        .collection("tasks")
        .updateOne(
          { _id: created.id as never },
          { $set: { title: "x".repeat(161) } },
        ),
    );
    await assert.rejects(() =>
      db
        .collection("tasks")
        .updateOne(
          { _id: created.id as never },
          { $set: { status: "done", completed_at: null } },
        ),
    );
    assert.equal(await a.delete(created.id), true);
    assert.equal((await a.list()).length, 0);
  } finally {
    // Only test-owned records are cleaned up. No user accounts or unrelated data are touched.
    await db
      .collection("tasks")
      .deleteMany({ user_id: { $in: [ownerA, ownerB] } });
    await client.close();
  }
});
