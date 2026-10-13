"use client";

import { LogOut, Menu, RefreshCw, TriangleAlert, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { syncNow, useSyncStatus } from "@/lib/api/sync";
import { IS_API } from "@/lib/config";
import type { Admin } from "@/lib/types";
import { Avatar } from "@/components/shared/PlayerProfileCard";
import { Sidebar } from "./Sidebar";

/** Small monogram mark, shared with the auth screens. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-md bg-ink text-[10px] font-semibold tracking-tight text-white ${className}`}
      aria-hidden
    >
      BC
    </span>
  );
}

function Brand() {
  return (
    <div className="flex h-12 min-w-0 items-center gap-2 pr-2 pl-[18px]">
      <BrandMark />
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-sm font-semibold tracking-tight text-ink">Badminton Connect</span>
        <span className="text-sm text-ink-faint">Admin</span>
      </span>
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" });

function updatedAgo(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  return `Updated at ${timeFmt.format(at)}`;
}

/**
 * API mode: when the data was last refreshed, and a warning with Retry when
 * the latest refresh failed or couldn't load everything. The data on screen
 * stays put either way.
 */
function SyncIndicator() {
  const sync = useSyncStatus();
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!sync.lastSyncedAt) return null;

  const retry = () => {
    setRetrying(true);
    void syncNow().finally(() => setRetrying(false));
  };

  if (!sync.lastError) {
    return (
      <span className="hidden text-xs text-ink-faint md:inline" role="status">
        {updatedAgo(sync.lastSyncedAt, Math.max(now, sync.lastSyncedAt))}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-warning" role="status" title={sync.lastError}>
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      <span className="hidden truncate sm:inline">
        {sync.lastSyncFailed ? `Couldn't refresh, showing data from ${timeFmt.format(sync.lastSyncedAt)}` : "Some data couldn't be loaded"}
      </span>
      <span className="sr-only">{sync.lastError}</span>
      <button
        type="button"
        onClick={retry}
        disabled={retrying}
        className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-medium hover:bg-warning-soft disabled:opacity-60"
      >
        <RefreshCw className={`size-3.5 ${retrying ? "animate-spin" : ""}`} aria-hidden />
        Retry
      </button>
    </span>
  );
}

/** Sidebar nav + header, wrapping every (admin) route. */
export function AdminShell({
  admin,
  badges,
  onSignOut,
  children,
}: {
  admin: Admin;
  badges: Record<"reports" | "disputes", number>;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    // Close the mobile drawer on navigation.
    setLastPath(pathname);
    setMobileOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px]">
        Skip to content
      </a>

      <div className="hidden w-60 shrink-0 border-r border-line bg-sidebar lg:block">
        <aside className="sticky top-0 flex h-screen flex-col">
          <Brand />
          <Sidebar badges={badges} />
        </aside>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/20" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-[280px] max-w-[85vw] flex-col border-r border-line bg-sidebar shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-ink-faint hover:bg-sidebar-hover hover:text-ink"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </button>
            </div>
            <Sidebar badges={badges} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-1.5 rounded-md p-1.5 text-ink-muted hover:bg-subtle hover:text-ink lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </button>
          <BrandMark className="lg:hidden" />
          <div className="flex-1" />
          {IS_API && <SyncIndicator />}
          <span
            className="hidden items-center gap-1.5 text-xs text-ink-faint sm:inline-flex"
            title={IS_API ? "Reading and writing the admin-api Edge Function" : "In-memory sample data; nothing is saved to a server"}
          >
            <span className={`size-1.5 rounded-full ${IS_API ? "bg-success" : "bg-ink-faint/60"}`} aria-hidden />
            {IS_API ? "Live API" : "Mock data"}
          </span>
          <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={admin.display_name} size="sm" />
            <div className="hidden min-w-0 leading-tight sm:block">
              <div className="truncate text-[13px] font-medium text-ink">{admin.display_name}</div>
              <div className="truncate text-xs text-ink-faint">{admin.email}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-muted hover:bg-subtle hover:text-ink"
            aria-label="Sign out"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
