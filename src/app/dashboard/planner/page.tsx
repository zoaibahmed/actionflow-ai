import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/ai/client";
import { PlannerWorkspace } from "@/components/planner/planner-workspace";
import Loading from "../loading";
async function Workspace() {
  await requireUser();
  return <PlannerWorkspace configured={aiConfigured()} />;
}
export default function PlannerPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}
