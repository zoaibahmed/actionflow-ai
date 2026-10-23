import { createHash } from "node:crypto";
import { z } from "zod";
import type { Db, MongoClient } from "mongodb";
import { taskRepository } from "../tasks/repository";
import { taskSchema } from "../validation";
import { CaptureError } from "../capture/errors";
import { reminderListSchema } from "./schema";
import {
  ownerTransaction,
  putReminders,
  reconcileTask,
  reminderVersion,
} from "./repository";
export const taskExtrasSchema = z
  .object({
    requestId: z.string().uuid(),
    reminders: reminderListSchema.optional(),
    reminderVersion: z.number().int().min(0).optional(),
  })
  .strict();
export async function saveTaskWithReminders(
  db: Db,
  client: MongoClient,
  owner: string,
  id: string | null,
  input: z.infer<typeof taskSchema>,
  extras: z.infer<typeof taskExtrasSchema>,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ id, input, extras }))
    .digest("hex");
  return ownerTransaction(db, client, owner, async (session) => {
    const receipts = db.collection<{
        _id: string;
        hash: string;
        task_id: string;
      }>("reminderTaskReceipts"),
      key = `${owner}:${extras.requestId}`;
    const receipt = await receipts.findOne({ _id: key }, { session });
    const repo = taskRepository(db, owner);
    if (receipt) {
      if (receipt.hash !== hash)
        throw new CaptureError(
          "duplicate",
          "This save already completed with different changes. Reopen the task to edit it.",
          409,
        );
      const task = await repo.findById(receipt.task_id, session);
      if (!task)
        throw new CaptureError(
          "task",
          "The saved task was subsequently deleted.",
          409,
        );
      return task;
    }
    const task = id
      ? await repo.update(id, input, session)
      : await repo.create(input, session);
    if (!task)
      throw new CaptureError(
        "task",
        "This task was deleted or is unavailable.",
        404,
      );
    if (
      extras.reminders !== undefined &&
      (await reminderVersion(db, owner, task.id, session)) !==
        (extras.reminderVersion ?? 0)
    )
      throw new CaptureError(
        "stale",
        "Reminders changed. Reopen the task before saving.",
        409,
      );
    if (extras.reminders !== undefined && task.status !== "done")
      await putReminders(db, owner, task, extras.reminders, session);
    if (
      task.status === "done" &&
      extras.reminders?.some((r) => r.version === 0)
    )
      throw new CaptureError(
        "completed",
        "Reopen the task before adding reminders.",
      );
    await reconcileTask(db, owner, task, task.id, session, !!id);
    await receipts.insertOne({ _id: key, hash, task_id: task.id }, { session });
    return task;
  });
}
