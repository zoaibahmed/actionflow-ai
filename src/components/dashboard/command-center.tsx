"use client";
import Link from "next/link";
import { m } from "motion/react";
import type { ReactNode } from "react";
import type { Task } from "@/types/task";
import { taskStats } from "@/lib/tasks/dates";
import { Icon } from "@/components/ui/icon";
import { ProgressRing } from "./progress-ring";
const order = { high: 0, medium: 1, low: 2 };
export function CommandCenter({
  tasks,
  now,
  pending,
  taskList,
  onToggle,
  onEdit,
  onAdd,
}: {
  tasks: Task[];
  now: Date | null;
  pending: boolean;
  taskList: ReactNode;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onAdd: () => void;
}) {
  const stats = now ? taskStats(tasks, now) : null;
  const open = tasks
    .filter((t) => t.status !== "done")
    .sort(
      (a, b) =>
        order[a.priority] - order[b.priority] ||
        (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") ||
        a.created_at.localeCompare(b.created_at),
    );
  const focus = open[0];
  const agenda =
    stats?.dueToday
      .filter((t) => t.status !== "done")
      .sort((a, b) => a.due_at!.localeCompare(b.due_at!)) ?? [];
  const upcoming = now
    ? open
        .filter(
          (t) =>
            t.due_at &&
            new Date(t.due_at) >=
              new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        )
        .sort((a, b) => a.due_at!.localeCompare(b.due_at!))
        .slice(0, 3)
    : [];
  const overdue = now
    ? open.filter((t) => t.due_at && new Date(t.due_at) < now).length
    : 0;
  const time = (value: string) =>
    new Date(value).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return (
    <div className="command-center dayflow-canvas">
      <nav className="dayflow-dock" aria-label="Workspace quick actions">
        <button onClick={onAdd} disabled={pending}>
          <Icon name="plus" width="17" />
          <span>Add task</span>
        </button>
        <Link href="/dashboard/capture">
          <Icon name="capture" width="17" />
          <span>Smart Capture</span>
        </Link>
        <Link href="/dashboard/planner" aria-label="Open Dayflow Planner">
          <Icon name="spark" width="17" />
          <span>Planner</span>
        </Link>
      </nav>
      <div className="command-primary">
        <section className="focus-board" aria-labelledby="focus-heading">
          <div className="focus-board-top">
            <span>
              <i className="tiny-dot" /> Your Dayflow Canvas
            </span>
            <Icon name="today" width="18" />
          </div>
          <div className="focus-heading">
            <h2 id="focus-heading">Your Focus Today</h2>
            <span>{open.length} remaining</span>
          </div>
          {focus ? (
            <>
              <div className="focus-lead">
                <div className="focus-task-meta">
                  <span className={`priority ${focus.priority}`}>
                    {focus.priority} priority
                  </span>
                  <span>
                    {focus.status === "in_progress"
                      ? "In progress"
                      : "Next in line"}
                  </span>
                </div>
                <m.h3
                  key={focus.id}
                  initial={{ opacity: 0.5, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {focus.title}
                </m.h3>
                <p>
                  {focus.description ||
                    "One clear next step. Give this your attention when you’re ready."}
                </p>
                <div className="focus-task-bottom">
                  <span>
                    <Icon name="clock" width="14" />
                    {focus.due_at && now
                      ? new Date(focus.due_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "No deadline set"}
                  </span>
                  <div>
                    <button
                      className="focus-detail"
                      disabled={pending}
                      onClick={() => onEdit(focus)}
                      aria-label={`View focus task: ${focus.title}`}
                    >
                      Details <Icon name="arrow" width="14" />
                    </button>
                    <button
                      className="button primary focus-complete"
                      disabled={pending}
                      onClick={() => onToggle(focus)}
                      aria-label={`Complete focus task: ${focus.title}`}
                    >
                      <Icon
                        name={pending ? "loading" : "check"}
                        className={pending ? "spinner" : ""}
                        width="16"
                      />
                      {pending ? "Saving…" : "Mark complete"}
                    </button>
                  </div>
                </div>
              </div>
              {open.length > 1 && (
                <div className="focus-queue">
                  <span>Next up</span>
                  {open.slice(1, 3).map((task, index) => (
                    <button
                      key={task.id}
                      disabled={pending}
                      onClick={() => onEdit(task)}
                    >
                      <span className="queue-index">0{index + 2}</span>
                      <strong>{task.title}</strong>
                      <span className={`queue-priority ${task.priority}`}>
                        {task.priority}
                      </span>
                      <Icon name="chevron" width="14" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="focus-clear">
              <Icon name="check" width="28" />
              <h3>
                {tasks.length
                  ? "A little room to breathe."
                  : "Make room for what matters."}
              </h3>
              <p>
                {tasks.length
                  ? "All your tasks are complete. Enjoy the space you’ve made."
                  : "Capture your first task. Your next step will take its place here."}
              </p>
              <button
                className="button secondary"
                disabled={pending}
                onClick={onAdd}
              >
                <Icon name="plus" width="16" />
                Add a task
              </button>
            </div>
          )}
          <div className="focus-rule">
            <Icon name="tasks" width="13" />
            <span>Ordered by priority, then due date. You set the pace.</span>
          </div>
        </section>
        {taskList}
        <section
          className="upcoming-editorial"
          aria-labelledby="upcoming-heading"
        >
          <div className="editorial-heading">
            <div>
              <span className="eyebrow">A little further ahead</span>
              <h2 id="upcoming-heading">On the horizon</h2>
            </div>
            <Link href="/dashboard/tasks" className="text-link">
              All tasks <Icon name="arrow" width="14" />
            </Link>
          </div>
          {upcoming.length ? (
            upcoming.map((task) => (
              <button
                className="upcoming-item"
                key={task.id}
                disabled={pending}
                onClick={() => onEdit(task)}
              >
                <span className="upcoming-date">
                  <strong>
                    {new Date(task.due_at!).toLocaleDateString(undefined, {
                      day: "2-digit",
                    })}
                  </strong>
                  {new Date(task.due_at!).toLocaleDateString(undefined, {
                    month: "short",
                  })}
                </span>
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {time(task.due_at!)} · {task.priority} priority
                  </small>
                </span>
                <Icon name="chevron" width="16" />
              </button>
            ))
          ) : (
            <p className="quiet-empty">
              No tasks scheduled beyond today. Add a due date to see what’s
              ahead.
            </p>
          )}
        </section>
      </div>
      <aside className="command-rail" aria-label="Your day overview">
        <section className="day-progress">
          <div className="editorial-heading">
            <h2>Your momentum</h2>
            <span className="tiny-dot" />
          </div>
          <div className="momentum-body">
            <ProgressRing
              progress={stats?.progress ?? 0}
              ready={Boolean(stats)}
            />
            <div>
              <strong>
                {stats?.completed ?? "—"}
                <span> / {tasks.length}</span>
              </strong>
              <p>tasks complete</p>
              <small>
                {open.length
                  ? `${open.length} more opportunities to make space.`
                  : "A clear list. A clearer head."}
              </small>
            </div>
          </div>
          <div className="momentum-foot">
            <span>
              <strong>{agenda.length}</strong> due today
            </span>
            <span>
              <strong>{overdue}</strong> overdue
            </span>
          </div>
        </section>
        <section className="daily-agenda" aria-labelledby="agenda-heading">
          <div className="editorial-heading">
            <div>
              <span className="eyebrow">Your local time</span>
              <h2 id="agenda-heading">The shape of today</h2>
            </div>
            <Icon name="today" width="18" />
          </div>
          <div className="agenda-date">
            {now
              ? now.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })
              : "Finding your local day…"}
          </div>
          <div className="agenda-track">
            {agenda.length ? (
              agenda.map((task) => (
                <button
                  key={task.id}
                  className={`agenda-entry ${task.priority}`}
                  disabled={pending}
                  onClick={() => onEdit(task)}
                >
                  <time>{time(task.due_at!)}</time>
                  <span className="agenda-dot" />
                  <svg
                    className="dayflow-connector"
                    viewBox="0 0 16 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path d="M8 0 C-4 28 20 65 8 100" />
                  </svg>
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {task.status === "in_progress" ? "In progress" : "To do"}
                      {now && new Date(task.due_at!) < now ? " · Past due" : ""}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <div className="agenda-empty">
                <Icon name="today" width="22" />
                <h3>Nothing due today</h3>
                <p>
                  Your day has room. Tasks with a due time today will appear
                  here.
                </p>
                <button
                  className="text-link"
                  disabled={pending}
                  onClick={onAdd}
                >
                  Add something <Icon name="plus" width="14" />
                </button>
              </div>
            )}
          </div>
          <p className="agenda-note">
            <Icon name="clock" width="12" />
            Task deadlines, not calendar events.
          </p>
        </section>
        <section className="planner-whisper">
          <span className="availability">Dayflow Planner</span>
          <h2>A little help finding your flow.</h2>
          <p>
            Turn your priorities into a realistic schedule. Review every block
            before making it part of your day.
          </p>
          <Link className="text-link" href="/dashboard/planner">
            Plan your day <Icon name="arrow" width="14" />
          </Link>
        </section>
      </aside>
    </div>
  );
}
