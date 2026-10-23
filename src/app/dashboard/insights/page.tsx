import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { InsightsWorkspace } from "@/components/workspace/insights";
import Loading from "../loading";
async function Workspace() {
  await requireUser();
  return <InsightsWorkspace />;
}
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}
