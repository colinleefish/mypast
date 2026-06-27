import type { SessionDetailTab } from "@/components/sessions/session-detail-types";

/** Session detail URL (static-export friendly: one HTML shell, key in query). */
export function sessionDetailHref(
  sessionKey: string,
  tab?: SessionDetailTab,
): string {
  const params = new URLSearchParams();
  params.set("key", sessionKey);
  if (tab && tab !== "turns") params.set("tab", tab);
  return `/sessions/detail?${params.toString()}`;
}

export function sessionKeyFromSearchParams(
  searchParams: URLSearchParams,
): string | null {
  const key = searchParams.get("key")?.trim();
  return key || null;
}
