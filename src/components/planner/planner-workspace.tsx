"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { m, AnimatePresence, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  Clock3,
  Coffee,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  defaults,
  daySchema,
  preferencesSchema,
  availability,
  dayBounds,
  localInstant,
  validateSchedule,
  validateCoverage,
  type Preferences,
  type Block,
  type PlanRequest,
  type PlanInput,
  type SavedPlan,
} from "@/lib/planner/schema";
import type { Task } from "@/types/task";
type Interval = Preferences["breaks"][number];
type Reserved = {
  taskId: string;
  date: string;
  start_at: string;
  end_at: string;
};
type Load = {
  reserved: Reserved[];
  plan: SavedPlan | null;
  preferences: Preferences;
  version: number;
  exists: boolean;
  tasks: Task[];
};
async function api(body: unknown) {
  const response = await fetch("/api/planner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error ||
        "The request could not be completed. Your changes are still here.",
    );
  return data;
}
function dateInZone(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function shift(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const n = h * 60 + m + minutes;
  if (n < 0 || n >= 1440) return time;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
function nearbyDays(day: string) {
  if (!daySchema.safeParse(day).success) return [];
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(`${day}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + index - 2);
    return {
      value: value.toISOString().slice(0, 10),
      number: value.getUTCDate(),
      label: value.toLocaleDateString(undefined, {
        weekday: "short",
        timeZone: "UTC",
      }),
    };
  });
}
async function snapshot(tasks: Task[]) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(
      tasks.map((t) => [t.id, t.updated_at, t.status, t.due_at]).sort(),
    ),
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function PlannerWorkspace({ configured }: { configured: boolean }) {
  const reduced = useReducedMotion();
  const searchParams = useSearchParams();
  const [date, setDate] = useState("");
  const [p, setP] = useState<Preferences>(defaults);
  const [pv, setPv] = useState(0);
  const [reserved, setReserved] = useState<Reserved[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [commitments, setCommitments] = useState<Interval[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [rest, setRest] = useState<{ taskId: string; reason: string }[]>([]);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [summary, setSummary] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const requestId = useRef("");
  const taskStamp = useRef("");
  const review = useRef<HTMLHeadingElement>(null);
  const initialized = useRef(false);
  function changed() {
    setDirty(true);
    setMessage("");
    requestId.current = crypto.randomUUID();
  }
  function openDay(next: string) {
    if (!daySchema.safeParse(next).success || next === date || busy) return;
    if (
      dirty &&
      !confirm("Discard unsaved schedule changes and open another day?")
    )
      return;
    void load(next);
  }
  async function load(day: string, initial = false) {
    setBusy("load");
    setError("");
    try {
      const data: Load = await api({ action: "load", date: day });
      let pref = data.preferences;
      if (initial && !data.exists)
        pref = {
          ...pref,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      setDate(day);
      setTasks(data.tasks);
      setReserved(data.reserved);
      setPv(data.version);
      setVersion(data.plan?.version ?? 0);
      if (data.plan) {
        const input = data.plan.input;
        setP({
          ...input.preferences,
          estimates: input.preferences.estimates.filter((e) =>
            data.tasks.some((t) => t.id === e.taskId),
          ),
        });
        setSelected(input.taskIds);
        setCommitments(input.commitments);
        setBlocks(input.blocks);
        setRest(input.unscheduled);
        setNotes(input.notes);
        // Reopening begins a fresh review against the tasks displayed now.
        taskStamp.current = await snapshot(
          data.tasks.filter((t) => input.taskIds.includes(t.id)),
        );
        setSummary(
          "Your saved day. Make a change, then approve it when you’re ready.",
        );
      } else {
        setP({
          ...pref,
          estimates: pref.estimates.filter((e) =>
            data.tasks.some((t) => t.id === e.taskId),
          ),
        });
        setSelected([]);
        setCommitments([]);
        setBlocks([]);
        setRest([]);
        setNotes("");
        taskStamp.current = "";
        setSummary("");
      }
      setConflicts([]);
      setDirty(false);
      setReady(true);
      setMessage("");
      requestId.current = crypto.randomUUID();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this day.");
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void load(
      daySchema.safeParse(searchParams.get("date")).success
        ? searchParams.get("date")!
        : dateInZone(Intl.DateTimeFormat().resolvedOptions().timeZone),
      true,
    );
  }, [searchParams]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    const expired = () =>
      setError(
        "Your session expired. Sign in again in a new tab; your schedule edits remain here.",
      );
    window.addEventListener("actionflow:session-expired", expired);
    return () =>
      window.removeEventListener("actionflow:session-expired", expired);
  }, []);
  const chosen = tasks.filter((t) => selected.includes(t.id));
  const input: PlanRequest = {
    date,
    preferences: p,
    commitments,
    taskIds: selected,
    version,
  };
  let external: { start: number; end: number }[] = [];
  try {
    const bounds = dayBounds(date, p.timezone);
    external = reserved
      .map((b) => ({
        start: Date.parse(b.start_at),
        end: Date.parse(b.end_at),
      }))
      .filter((b) => b.start < bounds.end && b.end > bounds.start);
  } catch {}
  let validation = "";
  if (ready)
    try {
      daySchema.parse(date);
      preferencesSchema.parse(p);
      availability(input);
      validateCoverage(input, blocks, rest);
      validateSchedule(input, blocks, chosen, external);
    } catch (e) {
      validation = e instanceof Error ? e.message : "Check the schedule.";
    }
  const total = blocks.reduce((s, b) => s + b.duration, 0);
  const task = (id: string) => tasks.find((t) => t.id === id);
  function updateP(value: Partial<Preferences>) {
    changed();
    setP((prev) => ({ ...prev, ...value }));
  }
  function toggle(id: string) {
    changed();
    taskStamp.current = "";
    if (selected.includes(id)) {
      setSelected(selected.filter((v) => v !== id));
      setBlocks(blocks.filter((b) => b.taskId !== id));
      setRest(rest.filter((b) => b.taskId !== id));
    } else {
      if (selected.length >= 20) {
        setError("Plan up to 20 tasks at a time.");
        return;
      }
      setSelected([...selected, id]);
      setRest([
        ...rest,
        {
          taskId: id,
          reason: "Not placed yet. Generate a plan or place it manually.",
        },
      ]);
    }
  }
  function editBlock(index: number, value: Partial<Block>) {
    changed();
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b;
        const next = { ...b, ...value };
        try {
          next.duration =
            (localInstant(date, next.end, p.timezone) -
              localInstant(date, next.start, p.timezone)) /
            60000;
        } catch {}
        return next;
      }),
    );
  }
  function removeBlock(index: number) {
    changed();
    const removed = blocks[index];
    const next = blocks.filter((_, i) => i !== index);
    setBlocks(next);
    if (!next.some((b) => b.taskId === removed.taskId))
      setRest([
        ...rest.filter((r) => r.taskId !== removed.taskId),
        { taskId: removed.taskId, reason: "Removed from this schedule." },
      ]);
  }
  function place(id: string) {
    setError("");
    try {
      availability(input);
      const duration = Math.min(
        p.focusSession,
        p.estimates.find((e) => e.taskId === id)?.minutes ?? p.defaultDuration,
      );
      for (let minute = 0; minute < 1440; minute += 5) {
        const start = shift("00:00", minute),
          end = shift(start, duration);
        if (end <= start) continue;
        const candidate = {
          taskId: id,
          start,
          end,
          duration,
          notes:
            "Placed manually. Adjust the time or add another block if needed.",
        };
        try {
          validateSchedule(input, [...blocks, candidate], chosen, external);
          changed();
          setBlocks([...blocks, candidate]);
          setRest(rest.filter((r) => r.taskId !== id));
          taskStamp.current = "";
          return;
        } catch {}
      }
      throw new Error(
        "No free focus block fits. Adjust your hours, breaks or focus limit.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check availability.");
    }
  }
  async function generate() {
    if (
      blocks.length &&
      !confirm(
        "Replace the current task blocks with a new proposed plan? Your saved schedule will stay unchanged until approval.",
      )
    )
      return;
    setBusy("generate");
    setError("");
    setMessage("");
    try {
      preferencesSchema.parse(p);
      availability(input);
      const result = await api({ action: "generate", input });
      changed();
      setBlocks(result.blocks);
      setRest(result.unscheduled);
      setSummary(result.summary);
      setConflicts(result.conflicts);
      taskStamp.current = result.taskSnapshot;
      requestAnimationFrame(() => review.current?.focus());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Generation failed. Your current arrangement is still here.",
      );
    } finally {
      setBusy("");
    }
  }
  async function save() {
    setError("");
    setBusy("save");
    try {
      if (validation) throw new Error(validation);
      const stamp = taskStamp.current || (await snapshot(chosen));
      taskStamp.current = stamp;
      const final: PlanInput = {
        ...input,
        blocks,
        unscheduled: rest,
        notes,
        taskSnapshot: stamp,
        requestId: requestId.current,
      };
      const result: { plan: SavedPlan } = await api({
        action: "save",
        input: final,
      });
      setVersion(result.plan.version);
      setDirty(false);
      setMessage("Your day is saved. Task deadlines have not changed.");
      requestId.current = crypto.randomUUID();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Saving failed. Your changes are still here.",
      );
    } finally {
      setBusy("");
    }
  }
  async function prefs() {
    setBusy("preferences");
    setError("");
    try {
      preferencesSchema.parse(p);
      const result = await api({
        action: "preferences",
        preferences: p,
        version: pv,
      });
      setPv(result.version);
      setMessage(
        "Planning preferences saved for future days. Approve this schedule separately.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Preferences could not be saved.",
      );
    } finally {
      setBusy("");
    }
  }
  function intervalList(
    values: Interval[],
    onChange: (next: Interval[]) => void,
    kind: string,
  ) {
    return (
      <div className="dayflow-intervals">
        {values.map((v, i) => (
          <div className="dayflow-interval" key={v.id}>
            <input
              aria-label={`${kind} ${i + 1} name`}
              value={v.label}
              maxLength={120}
              onChange={(e) => {
                changed();
                onChange(
                  values.map((a, n) =>
                    n === i ? { ...a, label: e.target.value } : a,
                  ),
                );
              }}
            />
            <input
              type="time"
              aria-label={`${kind} ${i + 1} start`}
              value={v.start}
              onChange={(e) => {
                changed();
                onChange(
                  values.map((a, n) =>
                    n === i ? { ...a, start: e.target.value } : a,
                  ),
                );
              }}
            />
            <span>to</span>
            <input
              type="time"
              aria-label={`${kind} ${i + 1} end`}
              value={v.end}
              onChange={(e) => {
                changed();
                onChange(
                  values.map((a, n) =>
                    n === i ? { ...a, end: e.target.value } : a,
                  ),
                );
              }}
            />
            <button
              className="icon-button"
              aria-label={`Remove ${kind} ${i + 1}`}
              onClick={() => {
                changed();
                onChange(values.filter((_, n) => n !== i));
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          className="text-link"
          disabled={values.length >= (kind === "Break" ? 12 : 20)}
          onClick={() => {
            changed();
            onChange([
              ...values,
              {
                id: crypto.randomUUID(),
                label: kind,
                start: "12:00",
                end: "12:30",
              },
            ]);
          }}
        >
          <Plus size={14} /> Add {kind.toLowerCase()}
        </button>
      </div>
    );
  }
  return (
    <div className="dayflow-workspace" aria-busy={!!busy}>
      <header className="dayflow-header">
        <div>
          <span className="dayflow-kicker">
            <Sparkles size={15} /> Dayflow Planner
          </span>
          <h1>Make room for what matters.</h1>
          <p>A thoughtful rhythm for your real day. You have the final say.</p>
        </div>
        <div className="dayflow-date">
          <CalendarDays size={18} />
          <label htmlFor="plan-date">Planning date</label>
          <input
            id="plan-date"
            type="date"
            value={date}
            disabled={!!busy}
            onChange={(e) => {
              openDay(e.target.value);
            }}
          />
        </div>
      </header>
      <nav className="phone-plan-dates" aria-label="Nearby planning dates">
        {nearbyDays(date).map((day) => (
          <button
            key={day.value}
            disabled={!!busy}
            aria-label={`${day.label} ${day.number}, open plan for ${day.value}`}
            aria-pressed={day.value === date}
            onClick={() => openDay(day.value)}
          >
            <span>{day.label}</span>
            <strong>{day.number}</strong>
          </button>
        ))}
      </nav>
      <div className="dayflow-feedback" aria-live="polite">
        {error && (
          <p role="alert" className="form-error">
            {error}{" "}
            {error.includes("session") && (
              <Link href="/login" target="_blank">
                Sign in in a new tab
              </Link>
            )}
          </p>
        )}
        {message && (
          <p className="dayflow-success">
            <Check size={16} />
            {message}
          </p>
        )}
      </div>
      {!ready ? (
        <div className="dayflow-skeleton">
          <span />
          <span />
          <span />
          {!busy && (
            <button
              className="button secondary"
              onClick={() => void load(date || dateInZone("UTC"), true)}
            >
              Retry opening planner
            </button>
          )}
        </div>
      ) : (
        <fieldset className="dayflow-fields" disabled={!!busy}>
          <details className="dayflow-settings">
            <summary>
              Your day, your boundaries{" "}
              <span>
                {p.start} — {p.end} · {p.timezone}
              </span>
            </summary>
            <div className="dayflow-settings-body">
              <div className="dayflow-preferences">
                <label>
                  Time zone
                  <input
                    value={p.timezone}
                    onChange={(e) => updateP({ timezone: e.target.value })}
                    placeholder="Europe/London"
                  />
                </label>
                <label>
                  Day starts
                  <input
                    type="time"
                    value={p.start}
                    onChange={(e) => updateP({ start: e.target.value })}
                  />
                </label>
                <label>
                  Day ends
                  <input
                    type="time"
                    value={p.end}
                    onChange={(e) => updateP({ end: e.target.value })}
                  />
                </label>
                <label>
                  Default estimate · min
                  <input
                    type="number"
                    min={5}
                    max={480}
                    value={p.defaultDuration}
                    onChange={(e) =>
                      updateP({ defaultDuration: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Focus session · min
                  <input
                    type="number"
                    min={15}
                    max={180}
                    value={p.focusSession}
                    onChange={(e) =>
                      updateP({ focusSession: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Daily focus limit · min
                  <input
                    type="number"
                    min={5}
                    max={720}
                    value={p.maxFocus}
                    onChange={(e) =>
                      updateP({ maxFocus: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="dayflow-boundaries">
                <section>
                  <h3>Make space for breaks</h3>
                  {intervalList(
                    p.breaks,
                    (next) => setP({ ...p, breaks: next }),
                    "Break",
                  )}
                </section>
                <section>
                  <h3>Existing commitments · this day</h3>
                  {intervalList(commitments, setCommitments, "Commitment")}
                </section>
              </div>
              <button className="button secondary" onClick={() => void prefs()}>
                Save planning preferences
              </button>
              <small>
                Preferences include breaks and task estimates. Commitments
                belong only to this date. Ambiguous or missing daylight-saving
                times require a different time.
              </small>
            </div>
          </details>
          <div className="dayflow-layout">
            <aside className="dayflow-inbox">
              <div className="dayflow-section-title">
                <h2>Choose your priorities</h2>
                <span>{selected.length}/20</span>
              </div>
              <p>
                Unfinished tasks from your workspace. Estimates are yours to
                refine.
              </p>
              {selected
                .filter(
                  (id) =>
                    !tasks.some((t) => t.id === id && t.status !== "done"),
                )
                .map((id) => (
                  <div className="dayflow-warnings" key={id}>
                    <p>
                      {task(id)?.title ?? "A previously scheduled task"} is
                      completed or unavailable.
                    </p>
                    <button className="text-link" onClick={() => toggle(id)}>
                      Remove unavailable task from plan
                    </button>
                  </div>
                ))}
              <div className="dayflow-task-pool">
                {tasks
                  .filter((t) => t.status !== "done")
                  .map((t) => (
                    <div
                      className="dayflow-pick"
                      data-selected={selected.includes(t.id)}
                      key={t.id}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={selected.includes(t.id)}
                          onChange={() => toggle(t.id)}
                        />
                        <span>
                          {t.title}
                          <small>
                            {t.priority} priority{" "}
                            {t.due_at &&
                              `· Due ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timezoneSchemaSafe(p.timezone) }).format(new Date(t.due_at))}`}
                          </small>
                        </span>
                      </label>
                      {selected.includes(t.id) && (
                        <div className="dayflow-estimate">
                          <label>
                            Estimate · min
                            <input
                              type="number"
                              min={5}
                              max={480}
                              value={
                                p.estimates.find((e) => e.taskId === t.id)
                                  ?.minutes ?? ""
                              }
                              placeholder={String(p.defaultDuration)}
                              onChange={(e) =>
                                updateP({
                                  estimates: [
                                    ...p.estimates.filter(
                                      (v) => v.taskId !== t.id,
                                    ),
                                    ...(e.target.value
                                      ? [
                                          {
                                            taskId: t.id,
                                            minutes: Number(e.target.value),
                                          },
                                        ]
                                      : []),
                                  ],
                                })
                              }
                            />
                          </label>
                          <small>
                            {p.estimates.some((e) => e.taskId === t.id)
                              ? "Your estimate"
                              : `${p.defaultDuration} min assumed · review`}
                          </small>
                          <small>
                            {blocks
                              .filter((b) => b.taskId === t.id)
                              .reduce((sum, b) => sum + b.duration, 0)}{" "}
                            min placed in this draft
                          </small>
                          <button
                            className="text-link"
                            onClick={() => place(t.id)}
                          >
                            <Plus size={13} /> Place a block
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              {!tasks.some((t) => t.status !== "done") && (
                <div className="dayflow-empty-small">
                  <p>
                    A little breathing room. Add a task to start shaping your
                    day.
                  </p>
                  <Link className="text-link" href="/dashboard/tasks">
                    Go to My Tasks
                  </Link>
                </div>
              )}
              <p className="dayflow-disclosure">
                Generate sends selected task details and availability to OpenAI.
                Nothing is scheduled until you approve.
              </p>
              {!configured && (
                <p className="form-error">
                  AI setup required. Manual planning is available.
                </p>
              )}
              <button
                className="button primary dayflow-generate"
                disabled={!configured || !selected.length}
                onClick={() => void generate()}
              >
                <Sparkles size={16} />
                {blocks.length ? "Regenerate my day" : "Generate My Day"}
              </button>
            </aside>
            <section className="planner-canvas" aria-label="Daily schedule">
              <div className="planner-canvas-heading">
                <div>
                  <span className="dayflow-kicker">
                    {dirty
                      ? "Proposed changes"
                      : version
                        ? `Saved · version ${version}`
                        : "A fresh page"}
                  </span>
                  <h2 ref={review} tabIndex={-1}>
                    Your day, in flow.
                  </h2>
                </div>
                <div className="dayflow-focus">
                  <strong>
                    {total}
                    <span>/{p.maxFocus}</span>
                  </strong>
                  <small>focus minutes</small>
                  <div className="dayflow-meter">
                    <m.span
                      animate={{ scaleX: Math.min(1, total / p.maxFocus) }}
                      style={{ transformOrigin: "left" }}
                      transition={{ duration: reduced ? 0 : 0.35 }}
                    />
                  </div>
                </div>
              </div>
              <AnimatePresence mode="wait">
                {busy === "generate" ? (
                  <m.div
                    key="understanding"
                    className="dayflow-understanding"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Sparkles size={30} />
                    <h3>Finding a rhythm that fits.</h3>
                    <p>
                      Comparing your tasks with the time you’ve made available.
                    </p>
                    <div className="dayflow-thinking">
                      <span />
                      <span />
                      <span />
                    </div>
                    <small>
                      Waiting for a validated proposal. Your saved day is
                      unchanged.
                    </small>
                  </m.div>
                ) : (
                  <m.div
                    key="timeline"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reduced ? 0 : 0.25 }}
                  >
                    {external.length > 0 && (
                      <div className="dayflow-reserved">
                        <h3>Already on your calendar</h3>
                        <p>
                          These blocks belong to other saved planning dates and
                          reserve time in this day.
                        </p>
                        {external.map((b, i) => (
                          <small key={i}>
                            {new Intl.DateTimeFormat("en", {
                              timeZone: p.timezone,
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(b.start))}{" "}
                            —{" "}
                            {new Intl.DateTimeFormat("en", {
                              timeZone: p.timezone,
                              timeStyle: "short",
                            }).format(new Date(b.end))}
                          </small>
                        ))}
                      </div>
                    )}
                    {summary && <p className="dayflow-summary">{summary}</p>}
                    <div className="dayflow-timeline">
                      <div className="dayflow-bookend">
                        <span>{p.start}</span>
                        <p>
                          Your day begins <small>{p.timezone}</small>
                        </p>
                      </div>
                      {[
                        ...blocks.map((b, i) => ({
                          kind: "task" as const,
                          start: b.start,
                          key: `task-${i}`,
                          b,
                          i,
                        })),
                        ...p.breaks.map((b) => ({
                          kind: "break" as const,
                          start: b.start,
                          key: b.id,
                          b,
                        })),
                        ...commitments.map((b) => ({
                          kind: "commitment" as const,
                          start: b.start,
                          key: b.id,
                          b,
                        })),
                      ]
                        .sort((a, b) => a.start.localeCompare(b.start))
                        .map((item) =>
                          item.kind === "task" ? (
                            <m.article
                              layout={!reduced}
                              className="dayflow-block"
                              key={item.key}
                              transition={{ duration: 0.22 }}
                            >
                              <span className="dayflow-time">
                                {item.b.start}
                              </span>
                              <div className="dayflow-block-content">
                                <div className="dayflow-block-top">
                                  <span
                                    className={`priority ${task(item.b.taskId)?.priority ?? "medium"}`}
                                  >
                                    {task(item.b.taskId)?.priority ??
                                      "Task unavailable"}
                                  </span>
                                  <span>{item.b.duration} min</span>
                                </div>
                                <h3>
                                  {task(item.b.taskId)?.title ??
                                    "Task deleted or unavailable"}
                                </h3>
                                <Link
                                  className="text-link planner-reminder-link"
                                  href={`/dashboard/tasks/${item.b.taskId}`}
                                >
                                  Set a reminder for this task
                                </Link>
                                <div className="dayflow-block-times">
                                  <label>
                                    Start
                                    <input
                                      type="time"
                                      value={item.b.start}
                                      onChange={(e) =>
                                        editBlock(item.i, {
                                          start: e.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <span>—</span>
                                  <label>
                                    End
                                    <input
                                      type="time"
                                      value={item.b.end}
                                      onChange={(e) =>
                                        editBlock(item.i, {
                                          end: e.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <div className="dayflow-block-tools">
                                    <button
                                      className="icon-button"
                                      aria-label={`Move ${task(item.b.taskId)?.title ?? "task"} 15 minutes earlier`}
                                      onClick={() =>
                                        editBlock(item.i, {
                                          start: shift(item.b.start, -15),
                                          end: shift(item.b.end, -15),
                                        })
                                      }
                                    >
                                      <ArrowUp size={15} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      aria-label={`Move ${task(item.b.taskId)?.title ?? "task"} 15 minutes later`}
                                      onClick={() =>
                                        editBlock(item.i, {
                                          start: shift(item.b.start, 15),
                                          end: shift(item.b.end, 15),
                                        })
                                      }
                                    >
                                      <ArrowDown size={15} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      aria-label={`Remove block ${item.i + 1}`}
                                      onClick={() => removeBlock(item.i)}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </div>
                                <details>
                                  <summary>Reasoning & notes</summary>
                                  <label className="dayflow-block-note">
                                    Block notes
                                    <textarea
                                      value={item.b.notes}
                                      maxLength={500}
                                      onChange={(e) =>
                                        editBlock(item.i, {
                                          notes: e.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                </details>
                              </div>
                            </m.article>
                          ) : (
                            <div className="dayflow-pause" key={item.key}>
                              <span className="dayflow-time">
                                {item.b.start}
                              </span>
                              {item.kind === "break" ? (
                                <Coffee size={18} />
                              ) : (
                                <CalendarDays size={18} />
                              )}
                              <div>
                                <strong>{item.b.label}</strong>
                                <small>
                                  {item.b.start} — {item.b.end}
                                </small>
                              </div>
                            </div>
                          ),
                        )}
                      {!blocks.length && (
                        <div className="dayflow-empty">
                          <div className="dayflow-orbit">
                            <Clock3 size={28} />
                          </div>
                          <h3>Start with a little intention.</h3>
                          <p>
                            Choose a few tasks. Make space for breaks.
                            <br />
                            Then let a realistic day take shape.
                          </p>
                        </div>
                      )}
                      <div className="dayflow-bookend">
                        <span>{p.end}</span>
                        <p>Leave room for living.</p>
                      </div>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
              {rest.length > 0 && (
                <section className="dayflow-unscheduled">
                  <h3>
                    Room for another day <span>{rest.length}</span>
                  </h3>
                  {rest.map((r) => (
                    <div key={r.taskId}>
                      <div>
                        <strong>
                          {task(r.taskId)?.title ?? "Task unavailable"}
                        </strong>
                        <p>{r.reason}</p>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => place(r.taskId)}
                      >
                        Place manually
                      </button>
                    </div>
                  ))}
                </section>
              )}
              {conflicts.length > 0 && (
                <div className="dayflow-warnings">
                  <h3>Worth your attention</h3>
                  <ul>
                    {conflicts.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
              {blocks.some((b) => {
                const t = task(b.taskId);
                try {
                  return (
                    !!t?.due_at &&
                    localInstant(date, b.end, p.timezone) >
                      new Date(t.due_at).getTime()
                  );
                } catch {
                  return false;
                }
              }) && (
                <p className="dayflow-warnings">
                  Some work ends after its task deadline. Review those
                  deadlines; planning does not change them.
                </p>
              )}
              <div className="dayflow-day-notes">
                <label htmlFor="plan-day-notes">A note for this day</label>
                <textarea
                  id="plan-day-notes"
                  value={notes}
                  maxLength={1000}
                  placeholder="What would make today feel worthwhile?"
                  onChange={(e) => {
                    changed();
                    setNotes(e.target.value);
                  }}
                />
              </div>
              {validation && (
                <p className="dayflow-warnings" role="status">
                  {validation}
                </p>
              )}
              <footer className="dayflow-approval">
                <p>
                  {dirty
                    ? "Your arrangement is a draft."
                    : version
                      ? "Your saved schedule is up to date."
                      : "A plan becomes yours when you approve it."}
                  <small>
                    Times are in {p.timezone}. Tasks and deadlines stay
                    unchanged.
                  </small>
                </p>
                <div>
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (
                        !dirty ||
                        confirm("Discard unsaved changes and reload this day?")
                      )
                        void load(date);
                    }}
                  >
                    Reload day
                  </button>
                  <button
                    className="button primary"
                    disabled={!!validation || !dirty}
                    onClick={() => void save()}
                  >
                    <Check size={16} />
                    {busy === "save" ? "Saving…" : "Approve & save day"}
                  </button>
                </div>
              </footer>
            </section>
          </div>
        </fieldset>
      )}
    </div>
  );
}
function timezoneSchemaSafe(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}
