import { z } from "zod";
import type { Task } from "@/types/task";
import { Temporal } from "@js-temporal/polyfill";
export const timezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      if (/^[+-]/.test(value)) return false;
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid IANA time zone.");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      return Temporal.PlainDate.from(v).toString() === v;
    } catch {
      return false;
    }
  }, "Invalid date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const suggestionSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(2000).nullable(),
    action_type: z.enum(["task", "deadline", "meeting"]),
    priority: z.enum(["low", "medium", "high"]),
    due_date: date.nullable(),
    due_time: time.nullable(),
    timezone: timezoneSchema,
    source_excerpt: z.string().max(500),
    date_wording: z.string().max(300).nullable(),
    date_confidence: z.enum(["certain", "ambiguous", "none"]),
    clarification_required: z.boolean(),
  })
  .strict();
export const extractionSchema = z
  .object({ actions: z.array(suggestionSchema).max(10) })
  .strict();
export type Suggestion = z.infer<typeof suggestionSchema> & { id: string };
export function validateExtraction(value: unknown, timezone: string) {
  const result = extractionSchema.parse(value);
  for (const action of result.actions) {
    if (action.timezone !== timezone) throw new Error("Unexpected time zone");
    if (action.due_time && !action.due_date)
      throw new Error("Time without date");
  }
  return result;
}
export const approvalItemSchema = z
  .object({
    suggestionId: z.string().uuid(),
    title: z.string().trim().min(1, "Give this task a title.").max(160),
    description: z.string().trim().max(2000).nullable(),
    priority: z.enum(["low", "medium", "high"]),
    deadlineMode: z.enum(["confirmed", "none"]),
    dueDate: date.nullable(),
    dueTime: time.nullable(),
    timezone: timezoneSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.deadlineMode === "confirmed") {
      try {
        if (!value.dueDate || !value.dueTime) throw new Error();
        localDeadline(value.dueDate, value.dueTime, value.timezone);
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["dueDate"],
          message:
            "Confirm a valid date and time. Ambiguous or skipped daylight-saving times need a different time.",
        });
      }
    }
  });
export const approvalSchema = z
  .object({
    captureId: z.string().uuid(),
    items: z.array(approvalItemSchema).min(1).max(10),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.suggestionId)).size === v.items.length,
    "Select each suggestion only once.",
  );
export type ApprovalItem = z.infer<typeof approvalItemSchema>;
export function localDeadline(date: string, time: string, timezone: string) {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
export function approvedTask(item: ApprovalItem) {
  return {
    title: item.title,
    description: item.description || null,
    priority: item.priority,
    status: "todo" as const,
    due_at:
      item.deadlineMode === "none"
        ? null
        : localDeadline(item.dueDate!, item.dueTime!, item.timezone),
  };
}
export type CaptureResult = {
  captureId: string;
  suggestions: Suggestion[];
  timezone: string;
  remaining: number;
  expiresAt: string;
};
export type SaveResult = {
  saved: {
    suggestionId: string;
    taskId: string;
    alreadySaved: boolean;
    task: Task;
  }[];
  errors: { suggestionId: string; message: string }[];
};
