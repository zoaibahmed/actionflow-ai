import "server-only";
import type { Db, ClientSession } from "mongodb";
import { CaptureError } from "../capture/errors";
import {
  noteInput,
  focusInput,
  focusElapsed,
  type NoteView,
  type FocusView,
  type NoteInput,
} from "./schema";
export type NoteDoc = NoteInput & {
  _id: string;
  user_id: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
export type FocusDoc = Omit<
  FocusView,
  "id" | "createdAt" | "completedAt" | "resumedAt"
> & {
  _id: string;
  user_id: string;
  active?: boolean;
  createdAt: Date;
  completedAt: Date | null;
  resumedAt: Date | null;
};
export const literal = (q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function stale(): never {
  throw new CaptureError(
    "stale",
    "This record changed or is unavailable. Reload the latest version; your edits are still here.",
    409,
  );
}
export function noteView(n: NoteDoc): NoteView {
  const { _id, user_id: _, createdAt, updatedAt, ...rest } = n;
  void _;
  return {
    ...rest,
    id: _id,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
export async function readNote(
  db: Db,
  owner: string,
  id: string,
  session?: ClientSession,
) {
  const n = await db
    .collection<NoteDoc>("notes")
    .findOne({ _id: id, user_id: owner }, { session });
  if (!n) stale();
  return n;
}
export async function listNotes(
  db: Db,
  owner: string,
  query = "",
  sort: "updatedAt" | "createdAt" = "updatedAt",
  page = 0,
) {
  return (
    await db
      .collection<NoteDoc>("notes")
      .find(
        {
          user_id: owner,
          ...(query
            ? {
                $or: [
                  { title: { $regex: literal(query), $options: "i" } },
                  { content: { $regex: literal(query), $options: "i" } },
                ],
              }
            : {}),
        },
        { projection: { content: 0 }, maxTimeMS: 4000 },
      )
      .sort({ pinned: -1, [sort]: -1, _id: 1 })
      .skip(page * 30)
      .limit(31)
      .toArray()
  ).map((n) => noteView({ ...n, content: "" }));
}
export async function saveNote(
  db: Db,
  owner: string,
  id: string,
  version: number,
  raw: NoteInput,
  session?: ClientSession,
) {
  const input = noteInput.parse(raw);
  if (
    input.linkedTaskId &&
    !(await db
      .collection("tasks")
      .findOne(
        { _id: input.linkedTaskId as never, user_id: owner },
        { session, projection: { _id: 1 } },
      ))
  )
    stale();
  const col = db.collection<NoteDoc>("notes");
  if (version === 0) {
    const existing = await col.findOne(
      { _id: id, user_id: owner },
      { session },
    );
    if (existing) {
      if (
        JSON.stringify({
          title: existing.title,
          content: existing.content,
          pinned: existing.pinned,
          linkedTaskId: existing.linkedTaskId,
        }) === JSON.stringify(input)
      )
        return existing;
      stale();
    }
    const n: NoteDoc = {
      ...input,
      _id: id,
      user_id: owner,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      await col.insertOne(n, { session });
      return n;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) stale();
      throw e;
    }
  }
  const n = await col.findOneAndUpdate(
    { _id: id, user_id: owner, version },
    { $set: { ...input, updatedAt: new Date() }, $inc: { version: 1 } },
    { session, returnDocument: "after" },
  );
  if (!n) stale();
  return n;
}
export async function deleteNote(
  db: Db,
  owner: string,
  id: string,
  version: number,
  session?: ClientSession,
) {
  if (
    !(
      await db
        .collection<NoteDoc>("notes")
        .deleteOne({ _id: id, user_id: owner, version }, { session })
    ).deletedCount
  )
    stale();
}
export function focusView(n: FocusDoc): FocusView {
  return {
    id: n._id,
    taskId: n.taskId,
    taskTitle: n.taskTitle,
    durationMs: n.durationMs,
    elapsedMs: n.elapsedMs,
    resumedAt: n.resumedAt?.toISOString() ?? null,
    status: n.status,
    version: n.version,
    createdAt: n.createdAt.toISOString(),
    completedAt: n.completedAt?.toISOString() ?? null,
  };
}
export async function settleFocus(
  db: Db,
  owner: string,
  session?: ClientSession,
  now = new Date(),
) {
  const col = db.collection<FocusDoc>("focusSessions");
  const s = await col.findOne({ user_id: owner, active: true }, { session });
  if (
    s?.status === "running" &&
    focusElapsed(s, now.getTime()) >= s.durationMs
  ) {
    const completedAt = new Date(
      s.resumedAt!.getTime() + s.durationMs - s.elapsedMs,
    );
    await col.updateOne(
      { _id: s._id, user_id: owner, version: s.version, active: true },
      {
        $set: {
          status: "completed",
          elapsedMs: s.durationMs,
          resumedAt: null,
          completedAt,
        },
        $unset: { active: "" },
        $inc: { version: 1 },
      },
      { session },
    );
    return null;
  }
  return s;
}
export async function startFocus(
  db: Db,
  owner: string,
  id: string,
  raw: unknown,
  session?: ClientSession,
) {
  const input = focusInput.parse(raw);
  const col = db.collection<FocusDoc>("focusSessions");
  const old = await col.findOne({ _id: id, user_id: owner }, { session });
  if (old) {
    if (old.durationMs !== input.minutes * 60000 || old.taskId !== input.taskId)
      stale();
    return old;
  }
  await settleFocus(db, owner, session);
  if (await col.findOne({ user_id: owner, active: true }, { session }))
    throw new CaptureError(
      "active_focus",
      "A focus session is already active. Resume or end it first.",
      409,
    );
  const task = input.taskId
    ? await db
        .collection("tasks")
        .findOne({ _id: input.taskId as never, user_id: owner }, { session })
    : null;
  if (input.taskId && !task) stale();
  const n: FocusDoc = {
    _id: id,
    user_id: owner,
    taskId: input.taskId,
    taskTitle: task?.title ?? null,
    durationMs: input.minutes * 60000,
    elapsedMs: 0,
    resumedAt: new Date(),
    status: "running",
    active: true,
    version: 1,
    createdAt: new Date(),
    completedAt: null,
  };
  await col.insertOne(n, { session });
  return n;
}
export async function changeFocus(
  db: Db,
  owner: string,
  id: string,
  version: number,
  mode: "pause" | "resume" | "finish" | "cancel",
  session?: ClientSession,
  now = new Date(),
) {
  const col = db.collection<FocusDoc>("focusSessions");
  const s = await col.findOne({ _id: id, user_id: owner }, { session });
  if (!s) stale();
  if (s.status === "completed" || s.status === "cancelled") return s;
  if (s.version !== version) stale();
  const elapsedMs = focusElapsed(s, now.getTime());
  if (
    (mode === "resume" && s.status !== "paused") ||
    (mode === "pause" && s.status !== "running")
  )
    stale();
  const completed = elapsedMs >= s.durationMs;
  if (mode === "finish" && !completed)
    throw new CaptureError(
      "unfinished",
      "This session still has time remaining. End early to cancel it; unfinished sessions do not count as completed.",
    );
  const terminal = completed || mode === "cancel";
  const status = completed
    ? "completed"
    : mode === "cancel"
      ? "cancelled"
      : mode === "pause"
        ? "paused"
        : "running";
  const n = await col.findOneAndUpdate(
    { _id: id, user_id: owner, version, active: true },
    {
      $set: {
        status,
        elapsedMs,
        resumedAt: status === "running" ? now : null,
        completedAt: completed
          ? new Date(s.resumedAt!.getTime() + s.durationMs - s.elapsedMs)
          : null,
      },
      ...(terminal ? { $unset: { active: "" } } : {}),
      $inc: { version: 1 },
    },
    { session, returnDocument: "after" },
  );
  if (!n) stale();
  return n;
}
export async function focusState(db: Db, owner: string) {
  await settleFocus(db, owner);
  const [active, history, totals, pref] = await Promise.all([
    db
      .collection<FocusDoc>("focusSessions")
      .findOne({ user_id: owner, active: true }),
    db
      .collection<FocusDoc>("focusSessions")
      .find({ user_id: owner, status: "completed" })
      .sort({ completedAt: -1 })
      .limit(20)
      .toArray(),
    db
      .collection<FocusDoc>("focusSessions")
      .aggregate(
        [
          { $match: { user_id: owner, status: "completed" } },
          {
            $group: {
              _id: null,
              elapsedMs: { $sum: "$elapsedMs" },
              count: { $sum: 1 },
            },
          },
        ],
        { maxTimeMS: 4000 },
      )
      .toArray(),
    db
      .collection<{ _id: string; minutes: number }>("focusPreferences")
      .findOne({ _id: owner }),
  ]);
  return {
    active: active ? focusView(active) : null,
    history: history.map(focusView),
    totals: totals[0] ?? { elapsedMs: 0, count: 0 },
    defaultMinutes: pref?.minutes ?? 25,
    serverNow: new Date().toISOString(),
  };
}
