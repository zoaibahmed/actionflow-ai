import { Temporal } from "@js-temporal/polyfill";
import type { Db, MongoClient } from "mongodb";
import { taskRepository } from "../tasks/repository";
import {
  occurrenceInstant,
  type SeriesDoc,
  type OccurrenceDoc,
  type ReminderDoc,
  type ReminderSpec,
} from "./schema";
import {
  ownerTransaction,
  stableId,
  putReminders,
  cancelReminders,
} from "./repository";
import { CaptureError } from "../capture/errors";
export async function generateOccurrences(
  db: Db,
  client: MongoClient,
  now = new Date(),
  maxSeries = 20,
  deadline = Date.now() + 40000,
) {
  if (maxSeries <= 0) return 0;
  const series = await db
    .collection<SeriesDoc>("recurringSeries")
    .find({ status: "active" })
    .sort({ checkedThrough: 1, updatedAt: 1 })
    .limit(maxSeries)
    .toArray();
  let created = 0;
  for (const item of series) {
    if (Date.now() >= deadline) break;
    created += await ownerTransaction(
      db,
      client,
      item.user_id,
      async (session) => {
        let count = 0;
        const rule = await db
          .collection<SeriesDoc>("recurringSeries")
          .findOne(
            { _id: item._id, user_id: item.user_id, status: "active" },
            { session },
          );
        if (!rule) return 0;
        const start = Temporal.Instant.from(now.toISOString())
          .toZonedDateTimeISO(rule.input.timezone)
          .toPlainDate();
        const repo = taskRepository(db, rule.user_id);
        for (let offset = 0; offset <= 14; offset++) {
          const day = start.add({ days: offset }).toString(),
            at = occurrenceInstant(rule.input, day);
          if (!at || at <= now) continue;
          const key = `${rule._id}:${day}`,
            id = stableId(`${rule.user_id}:occurrence:${key}`);
          if (
            await db
              .collection<OccurrenceDoc>("taskOccurrences")
              .findOne({ _id: key }, { session })
          )
            continue;
          await db.collection<OccurrenceDoc>("taskOccurrences").insertOne(
            {
              _id: key,
              user_id: rule.user_id,
              series_id: rule._id,
              task_id: id,
              date: day,
              exception: false,
              deleted: false,
            },
            { session },
          );
          const task = await repo.createApproved(
            id,
            {
              title: rule.input.title,
              description: rule.input.description,
              priority: rule.input.priority,
              status: "todo",
              due_at: at.toISOString(),
            },
            session,
          );
          const specs: ReminderSpec[] = rule.input.reminderOffsets
            .map((minutes) => ({
              id: stableId(`${id}:reminder:${minutes}`),
              version: 0,
              kind: "due" as const,
              offset: minutes,
              at: null,
              timezone: rule.input.timezone,
              channels: rule.input.channels,
              acknowledgePast: false,
            }))
            .filter(
              (spec) => at.getTime() - spec.offset * 60000 > now.getTime(),
            );
          // Old cancellation history for a replaced future occurrence is retained.
          for (const spec of specs) {
            const old = await db
              .collection<ReminderDoc>("reminders")
              .findOne({ _id: spec.id, user_id: rule.user_id }, { session });
            if (old) spec.version = old.revision;
          }
          await putReminders(db, rule.user_id, task, specs, session, now);
          count++;
        }
        await db.collection<SeriesDoc>("recurringSeries").updateOne(
          { _id: rule._id, user_id: rule.user_id },
          {
            $set: {
              checkedThrough: start.add({ days: 14 }).toString(),
              updatedAt: now,
            },
          },
          { session },
        );
        return count;
      },
    );
  }
  return created;
}
export async function changeSeriesStatus(
  db: Db,
  client: MongoClient,
  owner: string,
  id: string,
  version: number,
  status: "active" | "paused" | "ended",
) {
  return ownerTransaction(db, client, owner, async (session) => {
    const col = db.collection<SeriesDoc>("recurringSeries"),
      series = await col.findOne({ _id: id, user_id: owner }, { session });
    if (!series || series.version !== version || series.status === "ended")
      throw new CaptureError(
        "stale",
        "This series changed or ended. Reload it.",
        409,
      );
    const now = new Date();
    await col.updateOne(
      { _id: id, user_id: owner, version },
      { $set: { status, updatedAt: now }, $inc: { version: 1 } },
      { session },
    );
    const occurrences = await db
      .collection<OccurrenceDoc>("taskOccurrences")
      .find({ user_id: owner, series_id: id, deleted: false }, { session })
      .toArray();
    for (const occurrence of occurrences) {
      const task = await taskRepository(db, owner).findById(
        occurrence.task_id,
        session,
      );
      if (
        !task ||
        task.status === "done" ||
        !task.due_at ||
        new Date(task.due_at) <= now
      )
        continue;
      if (status !== "active")
        await cancelReminders(
          db,
          owner,
          task.id,
          status === "ended" ? "Series ended" : "Series paused",
          session,
        );
      else if (!occurrence.exception) {
        const specs: ReminderSpec[] = [];
        for (const offset of series.input.reminderOffsets) {
          if (new Date(task.due_at).getTime() - offset * 60000 <= now.getTime())
            continue;
          const rid = stableId(`${task.id}:reminder:${offset}`);
          const old = await db
            .collection<ReminderDoc>("reminders")
            .findOne({ _id: rid, user_id: owner }, { session });
          if (old?.status === "delivered") continue;
          specs.push({
            id: rid,
            version: old?.revision ?? 0,
            kind: "due",
            offset,
            at: null,
            timezone: series.input.timezone,
            channels: series.input.channels,
            acknowledgePast: false,
          });
        }
        await putReminders(db, owner, task, specs, session, now);
      }
    }
  });
}
