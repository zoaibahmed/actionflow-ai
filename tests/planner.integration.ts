import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { loadEnvConfig } from "@next/env";
import { taskRepository } from "../src/lib/tasks/repository";
import { defaults, type PlanInput } from "../src/lib/planner/schema";
import {
  savePlan,
  getPlan,
  savePreferences,
  getPreferences,
  taskSnapshot,
  plannerQuota,
} from "../src/lib/planner/repository";
loadEnvConfig(process.cwd());
test("saved plans enforce owner, atomic approval, CAS, idempotency, stale tasks, preference versions and quota", async () => {
  assert.match(
    process.env.MONGODB_URI || "",
    /^mongodb:\/\/127\.0\.0\.1:/,
    "Isolated Mongo replica set only",
  );
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB!);
  const owner = `planner-${randomUUID()}`,
    other = `planner-${randomUUID()}`;
  try {
    const repo = taskRepository(db, owner),
      t = await repo.create({
        title: "Plan real work",
        description: null,
        priority: "high",
        status: "todo",
        due_at: "2026-10-21T12:00:00Z",
      });
    const input: PlanInput = {
      date: "2026-10-20",
      preferences: { ...defaults, timezone: "Asia/Karachi" },
      commitments: [],
      taskIds: [t.id],
      version: 0,
      blocks: [
        {
          taskId: t.id,
          start: "09:00",
          end: "09:30",
          duration: 30,
          notes: "Approved",
        },
      ],
      unscheduled: [],
      notes: "",
      requestId: randomUUID(),
      taskSnapshot: taskSnapshot([t]),
    };
    assert.equal(await getPlan(db, other, input.date), null);
    await assert.rejects(savePlan(db, client, other, input));
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => savePlan(db, client, owner, input)),
    );
    assert.ok(results.some((r) => r.status === "fulfilled"));
    const first = await savePlan(db, client, owner, input);
    assert.equal(first.version, 1);
    assert.equal(
      await db.collection("dailyPlans").countDocuments({ user_id: owner }),
      1,
    );
    assert.equal((await repo.findById(t.id))?.due_at, t.due_at);
    assert.equal(
      (await getPlan(db, owner, input.date))?.intervals[0].start_at,
      "2026-10-20T04:00:00.000Z",
    );
    await assert.rejects(
      savePlan(db, client, owner, { ...input, notes: "Changed body" }),
      /identifier/,
    );
    await assert.rejects(
      savePlan(db, client, owner, { ...input, requestId: randomUUID() }),
      /another tab/,
    );
    const next = {
      ...input,
      version: 1,
      requestId: randomUUID(),
      notes: "Reviewed again",
    };
    const competing = await Promise.allSettled([
      savePlan(db, client, owner, next),
      savePlan(db, client, owner, {
        ...next,
        requestId: randomUUID(),
        notes: "Other tab",
      }),
    ]);
    assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await getPlan(db, owner, input.date))?.version, 2);
    await assert.rejects(savePlan(db, client, owner, input), /since changed/);
    // Same UTC interval, different local date / timezone: reject cross-date collisions.
    const cross = {
      ...input,
      date: "2026-10-19",
      preferences: {
        ...defaults,
        timezone: "Pacific/Honolulu",
        start: "17:00",
        end: "23:00",
      },
      blocks: [{ ...input.blocks[0], start: "18:00", end: "18:30" }],
      requestId: randomUUID(),
    };
    await assert.rejects(
      savePlan(db, client, owner, cross),
      /another saved plan/,
    );
    await repo.update(t.id, {
      title: "Changed task",
      description: null,
      priority: "high",
      status: "todo",
      due_at: t.due_at,
    });
    await assert.rejects(
      savePlan(db, client, owner, {
        ...next,
        version: 2,
        requestId: randomUUID(),
      }),
      /tasks changed/,
    );
    assert.equal(
      await savePreferences(
        db,
        owner,
        { ...defaults, estimates: [{ taskId: t.id, minutes: 45 }] },
        0,
      ),
      1,
    );
    assert.equal(
      (await getPreferences(db, owner)).preferences.estimates[0].minutes,
      45,
    );
    assert.equal((await getPreferences(db, other)).exists, false);
    await assert.rejects(
      savePreferences(db, owner, defaults, 0),
      /another tab/,
    );
    await assert.rejects(
      savePreferences(
        db,
        other,
        { ...defaults, estimates: [{ taskId: t.id, minutes: 30 }] },
        0,
      ),
      /unavailable/,
    );
    process.env.PLANNER_DAILY_LIMIT = "2";
    await plannerQuota(db, owner);
    await plannerQuota(db, owner);
    await assert.rejects(plannerQuota(db, owner), /daily planning/);
    await assert.rejects(plannerQuota(db, owner), /wait a minute/);
    // Transaction failure must not advance a plan or leave a receipt.
    const currentTask = (await repo.findById(t.id))!;
    await db.command({
      collMod: "plannerReceipts",
      validator: { $expr: { $eq: [1, 0] } },
      validationLevel: "strict",
      validationAction: "error",
    });
    const failed = {
      ...next,
      version: 2,
      requestId: randomUUID(),
      taskSnapshot: taskSnapshot([currentTask]),
    };
    await assert.rejects(savePlan(db, client, owner, failed));
    assert.equal((await getPlan(db, owner, input.date))?.version, 2);
    await db.command({ collMod: "plannerReceipts", validator: {} });
    assert.equal((await savePlan(db, client, owner, failed)).version, 3);
  } finally {
    delete process.env.PLANNER_DAILY_LIMIT;
    await db
      .command({ collMod: "plannerReceipts", validator: {} })
      .catch(() => {});
    await client.close();
  }
});
