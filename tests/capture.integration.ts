import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { loadEnvConfig } from "@next/env";
import {
  consumeLimit,
  createCapture,
  saveApproved,
} from "../src/lib/capture/repository";
import { taskRepository } from "../src/lib/tasks/repository";
import type { ApprovalItem } from "../src/lib/capture/schema";
loadEnvConfig(process.cwd());
test("capture quotas are atomic; approvals are owned, transactional, retry-safe and handle partial failures", async () => {
  assert.match(
    process.env.MONGODB_URI || "",
    /^mongodb:\/\/127\.0\.0\.1:/,
    "Only run this integration test against the isolated replica set.",
  );
  const client = new MongoClient(process.env.MONGODB_URI!);
  const db = client.db(process.env.MONGODB_DB!);
  const owner = `capture-test-${randomUUID()}`,
    other = `capture-test-${randomUUID()}`;
  await client.connect();
  try {
    const key = `quota-test-${randomUUID()}`;
    const limits = await Promise.all(
      Array.from({ length: 30 }, () =>
        consumeLimit(db, key, 20, new Date(Date.now() + 60000)),
      ),
    );
    assert.equal(limits.filter((v) => v.allowed).length, 20);
    assert.equal(limits.filter((v) => !v.allowed).length, 10);
    const ids = [randomUUID(), randomUUID()];
    const capture = await createCapture(db, owner, ids);
    assert.equal(Object.keys(capture).includes("source"), false);
    const item = (id: string, title: string): ApprovalItem => ({
      suggestionId: id,
      title,
      description: null,
      priority: "medium",
      deadlineMode: "none",
      dueDate: null,
      dueTime: null,
      timezone: "Asia/Karachi",
    });
    await assert.rejects(
      saveApproved(db, client, other, capture._id, [item(ids[0], "Not mine")]),
    );
    await assert.rejects(
      saveApproved(db, client, owner, capture._id, [
        item(randomUUID(), "Not in capture"),
      ]),
    );
    const requests = await Promise.all(
      Array.from({ length: 5 }, () =>
        saveApproved(db, client, owner, capture._id, [
          item(ids[0], "Approved once"),
        ]),
      ),
    );
    assert.ok(requests.every((r) => r.saved.length === 1));
    assert.equal(
      await db
        .collection<{ _id: string; user_id: string }>("tasks")
        .countDocuments({ user_id: owner }),
      1,
    );
    assert.equal(requests[0].saved[0].task.user_id, owner);
    const changed = await saveApproved(db, client, owner, capture._id, [
      item(ids[0], "Changed after save"),
    ]);
    assert.equal(changed.errors.length, 1);
    assert.equal(
      await db
        .collection<{ _id: string; user_id: string }>("tasks")
        .countDocuments({ user_id: owner }),
      1,
    );
    // Exercise a genuine MongoDB validator failure on one item. This bypasses HTTP
    // validation intentionally, so the repository must still roll its receipt back.
    const partial = await saveApproved(db, client, owner, capture._id, [
      item(ids[0], "Approved once"),
      item(ids[1], " "),
    ]);
    assert.equal(partial.saved.length, 1);
    assert.equal(partial.errors.length, 1);
    assert.equal(
      await db.collection("captureReceipts").countDocuments({ user_id: owner }),
      1,
    );
    const retry = await saveApproved(db, client, owner, capture._id, [
      item(ids[0], "Approved once"),
      item(ids[1], "Recovered task"),
    ]);
    assert.equal(retry.saved.length, 2);
    assert.equal(
      await db
        .collection<{ _id: string; user_id: string }>("tasks")
        .countDocuments({ user_id: owner }),
      2,
    );
    assert.equal((await taskRepository(db, owner).list()).length, 2);
    assert.equal((await taskRepository(db, other).list()).length, 0);
    await taskRepository(db, owner).delete(ids[0]);
    const deletedRetry = await saveApproved(db, client, owner, capture._id, [
      item(ids[0], "Approved once"),
    ]);
    assert.equal(deletedRetry.errors.length, 1);
    assert.equal(
      await db
        .collection<{ _id: string; user_id: string }>("tasks")
        .countDocuments({ _id: ids[0] }),
      0,
    );
    await db
      .collection<{ _id: string; user_id: string; expiresAt: Date }>("captures")
      .updateOne({ _id: capture._id }, { $set: { expiresAt: new Date(0) } });
    await assert.rejects(
      saveApproved(db, client, owner, capture._id, [
        item(ids[1], "Recovered task"),
      ]),
    );
    await db
      .collection<{ _id: string }>("captureUsage")
      .deleteOne({ _id: key });
  } finally {
    await db
      .collection<{ _id: string; user_id: string }>("tasks")
      .deleteMany({ user_id: owner });
    await db
      .collection<{ _id: string; user_id: string; expiresAt: Date }>("captures")
      .deleteMany({ user_id: owner });
    await db.collection("captureReceipts").deleteMany({ user_id: owner });
    await client.close();
  }
});
