import { redirect } from "next/navigation";
import { AuthForm } from "./auth-form";
import { getSession } from "@/lib/auth/session";
import { authConfigured, verificationRequired } from "@/lib/auth/server";
import { googleConfigured } from "@/lib/auth/policy";
import { emailMode } from "@/lib/auth/mail";
import type { AuthMode } from "@/lib/auth/types";
const notices: Record<string, string> = {
  oauth:
    "Google sign-in was cancelled or could not be completed. Try again, or sign in with your password. Existing accounts must be explicitly linked while signed in.",
  session: "Please sign in to access your workspace.",
  verified: "Your email is confirmed. You can now sign in.",
  "password-updated":
    "Your password was updated. Sign in with your new password.",
  invalid: "That link is invalid or has expired. Please request a new link.",
};
export async function AuthScreen({
  mode,
  searchParams,
}: {
  mode: AuthMode;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (mode === "login" || mode === "signup") {
    const session = await getSession();
    if (session) redirect("/dashboard");
  }
  const key = typeof params.notice === "string" ? params.notice : "";
  const notice = params.error
    ? mode === "login" || mode === "signup"
      ? notices.oauth
      : notices.invalid
    : notices[key];
  return (
    <AuthForm
      mode={mode}
      googleConfigured={googleConfigured()}
      configured={authConfigured()}
      mailMode={emailMode()}
      requiresVerification={verificationRequired()}
      notice={notice}
      token={
        mode === "reset-password" &&
        typeof params.token === "string" &&
        params.token.length <= 512
          ? params.token
          : ""
      }
    />
  );
}
