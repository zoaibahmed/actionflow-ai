import { z } from "zod";
import { revalidatePath } from "next/cache";
import { captureAccess, captureFailure } from "@/lib/capture/http";
import { CaptureError } from "@/lib/capture/errors";
import { aiConfigured } from "@/lib/ai/client";
import { getMongoClient } from "@/lib/db/mongo";
import { consumeLimit } from "@/lib/capture/repository";
import { taskRepository } from "@/lib/tasks/repository";
import {
  daySchema,
  preferencesSchema,
  planRequestSchema,
  savePlanSchema,
  availability,
  validateSchedule,
  validateCoverage,
} from "@/lib/planner/schema";
import {
  getPlan,
  getPreferences,
  nearbyBlocks,
  savePreferences,
  selectedTasks,
  otherIntervals,
  plannerQuota,
  taskSnapshot,
  savePlan,
} from "@/lib/planner/repository";
import { generatePlan } from "@/lib/planner/openai";
export const maxDuration = 90;
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("load"), date: daySchema }).strict(),
  z
    .object({
      action: z.literal("preferences"),
      preferences: preferencesSchema,
      version: z.number().int().min(0),
    })
    .strict(),
  z
    .object({ action: z.literal("generate"), input: planRequestSchema })
    .strict(),
  z.object({ action: z.literal("save"), input: savePlanSchema }).strict(),
]);
export async function POST(request: Request) {
  try {
    const { owner, db } = await captureAccess(request);
    const now = Date.now(),
      minute = Math.floor(now / 60000);
    if (
      !(
        await consumeLimit(
          db,
          `planner:requests:${owner}:${minute}`,
          60,
          new Date(now + 120000),
        )
      ).allowed
    )
      throw new CaptureError(
        "rate",
        "Too many requests. Please wait a minute.",
        429,
      );
    const reader = request.body?.getReader();
    if (!reader) throw new CaptureError("input", "Provide planning details.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const timer = setTimeout(() => void reader.cancel().catch(() => {}), 15000);
    let raw: unknown;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 100000) {
          await reader.cancel();
          throw new CaptureError("size", "This plan is too large.", 413);
        }
        chunks.push(value);
      }
      try {
        raw = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        throw new CaptureError("input", "Planning details could not be read.");
      }
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success)
      throw new CaptureError(
        "input",
        parsed.error.issues[0]?.message || "Check the planning details.",
      );
    const body = parsed.data;
    let result: unknown;
    if (body.action === "load") {
      const [plan, preferences, tasks, reserved] = await Promise.all([
        getPlan(db, owner, body.date),
        getPreferences(db, owner),
        taskRepository(db, owner).list(),
        nearbyBlocks(db, owner, body.date),
      ]);
      result = { plan, ...preferences, tasks, reserved };
    } else if (body.action === "preferences") {
      try {
        availability({
          date: "2026-01-15",
          preferences: body.preferences,
          commitments: [],
          taskIds: [],
          version: 0,
        });
      } catch (e) {
        throw new CaptureError(
          "constraints",
          e instanceof Error ? e.message : "Invalid preferences.",
        );
      }
      result = {
        version: await savePreferences(
          db,
          owner,
          body.preferences,
          body.version,
        ),
      };
    } else {
      const input = body.input;
      try {
        availability(input);
      } catch (e) {
        throw new CaptureError(
          "constraints",
          e instanceof Error ? e.message : "Invalid availability.",
        );
      }
      if (body.action === "generate") {
        if (!aiConfigured())
          throw new CaptureError(
            "setup",
            "OpenAI is not configured. Manual scheduling is available.",
            503,
          );
        if (!input.taskIds.length)
          throw new CaptureError(
            "tasks",
            "Choose at least one unfinished task.",
          );
        const current = await getPlan(db, owner, input.date);
        if ((current?.version ?? 0) !== input.version)
          throw new CaptureError(
            "stale",
            "This schedule has changed. Reload it before generating.",
            409,
          );
        const tasks = await selectedTasks(db, owner, input);
        const external = await otherIntervals(db, owner, input);
        await plannerQuota(db, owner);
        const plan = await generatePlan(input, tasks, external, request.signal);
        result = { ...plan, taskSnapshot: taskSnapshot(tasks) };
      } else {
        const tasks = await selectedTasks(db, owner, body.input);
        try {
          validateCoverage(
            body.input,
            body.input.blocks,
            body.input.unscheduled,
          );
          validateSchedule(
            body.input,
            body.input.blocks,
            tasks,
            await otherIntervals(db, owner, body.input),
          );
        } catch (e) {
          throw new CaptureError(
            "constraints",
            e instanceof Error ? e.message : "Invalid schedule.",
          );
        }
        result = {
          plan: await savePlan(db, getMongoClient(), owner, body.input),
        };
        revalidatePath("/dashboard");
        revalidatePath("/dashboard/planner");
      }
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return captureFailure(error);
  }
}
