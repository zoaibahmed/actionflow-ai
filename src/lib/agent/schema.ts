import { noteInput, focusInput } from "../workspace/schema";
import { z } from "zod";
import { timezoneSchema } from "../capture/schema";
import { taskSchema } from "../validation";
import {
  daySchema,
  savePlanSchema,
  localInstant,
  blockSchema,
  unscheduledSchema,
} from "../planner/schema";
import { reminderListSchema } from "../reminders/schema";
import { CaptureError } from "../capture/errors";

const nullableText = z.string().trim().max(2000).nullable();
const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
export const taskDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: nullableText,
    priority: z.enum(["low", "medium", "high"]),
    status: z.enum(["todo", "in_progress", "done"]),
    dueDate: daySchema.nullable(),
    dueTime: clock,
  })
  .strict();
export const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(160).nullable(),
    description: nullableText,
    clearDescription: z.boolean(),
    priority: z.enum(["low", "medium", "high"]).nullable(),
    status: z.enum(["todo", "in_progress", "done"]).nullable(),
    dueDate: daySchema.nullable(),
    dueTime: clock,
    clearDeadline: z.boolean(),
  })
  .strict();
export const toolSchemas = {
  find_notes: z
    .object({ query: z.string().trim().max(100).nullable() })
    .strict(),
  read_notes: z
    .object({ ids: z.array(z.string().uuid()).min(1).max(3) })
    .strict(),
  propose_note_create: noteInput,
  propose_note_update: z
    .object({ noteId: z.string().uuid(), input: noteInput })
    .strict(),
  propose_note_delete: z.object({ noteId: z.string().uuid() }).strict(),
  read_focus: z
    .object({
      taskId: z.string().uuid().nullable(),
      date: daySchema.nullable(),
    })
    .strict(),
  propose_focus_start: focusInput,
  propose_focus_end: z.object({ sessionId: z.string().uuid() }).strict(),
  search_workspace: z
    .object({ query: z.string().trim().min(2).max(100) })
    .strict(),
  read_insights: z
    .object({ days: z.union([z.literal(7), z.literal(30)]) })
    .strict(),
  find_tasks: z
    .object({
      query: z.string().trim().max(160).nullable(),
      scope: z.enum(["all", "today", "overdue", "open"]),
      priority: z.enum(["low", "medium", "high"]).nullable(),
    })
    .strict(),
  read_reminders: z.object({ taskId: z.string().uuid().nullable() }).strict(),
  read_recurring: z.object({}).strict(),
  read_notifications: z.object({ unreadOnly: z.boolean() }).strict(),
  read_dayflow: z.object({ date: daySchema }).strict(),
  propose_task_create: taskDraftSchema,
  propose_task_update: z
    .object({
      reference: z.string().trim().min(1).max(160),
      changes: patchSchema,
    })
    .strict(),
  propose_task_delete: z
    .object({ reference: z.string().trim().min(1).max(160) })
    .strict(),
  propose_reminder: z
    .object({
      reference: z.string().trim().min(1).max(160),
      reminderId: z.string().uuid().nullable(),
      mode: z.enum(["create", "update", "cancel"]),
      kind: z.enum(["due", "custom"]),
      offsetMinutes: z.number().int().min(0).max(10080),
      date: daySchema.nullable(),
      time: clock,
      channels: z
        .object({ inApp: z.boolean(), push: z.boolean(), email: z.boolean() })
        .strict(),
    })
    .strict(),
  propose_notification: z
    .object({
      notificationId: z.string().min(1).max(180),
      mode: z.enum(["read", "snooze"]),
      minutes: z.number().int().min(1).max(1440).nullable(),
    })
    .strict(),
  generate_dayflow_draft: z
    .object({
      date: daySchema,
      taskReferences: z.array(z.string().trim().min(1).max(160)).min(1).max(20),
    })
    .strict(),
  propose_plan_edit: z
    .object({
      date: daySchema,
      blocks: z.array(blockSchema).max(40),
      unscheduled: z.array(unscheduledSchema).max(20),
      notes: z.string().max(1000),
    })
    .strict(),
};
export type ToolName = keyof typeof toolSchemas;
export const actionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("note_create"),
      noteId: z.string().uuid(),
      input: noteInput,
    })
    .strict(),
  z
    .object({
      kind: z.literal("note_update"),
      noteId: z.string().uuid(),
      input: noteInput,
    })
    .strict(),
  z
    .object({ kind: z.literal("note_delete"), noteId: z.string().uuid() })
    .strict(),
  z
    .object({
      kind: z.literal("focus_start"),
      sessionId: z.string().uuid(),
      input: focusInput,
    })
    .strict(),
  z
    .object({ kind: z.literal("focus_end"), sessionId: z.string().uuid() })
    .strict(),
  z.object({ kind: z.literal("task_create"), input: taskSchema }).strict(),
  z
    .object({
      kind: z.literal("task_update"),
      taskId: z.string().uuid(),
      input: taskSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("task_delete"), taskId: z.string().uuid() })
    .strict(),
  z
    .object({
      kind: z.literal("reminders"),
      taskId: z.string().uuid(),
      specs: reminderListSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("notification"),
      notificationId: z.string().min(1).max(180),
      mode: z.enum(["read", "snooze"]),
      minutes: z.number().int().min(1).max(1440).nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("plan_save"), input: savePlanSchema }).strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export type RecordLink = { label: string; href: string };
