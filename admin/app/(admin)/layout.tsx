"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/shared/Button";
import { syncNow, useSyncStatus } from "@/lib/api/sync";
import { useSession, type SessionStatus } from "@/lib/auth/session";
import { useIdleTimeout } from "@/lib/auth/useIdleTimeout";
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
  useIdleTimeout(session.status === "authenticated", session.expire);

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-canvas px-4 text-center" role="status">
        {sync.state === "error" ? (
          <>
            <TriangleAlert className="size-5 text-ink-faint" aria-hidden />
            <div className="mt-1 text-sm font-semibold text-ink">Couldn&apos;t load the admin console</div>
            <p className="max-w-sm text-[13px] text-ink-muted">{sync.lastError}</p>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => void syncNow()}>Try again</Button>
              <Button variant="ghost" onClick={session.signOut}>
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            <LoaderCircle className="size-5 animate-spin text-ink-faint" aria-hidden />
            <span className="text-[13px] text-ink-muted">Loading from the admin API…</span>
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
      {children}
    </AdminShell>
  );
}
