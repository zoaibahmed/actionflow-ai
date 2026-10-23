import "server-only";
import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
const delivery = new AsyncLocalStorage<{ failed: boolean }>();
export async function withMailDelivery<T>(work: () => Promise<T>): Promise<T> {
  return delivery.run({ failed: false }, async () => {
    const result = await work();
    if (delivery.getStore()?.failed)
      throw new Error(
        "Email delivery failed. Please retry the code or reset request.",
      );
    return result;
  });
}
export function emailMode(): "smtp" | "local" | "unavailable" {
  if (
    process.env.SMTP_HOST &&
    process.env.MAIL_FROM &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  )
    return "smtp";
  if (process.env.MAIL_MODE === "file" && process.env.NODE_ENV !== "production")
    return "local";
  return "unavailable";
}
export function smtpOptions() {
  const port = Number(process.env.SMTP_PORT || 587);
  if (![465, 587].includes(port))
    throw new Error(
      "SMTP_PORT must be 465 or 587 for encrypted email delivery.",
    );
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    tls: { minVersion: "TLSv1.2" as const },
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  };
}
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  messageId?: string,
) {
  const mode = emailMode();
  if (mode === "local") {
    const directory = join(process.cwd(), ".local-mail");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(directory, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify({ to, subject, text, html }, null, 2),
      { mode: 0o600 },
    );
    return { mode, accepted: true };
  }
  if (mode !== "smtp") throw new Error("Email delivery is not configured.");
  try {
    const result = await nodemailer.createTransport(smtpOptions()).sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      text,
      html,
      messageId,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error("Message rejected");
    return { mode, accepted: true };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    throw Object.assign(
      new Error(
        "The email provider did not confirm acceptance. Please try again later.",
      ),
      {
        code: [
          "ETIMEDOUT",
          "ESOCKET",
          "ECONNRESET",
          "ECONNECTION",
          "EAUTH",
          "EENVELOPE",
          "EMESSAGE",
        ].includes(code ?? "")
          ? code
          : undefined,
      },
    );
  }
}
export async function sendAuthMail(
  to: string,
  subject: string,
  text: string,
  html: string,
) {
  try {
    return await sendMail(to, subject, text, html);
  } catch {
    const state = delivery.getStore();
    if (state) state.failed = true;
    throw new Error("ActionFlow email delivery failed.");
  }
}
