import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { loadEnvConfig } from "@next/env";
import { taskRepository } from "../src/lib/tasks/repository";
import {
  ownerTransaction,
  reconcileTask,
  saveReminderList,
  notificationAction,
  saveSeries,
  reminderVersion,
} from "../src/lib/reminders/repository";
import { saveTaskWithReminders } from "../src/lib/reminders/task-save";
import { processReminders, backoff } from "../src/lib/reminders/processor";
import {
  generateOccurrences,
  changeSeriesStatus,
} from "../src/lib/reminders/recurrence";
import {
  allowedPushEndpoint,
  sendReminderEmail,
} from "../src/lib/reminders/delivery";
import {
  notificationDefaults,
  type ReminderSpec,
  type ReminderDoc,
  type NotificationDoc,
  type DeliveryDoc,
  type SubscriptionDoc,
  type SeriesInput,
  type OccurrenceDoc,
} from "../src/lib/reminders/schema";
loadEnvConfig(process.cwd());
test("durable reminder lifecycle: approval, ownership, rescheduling, concurrent workers, read state, snooze and cancellation", async () => {
  assert.match(
    process.env.MONGODB_URI || "",
    /^mongodb:\/\/127\.0\.0\.1:/,
    "Isolated replica set only",
  );
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB!);
  const owner = new ObjectId().toHexString(),
    other = randomUUID(),
    repo = taskRepository(db, owner),
    base = new Date(Date.now() + 120000);
  const spec = (
    channels = { inApp: true, push: false, email: false },
  ): ReminderSpec => ({
    id: randomUUID(),
    version: 0,
    kind: "custom",
    offset: 0,
    at: base.toISOString(),
    timezone: "UTC",
    channels,
    acknowledgePast: false,
  });
  const providers = {
    email: async () => {
      throw new Error("Unexpected email");
    },
    push: async () => {
      throw new Error("Unexpected push");
    },
  };
  try {
    const item = spec(),
      requestId = randomUUID(),
      input = {
        title: "Real reminder task",
        description: null,
        priority: "medium" as const,
        status: "todo" as const,
        due_at: new Date(base.getTime() + 86400000).toISOString(),
      };
    const task = await saveTaskWithReminders(db, client, owner, null, input, {
      requestId,
      reminders: [item],
      reminderVersion: 0,
    });
    assert.equal(
      (
        await saveTaskWithReminders(db, client, owner, null, input, {
          requestId,
          reminders: [item],
          reminderVersion: 0,
        })
      ).id,
      task.id,
    );
    assert.equal(
      await db.collection("tasks").countDocuments({ user_id: owner }),
      1,
    );
    await assert.rejects(
      saveReminderList(db, client, other, task.id, []),
      /unavailable/,
    );
    await assert.rejects(
      saveReminderList(db, client, owner, task.id, [spec()], 0),
      /changed/,
    );
    const r = await db
      .collection<ReminderDoc>("reminders")
      .findOne({ _id: item.id });
    assert.equal(r?.revision, 1);
    const edited = {
      ...item,
      version: 1,
      at: new Date(base.getTime() + 1000).toISOString(),
    };
    await saveReminderList(
      db,
      client,
      owner,
      task.id,
      [edited],
      await reminderVersion(db, owner, task.id),
    );
    assert.equal(
      (await db.collection<ReminderDoc>("reminders").findOne({ _id: item.id }))
        ?.revision,
      2,
    );
    const at = new Date(base.getTime() + 2000);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        processReminders(db, client, providers, { now: at, recurrence: false }),
      ),
    );
    assert.equal(
      await db.collection("notifications").countDocuments({ user_id: owner }),
      1,
    );
    const n = (await db
      .collection<NotificationDoc>("notifications")
      .findOne({ user_id: owner }))!;
    await assert.rejects(
      notificationAction(db, client, other, n._id, "read", 1, randomUUID()),
      /unavailable/,
    );
    await notificationAction(db, client, owner, n._id, "read", 1, randomUUID());
    await notificationAction(
      db,
      client,
      owner,
      n._id,
      "unread",
      2,
      randomUUID(),
    );
    assert.equal(
      (
        await db
          .collection<NotificationDoc>("notifications")
          .findOne({ _id: n._id })
      )?.readAt,
      null,
    );
    const snooze = randomUUID();
    await notificationAction(db, client, owner, n._id, "snooze", 3, snooze, 15);
    await notificationAction(db, client, owner, n._id, "snooze", 3, snooze, 15);
    assert.equal(
      await db
        .collection("reminders")
        .countDocuments({ user_id: owner, task_id: task.id }),
      2,
    );
    await assert.rejects(
      notificationAction(db, client, owner, n._id, "read", 1, randomUUID()),
      /changed/,
    );
    await ownerTransaction(db, client, owner, async (s) => {
      const done = await repo.complete(task.id, true, s);
      await reconcileTask(db, owner, done, task.id, s);
    });
    assert.equal(
      await db
        .collection("reminders")
        .countDocuments({ user_id: owner, status: "pending" }),
      0,
    );
    assert.equal(
      await db.collection("notifications").countDocuments({ user_id: owner }),
      1,
    );
    const task2 = await repo.create({ ...input, title: "Relative reminders" });
    const relative = { ...spec(), kind: "due" as const, at: null, offset: 15 };
    await saveReminderList(db, client, owner, task2.id, [relative]);
    const newDue = new Date(base.getTime() + 172800000).toISOString();
    await ownerTransaction(db, client, owner, async (s) => {
      const changed = await repo.update(
        task2.id,
        { ...input, due_at: newDue },
        s,
      );
      await reconcileTask(db, owner, changed, task2.id, s);
    });
    assert.equal(
      (
        await db
          .collection<ReminderDoc>("reminders")
          .findOne({ _id: relative.id })
      )?.scheduledAt.toISOString(),
      new Date(Date.parse(newDue) - 900000).toISOString(),
    );
    await ownerTransaction(db, client, owner, async (s) => {
      const changed = await repo.update(
        task2.id,
        { ...input, due_at: "2020-01-01T00:00:00Z" },
        s,
      );
      await reconcileTask(db, owner, changed, task2.id, s);
    });
    assert.equal(
      (
        await db
          .collection<ReminderDoc>("reminders")
          .findOne({ _id: relative.id })
      )?.status,
      "cancelled",
    );
    const task3 = await repo.create(input),
      crash = spec();
    await saveReminderList(db, client, owner, task3.id, [crash]);
    await db.collection<ReminderDoc>("reminders").updateOne(
      { _id: crash.id },
      {
        $set: {
          status: "processing",
          leaseToken: "crashed",
          leaseUntil: new Date(at.getTime() - 1),
        },
      },
    );
    await processReminders(db, client, providers, {
      now: at,
      recurrence: false,
    });
    assert.ok(
      await db
        .collection<NotificationDoc>("notifications")
        .findOne({ reminder_id: crash.id }),
    );
    const task4 = await repo.create(input),
      gone = spec();
    await saveReminderList(db, client, owner, task4.id, [gone]);
    await ownerTransaction(db, client, owner, async (s) => {
      await repo.delete(task4.id, s);
      await reconcileTask(db, owner, null, task4.id, s);
    });
    await processReminders(db, client, providers, {
      now: at,
      recurrence: false,
    });
    assert.equal(
      await db
        .collection("notifications")
        .countDocuments({ reminder_id: gone.id }),
      0,
    );
  } finally {
    await client.close();
  }
});
test("quiet hours defer actual jobs; per-channel retries, expired subscriptions and uncertain acceptance are honest", async () => {
  assert.match(process.env.MONGODB_URI || "", /^mongodb:\/\/127\.0\.0\.1:/);
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB!);
  const userId = new ObjectId(),
    owner = userId.toHexString(),
    repo = taskRepository(db, owner),
    base = new Date(Date.now() + 86400000);
  await db.collection("user").insertOne({
    _id: userId,
    email: `reminder-${owner}@example.test`,
    emailVerified: true,
  });
  await db
    .collection<{
      _id: string;
      value: typeof notificationDefaults;
      version: number;
    }>("notificationPreferences")
    .insertOne({
      _id: owner,
      value: { ...notificationDefaults, email: true, push: true },
      version: 1,
    });
  const spec: ReminderSpec = {
    id: randomUUID(),
    version: 0,
    kind: "custom",
    offset: 0,
    at: base.toISOString(),
    timezone: "UTC",
    channels: { inApp: true, email: true, push: true },
    acknowledgePast: false,
  };
  const task = await repo.create({
    title: "External channels",
    description: null,
    priority: "high",
    status: "todo",
    due_at: null,
  });
  await saveReminderList(db, client, owner, task.id, [spec]);
  const sub: SubscriptionDoc = {
    _id: randomUUID(),
    user_id: owner,
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    keys: { auth: "mock", p256dh: "mock" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.collection<SubscriptionDoc>("pushSubscriptions").insertOne(sub);
  let emails = 0,
    pushes = 0;
  try {
    const provider = {
      email: async () => {
        emails++;
        throw Object.assign(new Error("mock network"), { code: "ETIMEDOUT" });
      },
      push: async () => {
        pushes++;
        throw Object.assign(new Error("expired"), { statusCode: 410 });
      },
    };
    for (let i = 0; i < 6; i++)
      await processReminders(db, client, provider, {
        now: new Date(base.getTime() + i * 3600001),
        recurrence: false,
      });
    assert.equal(emails, 5);
    assert.equal(pushes, 1);
    assert.equal(
      await db.collection("notifications").countDocuments({ user_id: owner }),
      1,
    );
    assert.equal(
      await db
        .collection("pushSubscriptions")
        .countDocuments({ user_id: owner }),
      0,
    );
    const jobs = await db
      .collection<DeliveryDoc>("notificationOutbox")
      .find({ user_id: owner })
      .toArray();
    assert.equal(jobs.find((j) => j.channel === "email")?.status, "uncertain");
    assert.equal(jobs.find((j) => j.channel === "push")?.status, "failed");
    assert.equal(
      await db
        .collection("notificationAttempts")
        .countDocuments({ user_id: owner }),
      6,
    );
    assert.equal(backoff(1), 30000);
    assert.equal(backoff(5), 480000);
    assert.equal(allowedPushEndpoint("http://127.0.0.1/test"), false);
    assert.equal(
      allowedPushEndpoint("https://fcm.googleapis.com.evil.test"),
      false,
    );
    assert.equal(
      allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/test"),
      true,
    );
    const old = { ...process.env };
    delete process.env.SMTP_HOST;
    await assert.rejects(
      sendReminderEmail("none@example.test", task, "test", "UTC"),
      /unavailable/,
    );
    if (old.SMTP_HOST) process.env.SMTP_HOST = old.SMTP_HOST;
    // Quiet hour test uses an acknowledged synthetic time; no external provider is called.
    const qOwner = randomUUID(),
      qTask = await taskRepository(db, qOwner).create({
        title: "Quiet",
        description: null,
        priority: "low",
        status: "todo",
        due_at: null,
      });
    await db
      .collection<{
        _id: string;
        value: typeof notificationDefaults;
        version: number;
      }>("notificationPreferences")
      .insertOne({
        _id: qOwner,
        value: {
          ...notificationDefaults,
          timezone: "Asia/Karachi",
          quietEnabled: true,
        },
        version: 1,
      });
    const qSpec = {
      ...spec,
      id: randomUUID(),
      at: "2026-10-20T18:00:00.000Z",
      acknowledgePast: true,
      channels: { inApp: true, push: false, email: false },
    };
    await saveReminderList(db, client, qOwner, qTask.id, [qSpec]);
    await processReminders(
      db,
      client,
      { email: async () => {}, push: async () => {} },
      { now: new Date("2026-10-20T18:00Z"), recurrence: false },
    );
    assert.equal(
      await db.collection("notifications").countDocuments({ user_id: qOwner }),
      0,
    );
    assert.equal(
      (
        await db.collection<ReminderDoc>("reminders").findOne({ _id: qSpec.id })
      )?.nextAttemptAt.toISOString(),
      "2026-10-21T03:00:00.000Z",
    );
    await processReminders(
      db,
      client,
      { email: async () => {}, push: async () => {} },
      { now: new Date("2026-10-21T03:00Z"), recurrence: false },
    );
    assert.equal(
      await db.collection("notifications").countDocuments({ user_id: qOwner }),
      1,
    );
  } finally {
    await client.close();
  }
});
test("recurrence is bounded, deterministic, concurrency safe and preserves completed, edited and deleted occurrences", async () => {
  assert.match(process.env.MONGODB_URI || "", /^mongodb:\/\/127\.0\.0\.1:/);
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB!);
  const owner = randomUUID(),
    repo = taskRepository(db, owner),
    now = new Date(Date.now() + 3600000),
    date = now.toISOString().slice(0, 10),
    template = await repo.create({
      title: "Weekly ritual",
      description: null,
      priority: "medium",
      status: "todo",
      due_at: null,
    });
  const rule: SeriesInput = {
    id: randomUUID(),
    version: 0,
    templateTaskId: template.id,
    title: template.title,
    description: null,
    priority: "medium",
    frequency: "daily",
    interval: 1,
    start: date,
    end: null,
    time: "23:55",
    timezone: "UTC",
    reminderOffsets: [15],
    channels: { inApp: true, push: false, email: false },
    skipInvalidDates: true,
  };
  try {
    await saveSeries(db, client, owner, rule);
    await Promise.all([
      generateOccurrences(db, client, now),
      generateOccurrences(db, client, now),
    ]);
    const occurrences = await db
      .collection<OccurrenceDoc>("taskOccurrences")
      .find({ user_id: owner, series_id: rule.id })
      .sort({ date: 1 })
      .toArray();
    assert.ok(occurrences.length >= 14 && occurrences.length <= 15);
    assert.equal(
      new Set(occurrences.map((o) => o.task_id)).size,
      occurrences.length,
    );
    const [completed, edited, deleted] = occurrences;
    await ownerTransaction(db, client, owner, async (s) => {
      const t = await repo.complete(completed.task_id, true, s);
      await reconcileTask(db, owner, t, completed.task_id, s);
    });
    await ownerTransaction(db, client, owner, async (s) => {
      const t = await repo.update(
        edited.task_id,
        {
          title: "Personal edit",
          description: null,
          priority: "high",
          status: "todo",
          due_at: (await repo.findById(edited.task_id, s))!.due_at,
        },
        s,
      );
      await reconcileTask(db, owner, t, edited.task_id, s);
    });
    await ownerTransaction(db, client, owner, async (s) => {
      await repo.delete(deleted.task_id, s);
      await reconcileTask(db, owner, null, deleted.task_id, s);
    });
    await generateOccurrences(db, client, now);
    assert.equal(await repo.findById(deleted.task_id), null);
    await saveSeries(db, client, owner, {
      ...rule,
      version: 1,
      title: "Updated series",
    });
    await generateOccurrences(db, client, now);
    assert.equal((await repo.findById(completed.task_id))?.status, "done");
    assert.equal((await repo.findById(edited.task_id))?.title, "Personal edit");
    assert.equal(await repo.findById(deleted.task_id), null);
    await changeSeriesStatus(db, client, owner, rule.id, 2, "paused");
    assert.equal(
      await db
        .collection("reminders")
        .countDocuments({ user_id: owner, status: "pending" }),
      0,
    );
    await changeSeriesStatus(db, client, owner, rule.id, 3, "active");
    await changeSeriesStatus(db, client, owner, rule.id, 4, "ended");
    await generateOccurrences(db, client, now);
    assert.equal(
      (
        await db
          .collection("recurringSeries")
          .findOne({ _id: rule.id as never })
      )?.status,
      "ended",
    );
    assert.equal((await repo.findById(template.id))?.title, "Weekly ritual");
  } finally {
    await client.close();
  }
});
