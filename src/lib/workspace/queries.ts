import "server-only";
import type { Db } from "mongodb";
import { Temporal } from "@js-temporal/polyfill";
import { getPreferences } from "../planner/repository";
import { getNotificationPreferences } from "../reminders/repository";
import { literal } from "./repository";
import { searchInput, insightInput } from "./schema";
export type SearchResult = {
  id: string;
  kind: string;
  title: string;
  context: string;
  href: string;
};
export async function searchWorkspace(
  db: Db,
  owner: string,
  raw: unknown,
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const { query, page } = searchInput.parse(raw);
  const regex = { $regex: literal(query), $options: "i" };
  const opts = { maxTimeMS: 4000 };
  const take = 6,
    skip = page * take;
  const [tasks, notes, reminders, plans] = await Promise.all([
    db
      .collection("tasks")
      .find(
        { user_id: owner, $or: [{ title: regex }, { description: regex }] },
        { ...opts, projection: { title: 1, status: 1 } },
      )
      .sort({ updated_at: -1, _id: 1 })
      .skip(skip)
      .limit(take + 1)
      .toArray(),
    db
      .collection("notes")
      .find(
        { user_id: owner, $or: [{ title: regex }, { content: regex }] },
        { ...opts, projection: { title: 1, pinned: 1 } },
      )
      .sort({ updatedAt: -1, _id: 1 })
      .skip(skip)
      .limit(take + 1)
      .toArray(),
    db
      .collection("reminders")
      .aggregate(
        [
          { $match: { user_id: owner } },
          {
            $lookup: {
              from: "tasks",
              let: { task: "$task_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$_id", "$$task"] },
                        { $eq: ["$user_id", owner] },
                      ],
                    },
                    title: regex,
                  },
                },
                { $project: { title: 1 } },
              ],
              as: "task",
            },
          },
          { $unwind: "$task" },
          { $sort: { scheduledAt: -1, _id: 1 } },
          { $skip: skip },
          { $limit: take + 1 },
          {
            $project: {
              task_id: 1,
              scheduledAt: 1,
              status: 1,
              title: "$task.title",
            },
          },
        ],
        opts,
      )
      .toArray(),
    db
      .collection("dailyPlans")
      .find(
        {
          user_id: owner,
          $or: [
            { date: regex },
            { "input.notes": regex },
            { "input.blocks.notes": regex },
          ],
        },
        { ...opts, projection: { date: 1, version: 1 } },
      )
      .sort({ date: -1, _id: 1 })
      .skip(skip)
      .limit(take + 1)
      .toArray(),
  ]);
  return {
    hasMore:
      page < 9 && [tasks, notes, reminders, plans].some((x) => x.length > take),
    results: [
      ...tasks.slice(0, take).map((t) => ({
        id: String(t._id),
        kind: "Tasks",
        title: t.title,
        context: t.status,
        href: "/dashboard/tasks/" + t._id,
      })),
      ...notes.slice(0, take).map((n) => ({
        id: String(n._id),
        kind: "Notes",
        title: n.title,
        context: n.pinned ? "Pinned note" : "Personal note",
        href: "/dashboard/notes?note=" + n._id,
      })),
      ...reminders.slice(0, take).map((r) => ({
        id: String(r._id),
        kind: "Reminders",
        title: r.title,
        context: r.status + " · " + new Date(r.scheduledAt).toISOString(),
        href: "/dashboard/tasks/" + r.task_id,
      })),
      ...plans.slice(0, take).map((p) => ({
        id: String(p._id),
        kind: "Dayflow",
        title: "Plan for " + p.date,
        context: "Saved plan · version " + p.version,
        href: "/dashboard/planner?date=" + p.date,
      })),
    ],
  };
}
export async function insights(
  db: Db,
  owner: string,
  raw: unknown,
  now = new Date(),
) {
  const { days, timezone: requestedTimezone } = insightInput.parse(raw);
  const [pref, notifications] = await Promise.all([
    getPreferences(db, owner),
    getNotificationPreferences(db, owner),
  ]);
  const timezone = pref.exists
    ? pref.preferences.timezone
    : notifications.version
      ? notifications.value.timezone
      : requestedTimezone;
  const today = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(timezone)
    .toPlainDate();
  const end = new Date(
    today.add({ days: 1 }).toZonedDateTime(timezone).epochMilliseconds,
  );
  const start30 = new Date(
    today.subtract({ days: 29 }).toZonedDateTime(timezone).epochMilliseconds,
  );
  const weekStart = new Date(
    today.subtract({ days: today.dayOfWeek - 1 }).toZonedDateTime(timezone)
      .epochMilliseconds,
  );
  const monthStart = new Date(
    today.with({ day: 1 }).toZonedDateTime(timezone).epochMilliseconds,
  );
  const focusStart = new Date(
    Math.min(start30.getTime(), weekStart.getTime(), monthStart.getTime()),
  );
  const group = (field: string) => ({
    $dateToString: { format: "%Y-%m-%d", date: field, timezone },
  });
  const [
    taskTrend,
    focusTrend,
    status,
    overdue,
    upcoming,
    missing,
    focusCalendar,
  ] = await Promise.all([
    db
      .collection("tasks")
      .aggregate(
        [
          {
            $match: {
              user_id: owner,
              status: "done",
              completed_at: {
                $gte: new Date(
                  Math.min(start30.getTime(), monthStart.getTime()),
                ),
                $lt: end,
              },
            },
          },
          { $group: { _id: group("$completed_at"), count: { $sum: 1 } } },
        ],
        { maxTimeMS: 4000 },
      )
      .toArray(),
    db
      .collection("focusSessions")
      .aggregate(
        [
          {
            $match: {
              user_id: owner,
              status: "completed",
              completedAt: { $gte: focusStart, $lt: end },
            },
          },
          {
            $group: {
              _id: group("$completedAt"),
              ms: { $sum: "$elapsedMs" },
              count: { $sum: 1 },
            },
          },
        ],
        { maxTimeMS: 4000 },
      )
      .toArray(),
    db
      .collection("tasks")
      .aggregate(
        [
          { $match: { user_id: owner } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ],
        { maxTimeMS: 4000 },
      )
      .toArray(),
    db.collection("tasks").countDocuments(
      {
        user_id: owner,
        status: { $ne: "done" },
        due_at: { $lt: now, $type: "date" },
      },
      { maxTimeMS: 4000 },
    ),
    db.collection("tasks").countDocuments(
      {
        user_id: owner,
        status: { $ne: "done" },
        due_at: {
          $gte: now,
          $lt: new Date(
            today.add({ days: 7 }).toZonedDateTime(timezone).epochMilliseconds,
          ),
        },
      },
      { maxTimeMS: 4000 },
    ),
    db
      .collection("tasks")
      .countDocuments(
        { user_id: owner, status: "done", completed_at: null },
        { maxTimeMS: 4000 },
      ),
    db
      .collection("focusSessions")
      .aggregate(
        [
          {
            $match: {
              user_id: owner,
              status: "completed",
              completedAt: { $gte: focusStart, $lt: end },
            },
          },
          {
            $group: {
              _id: null,
              weekMs: {
                $sum: {
                  $cond: [
                    { $gte: ["$completedAt", weekStart] },
                    "$elapsedMs",
                    0,
                  ],
                },
              },
              monthMs: {
                $sum: {
                  $cond: [
                    { $gte: ["$completedAt", monthStart] },
                    "$elapsedMs",
                    0,
                  ],
                },
              },
            },
          },
        ],
        { maxTimeMS: 4000 },
      )
      .toArray(),
  ]);
  const trend = Array.from({ length: 30 }, (_, i) => {
    const date = today.subtract({ days: 29 - i }).toString();
    return {
      date,
      completed: taskTrend.find((t) => t._id === date)?.count ?? 0,
      focusMinutes: Math.round(
        (focusTrend.find((t) => t._id === date)?.ms ?? 0) / 60000,
      ),
    };
  });
  const completed = status.find((s) => s._id === "done")?.count ?? 0;
  return {
    timezone,
    days,
    completedWeek: taskTrend
      .filter(
        (t) =>
          String(t._id) >=
          today.subtract({ days: today.dayOfWeek - 1 }).toString(),
      )
      .reduce((s, t) => s + t.count, 0),
    completedMonth: taskTrend
      .filter((t) => String(t._id) >= today.with({ day: 1 }).toString())
      .reduce((s, t) => s + t.count, 0),
    calendarMonthTrend: Array.from({ length: today.day }, (_, i) => {
      const date = today.with({ day: i + 1 }).toString();
      return {
        date,
        completed: taskTrend.find((t) => t._id === date)?.count ?? 0,
        focusMinutes: Math.round(
          (focusTrend.find((t) => t._id === date)?.ms ?? 0) / 60000,
        ),
      };
    }),
    completed7: trend.slice(-7).reduce((s, t) => s + t.completed, 0),
    completed30: trend.reduce((s, t) => s + t.completed, 0),
    completed,
    pending: status
      .filter((s) => s._id !== "done")
      .reduce((s, t) => s + t.count, 0),
    overdue,
    upcoming,
    focusWeekMinutes: Math.round((focusCalendar[0]?.weekMs ?? 0) / 60000),
    focusMonthMinutes: Math.round((focusCalendar[0]?.monthMs ?? 0) / 60000),
    focus7Minutes: trend.slice(-7).reduce((s, t) => s + t.focusMinutes, 0),
    focus30Minutes: trend.reduce((s, t) => s + t.focusMinutes, 0),
    trend: trend.slice(-days),
    missingHistory: missing,
    limitations:
      "Completion trends use retained tasks’ latest completion timestamp. Deleted or reopened work cannot be reconstructed. Focus minutes count completed sessions only, on the local completion day. Week starts Monday; month starts on the first.",
  };
}
