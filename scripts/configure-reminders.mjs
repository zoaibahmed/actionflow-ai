// Generate server-only reminder credentials without printing private values.
import nextEnv from "@next/env";
import { randomBytes } from "node:crypto";
import { appendFile } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
const file = new URL("../.env.local", import.meta.url);
if (!process.env.REMINDER_WORKER_SECRET) {
  await appendFile(
    file,
    "\nREMINDER_WORKER_SECRET=" + randomBytes(48).toString("base64url") + "\n",
    { mode: 0o600 },
  );
  console.log(
    "Generated a private reminder-worker secret in .env.local. Restart the app to load it.",
  );
} else console.log("Existing reminder-worker secret preserved.");
const subject = process.argv
  .find((v) => v.startsWith("--push-subject="))
  ?.slice("--push-subject=".length);
if (subject) {
  let valid = false;
  try {
    const url = new URL(subject);
    valid =
      (url.protocol === "mailto:" &&
        /^[^@]+@[^@]+\.[^@]+$/.test(url.pathname)) ||
      (url.protocol === "https:" &&
        url.hostname.includes(".") &&
        !url.username &&
        !url.password);
  } catch {}
  if (!valid)
    throw new Error(
      "Provide a real mailto contact or HTTPS contact URL for VAPID.",
    );
  const existing =
    !!process.env.VAPID_PUBLIC_KEY || !!process.env.VAPID_PRIVATE_KEY;
  if (existing) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
      throw new Error(
        "An incomplete VAPID pair exists. Restore its matching key; existing keys were not overwritten.",
      );
    console.log(
      "Existing VAPID keys preserved. Update the subject in server configuration if needed.",
    );
  } else {
    const { default: webpush } = await import("web-push");
    const keys = webpush.generateVAPIDKeys();
    await appendFile(
      file,
      `\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=${subject}\n`,
      { mode: 0o600 },
    );
    console.log(
      "Generated VAPID keys privately in .env.local. Restart the app. Enable browser reminders explicitly from notification preferences.",
    );
  }
}
