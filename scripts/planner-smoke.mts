import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { generatePlan } from "../src/lib/planner/openai";
import { defaults, type PlanRequest } from "../src/lib/planner/schema";
import type { Task } from "../src/types/task";
nextEnv.loadEnvConfig(process.cwd());
// Manual opt-in paid smoke test. Synthetic data only; never writes task records.
const now = new Date().toISOString();
const tasks: Task[] = [
  "Review the release checklist",
  "Prepare meeting notes",
  "Organize reference files",
].map((title, i) => ({
  id: randomUUID(),
  user_id: "synthetic-smoke-only",
  title,
  description: null,
  priority: i ? "medium" : "high",
  status: "todo",
  due_at: null,
  completed_at: null,
  created_at: now,
  updated_at: now,
}));
const input: PlanRequest = {
  date: "2026-10-21",
  preferences: {
    ...defaults,
    timezone: "Asia/Karachi",
    end: "12:00",
    maxFocus: 90,
    breaks: [
      { id: randomUUID(), label: "Break", start: "10:00", end: "10:15" },
    ],
  },
  commitments: [],
  taskIds: tasks.map((t) => t.id),
  version: 0,
};
const plan = await generatePlan(input, tasks, []);
const result = {
  syntheticData: true,
  databaseWrites: 0,
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  validated: true,
  scheduledBlocks: plan.blocks.length,
  unscheduled: plan.unscheduled.length,
  focusMinutes: plan.blocks.reduce((s, b) => s + b.duration, 0),
};
await writeFile(
  "docs/phase-4/real-ai-smoke.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
