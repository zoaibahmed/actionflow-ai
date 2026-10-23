import "server-only";
import webpush from "web-push";
import { createHash } from "node:crypto";
import type { Task } from "@/types/task";
import type { SubscriptionDoc } from "./schema";
import { sendMail, emailMode } from "../auth/mail";
export function deliveryConfiguration() {
  return {
    email: emailMode() === "smtp",
    push: !!(
      process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
    ),
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  };
}
export function allowedPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      (!u.port || u.port === "443") &&
      !u.username &&
      !u.password &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "fcm.google.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.services.mozilla.com") ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export async function sendReminderEmail(
  to: string,
  task: Task,
  id: string,
  timezone: string,
) {
  if (!deliveryConfiguration().email)
    throw Object.assign(
      new Error(
        "Email reminders are unavailable until email delivery is configured.",
      ),
      { permanent: true },
    );
  const origin = new URL(process.env.BETTER_AUTH_URL!).origin,
    link = `${origin}/dashboard/tasks/${encodeURIComponent(task.id)}`;
  const due = task.due_at
    ? new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date(task.due_at))
    : "No deadline set";
  const text = `ActionFlow reminder\n\n${task.title}\nDue: ${due} (${timezone})\n${task.description?.slice(0, 500) ?? ""}\n\nOpen your task: ${link}\nManage reminders in your ActionFlow workspace.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f3;font-family:Arial,sans-serif;color:#252b31"><main style="max-width:560px;margin:30px auto;padding:28px;background:#fff;border:1px solid #e2e6de;border-radius:18px"><p style="color:#475ed7;font-weight:bold">ActionFlow AI</p><h1 style="font-size:24px">A little nudge for your day.</h1><h2 style="font-size:19px">${escapeHtml(task.title)}</h2><p>Due: ${escapeHtml(due)} (${escapeHtml(timezone)})</p><p style="line-height:1.7">${escapeHtml(task.description?.slice(0, 500) ?? "")}</p><a href="${escapeHtml(link)}" style="display:inline-block;background:#475ed7;color:#fff;text-decoration:none;border-radius:8px;padding:13px 20px">Open your task</a><p style="font-size:12px;color:#626b62;margin-top:24px">Manage reminders in your ActionFlow workspace.</p></main></body></html>`;
  await sendMail(
    to,
    `ActionFlow reminder: ${task.title}`,
    text,
    html,
    `<${createHash("sha256").update(id).digest("hex")}@actionflow-reminders.local>`,
  );
}
export async function sendReminderPush(
  subscription: SubscriptionDoc,
  task: Task,
  id: string,
) {
  if (!deliveryConfiguration().push)
    throw Object.assign(new Error("Browser push delivery is not configured."), {
      permanent: true,
    });
  if (!allowedPushEndpoint(subscription.endpoint))
    throw Object.assign(new Error("Unsupported push service."), {
      permanent: true,
    });
  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: subscription.keys },
    JSON.stringify({
      title: "ActionFlow reminder",
      body: task.title,
      tag: id,
      url: `/dashboard/tasks/${encodeURIComponent(task.id)}`,
    }),
    {
      TTL: 3600,
      timeout: 12000,
      urgency: "normal",
      topic: createHash("sha256").update(id).digest("base64url").slice(0, 32),
      vapidDetails: {
        subject: process.env.VAPID_SUBJECT!,
        publicKey: process.env.VAPID_PUBLIC_KEY!,
        privateKey: process.env.VAPID_PRIVATE_KEY!,
      },
    },
  );
}
