"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ReminderSpec,
  NotificationPreferences,
} from "@/lib/reminders/schema";
import { notificationDefaults, offsets } from "@/lib/reminders/schema";
import { localInstant } from "@/lib/planner/schema";
import { Bell, Plus, Trash2 } from "lucide-react";
export async function reminderApi(body: unknown) {
  const response = await fetch("/api/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "Could not update reminders. Your changes are still here.",
    );
  window.dispatchEvent(new Event("actionflow:notifications-updated"));
  return data;
}
export function ReminderFields({
  taskId,
  value,
  onChange,
  onReady,
  onVersion,
}: {
  taskId: string | null;
  value: ReminderSpec[] | undefined;
  onChange: (v: ReminderSpec[]) => void;
  onReady?: (ready: boolean) => void;
  onVersion?: (version: number) => void;
}) {
  const [p, setP] = useState<NotificationPreferences>(notificationDefaults),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const [configuration, setConfiguration] = useState({
    email: false,
    push: false,
  });
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void load();
    async function load() {
      try {
        const data = await reminderApi(
          taskId ? { action: "task", taskId } : { action: "configuration" },
        );
        if (taskId) onChange(data.reminders);
        onVersion?.(data.reminderVersion ?? 0);
        setP({
          ...data.preferences,
          timezone: data.preferencesVersion
            ? data.preferences.timezone
            : Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setConfiguration(data.configuration);
        setLoaded(true);
        onReady?.(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load reminders.");
        onReady?.(false);
      }
    }
  }, [taskId, onChange, onReady, onVersion]);
  const list = value ?? [];
  function patch(i: number, fields: Partial<ReminderSpec>) {
    onChange(list.map((r, n) => (n === i ? { ...r, ...fields } : r)));
  }
  return (
    <details className="reminder-fields">
      <summary>
        <Bell size={15} /> Reminders{" "}
        <span>
          {loaded
            ? list.length
              ? " " + list.length + " saved or proposed"
              : "No reminder"
            : "Loading…"}
        </span>
      </summary>
      <p>
        Only reminders you choose are scheduled. Relative times follow a changed
        deadline; custom times stay fixed. Completion cancels pending reminders.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error} Close and reopen this task to retry; task editing remains
          available.
        </p>
      )}
      {list.map((r, i) => (
        <div className="reminder-field-row" key={r.id}>
          <div className="reminder-field-heading">
            <label>
              Timing
              <select
                value={r.kind === "custom" ? "custom" : String(r.offset)}
                onChange={(e) =>
                  patch(i, {
                    kind: e.target.value === "custom" ? "custom" : "due",
                    offset:
                      e.target.value === "custom" ? 0 : Number(e.target.value),
                  })
                }
              >
                {offsets.map((n) => (
                  <option key={n} value={n}>
                    {n === 0
                      ? "At task due time"
                      : n === 1440
                        ? "1 day before"
                        : n === 60
                          ? "1 hour before"
                          : `${n} minutes before`}
                  </option>
                ))}
                <option value="custom">Custom date and time</option>
              </select>
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove reminder ${i + 1}`}
              onClick={() => onChange(list.filter((_, n) => n !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <label>
            Reminder timezone
            <input
              value={r.timezone}
              onChange={(e) => patch(i, { timezone: e.target.value })}
            />
          </label>
          {r.kind === "custom" && (
            <label>
              Custom reminder time
              <input
                type="datetime-local"
                key={r.timezone}
                defaultValue={localDisplay(r.at, r.timezone)}
                onChange={(e) => {
                  try {
                    const [date, time] = e.target.value.split("T");
                    patch(i, {
                      at: new Date(
                        localInstant(date, time, r.timezone),
                      ).toISOString(),
                    });
                    setError("");
                  } catch {
                    patch(i, { at: null });
                    setError(
                      "Choose a valid, unambiguous local time and IANA timezone.",
                    );
                  }
                }}
              />
            </label>
          )}
          <div className="reminder-channel-choices">
            {(["inApp", "push", "email"] as const).map((channel) => (
              <label key={channel}>
                <input
                  type="checkbox"
                  checked={r.channels[channel]}
                  onChange={(e) =>
                    patch(i, {
                      channels: { ...r.channels, [channel]: e.target.checked },
                    })
                  }
                />
                {channel === "inApp"
                  ? "In-app"
                  : channel === "push"
                    ? "Browser push"
                    : "Email"}
              </label>
            ))}
          </div>
          <label className="reminder-past">
            <input
              type="checkbox"
              checked={r.acknowledgePast}
              onChange={(e) => patch(i, { acknowledgePast: e.target.checked })}
            />
            If this time is already past, I explicitly want it sent on the next
            processor run.
          </label>
        </div>
      ))}
      <button
        type="button"
        className="text-link"
        disabled={!loaded || list.length >= 5}
        onClick={() =>
          onChange([
            ...list,
            {
              id: crypto.randomUUID(),
              version: 0,
              kind: "due",
              offset: p.defaultOffset,
              at: null,
              timezone: p.timezone,
              channels: { inApp: true, push: false, email: false },
              acknowledgePast: false,
            },
          ])
        }
      >
        <Plus size={14} /> Add reminder
      </button>
      {list.length > 0 && (
        <button
          type="button"
          className="text-link"
          onClick={() => onChange([])}
        >
          No reminders · clear all
        </button>
      )}
      <small>
        Up to five.{" "}
        {configuration.email
          ? "Email requires your notification preference to be enabled."
          : "Email reminders are unavailable until email delivery is configured."}{" "}
        Browser push also needs permission and setup in notification settings.
      </small>
    </details>
  );
}

function localDisplay(at: string | null, timezone: string) {
  try {
    return at
      ? new Intl.DateTimeFormat("sv-SE", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
          .format(new Date(at))
          .replace(" ", "T")
      : "";
  } catch {
    return "";
  }
}
