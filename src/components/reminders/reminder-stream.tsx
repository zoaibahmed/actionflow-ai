"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { m, AnimatePresence } from "motion/react";
import { Bell, Check, Clock3, Plus, Repeat2, Settings2, X } from "lucide-react";
import { ReminderFields, reminderApi } from "./reminder-fields";
import {
  notificationDefaults,
  notificationPreferencesSchema,
  offsets,
  type NotificationPreferences,
  type ReminderDoc,
  type NotificationDoc,
  type DeliveryDoc,
  type SeriesDoc,
  type SeriesInput,
  type ReminderSpec,
} from "@/lib/reminders/schema";
import type { Task } from "@/types/task";
type Json<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
type Data = {
  unread: number;
  notifications: Json<NotificationDoc>[];
  nextCursor: { at: string; id: string } | null;
  preferences: NotificationPreferences;
  preferencesVersion: number;
  tasks: Task[];
  reminders: Json<ReminderDoc>[];
  deliveries: Json<DeliveryDoc>[];
  series: Json<SeriesDoc>[];
  worker: { finishedAt?: string; startedAt?: string } | null;
  configuration: { email: boolean; push: boolean; publicKey: string };
  subscriptions: number;
};
type View = "upcoming" | "notifications" | "recurring" | "settings";
export function ReminderStream({
  initialView = "upcoming",
}: {
  initialView?: View;
}) {
  const [data, setData] = useState<Data | null>(null),
    [view, setView] = useState<View>(initialView),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [preferences, setPreferences] =
      useState<NotificationPreferences>(notificationDefaults),
    [taskId, setTaskId] = useState(""),
    [editingTask, setEditingTask] = useState<string | null>(null),
    [drafts, setDrafts] = useState<ReminderSpec[] | undefined>(undefined),
    [seriesDraft, setSeriesDraft] = useState<SeriesInput | null>(null),
    [permission, setPermission] = useState("not checked");
  const [reminderVersion, setReminderVersion] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(0);
  const modal = useRef<HTMLDialogElement>(null),
    previousFocus = useRef<HTMLElement | null>(null),
    init = useRef(false),
    savingRequest = useRef("");
  async function load(keepPreferences = false) {
    try {
      const next: Data = await reminderApi({ action: "load" });
      setData(next);
      setFetchedAt(Date.now());
      setPermission(
        "Notification" in window ? Notification.permission : "unsupported",
      );
      if (!keepPreferences)
        setPreferences({
          ...next.preferences,
          timezone: next.preferencesVersion
            ? next.preferences.timezone
            : Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load the reminder stream.",
      );
    }
  }
  useEffect(() => {
    if (init.current) return;
    init.current = true;
    void load();
  }, []);
  useEffect(() => {
    if (editingTask) {
      previousFocus.current = document.activeElement as HTMLElement;
      modal.current?.showModal();
    } else {
      modal.current?.close();
      previousFocus.current?.focus();
    }
  }, [editingTask]);
  useEffect(() => {
    const update = () => void load(true);
    window.addEventListener("actionflow:notifications-arrived", update);
    return () =>
      window.removeEventListener("actionflow:notifications-arrived", update);
  }, []);
  const focused = data?.tasks.find((t) => t.id === editingTask);
  function time(v: string) {
    try {
      return new Intl.DateTimeFormat("en", {
        timeZone: preferences.timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v));
    } catch {
      return new Date(v).toLocaleString();
    }
  }
  async function act(key: string, body: unknown, success: string) {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await reminderApi(body);
      await load(true);
      setMessage(success);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your request could not be completed.",
      );
    } finally {
      setBusy("");
    }
  }
  async function notice(
    n: Json<NotificationDoc>,
    operation: "read" | "unread" | "dismiss" | "snooze",
  ) {
    if (operation === "snooze") {
      if (!savingRequest.current) savingRequest.current = crypto.randomUUID();
      await act(
        n._id,
        {
          action: "notification",
          id: n._id,
          operation,
          version: n.version,
          requestId: savingRequest.current,
          minutes: preferences.snoozeMinutes,
        },
        `Snoozed for ${preferences.snoozeMinutes} minutes. Delivery follows your quiet-hour policy.`,
      );
      savingRequest.current = "";
    } else
      await act(
        n._id,
        {
          action: "notification",
          id: n._id,
          operation,
          version: n.version,
          requestId: crypto.randomUUID(),
        },
        operation === "dismiss"
          ? "Notification dismissed."
          : "Read state saved.",
      );
  }
  async function savePreferences() {
    const parsed = notificationPreferencesSchema.safeParse(preferences);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check preferences.");
      return;
    }
    await act(
      "preferences",
      {
        action: "preferences",
        value: parsed.data,
        version: data!.preferencesVersion,
      },
      "Notification preferences saved.",
    );
  }
  async function enablePush() {
    setBusy("push");
    setError("");
    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window) ||
        !window.isSecureContext
      )
        throw new Error(
          "Browser push is unavailable here. Use a supported browser over HTTPS (localhost is allowed).",
        );
      if (!data?.configuration.push)
        throw new Error("Browser push is not configured on this server.");
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted")
        throw new Error(
          "Browser permission was not granted. You can still use in-app reminders; change browser site permissions to try push again.",
        );
      const registration =
        await navigator.serviceWorker.register("/reminder-sw.js");
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const str = data.configuration.publicKey
            .replace(/-/g, "+")
            .replace(/_/g, "/"),
          raw = atob(str + "=".repeat((4 - (str.length % 4)) % 4));
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
        });
      }
      await reminderApi({
        action: "subscribe",
        subscription: subscription.toJSON(),
      });
      const value = { ...preferences, push: true };
      await reminderApi({
        action: "preferences",
        value,
        version: data.preferencesVersion,
      });
      setPreferences(value);
      await load(true);
      setMessage(
        "This browser is subscribed. Provider acceptance is not a guarantee of device delivery.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not enable browser reminders.",
      );
    } finally {
      setBusy("");
    }
  }
  async function unsubscribe() {
    setBusy("push");
    setError("");
    try {
      const registration =
          await navigator.serviceWorker.getRegistration("/reminder-sw.js"),
        sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await reminderApi({ action: "unsubscribe", endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      await load(true);
      setMessage("This browser is unsubscribed. Other devices are unchanged.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unsubscribe.");
    } finally {
      setBusy("");
    }
  }
  function startSeries(existing?: Json<SeriesDoc>) {
    if (existing) {
      setSeriesDraft({ ...existing.input, version: existing.version });
      return;
    }
    const selected =
      data?.tasks.find((t) => t.id === taskId) ||
      data?.tasks.find((t) => t.status !== "done");
    if (!selected) {
      setError("Create an unfinished task to use as a series template first.");
      return;
    }
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: preferences.timezone,
    }).format(new Date());
    setSeriesDraft({
      id: crypto.randomUUID(),
      version: 0,
      templateTaskId: selected.id,
      title: selected.title,
      description: selected.description,
      priority: selected.priority,
      frequency: "weekly",
      interval: 1,
      start: date,
      end: null,
      time: "09:00",
      timezone: preferences.timezone,
      reminderOffsets: [],
      channels: { inApp: true, push: false, email: false },
      skipInvalidDates: true,
    });
  }
  const pending =
    data?.reminders.filter((r) =>
      ["pending", "processing"].includes(r.status),
    ) ?? [];
  return (
    <div className="reminder-stream">
      <header className="stream-header">
        <div>
          <span className="stream-kicker">
            <Bell size={14} /> The Reminder Stream
          </span>
          <h1>A little less to remember.</h1>
          <p>Thoughtful nudges. Your timing. Room to get on with life.</p>
        </div>
        <div className="stream-header-meta">
          <strong>{data?.unread ?? "—"}</strong>
          <span>unread reminders</span>
          <button
            className="text-link"
            disabled={!!busy}
            onClick={() => void load()}
          >
            Refresh stream
          </button>
        </div>
      </header>
      <nav className="stream-tabs" aria-label="Reminder workspace">
        {(
          [
            { id: "upcoming", label: "Upcoming", icon: Clock3 },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "recurring", label: "Recurring tasks", icon: Repeat2 },
            { id: "settings", label: "Preferences", icon: Settings2 },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            aria-current={view === tab.id ? "page" : undefined}
            onClick={() => {
              setView(tab.id);
              setMessage("");
            }}
          >
            <tab.icon size={15} />
            {tab.label}
            {view === tab.id && (
              <m.span
                layoutId="reminder-stream-tab"
                className="stream-tab-indicator"
              />
            )}
          </button>
        ))}
      </nav>
      <div className="stream-feedback" aria-live="polite">
        {error && (
          <p className="form-error" role="alert">
            {error}
            <button className="text-link" onClick={() => void load(true)}>
              Refresh saved records
            </button>
          </p>
        )}
        {message && (
          <p className="stream-success">
            <Check size={15} />
            {message}
          </p>
        )}
      </div>
      {!data ? (
        <div className="stream-loading" role="status">
          Opening your reminder stream…
        </div>
      ) : (
        <>
          <div className="stream-processor-status">
            <span
              className={
                data.worker?.finishedAt &&
                fetchedAt - Date.parse(data.worker.finishedAt) < 180000
                  ? "tiny-dot"
                  : "stream-offline-dot"
              }
            />
            {data.worker?.finishedAt
              ? `Processor last finished ${time(data.worker.finishedAt)}`
              : "Processor has not completed a run yet."}
            <small>
              Delivery needs a running local worker or configured production
              scheduler. Quiet hours defer, never discard.
            </small>
          </div>
          <AnimatePresence mode="wait">
            <m.section
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {view === "upcoming" && (
                <div className="stream-main-layout">
                  <section className="stream-path">
                    <div className="stream-section-heading">
                      <h2>On the horizon</h2>
                      <span>{pending.length} scheduled</span>
                    </div>
                    {pending.length ? (
                      pending.map((r) => (
                        <m.article layout className="stream-node" key={r._id}>
                          <div className="stream-time">
                            <Clock3 size={14} />
                            {time(r.nextAttemptAt)}
                          </div>
                          <div className="stream-node-body">
                            <div className="stream-node-heading">
                              <h3>
                                {data.tasks.find((t) => t.id === r.task_id)
                                  ?.title ?? "Task no longer available"}
                              </h3>
                              <span className="stream-status">
                                {r.status === "processing"
                                  ? "Processing channels"
                                  : "Scheduled"}
                              </span>
                            </div>
                            <p>
                              {r.spec.kind === "due"
                                ? `${r.spec.offset} minutes before deadline`
                                : "Custom time"}{" "}
                              · {r.spec.timezone}
                            </p>
                            {r.reason && (
                              <p className="stream-policy">
                                {r.reason}
                                {r.deferredFrom &&
                                  ` · originally ${time(r.deferredFrom)}`}
                              </p>
                            )}
                            <div className="stream-actions">
                              <Link
                                className="text-link"
                                href={`/dashboard/tasks/${r.task_id}`}
                              >
                                Open task
                              </Link>
                              <button
                                className="text-link"
                                onClick={() => {
                                  setDrafts(undefined);
                                  setEditingTask(r.task_id);
                                }}
                              >
                                Edit reminders
                              </button>
                            </div>
                          </div>
                        </m.article>
                      ))
                    ) : (
                      <Empty
                        title="A little breathing room."
                        text="Choose a task and set a reminder. Nothing is scheduled automatically."
                      />
                    )}
                  </section>
                  <aside className="stream-compose">
                    <Bell size={22} />
                    <h2>Keep it off your mind.</h2>
                    <p>
                      Attach a precise reminder to something you want to come
                      back to.
                    </p>
                    <label>
                      Choose an unfinished task
                      <select
                        value={taskId}
                        onChange={(e) => setTaskId(e.target.value)}
                      >
                        <option value="">Select a task</option>
                        {data.tasks
                          .filter((t) => t.status !== "done")
                          .map((t) => (
                            <option value={t.id} key={t.id}>
                              {t.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      className="button primary"
                      disabled={!taskId}
                      onClick={() => {
                        setDrafts(undefined);
                        setEditingTask(taskId);
                      }}
                    >
                      <Plus size={15} /> Set a reminder
                    </button>
                    <Link className="text-link" href="/dashboard/tasks">
                      Create a task
                    </Link>
                    <small>
                      At most five active reminders per task. Existing
                      notification history stays available after task completion
                      or deletion.
                    </small>
                  </aside>
                  <section className="stream-delivery-history">
                    <h2>Recent scheduling history</h2>
                    {data.reminders
                      .filter(
                        (r) => !["pending", "processing"].includes(r.status),
                      )
                      .slice(-30)
                      .reverse()
                      .map((r) => (
                        <div key={r._id}>
                          <strong>
                            {data.tasks.find((t) => t.id === r.task_id)
                              ?.title ?? "Task unavailable"}
                          </strong>
                          <small>
                            {r.status === "delivered" ? "Processed" : r.status}{" "}
                            · {time(r.scheduledAt)}{" "}
                            {r.reason && `· ${r.reason}`}
                          </small>
                          {data.deliveries
                            .filter(
                              (d) =>
                                d.reminder_id === r._id &&
                                d.revision === r.revision,
                            )
                            .map((d) => (
                              <small key={d._id}>
                                {d.channel}:{" "}
                                {d.status === "accepted"
                                  ? "Provider accepted · delivery unconfirmed"
                                  : d.status}{" "}
                                {d.error && `· ${d.error}`}
                              </small>
                            ))}
                        </div>
                      ))}
                    {!data.reminders.length && <p>No delivery history yet.</p>}
                  </section>
                </div>
              )}
              {view === "notifications" && (
                <div className="stream-notification-view">
                  <div className="stream-section-heading">
                    <div>
                      <h2>Your recent nudges</h2>
                      <p>
                        {data.unread
                          ? "Choose what to return to next."
                          : "All caught up. Your read notifications remain here."}
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={!!busy || !data.unread}
                      onClick={() =>
                        void act(
                          "readAll",
                          { action: "readAll" },
                          "All current notifications marked read.",
                        )
                      }
                    >
                      Mark all as read
                    </button>
                  </div>
                  <div className="stream-path">
                    {data.notifications.length ? (
                      data.notifications.map((n) => (
                        <m.article
                          layout
                          className="stream-node stream-notice"
                          data-unread={!n.readAt}
                          key={n._id}
                        >
                          <div className="stream-time">{time(n.createdAt)}</div>
                          <div className="stream-node-body">
                            <div className="stream-node-heading">
                              <Link
                                href={`/dashboard/tasks/${n.task_id}`}
                                className="stream-notice-title"
                              >
                                {n.title}
                              </Link>
                              <span className="stream-unread-indicator">
                                {n.readAt ? "Read" : "Unread"}
                              </span>
                            </div>
                            <p>
                              {n.snoozedAt
                                ? "Snoozed. A new reminder is scheduled separately."
                                : "A real reminder from your workspace."}
                            </p>
                            <div className="stream-actions">
                              <button
                                disabled={!!busy}
                                className="text-link"
                                onClick={() =>
                                  void notice(n, n.readAt ? "unread" : "read")
                                }
                              >
                                {n.readAt ? "Mark unread" : "Mark read"}
                              </button>
                              <button
                                disabled={!!busy || !!n.snoozedAt}
                                className="text-link"
                                onClick={() => void notice(n, "snooze")}
                              >
                                Snooze {preferences.snoozeMinutes} min
                              </button>
                              <button
                                disabled={!!busy}
                                className="text-link"
                                onClick={() => void notice(n, "dismiss")}
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        </m.article>
                      ))
                    ) : (
                      <Empty
                        title="Your stream is quiet."
                        text="When a scheduled reminder is processed, its in-app notification will appear here."
                      />
                    )}
                  </div>
                  {data.nextCursor && (
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={async () => {
                        setBusy("more");
                        try {
                          const next: Data = await reminderApi({
                            action: "load",
                            cursor: data.nextCursor,
                          });
                          setData({
                            ...data,
                            notifications: [
                              ...data.notifications,
                              ...next.notifications,
                            ],
                            nextCursor: next.nextCursor,
                            unread: next.unread,
                          });
                        } catch {
                          setError(
                            "Could not load more history. Please retry.",
                          );
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      Load older notifications
                    </button>
                  )}
                </div>
              )}
              {view === "settings" && (
                <div className="stream-settings">
                  <section>
                    <h2>Nudges that fit your life.</h2>
                    <p>
                      Every channel has its own permission and delivery status.
                      Disabling a selected channel defers its pending
                      deliveries; it does not silently discard them.
                    </p>
                    <fieldset
                      disabled={!!busy}
                      className="stream-preference-fields"
                    >
                      {(["inApp", "push", "email"] as const).map((c) => (
                        <label className="stream-switch" key={c}>
                          <span>
                            {c === "inApp"
                              ? "In-app notifications"
                              : c === "push"
                                ? "Browser push"
                                : "Email reminders"}
                            <small>
                              {c === "email" && !data.configuration.email
                                ? "Email reminders are unavailable until email delivery is configured."
                                : c === "push"
                                  ? "Requires this browser’s permission and a saved subscription."
                                  : "Created in MongoDB even while your browser is closed, when the processor runs."}
                            </small>
                          </span>
                          <input
                            type="checkbox"
                            checked={preferences[c]}
                            onChange={(e) =>
                              setPreferences({
                                ...preferences,
                                [c]: e.target.checked,
                              })
                            }
                          />
                        </label>
                      ))}
                      <div className="stream-settings-grid">
                        <label>
                          IANA timezone
                          <input
                            value={preferences.timezone}
                            onChange={(e) =>
                              setPreferences({
                                ...preferences,
                                timezone: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Default reminder
                          <select
                            value={preferences.defaultOffset}
                            onChange={(e) =>
                              setPreferences({
                                ...preferences,
                                defaultOffset: Number(e.target.value),
                              })
                            }
                          >
                            {offsets.map((n) => (
                              <option key={n} value={n}>
                                {n === 0
                                  ? "At due time"
                                  : `${n} minutes before`}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Snooze duration · minutes
                          <input
                            type="number"
                            min={1}
                            max={1440}
                            value={preferences.snoozeMinutes}
                            onChange={(e) =>
                              setPreferences({
                                ...preferences,
                                snoozeMinutes: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label className="stream-switch">
                        <span>
                          Quiet hours
                          <small>
                            Defer all noncritical reminders until this window
                            ends. Cross-midnight windows are supported.
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={preferences.quietEnabled}
                          onChange={(e) =>
                            setPreferences({
                              ...preferences,
                              quietEnabled: e.target.checked,
                            })
                          }
                        />
                      </label>
                      {preferences.quietEnabled && (
                        <div className="stream-settings-grid">
                          <label>
                            Quiet hours start
                            <input
                              type="time"
                              value={preferences.quietStart}
                              onChange={(e) =>
                                setPreferences({
                                  ...preferences,
                                  quietStart: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Quiet hours end
                            <input
                              type="time"
                              value={preferences.quietEnd}
                              onChange={(e) =>
                                setPreferences({
                                  ...preferences,
                                  quietEnd: e.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                      )}
                      <button
                        className="button primary"
                        onClick={() => void savePreferences()}
                      >
                        Save notification preferences
                      </button>
                    </fieldset>
                  </section>
                  <aside className="stream-browser-settings">
                    <Bell size={24} />
                    <h2>This browser</h2>
                    <p>
                      Get a nudge when this site is not the active tab.
                      Permission is requested only when you choose to enable
                      reminders.
                    </p>
                    <p>
                      Permission: <strong>{permission}</strong>
                      <br />
                      Saved devices on your account: {data.subscriptions}
                    </p>
                    {!data.configuration.push && (
                      <p className="stream-policy">
                        Web push needs server-side VAPID configuration. In-app
                        reminders remain available.
                      </p>
                    )}
                    <button
                      className="button primary"
                      disabled={
                        !!busy ||
                        !data.configuration.push ||
                        permission === "unsupported"
                      }
                      onClick={() => void enablePush()}
                    >
                      Enable browser reminders
                    </button>
                    <button
                      className="button secondary"
                      disabled={!!busy || permission === "unsupported"}
                      onClick={() => void unsubscribe()}
                    >
                      Unsubscribe this browser
                    </button>
                    <small>
                      HTTPS and platform support required. On supported iOS
                      devices, install the site to the home screen first.
                      Acceptance by a push service does not confirm the device
                      displayed it.
                    </small>
                  </aside>
                </div>
              )}
              {view === "recurring" && (
                <div className="stream-recurring">
                  <div className="stream-section-heading">
                    <div>
                      <h2>A rhythm worth keeping.</h2>
                      <p>
                        Generate the next 14 days, preserve completed work, and
                        keep each occurrence editable.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => startSeries()}
                    >
                      <Plus size={15} /> New recurring series
                    </button>
                  </div>
                  {seriesDraft && (
                    <SeriesEditor
                      key={seriesDraft.id}
                      value={seriesDraft}
                      tasks={data.tasks}
                      onCancel={() => setSeriesDraft(null)}
                      onSave={async (value) => {
                        setBusy("series");
                        try {
                          await reminderApi({ action: "series", value });
                          setSeriesDraft(null);
                          await load(true);
                          setMessage(
                            "Series saved. Future occurrences are generated by the processor.",
                          );
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Could not save this series.",
                          );
                        } finally {
                          setBusy("");
                        }
                      }}
                      busy={!!busy}
                    />
                  )}
                  <div className="stream-path">
                    {data.series.length
                      ? data.series.map((s) => (
                          <article className="stream-node" key={s._id}>
                            <div className="stream-time">
                              <Repeat2 size={16} />
                              {s.status}
                            </div>
                            <div className="stream-node-body">
                              <h3>{s.input.title}</h3>
                              <p>
                                Every {s.input.interval}{" "}
                                {s.input.frequency === "daily"
                                  ? "day"
                                  : s.input.frequency === "weekly"
                                    ? "week"
                                    : s.input.frequency === "monthly"
                                      ? "month"
                                      : "year"}
                                {s.input.interval > 1 ? "s" : ""} ·{" "}
                                {s.input.time} · {s.input.timezone}
                              </p>
                              <small>
                                {s.input.start} to{" "}
                                {s.input.end ?? "no end date"} · Invalid
                                calendar/DST dates skipped.
                              </small>
                              <div className="stream-actions">
                                <button
                                  className="text-link"
                                  disabled={!!busy || s.status === "ended"}
                                  onClick={() => startSeries(s)}
                                >
                                  Edit series
                                </button>
                                <button
                                  className="text-link"
                                  disabled={!!busy || s.status === "ended"}
                                  onClick={() =>
                                    void act(
                                      s._id,
                                      {
                                        action: "seriesStatus",
                                        id: s._id,
                                        version: s.version,
                                        status:
                                          s.status === "paused"
                                            ? "active"
                                            : "paused",
                                      },
                                      s.status === "paused"
                                        ? "Series resumed."
                                        : "Series paused. Future reminders cancelled; existing tasks remain.",
                                    )
                                  }
                                >
                                  {s.status === "paused" ? "Resume" : "Pause"}
                                </button>
                                <button
                                  className="text-link"
                                  disabled={!!busy || s.status === "ended"}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "End this series? Future generation stops and pending reminders are cancelled. Existing task history stays.",
                                      )
                                    )
                                      void act(
                                        s._id,
                                        {
                                          action: "seriesStatus",
                                          id: s._id,
                                          version: s.version,
                                          status: "ended",
                                        },
                                        "Series ended. Existing task history is preserved.",
                                      );
                                  }}
                                >
                                  End series
                                </button>
                              </div>
                            </div>
                          </article>
                        ))
                      : !seriesDraft && (
                          <Empty
                            title="A fresh rhythm starts here."
                            text="Use an existing task as a template. Its original record stays unchanged; the series creates separate, traceable occurrences."
                          />
                        )}
                  </div>
                </div>
              )}
            </m.section>
          </AnimatePresence>
        </>
      )}
      <dialog
        ref={modal}
        className="task-dialog reminder-dialog"
        aria-label="Edit task reminders"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setEditingTask(null);
        }}
        onClose={() => setEditingTask(null)}
      >
        <header className="stream-section-heading">
          <div>
            <span className="stream-kicker">An intentional nudge</span>
            <h2>{focused?.title ?? "Task reminders"}</h2>
          </div>
          <button
            className="icon-button"
            disabled={!!busy}
            aria-label="Close reminder editor"
            onClick={() => setEditingTask(null)}
          >
            <X size={18} />
          </button>
        </header>
        <fieldset className="reminder-dialog-controls" disabled={!!busy}>
          {editingTask && (
            <ReminderFields
              key={editingTask}
              taskId={editingTask}
              value={drafts}
              onChange={setDrafts}
              onVersion={setReminderVersion}
            />
          )}
          <div className="stream-actions">
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => setEditingTask(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={!!busy || drafts === undefined}
              onClick={async () => {
                setBusy("save");
                try {
                  await reminderApi({
                    action: "save",
                    taskId: editingTask,
                    reminders: drafts,
                    reminderVersion,
                  });
                  setEditingTask(null);
                  await load(true);
                  setMessage("Reminder settings saved in your workspace.");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not save reminders.",
                  );
                } finally {
                  setBusy("");
                }
              }}
            >
              Save reminders
            </button>
          </div>
          {editingTask && error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
      </dialog>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="stream-empty">
      <span className="stream-empty-symbol">
        <Bell size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function SeriesEditor({
  value,
  tasks,
  onCancel,
  onSave,
  busy,
}: {
  value: SeriesInput;
  tasks: Task[];
  onCancel: () => void;
  onSave: (v: SeriesInput) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(value),
    [ack, setAck] = useState(false);
  function patch(v: Partial<SeriesInput>) {
    setDraft({ ...draft, ...v });
  }
  return (
    <form
      className="stream-series-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset disabled={busy}>
        <div className="stream-settings-grid">
          <label>
            Template task
            <select
              value={draft.templateTaskId}
              onChange={(e) => {
                const t = tasks.find((t) => t.id === e.target.value);
                if (t)
                  patch({
                    templateTaskId: t.id,
                    title: t.title,
                    description: t.description,
                    priority: t.priority,
                  });
              }}
            >
              {tasks.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Series title
            <input
              value={draft.title}
              required
              maxLength={160}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <label>
            Frequency
            <select
              value={`${draft.frequency}:${draft.interval}`}
              onChange={(e) => {
                const [frequency, interval] = e.target.value.split(":");
                patch({
                  frequency: frequency as SeriesInput["frequency"],
                  interval: Number(interval),
                });
              }}
            >
              <option value="daily:1">Every day</option>
              <option value="weekly:1">Every week</option>
              <option value="weekly:2">Every two weeks</option>
              <option value="monthly:1">Every month</option>
              <option value="yearly:1">Every year</option>
              {![
                "daily:1",
                "weekly:1",
                "weekly:2",
                "monthly:1",
                "yearly:1",
              ].includes(`${draft.frequency}:${draft.interval}`) && (
                <option value={`${draft.frequency}:${draft.interval}`}>
                  Custom interval
                </option>
              )}
            </select>
          </label>
          <label>
            Repeat every · interval
            <input
              type="number"
              min={1}
              max={30}
              value={draft.interval}
              onChange={(e) => patch({ interval: Number(e.target.value) })}
            />
          </label>
          <label>
            Start date
            <input
              type="date"
              required
              value={draft.start}
              onChange={(e) => patch({ start: e.target.value })}
            />
          </label>
          <label>
            End date · optional
            <input
              type="date"
              value={draft.end ?? ""}
              onChange={(e) => patch({ end: e.target.value || null })}
            />
          </label>
          <label>
            Preferred local time
            <input
              type="time"
              value={draft.time}
              required
              onChange={(e) => patch({ time: e.target.value })}
            />
          </label>
          <label>
            IANA timezone
            <input
              value={draft.timezone}
              required
              onChange={(e) => patch({ timezone: e.target.value })}
            />
          </label>
          <label>
            Priority
            <select
              value={draft.priority}
              onChange={(e) =>
                patch({ priority: e.target.value as SeriesInput["priority"] })
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <label>
          Task details
          <textarea
            value={draft.description ?? ""}
            maxLength={2000}
            onChange={(e) => patch({ description: e.target.value || null })}
          />
        </label>
        <div className="stream-recurrence-offsets">
          <strong>Reminders per occurrence · optional</strong>
          {offsets.map((n) => (
            <label key={n}>
              <input
                type="checkbox"
                checked={draft.reminderOffsets.includes(n)}
                disabled={
                  !draft.reminderOffsets.includes(n) &&
                  draft.reminderOffsets.length >= 5
                }
                onChange={(e) =>
                  patch({
                    reminderOffsets: e.target.checked
                      ? [...draft.reminderOffsets, n]
                      : draft.reminderOffsets.filter((v) => v !== n),
                  })
                }
              />
              {n === 0 ? "At due time" : `${n} min before`}
            </label>
          ))}
        </div>
        <div className="reminder-channel-choices">
          {(["inApp", "push", "email"] as const).map((c) => (
            <label key={c}>
              <input
                type="checkbox"
                checked={draft.channels[c]}
                onChange={(e) =>
                  patch({
                    channels: { ...draft.channels, [c]: e.target.checked },
                  })
                }
              />
              {c === "inApp"
                ? "In-app"
                : c === "push"
                  ? "Browser push"
                  : "Email"}
            </label>
          ))}
        </div>
        <div className="stream-policy">
          <p>
            Monthly dates such as the 31st skip months without that date.
            February 29 repeats only in leap years. Invalid or ambiguous DST
            times are skipped. Missed occurrences are not backfilled.
          </p>
          <p>
            {draft.version
              ? "Saving replaces future uncompleted copies unless individually edited. Completed and past occurrences stay unchanged."
              : "The original template task is unchanged. Separate occurrences are created within the next 14 days when the processor runs."}
          </p>
          <label>
            <input
              type="checkbox"
              checked={ack}
              required
              onChange={(e) => setAck(e.target.checked)}
            />
            I understand and accept this recurrence policy.
          </label>
        </div>
        <div className="stream-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" disabled={!ack}>
            Save recurring series
          </button>
        </div>
      </fieldset>
    </form>
  );
}
