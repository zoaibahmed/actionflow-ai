import { Suspense } from "react";
import { OTPForm } from "@/components/auth/otp-form";
import { emailMode } from "@/lib/auth/mail";
async function Screen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  return (
    <OTPForm
      kind="registration"
      mode={emailMode()}
      email={typeof p.email === "string" ? p.email.slice(0, 254) : ""}
      notice={typeof p.notice === "string" ? p.notice : undefined}
    />
  );
}
export default function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p role="status">Preparing secure verification…</p>}>
      <Screen {...props} />
    </Suspense>
  );
}
