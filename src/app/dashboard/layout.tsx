import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";
import { WorkspaceLoading } from "./loading";
async function ProtectedShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <ProtectedShell>{children}</ProtectedShell>
    </Suspense>
  );
}
