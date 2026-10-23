import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { timezoneSchema } from "../capture/schema";
import type { Task } from "@/types/task";
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      return Temporal.PlainDate.from(v).toString() === v;
    } catch {
      return false;
    }
  }, "Choose a real calendar date.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const intervalSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(120),
    start: time,
    end: time,
  })
  .strict();
export const preferencesSchema = z
  .object({
    timezone: timezoneSchema,
    start: time,
    end: time,
    breaks: z.array(intervalSchema).max(12),
    defaultDuration: z.number().int().min(5).max(480),
    focusSession: z.number().int().min(15).max(180),
    maxFocus: z.number().int().min(5).max(720),
    estimates: z
      .array(
        z
          .object({
            taskId: z.string().uuid(),
            minutes: z.number().int().min(5).max(480),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export const blockSchema = z
  .object({
    taskId: z.string().uuid(),
    start: time,
    end: time,
    duration: z.number().int().min(5).max(480),
    notes: z.string().trim().max(500),
  })
  .strict();
export const unscheduledSchema = z
  .object({
    taskId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const aiPlanSchema = z
  .object({
    blocks: z.array(blockSchema).max(40),
    unscheduled: z.array(unscheduledSchema).max(20),
    summary: z.string().max(1000),
    conflicts: z.array(z.string().max(300)).max(20),
  })
  .strict();
export const planRequestSchema = z
  .object({
    date: daySchema,
    preferences: preferencesSchema,
    commitments: z.array(intervalSchema).max(20),
    taskIds: z.array(z.string().uuid()).max(20),
    version: z.number().int().min(0),
  })
  .strict();
export const savePlanSchema = planRequestSchema
  .extend({
    blocks: z.array(blockSchema).max(40),
    unscheduled: z.array(unscheduledSchema).max(20),
    notes: z.string().trim().max(1000),
    taskSnapshot: z.string().max(100),
    requestId: z.string().uuid(),
  })
  .strict();
export type PlanRequest = z.infer<typeof planRequestSchema>;
export type PlanInput = z.infer<typeof savePlanSchema>;
export type Block = z.infer<typeof blockSchema>;
export type SavedPlan = {
  version: number;
  updatedAt: string;
  input: PlanInput;
  intervals: { taskId: string; start_at: string; end_at: string }[];
};
export const defaults: Preferences = {
  timezone: "UTC",
  start: "09:00",
  end: "17:00",
  breaks: [],
  defaultDuration: 30,
  focusSession: 50,
  maxFocus: 240,
  estimates: [],
};
export function localInstant(date: string, time: string, timezone: string) {
  return Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(
    timezone,
    { disambiguation: "reject" },
  ).epochMilliseconds;
}
export function dayBounds(date: string, timezone: string) {
  const d = Temporal.PlainDate.from(date);
  return {
    start: d.toZonedDateTime(timezone).epochMilliseconds,
    end: d.add({ days: 1 }).toZonedDateTime(timezone).epochMilliseconds,
  };
}
export function overlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
) {
  return a.start < b.end && b.start < a.end;
}
export function availability(input: PlanRequest) {
  const { date, preferences: p } = input;
  if (p.start >= p.end)
    throw new Error(
      "Day end must be after day start. Overnight work is not supported.",
    );
  if (new Set(input.taskIds).size !== input.taskIds.length)
    throw new Error("Choose each task only once.");
  if (new Set(p.estimates.map((e) => e.taskId)).size !== p.estimates.length)
    throw new Error("Duplicate task estimates.");
  const working = {
    start: localInstant(date, p.start, p.timezone),
    end: localInstant(date, p.end, p.timezone),
  };
  const unavailable = [...p.breaks, ...input.commitments]
    .map((v) => {
      const range = {
        start: localInstant(date, v.start, p.timezone),
        end: localInstant(date, v.end, p.timezone),
        label: v.label,
      };
      if (
        v.start >= v.end ||
        range.end <= range.start ||
        range.start < working.start ||
        range.end > working.end
      )
        throw new Error(
          "Breaks and commitments must fit inside working hours.",
        );
      return range;
    })
    .sort((a, b) => a.start - b.start);
  if (unavailable.some((v, i) => i > 0 && overlap(v, unavailable[i - 1])))
    throw new Error("Breaks and commitments overlap.");
  return { working, unavailable };
}
export function validateSchedule(
  input: PlanRequest,
  blocks: Block[],
  tasks: Task[],
  external: { start: number; end: number }[] = [],
) {
  const { working, unavailable } = availability(input);
  const ids = new Set(input.taskIds);
  if (
    tasks.length !== ids.size ||
    tasks.some((t) => !ids.has(t.id) || t.status === "done")
  )
    throw new Error(
      "A selected task changed or is unavailable. Reload your tasks.",
    );
  const ranges = blocks
    .map((b) => {
      blockSchema.parse(b);
      if (!ids.has(b.taskId))
        throw new Error("A scheduled task was not selected.");
      const start = localInstant(
          input.date,
          b.start,
          input.preferences.timezone,
        ),
        end = localInstant(input.date, b.end, input.preferences.timezone);
      if (end <= start || (end - start) / 60000 !== b.duration)
        throw new Error("Block duration must match its start and end.");
      if (b.duration > input.preferences.focusSession)
        throw new Error(
          "Split long work into blocks within your focus-session preference.",
        );
      if (start < working.start || end > working.end)
        throw new Error("A task is outside your available hours.");
      if ([...unavailable, ...external].some((r) => overlap({ start, end }, r)))
        throw new Error(
          "A task overlaps a break, commitment or another saved plan.",
        );
      return { taskId: b.taskId, start, end };
    })
    .sort((a, b) => a.start - b.start);
  if (ranges.some((v, i) => i > 0 && overlap(v, ranges[i - 1])))
    throw new Error("Task blocks overlap. Move a block before saving.");
  const bounds = dayBounds(input.date, input.preferences.timezone);
  const existingFocus = external.reduce(
    (sum, r) =>
      sum +
      Math.max(
        0,
        Math.min(r.end, bounds.end) - Math.max(r.start, bounds.start),
      ) /
        60000,
    0,
  );
  if (
    blocks.reduce((s, b) => s + b.duration, 0) + existingFocus >
    input.preferences.maxFocus
  )
    throw new Error(
      "This plan exceeds your daily focus limit, including work in other saved plans.",
    );
  return ranges;
}
export function validateCoverage(
  input: PlanRequest,
  blocks: Block[],
  unscheduled: z.infer<typeof unscheduledSchema>[],
) {
  const scheduled = new Set(blocks.map((b) => b.taskId));
  const rest = new Set(unscheduled.map((b) => b.taskId));
  if (
    rest.size !== unscheduled.length ||
    unscheduled.some(
      (b) => !input.taskIds.includes(b.taskId) || scheduled.has(b.taskId),
    ) ||
    input.taskIds.some((id) => !scheduled.has(id) && !rest.has(id))
  )
    throw new Error(
      "Every selected task must be scheduled or have an unscheduled explanation.",
    );
}
