import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { captureConfigured } from "@/lib/capture/openai";
import { dailyLimit } from "@/lib/capture/repository";
import { CaptureWorkspace } from "@/components/capture/capture-workspace";
import Loading from "../loading";
async function Workspace() {
  await requireUser();
  return (
    <CaptureWorkspace
      configured={captureConfigured()}
      dailyLimit={dailyLimit()}
    />
  );
}
export default function CapturePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}
