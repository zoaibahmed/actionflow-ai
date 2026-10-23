import { randomUUID, createHash } from "node:crypto";
import { MongoServerError, type Db, type MongoClient } from "mongodb";
import type { Task } from "@/types/task";
import { taskRepository } from "../tasks/repository";
import { CaptureError } from "./errors";
import { approvedTask, type ApprovalItem, type SaveResult } from "./schema";
export type CaptureDocument = {
  _id: string;
  user_id: string;
  suggestion_ids: string[];
  createdAt: Date;
  expiresAt: Date;
};
type UsageDocument = {
  _id: string;
  count: number;
  granted: boolean;
  expiresAt: Date;
};
type Receipt = {
  _id: string;
  user_id: string;
  capture_id: string;
  suggestion_id: string;
  task_id: string;
  hash: string;
  createdAt: Date;
};
export function dailyLimit() {
  const value = Number(process.env.CAPTURE_DAILY_LIMIT || 20);
  return Number.isInteger(value) && value > 0 && value <= 1000 ? value : 20;
}
export async function consumeLimit(
  db: Db,
  key: string,
  limit: number,
  expiresAt: Date,
) {
  const doc = await db
    .collection<UsageDocument>("captureUsage")
    .findOneAndUpdate(
      { _id: key },
      [
        {
          $set: {
            granted: { $lt: [{ $ifNull: ["$count", 0] }, limit] },
            count: {
              $cond: [
                { $lt: [{ $ifNull: ["$count", 0] }, limit] },
                { $add: [{ $ifNull: ["$count", 0] }, 1] },
                { $ifNull: ["$count", 0] },
              ],
            },
            expiresAt: { $literal: expiresAt },
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
  return {
    allowed: Boolean(doc?.granted),
    remaining: Math.max(0, limit - (doc?.count ?? limit)),
  };
}
export async function captureRateLimit(
  db: Db,
  owner: string,
  now = new Date(),
) {
  const minute = Math.floor(now.getTime() / 60000);
  const result = await consumeLimit(
    db,
    `rate:${owner}:${minute}`,
    5,
    new Date((minute + 2) * 60000),
  );
  if (!result.allowed)
    throw new CaptureError(
      "rate",
      "You’ve made several requests. Wait a minute, then try again.",
      429,
    );
}
export async function captureDailyQuota(
  db: Db,
  owner: string,
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10);
  const expiresAt = new Date(`${day}T00:00:00.000Z`);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 2);
  const result = await consumeLimit(
    db,
    `day:${owner}:${day}`,
    dailyLimit(),
    expiresAt,
  );
  if (!result.allowed)
    throw new CaptureError(
      "daily_limit",
      "You’ve reached today’s capture allowance. It resets at midnight UTC.",
      429,
    );
  return result.remaining;
}
export async function createCapture(
  db: Db,
  owner: string,
  suggestionIds: string[],
) {
  const createdAt = new Date();
  const doc: CaptureDocument = {
    _id: randomUUID(),
    user_id: owner,
    suggestion_ids: suggestionIds,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
  };
  await db.collection<CaptureDocument>("captures").insertOne(doc);
  return doc;
}
export async function saveApproved(
  db: Db,
  client: MongoClient,
  owner: string,
  captureId: string,
  items: ApprovalItem[],
): Promise<SaveResult> {
  const capture = await db.collection<CaptureDocument>("captures").findOne({
    _id: captureId,
    user_id: owner,
    expiresAt: { $gt: new Date() },
  });
  if (!capture)
    throw new CaptureError(
      "capture_expired",
      "This capture is unavailable or has expired. Start a new capture; your existing saved tasks are safe.",
      410,
    );
  if (items.some((item) => !capture.suggestion_ids.includes(item.suggestionId)))
    throw new CaptureError(
      "suggestion",
      "These suggestions don’t belong to this capture.",
      403,
    );
  const result: SaveResult = { saved: [], errors: [] };
  for (const item of items) {
    const input = approvedTask(item);
    const id = `${owner}:${captureId}:${item.suggestionId}`;
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const receipts = db.collection<Receipt>("captureReceipts");
    try {
      let alreadySaved = false;
      let savedTask: Task | null = null;
      await client.withSession(async (session) => {
        await session.withTransaction(
          async () => {
            const receipt = await receipts.findOne(
              { _id: id, user_id: owner },
              { session },
            );
            if (receipt) {
              if (receipt.hash !== hash)
                throw new CaptureError(
                  "saved_changed",
                  "This suggestion was already saved with different edits. Update it in My Tasks.",
                  409,
                );
              savedTask = await taskRepository(db, owner).findById(
                receipt.task_id,
                session,
              );
              if (!savedTask)
                throw new CaptureError(
                  "removed",
                  "This task was saved earlier and has since been removed. Start a new capture to create it again.",
                  409,
                );
              alreadySaved = true;
              return;
            }
            await receipts.insertOne(
              {
                _id: id,
                user_id: owner,
                capture_id: captureId,
                suggestion_id: item.suggestionId,
                task_id: item.suggestionId,
                hash,
                createdAt: new Date(),
              },
              { session },
            );
            savedTask = await taskRepository(db, owner).createApproved(
              item.suggestionId,
              input,
              session,
            );
          },
          {
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority" },
          },
        );
      });
      result.saved.push({
        suggestionId: item.suggestionId,
        taskId: item.suggestionId,
        alreadySaved,
        task: savedTask!,
      });
    } catch (error) {
      // A simultaneous request may have committed the same receipt while ours retried.
      if (error instanceof MongoServerError && error.code === 11000) {
        const receipt = await receipts.findOne({ _id: id, user_id: owner });
        const task = receipt
          ? await taskRepository(db, owner).findById(receipt.task_id)
          : null;
        if (receipt?.hash === hash && task) {
          result.saved.push({
            suggestionId: item.suggestionId,
            taskId: receipt.task_id,
            alreadySaved: true,
            task,
          });
          continue;
        }
      }
      result.errors.push({
        suggestionId: item.suggestionId,
        message:
          error instanceof CaptureError
            ? error.message
            : "This task couldn’t be saved. Keep your edits and retry; tasks already saved won’t be duplicated.",
      });
    }
  }
  return result;
}
