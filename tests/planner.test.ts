import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  defaults,
  availability,
  localInstant,
  dayBounds,
  planRequestSchema,
  savePlanSchema,
  validateCoverage,
  validateSchedule,
  type PlanRequest,
  type Block,
} from "../src/lib/planner/schema";
import type { Task } from "../src/types/task";
const id = randomUUID();
const task: Task = {
  id,
  user_id: "owner",
  title: "Real priority",
  description: null,
  priority: "high",
  status: "todo",
  due_at: null,
  completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const input: PlanRequest = {
  date: "2026-10-20",
  preferences: { ...defaults, timezone: "Asia/Karachi" },
  commitments: [],
  taskIds: [id],
  version: 0,
};
const block: Block = {
  taskId: id,
  start: "09:00",
  end: "09:30",
  duration: 30,
  notes: "Reviewed",
};
test("planner validates ownership set, task state, intervals, session limits and overlap", () => {
  assert.equal(
    validateSchedule(input, [block], [task])[0].start,
    Date.parse("2026-10-20T04:00:00Z"),
  );
  assert.throws(
    () => validateSchedule(input, [{ ...block, taskId: randomUUID() }], [task]),
    /not selected/,
  );
  assert.throws(
    () => validateSchedule(input, [block], [{ ...task, status: "done" }]),
    /unavailable/,
  );
  assert.throws(
    () => validateSchedule(input, [{ ...block, end: "09:31" }], [task]),
    /duration/,
  );
  assert.throws(
    () =>
      validateSchedule(
        input,
        [block, { ...block, start: "09:15", end: "09:45" }],
        [task],
      ),
    /overlap/,
  );
  assert.throws(
    () =>
      validateSchedule(
        input,
        [{ ...block, start: "08:30", end: "09:00" }],
        [task],
      ),
    /outside/,
  );
  assert.throws(
    () =>
      validateSchedule(
        input,
        [{ ...block, end: "10:00", duration: 60 }],
        [task],
      ),
    /focus-session/,
  );
  assert.throws(
    () =>
      validateSchedule(
        { ...input, preferences: { ...input.preferences, maxFocus: 20 } },
        [block],
        [task],
      ),
    /focus limit/,
  );
  assert.throws(
    () =>
      validateSchedule(
        input,
        [block],
        [task],
        [
          {
            start: Date.parse("2026-10-20T04:15Z"),
            end: Date.parse("2026-10-20T04:45Z"),
          },
        ],
      ),
    /saved plan/,
  );
});
test("availability rejects invalid or overlapping breaks and commitments", () => {
  const b = { id: randomUUID(), label: "Lunch", start: "12:00", end: "12:30" };
  assert.doesNotThrow(() =>
    availability({
      ...input,
      preferences: { ...input.preferences, breaks: [b] },
    }),
  );
  assert.throws(
    () =>
      availability({
        ...input,
        preferences: { ...input.preferences, end: "08:00" },
      }),
    /end/,
  );
  assert.throws(
    () =>
      availability({
        ...input,
        preferences: { ...input.preferences, breaks: [b] },
        commitments: [{ ...b, id: randomUUID() }],
      }),
    /overlap/,
  );
  assert.throws(
    () =>
      validateSchedule(
        { ...input, commitments: [{ ...b, start: "09:15", end: "09:45" }] },
        [block],
        [task],
      ),
    /commitment/,
  );
});
test("calendar days are timezone-correct and DST gaps and ambiguities are rejected", () => {
  assert.equal(
    dayBounds("2026-03-08", "America/New_York").end -
      dayBounds("2026-03-08", "America/New_York").start,
    23 * 3600000,
  );
  assert.equal(
    dayBounds("2026-11-01", "America/New_York").end -
      dayBounds("2026-11-01", "America/New_York").start,
    25 * 3600000,
  );
  assert.throws(() => localInstant("2026-03-08", "02:30", "America/New_York"));
  assert.throws(() => localInstant("2026-11-01", "01:30", "America/New_York"));
  assert.equal(
    planRequestSchema.safeParse({ ...input, date: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    planRequestSchema.safeParse({
      ...input,
      preferences: { ...defaults, timezone: "+05:00" },
    }).success,
    false,
  );
});
test("coverage and approval are bounded, strict and cannot silently drop tasks", () => {
  assert.throws(() => validateCoverage(input, [], []), /Every/);
  assert.throws(
    () => validateCoverage(input, [block], [{ taskId: id, reason: "No time" }]),
    /Every/,
  );
  assert.doesNotThrow(() =>
    validateCoverage(input, [], [{ taskId: id, reason: "No available time" }]),
  );
  assert.equal(
    savePlanSchema.safeParse({
      ...input,
      blocks: [block],
      unscheduled: [],
      notes: "",
      taskSnapshot: "hash",
      requestId: randomUUID(),
      user_id: "attacker",
    }).success,
    false,
  );
  assert.equal(
    planRequestSchema.safeParse({
      ...input,
      taskIds: Array.from({ length: 21 }, () => randomUUID()),
    }).success,
    false,
  );
});
