import { randomUUID } from "node:crypto";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { taskRepository } from "../tasks/repository";
import { ownerTransaction, getNotificationPreferences } from "./repository";
import { generateOccurrences } from "./recurrence";
import {
  quietUntil,
  type ReminderDoc,
  type DeliveryDoc,
  type NotificationDoc,
  type SubscriptionDoc,
} from "./schema";
import type { Task } from "@/types/task";
export type Providers = {
  email: (
    to: string,
    task: Task,
    id: string,
    timezone: string,
  ) => Promise<void>;
  push: (
    subscription: SubscriptionDoc,
    task: Task,
    id: string,
  ) => Promise<void>;
};
const leaseMS = 90000,
  maxAttempts = 5;
export function backoff(attempt: number) {
  return Math.min(3600000, 30000 * 2 ** Math.max(0, attempt - 1));
}
export async function processReminders(
  db: Db,
  client: MongoClient,
  providers: Providers,
  options: {
    now?: Date;
    budgetMs?: number;
    maxJobs?: number;
    recurrence?: boolean;
  } = {},
) {
  const wall = Date.now(),
    deadline = wall + (options.budgetMs ?? 40000),
    now = () => options.now ?? new Date();
  let expanded = 0,
    accepted = 0,
    failed = 0;
  await db
    .collection<{ _id: string; startedAt: Date; finishedAt?: Date }>(
      "reminderWorkerState",
    )
    .updateOne(
      { _id: "scheduler" },
      { $set: { startedAt: now() } },
      { upsert: true },
    );
  // Ordinary reminders are processed first so a large series backlog cannot starve delivery.
  for (let i = 0; i < (options.maxJobs ?? 20) && Date.now() < deadline; i++) {
    const token = randomUUID(),
      at = now();
    const r = await db.collection<ReminderDoc>("reminders").findOneAndUpdate(
      {
        $or: [
          { status: "pending", nextAttemptAt: { $lte: at } },
          { status: "processing", leaseUntil: { $lte: at } },
        ],
      },
      {
        $set: {
          status: "processing",
          leaseToken: token,
          leaseUntil: new Date(at.getTime() + leaseMS),
          updatedAt: at,
        },
        $inc: { attempts: 1 },
      },
      { sort: { nextAttemptAt: 1 }, returnDocument: "after" },
    );
    if (!r) break;
    if (r.attempts > maxAttempts) {
      await db.collection<ReminderDoc>("reminders").updateOne(
        { _id: r._id, leaseToken: token },
        {
          $set: {
            status: "failed",
            reason: "Worker lease recovery limit exhausted",
            leaseToken: null,
            leaseUntil: null,
          },
        },
      );
      continue;
    }
    try {
      await ownerTransaction(db, client, r.user_id, async (session) => {
        const reminder = await db
          .collection<ReminderDoc>("reminders")
          .findOne(
            { _id: r._id, leaseToken: token, status: "processing" },
            { session },
          );
        if (!reminder) return;
        const task = await taskRepository(db, r.user_id).findById(
          r.task_id,
          session,
        );
        if (!task || task.status === "done") {
          await db.collection<ReminderDoc>("reminders").updateOne(
            { _id: r._id, leaseToken: token },
            {
              $set: {
                status: "cancelled",
                reason: task ? "Task completed" : "Task deleted",
                cancelledAt: at,
                leaseToken: null,
                leaseUntil: null,
              },
            },
            { session },
          );
          return;
        }
        const p = (await getNotificationPreferences(db, r.user_id, session))
          .value;
        const deferred = quietUntil(at, p);
        if (deferred) {
          await db.collection<ReminderDoc>("reminders").updateOne(
            { _id: r._id, leaseToken: token },
            {
              $set: {
                status: "pending",
                nextAttemptAt: deferred,
                deferredFrom: reminder.deferredFrom ?? reminder.scheduledAt,
                reason: "Deferred until quiet hours end",
                leaseUntil: null,
                leaseToken: null,
              },
              $inc: { attempts: -1 },
            },
            { session },
          );
          return;
        }
        if (!p.inApp && !p.push && !p.email) {
          await db.collection<ReminderDoc>("reminders").updateOne(
            { _id: r._id, leaseToken: token },
            {
              $set: {
                status: "pending",
                nextAttemptAt: new Date(at.getTime() + 3600000),
                reason: "Deferred while all notification channels are disabled",
                leaseUntil: null,
                leaseToken: null,
              },
              $inc: { attempts: -1 },
            },
            { session },
          );
          return;
        }
        const prefix = `${r._id}:${r.revision}`;
        let inApp = false;
        const jobs: DeliveryDoc[] = [];
        if (r.spec.channels.inApp && p.inApp) {
          await db.collection<NotificationDoc>("notifications").updateOne(
            { _id: prefix },
            {
              $setOnInsert: {
                user_id: r.user_id,
                task_id: task.id,
                reminder_id: r._id,
                title: task.title,
                createdAt: at,
                readAt: null,
                dismissedAt: null,
                snoozedAt: null,
                version: 1,
              },
            },
            { upsert: true, session },
          );
          inApp = true;
        }
        if (r.spec.channels.email && p.email)
          jobs.push({
            _id: `${prefix}:email`,
            user_id: r.user_id,
            task_id: task.id,
            reminder_id: r._id,
            revision: r.revision,
            channel: "email",
            subscription_id: null,
            status: "pending",
            attempts: 0,
            nextAttemptAt: at,
            leaseUntil: null,
            leaseToken: null,
            createdAt: at,
            acceptedAt: null,
            error: null,
          });
        if (r.spec.channels.push && p.push) {
          const subscriptions = await db
            .collection<SubscriptionDoc>("pushSubscriptions")
            .find({ user_id: r.user_id }, { session })
            .limit(5)
            .toArray();
          for (const sub of subscriptions)
            jobs.push({
              _id: `${prefix}:push:${sub._id}`,
              user_id: r.user_id,
              task_id: task.id,
              reminder_id: r._id,
              revision: r.revision,
              channel: "push",
              subscription_id: sub._id,
              status: "pending",
              attempts: 0,
              nextAttemptAt: at,
              leaseUntil: null,
              leaseToken: null,
              createdAt: at,
              acceptedAt: null,
              error: null,
            });
          if (!subscriptions.length)
            jobs.push({
              _id: `${prefix}:push:none`,
              user_id: r.user_id,
              task_id: task.id,
              reminder_id: r._id,
              revision: r.revision,
              channel: "push",
              subscription_id: null,
              status: "failed",
              attempts: 0,
              nextAttemptAt: at,
              leaseUntil: null,
              leaseToken: null,
              createdAt: at,
              acceptedAt: null,
              error:
                "No active browser subscription. Enable browser reminders on a supported device.",
            });
        }
        for (const job of jobs)
          await db
            .collection<DeliveryDoc>("notificationOutbox")
            .updateOne(
              { _id: job._id },
              { $setOnInsert: job },
              { upsert: true, session },
            );
        const active = jobs.some((j) => j.status === "pending");
        await db.collection<ReminderDoc>("reminders").updateOne(
          { _id: r._id, leaseToken: token },
          {
            $set: {
              status: active
                ? "processing"
                : inApp
                  ? "delivered"
                  : jobs.length
                    ? "failed"
                    : "pending",
              sentAt: inApp ? at : null,
              reason:
                !inApp && !jobs.length
                  ? "Selected channels disabled; deferred for one hour"
                  : null,
              nextAttemptAt:
                !inApp && !jobs.length
                  ? new Date(at.getTime() + 3600000)
                  : r.nextAttemptAt,
              leaseUntil: active ? new Date(at.getTime() + 86400000) : null,
              leaseToken: null,
            },
            $inc: { attempts: !inApp && !jobs.length ? -1 : 0 },
          },
          { session },
        );
      });
      expanded++;
    } catch {
      await db.collection<ReminderDoc>("reminders").updateOne(
        { _id: r._id, leaseToken: token },
        {
          $set: {
            status: r.attempts >= maxAttempts ? "failed" : "pending",
            nextAttemptAt: new Date(at.getTime() + backoff(r.attempts)),
            reason: "Scheduling attempt failed; retry is bounded",
            leaseToken: null,
            leaseUntil: null,
            updatedAt: at,
          },
        },
      );
      failed++;
    }
  }
  for (let i = 0; i < (options.maxJobs ?? 20) && Date.now() < deadline; i++) {
    const token = randomUUID(),
      at = now();
    const job = await db
      .collection<DeliveryDoc>("notificationOutbox")
      .findOneAndUpdate(
        {
          $or: [
            { status: "pending", nextAttemptAt: { $lte: at } },
            { status: "processing", leaseUntil: { $lte: at } },
          ],
        },
        {
          $set: {
            status: "processing",
            leaseUntil: new Date(at.getTime() + leaseMS),
            leaseToken: token,
          },
          $inc: { attempts: 1 },
        },
        { sort: { nextAttemptAt: 1 }, returnDocument: "after" },
      );
    if (!job) break;
    if (job.attempts > maxAttempts) {
      await db.collection<DeliveryDoc>("notificationOutbox").updateOne(
        { _id: job._id, leaseToken: token },
        {
          $set: {
            status: "uncertain",
            error:
              "Worker retry limit exhausted; external delivery outcome is unconfirmed",
            leaseToken: null,
            leaseUntil: null,
          },
        },
      );
      continue;
    }
    // After a worker crash an external request may have succeeded. Preserve the
    // uncertainty and retry with stable Message-ID/topic; providers need not dedupe.
    const attemptId = `${job._id}:${job.attempts}:${token}`;
    let send: {
      task: Task;
      timezone: string;
      email: string | null;
      subscription: SubscriptionDoc | null;
    } | null = null;
    await ownerTransaction(db, client, job.user_id, async (session) => {
      const current = await db
        .collection<DeliveryDoc>("notificationOutbox")
        .findOne(
          { _id: job._id, leaseToken: token, status: "processing" },
          { session },
        );
      if (!current) return;
      const reminder = await db
        .collection<ReminderDoc>("reminders")
        .findOne({ _id: job.reminder_id, user_id: job.user_id }, { session });
      const task = await taskRepository(db, job.user_id).findById(
          job.task_id,
          session,
        ),
        p = (await getNotificationPreferences(db, job.user_id, session)).value;
      if (
        !reminder ||
        reminder.status === "cancelled" ||
        reminder.revision !== job.revision ||
        !task ||
        task.status === "done"
      ) {
        await db.collection<DeliveryDoc>("notificationOutbox").updateOne(
          { _id: job._id, leaseToken: token },
          {
            $set: {
              status: "cancelled",
              error: "Task or reminder no longer active",
              leaseToken: null,
              leaseUntil: null,
            },
          },
          { session },
        );
        return;
      }
      const quiet = quietUntil(at, p);
      if (quiet || !(job.channel === "email" ? p.email : p.push)) {
        await db.collection<DeliveryDoc>("notificationOutbox").updateOne(
          { _id: job._id, leaseToken: token },
          {
            $set: {
              status: "pending",
              nextAttemptAt: quiet ?? new Date(at.getTime() + 3600000),
              error: "Deferred by notification preferences",
              leaseToken: null,
              leaseUntil: null,
            },
            $inc: { attempts: -1 },
          },
          { session },
        );
        return;
      }
      const user = await db
        .collection<{
          _id: string | ObjectId;
          id?: string;
          email: string;
          emailVerified: boolean;
        }>("user")
        .findOne(
          {
            $or: [
              { id: job.user_id },
              { _id: job.user_id },
              ...(ObjectId.isValid(job.user_id)
                ? [{ _id: new ObjectId(job.user_id) }]
                : []),
            ],
          },
          { session },
        );
      const sub = job.subscription_id
        ? await db
            .collection<SubscriptionDoc>("pushSubscriptions")
            .findOne(
              { _id: job.subscription_id, user_id: job.user_id },
              { session },
            )
        : null;
      send = {
        task,
        timezone: reminder.spec.timezone,
        email: user?.emailVerified ? user.email : null,
        subscription: sub,
      };
      await db
        .collection<{ _id: string; [key: string]: unknown }>(
          "notificationAttempts",
        )
        .insertOne(
          {
            _id: attemptId,
            job_id: job._id,
            user_id: job.user_id,
            channel: job.channel,
            startedAt: at,
            outcome:
              job.attempts > 1 ? "retry_outcome_may_be_uncertain" : "started",
            finishedAt: null,
          },
          { session },
        );
    });
    if (!send) continue;
    const actual = send as {
      task: Task;
      timezone: string;
      email: string | null;
      subscription: SubscriptionDoc | null;
    };
    try {
      if (job.channel === "email") {
        if (!actual.email)
          throw Object.assign(
            new Error("A verified email address is required."),
            { permanent: true },
          );
        await providers.email(
          actual.email,
          actual.task,
          job._id,
          actual.timezone,
        );
      } else {
        if (!actual.subscription)
          throw Object.assign(
            new Error("Browser subscription is missing or expired."),
            { permanent: true },
          );
        await providers.push(actual.subscription, actual.task, job._id);
      }
      const result = await db
        .collection<DeliveryDoc>("notificationOutbox")
        .updateOne(
          { _id: job._id, status: "processing", leaseToken: token },
          {
            $set: {
              status: "accepted",
              acceptedAt: now(),
              leaseUntil: null,
              leaseToken: null,
              error: null,
            },
          },
        );
      await db
        .collection<{ _id: string; [key: string]: unknown }>(
          "notificationAttempts",
        )
        .updateOne(
          { _id: attemptId },
          {
            $set: {
              finishedAt: now(),
              outcome: result.modifiedCount
                ? "provider_accepted"
                : "accepted_after_cancellation_or_lease_loss",
            },
          },
        );
      accepted++;
    } catch (error) {
      const e = error as {
        statusCode?: number;
        permanent?: boolean;
        code?: string;
      };
      const permanent =
        e.permanent || [400, 401, 403, 404, 410].includes(e.statusCode ?? 0);
      if ([404, 410].includes(e.statusCode ?? 0) && job.subscription_id)
        await db
          .collection<SubscriptionDoc>("pushSubscriptions")
          .deleteOne({ _id: job.subscription_id, user_id: job.user_id });
      const uncertain = ["ETIMEDOUT", "ESOCKET", "ECONNRESET"].includes(
        e.code ?? "",
      );
      const exhausted = job.attempts >= maxAttempts || permanent;
      await db.collection<DeliveryDoc>("notificationOutbox").updateOne(
        { _id: job._id, leaseToken: token, status: "processing" },
        {
          $set: {
            status: exhausted
              ? uncertain
                ? "uncertain"
                : "failed"
              : "pending",
            nextAttemptAt: new Date(now().getTime() + backoff(job.attempts)),
            leaseUntil: null,
            leaseToken: null,
            error: permanent
              ? "Channel unavailable or subscription expired. Check delivery configuration."
              : uncertain
                ? "Provider outcome uncertain; a retry may duplicate external delivery."
                : "Provider attempt failed; bounded retry scheduled.",
          },
        },
      );
      await db
        .collection<{ _id: string; [key: string]: unknown }>(
          "notificationAttempts",
        )
        .updateOne(
          { _id: attemptId },
          {
            $set: {
              finishedAt: now(),
              outcome: uncertain
                ? "uncertain"
                : exhausted
                  ? "failed"
                  : "retry_pending",
            },
          },
        );
      failed++;
    }
  }
  // Finalize parent summaries without claiming external device delivery.
  const waiting = await db
    .collection<ReminderDoc>("reminders")
    .find({ status: "processing", leaseToken: null })
    .sort({ updatedAt: 1 })
    .limit(100)
    .toArray();
  for (const r of waiting) {
    if (Date.now() >= deadline) break;
    const jobs = await db
      .collection<DeliveryDoc>("notificationOutbox")
      .find({ reminder_id: r._id, revision: r.revision })
      .toArray();
    if (jobs.some((j) => ["pending", "processing"].includes(j.status))) {
      await db
        .collection<ReminderDoc>("reminders")
        .updateOne(
          { _id: r._id, status: "processing", leaseToken: null },
          { $set: { updatedAt: now() } },
        );
      continue;
    }
    const inApp = !!(await db
      .collection<NotificationDoc>("notifications")
      .findOne({ _id: `${r._id}:${r.revision}` }));
    await db.collection<ReminderDoc>("reminders").updateOne(
      {
        _id: r._id,
        revision: r.revision,
        status: "processing",
        leaseToken: null,
      },
      {
        $set: {
          status: inApp
            ? "delivered"
            : jobs.some((j) => j.status === "accepted")
              ? "delivered"
              : "failed",
          sentAt: inApp ? r.sentAt : null,
          reason: jobs.some((j) => j.status !== "accepted")
            ? "One or more channels failed; inspect channel status"
            : inApp
              ? "In-app notification created"
              : "External provider accepted; device/inbox delivery unconfirmed",
          leaseUntil: null,
          updatedAt: now(),
        },
      },
    );
  }
  const generated =
    options.recurrence === false
      ? 0
      : await generateOccurrences(
          db,
          client,
          now(),
          Date.now() < deadline ? 3 : 0,
          deadline,
        );
  await db
    .collection<{
      _id: string;
      finishedAt: Date;
      startedAt?: Date;
      result: unknown;
    }>("reminderWorkerState")
    .updateOne(
      { _id: "scheduler" },
      {
        $set: {
          finishedAt: now(),
          result: { expanded, accepted, failed, generated },
        },
      },
      { upsert: true },
    );
  return { expanded, accepted, failed, generated };
}
