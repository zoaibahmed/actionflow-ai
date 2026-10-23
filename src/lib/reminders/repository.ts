import { createHash } from "node:crypto";
import { type Db, type ClientSession, type MongoClient } from "mongodb";
import type { Task } from "@/types/task";
import { taskRepository } from "../tasks/repository";
import { CaptureError } from "../capture/errors";
import {
  notificationDefaults,
  scheduledAt,
  type ReminderSpec,
  type ReminderDoc,
  type NotificationDoc,
  type NotificationPreferences,
  type SeriesInput,
  type SeriesDoc,
  type OccurrenceDoc,
  type DeliveryDoc,
} from "./schema";
export function stableId(value: string) {
  const b = createHash("sha256").update(value).digest().subarray(0, 16);
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function ownerTransaction<T>(
  db: Db,
  client: MongoClient,
  owner: string,
  action: (session: ClientSession) => Promise<T>,
) {
  return client.withSession((s) =>
    s.withTransaction(
      async () => {
        await db
          .collection<{ _id: string; tick: number }>("reminderLocks")
          .updateOne(
            { _id: owner },
            { $inc: { tick: 1 } },
            { upsert: true, session: s },
          );
        return action(s);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        timeoutMS: 30000,
      },
    ),
  );
}
export async function getNotificationPreferences(
  db: Db,
  owner: string,
  session?: ClientSession,
) {
  return (
    (await db
      .collection<{
        _id: string;
        value: NotificationPreferences;
        version: number;
      }>("notificationPreferences")
      .findOne({ _id: owner }, { session })) ?? {
      _id: owner,
      value: notificationDefaults,
      version: 0,
    }
  );
}
export async function reminderVersion(
  db: Db,
  owner: string,
  taskId: string,
  session?: ClientSession,
) {
  return (
    (
      await db
        .collection<{ _id: string; version: number }>("taskReminderVersions")
        .findOne({ _id: owner + ":" + taskId }, { session })
    )?.version ?? 0
  );
}
export async function bumpReminderVersion(
  db: Db,
  owner: string,
  taskId: string,
  session: ClientSession,
) {
  await db
    .collection<{ _id: string; version: number }>("taskReminderVersions")
    .updateOne(
      { _id: owner + ":" + taskId },
      { $inc: { version: 1 } },
      { upsert: true, session },
    );
}
export async function cancelReminders(
  db: Db,
  owner: string,
  taskId: string,
  reason: string,
  session: ClientSession,
) {
  await bumpReminderVersion(db, owner, taskId, session);
  await db.collection<ReminderDoc>("reminders").updateMany(
    {
      user_id: owner,
      task_id: taskId,
      status: { $in: ["pending", "processing"] },
    },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
        reason,
        leaseToken: null,
        leaseUntil: null,
      },
    },
    { session },
  );
  await db.collection<DeliveryDoc>("notificationOutbox").updateMany(
    {
      user_id: owner,
      task_id: taskId,
      status: { $in: ["pending", "processing"] },
    },
    {
      $set: {
        status: "cancelled",
        error: reason,
        leaseToken: null,
        leaseUntil: null,
      },
    },
    { session },
  );
}
function sameSpec(a: ReminderSpec, b: ReminderSpec) {
  return (
    JSON.stringify({ ...a, version: 0 }) ===
    JSON.stringify({ ...b, version: 0 })
  );
}
export async function putReminders(
  db: Db,
  owner: string,
  task: Task,
  specs: ReminderSpec[],
  session: ClientSession,
  now = new Date(),
) {
  if (task.status === "done" && specs.length)
    throw new CaptureError(
      "completed",
      "Reopen the task before scheduling a reminder.",
    );
  await bumpReminderVersion(db, owner, task.id, session);
  const col = db.collection<ReminderDoc>("reminders");
  const existing = await col
    .find(
      {
        user_id: owner,
        task_id: task.id,
        status: { $in: ["pending", "processing", "failed"] },
      },
      { session },
    )
    .toArray();
  for (const old of existing)
    if (!specs.some((s) => s.id === old._id)) {
      await col.updateOne(
        { _id: old._id, user_id: owner },
        {
          $set: {
            status: "cancelled",
            reason: "Removed by you",
            cancelledAt: now,
            updatedAt: now,
            leaseUntil: null,
            leaseToken: null,
          },
        },
        { session },
      );
      await db.collection<DeliveryDoc>("notificationOutbox").updateMany(
        {
          reminder_id: old._id,
          user_id: owner,
          status: { $in: ["pending", "processing"] },
        },
        {
          $set: {
            status: "cancelled",
            error: "Removed by you",
            leaseToken: null,
            leaseUntil: null,
          },
        },
        { session },
      );
    }
  for (const spec of specs) {
    const old = await col.findOne({ _id: spec.id }, { session });
    if (old && (old.user_id !== owner || old.task_id !== task.id))
      throw new CaptureError(
        "unavailable",
        "This reminder is unavailable.",
        404,
      );
    if (!old && spec.version !== 0)
      throw new CaptureError(
        "stale",
        "This reminder is unavailable. Reload before saving.",
        409,
      );
    if (old && old.revision !== spec.version)
      throw new CaptureError(
        "stale",
        "Reminders changed in another tab. Reload this task before saving.",
        409,
      );
    if (old && old.status !== "cancelled" && sameSpec(old.spec, spec)) continue;
    let at: Date;
    try {
      at = scheduledAt(spec, task.due_at, now);
    } catch (e) {
      throw new CaptureError(
        "time",
        e instanceof Error ? e.message : "Invalid reminder time.",
      );
    }
    const revision = (old?.revision ?? 0) + 1;
    const document: ReminderDoc = {
      _id: spec.id,
      user_id: owner,
      task_id: task.id,
      spec: { ...spec, version: revision },
      scheduledAt: at,
      nextAttemptAt: at,
      status: "pending",
      revision,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      sentAt: null,
      cancelledAt: null,
      reason: null,
      leaseUntil: null,
      leaseToken: null,
      attempts: 0,
      deferredFrom: null,
    };
    await col.replaceOne({ _id: spec.id }, document, { upsert: true, session });
    if (old)
      await db.collection<DeliveryDoc>("notificationOutbox").updateMany(
        {
          reminder_id: old._id,
          user_id: owner,
          status: { $in: ["pending", "processing"] },
        },
        {
          $set: {
            status: "cancelled",
            error: "Reminder was edited",
            leaseUntil: null,
            leaseToken: null,
          },
        },
        { session },
      );
  }
}
export async function reconcileTask(
  db: Db,
  owner: string,
  task: Task | null,
  taskId: string,
  session: ClientSession,
  markException = true,
) {
  const now = new Date();
  if (markException)
    await db
      .collection<OccurrenceDoc>("taskOccurrences")
      .updateOne(
        { task_id: taskId, user_id: owner },
        { $set: { exception: true, deleted: !task } },
        { session },
      );
  if (!task || task.status === "done") {
    await cancelReminders(
      db,
      owner,
      taskId,
      task ? "Task completed" : "Task deleted",
      session,
    );
    return;
  }
  const col = db.collection<ReminderDoc>("reminders");
  const reminders = await col
    .find(
      {
        user_id: owner,
        task_id: taskId,
        status: { $in: ["pending", "processing"] },
        "spec.kind": "due",
      },
      { session },
    )
    .toArray();
  for (const r of reminders) {
    const at = task.due_at
      ? new Date(new Date(task.due_at).getTime() - r.spec.offset * 60000)
      : null;
    if (at && at.getTime() === r.scheduledAt.getTime()) continue;
    await bumpReminderVersion(db, owner, taskId, session);
    await db.collection<DeliveryDoc>("notificationOutbox").updateMany(
      {
        reminder_id: r._id,
        user_id: owner,
        status: { $in: ["pending", "processing"] },
      },
      {
        $set: {
          status: "cancelled",
          error: "Task due date changed",
          leaseToken: null,
          leaseUntil: null,
        },
      },
      { session },
    );
    const valid = at && at > now;
    await col.updateOne(
      { _id: r._id, user_id: owner },
      {
        $set: {
          status: valid ? "pending" : "cancelled",
          scheduledAt: at ?? r.scheduledAt,
          nextAttemptAt: at ?? r.nextAttemptAt,
          reason: valid
            ? "Rescheduled after due date change"
            : "Due date removed or moved into the past; choose a new reminder",
          updatedAt: now,
          cancelledAt: valid ? null : now,
          leaseToken: null,
          leaseUntil: null,
          attempts: 0,
          "spec.version": r.revision + 1,
        },
        $inc: { revision: 1 },
      },
      { session },
    );
  }
}
export async function saveReminderList(
  db: Db,
  client: MongoClient,
  owner: string,
  taskId: string,
  specs: ReminderSpec[],
  expectedVersion = 0,
) {
  return ownerTransaction(db, client, owner, async (s) => {
    const task = await taskRepository(db, owner).findById(taskId, s);
    if (!task)
      throw new CaptureError(
        "task",
        "This task was deleted or is unavailable.",
        404,
      );
    if ((await reminderVersion(db, owner, taskId, s)) !== expectedVersion)
      throw new CaptureError(
        "stale",
        "Reminders changed. Reopen the task before saving.",
        409,
      );
    await putReminders(db, owner, task, specs, s);
    await db
      .collection<OccurrenceDoc>("taskOccurrences")
      .updateOne(
        { user_id: owner, task_id: taskId },
        { $set: { exception: true } },
        { session: s },
      );
    return task;
  });
}
export async function notificationAction(
  db: Db,
  client: MongoClient,
  owner: string,
  id: string,
  action: "read" | "unread" | "dismiss" | "snooze",
  version: number,
  requestId: string,
  minutes?: number,
  existingSession?: ClientSession,
) {
  const execute = async (session: ClientSession) => {
    const col = db.collection<NotificationDoc>("notifications"),
      n = await col.findOne({ _id: id, user_id: owner }, { session });
    if (!n)
      throw new CaptureError(
        "notification",
        "This notification is unavailable.",
        404,
      );
    if (action === "snooze") {
      const receipt = await db
        .collection<{
          _id: string;
          notification_id: string;
          minutes: number;
          reminder_id: string;
        }>("notificationReceipts")
        .findOne({ _id: `${owner}:${requestId}` }, { session });
      if (receipt) {
        if (receipt.notification_id !== id || receipt.minutes !== minutes)
          throw new CaptureError(
            "duplicate",
            "This snooze request was already used.",
            409,
          );
        return;
      }
    }
    if (n.version !== version)
      throw new CaptureError(
        "stale",
        "This notification changed. Refresh the stream and try again.",
        409,
      );
    const now = new Date();
    if (action === "snooze") {
      if (n.dismissedAt || n.snoozedAt)
        throw new CaptureError(
          "snoozed",
          "This notification was already dismissed or snoozed.",
          409,
        );
      const task = await taskRepository(db, owner).findById(n.task_id, session);
      if (!task || task.status === "done")
        throw new CaptureError(
          "task",
          "Only unfinished tasks can be snoozed.",
          409,
        );
      const active = await db
        .collection<ReminderDoc>("reminders")
        .countDocuments(
          {
            user_id: owner,
            task_id: task.id,
            status: { $in: ["pending", "processing"] },
          },
          { session },
        );
      if (active >= 5)
        throw new CaptureError(
          "limit",
          "This task already has five active reminders. Remove one before snoozing.",
        );
      const original = await db
        .collection<ReminderDoc>("reminders")
        .findOne({ _id: n.reminder_id, user_id: owner }, { session });
      const rid = stableId(`${owner}:snooze:${requestId}`),
        p = await getNotificationPreferences(db, owner, session);
      const spec: ReminderSpec = {
        id: rid,
        version: 0,
        kind: "custom",
        offset: 0,
        at: new Date(
          now.getTime() + (minutes ?? p.value.snoozeMinutes) * 60000,
        ).toISOString(),
        timezone: p.value.timezone,
        channels: original?.spec.channels ?? {
          inApp: true,
          push: false,
          email: false,
        },
        acknowledgePast: false,
      };
      await bumpReminderVersion(db, owner, task.id, session);
      const at = new Date(spec.at!);
      await db.collection<ReminderDoc>("reminders").insertOne(
        {
          _id: rid,
          user_id: owner,
          task_id: task.id,
          spec: { ...spec, version: 1 },
          scheduledAt: at,
          nextAttemptAt: at,
          status: "pending",
          revision: 1,
          createdAt: now,
          updatedAt: now,
          sentAt: null,
          cancelledAt: null,
          reason: "Snoozed by you",
          leaseUntil: null,
          leaseToken: null,
          attempts: 0,
          deferredFrom: null,
        },
        { session },
      );
      await db
        .collection<{
          _id: string;
          notification_id: string;
          minutes: number;
          reminder_id: string;
        }>("notificationReceipts")
        .insertOne(
          {
            _id: `${owner}:${requestId}`,
            notification_id: id,
            minutes: minutes ?? p.value.snoozeMinutes,
            reminder_id: rid,
          },
          { session },
        );
    }
    await col.updateOne(
      { _id: id, user_id: owner, version },
      {
        $set:
          action === "unread"
            ? { readAt: null }
            : action === "dismiss"
              ? { dismissedAt: now, readAt: now }
              : action === "snooze"
                ? { snoozedAt: now, readAt: now }
                : { readAt: now },
        $inc: { version: 1 },
      },
      { session },
    );
  };
  return existingSession
    ? execute(existingSession)
    : ownerTransaction(db, client, owner, execute);
}
export async function saveSeries(
  db: Db,
  client: MongoClient,
  owner: string,
  input: SeriesInput,
) {
  return ownerTransaction(db, client, owner, async (session) => {
    const repo = taskRepository(db, owner),
      template = await repo.findById(input.templateTaskId, session);
    const col = db.collection<SeriesDoc>("recurringSeries"),
      old = await col.findOne({ _id: input.id }, { session });
    if (
      !template &&
      (!old || old.input.templateTaskId !== input.templateTaskId)
    )
      throw new CaptureError("task", "The template task is unavailable.", 404);
    if (old && (old.user_id !== owner || old.version !== input.version))
      throw new CaptureError(
        "stale",
        "This series changed or is unavailable. Reload before saving.",
        409,
      );
    if (!old && input.version !== 0)
      throw new CaptureError("stale", "This series is unavailable.", 409);
    if (old?.status === "ended")
      throw new CaptureError(
        "ended",
        "An ended series cannot be edited. Create a new series instead.",
        409,
      );
    if (
      !old &&
      (await col.countDocuments(
        { user_id: owner, status: { $ne: "ended" } },
        { session },
      )) >= 50
    )
      throw new CaptureError(
        "limit",
        "Up to fifty active or paused series are supported.",
      );
    if (old) {
      // Explicit series edits replace only future, uncompleted, unedited copies.
      const occurrences = await db
        .collection<OccurrenceDoc>("taskOccurrences")
        .find(
          {
            user_id: owner,
            series_id: old._id,
            exception: false,
            deleted: false,
          },
          { session },
        )
        .toArray();
      for (const occurrence of occurrences) {
        const task = await repo.findById(occurrence.task_id, session);
        if (
          task &&
          task.status !== "done" &&
          task.due_at &&
          new Date(task.due_at) > new Date()
        ) {
          await cancelReminders(db, owner, task.id, "Series updated", session);
          await repo.delete(task.id, session);
          await db
            .collection<OccurrenceDoc>("taskOccurrences")
            .deleteOne({ _id: occurrence._id, user_id: owner }, { session });
        }
      }
    }
    const now = new Date();
    await col.replaceOne(
      { _id: input.id },
      {
        user_id: owner,
        input,
        status: old?.status ?? "active",
        version: (old?.version ?? 0) + 1,
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
        checkedThrough: null,
      },
      { upsert: true, session },
    );
  });
}
