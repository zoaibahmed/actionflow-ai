import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { AgentWorkspace } from "@/components/agent/agent-workspace";
import Loading from "../loading";
async function Workspace() {
  await requireUser();
  return <AgentWorkspace />;
}
export default function AssistantPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}
