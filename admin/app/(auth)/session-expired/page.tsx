"use client";

import { Clock } from "lucide-react";
import { SignInForm } from "@/components/layout/SignInForm";

/** Screen 48 */
export default function SessionExpiredPage() {
  return (
    <>
      <div className="mb-4 flex size-8 items-center justify-center rounded-md border border-line bg-surface text-ink-muted">
        <Clock className="size-4" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Your session has expired</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        Sessions end after a period of inactivity. Sign in again to continue. Unsaved changes were not applied.
      </p>
      <SignInForm submitLabel="Sign in again" />
    </>
  );
}
