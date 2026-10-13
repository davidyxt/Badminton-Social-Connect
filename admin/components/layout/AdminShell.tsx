"use client";

import { LogOut, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { IS_API } from "@/lib/config";
import type { Admin } from "@/lib/types";
import { Avatar } from "@/components/shared/PlayerProfileCard";
import { Sidebar } from "./Sidebar";

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white" aria-hidden>
        BC
      </span>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-white">Badminton Connect</div>
        <div className="text-xs text-sidebar-text">Admin console</div>
      </div>
    </div>
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
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      <div className="hidden w-64 shrink-0 bg-sidebar lg:block">
        <aside className="sticky top-0 flex h-screen flex-col">
          <Brand />
          <Sidebar badges={badges} />
        </aside>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-72 flex-col bg-sidebar">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded p-1.5 text-sidebar-text hover:text-white" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <Sidebar badges={badges} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-ink-muted hover:bg-neutral-soft lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <span
            className={`hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline ${IS_API ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
            title={IS_API ? "Reading and writing the admin-api Edge Function" : "In-memory sample data; nothing is saved to a server"}
          >
            {IS_API ? "Live API" : "Mock data"}
          </span>
          <div className="flex items-center gap-2.5">
            <Avatar name={admin.display_name} size="sm" />
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-medium text-ink">{admin.display_name}</div>
              <div className="text-xs text-ink-faint">{admin.email}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-muted hover:bg-neutral-soft hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
