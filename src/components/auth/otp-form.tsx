"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { otpAction, type OTPState } from "@/lib/auth/otp-actions";
import { Icon } from "../ui/icon";
export function OTPForm({
  kind,
  email = "",
  mode,
  notice,
}: {
  kind: "registration" | "login";
  email?: string;
  mode: string;
  notice?: string;
}) {
  const [cooldown, setCooldown] = useState(notice === "accepted" ? 60 : 0),
    [code, setCode] = useState("");
  const [state, action, pending] = useActionState(
    async (previous: OTPState, form: FormData) => {
      const result = await otpAction(kind, previous, form);
      // Do not disable the submitter or clear its form fields during onClick:
      // the browser must first submit operation=resend to the server.
      if (result.sent) {
        setCode("");
        setCooldown(60);
      } else if (result.retryAfterSeconds) {
        setCooldown(result.retryAfterSeconds);
      }
      return result;
    },
    {} as OTPState,
  );
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  return (
    <div className="auth-card otp-card">
      <span className="feature-icon">
        <Icon name="inbox" />
      </span>
      <span className="auth-form-kicker">One more secure step</span>
      <h1>
        {kind === "registration" ? "Make it yours." : "A code. Then clarity."}
      </h1>
      <p className="auth-description">
        {kind === "registration"
          ? "Verify your email before opening your workspace."
          : "Enter the email code for your pending sign-in. If it expired, start again with your password."}
      </p>
      <div className="otp-security-note">
        <Icon name="check" width={17} />
        <span>
          No workspace session is granted until verification finishes.
        </span>
      </div>
      {mode === "local" && (
        <p className="form-notice">
          Development mailbox only. Codes are written locally; no email reaches
          an inbox.
        </p>
      )}
      {notice === "accepted" && mode === "smtp" && (
        <p className="form-notice" role="status">
          The {kind === "registration" ? "verification" : "sign-in"} code was
          submitted to your email provider. Check your inbox and spam folder.
        </p>
      )}
      {notice === "delivery" && (
        <p className="form-error" role="alert">
          Email delivery was not confirmed. Wait a minute, then request another
          code.
        </p>
      )}
      <form action={action} aria-busy={pending}>
        <fieldset disabled={pending || mode === "unavailable"}>
          {kind === "registration" && (
            <div className="form-field">
              <label htmlFor="otp-email">Email address</label>
              <input
                id="otp-email"
                name="email"
                type="email"
                defaultValue={email}
                required
                autoComplete="email"
                maxLength={254}
              />
            </div>
          )}
          <div className="form-field">
            <label htmlFor="otp-code">Six-digit verification code</label>
            <input
              ref={ref}
              id="otp-code"
              className="otp-code"
              name="code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              aria-describedby="otp-help"
            />
            <span id="otp-help" className="field-help">
              Paste the full code. It expires after five minutes and works once.
            </span>
          </div>
          {state.error && (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          )}
          {state.message && (
            <p className="form-success" role="status">
              {state.message}
            </p>
          )}
          <button
            className="button primary"
            type="submit"
            name="operation"
            value="verify"
            disabled={pending || code.length !== 6}
          >
            {pending ? (
              <Icon name="loading" className="spinner" width={16} />
            ) : (
              <Icon name="check" width={16} />
            )}
            Verify {kind === "login" ? "and sign in" : "email"}
          </button>
          <button
            className="otp-resend"
            type="submit"
            name="operation"
            value="resend"
            formNoValidate
            disabled={pending || cooldown > 0}
          >
            {cooldown
              ? `Request another code in ${cooldown}s`
              : "Send / resend code"}
          </button>
        </fieldset>
      </form>
      <div className="auth-switch">
        <Link href="/login">Back to sign in</Link>
      </div>
      {mode === "unavailable" && (
        <p className="form-error">Email delivery needs server configuration.</p>
      )}
    </div>
  );
}
