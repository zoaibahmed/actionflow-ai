"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { randomUUID } from "node:crypto";
import {
  saveTaskWithReminders,
  taskExtrasSchema,
} from "../reminders/task-save";
import { ownerTransaction, reconcileTask } from "../reminders/repository";
import { CaptureError } from "../capture/errors";
import { getMongoClient } from "../db/mongo";
import { getDatabase } from "@/lib/db/mongo";
import { taskSchema, taskIdSchema, validationFields } from "@/lib/validation";
import { taskRepository } from "./repository";
import type { TaskResult } from "@/types/task";
const expired = {
  ok: false as const,
  error: "Your session has expired. Sign in again to continue.",
  unauthorized: true,
};
function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}
export async function saveTask(
  id: unknown,
  input: unknown,
  extras?: unknown,
): Promise<TaskResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fields: validationFields(parsed.error),
    };
  if (id !== null && !taskIdSchema.safeParse(id).success)
    return { ok: false, error: "Invalid task." };
  try {
    const session = await getSession();
    if (!session) return expired;
    const extra = taskExtrasSchema.safeParse(
      extras ?? { requestId: randomUUID() },
    );
    if (!extra.success)
      return {
        ok: false,
        error: extra.error.issues[0]?.message ?? "Check reminder settings.",
      };
    const task = await saveTaskWithReminders(
      getDatabase(),
      getMongoClient(),
      session.user.id,
      id as string | null,
      parsed.data,
      extra.data,
    );
    if (!task)
      return {
        ok: false,
        error:
          "This task no longer exists or is unavailable. Refresh and try again.",
      };
    refresh();
    return { ok: true, task };
  } catch (error) {
    if (error instanceof CaptureError)
      return { ok: false, error: error.message };
    return {
      ok: false,
      error:
        "We couldn’t save your task. Your changes are still in this form. Please try again.",
    };
  }
}
export async function completeTask(
  id: unknown,
  done: unknown,
): Promise<TaskResult> {
  if (!taskIdSchema.safeParse(id).success || typeof done !== "boolean")
    return { ok: false, error: "Invalid task update." };
  try {
    const session = await getSession();
    if (!session) return expired;
    const db = getDatabase();
    const task = await ownerTransaction(
      db,
      getMongoClient(),
      session.user.id,
      async (tx) => {
        const task = await taskRepository(db, session.user.id).complete(
          id as string,
          done,
          tx,
        );
        if (task) await reconcileTask(db, session.user.id, task, task.id, tx);
        return task;
      },
    );
    if (!task)
      return {
        ok: false,
        error: "This task no longer exists or is unavailable.",
      };
    refresh();
    return { ok: true, task };
  } catch {
    return {
      ok: false,
      error: "We couldn’t update this task. Please try again.",
    };
  }
}
export async function deleteTask(
  id: unknown,
): Promise<{ ok: boolean; error?: string; unauthorized?: boolean }> {
  if (!taskIdSchema.safeParse(id).success)
    return { ok: false, error: "Invalid task." };
  try {
    const session = await getSession();
    if (!session) return expired;
    const db = getDatabase();
    const removed = await ownerTransaction(
      db,
      getMongoClient(),
      session.user.id,
      async (tx) => {
        const removed = await taskRepository(db, session.user.id).delete(
          id as string,
          tx,
        );
        if (removed)
          await reconcileTask(db, session.user.id, null, id as string, tx);
        return removed;
      },
    );
    if (!removed)
      return {
        ok: false,
        error: "This task no longer exists or is unavailable.",
      };
    refresh();
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "We couldn’t delete this task. It is still in your list. Please try again.",
    };
  }
}
