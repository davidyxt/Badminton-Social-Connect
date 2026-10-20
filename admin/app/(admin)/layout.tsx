"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/shared/Button";
import { syncNow, useSyncStatus } from "@/lib/api/sync";
import { useSession, type SessionStatus } from "@/lib/auth/session";
import { API_POLL_INTERVAL_MS, IS_API } from "@/lib/config";
import { selectOpenDisputeCount, selectPendingReportCount, useDb } from "@/lib/mock-api";

const REDIRECTS: Record<Exclude<SessionStatus, "authenticated">, string> = {
  signed_out: "/sign-in",
  expired: "/session-expired",
  restricted: "/access-restricted",
};

/**
 * Auth guard and data loading. A UI stand-in only: the real boundary is the
 * admin-api Edge Function + RLS. In API mode it also loads the store after
 * sign-in and re-reads it on an interval (in place of Realtime channels).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const db = useDb();

  const sync = useSyncStatus();

  useEffect(() => {
    if (session.status !== "authenticated") router.replace(REDIRECTS[session.status]);
  }, [session.status, router]);

  useEffect(() => {
    if (!IS_API || session.status !== "authenticated") return;
    void syncNow();
    const t = setInterval(() => void syncNow(), API_POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [session.status]);

  if (session.status !== "authenticated" || !session.admin) return null;

  if (IS_API && sync.state !== "ready") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center" role="status">
        {sync.state === "error" ? (
          <>
            <TriangleAlert className="size-7 text-danger" aria-hidden />
            <div className="font-semibold text-ink">Couldn&apos;t load the admin console</div>
            <p className="max-w-md text-sm text-ink-muted">{sync.error}</p>
            <div className="mt-2 flex gap-2">
              <Button onClick={() => void syncNow()}>Try again</Button>
              <Button variant="ghost" onClick={session.signOut}>
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            <LoaderCircle className="size-6 animate-spin text-ink-muted" aria-hidden />
            <span className="text-sm text-ink-muted">Loading from the admin API…</span>
          </>
        )}
      </div>
    );
  }

  return (
    <AdminShell
      admin={session.admin}
      badges={{ reports: selectPendingReportCount(db), disputes: selectOpenDisputeCount(db) }}
      onSignOut={() => {
        session.signOut();
        router.replace("/sign-in");
      }}
    >
      {IS_API && sync.error && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm" role="alert">
          Refresh failed. Showing data from {sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleTimeString() : "the last successful load"}. {sync.error}
          <Button size="sm" variant="ghost" onClick={() => void syncNow()}>Retry</Button>
        </div>
      )}
      {children}
    </AdminShell>
  );
}
