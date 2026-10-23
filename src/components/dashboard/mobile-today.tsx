"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import type { Task } from "@/types/task";
import { Icon } from "@/components/ui/icon";
import { ProgressRing } from "./progress-ring";
import { taskStats } from "@/lib/tasks/dates";

const priorityOrder = { high: 0, medium: 1, low: 2 };

export function MobileToday({
  tasks,
  now,
  pending,
  onToggle,
  onEdit,
  onAdd,
}: {
  tasks: Task[];
  now: Date | null;
  pending: boolean;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onAdd: () => void;
}) {
  const [filter, setFilter] = useState("open");
  const stats = now ? taskStats(tasks, now) : null;
  const open = tasks
    .filter((task) => task.status !== "done")
    .sort(
      (a, b) =>
        priorityOrder[a.priority] - priorityOrder[b.priority] ||
        (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"),
    );
  const lead = open[0];
  const filtered = (
    filter === "done"
      ? tasks.filter((task) => task.status === "done")
      : filter === "in_progress"
        ? open.filter((task) => task.status === "in_progress")
        : open
  ).slice(0, 5);
  const agenda =
    stats?.dueToday
      .filter((task) => task.status !== "done")
      .sort((a, b) => a.due_at!.localeCompare(b.due_at!)) ?? [];
  const date = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div className="phone-today">
      <section className="phone-momentum" aria-label="Your task progress">
        <div>
          <span>A little progress, every day</span>
          <strong>
            {stats ? `${stats.completed} of ${tasks.length}` : "—"}{" "}
            <small>tasks complete</small>
          </strong>
          <p>
            {open.length
              ? `${open.length} next steps, at your pace.`
              : tasks.length
                ? "Enjoy the space you’ve made."
                : "Start with one small thing."}
          </p>
        </div>
        <ProgressRing progress={stats?.progress ?? 0} ready={Boolean(stats)} />
      </section>
      <section className="phone-focus" aria-labelledby="phone-focus-heading">
        <div className="phone-section-title">
          <h2 id="phone-focus-heading">Today’s focus</h2>
          <span>{lead ? "Your next step" : "A fresh start"}</span>
        </div>
        {lead ? (
          <div className="phone-lead-task">
            <div className="phone-lead-meta">
              <span className={`priority ${lead.priority}`}>
                {lead.priority} priority
              </span>
              <Icon name="flag" width={15} />
            </div>
            <button
              className="phone-lead-title"
              onClick={() => onEdit(lead)}
              disabled={pending}
            >
              {lead.title}
            </button>
            {lead.description && <p>{lead.description}</p>}
            <div className="phone-lead-footer">
              <span>
                <Icon name="clock" width={13} />
                {lead.due_at && now ? date(lead.due_at) : "No deadline"}
              </span>
              <button
                aria-label={`Complete focus task: ${lead.title}`}
                disabled={pending}
                onClick={() => onToggle(lead)}
              >
                <Icon name={pending ? "loading" : "check"} width={17} />
                {pending ? "Saving…" : "Complete"}
              </button>
            </div>
          </div>
        ) : (
          <div className="phone-clear">
            <Icon name="complete" width={27} />
            <h3>
              {tasks.length ? "You’re all caught up." : "What’s on your mind?"}
            </h3>
            <p>
              {tasks.length
                ? "Your task list is clear. Take a breath."
                : "Give your first next step a home."}
            </p>
            <button className="button secondary" onClick={onAdd}>
              <Icon name="plus" width={16} />
              Add a task
            </button>
          </div>
        )}
      </section>
      <section
        className="phone-task-section"
        aria-labelledby="phone-tasks-heading"
      >
        <div className="phone-section-title">
          <h2 id="phone-tasks-heading">Your next steps</h2>
          <Link href="/dashboard/tasks">
            View all <Icon name="chevron" width={13} />
          </Link>
        </div>
        <div className="phone-filters" aria-label="Focus task status">
          {[
            ["open", "To do"],
            ["in_progress", "In progress"],
            ["done", "Completed"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="phone-task-list" aria-busy={pending}>
          <AnimatePresence initial={false} mode="popLayout">
            {filtered.map((task) => (
              <m.div
                key={task.id}
                className={`phone-task-row ${task.status === "done" ? "is-done" : ""}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
              >
                <button
                  className="phone-task-check"
                  role="checkbox"
                  aria-checked={task.status === "done"}
                  aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
                  disabled={pending}
                  onClick={() => onToggle(task)}
                >
                  {task.status === "done" && <Icon name="check" width={15} />}
                </button>
                <button
                  className="phone-task-open"
                  disabled={pending}
                  onClick={() => onEdit(task)}
                >
                  <strong>{task.title}</strong>
                  <small>
                    {task.due_at && now
                      ? date(task.due_at)
                      : task.status === "in_progress"
                        ? "In progress"
                        : "No deadline"}
                  </small>
                </button>
                <span
                  className={`phone-priority-dot ${task.priority}`}
                  role="img"
                  aria-label={`${task.priority} priority`}
                />
              </m.div>
            ))}
          </AnimatePresence>
          {!filtered.length && (
            <p className="phone-list-empty">
              {filter === "done"
                ? "Completed tasks will appear here."
                : filter === "in_progress"
                  ? "No tasks in progress. Open a task to change its status."
                  : "No unfinished tasks. Add a task when you’re ready."}
            </p>
          )}
        </div>
      </section>
      <section className="phone-agenda" aria-labelledby="phone-agenda-heading">
        <div className="phone-section-title">
          <h2 id="phone-agenda-heading">The shape of today</h2>
          <Icon name="today" width={18} />
        </div>
        <p>Task deadlines in your local time</p>
        {agenda.length ? (
          agenda.slice(0, 5).map((task) => (
            <button
              key={task.id}
              className="phone-agenda-entry"
              onClick={() => onEdit(task)}
              disabled={pending}
            >
              <time>
                {new Date(task.due_at!).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <i />
              <span>{task.title}</span>
              <Icon name="chevron" width={14} />
            </button>
          ))
        ) : (
          <div className="phone-agenda-empty">
            <span className="tiny-dot" />
            Nothing due today. There’s room to breathe.
          </div>
        )}
        <Link className="text-link" href="/dashboard/planner">
          Open your daily plan <Icon name="arrow" width={14} />
        </Link>
      </section>
      <Link className="phone-capture-entry" href="/dashboard/capture">
        <span>
          <Icon name="capture" />
        </span>
        <div>
          <strong>Start with what’s on your mind.</strong>
          <small>Turn text, an image, or a PDF into next steps.</small>
        </div>
        <Icon name="arrow" width={18} />
      </Link>
    </div>
  );
}
