import { Suspense } from "react";

import { SessionDetailRoute } from "@/components/sessions/session-detail-route";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Session — Sessions — RMB Observer",
};

function SessionDetailFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export default function SessionDetailPage() {
  return (
    <Suspense fallback={<SessionDetailFallback />}>
      <SessionDetailRoute />
    </Suspense>
  );
}
