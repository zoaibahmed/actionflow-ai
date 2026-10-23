import { revalidatePath } from "next/cache";
import { captureAccess, captureFailure } from "@/lib/capture/http";
import { approvalSchema } from "@/lib/capture/schema";
import { saveApproved, captureRateLimit } from "@/lib/capture/repository";
import { CaptureError } from "@/lib/capture/errors";
import { getMongoClient } from "@/lib/db/mongo";
export async function POST(request: Request) {
  try {
    const { owner, db } = await captureAccess(request);
    await captureRateLimit(db, `save:${owner}`);
    const reader = request.body?.getReader();
    if (!reader) throw new CaptureError("input", "Choose suggestions to save.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const timer = setTimeout(() => void reader.cancel().catch(() => {}), 15000);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 100000) {
          await reader.cancel();
          throw new CaptureError("size", "This task list is too large.", 413);
        }
        chunks.push(value);
      }
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new CaptureError("input", "This task list could not be read.");
    }
    const parsed = approvalSchema.safeParse(raw);
    if (!parsed.success)
      throw new CaptureError(
        "approval",
        "Check the selected tasks. Confirm every deadline or explicitly choose no deadline.",
      );
    const result = await saveApproved(
      db,
      getMongoClient(),
      owner,
      parsed.data.captureId,
      parsed.data.items,
    );
    if (result.saved.length) {
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/tasks");
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return captureFailure(error);
  }
}
