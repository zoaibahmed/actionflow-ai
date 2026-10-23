import { z } from "zod";
import { timezoneSchema } from "../capture/schema";
export const noteInput = z
  .object({
    title: z.string().trim().min(1).max(160),
    content: z.string().max(30000),
    pinned: z.boolean(),
    linkedTaskId: z.string().uuid().nullable(),
  })
  .strict();
export const focusInput = z
  .object({
    minutes: z.number().int().min(1).max(180),
    taskId: z.string().uuid().nullable(),
  })
  .strict();
export const searchInput = z
  .object({
    query: z.string().trim().min(2).max(100),
    page: z.number().int().min(0).max(9),
  })
  .strict();
export const insightInput = z
  .object({
    days: z.union([z.literal(7), z.literal(30)]),
    timezone: timezoneSchema,
  })
  .strict();
export type NoteInput = z.infer<typeof noteInput>;
export type NoteView = NoteInput & {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type FocusView = {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  durationMs: number;
  elapsedMs: number;
  resumedAt: string | null;
  status: "running" | "paused" | "completed" | "cancelled";
  version: number;
  createdAt: string;
  completedAt: string | null;
};
export function focusElapsed(
  s: {
    elapsedMs: number;
    resumedAt: string | Date | null;
    durationMs: number;
    status: string;
  },
  now = Date.now(),
) {
  return Math.min(
    s.durationMs,
    Math.max(
      0,
      s.elapsedMs +
        (s.status === "running" && s.resumedAt
          ? Math.max(0, now - new Date(s.resumedAt).getTime())
          : 0),
    ),
  );
}
export const workspaceRequest = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("notes"),
      query: z.string().trim().max(100),
      sort: z.enum(["updatedAt", "createdAt"]),
      page: z.number().int().min(0).max(99),
    })
    .strict(),
  z.object({ action: z.literal("note_read"), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("note_save"),
      id: z.string().uuid(),
      version: z.number().int().min(0),
      input: noteInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("note_delete"),
      id: z.string().uuid(),
      version: z.number().int().min(1),
    })
    .strict(),
  z.object({ action: z.literal("focus_state") }).strict(),
  z
    .object({
      action: z.literal("focus_start"),
      id: z.string().uuid(),
      input: focusInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("focus_change"),
      id: z.string().uuid(),
      version: z.number().int().min(1),
      mode: z.enum(["pause", "resume", "finish", "cancel"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("focus_default"),
      minutes: z.number().int().min(1).max(180),
    })
    .strict(),
  z.object({ action: z.literal("search"), ...searchInput.shape }).strict(),
  z.object({ action: z.literal("insights"), ...insightInput.shape }).strict(),
  z
    .object({
      action: z.literal("task_choices"),
      query: z.string().trim().max(100),
    })
    .strict(),
]);
