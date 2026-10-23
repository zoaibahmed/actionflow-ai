import { z } from "zod";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { captureAccess, captureFailure } from "@/lib/capture/http";
import { CaptureError } from "@/lib/capture/errors";
import { consumeLimit } from "@/lib/capture/repository";
import { getMongoClient } from "@/lib/db/mongo";
import { taskRepository } from "@/lib/tasks/repository";
import {
  reminderListSchema,
  notificationPreferencesSchema,
  seriesSchema,
  type ReminderDoc,
  type NotificationDoc,
  type DeliveryDoc,
  type SubscriptionDoc,
  type SeriesDoc,
} from "@/lib/reminders/schema";
import {
  getNotificationPreferences,
  reminderVersion,
  saveReminderList,
  notificationAction,
  saveSeries,
  ownerTransaction,
} from "@/lib/reminders/repository";
import { changeSeriesStatus } from "@/lib/reminders/recurrence";
import {
  deliveryConfiguration,
  allowedPushEndpoint,
} from "@/lib/reminders/delivery";
const id = z
  .string()
  .max(180)
  .regex(/^[a-zA-Z0-9:_-]+$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summary") }).strict(),
  z.object({ action: z.literal("configuration") }).strict(),
  z
    .object({
      action: z.literal("load"),
      cursor: z
        .object({ at: z.string().datetime(), id })
        .strict()
        .nullable()
        .optional(),
    })
    .strict(),
  z.object({ action: z.literal("task"), taskId: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("save"),
      taskId: z.string().uuid(),
      reminders: reminderListSchema,
      reminderVersion: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal("notification"),
      id,
      operation: z.enum(["read", "unread", "dismiss", "snooze"]),
      version: z.number().int().min(1),
      requestId: z.string().uuid(),
      minutes: z.number().int().min(1).max(1440).optional(),
    })
    .strict(),
  z.object({ action: z.literal("readAll") }).strict(),
  z
    .object({
      action: z.literal("preferences"),
      value: notificationPreferencesSchema,
      version: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal("subscribe"),
      subscription: z
        .object({
          endpoint: z.string().url().max(2048),
          keys: z
            .object({
              p256dh: z.string().regex(/^[\w-]{87}$/),
              auth: z.string().regex(/^[\w-]{22}$/),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("unsubscribe"),
      endpoint: z.string().url().max(2048),
    })
    .strict(),
  z.object({ action: z.literal("series"), value: seriesSchema }).strict(),
  z
    .object({
      action: z.literal("seriesStatus"),
      id: z.string().uuid(),
      version: z.number().int().min(1),
      status: z.enum(["active", "paused", "ended"]),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    const { owner, db } = await captureAccess(request);
    const minute = Math.floor(Date.now() / 60000);
    if (
      !(
        await consumeLimit(
          db,
          `reminders:http:${owner}:${minute}`,
          90,
          new Date(Date.now() + 120000),
        )
      ).allowed
    )
      throw new CaptureError(
        "rate",
        "Please wait a minute before trying again.",
        429,
      );
    const reader = request.body?.getReader();
    if (!reader) throw new CaptureError("input", "Provide reminder details.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    const timer = setTimeout(() => void reader.cancel().catch(() => {}), 10000);
    let raw: unknown;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 80000) {
          await reader.cancel();
          throw new CaptureError("size", "This request is too large.", 413);
        }
        chunks.push(value);
      }
      try {
        raw = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        throw new CaptureError(
          "input",
          "Could not read these reminder settings.",
        );
      }
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success)
      throw new CaptureError(
        "input",
        parsed.error.issues[0]?.message ?? "Check reminder settings.",
      );
    const b = parsed.data;
    let result: unknown = { ok: true };
    if (b.action === "configuration") {
      const pref = await getNotificationPreferences(db, owner);
      result = {
        preferences: pref.value,
        preferencesVersion: pref.version,
        configuration: deliveryConfiguration(),
      };
    } else if (b.action === "summary" || b.action === "load") {
      const unread = await db
        .collection<NotificationDoc>("notifications")
        .countDocuments({ user_id: owner, readAt: null, dismissedAt: null });
      const filter =
        b.action === "load" && b.cursor
          ? {
              $or: [
                { createdAt: { $lt: new Date(b.cursor.at) } },
                { createdAt: new Date(b.cursor.at), _id: { $lt: b.cursor.id } },
              ],
            }
          : {};
      const notifications = await db
        .collection<NotificationDoc>("notifications")
        .find({ user_id: owner, dismissedAt: null, ...filter })
        .sort({ createdAt: -1, _id: -1 })
        .limit(b.action === "summary" ? 5 : 21)
        .toArray();
      if (b.action === "summary") result = { unread, notifications };
      else {
        const [p, tasks, reminders, series, worker] = await Promise.all([
          getNotificationPreferences(db, owner),
          taskRepository(db, owner).list(),
          Promise.all([
            db
              .collection<ReminderDoc>("reminders")
              .find({
                user_id: owner,
                status: { $in: ["pending", "processing"] },
              })
              .sort({ scheduledAt: 1 })
              .limit(100)
              .toArray(),
            db
              .collection<ReminderDoc>("reminders")
              .find({
                user_id: owner,
                status: { $nin: ["pending", "processing"] },
              })
              .sort({ updatedAt: -1 })
              .limit(100)
              .toArray(),
          ]).then(([pending, recent]) => [...pending, ...recent]),
          db
            .collection<SeriesDoc>("recurringSeries")
            .find({ user_id: owner })
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray(),
          db
            .collection("reminderWorkerState")
            .findOne(
              { _id: "scheduler" as never },
              { projection: { startedAt: 1, finishedAt: 1 } },
            ),
        ]);
        const deliveries = await db
          .collection<DeliveryDoc>("notificationOutbox")
          .find({
            user_id: owner,
            reminder_id: { $in: reminders.map((r) => r._id) },
          })
          .sort({ createdAt: -1 })
          .limit(500)
          .toArray();
        const page = notifications.slice(0, 20),
          last = page.at(-1);
        result = {
          unread,
          notifications: page,
          nextCursor:
            notifications.length > 20 && last
              ? { at: last.createdAt.toISOString(), id: last._id }
              : null,
          preferences: p.value,
          preferencesVersion: p.version,
          tasks,
          reminders,
          deliveries,
          series,
          worker,
          configuration: deliveryConfiguration(),
          subscriptions: await db
            .collection<SubscriptionDoc>("pushSubscriptions")
            .countDocuments({ user_id: owner }),
        };
      }
    } else if (b.action === "task") {
      const task = await taskRepository(db, owner).findById(b.taskId);
      if (!task)
        throw new CaptureError("task", "This task is unavailable.", 404);
      const reminders = await db
        .collection<ReminderDoc>("reminders")
        .find({
          user_id: owner,
          task_id: b.taskId,
          status: { $in: ["pending", "processing", "failed"] },
        })
        .sort({ scheduledAt: 1 })
        .limit(5)
        .toArray();
      const pref = await getNotificationPreferences(db, owner);
      result = {
        reminderVersion: await reminderVersion(db, owner, b.taskId),
        reminders: reminders.map((r) => ({ ...r.spec, version: r.revision })),
        statuses: reminders.map((r) => ({ id: r._id, status: r.status })),
        preferences: pref.value,
        preferencesVersion: pref.version,
        configuration: deliveryConfiguration(),
      };
    } else if (b.action === "save") {
      await saveReminderList(
        db,
        getMongoClient(),
        owner,
        b.taskId,
        b.reminders,
        b.reminderVersion,
      );
      revalidatePath("/dashboard/reminders");
    } else if (b.action === "notification")
      await notificationAction(
        db,
        getMongoClient(),
        owner,
        b.id,
        b.operation,
        b.version,
        b.requestId,
        b.minutes,
      );
    else if (b.action === "readAll")
      await db
        .collection<NotificationDoc>("notifications")
        .updateMany(
          { user_id: owner, readAt: null, dismissedAt: null },
          { $set: { readAt: new Date() }, $inc: { version: 1 } },
        );
    else if (b.action === "preferences") {
      await ownerTransaction(db, getMongoClient(), owner, async (session) => {
        const p = await getNotificationPreferences(db, owner, session);
        if (p.version !== b.version)
          throw new CaptureError(
            "stale",
            "Preferences changed. Reload the stream before saving.",
            409,
          );
        if (!b.value.email && p.value.email)
          await db.collection<DeliveryDoc>("notificationOutbox").updateMany(
            {
              user_id: owner,
              channel: "email",
              status: { $in: ["pending", "processing"] },
            },
            {
              $set: {
                status: "pending",
                nextAttemptAt: new Date(Date.now() + 3600000),
                leaseUntil: null,
                leaseToken: null,
                error: "Deferred by email preference",
              },
            },
            { session },
          );
        await db
          .collection<{ _id: string; value: typeof b.value; version: number }>(
            "notificationPreferences",
          )
          .replaceOne(
            { _id: owner },
            { value: b.value, version: b.version + 1 },
            { upsert: true, session },
          );
      });
    } else if (b.action === "subscribe") {
      if (!deliveryConfiguration().push)
        throw new CaptureError(
          "setup",
          "Browser push is not configured on this server.",
          503,
        );
      if (!allowedPushEndpoint(b.subscription.endpoint))
        throw new CaptureError(
          "endpoint",
          "This browser push service is not supported.",
        );
      const key = createHash("sha256")
        .update(b.subscription.endpoint)
        .digest("hex");
      await ownerTransaction(db, getMongoClient(), owner, async (session) => {
        const col = db.collection<SubscriptionDoc>("pushSubscriptions"),
          old = await col.findOne({ _id: key }, { session });
        if (old && old.user_id !== owner)
          throw new CaptureError(
            "subscription",
            "Unsubscribe this browser from its previous account before enabling reminders.",
            409,
          );
        if (
          !old &&
          (await col.countDocuments({ user_id: owner }, { session })) >= 5
        )
          throw new CaptureError(
            "limit",
            "Up to five browser subscriptions are supported. Remove an old device first.",
          );
        await col.replaceOne(
          { _id: key },
          {
            user_id: owner,
            ...b.subscription,
            createdAt: old?.createdAt ?? new Date(),
            updatedAt: new Date(),
          },
          { upsert: true, session },
        );
      });
    } else if (b.action === "unsubscribe")
      await db.collection<SubscriptionDoc>("pushSubscriptions").deleteOne({
        _id: createHash("sha256").update(b.endpoint).digest("hex"),
        user_id: owner,
      });
    else if (b.action === "series") {
      await saveSeries(db, getMongoClient(), owner, b.value);
      revalidatePath("/dashboard/tasks");
    } else if (b.action === "seriesStatus")
      await changeSeriesStatus(
        db,
        getMongoClient(),
        owner,
        b.id,
        b.version,
        b.status,
      );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return captureFailure(e);
  }
}
