import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { timezoneSchema } from "../capture/schema";
import { daySchema } from "../planner/schema";
export const offsets = [0, 5, 15, 30, 60, 1440] as const;
export const channelsSchema = z
  .object({ inApp: z.boolean(), push: z.boolean(), email: z.boolean() })
  .strict();
export const reminderSpecSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(0),
    kind: z.enum(["due", "custom"]),
    offset: z.number().int().min(0).max(10080),
    at: z.string().datetime({ offset: true }).nullable(),
    timezone: timezoneSchema,
    channels: channelsSchema,
    acknowledgePast: z.boolean(),
  })
  .strict()
  .refine(
    (v) => v.channels.inApp || v.channels.push || v.channels.email,
    "Choose at least one reminder channel.",
  )
  .refine(
    (v) => v.kind !== "custom" || !!v.at,
    "Choose a custom date and time.",
  );
export const reminderListSchema = z
  .array(reminderSpecSchema)
  .max(5)
  .refine(
    (v) => new Set(v.map((r) => r.id)).size === v.length,
    "Each reminder must be unique.",
  );
export type ReminderSpec = z.infer<typeof reminderSpecSchema>;
export const notificationPreferencesSchema = z
  .object({
    timezone: timezoneSchema,
    inApp: z.boolean(),
    push: z.boolean(),
    email: z.boolean(),
    defaultOffset: z.number().int().min(0).max(10080),
    snoozeMinutes: z.number().int().min(1).max(1440),
    quietEnabled: z.boolean(),
    quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict()
  .refine(
    (v) => !v.quietEnabled || v.quietStart !== v.quietEnd,
    "Quiet hours need different start and end times.",
  );
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export const notificationDefaults: NotificationPreferences = {
  timezone: "UTC",
  inApp: true,
  push: false,
  email: false,
  defaultOffset: 15,
  snoozeMinutes: 15,
  quietEnabled: false,
  quietStart: "22:00",
  quietEnd: "08:00",
};
export const seriesSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(0),
    templateTaskId: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).nullable(),
    priority: z.enum(["low", "medium", "high"]),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1).max(30),
    start: daySchema,
    end: daySchema.nullable(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: timezoneSchema,
    reminderOffsets: z.array(z.number().int().min(0).max(10080)).max(5),
    channels: channelsSchema,
    skipInvalidDates: z.literal(true),
  })
  .strict()
  .refine(
    (v) => !v.end || v.end >= v.start,
    "End date must not precede the start date.",
  )
  .refine(
    (v) => new Set(v.reminderOffsets).size === v.reminderOffsets.length,
    "Choose each offset once.",
  )
  .refine(
    (v) =>
      !v.reminderOffsets.length ||
      v.channels.inApp ||
      v.channels.push ||
      v.channels.email,
    "Choose a reminder channel or remove the reminder offsets.",
  );
export type SeriesInput = z.infer<typeof seriesSchema>;
export type Status =
  "pending" | "processing" | "delivered" | "failed" | "cancelled";
export type ReminderDoc = {
  _id: string;
  user_id: string;
  task_id: string;
  spec: ReminderSpec;
  scheduledAt: Date;
  nextAttemptAt: Date;
  status: Status;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  cancelledAt: Date | null;
  reason: string | null;
  leaseUntil: Date | null;
  leaseToken: string | null;
  attempts: number;
  deferredFrom: Date | null;
};
export type NotificationDoc = {
  _id: string;
  user_id: string;
  task_id: string;
  reminder_id: string;
  title: string;
  createdAt: Date;
  readAt: Date | null;
  dismissedAt: Date | null;
  snoozedAt: Date | null;
  version: number;
};
export type DeliveryDoc = {
  _id: string;
  user_id: string;
  task_id: string;
  reminder_id: string;
  revision: number;
  channel: "push" | "email";
  subscription_id: string | null;
  status:
    | "pending"
    | "processing"
    | "accepted"
    | "failed"
    | "cancelled"
    | "uncertain";
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil: Date | null;
  leaseToken: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  error: string | null;
};
export type SubscriptionDoc = {
  _id: string;
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: Date;
  updatedAt: Date;
};
export type SeriesDoc = {
  _id: string;
  user_id: string;
  input: SeriesInput;
  status: "active" | "paused" | "ended";
  version: number;
  createdAt: Date;
  updatedAt: Date;
  checkedThrough: string | null;
};
export type OccurrenceDoc = {
  _id: string;
  user_id: string;
  series_id: string;
  task_id: string;
  date: string;
  exception: boolean;
  deleted: boolean;
};
export function scheduledAt(
  spec: ReminderSpec,
  due: string | null,
  now = new Date(),
) {
  if (spec.kind === "due" && !due)
    throw new Error("Add a task due time before choosing a relative reminder.");
  const at =
    spec.kind === "custom"
      ? new Date(spec.at!)
      : new Date(new Date(due!).getTime() - spec.offset * 60000);
  if (!Number.isFinite(at.getTime()))
    throw new Error("Choose a valid reminder time.");
  if (at <= now && !spec.acknowledgePast)
    throw new Error(
      "This reminder is in the past. Choose another time or explicitly allow sending now.",
    );
  return at;
}
// Quiet windows defer, never discard. 'compatible' chooses the later edge for
// skipped clocks and the earlier edge for overlaps; then ensure it is future.
export function quietUntil(now: Date, p: NotificationPreferences): Date | null {
  if (!p.quietEnabled) return null;
  const local = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(
    p.timezone,
  );
  const hhmm = local.toPlainTime().toString().slice(0, 5);
  const crossing = p.quietStart > p.quietEnd;
  const inside = crossing
    ? hhmm >= p.quietStart || hhmm < p.quietEnd
    : hhmm >= p.quietStart && hhmm < p.quietEnd;
  if (!inside) return null;
  const date =
    crossing && hhmm >= p.quietStart
      ? local.toPlainDate().add({ days: 1 })
      : local.toPlainDate();
  let end = date
    .toPlainDateTime(p.quietEnd)
    .toZonedDateTime(p.timezone, { disambiguation: "compatible" });
  if (end.epochMilliseconds <= now.getTime()) end = end.add({ hours: 1 });
  return new Date(end.epochMilliseconds);
}
export function isOccurrence(rule: SeriesInput, date: string) {
  const start = Temporal.PlainDate.from(rule.start),
    day = Temporal.PlainDate.from(date);
  if (date < rule.start || (rule.end && date > rule.end)) return false;
  if (rule.frequency === "daily")
    return start.until(day, { largestUnit: "days" }).days % rule.interval === 0;
  if (rule.frequency === "weekly")
    return (
      start.until(day, { largestUnit: "days" }).days % (rule.interval * 7) === 0
    );
  if (rule.frequency === "monthly")
    return (
      day.day === start.day &&
      ((day.year - start.year) * 12 + day.month - start.month) %
        rule.interval ===
        0
    );
  return (
    day.month === start.month &&
    day.day === start.day &&
    (day.year - start.year) % rule.interval === 0
  );
}
export function occurrenceInstant(rule: SeriesInput, date: string) {
  if (!isOccurrence(rule, date)) return null;
  try {
    return new Date(
      Temporal.PlainDateTime.from(`${date}T${rule.time}`).toZonedDateTime(
        rule.timezone,
        { disambiguation: "reject" },
      ).epochMilliseconds,
    );
  } catch {
    return null;
  }
}
