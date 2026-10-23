"use client";
import { useActionState } from "react";
import { googleSignIn, type OTPState } from "@/lib/auth/otp-actions";
export function GoogleButton({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(googleSignIn, {} as OTPState);
  return (
    <div className="google-signin">
      <form action={action}>
        <button className="google-button" disabled={!configured || pending}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
            <path
              fill="#4285F4"
              d="M43.6 20.5H24v8h11.2c-1.5 5.3-5.7 8-11.2 8A12.5 12.5 0 1 1 24 11c3 0 5.8 1.1 8 3.2l6-5.8A21 21 0 1 0 45 24c0-1.2-.1-2.3-.3-3.5z"
            />
            <path
              fill="#34A853"
              d="m7.7 36.6 6.6-5.1A12 12 0 0 0 24 36.5c3.4 0 6.4-1 8.6-3l6.3 4.8A21 21 0 0 1 7.7 36.6z"
            />
            <path
              fill="#FBBC05"
              d="M3 24a21 21 0 0 1 4.7-13.2l6.6 5.1a12.5 12.5 0 0 0 0 15.6l-6.6 5.1A21 21 0 0 1 3 24z"
            />
            <path
              fill="#EA4335"
              d="M24 3c5.8 0 10.9 2.1 14 5.4l-6 5.8A12.3 12.3 0 0 0 24 11c-4 0-7.6 1.9-9.7 5l-6.6-5.2A21 21 0 0 1 24 3z"
            />
          </svg>
          {pending ? "Opening Google…" : "Continue with Google"}
        </button>
      </form>
      {!configured && (
        <p className="field-help">
          Google sign-in requires configuration by the workspace owner.
        </p>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="auth-divider">
        <span>or use your email</span>
      </div>
    </div>
  );
}
