"use client";
import { useActionState } from "react";
import { linkGoogle, type OTPState } from "@/lib/auth/otp-actions";
export function GoogleLink({
  configured,
  linked,
}: {
  configured: boolean;
  linked: boolean;
}) {
  const [state, action, pending] = useActionState(linkGoogle, {} as OTPState);
  return (
    <section className="auth-account-panel">
      <div>
        <span className="auth-form-kicker">Your account, protected</span>
        <h2>Sign-in methods</h2>
        <p>
          Password sign-in always requires an email code. Link your own Google
          account with the same verified email to use Google sign-in.
        </p>
      </div>
      <form action={action}>
        <button
          className="button secondary"
          disabled={!configured || linked || pending}
        >
          {linked
            ? "Google account linked"
            : pending
              ? "Opening Google…"
              : "Link Google account"}
        </button>
      </form>
      {!configured && (
        <p className="field-help">Google OAuth configuration is required.</p>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}
