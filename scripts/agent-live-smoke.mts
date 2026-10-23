// Explicitly opted-in, synthetic-data-only paid smoke. Never targets the real DB.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { agentMessage } from "../src/lib/agent/service";
import { approve, cancel } from "../src/lib/agent/repository";
import { taskRepository } from "../src/lib/tasks/repository";
assert.ok(
  process.argv.includes("--allow-paid"),
  "Explicit --allow-paid required",
);
assert.ok(
  process.env.MONGODB_URI?.startsWith("mongodb://127.0.0.1:"),
  "Disposable loopback Mongo only",
);
assert.match(process.env.MONGODB_DB || "", /^actionflow_ai_live_smoke_/);
assert.ok(process.env.OPENAI_API_KEY, "Configure a server-side key privately");
assert.ok(
  !process.env.OPENAI_BASE_URL,
  "Live smoke cannot use a mock/custom provider",
);
let requests = 0,
  totalTokens = 0;
const toolNames: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://api.openai.com/v1/"))
    throw new Error("Unexpected provider destination");
  if (++requests > 25) throw new Error("Live smoke request budget exhausted");
  const response = await originalFetch(input, init);
  if (response.ok) {
    const body = await response.clone().json();
    totalTokens += body.usage?.total_tokens ?? 0;
    for (const item of body.output ?? [])
      if (item.type === "function_call") toolNames.push(item.name);
  }
  return response;
};
const client = new MongoClient(process.env.MONGODB_URI!);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);
  const prompts = [
    "Show my open tasks.",
    "Create an undated task titled Live smoke reading with medium priority and no description. Prepare a preview only.",
    "Set the priority of Unique database assignment to high. Prepare a preview only.",
    "Show upcoming reminders for my tasks.",
    "What is my saved Dayflow plan for tomorrow? Do not generate or save a new one.",
    "Find my notes containing the phrase meeting recap.",
    "Show my productivity insights for the last seven days.",
    "Search my workspace for database.",
    "Move my database assignment to next Friday evening. Ask me to clarify the exact date, time and which task before making a preview.",
    "Create an undated task titled Cancelled live smoke with low priority and no description. Prepare a preview only.",
  ];
  const outcomes: unknown[] = [];
  // Two synthetic owners, five requests each: no quota bypass or paid retry loop.
  const owners = [randomUUID(), randomUUID()];
  for (const owner of owners) {
    await taskRepository(db, owner).create({
      title: "Unique database assignment",
      description: null,
      priority: "medium",
      status: "todo",
      due_at: null,
    });
    for (const title of ["Database assignment A", "Database assignment B"])
      await taskRepository(db, owner).create({
        title,
        description: null,
        priority: "low",
        status: "todo",
        due_at: null,
      });
  }
  for (const [index, text] of prompts.entries()) {
    const owner = owners[Math.floor(index / 5)];
    const before = await db
      .collection("tasks")
      .countDocuments({ user_id: owner });
    const start = toolNames.length;
    const result = await agentMessage(db, owner, {
      conversationId: null,
      requestId: randomUUID(),
      text,
      timezone: "Asia/Karachi",
    });
    assert.equal(
      await db.collection("tasks").countDocuments({ user_id: owner }),
      before,
      "Model must not execute writes",
    );
    const pending = result.actions.filter((a) => a.status === "pending");
    if (index === 1) {
      const a = pending.find((a) => a.payload.kind === "task_create");
      assert.ok(a, "Expected create preview");
      const payload = {
        id: a.id,
        revision: a.revision,
        hash: a.hash,
        confirmDates: true,
        secondConfirmation: null,
      };
      await approve(db, client, owner, payload);
      await approve(db, client, owner, payload);
      assert.equal(
        await db.collection("tasks").countDocuments({ user_id: owner }),
        before + 1,
      );
    } else if (index === 2) {
      const a = pending.find((a) => a.payload.kind === "task_update");
      assert.ok(a, "Expected update preview");
      await approve(db, client, owner, {
        id: a.id,
        revision: a.revision,
        hash: a.hash,
        confirmDates: true,
        secondConfirmation: null,
      });
      assert.equal(
        (
          await db
            .collection("tasks")
            .findOne({ user_id: owner, title: "Unique database assignment" })
        )?.priority,
        "high",
      );
    } else {
      if (index === 8)
        assert.equal(
          pending.length,
          0,
          "Ambiguous request must not choose an arbitrary record",
        );
      if (index === 9)
        assert.ok(
          pending.some((a) => a.payload.kind === "task_create"),
          "Expected cancellable preview",
        );
      for (const a of pending)
        await cancel(db, owner, a.id, a.revision, a.hash);
    }
    outcomes.push({
      case: index + 1,
      tools: toolNames.slice(start),
      previews: pending.length,
      passed: true,
    });
  }
  console.log(
    JSON.stringify({ passed: true, requests, totalTokens, outcomes }),
  );
} catch (error) {
  const e = error as { status?: number; code?: string };
  console.error(
    JSON.stringify({
      passed: false,
      requests,
      totalTokens,
      status: e.status ?? null,
      code:
        typeof e.code === "string" && /^[a-z_]+$/.test(e.code) ? e.code : null,
      reason:
        error instanceof assert.AssertionError
          ? "Smoke assertion failed"
          : "Provider or fixture failure",
    }),
  );
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  await client.close();
}
