import {
  readNote,
  saveNote,
  deleteNote,
  startFocus,
  changeFocus,
  type FocusDoc,
} from "../workspace/repository";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Db, MongoClient, ClientSession } from "mongodb";
import { CaptureError } from "../capture/errors";
import {
  ownerTransaction,
  reconcileTask,
  putReminders,
  reminderVersion,
  notificationAction,
} from "../reminders/repository";
import { taskRepository } from "../tasks/repository";
import {
  savePlan,
  selectedTasks,
  otherIntervals,
  taskSnapshot,
} from "../planner/repository";
import {
  availability,
  validateCoverage,
  validateSchedule,
} from "../planner/schema";
import type { Task } from "@/types/task";
import type { NotificationDoc } from "../reminders/schema";
import {
  actionSchema,
  dated,
  rejectSecrets,
  redact,
  type Action,
  type ActionView,
  type AgentMessage,
} from "./schema";
export type ConversationDoc = {
  _id: string;
  user_id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: Date;
  updatedAt: Date;
  purgeAt: Date;
};
export type PendingDoc = {
  _id: string;
  user_id: string;
  conversationId: string;
  revision: number;
  hash: string;
  title: string;
  payload: Action;
  before: unknown;
  versions: {
    task?: string;
    reminders?: number;
    notification?: number;
    note?: number;
    focus?: number;
  };
  timezone: string;
  expiresAt: Date;
  purgeAt: Date;
  status: "pending" | "executed" | "cancelled";
  result?: { message: string; links: { label: string; href: string }[] };
};
export function hash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, n]) => [k, canonical(n)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function actionView(a: PendingDoc): ActionView {
  return {
    id: a._id,
    conversationId: a.conversationId,
    revision: a.revision,
    hash: a.hash,
    title: a.title,
    payload: a.payload,
    before: a.before,
    timezone: a.timezone,
    expiresAt: a.expiresAt.toISOString(),
    status: a.status,
    result: a.result,
    requiresDateConfirmation: !!dated(a.payload),
    destructive:
      a.payload.kind === "task_delete" ||
      a.payload.kind === "note_delete" ||
      a.payload.kind === "plan_save",
  };
}
export function stamp(task: Task) {
  return hash(task);
}
export function unavailable(): never {
  throw new CaptureError(
    "unavailable_record",
    "This record is unavailable. Refresh the workspace and try again.",
    404,
  );
}
export async function audit(
  db: Db,
  owner: string,
  conversationId: string,
  tool: string,
  status: string,
  session?: ClientSession,
  usage?: unknown,
) {
  await db.collection("agentAudit").insertOne(
    {
      user_id: owner,
      conversationId,
      tool,
      status,
      usage: usage ?? null,
      createdAt: new Date(),
      purgeAt: new Date(Date.now() + 30 * 86400000),
    },
    { session },
  );
}
export async function conversation(db: Db, owner: string, id: string) {
  const c = await db
    .collection<ConversationDoc>("agentConversations")
    .findOne({ _id: id, user_id: owner, purgeAt: { $gt: new Date() } });
  if (!c) unavailable();
  return c;
}
export async function loadConversation(db: Db, owner: string, id: string) {
  const c = await conversation(db, owner, id);
  const actions = await db
    .collection<PendingDoc>("agentActions")
    .find({ user_id: owner, conversationId: id, purgeAt: { $gt: new Date() } })
    .sort({ _id: 1 })
    .limit(60)
    .toArray();
  return {
    id: c._id,
    title: c.title,
    messages: c.messages,
    updatedAt: c.updatedAt.toISOString(),
    actions: actions.map(actionView),
  };
}
export async function propose(
  db: Db,
  owner: string,
  conversationId: string,
  timezone: string,
  payload: Action,
  title: string,
  before: unknown,
  versions: PendingDoc["versions"],
) {
  rejectSecrets(payload);
  await conversation(db, owner, conversationId);
  const value = actionSchema.parse(payload);
  await validatePlanPreview(db, owner, value);
  const now = Date.now();
  const a: PendingDoc = {
    _id: randomUUID(),
    user_id: owner,
    conversationId,
    revision: 1,
    hash: hash(value),
    title: redact(title),
    payload: value,
    before: JSON.parse(redact(JSON.stringify(before))),
    versions,
    timezone,
    expiresAt: new Date(now + 600000),
    purgeAt: new Date(now + 30 * 86400000),
    status: "pending",
  };
  await db.collection<PendingDoc>("agentActions").insertOne(a);
  return actionView(a);
}
async function validatePlanPreview(db: Db, owner: string, p: Action) {
  if (p.kind !== "plan_save") return;
  availability(p.input);
  const tasks = await selectedTasks(db, owner, p.input);
  if (taskSnapshot(tasks) !== p.input.taskSnapshot)
    throw new CaptureError(
      "stale",
      "Tasks changed after this plan was generated.",
      409,
    );
  validateCoverage(p.input, p.input.blocks, p.input.unscheduled);
  validateSchedule(
    p.input,
    p.input.blocks,
    tasks,
    await otherIntervals(db, owner, p.input),
  );
}
async function checkAction(
  db: Db,
  owner: string,
  id: string,
  revision: number,
  digest: string,
  session?: ClientSession,
) {
  const a = await db
    .collection<PendingDoc>("agentActions")
    .findOne({ _id: id, user_id: owner }, { session });
  if (!a) unavailable();
  if (
    a.revision !== revision ||
    a.hash !== digest ||
    hash(a.payload) !== a.hash
  )
    throw new CaptureError(
      "stale_approval",
      "This preview changed. Review the latest version before approving.",
      409,
    );
  return a;
}
export async function validateVersions(
  db: Db,
  owner: string,
  a: PendingDoc,
  session?: ClientSession,
) {
  const p = a.payload;
  if ("taskId" in p) {
    const task = await taskRepository(db, owner).findById(p.taskId, session);
    if (!task) unavailable();
    if (stamp(task) !== a.versions.task)
      throw new CaptureError(
        "stale_record",
        "This task changed after the preview. Ask for a fresh proposal.",
        409,
      );
    if (
      p.kind === "reminders" &&
      (await reminderVersion(db, owner, p.taskId, session)) !==
        a.versions.reminders
    )
      throw new CaptureError(
        "stale_record",
        "These reminders changed. Ask for a fresh proposal.",
        409,
      );
  }
  if (p.kind === "note_update" || p.kind === "note_delete") {
    const n = await readNote(db, owner, p.noteId, session);
    if (n.version !== a.versions.note)
      throw new CaptureError(
        "stale_record",
        "This note changed after the preview. Ask for a fresh proposal.",
        409,
      );
  }
  if (
    (p.kind === "note_create" || p.kind === "note_update") &&
    p.input.linkedTaskId &&
    !(await taskRepository(db, owner).findById(p.input.linkedTaskId, session))
  )
    unavailable();
  if (
    p.kind === "focus_start" &&
    p.input.taskId &&
    !(await taskRepository(db, owner).findById(p.input.taskId, session))
  )
    unavailable();
  if (p.kind === "focus_end") {
    const s = await db
      .collection<FocusDoc>("focusSessions")
      .findOne({ _id: p.sessionId, user_id: owner, active: true }, { session });
    if (!s || s.version !== a.versions.focus)
      throw new CaptureError(
        "stale_record",
        "This focus session changed. Ask for a fresh proposal.",
        409,
      );
  }
  if (p.kind === "notification") {
    const n = await db
      .collection<NotificationDoc>("notifications")
      .findOne({ _id: p.notificationId, user_id: owner }, { session });
    if (!n) unavailable();
    if (n.version !== a.versions.notification)
      throw new CaptureError(
        "stale_record",
        "This notification changed. Ask for a fresh proposal.",
        409,
      );
  }
}
export async function approve(
  db: Db,
  client: MongoClient,
  owner: string,
  input: {
    id: string;
    revision: number;
    hash: string;
    confirmDates: boolean;
    secondConfirmation: string | null;
  },
) {
  return ownerTransaction(db, client, owner, async (tx) => {
    const a = await checkAction(
      db,
      owner,
      input.id,
      input.revision,
      input.hash,
      tx,
    );
    if (a.status === "executed") return { result: a.result, duplicate: true };
    if (a.status !== "pending" || a.expiresAt.getTime() <= Date.now())
      throw new CaptureError(
        "expired_approval",
        "This proposal expired or was cancelled. Ask for a new preview.",
        409,
      );
    const c = await db
      .collection<ConversationDoc>("agentConversations")
      .findOne(
        { _id: a.conversationId, user_id: owner, purgeAt: { $gt: new Date() } },
        { session: tx },
      );
    if (!c) unavailable();
    if (dated(a.payload) && !input.confirmDates)
      throw new CaptureError(
        "confirm_date",
        "Confirm the displayed date, time and timezone before approving.",
      );
    if (
      ((a.payload.kind === "task_delete" || a.payload.kind === "note_delete") &&
        input.secondConfirmation !== "DELETE") ||
      (a.payload.kind === "plan_save" &&
        input.secondConfirmation !== "SAVE PLAN")
    )
      throw new CaptureError(
        "second_confirmation",
        "Enter the confirmation phrase shown in this action card.",
      );
    await validateVersions(db, owner, a, tx);
    const p = actionSchema.parse(a.payload);
    const repo = taskRepository(db, owner);
    let result: { message: string; links: { label: string; href: string }[] };
    if (p.kind === "task_create" || p.kind === "task_update") {
      const task =
        p.kind === "task_create"
          ? await repo.create(p.input, tx)
          : await repo.update(p.taskId, p.input, tx);
      if (!task) unavailable();
      await reconcileTask(
        db,
        owner,
        task,
        task.id,
        tx,
        p.kind === "task_update",
      );
      result = {
        message: p.kind === "task_create" ? "Task created." : "Task updated.",
        links: [
          { label: redact(task.title), href: "/dashboard/tasks/" + task.id },
        ],
      };
    } else if (p.kind === "task_delete") {
      if (!(await repo.delete(p.taskId, tx))) unavailable();
      await reconcileTask(db, owner, null, p.taskId, tx);
      result = {
        message: "Task deleted. Future reminders cancelled.",
        links: [{ label: "Your tasks", href: "/dashboard/tasks" }],
      };
    } else if (p.kind === "reminders") {
      const task = await repo.findById(p.taskId, tx);
      if (!task) unavailable();
      await putReminders(db, owner, task, p.specs, tx);
      await db
        .collection("taskOccurrences")
        .updateOne(
          { user_id: owner, task_id: task.id },
          { $set: { exception: true } },
          { session: tx },
        );
      result = {
        message:
          "Reminder changes saved. Delivery follows your preferences and worker availability.",
        links: [
          { label: redact(task.title), href: "/dashboard/tasks/" + task.id },
          { label: "Reminder Stream", href: "/dashboard/reminders" },
        ],
      };
    } else if (p.kind === "notification") {
      await notificationAction(
        db,
        client,
        owner,
        p.notificationId,
        p.mode,
        a.versions.notification!,
        a._id,
        p.minutes ?? undefined,
        tx,
      );
      result = {
        message:
          p.mode === "read"
            ? "Notification marked as read."
            : "Notification snoozed.",
        links: [{ label: "Notifications", href: "/dashboard/notifications" }],
      };
    } else if (p.kind === "note_create" || p.kind === "note_update") {
      const n = await saveNote(
        db,
        owner,
        p.noteId,
        p.kind === "note_create" ? 0 : a.versions.note!,
        p.input,
        tx,
      );
      result = {
        message: p.kind === "note_create" ? "Note created." : "Note updated.",
        links: [
          { label: redact(n.title), href: "/dashboard/notes?note=" + n._id },
        ],
      };
    } else if (p.kind === "note_delete") {
      await deleteNote(db, owner, p.noteId, a.versions.note!, tx);
      result = {
        message: "Note deleted.",
        links: [{ label: "Notes", href: "/dashboard/notes" }],
      };
    } else if (p.kind === "focus_start") {
      await startFocus(db, owner, p.sessionId, p.input, tx);
      result = {
        message: "Focus session started. Open Focus to view the timer.",
        links: [{ label: "Focus", href: "/dashboard/focus" }],
      };
    } else if (p.kind === "focus_end") {
      const n = await changeFocus(
        db,
        owner,
        p.sessionId,
        a.versions.focus!,
        "cancel",
        tx,
      );
      result = {
        message:
          n.status === "completed"
            ? "Focus session completed and saved."
            : "Session ended early; excluded from completed focus totals.",
        links: [{ label: "Focus", href: "/dashboard/focus" }],
      };
    } else {
      const plan = await savePlan(db, client, owner, p.input, tx);
      result = {
        message: `Plan saved for ${p.input.date} (${p.input.preferences.timezone}), version ${plan.version}.`,
        links: [
          {
            label: "Open Dayflow and choose " + p.input.date,
            href: "/dashboard/planner",
          },
        ],
      };
    }
    await db
      .collection<PendingDoc>("agentActions")
      .updateOne(
        { _id: a._id, user_id: owner, revision: a.revision, status: "pending" },
        { $set: { status: "executed", result } },
        { session: tx },
      );
    await audit(db, owner, a.conversationId, p.kind, "committed", tx);
    return { result, duplicate: false };
  });
}
export async function cancel(
  db: Db,
  owner: string,
  id: string,
  revision: number,
  digest: string,
) {
  const a = await checkAction(db, owner, id, revision, digest);
  if (a.status !== "pending")
    throw new CaptureError("closed", "This action already finished.", 409);
  const r = await db
    .collection<PendingDoc>("agentActions")
    .updateOne(
      { _id: id, user_id: owner, revision, hash: digest, status: "pending" },
      { $set: { status: "cancelled" } },
    );
  if (!r.modifiedCount)
    throw new CaptureError("stale", "This action changed. Refresh.", 409);
  await audit(db, owner, a.conversationId, a.payload.kind, "cancelled");
}
export async function edit(
  db: Db,
  owner: string,
  id: string,
  revision: number,
  digest: string,
  edits: unknown,
) {
  const a = await checkAction(db, owner, id, revision, digest);
  if (a.status !== "pending" || a.expiresAt.getTime() <= Date.now())
    throw new CaptureError("expired", "Ask for a new proposal.", 409);
  await validateVersions(db, owner, a);
  let payload: Action;
  if (
    a.payload.kind === "task_create" ||
    a.payload.kind === "task_update" ||
    a.payload.kind === "note_create" ||
    a.payload.kind === "note_update" ||
    a.payload.kind === "focus_start"
  )
    payload = actionSchema.parse({ ...a.payload, input: edits });
  else if (a.payload.kind === "reminders")
    payload = actionSchema.parse({ ...a.payload, specs: edits });
  else if (a.payload.kind === "plan_save") {
    const s = savePlanEdit.parse(edits);
    payload = actionSchema.parse({
      ...a.payload,
      input: {
        ...a.payload.input,
        blocks: s.blocks,
        unscheduled: s.unscheduled,
        notes: s.notes,
      },
    });
  } else
    throw new CaptureError(
      "edit",
      "This action has no editable fields. Cancel it and request a different action.",
    );
  rejectSecrets(payload);
  await validatePlanPreview(db, owner, payload);
  const next = {
    payload,
    revision: a.revision + 1,
    hash: hash(payload),
    expiresAt: new Date(Date.now() + 600000),
  };
  const r = await db
    .collection<PendingDoc>("agentActions")
    .updateOne(
      { _id: id, user_id: owner, revision, status: "pending", hash: digest },
      { $set: next },
    );
  if (!r.modifiedCount)
    throw new CaptureError("stale", "The preview changed. Reload it.", 409);
  return actionView({ ...a, ...next });
}
import { z } from "zod";
import { blockSchema, unscheduledSchema } from "../planner/schema";
const savePlanEdit = z
  .object({
    blocks: z.array(blockSchema).max(40),
    unscheduled: z.array(unscheduledSchema).max(20),
    notes: z.string().max(1000),
  })
  .strict();
