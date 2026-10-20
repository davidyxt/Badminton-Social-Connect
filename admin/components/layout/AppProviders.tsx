"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { FeedbackProvider } from "@/components/shared/FeedbackToast";
import { SessionProvider } from "@/lib/auth/session";
import { IS_API } from "@/lib/config";
import { hydrateMockConfig, hydrateStore } from "@/lib/mock-api";
import { MockControls } from "./MockControls";

/**
 * Client-only root. The mock store, mock config and mock session all live in
 * browser storage, so nothing renders until they have been read.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateStore();
    hydrateMockConfig();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-muted" role="status">
        <LoaderCircle className="size-6 animate-spin" aria-hidden />
        <span className="sr-only">Loading admin console</span>
      </div>
    );
  }

  return (
    <SessionProvider>
      <FeedbackProvider>
        {children}
        {!IS_API && <MockControls />}
      </FeedbackProvider>
    </SessionProvider>
  );
}
