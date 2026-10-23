"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuth, authConfigured, verificationRequired } from "./server";
import { withMailDelivery, emailMode } from "./mail";
import { allowAuthAction } from "./rate-limit";
import {
  emailSchema,
  passwordSchema,
  validationFields,
} from "@/lib/validation";
import type { AuthMode, AuthState } from "./types";
export async function authenticate(
  mode: AuthMode,
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const confirm = z.string();
  const shape =
    mode === "forgot-password"
      ? z.object({ email: emailSchema })
      : mode === "login"
        ? z.object({
            email: emailSchema,
            password: z.string().min(1, "Enter your password.").max(128),
          })
        : mode === "signup"
          ? z
              .object({
                email: emailSchema,
                password: passwordSchema,
                confirm,
                name: z.string().trim().min(1, "Enter your name.").max(80),
              })
              .refine((v) => v.password === v.confirm, {
                path: ["confirm"],
                message: "Passwords must match.",
              })
          : z
              .object({
                password: passwordSchema,
                confirm,
                token: z.string().min(1, "Request a new reset link.").max(512),
              })
              .refine((v) => v.password === v.confirm, {
                path: ["confirm"],
                message: "Passwords must match.",
              });
  const parsed = shape.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error: "Please check the highlighted fields.",
      fields: validationFields(parsed.error),
    };
  if (!authConfigured())
    return { error: "Your workspace connection is not configured yet." };
  const values = parsed.data as {
    email?: string;
    password?: string;
    name?: string;
    token?: string;
  };
  let destination = "";
  try {
    if (!(await allowAuthAction(mode, values.email ?? values.token ?? "")))
      return {
        error: "Too many attempts. Please wait a minute before trying again.",
      };
    const auth = getAuth();
    const requestHeaders = await headers();
    const origin = new URL(process.env.BETTER_AUTH_URL!).origin;
    if (mode === "login") {
      const { response, headers: responseHeaders } = await withMailDelivery(
        () =>
          auth.api.signInEmail({
            returnHeaders: true,
            body: { email: values.email!, password: values.password! },
            headers: requestHeaders,
          }),
      );
      if ("twoFactorRedirect" in response) {
        const nextHeaders = new Headers(requestHeaders);
        const jar = new Map(
          (requestHeaders.get("cookie") || "")
            .split(";")
            .map(
              (c) => c.trim().split(/=(.*)/).slice(0, 2) as [string, string],
            ),
        );
        for (const value of responseHeaders.getSetCookie()) {
          const pair = value.split(";")[0],
            i = pair.indexOf("=");
          jar.set(pair.slice(0, i), pair.slice(i + 1));
        }
        nextHeaders.set(
          "cookie",
          Array.from(jar, ([k, v]) => `${k}=${v}`).join("; "),
        );
        try {
          await withMailDelivery(() =>
            auth.api.sendTwoFactorOTP({ body: {}, headers: nextHeaders }),
          );
          destination = "/two-factor?notice=accepted";
        } catch {
          destination = "/two-factor?notice=delivery";
        }
      } else throw new Error("A second-factor challenge was not issued.");
    } else if (mode === "signup") {
      if (verificationRequired() && emailMode() === "unavailable")
        return {
          error:
            "Email confirmation is required, but email delivery is not configured yet.",
        };
      await withMailDelivery(() =>
        auth.api.signUpEmail({
          body: {
            email: values.email!,
            password: values.password!,
            name: values.name!,
            callbackURL: `${origin}/auth/callback`,
          },
          headers: requestHeaders,
        }),
      );
      destination =
        "/verify-email?notice=accepted&email=" +
        encodeURIComponent(values.email!);
    } else if (mode === "forgot-password") {
      if (emailMode() === "unavailable")
        return {
          error:
            "Password-reset emails are not configured yet. Please contact the workspace owner.",
        };
      await withMailDelivery(() =>
        auth.api.requestPasswordReset({
          body: {
            email: values.email!,
            redirectTo: `${origin}/reset-password`,
          },
          headers: requestHeaders,
        }),
      );
      return {
        message:
          "If this address belongs to a verified account, we’ll email a reset link. If you haven’t verified your email, finish signup first.",
      };
    } else if (mode === "reset-password") {
      await auth.api.resetPassword({
        body: { newPassword: values.password!, token: values.token! },
        headers: requestHeaders,
      });
      destination = "/login?notice=password-updated";
    } else return { error: "Invalid request." };
  } catch (error) {
    if (mode === "forgot-password")
      return {
        message:
          "If this address belongs to a verified account, we’ll email a reset link. If you haven’t verified your email, finish signup first.",
      };
    const code = (error as { body?: { code?: string } })?.body?.code;
    if (
      (error as { statusCode?: number }).statusCode === 429 ||
      code === "AUTH_RATE_LIMIT"
    )
      return { error: "Too many attempts. Wait a minute before trying again." };
    if (mode === "signup")
      return {
        error:
          "Registration or email delivery could not be confirmed. You can request a verification code for this address and try again.",
        verificationEmail: values.email,
      };
    if (mode === "login" && code === "EMAIL_NOT_VERIFIED")
      return {
        error: "Verify your email address before signing in.",
        verificationEmail: values.email,
      };
    return {
      error:
        mode === "login"
          ? "We couldn’t sign you in. Check your email and password, and confirm your email if required."
          : mode === "reset-password"
            ? "This reset link may have expired or already been used. Request a new link and try again."
            : "We couldn’t complete that request. Please try again shortly.",
    };
  }
  revalidatePath("/", "layout");
  redirect(destination);
}
export async function signOut(_previous: AuthState): Promise<AuthState> {
  void _previous;
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch {
    return { error: "We couldn’t sign you out. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
