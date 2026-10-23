import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { FocusWorkspace } from "@/components/workspace/focus";
import Loading from "../loading";
async function Workspace() {
  await requireUser();
  return <FocusWorkspace />;
}
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}