export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  links?: RecordLink[];
};
export type ActionView = {
  id: string;
  conversationId: string;
  revision: number;
  hash: string;
  title: string;
  payload: Action;
  before: unknown;
  timezone: string;
  expiresAt: string;
  status: "pending" | "executed" | "cancelled";
  result?: { message: string; links: RecordLink[] };
  requiresDateConfirmation: boolean;
  destructive: boolean;
};
export type ConversationView = {
  id: string;
  title: string;
  messages: AgentMessage[];
  updatedAt: string;
  actions: ActionView[];
};
export const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z
    .object({ action: z.literal("load"), conversationId: z.string().uuid() })
    .strict(),
  z
    .object({
      action: z.literal("delete_conversation"),
      conversationId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("message"),
      conversationId: z.string().uuid().nullable(),
      requestId: z.string().uuid(),
      text: z.string().trim().min(1).max(4000),
      timezone: timezoneSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("edit"),
      id: z.string().uuid(),
      revision: z.number().int().min(1),
      hash: z.string().length(64),
      edits: z.unknown(),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve"),
      id: z.string().uuid(),
      revision: z.number().int().min(1),
      hash: z.string().length(64),
      confirmDates: z.boolean(),
      secondConfirmation: z.string().max(30).nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel"),
      id: z.string().uuid(),
      revision: z.number().int().min(1),
      hash: z.string().length(64),
    })
    .strict(),
]);
export function dateInstant(
  date: string | null,
  time: string | null,
  timezone: string,
) {
  if (!date && !time) return null;
  if (!date || !time)
    throw new CaptureError(
      "clarification",
      "Choose both a date and an exact time, or leave the deadline unset.",
    );
  try {
    return new Date(localInstant(date, time, timezone)).toISOString();
  } catch {
    throw new CaptureError(
      "clarification",
      "That local time is missing or repeated in this timezone. Choose an unambiguous time.",
    );
  }
}
const secretPattern =
  /(?:sk-(?:proj-)?[A-Za-z0-9_-]{15,}|mongodb(?:\+srv)?:\/\/[^\s"']+|-----BEGIN[^\n]*PRIVATE KEY|(?:password|api[_ -]?key|secret)\s*[:=]\s*[^\s"']{6,})/gi;
export function redact(value: string) {
  return value.replace(secretPattern, "[private value removed]");
}
export function rejectSecrets(value: unknown) {
  if (redact(JSON.stringify(value)) !== JSON.stringify(value))
    throw new CaptureError(
      "private_input",
      "Remove passwords, private keys and connection strings before using the assistant.",
    );
}
export function dated(action: Action) {
  return (
    action.kind === "plan_save" ||
    ((action.kind === "task_create" || action.kind === "task_update") &&
      !!action.input.due_at) ||
    (action.kind === "reminders" && action.specs.length > 0) ||
    (action.kind === "notification" && action.mode === "snooze")
  );
}
