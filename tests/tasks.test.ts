import assert from "node:assert/strict";
import test from "node:test";
import { taskSchema } from "../src/lib/validation";
import {
  taskStats,
  fromLocalInput,
  toLocalInput,
} from "../src/lib/tasks/dates";
import type { Task } from "../src/types/task";
const input = {
  title: "A real next step",
  description: null,
  priority: "medium",
  status: "todo",
  due_at: null,
};
test("rejects browser-supplied ownership, timestamps, operators and invalid task values", () => {
  for (const extra of [
    { user_id: "another-user" },
    { completed_at: new Date().toISOString() },
    { created_at: new Date().toISOString() },
    { $set: { user_id: "other" } },
  ])
    assert.equal(taskSchema.safeParse({ ...input, ...extra }).success, false);
  for (const invalid of [
    { title: " " },
    { title: "x".repeat(161) },
    { description: "x".repeat(2001) },
    { status: "finished" },
    { priority: "urgent" },
    { due_at: "not-a-date" },
    { due_at: "2026-10-19T13:00" },
  ])
    assert.equal(taskSchema.safeParse({ ...input, ...invalid }).success, false);
  assert.equal(
    taskSchema.safeParse({ ...input, title: "$notAnExpression" }).success,
    true,
  );
});
test("local-day statistics include midnight, exclude next midnight, and handle zero tasks", () => {
  const now = new Date(2026, 9, 19, 12);
  const due = (day: number, hour: number) =>
    new Date(2026, 9, day, hour).toISOString();
  const base = {
    ...input,
    id: "id",
    user_id: "owner",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    completed_at: null,
  } as Task;
  const tasks = [
    { ...base, id: "a", due_at: due(19, 0) },
    { ...base, id: "b", due_at: due(19, 23) },
    { ...base, id: "c", status: "in_progress" as const, due_at: due(20, 0) },
    {
      ...base,
      id: "d",
      status: "done" as const,
      completed_at: now.toISOString(),
    },
  ];
  const stats = taskStats(tasks, now);
  assert.equal(stats.dueToday.length, 2);
  assert.equal(stats.upcoming, 2);
  assert.equal(stats.pending, 2);
  assert.equal(stats.completed, 1);
  assert.equal(stats.progress, 25);
  assert.equal(taskStats([], now).progress, 0);
});
test("local date inputs round trip without UTC calendar-day shifts", () => {
  assert.equal(fromLocalInput(""), null);
  assert.equal(toLocalInput(null), "");
  const value = "2026-10-19T08:15";
  assert.equal(toLocalInput(fromLocalInput(value)), value);
  assert.throws(() => fromLocalInput("2026-02-30T08:15"));
});
