import type { ReactNode } from "react";
import { BrandMark } from "@/components/layout/AdminShell";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 pt-[14vh] pb-10">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-2">
          <BrandMark />
          <span className="text-sm font-semibold text-ink">Badminton Connect</span>
          <span className="text-sm text-ink-faint">Admin</span>
        </div>
        <main>{children}</main>
        <p className="mt-10 text-xs text-ink-faint">Restricted to the designated platform administrator.</p>
      </div>
    </div>
  );
}
