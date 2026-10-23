import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { NotesWorkspace } from "@/components/workspace/notes";
import Loading from "../loading";
async function Workspace() {
  await requireUser();
  return <NotesWorkspace />;
}
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}
