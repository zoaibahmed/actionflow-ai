"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function SessionGuard({
  preserveDrafts = false,
}: {
  preserveDrafts?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const response = await fetch("/api/auth/get-session", {
          cache: "no-store",
        });
        if (response.ok) {
          const session = await response.json();
          if (active && !session) {
            if (
              preserveDrafts ||
              document.querySelector("dialog.task-dialog[open]")
            ) {
              window.dispatchEvent(new Event("actionflow:session-expired"));
              return;
            }
            router.replace("/login?notice=session");
            router.refresh();
          }
          if (active && session)
            window.dispatchEvent(new Event("actionflow:session-restored"));
        }
      } catch {
        /* Network loss never grants access; protected operations still verify the session. */
      }
    }
    void check();
    const interval = setInterval(check, 300000);
    const onFocus = () => {
      void check();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, preserveDrafts]);
  return null;
}
