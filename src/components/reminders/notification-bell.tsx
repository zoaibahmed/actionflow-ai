"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { m } from "motion/react";
import { Bell, X } from "lucide-react";
import { reminderApi } from "./reminder-fields";
type Notice = {
  _id: string;
  task_id: string;
  title: string;
  readAt: string | null;
  createdAt: string;
  version: number;
};
export function NotificationBell() {
  const [summary, setSummary] = useState<{
      unread: number;
      notifications: Notice[];
    }>({ unread: 0, notifications: [] }),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [pulse, setPulse] = useState(0);
  const previous = useRef(0),
    dialog = useRef<HTMLDialogElement>(null),
    button = useRef<HTMLButtonElement>(null),
    loading = useRef(false);
  async function refresh() {
    if (loading.current || document.visibilityState === "hidden") return;
    loading.current = true;
    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summary" }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not refresh notifications.");
      if (data.unread > previous.current) {
        setPulse((n) => n + 1);
        window.dispatchEvent(new Event("actionflow:notifications-arrived"));
      }
      previous.current = data.unread;
      setSummary(data);
      setError("");
    } catch {
      setError("Notifications could not refresh. Try again.");
    } finally {
      loading.current = false;
    }
  }
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const interval = setInterval(() => void refresh(), 60000);
    const update = () => void refresh();
    window.addEventListener("focus", update);
    window.addEventListener("actionflow:notifications-updated", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", update);
      window.removeEventListener("actionflow:notifications-updated", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  async function read(n: Notice) {
    if (!n.readAt)
      try {
        await reminderApi({
          action: "notification",
          id: n._id,
          operation: "read",
          version: n.version,
          requestId: crypto.randomUUID(),
        });
        await refresh();
      } catch {
        setError("This notification changed. Refresh to see its latest state.");
      }
  }
  return (
    <>
      <button
        ref={button}
        className="icon-button notification-control live-notification-bell"
        aria-label={`Notifications, ${summary.unread} unread`}
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
          void refresh();
        }}
      >
        <m.span
          key={`bell-${pulse}`}
          initial={{rotate:0}}
          animate={pulse ? { rotate: [0, -12, 9, 0] } : { rotate: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Bell size={18} />
        </m.span>
        {summary.unread > 0 && (
          <m.span
            className="notification-badge"
            key={`count-${summary.unread}`}
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
          >
            {summary.unread > 99 ? "99+" : summary.unread}
          </m.span>
        )}
      </button>
      <dialog
        ref={dialog}
        className="notification-popover"
        aria-label="Notification center"
        onClose={() => {
          setOpen(false);
          button.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <header>
          <div>
            <span className="stream-kicker">A little nudge</span>
            <h2>Your reminder stream</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close notifications"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {error && (
              <p role="alert" className="form-error">
                {error}
                <button className="text-link" onClick={() => void refresh()}>
                  Retry
                </button>
              </p>
            )}
            {summary.notifications.length ? (
              summary.notifications.map((n) => (
                <article
                  className="bell-notice"
                  data-unread={!n.readAt}
                  key={n._id}
                >
                  <Link
                    href={`/dashboard/tasks/${n.task_id}`}
                    onClick={() => {
                      void read(n);
                      dialog.current?.close();
                    }}
                  >
                    {n.title}
                  </Link>
                  <small>{new Date(n.createdAt).toLocaleString()}</small>
                  {!n.readAt && (
                    <button className="text-link" onClick={() => void read(n)}>
                      Mark read
                    </button>
                  )}
                </article>
              ))
            ) : (
              <div className="stream-empty">
                <Bell size={26} />
                <h3>A little peace of mind.</h3>
                <p>
                  Your real reminders will arrive here when the processor runs.
                </p>
              </div>
            )}
          </m.div>
        )}
        <footer>
          <Link
            className="text-link"
            href="/dashboard/notifications"
            onClick={() => dialog.current?.close()}
          >
            Open full stream
          </Link>
          <Link
            className="text-link"
            href="/dashboard/settings"
            onClick={() => dialog.current?.close()}
          >
            Preferences
          </Link>
        </footer>
      </dialog>
    </>
  );
}
