"use client";

import { useEffect, useRef, useState } from "react";

// Opt-in local QA only. RootLayout never mounts this in production.
export function Diagnostics() {
  const samples = useRef<number[]>([]);
  const running = useRef(false);
  const longTasks = useRef<number[]>([]);
  const [result, setResult] = useState("No measurement recorded");
  useEffect(() => {
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      if (running.current && last && document.visibilityState === "visible")
        samples.current.push(now - last);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const observer = new PerformanceObserver((list) => {
      if (running.current)
        for (const entry of list.getEntries())
          longTasks.current.push(entry.duration);
    });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask"))
      observer.observe({ type: "longtask" });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return (
    <aside
      aria-label="Local QA diagnostics"
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 10000,
        background: "white",
        color: "#171717",
        border: "1px solid #777",
        padding: 8,
        maxWidth: 380,
        fontSize: 12,
      }}
    >
      <button
        onClick={() => {
          samples.current = [];
          longTasks.current = [];
          running.current = true;
          setResult("Recording visible-tab frame intervals. Scroll now.");
        }}
      >
        Start frame sample
      </button>{" "}
      <button
        onClick={() => {
          running.current = false;
          const sorted = [...samples.current].sort((a, b) => a - b);
          setResult(
            JSON.stringify({
              frames: sorted.length,
              meanMs: sorted.length
                ? Number(
                    (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(
                      2,
                    ),
                  )
                : null,
              p95Ms: sorted.length
                ? Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2))
                : null,
              longTasks: longTasks.current.length,
              longTaskMs: Math.round(
                longTasks.current.reduce((a, b) => a + b, 0),
              ),
            }),
          );
        }}
      >
        Stop frame sample
      </button>{" "}
      <button
        onClick={async () => {
          setResult("Running accessibility audit");
          const axe = await import("axe-core");
          const audit = await axe.default.run({
            exclude: ['[aria-label="Local QA diagnostics"]'],
          });
          setResult(
            JSON.stringify({
              violations: audit.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                nodes: v.nodes.map((n) => n.target),
              })),
              passes: audit.passes.length,
              incomplete: audit.incomplete.length,
            }),
          );
        }}
      >
        Audit accessibility
      </button>
      <output
        style={{
          display: "block",
          maxHeight: 180,
          overflow: "auto",
          overflowWrap: "anywhere",
        }}
      >
        {result}
      </output>
    </aside>
  );
}
