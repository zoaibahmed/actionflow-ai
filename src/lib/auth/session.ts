import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, authConfigured } from "./server";
// React cache deduplicates this within a single render request, never across users.
export const getSession = cache(async function getSession() {
  if (!authConfigured()) return null;
  const result = await getAuth().api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  return result?.user.emailVerified && result.session.authPolicyVersion === 2
    ? result
    : null;
});
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login?notice=session");
  return session.user;
}
