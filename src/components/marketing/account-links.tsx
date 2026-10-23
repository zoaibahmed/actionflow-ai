import { Suspense } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { Icon } from "@/components/ui/icon";
async function AccountLinks() {
  let signedIn = false;
  let unavailable = false;
  try {
    signedIn = Boolean(await getSession());
  } catch {
    unavailable = true;
  }
  if (signedIn || unavailable)
    return (
      <Link href="/dashboard" className="button primary">
        Open workspace
        <Icon name="arrow" width="16" />
      </Link>
    );
  return (
    <>
      <Link href="/login" className="login-link">
        Log in
      </Link>
      <Link href="/signup" className="button primary">
        Get started
        <Icon name="arrow" width="16" />
      </Link>
    </>
  );
}
export function PublicAccountLinks() {
  return (
    <Suspense
      fallback={
        <span className="account-loading" role="status">
          Opening your space…
        </span>
      }
    >
      <AccountLinks />
    </Suspense>
  );
}
