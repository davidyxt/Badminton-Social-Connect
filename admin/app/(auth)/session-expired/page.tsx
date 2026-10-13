"use client";

import { Clock } from "lucide-react";
import { SignInForm } from "@/components/layout/SignInForm";

/** Screen 48 */
export default function SessionExpiredPage() {
  return (
    <>
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-warning-soft text-warning">
        <Clock className="size-5" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-ink">Your session has expired</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        For security, administrator sessions end after a period of inactivity. Sign in again to continue. Any unsaved changes were not
        applied.
      </p>
      <SignInForm submitLabel="Sign in again" />
    </>
  );
}
