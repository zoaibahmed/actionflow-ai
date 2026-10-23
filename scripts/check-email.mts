import nextEnv from "@next/env";
import nodemailer from "nodemailer";
import { smtpOptions, emailMode, sendMail } from "../src/lib/auth/mail";
import { emailTemplate } from "../src/lib/auth/email-templates";
nextEnv.loadEnvConfig(process.cwd());
try {
  if (emailMode() !== "smtp") throw new Error("SMTP setup required");
  await nodemailer.createTransport(smtpOptions()).verify();
  let providerAccepted = false;
  if (process.argv.includes("--send-to-self")) {
    const text =
      "ActionFlow AI email connection check. Your SMTP provider accepted this test if it arrived in your inbox. This is not a sign-in code and requires no action.";
    await sendMail(
      process.env.SMTP_USER!,
      "ActionFlow AI — email connection check",
      text,
      emailTemplate(
        "Your email connection check.",
        "This message tests your ActionFlow SMTP configuration. It is not a sign-in code and requires no action.",
        "Connection check",
      ),
    );
    providerAccepted = true;
  }
  console.log(
    JSON.stringify({
      smtpConnectionVerified: true,
      providerAccepted,
      inboxReceiptVerified: false,
    }),
  );
} catch {
  console.error(
    "SMTP verification or provider acceptance failed. Check credentials, TLS, network access and provider settings privately.",
  );
  process.exitCode = 1;
}
