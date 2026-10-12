import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sidebar px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand font-bold text-white" aria-hidden>
          BC
        </span>
        <div className="leading-tight">
          <div className="font-semibold text-white">Badminton Social Connect</div>
          <div className="text-sm text-sidebar-text">Administrator console</div>
        </div>
      </div>
      <main className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-2xl">{children}</main>
      <p className="mt-6 text-center text-xs text-sidebar-text/70">Restricted to the designated platform administrator.</p>
    </div>
  );
}
