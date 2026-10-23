import type { Task } from "@/types/task";
export function taskStats(tasks: Task[], now: Date) {
  // Browser-local boundaries include 23/25-hour days when daylight saving changes.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dueToday = tasks.filter(
    (t) => t.due_at && new Date(t.due_at) >= start && new Date(t.due_at) < end,
  );
  const completed = tasks.filter((t) => t.status === "done").length;
  return {
    total: tasks.length,
    completed,
    pending: tasks.filter((task) => task.status === "todo").length,
    dueToday,
    upcoming: tasks.filter(
      (t) => t.status !== "done" && t.due_at && new Date(t.due_at) >= now,
    ).length,
    progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
  };
}
export function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  // Reject invalid and DST-skipped local wall times instead of silently shifting them.
  if (
    !Number.isFinite(date.getTime()) ||
    toLocalInput(date.toISOString()) !== value
  )
    throw new Error(
      "This time is not valid in your local time zone. Choose another time.",
    );
  return date.toISOString();
}
