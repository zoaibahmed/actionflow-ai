import "server-only";
import { getSession } from "../auth/session";
import { getDatabase } from "../db/mongo";
import { CaptureError, normalizeError } from "./errors";
export async function captureAccess(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(process.env.BETTER_AUTH_URL!).origin)
    throw new CaptureError(
      "origin",
      "This request could not be verified. Refresh and try again.",
      403,
    );
  const session = await getSession();
  if (!session)
    throw new CaptureError(
      "session",
      "Your session expired. Sign in again; your source will remain here.",
      401,
    );
  return { owner: session.user.id, db: getDatabase() };
}
export function captureFailure(error: unknown) {
  const failure = normalizeError(error);
  return Response.json(
    { error: failure.message, code: failure.code },
    {
      status: failure.status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
