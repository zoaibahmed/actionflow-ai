"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuth } from "./server";
import { withMailDelivery, emailMode } from "./mail";
import { googleConfigured } from "./policy";
export type OTPState = {
  error?: string;
  message?: string;
  sent?: boolean;
  retryAfterSeconds?: number;
};
export async function otpAction(
  kind: "registration" | "login",
  _state: OTPState,
  form: FormData,
): Promise<OTPState> {
  const email = String(form.get("email") || "")
      .trim()
      .toLowerCase(),
    resend = form.get("operation") === "resend";
  const code = String(form.get("code") || "");
  if (kind === "registration" && !z.email().max(254).safeParse(email).success)
    return { error: "Enter a valid email address." };
  if (!resend && !/^\d{6}$/.test(code))
    return { error: "Enter all six digits from your email." };
  const h = await headers(),
    auth = getAuth();
  try {
    if (resend) {
      await withMailDelivery(async () => {
        if (kind === "registration")
          await auth.api.sendVerificationOTP({
            body: { email, type: "email-verification" },
            headers: h,
          });
        else await auth.api.sendTwoFactorOTP({ body: {}, headers: h });
      });
      return {
        sent: true,
        message:
          emailMode() === "local"
            ? "Development mode: inspect the private local mailbox. No inbox delivery occurred."
            : "For an eligible request, a new code was submitted to the email provider. Inbox arrival is not guaranteed. Use the newest code.",
      };
    }
    if (kind === "registration")
      await auth.api.verifyEmailOTP({ body: { email, otp: code }, headers: h });
    else
      await auth.api.verifyTwoFactorOTP({
        body: { code, trustDevice: false },
        headers: h,
      });
  } catch (error) {
    const e = error as {
      statusCode?: number;
      body?: { code?: string; message?: string };
    };
    if (e.statusCode === 429 || e.body?.code === "AUTH_RATE_LIMIT")
      return {
        retryAfterSeconds: resend ? 60 : undefined,
        error:
          "Too many attempts. Wait before requesting or checking another code.",
      };
    if (e.body?.code === "INVALID_TWO_FACTOR_COOKIE")
      return {
        error:
          "This sign-in challenge expired. Return to sign in and enter your password again.",
      };
    if (!resend && e.body?.code === "EMAIL_ALREADY_VERIFIED")
      return {
        error:
          "This email is already verified. Return to sign in and enter your password.",
      };
    if (!resend && e.body?.code === "OTP_EXPIRED")
      return {
        error:
          "This code has expired. Codes last five minutes. Request a new code and use the newest email.",
      };
    if (!resend && e.body?.code === "TOO_MANY_ATTEMPTS")
      return {
        error:
          "This code was locked after too many incorrect attempts. Request a new code after the resend cooldown.",
      };
    return {
      error: resend
        ? "Email delivery was not confirmed, or the resend limit was reached. Wait a minute and try again."
        : "This code is incorrect, expired or already used. Check the newest email or request another code.",
    };
  }
  revalidatePath("/", "layout");
  redirect(kind === "registration" ? "/login?notice=verified" : "/dashboard");
}
export async function googleSignIn(_state: OTPState): Promise<OTPState> {
  void _state;
  if (!googleConfigured())
    return {
      error: "Google sign-in needs server-side Google OAuth configuration.",
    };
  let url: string | undefined;
  try {
    const origin = new URL(process.env.BETTER_AUTH_URL!).origin;
    const result = await getAuth().api.signInSocial({
      body: {
        provider: "google",
        callbackURL: origin + "/dashboard",
        errorCallbackURL: origin + "/login?notice=oauth",
      },
      headers: await headers(),
    });
    url = result.url;
    if (!url || new URL(url).origin !== "https://accounts.google.com")
      return { error: "Google sign-in could not be started." };
  } catch {
    return {
      error:
        "Google sign-in could not be started. Try again or use your password.",
    };
  }
  redirect(url);
}

export async function linkGoogle(_state: OTPState): Promise<OTPState> {
  void _state;
  if (!googleConfigured())
    return { error: "Google OAuth needs server configuration." };
  let url: string | undefined;
  try {
    const { requireUser } = await import("./session");
    await requireUser();
    const origin = new URL(process.env.BETTER_AUTH_URL!).origin;
    const result = await getAuth().api.linkSocialAccount({
      body: {
        provider: "google",
        callbackURL: origin + "/dashboard/settings",
        errorCallbackURL: origin + "/dashboard/settings?notice=google-error",
      },
      headers: await headers(),
    });
    url = result.url;
    if (!url || new URL(url).origin !== "https://accounts.google.com")
      return { error: "Google linking could not be started." };
  } catch {
    return {
      error:
        "Sign in again before linking Google. Use the Google account with the same verified email.",
    };
  }
  redirect(url);
}
