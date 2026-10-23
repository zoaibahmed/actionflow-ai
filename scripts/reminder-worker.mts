import nextEnv from "@next/env";
import { setTimeout as pause } from "node:timers/promises";
import { getDatabase, getMongoClient } from "../src/lib/db/mongo";
import { processReminders } from "../src/lib/reminders/processor";
import {
  sendReminderEmail,
  sendReminderPush,
} from "../src/lib/reminders/delivery";
nextEnv.loadEnvConfig(process.cwd());
if (process.env.NODE_ENV === "production") {
  const { productionConfiguration } =
    await import("../src/lib/production-config");
  const result = productionConfiguration(process.env);
  if (result.errors.length)
    throw new Error(
      "Worker configuration invalid: " + result.errors.join("; "),
    );
}
const intervalMs = Math.min(
  60000,
  Math.max(30000, Number(process.env.REMINDER_INTERVAL_MS) || 60000),
);
const once = process.argv.includes("--once"),
  controller = new AbortController();
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
    controller.abort();
  });
try {
  do {
    try {
      const result = await processReminders(getDatabase(), getMongoClient(), {
        email: sendReminderEmail,
        push: sendReminderPush,
      });
      console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    } catch {
      console.error(
        "Reminder processor could not finish. Leased jobs will recover on a later run.",
      );
      if (once) process.exitCode = 1;
    }
    if (once || stopping) break;
    try {
      await pause(intervalMs, undefined, { signal: controller.signal });
    } catch {
      /* shutdown */
    }
  } while (!stopping);
} finally {
  await getMongoClient().close();
}
