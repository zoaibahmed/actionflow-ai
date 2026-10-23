"use client";
import { useRef, useState } from "react";
import { m, AnimatePresence, useScroll, useTransform } from "motion/react";
import { Icon } from "@/components/ui/icon";
const examples = [
  { title: "Send the project proposal", tag: "Work", priority: "High" },
  { title: "Make time for a long walk", tag: "Personal", priority: "Low" },
  { title: "Book that weekend away", tag: "Life", priority: "Medium" },
];
export function TaskIllustration() {
  const [done, setDone] = useState<number[]>([1]);
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], [7, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [25, 0]);
  return (
    <m.div
      className="task-illustration"
      ref={ref}
      style={{ rotateX, y, transformPerspective: 1000 }}
    >
      <div className="illustration-top">
        <span className="feature-icon">
          <Icon name="tasks" />
        </span>
        <span>Your next steps</span>
        <span className="availability live">Interactive illustration</span>
      </div>
      <div className="illustration-tabs">
        <span>All tasks</span>
        <span>Personal</span>
        <span>Work</span>
      </div>
      {examples.map((task, index) => (
        <m.div
          layout="position"
          className={`illustration-task ${done.includes(index) ? "done" : ""}`}
          key={task.title}
        >
          <button
            aria-label={`${done.includes(index) ? "Reopen" : "Complete"} illustration task: ${task.title}`}
            aria-pressed={done.includes(index)}
            className="illustration-check"
            onClick={() =>
              setDone((current) =>
                current.includes(index)
                  ? current.filter((value) => value !== index)
                  : [...current, index],
              )
            }
          >
            <AnimatePresence>
              {done.includes(index) && (
                <m.span
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                >
                  <Icon name="check" width="13" />
                </m.span>
              )}
            </AnimatePresence>
          </button>
          <span>
            <strong>{task.title}</strong>
            <small>{task.tag}</small>
          </span>
          <span className={`priority ${task.priority.toLowerCase()}`}>
            {task.priority}
          </span>
        </m.div>
      ))}
      <div className="illustration-footer">
        <span>
          <Icon name="check" width="14" />
          {done.length} of 3 illustration tasks complete
        </span>
        <span>Try a checkbox</span>
      </div>
      <p className="illustration-disclaimer">
        Example content · Changes here are not saved to your workspace.
      </p>
    </m.div>
  );
}
