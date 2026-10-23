"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { m } from "motion/react";
import { Temporal } from "@js-temporal/polyfill";
import { Icon } from "@/components/ui/icon";
import type { ActionView, ConversationView } from "@/lib/agent/schema";
import type { FocusView } from "@/lib/workspace/schema";
import type { TaskInput } from "@/types/task";
class RequestFailure extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api(body: unknown) {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("actionflow:session-expired"));
    throw new RequestFailure(
      data.error || "The request failed. Your input is still here.",
      data.code,
      response.status,
    );
  }
  return data;
}
const prompts = [
  "What are my tasks today?",
  "Show my overdue assignments.",
  "Create a task to study AI tomorrow.",
  "Show my upcoming reminders.",
  "What’s my Dayflow plan for tomorrow?",
  "Find my notes about the project.",
  "How much focus time did I complete this week?",
];
function local(value: string | null, zone: string) {
  return value
    ? Temporal.Instant.from(value)
        .toZonedDateTimeISO(zone)
        .toPlainDateTime()
        .toString()
        .slice(0, 16)
    : "";
}
function instant(value: string, zone: string) {
  return value
    ? Temporal.PlainDateTime.from(value)
        .toZonedDateTime(zone, { disambiguation: "reject" })
        .toInstant()
        .toString()
    : null;
}
function safeTitle(action: ActionView) {
  return action.title.length > 130
    ? action.title.slice(0, 130) + "…"
    : action.title;
}
function PlanEditor({
  action,
  onSave,
  busy,
}: {
  action: ActionView;
  onSave: (edits: unknown) => Promise<void>;
  busy: boolean;
}) {
  const p = action.payload;
  if (p.kind !== "plan_save") return null;
  return (
    <form
      className="agent-plan-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const blocks = p.input.blocks.map((b, i) => {
          const start = String(data.get("start-" + i)),
            end = String(data.get("end-" + i));
          const minutes = (value: string) =>
            Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
          return {
            ...b,
            start,
            end,
            duration: minutes(end) - minutes(start),
            notes: String(data.get("block-note-" + i) || ""),
          };
        });
        await onSave({
          blocks,
          unscheduled: p.input.unscheduled,
          notes: String(data.get("plan-note") || ""),
        });
      }}
    >
      <fieldset disabled={busy}>
        <p>
          {p.input.date} · {p.input.preferences.timezone}
          <br />
          Working hours {p.input.preferences.start}–{p.input.preferences.end};
          focus budget {p.input.preferences.maxFocus} minutes.
        </p>
        {p.input.commitments.length > 0 && (
          <p>
            Commitments:{" "}
            {p.input.commitments
              .map((c) => `${c.label} ${c.start}–${c.end}`)
              .join(", ")}
          </p>
        )}
        {p.input.preferences.breaks.length > 0 && (
          <p>
            Breaks:{" "}
            {p.input.preferences.breaks
              .map((c) => `${c.label} ${c.start}–${c.end}`)
              .join(", ")}
          </p>
        )}
        {(
          (action.before as { conflicts?: string[] } | null)?.conflicts ?? []
        ).map((conflict, i) => (
          <p className="agent-preview-note" key={i}>
            Planning note: {conflict}
          </p>
        ))}
        {p.input.blocks.map((b, i) => {
          const context = action.before as {
            tasks?: { id: string; title: string }[];
            conflicts?: string[];
          } | null;
          return (
            <div key={b.taskId + "-" + i} className="agent-plan-block">
              <Link href={"/dashboard/tasks/" + b.taskId}>
                {context?.tasks?.find((t) => t.id === b.taskId)?.title ||
                  "Open scheduled task"}
              </Link>
              <div>
                <label>
                  Start
                  <input
                    type="time"
                    name={"start-" + i}
                    defaultValue={b.start}
                    required
                  />
                </label>
                <label>
                  End
                  <input
                    type="time"
                    name={"end-" + i}
                    defaultValue={b.end}
                    required
                  />
                </label>
              </div>
              <label>
                Block note
                <input
                  name={"block-note-" + i}
                  defaultValue={b.notes}
                  maxLength={500}
                />
              </label>
            </div>
          );
        })}
        {p.input.unscheduled.map((u) => (
          <p key={u.taskId}>
            <Link href={"/dashboard/tasks/" + u.taskId}>Unscheduled task</Link>:{" "}
            {u.reason}
          </p>
        ))}
        <label>
          Plan notes
          <textarea
            name="plan-note"
            defaultValue={p.input.notes}
            maxLength={1000}
          />
        </label>
        <button className="button secondary" type="submit">
          Update plan preview
        </button>
      </fieldset>
    </form>
  );
}
function ActionCard({
  action,
  busy,
  onChange,
}: {
  action: ActionView;
  busy: boolean;
  onChange: (focusId?: string) => Promise<void>;
}) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [dates, setDates] = useState(false),
    [phrase, setPhrase] = useState(""),
    [working, setWorking] = useState(false),
    [dirty, setDirty] = useState(false);
  const p = action.payload;
  const active =
    action.status === "pending" && new Date(action.expiresAt) > new Date();
  async function perform(
    operation: "approve" | "cancel" | "edit",
    edits?: unknown,
  ) {
    let committed = false;
    setError("");
    setWorking(true);
    try {
      await api({
        action: operation,
        id: action.id,
        revision: action.revision,
        hash: action.hash,
        ...(operation === "approve"
          ? { confirmDates: dates, secondConfirmation: phrase || null }
          : operation === "edit"
            ? { edits }
            : {}),
      });
      committed = operation === "approve";
      setDirty(false);
      setDates(false);
      setPhrase("");
      await onChange(action.id);
      if (operation === "approve") {
        router.refresh();
        window.dispatchEvent(new Event("actionflow:notifications-changed"));
      }
    } catch (e) {
      setError(
        committed
          ? "The change was committed, but the receipt could not refresh. Reload this conversation; retrying approval will not repeat the change."
          : e instanceof Error
            ? e.message
            : "Unable to complete this request.",
      );
    } finally {
      setWorking(false);
    }
  }
  const task =
    p.kind === "task_create" || p.kind === "task_update" ? p.input : null;
  return (
    <m.article
      id={"agent-action-" + action.id}
      tabIndex={-1}
      className={`agent-action-card status-${action.status}`}
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.2 }}
      aria-label={safeTitle(action)}
    >
      <header>
        <span>
          <Icon
            name={action.status === "executed" ? "check" : "tasks"}
            width={17}
          />
          {action.status === "executed"
            ? "Confirmed change"
            : action.status === "cancelled"
              ? "Cancelled"
              : active
                ? "Review before saving"
                : "Expired preview"}
        </span>
        <small>Version {action.revision}</small>
      </header>
      <h3>{safeTitle(action)}</h3>
      {action.status === "executed" ? (
        <div className="agent-receipt" role="status">
          <p>{action.result?.message}</p>
          {action.result?.links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
              <Icon name="arrow" width={13} />
            </Link>
          ))}
        </div>
      ) : action.status === "cancelled" ? (
        <p>This proposal was cancelled. No workspace change was made.</p>
      ) : (
        <>
          <p className="agent-preview-note">
            {active
              ? "Nothing has been saved. This preview expires at " +
                new Date(action.expiresAt).toLocaleTimeString() +
                "."
              : "This proposal expired. Ask for a fresh one."}
          </p>
          {p.kind === "task_update" && (
            <details className="agent-before">
              <summary>Current task before this change</summary>
              <p>{(action.before as { title?: string })?.title}</p>
              <p>{(action.before as { description?: string })?.description}</p>
              <p>
                Priority: {(action.before as { priority?: string })?.priority};
                status: {(action.before as { status?: string })?.status}
              </p>
            </details>
          )}
          {(p.kind === "note_create" || p.kind === "note_update") && (
            <form
              onChange={() => setDirty(true)}
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                await perform("edit", {
                  title: String(d.get("title")),
                  content: String(d.get("content")),
                  pinned: d.get("pinned") === "on",
                  linkedTaskId: p.input.linkedTaskId,
                });
              }}
            >
              <fieldset disabled={!active || busy || working}>
                <label>
                  Note title
                  <input
                    name="title"
                    defaultValue={p.input.title}
                    maxLength={160}
                    required
                  />
                </label>
                <label>
                  Note content
                  <textarea
                    name="content"
                    defaultValue={p.input.content}
                    maxLength={30000}
                    rows={8}
                  />
                </label>
                <label>
                  <input
                    name="pinned"
                    type="checkbox"
                    defaultChecked={p.input.pinned}
                  />
                  Pinned
                </label>
                {p.input.linkedTaskId && (
                  <Link href={"/dashboard/tasks/" + p.input.linkedTaskId}>
                    Linked task
                  </Link>
                )}
                <button
                  className="button secondary"
                  type="submit"
                  disabled={!dirty}
                >
                  Update preview
                </button>
              </fieldset>
            </form>
          )}
          {p.kind === "note_update" && (
            <details className="agent-before">
              <summary>Note before this change</summary>
              <p>{(action.before as { title?: string })?.title}</p>
              <pre className="wf-note-before">
                {(action.before as { content?: string })?.content}
              </pre>
            </details>
          )}
          {p.kind === "note_delete" && (
            <div className="agent-preview-note">
              <strong>{(action.before as { title?: string })?.title}</strong>
              <p>Permanently delete this note. This cannot be undone.</p>
            </div>
          )}
          {p.kind === "focus_start" && (
            <form
              onChange={() => setDirty(true)}
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                await perform("edit", {
                  minutes: Number(d.get("minutes")),
                  taskId: p.input.taskId,
                });
              }}
            >
              <fieldset disabled={!active || busy || working}>
                <label>
                  Focus duration (minutes)
                  <input
                    name="minutes"
                    type="number"
                    min={1}
                    max={180}
                    defaultValue={p.input.minutes}
                    required
                  />
                </label>
                <p>
                  The timer starts only after approval. Early-ended sessions do
                  not count as completed.
                </p>
                {p.input.taskId && (
                  <Link href={"/dashboard/tasks/" + p.input.taskId}>
                    Associated task
                  </Link>
                )}
                <button
                  className="button secondary"
                  type="submit"
                  disabled={!dirty}
                >
                  Update preview
                </button>
              </fieldset>
            </form>
          )}
          {p.kind === "focus_end" && (
            <div className="agent-preview-note">
              <strong>
                {(action.before as FocusView)?.taskTitle ||
                  "Open focus session"}
              </strong>
              <p>
                {Math.round(
                  ((action.before as FocusView)?.durationMs ?? 0) / 60000,
                )}{" "}
                minutes · {(action.before as FocusView)?.status}
              </p>
              <p>
                Started{" "}
                {new Date(
                  (action.before as FocusView).createdAt,
                ).toLocaleString(undefined, { timeZone: action.timezone })}{" "}
                · {action.timezone}
              </p>
              <p>
                End this exact session. If time remains, it will be cancelled
                and excluded from completed totals.
              </p>
            </div>
          )}
          {task && (
            <form
              onChange={() => setDirty(true)}
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                try {
                  const input: TaskInput = {
                    title: String(d.get("title")),
                    description:
                      String(d.get("description") || "").trim() || null,
                    priority: String(
                      d.get("priority"),
                    ) as TaskInput["priority"],
                    status: String(d.get("status")) as TaskInput["status"],
                    due_at: instant(
                      String(d.get("deadline") || ""),
                      action.timezone,
                    ),
                  };
                  await perform("edit", input);
                } catch {
                  setError(
                    "Choose an unambiguous local date/time, or clear the deadline.",
                  );
                }
              }}
            >
              <fieldset disabled={!active || busy || working}>
                <label>
                  Task title
                  <input
                    name="title"
                    defaultValue={task.title}
                    maxLength={160}
                    required
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={task.description ?? ""}
                    maxLength={2000}
                  />
                </label>
                <div className="agent-field-pair">
                  <label>
                    Priority
                    <select name="priority" defaultValue={task.priority}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select name="status" defaultValue={task.status}>
                      <option value="todo">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="done">Completed</option>
                    </select>
                  </label>
                </div>
                <label>
                  Deadline · {action.timezone}
                  <input
                    type="datetime-local"
                    name="deadline"
                    defaultValue={local(task.due_at, action.timezone)}
                  />
                </label>
                <button
                  className="button secondary"
                  type="submit"
                  disabled={!dirty}
                >
                  Update preview
                </button>
              </fieldset>
            </form>
          )}
          {p.kind === "reminders" && (
            <details className="agent-before">
              <summary>Existing reminders before this change</summary>
              {(
                (action.before as {
                  id: string;
                  spec: {
                    kind: string;
                    offset: number;
                    at: string | null;
                    timezone: string;
                  };
                }[]) ?? []
              ).map((r) => (
                <p key={r.id}>
                  {r.spec.kind === "due"
                    ? `${r.spec.offset} minutes before deadline`
                    : `${r.spec.at} - ${r.spec.timezone}`}
                  {!p.specs.some((s) => s.id === r.id)
                    ? " - will be cancelled"
                    : ""}
                </p>
              ))}
              <Link href="/dashboard/reminders">Open reminders</Link>
            </details>
          )}
          {p.kind === "reminders" && (
            <form
              onChange={() => setDirty(true)}
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                try {
                  const specs = p.specs.map((s, i) => ({
                    ...s,
                    offset: Number(d.get("offset-" + i)),
                    at:
                      s.kind === "custom"
                        ? instant(String(d.get("at-" + i)), action.timezone)
                        : null,
                  }));
                  await perform("edit", specs);
                } catch {
                  setError("Choose an unambiguous reminder date/time.");
                }
              }}
            >
              <fieldset disabled={!active || busy || working}>
                {p.specs.length ? (
                  p.specs.map((s, i) => (
                    <div className="agent-reminder-preview" key={s.id}>
                      <strong>
                        {s.kind === "due"
                          ? "Before the task deadline"
                          : "At a specific time"}
                      </strong>
                      {s.kind === "due" ? (
                        <label>
                          Minutes before
                          <input
                            type="number"
                            name={"offset-" + i}
                            defaultValue={s.offset}
                            min={0}
                            max={10080}
                            required
                          />
                        </label>
                      ) : (
                        <>
                          <input
                            type="hidden"
                            name={"offset-" + i}
                            value={s.offset}
                          />
                          <label>
                            Reminder time · {s.timezone}
                            <input
                              type="datetime-local"
                              name={"at-" + i}
                              defaultValue={local(s.at, action.timezone)}
                              required
                            />
                          </label>
                        </>
                      )}
                      <p>
                        Channels:{" "}
                        {Object.entries(s.channels)
                          .filter(([, v]) => v)
                          .map(([k]) => (k === "inApp" ? "in-app" : k))
                          .join(", ")}
                        . External delivery requires setup.
                      </p>
                    </div>
                  ))
                ) : (
                  <p>
                    The selected reminder will be cancelled. Other listed
                    reminders remain unchanged.
                  </p>
                )}
                <button
                  className="button secondary"
                  type="submit"
                  disabled={!dirty}
                >
                  Update reminder preview
                </button>
              </fieldset>
            </form>
          )}
          {p.kind === "plan_save" && (
            <div onChange={() => setDirty(true)}>
              <PlanEditor
                action={action}
                busy={!active || busy || working}
                onSave={(edits) => perform("edit", edits)}
              />
            </div>
          )}
          {p.kind === "notification" && (
            <p>
              {p.mode === "snooze"
                ? `Snooze for ${p.minutes} minutes from approval.`
                : "Mark this notification as read."}{" "}
              {(action.before as { title?: string })?.title}
            </p>
          )}
          {p.kind === "task_delete" && (
            <p>
              Delete this owned task and cancel its future reminders. This
              cannot be undone here.
            </p>
          )}
          <div className="agent-approval-controls">
            <p>
              {dirty
                ? "Update the preview to validate your edits before approving."
                : "Approval applies only to this exact saved preview."}
            </p>
            {action.requiresDateConfirmation && (
              <label className="agent-confirm-check">
                <input
                  type="checkbox"
                  checked={dates}
                  disabled={!active || working || busy || dirty}
                  onChange={(e) => setDates(e.target.checked)}
                />
                I confirm these dates, times and timezone ({action.timezone}).
              </label>
            )}
            {action.destructive && (
              <label>
                Type{" "}
                {p.kind === "task_delete" || p.kind === "note_delete"
                  ? "DELETE"
                  : "SAVE PLAN"}{" "}
                to confirm
                <input
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  disabled={!active || working || busy || dirty}
                  autoComplete="off"
                />
              </label>
            )}
            <div>
              <button
                className="button secondary"
                disabled={!active || busy || working}
                onClick={() => void perform("cancel")}
              >
                Cancel action
              </button>
              <button
                className="button primary"
                disabled={
                  !active ||
                  busy ||
                  working ||
                  dirty ||
                  (action.requiresDateConfirmation && !dates) ||
                  (action.destructive &&
                    phrase !==
                      (p.kind === "task_delete" || p.kind === "note_delete"
                        ? "DELETE"
                        : "SAVE PLAN"))
                }
                onClick={() => void perform("approve")}
              >
                {working ? "Checking…" : "Approve action"}
                <Icon name="check" width={15} />
              </button>
            </div>
          </div>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </m.article>
  );
}
export function AgentWorkspace() {
  const [history, setHistory] = useState<{ id: string; title: string }[]>([]),
    [current, setCurrent] = useState<ConversationView | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [configured, setConfigured] = useState<boolean | null>(null),
    [deleting, setDeleting] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const deletion = useRef<HTMLDialogElement>(null);
  const currentRef = useRef<string | null>(null);
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (focusNext.current) {
      document
        .getElementById("agent-action-" + focusNext.current)
        ?.focus({ preventScroll: true });
      focusNext.current = null;
    }
  }, [current]);
  const retry = useRef<{
    id: string;
    text: string;
    conversationId: string | null;
  } | null>(null);
  async function list() {
    const data = await api({ action: "list" });
    setHistory(data.conversations);
    setConfigured(data.configured);
  }
  useEffect(() => {
    let active = true;
    api({ action: "list" })
      .then((d) => {
        if (active) {
          setHistory(d.conversations);
          setConfigured(d.configured);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (deleting) deletion.current?.showModal();
    else deletion.current?.close();
  }, [deleting]);
  async function load(id: string) {
    setBusy("load");
    setError("");
    try {
      const c = await api({ action: "load", conversationId: id });
      setCurrent(c);
      currentRef.current = id;
      retry.current = null;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to open this conversation.",
      );
    } finally {
      setBusy("");
    }
  }
  async function changed(focusId?: string) {
    if (currentRef.current) {
      const c = await api({
        action: "load",
        conversationId: currentRef.current,
      });
      focusNext.current = focusId ?? null;
      setCurrent(c);
    }
    await list();
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    const value = text.trim();
    setBusy("message");
    setError("");
    const request =
      retry.current?.text === value &&
      retry.current.conversationId === currentRef.current
        ? retry.current
        : {
            id: crypto.randomUUID(),
            text: value,
            conversationId: currentRef.current,
          };
    retry.current = request;
    try {
      const c = await api({
        action: "message",
        conversationId: request.conversationId,
        requestId: request.id,
        text: value,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      currentRef.current = c.id;
      setCurrent(c);
      setText("");
      retry.current = null;
      await list();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Your message remains here.",
      );
      if (e instanceof RequestFailure) retry.current = null;
      await list().catch(() => {});
    } finally {
      setBusy("");
    }
  }
  function start() {
    setCurrent(null);
    currentRef.current = null;
    setText("");
    setError("");
    retry.current = null;
    textarea.current?.focus();
  }
  async function remove() {
    if (!deleting) return;
    setBusy("delete");
    setError("");
    try {
      await api({ action: "delete_conversation", conversationId: deleting });
      if (currentRef.current === deleting) start();
      setDeleting(null);
      await list();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to delete this conversation.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="agent-workspace">
      <header className="agent-header">
        <div>
          <span className="agent-kicker">
            <Icon name="spark" width={16} />
            ActionFlow Assistant
          </span>
          <h1>
            A little help.
            <br className="agent-mobile-break" /> A clearer next step.
          </h1>
          <p>
            Your real workspace. Your decisions. Every change needs your
            approval.
          </p>
        </div>
        <button className="button secondary" onClick={start} disabled={!!busy}>
          <Icon name="plus" width={16} />
          New conversation
        </button>
      </header>
      <div className="agent-layout">
        <aside
          className="agent-history"
          aria-label="Recent assistant conversations"
        >
          <h2>Recent conversations</h2>
          <p>Private to your account. Retained up to 30 days.</p>
          {history.length ? (
            history.map((c) => (
              <div
                key={c.id}
                className={current?.id === c.id ? "is-current" : ""}
              >
                <button
                  disabled={!!busy}
                  onClick={() => void load(c.id)}
                  aria-current={current?.id === c.id ? "true" : undefined}
                >
                  {c.title}
                </button>
                <button
                  className="icon-button"
                  aria-label={"Delete conversation: " + c.title}
                  disabled={!!busy}
                  onClick={() => setDeleting(c.id)}
                >
                  <Icon name="close" width={14} />
                </button>
              </div>
            ))
          ) : (
            <p>Your conversations will appear here.</p>
          )}
        </aside>
        <section className="agent-canvas" aria-label="Assistant conversation">
          <div className="agent-context-line">
            <span className="tiny-dot" />
            Tasks · Notes · Focus · Plans · Insights
          </div>
          {configured === false && (
            <p className="setup-notice" role="status">
              OpenAI setup is required on the server. Your workspace features
              remain available.
            </p>
          )}
          {!current && (
            <div className="agent-welcome">
              <span>
                <Icon name="spark" width={30} />
              </span>
              <h2>What would make today easier?</h2>
              <p>
                Ask about a deadline, find what needs your attention, or prepare
                a change. I’ll show the details before anything is saved.
              </p>
              <div className="agent-prompt-list">
                {prompts.map((p) => (
                  <button
                    key={p}
                    disabled={!!busy || configured === false}
                    onClick={() => {
                      setText(p);
                      textarea.current?.focus();
                    }}
                  >
                    {p}
                    <Icon name="arrow" width={13} />
                  </button>
                ))}
              </div>
              <small>
                Notes, Focus, workspace Search and Insights are available. Every
                change needs your approval.
              </small>
            </div>
          )}
          <div
            className="agent-messages"
            aria-live="polite"
            aria-relevant="additions"
          >
            {current?.messages.map((message) => (
              <m.div
                className={`agent-message role-${message.role}`}
                key={message.id}
                initial={{ y: 6 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <span>{message.role === "user" ? "You" : "ActionFlow"}</span>
                <p>{message.text}</p>
                {message.links && message.links.length > 0 && (
                  <div className="agent-record-links">
                    {message.links.map((l) => (
                      <Link key={l.href} href={l.href}>
                        {l.label}
                        <Icon name="arrow" width={12} />
                      </Link>
                    ))}
                  </div>
                )}
              </m.div>
            ))}
          </div>
          {busy === "message" && (
            <div className="agent-thinking" role="status">
              <Icon name="loading" className="spinner" width={17} />
              Checking your request and authorized workspace tools…
            </div>
          )}
          {current?.actions.map((action) => (
            <ActionCard
              key={action.id + "-" + action.revision + "-" + action.status}
              action={action}
              busy={!!busy}
              onChange={changed}
            />
          ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
              {error.toLowerCase().includes("session") && (
                <>
                  {" "}
                  <Link href="/login" target="_blank">
                    Sign in in a new tab
                  </Link>
                </>
              )}
            </p>
          )}
          <form className="agent-composer" onSubmit={send}>
            <label htmlFor="agent-message">Ask your workspace assistant</label>
            <textarea
              ref={textarea}
              id="agent-message"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (retry.current?.text !== e.target.value)
                  retry.current = null;
              }}
              maxLength={4000}
              rows={3}
              disabled={!!busy}
              placeholder="What needs your attention?"
            />
            <footer>
              <small>
                Don’t paste passwords or private keys. Relevant workspace data
                is sent to OpenAI.
              </small>
              <button
                className="button primary"
                disabled={!!busy || configured !== true || !text.trim()}
                type="submit"
              >
                {busy === "message"
                  ? "Working…"
                  : error
                    ? "Retry message"
                    : "Send"}
                <Icon name="right" width={16} />
              </button>
            </footer>
          </form>
          <p className="agent-safety-note">
            AI text is guidance. Only a confirmed action receipt means a change
            was committed.
          </p>
        </section>
      </div>
      <dialog
        ref={deletion}
        className="task-dialog delete-dialog"
        aria-label="Delete assistant conversation"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setDeleting(null);
        }}
      >
        <h2>Delete this conversation?</h2>
        <p>
          Its chat and action history will be removed. Existing tasks, plans and
          reminders stay in your workspace.
        </p>
        <div className="dialog-actions">
          <button
            className="button secondary"
            onClick={() => setDeleting(null)}
            disabled={!!busy}
          >
            Keep conversation
          </button>
          <button
            className="button danger"
            onClick={() => void remove()}
            disabled={!!busy}
          >
            Delete conversation
          </button>
        </div>
      </dialog>
    </div>
  );
}
