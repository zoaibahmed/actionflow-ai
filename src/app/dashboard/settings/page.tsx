import { Suspense } from "react";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { getAuth } from "@/lib/auth/server";
import { googleConfigured } from "@/lib/auth/policy";
import { GoogleLink } from "@/components/auth/google-link";
import { ReminderStream } from "@/components/reminders/reminder-stream";
import Loading from "../loading";
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
async function Workspace({ searchParams }: Props) {
  const params = await searchParams;
  await requireUser();
  const accounts = await getAuth().api.listUserAccounts({
    headers: await headers(),
  });
  return (
    <>
      {params.notice === "google-error" && (
        <p className="form-error" role="alert">
          Google linking was cancelled or failed. Use your own Google account
          with the same verified email, then try again.
        </p>
      )}
      <GoogleLink
        configured={googleConfigured()}
        linked={accounts.some((a) => a.providerId === "google")}
      />
      <ReminderStream initialView="settings" />
    </>
  );
}
export default function Page(props: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace {...props} />
    </Suspense>
  );
}
