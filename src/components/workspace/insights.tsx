"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Clock3 } from "lucide-react";
import type { insights } from "@/lib/workspace/queries";
import { workspaceApi as api } from "./api";
type Insights = Awaited<ReturnType<typeof insights>>;
export function InsightsWorkspace() {
  const [days, setDays] = useState<7 | 30>(7),
    [data, setData] = useState<Insights | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    api<Insights>(
      {
        action: "insights",
        days,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      c.signal,
    )
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [days, retry]);
  const max = Math.max(1, ...(data?.trend.map((t) => t.completed) ?? []));
  const total = (data?.completed ?? 0) + (data?.pending ?? 0);
  return (
    <section className="wf-workspace">
      <header className="wf-heading">
        <div>
          <span className="wf-kicker">The shape of your progress</span>
          <h1>Insights</h1>
          <p>A clear look at your work. Every number is yours.</p>
        </div>
        <div className="wf-segment" aria-label="Trend period">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              aria-pressed={days === d}
              className={days === d ? "selected" : ""}
              onClick={() => {
                setLoading(true);
                setDays(d);
              }}
            >
              {d} days
            </button>
          ))}
        </div>
      </header>
      {error ? (
        <div className="wf-error" role="alert">
          {error}
          <button onClick={() => setRetry((r) => r + 1)}>Retry</button>
        </div>
      ) : !data ? (
        <div className="wf-loading" role="status">
          Gathering your workspace…
        </div>
      ) : (
        <div aria-busy={loading} className="wf-insights">
          <section className="wf-trend-panel">
            <header>
              <span className="wf-kicker">Completed work</span>
              <h2>
                {days === 7 ? data.completed7 : data.completed30}
                <small> tasks in {days} days</small>
              </h2>
              <p>Each step is part of the bigger picture.</p>
            </header>
            <div
              className="wf-chart"
              role="img"
              aria-label={`Tasks completed by local day: ${data.trend.map((t) => t.date + ": " + t.completed).join(", ")}`}
            >
              {data.trend.map((t, i) => (
                <div className="wf-bar-column" key={t.date}>
                  <span className="wf-bar-value">{t.completed || ""}</span>
                  <div className="wf-bar-space">
                    <span
                      className="wf-bar"
                      style={{
                        height: Math.max(2, (t.completed / max) * 100) + "%",
                      }}
                      title={t.date + ": " + t.completed + " tasks"}
                    />
                  </div>
                  <small>
                    {days === 7
                      ? new Date(t.date + "T12:00:00").toLocaleDateString(
                          undefined,
                          { weekday: "short" },
                        )
                      : i % 5 === 0
                        ? t.date.slice(-2)
                        : ""}
                  </small>
                </div>
              ))}
            </div>
            <details>
              <summary>Read chart as a table</summary>
              <table className="wf-data-table">
                <thead>
                  <tr>
                    <th>Date ({data.timezone})</th>
                    <th>Tasks</th>
                    <th>Focus minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((t) => (
                    <tr key={t.date}>
                      <td>{t.date}</td>
                      <td>{t.completed}</td>
                      <td>{t.focusMinutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
          <aside className="wf-insight-side">
            <h2>Your workspace, now</h2>
            <div className="wf-work-balance">
              <div
                style={{
                  width: (total ? (data.completed / total) * 100 : 0) + "%",
                }}
              />
            </div>
            <div className="wf-metric-line">
              <span>
                <Check size={16} />
                Completed
              </span>
              <strong>{data.completed}</strong>
            </div>
            <div className="wf-metric-line">
              <span>Still to do</span>
              <strong>{data.pending}</strong>
            </div>
            <div className="wf-metric-line">
              <span>Overdue</span>
              <strong>{data.overdue}</strong>
            </div>
            <div className="wf-metric-line">
              <span>Due in the next 7 days</span>
              <strong>{data.upcoming}</strong>
            </div>
            <Link className="wf-text-link" href="/dashboard/tasks">
              Make room in your list <ArrowUpRight size={16} />
            </Link>
          </aside>
          <section className="wf-focus-insight">
            <div>
              <Clock3 size={22} />
              <h2>Room for deep work</h2>
              <p>
                Only finished sessions count. A paused or early-ended session
                stays out of your totals.
              </p>
              <Link className="wf-text-link" href="/dashboard/focus">
                Find your focus <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="wf-focus-numbers">
              <span>
                <strong>
                  {data.focusWeekMinutes}
                  <small> min</small>
                </strong>
                This week · from Monday
              </span>
              <span>
                <strong>
                  {data.focusMonthMinutes}
                  <small> min</small>
                </strong>
                This calendar month
              </span>
            </div>
          </section>
          <footer className="wf-insight-disclosure">
            <strong>How to read this</strong>
            <p>{data.limitations}</p>
            {data.missingHistory > 0 && (
              <p>
                {data.missingHistory} completed tasks have no completion
                timestamp and are excluded from trends.
              </p>
            )}
            <p>
              Daily grouping: {data.timezone}. Counts reflect current records,
              not a complete activity log.
            </p>
          </footer>
        </div>
      )}
    </section>
  );
}
