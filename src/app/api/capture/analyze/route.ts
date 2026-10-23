import { randomUUID } from "node:crypto";
import { captureAccess, captureFailure } from "@/lib/capture/http";
import { captureConfigured, extractActions } from "@/lib/capture/openai";
import { boundedFormData, validateSource } from "@/lib/capture/input";
import { timezoneSchema } from "@/lib/capture/schema";
import {
  captureRateLimit,
  captureDailyQuota,
  createCapture,
} from "@/lib/capture/repository";
import { CaptureError } from "@/lib/capture/errors";
export const maxDuration = 90;
export async function POST(request: Request) {
  try {
    const { owner, db } = await captureAccess(request);
    await captureRateLimit(db, owner);
    if (!captureConfigured())
      throw new CaptureError(
        "setup",
        "Smart Capture needs an OpenAI API key in the server configuration.",
        503,
      );
    const form = await boundedFormData(request);
    const timezone = timezoneSchema.safeParse(form.get("timezone"));
    if (!timezone.success)
      throw new CaptureError("timezone", "Choose a valid IANA time zone.");
    const source = await validateSource(form);
    const remaining = await captureDailyQuota(db, owner);
    const extraction = await extractActions(
      source,
      timezone.data,
      new Date(),
      request.signal,
    );
    const suggestions = extraction.actions.map((action) => ({
      ...action,
      id: randomUUID(),
    }));
    const capture = await createCapture(
      db,
      owner,
      suggestions.map((s) => s.id),
    );
    return Response.json(
      {
        captureId: capture._id,
        suggestions,
        timezone: timezone.data,
        remaining,
        expiresAt: capture.expiresAt.toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return captureFailure(error);
  }
}
