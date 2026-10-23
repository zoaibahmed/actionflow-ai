"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Square, Check, Clock3, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { workspaceApi as api } from "./api";
import { focusElapsed, type FocusView } from "@/lib/workspace/schema";
type State = {
  active: FocusView | null;
  history: FocusView[];
  totals: { elapsedMs: number; count: number };
  defaultMinutes: number;
  serverNow: string;
};
export function FocusWorkspace() {
  const [state, setState] = useState<State | null>(null),
    [minutes, setMinutes] = useState(25),
    [taskId, setTaskId] = useState(""),
    [tasks, setTasks] = useState<{ _id: string; title: string }[]>([]),
    [taskQuery, setTaskQuery] = useState(""),
    [now, setNow] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState(false);
  const clock = useRef({ server: 0, performance: 0 });
  const initialized = useRef(false),
    startId = useRef<string | null>(null),
    finishing = useRef(false);
  const refreshSequence = useRef(0),
    mutating = useRef(false);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const s = await api<State>({ action: "focus_state" });
    if (sequence !== refreshSequence.current) return;
    clock.current = {
      server: Date.parse(s.serverNow),
      performance: performance.now(),
    };
    setNow(Date.parse(s.serverNow));
    setState(s);
    if (!initialized.current) {
      setMinutes(s.defaultMinutes);
      initialized.current = true;
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(
      () => void refresh().catch((e) => setError(e.message)),
      0,
    );
    const wake = () => {
      if (document.visibilityState === "visible" && !mutating.current)
        void refresh().catch((e) => setError(e.message));
    };
    const channel = new BroadcastChannel("actionflow-focus");
    channel.onmessage = wake;
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    const t = setInterval(wake, 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(t);
      channel.close();
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        setNow(
          clock.current.server + performance.now() - clock.current.performance,
        );
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    const t = setTimeout(
      () =>
        api<{ tasks: { _id: string; title: string }[] }>(
          { action: "task_choices", query: taskQuery },
          c.signal,
        )
          .then((r) => setTasks(r.tasks))
          .catch(() => {}),
      250,
    );
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [taskQuery]);
  const active = state?.active;
  const elapsed = active ? focusElapsed(active, now) : 0;
  const remaining = active
    ? Math.max(0, active.durationMs - elapsed)
    : minutes * 60000;
  const seconds = Math.ceil(remaining / 1000);
  const countdown =
    String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0");
  const progress = active ? elapsed / active.durationMs : 0;
  const mutate = useCallback(
    async (body: unknown) => {
      mutating.current = true;
      ++refreshSequence.current;
      setBusy(true);
      setError("");
      try {
        await api(body);
        await refresh();
        const channel = new BroadcastChannel("actionflow-focus");
        channel.postMessage("changed");
        channel.close();
        setConfirm(false);
        return true;
      } catch (e) {
        setError((e as Error).message);
        void refresh().catch(() => {});
        return false;
      } finally {
        mutating.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );
  useEffect(() => {
    if (
      !active ||
      active.status !== "running" ||
      elapsed < active.durationMs ||
      finishing.current ||
      error
    )
      return;
    finishing.current = true;
    void mutate({
      action: "focus_change",
      id: active.id,
      version: active.version,
      mode: "finish",
    })
      .then((ok) => {
        if (ok) setNotice("Session complete. Your focused time is saved.");
      })
      .finally(() => {
        finishing.current = false;
      });
  }, [active, elapsed, mutate, error]);
  return (
    <section className="wf-workspace">
      <header className="wf-heading">
        <div>
          <span className="wf-kicker">One thing at a time</span>
          <h1>Focus</h1>
          <p>A little space between you and everything else.</p>
        </div>
        <Link href="/dashboard/tasks" className="wf-text-link">
          Choose your next task <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="wf-focus-layout">
        <div className={"wf-focus-scene " + (active ? "in-session" : "")}>
          <div className="wf-focus-caption">
            <span className="wf-dot" />
            {active?.status === "paused"
              ? "A moment to breathe"
              : active
                ? "Your time, protected"
                : "Make space for deep work"}
          </div>
          <div
            className="wf-countdown"
            role="timer"
            aria-label={countdown + " remaining"}
          >
            <svg viewBox="0 0 300 300" aria-hidden="true">
              <circle
                cx="150"
                cy="150"
                r="137"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="wf-ring-track"
              />
              <circle
                cx="150"
                cy="150"
                r="137"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={861}
                strokeDashoffset={861 * (1 - progress)}
                transform="rotate(-90 150 150)"
              />
            </svg>
            <div>
              <strong>{countdown}</strong>
              <span>
                {active?.status === "paused"
                  ? "Paused"
                  : active
                    ? "Stay with this moment"
                    : "Ready when you are"}
              </span>
            </div>
          </div>
          {active?.taskTitle && (
            <p className="wf-focus-task">{active.taskTitle}</p>
          )}
          {!active && (
            <>
              <div className="wf-duration-presets" aria-label="Focus duration">
                {[15, 25, 45, 60].map((m) => (
                  <button
                    key={m}
                    className={minutes === m ? "selected" : ""}
                    aria-pressed={minutes === m}
                    onClick={() => setMinutes(m)}
                  >
                    {m}
                    <small>min</small>
                  </button>
                ))}
              </div>
              <div className="wf-focus-options">
                <label>
                  Custom minutes
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  />
                </label>
                <label>
                  Find a task
                  <input
                    type="search"
                    placeholder="Optional task"
                    value={taskQuery}
                    onChange={(e) => setTaskQuery(e.target.value)}
                  />
                </label>
                <label className="wf-focus-task-select">
                  Work on
                  <select
                    value={taskId}
                    onChange={(e) => setTaskId(e.target.value)}
                  >
                    <option value="">An open focus session</option>
                    {tasks.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
          <div className="wf-actions">
            {!active ? (
              <button
                className="button primary"
                disabled={
                  !state ||
                  busy ||
                  minutes < 1 ||
                  minutes > 180 ||
                  !Number.isInteger(minutes)
                }
                onClick={async () => {
                  startId.current ??= crypto.randomUUID();
                  if (
                    await mutate({
                      action: "focus_start",
                      id: startId.current,
                      input: { minutes, taskId: taskId || null },
                    })
                  ) {
                    startId.current = null;
                    setNotice("");
                  }
                }}
              >
                <Play size={17} /> Begin focus
              </button>
            ) : (
              <>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void mutate({
                      action: "focus_change",
                      id: active.id,
                      version: active.version,
                      mode: active.status === "running" ? "pause" : "resume",
                    })
                  }
                >
                  {active.status === "running" ? (
                    <Pause size={17} />
                  ) : (
                    <Play size={17} />
                  )}{" "}
                  {active.status === "running" ? "Pause" : "Resume"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirm(true)}
                >
                  <Square size={15} />
                  End early
                </button>
              </>
            )}
          </div>
          {confirm && (
            <div
              className="wf-inline-confirm"
              role="group"
              aria-label="Confirm ending focus"
            >
              <p>
                End this session? Unfinished time won’t count toward completed
                focus.
              </p>
              <button onClick={() => setConfirm(false)}>Keep focusing</button>
              <button
                disabled={busy}
                onClick={() =>
                  active &&
                  void mutate({
                    action: "focus_change",
                    id: active.id,
                    version: active.version,
                    mode: "cancel",
                  })
                }
              >
                End session
              </button>
            </div>
          )}
          {!active && (
            <button
              className="wf-text-link"
              disabled={busy || minutes < 1 || minutes > 180}
              onClick={async () => {
                if (await mutate({ action: "focus_default", minutes }))
                  setNotice("Default duration saved.");
              }}
            >
              Use {minutes} minutes by default
            </button>
          )}
          {notice && (
            <p className="wf-success" role="status">
              <Check size={16} />
              {notice}
            </p>
          )}
          {error && (
            <div className="wf-error" role="alert">
              {error}{" "}
              <button
                onClick={() => {
                  setError("");
                  void refresh().catch((e) => setError(e.message));
                }}
              >
                Reconnect
              </button>
            </div>
          )}
          <p className="wf-focus-footnote">
            Time keeps running while this tab is away. Reopen Focus to reconcile
            and save a finished session. No closed-browser notification is sent.
          </p>
        </div>
        <aside className="wf-focus-history">
          <div className="wf-history-total">
            <Clock3 size={21} />
            <span>Time well spent</span>
            <strong>
              {Math.floor((state?.totals.elapsedMs ?? 0) / 60000)}
              <small> minutes</small>
            </strong>
            <p>{state?.totals.count ?? 0} completed sessions</p>
          </div>
          <h2>Recent focus</h2>
          {!state ? (
            <p className="wf-muted">Loading your sessions…</p>
          ) : !state.history.length ? (
            <div className="wf-empty">
              <p>Your completed sessions will find a home here.</p>
            </div>
          ) : (
            state.history.map((s) => (
              <div className="wf-history-row" key={s.id}>
                <span className="wf-history-check">
                  <Check size={15} />
                </span>
                <div>
                  <strong>{s.taskTitle || "Open focus"}</strong>
                  <small>
                    {new Date(s.completedAt!).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                </div>
                <span>{Math.round(s.elapsedMs / 60000)}m</span>
              </div>
            ))
          )}
        </aside>
      </div>
    </section>
  );
}
