import { timingSafeEqual } from "node:crypto";
import { getDatabase, getMongoClient } from "@/lib/db/mongo";
import { processReminders } from "@/lib/reminders/processor";
import { sendReminderEmail, sendReminderPush } from "@/lib/reminders/delivery";
export const maxDuration = 90;
export async function POST(request: Request) {
  const secret = process.env.REMINDER_WORKER_SECRET;
  if (!secret || secret.length < 32)
    return Response.json(
      { error: "Reminder worker is not configured." },
      { status: 503 },
    );
  const token = request.headers.get("authorization") ?? "",
    expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.from(token),
    expectedBytes = Buffer.from(expected);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(
      await processReminders(getDatabase(), getMongoClient(), {
        email: sendReminderEmail,
        push: sendReminderPush,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "The reminder processor could not finish. Leased work will recover on a later run.",
      },
      { status: 503 },
    );
  }
}
