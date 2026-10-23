"use client";
import Link from "next/link";
import { useRef, useState, useTransition, useEffect } from "react";
import type { Task, TaskInput } from "@/types/task";
import { Icon } from "@/components/ui/icon";
import { fromLocalInput, toLocalInput } from "@/lib/tasks/dates";
import { taskSchema, validationFields } from "@/lib/validation";
import { saveTask } from "@/lib/tasks/actions";
import { ReminderFields } from "@/components/reminders/reminder-fields";
import type { ReminderSpec } from "@/lib/reminders/schema";
import { m } from "motion/react";
export function TaskEditor({
  task,
  onClose,
  onSaved,
  onUnauthorized,
}: {
  task: Task | null;
  onClose: () => void;
  onSaved: () => void;
  onUnauthorized: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reminders, setReminders] = useState<ReminderSpec[] | undefined>(
    undefined,
  );
  const [remindersReady, setRemindersReady] = useState(!task);
  const [reminderVersion, setReminderVersion] = useState(0);
  const [requestId] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLInputElement>("#task-title")?.focus();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setFields({});
    let due_at: string | null;
    try {
      due_at = fromLocalInput(String(form.get("due_at") || ""));
    } catch (e) {
      setFields({
        due_at: [e instanceof Error ? e.message : "Choose a valid time."],
      });
      return;
    }
    const parsed = taskSchema.safeParse({
      title: form.get("title"),
      description: String(form.get("description") || "").trim() || null,
      priority: form.get("priority"),
      status: form.get("status"),
      due_at,
    });
    if (!parsed.success) {
      setFields(validationFields(parsed.error));
      setError("Please check the highlighted fields.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveTask(
          task?.id ?? null,
          parsed.data as TaskInput,
          {
            requestId,
            ...(remindersReady && reminders !== undefined
              ? { reminders, reminderVersion }
              : {}),
          },
        );
        if (!result.ok) {
          setError(result.error);
          setFields(result.fields ?? {});
          if (result.unauthorized && !dialog.current?.open) onUnauthorized();
          return;
        }
        onSaved();
      } catch {
        setError(
          "The connection was interrupted. Please try again; your form is still here.",
        );
      }
    });
  }
  function help(name: string) {
    return fields[name]?.[0];
  }
  return (
    <m.dialog
      ref={dialog}
      className="task-dialog expanded-dialog"
      aria-label={task ? "Edit task" : "Add task"}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.22 }}
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <form onSubmit={submit} aria-busy={pending}>
        <div className="section-heading">
          <h2>{task ? "Refine your next step" : "A new next step"}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close task form"
          >
            <Icon name="close" />
          </button>
        </div>
        <p>Keep it clear. Make it manageable.</p>
        <fieldset disabled={pending}>
          <div className="form-field">
            <label htmlFor="task-title">Task title</label>
            <input
              autoFocus
              id="task-title"
              name="title"
              defaultValue={task?.title ?? ""}
              required
              maxLength={160}
              aria-invalid={!!help("title")}
              aria-describedby={help("title") ? "title-error" : undefined}
              placeholder="What would you like to get done?"
            />
            {help("title") && (
              <span className="field-error" id="title-error">
                {help("title")}
              </span>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="task-description">
              Description <span className="muted">(optional)</span>
            </label>
            <textarea
              id="task-description"
              name="description"
              defaultValue={task?.description ?? ""}
              rows={3}
              maxLength={2000}
              aria-invalid={!!help("description")}
              aria-describedby="description-error"
            />
            <span className="field-error" id="description-error">
              {help("description")}
            </span>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="task-priority">Priority</label>
              <select
                id="task-priority"
                name="priority"
                defaultValue={task?.priority ?? "medium"}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="task-status">Status</label>
              <select
                id="task-status"
                name="status"
                defaultValue={task?.status ?? "todo"}
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Completed</option>
              </select>
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="task-due">
              Due date & time <span className="muted">(optional)</span>
            </label>
            <input
              id="task-due"
              type="datetime-local"
              name="due_at"
              defaultValue={toLocalInput(task?.due_at ?? null)}
              aria-invalid={!!help("due_at")}
              aria-describedby="due-help"
            />
            <span
              id="due-help"
              className={help("due_at") ? "field-error" : "field-help"}
            >
              {help("due_at") || "Uses your device’s local time zone."}
            </span>
          </div>
          <ReminderFields
            taskId={task?.id ?? null}
            value={reminders}
            onChange={setReminders}
            onReady={setRemindersReady}
            onVersion={setReminderVersion}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
              {error.includes("session") && (
                <Link href="/login" target="_blank">
                  {" "}
                  Sign in in a new tab; your form stays here.
                </Link>
              )}
            </p>
          )}
          <div className="editor-actions">
            <button
              className="button secondary"
              disabled={pending}
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button primary" disabled={pending} type="submit">
              {pending && (
                <Icon name="loading" className="spinner" width="16" />
              )}
              {pending ? "Saving…" : task ? "Save changes" : "Create task"}
            </button>
          </div>
          <span className="editor-save-note">
            <Icon name="check" width="12" />
            Just for you. Saved to your workspace.
          </span>
        </fieldset>
      </form>
    </m.dialog>
  );
}
