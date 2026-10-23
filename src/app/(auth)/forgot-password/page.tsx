import { AccountLoading } from "@/components/auth/account-loading";
import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<AccountLoading />}>
      <AuthScreen mode="forgot-password" searchParams={searchParams} />
    </Suspense>
  );
}
