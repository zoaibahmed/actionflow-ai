"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { GoogleButton } from "./google-button";
import { authenticate } from "@/lib/auth/actions";
import type { AuthMode, AuthState } from "@/lib/auth/types";
import { Icon } from "@/components/ui/icon";
import { m, AnimatePresence } from "motion/react";
const content = {
  login: {
    title: "Welcome back.",
    description: "A little clarity is waiting for you.",
    button: "Sign in",
  },
  signup: {
    title: "Make room for your day.",
    description: "Create your personal ActionFlow workspace.",
    button: "Create account",
  },
  "forgot-password": {
    title: "Let’s get you back in.",
    description: "We’ll help you choose a new password.",
    button: "Request reset link",
  },
  "reset-password": {
    title: "A fresh start.",
    description: "Choose a strong password for your workspace.",
    button: "Update password",
  },
};
export function AuthForm({
  mode,
  configured,
  mailMode,
  notice,
  token = "",
  requiresVerification,
  googleConfigured,
}: {
  mode: AuthMode;
  configured: boolean;
  mailMode: string;
  notice?: string;
  token?: string;
  requiresVerification: boolean;
  googleConfigured: boolean;
}) {
  const [state, action, pending] = useActionState(
    authenticate.bind(null, mode),
    {} as AuthState,
  );
  const [visible, setVisible] = useState(false);
  const copy = content[mode];
  const hasPassword = mode !== "forgot-password";
  const unavailable =
    !configured ||
    (mode === "forgot-password" && mailMode === "unavailable") ||
    (mode === "reset-password" && !token) ||
    (mode === "signup" && requiresVerification && mailMode === "unavailable");
  function fieldError(name: string) {
    return state.fields?.[name]?.[0];
  }
  return (
    <m.div
      className="auth-card"
      initial={{ y: 12 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.55 }}
    >
      <span className="feature-icon">
        <Icon name={mode === "forgot-password" ? "arrow" : "tasks"} />
      </span>
      <span className="auth-form-kicker">
        {mode === "signup"
          ? "A fresh start, thoughtfully made."
          : mode === "login"
            ? "Your personal workspace"
            : "A little help getting back in"}
      </span>
      <h1>{copy.title}</h1>
      <p className="auth-description">{copy.description}</p>
      {!configured && (
        <p className="form-notice">
          The workspace connection needs to be configured before you can sign
          in.
        </p>
      )}
      {mailMode === "local" &&
        (mode === "signup" || mode === "forgot-password") && (
          <p className="form-notice">
            Development mailbox: codes and links are written locally and are not
            delivered to real inboxes.
          </p>
        )}
      {unavailable && configured && (
        <p className="form-notice">
          {mode === "reset-password"
            ? "This reset link is missing or invalid. Request a new one below."
            : "Email delivery is not configured yet."}
        </p>
      )}
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {(mode === "login" || mode === "signup") && (
        <GoogleButton configured={googleConfigured} />
      )}
      <form action={action} aria-busy={pending}>
        <fieldset disabled={pending || unavailable}>
          {mode === "signup" && (
            <div className="form-field">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                name="name"
                autoComplete="name"
                required
                maxLength={80}
                aria-invalid={!!fieldError("name")}
                aria-describedby={fieldError("name") ? "name-error" : undefined}
              />
              {fieldError("name") && (
                <span id="name-error" className="field-error">
                  {fieldError("name")}
                </span>
              )}
            </div>
          )}
          {mode !== "reset-password" && (
            <div className="form-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
                aria-invalid={!!fieldError("email")}
                aria-describedby={
                  fieldError("email") ? "email-error" : undefined
                }
              />
              {fieldError("email") && (
                <span id="email-error" className="field-error">
                  {fieldError("email")}
                </span>
              )}
            </div>
          )}
          {hasPassword && (
            <div className="form-field">
              <label htmlFor="password">
                {mode === "reset-password" ? "New password" : "Password"}
              </label>
              <div className="password-field">
                <input
                  id="password"
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  aria-invalid={!!fieldError("password")}
                  aria-describedby="password-help"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? "Hide password" : "Show password"}
                  aria-pressed={visible}
                >
                  {visible ? "Hide" : "Show"}
                </button>
              </div>
              <span
                id="password-help"
                className={
                  fieldError("password") ? "field-error" : "field-help"
                }
              >
                {fieldError("password") ||
                  (mode !== "login"
                    ? "At least 12 characters. A passphrase works well."
                    : "")}
              </span>
            </div>
          )}
          {(mode === "signup" || mode === "reset-password") && (
            <div className="form-field">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                name="confirm"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                required
                maxLength={128}
                aria-invalid={!!fieldError("confirm")}
                aria-describedby={
                  fieldError("confirm") ? "confirm-error" : undefined
                }
              />
              {fieldError("confirm") && (
                <span id="confirm-error" className="field-error">
                  {fieldError("confirm")}
                </span>
              )}
            </div>
          )}
          {mode === "reset-password" && (
            <input type="hidden" name="token" value={token} />
          )}
          {mode === "login" && (
            <Link className="forgot-link" href="/forgot-password">
              Forgot password?
            </Link>
          )}
          <AnimatePresence initial={false}>
            {state.error && (
              <m.p
                key="error"
                className="form-error"
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {state.error}
                {state.verificationEmail && (
                  <Link
                    href={
                      "/verify-email?email=" +
                      encodeURIComponent(state.verificationEmail)
                    }
                  >
                    {" "}
                    Verify email / request a code
                  </Link>
                )}
              </m.p>
            )}
            {state.message && (
              <m.p
                key="success"
                className="form-success"
                role="status"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {state.message}
              </m.p>
            )}
          </AnimatePresence>
          <button
            className="button primary"
            disabled={pending || unavailable}
            type="submit"
          >
            {pending && <Icon name="loading" className="spinner" width="16" />}
            {pending ? "Please wait…" : copy.button}
            {!pending && <Icon name="arrow" width="16" />}
          </button>
        </fieldset>
      </form>
      <div className="auth-switch">
        {mode === "login" ? (
          <>
            New here? <Link href="/signup">Create an account</Link>
          </>
        ) : mode === "signup" ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            <Link href="/login">Back to sign in</Link>
            {mode === "reset-password" && (
              <Link href="/forgot-password">Request a new reset link</Link>
            )}
          </>
        )}
      </div>
    </m.div>
  );
}
