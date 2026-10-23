import { randomUUID } from "node:crypto";
import type { Db, ClientSession } from "mongodb";
import type { Task, TaskInput } from "@/types/task";
export type TaskDocument = Omit<
  Task,
  "id" | "due_at" | "completed_at" | "created_at" | "updated_at"
> & {
  _id: string;
  due_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
function serialize(document: TaskDocument): Task {
  const { _id, due_at, completed_at, created_at, updated_at, ...rest } =
    document;
  return {
    ...rest,
    id: _id,
    due_at: due_at?.toISOString() ?? null,
    completed_at: completed_at?.toISOString() ?? null,
    created_at: created_at.toISOString(),
    updated_at: updated_at.toISOString(),
  };
}
function taskValues(input: TaskInput) {
  // $literal prevents strings beginning with '$' from becoming pipeline expressions.
  return {
    title: { $literal: input.title },
    description: { $literal: input.description },
    priority: { $literal: input.priority },
    status: { $literal: input.status },
    due_at: { $literal: input.due_at ? new Date(input.due_at) : null },
  };
}
// This repository is only called after server-side session verification. Every selector
// includes that verified owner; no method accepts browser-supplied ownership fields.
export function taskRepository(db: Db, ownerId: string) {
  if (!ownerId) throw new Error("A verified owner is required.");
  const tasks = db.collection<TaskDocument>("tasks");
  return {
    async list() {
      return (
        await tasks
          .find({ user_id: ownerId })
          .sort({ created_at: -1, _id: 1 })
          .toArray()
      ).map(serialize);
    },
    async findById(id: string, session?: ClientSession) {
      const doc = await tasks.findOne(
        { _id: id, user_id: ownerId },
        { session },
      );
      return doc ? serialize(doc) : null;
    },
    async create(input: TaskInput, session?: ClientSession) {
      const document = await tasks.findOneAndUpdate(
        { _id: randomUUID(), user_id: ownerId },
        [
          {
            $set: {
              ...taskValues(input),
              user_id: { $literal: ownerId },
              created_at: "$$NOW",
              updated_at: "$$NOW",
              completed_at: input.status === "done" ? "$$NOW" : null,
            },
          },
        ],
        { upsert: true, returnDocument: "after", session },
      );
      if (!document) throw new Error("Task was not created.");
      return serialize(document);
    },
    // Capture receipts and this insert commit together. Only verified capture IDs
    // reach this method; ordinary task creation and its schema are unchanged.
    async createApproved(id: string, input: TaskInput, session: ClientSession) {
      const document = await tasks.findOneAndUpdate(
        { _id: id, user_id: ownerId },
        [
          {
            $set: {
              ...taskValues(input),
              user_id: { $literal: ownerId },
              created_at: "$$NOW",
              updated_at: "$$NOW",
              completed_at: null,
            },
          },
        ],
        { upsert: true, returnDocument: "after", session },
      );
      if (!document) throw new Error("Task was not created.");
      return serialize(document);
    },
    async update(id: string, input: TaskInput, session?: ClientSession) {
      const document = await tasks.findOneAndUpdate(
        { _id: id, user_id: ownerId },
        [
          {
            $set: {
              ...taskValues(input),
              updated_at: "$$NOW",
              completed_at:
                input.status === "done"
                  ? {
                      $cond: [
                        { $eq: ["$status", "done"] },
                        "$completed_at",
                        "$$NOW",
                      ],
                    }
                  : null,
            },
          },
        ],
        { returnDocument: "after", session },
      );
      return document ? serialize(document) : null;
    },
    async complete(id: string, done: boolean, session?: ClientSession) {
      const document = await tasks.findOneAndUpdate(
        { _id: id, user_id: ownerId },
        [
          {
            $set: {
              status: done ? "done" : "todo",
              updated_at: "$$NOW",
              completed_at: done
                ? {
                    $cond: [
                      { $eq: ["$status", "done"] },
                      "$completed_at",
                      "$$NOW",
                    ],
                  }
                : null,
            },
          },
        ],
        { returnDocument: "after", session },
      );
      return document ? serialize(document) : null;
    },
    async delete(id: string, session?: ClientSession) {
      return (
        (await tasks.deleteOne({ _id: id, user_id: ownerId }, { session }))
          .deletedCount === 1
      );
    },
  };
}
