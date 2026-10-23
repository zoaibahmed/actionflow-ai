import { createHash } from "node:crypto";
import {
  MongoServerError,
  type Db,
  type MongoClient,
  type ClientSession,
} from "mongodb";
import type { Task } from "@/types/task";
import { taskRepository } from "../tasks/repository";
import { CaptureError } from "../capture/errors";
import { consumeLimit } from "../capture/repository";
import {
  defaults,
  availability,
  dayBounds,
  validateSchedule,
  validateCoverage,
  type PlanInput,
  type PlanRequest,
  type Preferences,
  type SavedPlan,
} from "./schema";
type PlanDoc = {
  _id: string;
  user_id: string;
  date: string;
  timezone: string;
  version: number;
  input: PlanInput;
  intervals: { taskId: string; start_at: Date; end_at: Date }[];
  createdAt: Date;
  updatedAt: Date;
};
type PreferencesDoc = {
  _id: string;
  value: Preferences;
  version: number;
  updatedAt: Date;
};
type Receipt = { _id: string; hash: string; plan: PlanDoc };
function serialized(doc: PlanDoc): SavedPlan {
  return {
    version: doc.version,
    updatedAt: doc.updatedAt.toISOString(),
    input: doc.input,
    intervals: doc.intervals.map((b) => ({
      ...b,
      start_at: b.start_at.toISOString(),
      end_at: b.end_at.toISOString(),
    })),
  };
}
export function taskSnapshot(tasks: Task[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        tasks.map((t) => [t.id, t.updated_at, t.status, t.due_at]).sort(),
      ),
    )
    .digest("hex");
}
export async function selectedTasks(
  db: Db,
  owner: string,
  input: PlanRequest,
  session?: ClientSession,
) {
  const repo = taskRepository(db, owner);
  const tasks = await Promise.all(
    input.taskIds.map((id) => repo.findById(id, session)),
  );
  if (tasks.some((t) => !t || t.status === "done"))
    throw new CaptureError(
      "tasks",
      "A task was completed, deleted or is unavailable. Reload before planning.",
      409,
    );
  return tasks as Task[];
}
export async function getPlan(db: Db, owner: string, date: string) {
  const doc = await db
    .collection<PlanDoc>("dailyPlans")
    .findOne({ _id: `${owner}:${date}`, user_id: owner });
  return doc ? serialized(doc) : null;
}
export async function nearbyBlocks(db: Db, owner: string, date: string) {
  const middle = Date.parse(`${date}T12:00:00Z`);
  const docs = await db
    .collection<PlanDoc>("dailyPlans")
    .find({
      user_id: owner,
      date: { $ne: date },
      intervals: {
        $elemMatch: {
          start_at: { $lt: new Date(middle + 172800000) },
          end_at: { $gt: new Date(middle - 172800000) },
        },
      },
    })
    .toArray();
  return docs.flatMap((doc) =>
    doc.intervals.map((block) => ({
      taskId: block.taskId,
      date: doc.date,
      start_at: block.start_at.toISOString(),
      end_at: block.end_at.toISOString(),
    })),
  );
}
export async function getPreferences(db: Db, owner: string) {
  const doc = await db
    .collection<PreferencesDoc>("plannerPreferences")
    .findOne({ _id: owner });
  return {
    preferences: doc?.value ?? defaults,
    version: doc?.version ?? 0,
    exists: !!doc,
  };
}
export async function savePreferences(
  db: Db,
  owner: string,
  value: Preferences,
  version: number,
) {
  availability({
    date: "2026-01-15",
    preferences: value,
    commitments: [],
    taskIds: [],
    version: 0,
  });
  const count = await db
    .collection<{ _id: string; user_id: string }>("tasks")
    .countDocuments({
      user_id: owner,
      _id: { $in: value.estimates.map((e) => e.taskId) },
    });
  if (count !== value.estimates.length)
    throw new CaptureError("tasks", "An estimated task is unavailable.", 409);
  const collection = db.collection<PreferencesDoc>("plannerPreferences");
  try {
    if (!version)
      await collection.insertOne({
        _id: owner,
        value,
        version: 1,
        updatedAt: new Date(),
      });
    else {
      const result = await collection.updateOne(
        { _id: owner, version },
        { $set: { value, updatedAt: new Date() }, $inc: { version: 1 } },
      );
      if (!result.modifiedCount)
        throw new CaptureError(
          "stale",
          "Preferences changed in another tab. Reload before saving.",
          409,
        );
    }
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000)
      throw new CaptureError(
        "stale",
        "Preferences changed in another tab. Reload before saving.",
        409,
      );
    throw error;
  }
  return version + 1;
}
export async function otherIntervals(
  db: Db,
  owner: string,
  input: PlanRequest,
  session?: ClientSession,
) {
  const bounds = dayBounds(input.date, input.preferences.timezone);
  const others = await db
    .collection<PlanDoc>("dailyPlans")
    .find(
      {
        user_id: owner,
        date: { $ne: input.date },
        intervals: {
          $elemMatch: {
            start_at: { $lt: new Date(bounds.end) },
            end_at: { $gt: new Date(bounds.start) },
          },
        },
      },
      { session },
    )
    .toArray();
  return others.flatMap((p) =>
    p.intervals.map((b) => ({
      start: b.start_at.getTime(),
      end: b.end_at.getTime(),
    })),
  );
}
export async function plannerQuota(db: Db, owner: string, now = new Date()) {
  const configured = Number(process.env.PLANNER_DAILY_LIMIT || 20);
  const limit =
    Number.isInteger(configured) && configured > 0 && configured <= 1000
      ? configured
      : 20;
  const minute = Math.floor(now.getTime() / 60000);
  if (
    !(
      await consumeLimit(
        db,
        `planner:minute:${owner}:${minute}`,
        3,
        new Date((minute + 2) * 60000),
      )
    ).allowed
  )
    throw new CaptureError(
      "rate",
      "Please wait a minute before generating another plan.",
      429,
    );
  if (
    !(
      await consumeLimit(
        db,
        `planner:day:${owner}:${now.toISOString().slice(0, 10)}`,
        limit,
        new Date(now.getTime() + 172800000),
      )
    ).allowed
  )
    throw new CaptureError(
      "quota",
      "Your daily planning limit has been reached. Try again tomorrow (UTC).",
      429,
    );
}
export async function savePlan(
  db: Db,
  client: MongoClient,
  owner: string,
  input: PlanInput,
  existingSession?: ClientSession,
) {
  const id = `${owner}:${input.date}`,
    receiptId = `${owner}:${input.requestId}`;
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  try {
    const execute = async (session: ClientSession) => {
      const receipts = db.collection<Receipt>("plannerReceipts");
      const receipt = await receipts.findOne({ _id: receiptId }, { session });
      if (receipt) {
        if (receipt.hash !== hash)
          throw new CaptureError(
            "duplicate",
            "This save identifier was already used for different changes.",
            409,
          );
        const current = await db
          .collection<PlanDoc>("dailyPlans")
          .findOne({ _id: id, user_id: owner }, { session });
        if (!current || current.version !== receipt.plan.version)
          throw new CaptureError(
            "stale",
            "This save succeeded earlier, but the schedule has since changed. Reload it.",
            409,
          );
        return serialized(receipt.plan);
      }
      // Serialize this owner's schedule writes, including plans in different timezones.
      await db
        .collection<{ _id: string; tick: number }>("plannerLocks")
        .updateOne(
          { _id: owner },
          { $inc: { tick: 1 } },
          { upsert: true, session },
        );
      const plans = db.collection<PlanDoc>("dailyPlans");
      const previous = await plans.findOne(
        { _id: id, user_id: owner },
        { session },
      );
      if ((previous?.version ?? 0) !== input.version)
        throw new CaptureError(
          "stale",
          "This schedule changed in another tab. Reload it before saving.",
          409,
        );
      const tasks = await selectedTasks(db, owner, input, session);
      if (taskSnapshot(tasks) !== input.taskSnapshot)
        throw new CaptureError(
          "stale_tasks",
          "Your tasks changed after this preview. Reload before saving.",
          409,
        );
      const external = await otherIntervals(db, owner, input, session);
      let ranges;
      try {
        validateCoverage(input, input.blocks, input.unscheduled);
        ranges = validateSchedule(input, input.blocks, tasks, external);
      } catch (error) {
        throw new CaptureError(
          "constraints",
          error instanceof Error ? error.message : "Invalid schedule.",
        );
      }
      const now = new Date();
      const plan: PlanDoc = {
        _id: id,
        user_id: owner,
        date: input.date,
        timezone: input.preferences.timezone,
        version: input.version + 1,
        input,
        intervals: ranges.map((r) => ({
          taskId: r.taskId,
          start_at: new Date(r.start),
          end_at: new Date(r.end),
        })),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      await plans.replaceOne({ _id: id, user_id: owner }, plan, {
        upsert: true,
        session,
      });
      await receipts.insertOne({ _id: receiptId, hash, plan }, { session });
      return serialized(plan);
    };
    if (existingSession) return await execute(existingSession);
    return await client.withSession((session) =>
      session.withTransaction(() => execute(session), {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }),
    );
  } catch (error) {
    if (existingSession) throw error;
    if (error instanceof MongoServerError && error.code === 11000) {
      const receipt = await db
        .collection<Receipt>("plannerReceipts")
        .findOne({ _id: receiptId });
      const current = await getPlan(db, owner, input.date);
      if (receipt?.hash === hash && current?.version === receipt.plan.version)
        return serialized(receipt.plan);
      throw new CaptureError(
        "stale",
        "Another save completed first. Reload the schedule.",
        409,
      );
    }
    throw error;
  }
}
