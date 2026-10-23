import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  notificationDefaults,
  quietUntil,
  occurrenceInstant,
  isOccurrence,
  scheduledAt,
  reminderListSchema,
  notificationPreferencesSchema,
  seriesSchema,
  type ReminderSpec,
  type SeriesInput,
} from "../src/lib/reminders/schema";
const rule: SeriesInput = {
  id: randomUUID(),
  version: 0,
  templateTaskId: randomUUID(),
  title: "Repeat",
  description: null,
  priority: "medium",
  frequency: "monthly",
  interval: 1,
  start: "2026-01-31",
  end: null,
  time: "09:00",
  timezone: "America/New_York",
  reminderOffsets: [],
  channels: { inApp: true, push: false, email: false },
  skipInvalidDates: true,
};
const spec: ReminderSpec = {
  id: randomUUID(),
  version: 0,
  kind: "due",
  offset: 15,
  at: null,
  timezone: "Asia/Karachi",
  channels: { inApp: true, push: false, email: false },
  acknowledgePast: false,
};
test("reminders are intentional, bounded and past times require explicit acknowledgement", () => {
  assert.equal(reminderListSchema.parse([]).length, 0);
  assert.equal(
    reminderListSchema.safeParse(
      Array.from({ length: 6 }, () => ({ ...spec, id: randomUUID() })),
    ).success,
    false,
  );
  assert.throws(() => scheduledAt(spec, null), /due time/);
  assert.throws(() => scheduledAt(spec, "2020-01-01T12:00Z"), /past/);
  assert.equal(
    scheduledAt(
      { ...spec, acknowledgePast: true },
      "2020-01-01T12:00Z",
    ).toISOString(),
    "2020-01-01T11:45:00.000Z",
  );
  assert.equal(
    reminderListSchema.safeParse([{ ...spec, user_id: "other" }]).success,
    false,
  );
  assert.equal(
    reminderListSchema.safeParse([
      { ...spec, channels: { inApp: false, push: false, email: false } },
    ]).success,
    false,
  );
});
test("relative offsets are real elapsed minutes while custom reminders keep a fixed instant", () => {
  const now = new Date("2026-01-01T00:00Z");
  assert.equal(
    scheduledAt(spec, "2026-01-02T10:00Z", now).toISOString(),
    "2026-01-02T09:45:00.000Z",
  );
  assert.equal(
    scheduledAt(
      { ...spec, kind: "custom", at: "2026-01-03T10:00:00Z" },
      "2026-01-02T10:00Z",
      now,
    ).toISOString(),
    "2026-01-03T10:00:00.000Z",
  );
});
test("quiet hours cross midnight in the user's timezone and defer rather than discard", () => {
  const p = {
    ...notificationDefaults,
    timezone: "Asia/Karachi",
    quietEnabled: true,
  };
  assert.equal(
    quietUntil(new Date("2026-10-20T18:00Z"), p)?.toISOString(),
    "2026-10-21T03:00:00.000Z",
  );
  assert.equal(
    quietUntil(new Date("2026-10-21T02:00Z"), p)?.toISOString(),
    "2026-10-21T03:00:00.000Z",
  );
  assert.equal(quietUntil(new Date("2026-10-21T03:00Z"), p), null);
  assert.equal(
    notificationPreferencesSchema.safeParse({ ...p, quietEnd: p.quietStart })
      .success,
    false,
  );
});
test("quiet-hour release handles skipped and repeated DST clocks without releasing early", () => {
  const p = {
    ...notificationDefaults,
    timezone: "America/New_York",
    quietEnabled: true,
    quietStart: "22:00",
    quietEnd: "02:30",
  };
  assert.equal(
    quietUntil(new Date("2026-03-08T06:00Z"), p)?.toISOString(),
    "2026-03-08T07:30:00.000Z",
  );
  const q = { ...p, quietEnd: "01:30" };
  assert.equal(
    quietUntil(new Date("2026-11-01T06:15Z"), q)?.toISOString(),
    "2026-11-01T06:30:00.000Z",
  );
});
test("monthly 31st and leap-day recurrence skip invalid dates rather than drifting", () => {
  assert.equal(isOccurrence(rule, "2026-02-28"), false);
  assert.equal(isOccurrence(rule, "2026-03-31"), true);
  const leap = { ...rule, frequency: "yearly" as const, start: "2024-02-29" };
  assert.equal(isOccurrence(leap, "2025-02-28"), false);
  assert.equal(isOccurrence(leap, "2028-02-29"), true);
  assert.equal(
    seriesSchema.safeParse({ ...rule, skipInvalidDates: false }).success,
    false,
  );
});
test("weekly, fortnightly, custom intervals and bounded end dates are calendar based", () => {
  const weekly = {
    ...rule,
    frequency: "weekly" as const,
    interval: 2,
    start: "2026-10-20",
    end: "2026-11-04",
  };
  assert.equal(isOccurrence(weekly, "2026-10-27"), false);
  assert.equal(isOccurrence(weekly, "2026-11-03"), true);
  assert.equal(isOccurrence(weekly, "2026-11-17"), false);
  const daily = { ...weekly, frequency: "daily" as const, interval: 3 };
  assert.equal(isOccurrence(daily, "2026-10-23"), true);
  assert.equal(isOccurrence(daily, "2026-10-24"), false);
});
test("recurring local times retain timezone semantics across DST; ambiguous clocks are skipped", () => {
  const daily = { ...rule, frequency: "daily" as const, start: "2026-03-07" };
  assert.equal(
    occurrenceInstant(daily, "2026-03-07")?.toISOString(),
    "2026-03-07T14:00:00.000Z",
  );
  assert.equal(
    occurrenceInstant(daily, "2026-03-08")?.toISOString(),
    "2026-03-08T13:00:00.000Z",
  );
  assert.equal(
    occurrenceInstant({ ...daily, time: "02:30" }, "2026-03-08"),
    null,
  );
  assert.equal(
    occurrenceInstant(
      { ...daily, start: "2026-11-01", time: "01:30" },
      "2026-11-01",
    ),
    null,
  );
});
