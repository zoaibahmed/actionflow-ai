"use client";
import { m } from "motion/react";
export function ProgressRing({
  progress,
  ready,
}: {
  progress: number;
  ready: boolean;
}) {
  return (
    <div
      className="progress-ring"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-label="Task completion"
    >
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="33" className="ring-track" />
        <m.circle
          cx="40"
          cy="40"
          r="33"
          className="ring-value"
          initial={false}
          animate={{ pathLength: progress / 100 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span>
        {ready ? progress : "—"}
        <small>%</small>
      </span>
    </div>
  );
}
