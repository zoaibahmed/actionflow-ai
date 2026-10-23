"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Task } from "@/types/task";
import { Icon } from "@/components/ui/icon";
import { completeTask, deleteTask } from "@/lib/tasks/actions";
import { TaskEditor } from "./task-editor";
import { m, AnimatePresence } from "motion/react";
import { CommandCenter } from "@/components/dashboard/command-center";
import { MobileToday } from "@/components/dashboard/mobile-today";
const statusLabels = {
  todo: "To do",
  in_progress: "In progress",
  done: "Completed",
};
const priorityOrder = { high: 0, medium: 1, low: 2 };
export function TaskWorkspace({
  tasks,
  name,
  view = "today",
}: {
  tasks: Task[];
  name: string;
  view?: "today" | "tasks";
}) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [filter, setFilter] = useState("all");
  const [priority, setPriority] = useState("all");
  const [sort, setSort] = useState(view === "today" ? "priority" : "newest");
  const [editor, setEditor] = useState<{ task: Task | null } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 4500);
    return () => clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleting]);
  const filtered = tasks
    .filter(
      (t) =>
        (filter === "all" ||
          (filter === "pending" ? t.status === "todo" : t.status === filter)) &&
        (priority === "all" || priority === t.priority),
    )
    .sort((a, b) =>
      sort === "due"
        ? (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999")
        : sort === "oldest"
          ? a.created_at.localeCompare(b.created_at)
          : sort === "priority"
            ? priorityOrder[a.priority] - priorityOrder[b.priority] ||
              b.created_at.localeCompare(a.created_at)
            : b.created_at.localeCompare(a.created_at),
    );
  function unauthorized() {
    router.replace("/login?notice=session");
    router.refresh();
  }
  function toggle(task: Task) {
    setError("");
    startTransition(async () => {
      try {
        const result = await completeTask(task.id, task.status !== "done");
        if (!result.ok) {
          setError(result.error);
          if (result.unauthorized) unauthorized();
          return;
        }
        setFeedback(
          task.status === "done"
            ? "Task reopened. Pick it up when you’re ready."
            : "Task complete. A little more headspace.",
        );
      } catch {
        setError(
          "The connection was interrupted. Refresh to check the latest task status.",
        );
      }
    });
  }
  function remove() {
    if (!deleting) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await deleteTask(deleting.id);
        if (!result.ok) {
          setError(result.error || "Unable to delete this task.");
          if (result.unauthorized) unauthorized();
          return;
        }
        setDeleting(null);
        setFeedback("Task deleted from your workspace.");
      } catch {
        setError(
          "The connection was interrupted. Refresh to check whether the task was deleted.",
        );
      }
    });
  }
  function saved() {
    setEditor(null);
    setError("");
    setFeedback("Task saved to your personal workspace.");
  }
  const greeting = now
    ? now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 18
        ? "Good afternoon"
        : "Good evening"
    : "Welcome";
  const taskList = (
    <section className="card tasks-card" aria-busy={pending}>
      <div className="section-heading">
        <div>
          <h2>
            {view === "today" ? "Your task desk" : "My Tasks"}{" "}
            <span className="count-badge">{tasks.length}</span>
          </h2>
          <p>
            {view === "today"
              ? "A little focus on what matters most."
              : "Everything you’re making room for."}
          </p>
        </div>
        {view === "today" && (
          <Link href="/dashboard/tasks" className="text-link">
            View all
            <Icon name="chevron" width="14" />
          </Link>
        )}
      </div>
      <div className="task-tabs" aria-label="Task status">
        {[
          ["all", "All tasks"],
          ["pending", "Pending"],
          ["in_progress", "In progress"],
          ["done", "Completed"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            className={filter === value ? "selected" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
            {filter === value && (
              <m.span
                className="filter-indicator"
                layoutId={`task-filter-${view}`}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="task-controls">
        <label>
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
          </select>
        </label>
      </div>
      {error && !deleting && (
        <p className="form-error task-error" role="alert">
          {error}
        </p>
      )}
      <div className="task-list">
        <AnimatePresence initial={false} mode="popLayout">
          {filtered.map((task) => (
            <m.article
              key={task.id}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.22 }}
              data-selected={selectedTask === task.id}
              className={`task-row ${task.status === "done" ? "is-complete" : ""}`}
            >
              <label className="task-check-target">
                <input
                  type="checkbox"
                  aria-label={
                    task.status === "done"
                      ? `Reopen ${task.title}`
                      : `Complete ${task.title}`
                  }
                  checked={task.status === "done"}
                  disabled={pending}
                  onChange={() => toggle(task)}
                />
              </label>
              <div className="task-copy">
                <button
                  className="task-title task-title-button"
                  aria-expanded={selectedTask === task.id}
                  aria-controls={`task-actions-${task.id}`}
                  onClick={() =>
                    setSelectedTask((current) =>
                      current === task.id ? null : task.id,
                    )
                  }
                >
                  {task.title}
                </button>
                {task.description && (
                  <p className="task-description">{task.description}</p>
                )}
                <span className="task-meta">
                  <span className={`category-dot status-${task.status}`} />
                  {statusLabels[task.status]}
                  <span className="meta-separator">·</span>
                  <Icon name="clock" width="12" height="12" />
                  {task.due_at
                    ? now
                      ? new Date(task.due_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "Scheduled"
                    : "No due date"}
                </span>
              </div>
              <div className="task-end">
                <span className={`priority ${task.priority}`}>
                  {task.priority}
                </span>
                <div
                  className="task-row-actions"
                  id={`task-actions-${task.id}`}
                >
                  <button
                    disabled={pending}
                    onClick={() => {
                      setError("");
                      setEditor({ task });
                    }}
                    aria-label={`Edit ${task.title}`}
                  >
                    Edit
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => {
                      setError("");
                      setDeleting(task);
                    }}
                    aria-label={`Delete ${task.title}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </m.article>
          ))}
        </AnimatePresence>
        {!filtered.length && (
          <m.div
            className="empty-state"
            initial={{ opacity: 0.5, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="feature-icon">
              <Icon name={tasks.length ? "check" : "tasks"} />
            </span>
            <h3>
              {tasks.length
                ? "A little breathing room"
                : "Your first next step starts here"}
            </h3>
            <p>
              {tasks.length
                ? "No tasks match these filters. Try a different view."
                : "Add something you’d like to do. We’ll keep it here for you."}
            </p>
            {!tasks.length && (
              <button
                className="button primary"
                onClick={() => setEditor({ task: null })}
              >
                <Icon name="plus" />
                Create your first task
              </button>
            )}
          </m.div>
        )}
      </div>
      <div className="task-card-footer">
        <Icon name="check" width="14" />
        <span>
          {pending
            ? "Updating your workspace…"
            : "Your tasks are saved to your personal workspace."}
        </span>
        <button
          aria-label="Add task"
          disabled={pending}
          onClick={() => setEditor({ task: null })}
        >
          <Icon name="plus" width="16" />
        </button>
      </div>
    </section>
  );
  return (
    <div className="today-content">
      <div className="welcome">
        <div>
          <div className="date-label">
            <span className="tiny-dot" />
            {now
              ? now.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "Your day, at a glance"}
          </div>
          <h1>
            {view === "today"
              ? `${greeting}, ${name.split(" ")[0]}`
              : "A place for every next step."}
            {view === "today" && (
              <span className="greeting-sun" aria-hidden="true">
                {" "}
                ☀
              </span>
            )}
          </h1>
          <p>
            {view === "today"
              ? "Your priorities, your pace. Start with one clear next step."
              : "Organize your tasks, refine the details, and keep moving forward."}
          </p>
        </div>
        <button
          className="button primary"
          disabled={pending}
          onClick={() => setEditor({ task: null })}
        >
          <Icon name="plus" />
          Add Task
        </button>
      </div>
      {view === "today" && error && !deleting && (
        <p className="form-error phone-task-error" role="alert">
          {error}
        </p>
      )}
      {view === "today" && (
        <MobileToday
          tasks={tasks}
          now={now}
          pending={pending}
          onToggle={toggle}
          onEdit={(task) => {
            setError("");
            setEditor({ task });
          }}
          onAdd={() => setEditor({ task: null })}
        />
      )}
      {view === "today" && (
        <CommandCenter
          tasks={tasks}
          now={now}
          pending={pending}
          taskList={taskList}
          onToggle={toggle}
          onEdit={(task) => {
            setError("");
            setEditor({ task });
          }}
          onAdd={() => setEditor({ task: null })}
        />
      )}
      {view === "tasks" && (
        <div className="task-library">
          <div className="task-library-summary">
            <span>
              <strong>{tasks.length}</strong> total tasks
            </span>
            <span>
              <strong>
                {tasks.filter((task) => task.status === "done").length}
              </strong>{" "}
              complete
            </span>
            <span>
              <Icon name="check" width="13" />
              Your private workspace
            </span>
          </div>
          {taskList}
        </div>
      )}
      <div className="day-note">
        <span aria-hidden="true">✧</span> Progress doesn’t have to be perfect.
        It just has to be yours.
      </div>
      <AnimatePresence>
        {editor && (
          <TaskEditor
            key="task-editor"
            task={editor.task}
            onClose={() => setEditor(null)}
            onSaved={saved}
            onUnauthorized={unauthorized}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {feedback && (
          <m.div
            key="task-feedback"
            className="success-toast"
            role="status"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <span>
              <Icon name="check" width="16" />
            </span>
            {feedback}
            <button
              className="icon-button"
              aria-label="Dismiss confirmation"
              onClick={() => setFeedback("")}
            >
              <Icon name="close" width="14" />
            </button>
          </m.div>
        )}
      </AnimatePresence>
      <dialog
        className="task-dialog delete-dialog"
        ref={deleteDialog}
        aria-label="Confirm task deletion"
        onCancel={(e) => {
          if (pending) e.preventDefault();
          else setDeleting(null);
        }}
      >
        <h2>Let this task go?</h2>
        <p>
          “{deleting?.title}” will be permanently deleted from your workspace.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            disabled={pending}
            className="button secondary"
            onClick={() => setDeleting(null)}
          >
            Keep task
          </button>
          <button disabled={pending} className="button danger" onClick={remove}>
            {pending ? "Deleting…" : "Delete task"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
