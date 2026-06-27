"use client";

import { useSearchParams } from "next/navigation";

import { SessionDetailView } from "@/components/sessions/session-detail-view";
import { sessionKeyFromSearchParams } from "@/lib/session-routes";

export function SessionDetailRoute() {
  const searchParams = useSearchParams();
  const sessionKey = sessionKeyFromSearchParams(searchParams);

  if (!sessionKey) {
    return (
      <p className="text-muted-foreground text-sm">
        No session selected. Open one from the{" "}
        <a href="/sessions" className="text-foreground underline">
          sessions list
        </a>
        .
      </p>
    );
  }

  return <SessionDetailView sessionKey={sessionKey} />;
}
