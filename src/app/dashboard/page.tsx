import { Suspense } from "react";
import { Today } from "@/components/dashboard/today";
import Loading from "./loading";
export default function Dashboard() {
  return (
    <Suspense fallback={<Loading />}>
      <Today />
    </Suspense>
  );
}
