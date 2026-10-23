import { captureAccess, captureFailure } from "@/lib/capture/http";
import { CaptureError } from "@/lib/capture/errors";
import { consumeLimit } from "@/lib/capture/repository";
import { getMongoClient } from "@/lib/db/mongo";
import { ownerTransaction } from "@/lib/reminders/repository";
import { workspaceRequest } from "@/lib/workspace/schema";
import {
  readNote,
  listNotes,
  saveNote,
  deleteNote,
  noteView,
  startFocus,
  changeFocus,
  focusState,
  focusView,
  literal,
} from "@/lib/workspace/repository";
import { searchWorkspace, insights } from "@/lib/workspace/queries";
export async function POST(request: Request) {
  try {
    const { owner, db } = await captureAccess(request);
    const now = Date.now();
    if (
      !(
        await consumeLimit(
          db,
          `workspace:${owner}:${Math.floor(now / 60000)}`,
          100,
          new Date(now + 120000),
        )
      ).allowed
    )
      throw new CaptureError(
        "rate",
        "Please wait a minute before trying again.",
        429,
      );
    const reader = request.body?.getReader();
    if (!reader) throw new CaptureError("input", "Provide request details.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      void reader.cancel().catch(() => {});
    }, 10000);
    let raw: unknown;
    try {
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 140000) {
          await reader.cancel();
          throw new CaptureError("size", "This request is too large.", 413);
        }
        chunks.push(r.value);
      }
      if (expired) throw new CaptureError("timeout", "Request timed out.", 408);
      raw = JSON.parse(Buffer.concat(chunks).toString());
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
    const parsed = workspaceRequest.safeParse(raw);
    if (!parsed.success)
      throw new CaptureError(
        "input",
        parsed.error.issues.some((i) => i.path.includes("title"))
          ? "Give your note a title of 1–160 characters."
          : parsed.error.issues.some((i) => i.path.includes("content"))
            ? "Keep note content within 30,000 characters."
            : "Check the supplied fields and size limits.",
      );
    const b = parsed.data;
    let result: unknown;
    if (b.action === "notes") {
      const rows = await listNotes(db, owner, b.query, b.sort, b.page);
      result = {
        notes: rows.slice(0, 30),
        hasMore: b.page < 99 && rows.length > 30,
      };
    } else if (b.action === "note_read")
      result = noteView(await readNote(db, owner, b.id));
    else if (b.action === "note_save")
      result = noteView(await saveNote(db, owner, b.id, b.version, b.input));
    else if (b.action === "note_delete") {
      await deleteNote(db, owner, b.id, b.version);
      result = { deleted: true };
    } else if (b.action === "focus_state") result = await focusState(db, owner);
    else if (b.action === "focus_start")
      result = focusView(
        await ownerTransaction(db, getMongoClient(), owner, (s) =>
          startFocus(db, owner, b.id, b.input, s),
        ),
      );
    else if (b.action === "focus_change")
      result = focusView(
        await ownerTransaction(db, getMongoClient(), owner, (s) =>
          changeFocus(db, owner, b.id, b.version, b.mode, s),
        ),
      );
    else if (b.action === "focus_default") {
      await db
        .collection<{ _id: string; minutes: number }>("focusPreferences")
        .updateOne(
          { _id: owner },
          { $set: { minutes: b.minutes } },
          { upsert: true },
        );
      result = { saved: true };
    } else if (b.action === "search")
      result = await searchWorkspace(db, owner, {
        query: b.query,
        page: b.page,
      });
    else if (b.action === "insights")
      result = await insights(db, owner, {
        days: b.days,
        timezone: b.timezone,
      });
    else
      result = {
        tasks: await db
          .collection("tasks")
          .find(
            {
              user_id: owner,
              ...(b.query
                ? { title: { $regex: literal(b.query), $options: "i" } }
                : {}),
            },
            { projection: { title: 1 }, maxTimeMS: 4000 },
          )
          .sort({ updated_at: -1 })
          .limit(30)
          .toArray(),
      };
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return captureFailure(
      e instanceof SyntaxError
        ? new CaptureError("input", "Provide valid workspace request data.")
        : e,
    );
  }
}
