"use client";
import { useActionState } from "react";
import { signOut } from "@/lib/auth/actions";
import type { AuthState } from "@/lib/auth/types";
export function SignOutButton() {
  const [state, action, pending] = useActionState(signOut, {} as AuthState);
  return (
    <form action={action}>
      <button className="menu-signout" disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
