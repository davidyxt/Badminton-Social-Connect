import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { BrandMark } from "@/components/layout/AdminShell";
import { ButtonLink } from "@/components/shared/Button";

export const metadata: Metadata = { title: "Page not found" };

/** Unknown routes. Laid out like the auth screens, since it sits outside the admin shell. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 pt-[14vh] pb-10">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-2">
          <BrandMark />
          <span className="text-sm font-semibold text-ink">Badminton Connect</span>
          <span className="text-sm text-ink-faint">Admin</span>
        </div>
        <main>
          <div className="mb-4 flex size-8 items-center justify-center rounded-md border border-line bg-surface text-ink-muted">
            <SearchX className="size-4" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Page not found</h1>
          <p className="mt-1 text-sm text-ink-muted">This page doesn&apos;t exist. The link may be wrong, or the page may have moved.</p>
          <ButtonLink href="/overview" variant="primary" className="mt-6 h-9 w-full">
            Go to Overview
          </ButtonLink>
        </main>
      </div>
    </div>
  );
}
