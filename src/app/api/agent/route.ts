import { revalidatePath } from "next/cache";
import { captureAccess, captureFailure } from "@/lib/capture/http";
import { CaptureError } from "@/lib/capture/errors";
import { consumeLimit } from "@/lib/capture/repository";
import { getMongoClient } from "@/lib/db/mongo";
import { requestSchema } from "@/lib/agent/schema";
import {
  approve,
  cancel,
  edit,
  loadConversation,
  type ConversationDoc,
} from "@/lib/agent/repository";
import { agentMessage, deleteConversation } from "@/lib/agent/service";
export const maxDuration = 90;
export async function POST(request: Request) {
  try {
    const { owner, db } = await captureAccess(request);
    const now = Date.now();
    if (
      !(
        await consumeLimit(
          db,
          `agent:http:${owner}:${Math.floor(now / 60000)}`,
          90,
          new Date(now + 120000),
        )
      ).allowed
    )
      throw new CaptureError(
        "rate",
        "Please wait a minute before making more requests.",
        429,
      );
    const reader = request.body?.getReader();
    if (!reader)
      throw new CaptureError("input", "Provide assistant request details.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    const timer = setTimeout(() => void reader.cancel().catch(() => {}), 10000);
    let raw: unknown;
    try {
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 90000) {
          await reader.cancel();
          throw new CaptureError(
            "size",
            "This assistant request is too large.",
            413,
          );
        }
        chunks.push(r.value);
      }
      raw = JSON.parse(Buffer.concat(chunks).toString());
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success)
      throw new CaptureError("input", "Check the assistant request fields.");
    const b = parsed.data;
    let result: unknown;
    if (b.action === "list") {
      const rows = await db
        .collection<ConversationDoc>("agentConversations")
        .find({ user_id: owner, purgeAt: { $gt: new Date() } })
        .sort({ updatedAt: -1 })
        .limit(20)
        .toArray();
      result = {
        conversations: rows.map((c) => ({
          id: c._id,
          title: c.title,
          updatedAt: c.updatedAt,
        })),
        configured: !!process.env.OPENAI_API_KEY?.trim(),
      };
    } else if (b.action === "load")
      result = await loadConversation(db, owner, b.conversationId);
    else if (b.action === "message")
      result = await agentMessage(db, owner, b, request.signal);
    else if (b.action === "approve") {
      result = await approve(db, getMongoClient(), owner, b);
      for (const path of [
        "/dashboard",
        "/dashboard/tasks",
        "/dashboard/notes",
        "/dashboard/focus",
        "/dashboard/insights",
        "/dashboard/planner",
        "/dashboard/reminders",
        "/dashboard/notifications",
      ])
        revalidatePath(path);
    } else if (b.action === "cancel") {
      await cancel(db, owner, b.id, b.revision, b.hash);
      result = { cancelled: true };
    } else if (b.action === "edit")
      result = await edit(db, owner, b.id, b.revision, b.hash, b.edits);
    else {
      await deleteConversation(db, getMongoClient(), owner, b.conversationId);
      result = { deleted: true };
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return captureFailure(e);
  }
}
