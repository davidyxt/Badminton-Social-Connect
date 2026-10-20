"use client";

/**
 * Dev-only panel for exercising the states that a real backend would produce:
 * save failures, record-changed conflicts, live incoming reports, and the
 * expired / restricted session screens. Not part of the real console.
 */
import { FlaskConical, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth/session";
import { resetStore, setMockConfig, simulate_incoming_report, useMockConfig } from "@/lib/mock-api";

const LIVE_REPORT_INTERVAL_MS = 20_000;
const DEV_TOOLS_KEY = "bsc-admin:dev-tools";

/**
 * The panel is hidden unless NEXT_PUBLIC_SHOW_DEV_TOOLS=true, or the console was opened
 * with ?devtools=1 (remembered in this browser; ?devtools=0 hides it again).
 */
function devToolsEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_SHOW_DEV_TOOLS === "true") return true;
  try {
    const param = new URLSearchParams(window.location.search).get("devtools");
    if (param === "1") localStorage.setItem(DEV_TOOLS_KEY, "1");
    if (param === "0") localStorage.removeItem(DEV_TOOLS_KEY);
    return localStorage.getItem(DEV_TOOLS_KEY) === "1";
  } catch {
    return false;
  }
}

export function MockControls() {
  const [open, setOpen] = useState(false);
  // Rendered client-side only (after AppProviders hydrates), so reading window here is safe.
  const [visible] = useState(devToolsEnabled);
  const config = useMockConfig();
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!config.liveReports) return;
    const t = setInterval(simulate_incoming_report, LIVE_REPORT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [config.liveReports]);

  const armed = config.failNext || config.conflictNext || config.failureRate > 0;

  // The live-report timer above keeps running either way; only the panel is hidden.
  if (!visible) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-ink-muted shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:bg-subtle hover:text-ink"
      >
        <FlaskConical className="size-4 text-ink-faint" aria-hidden />
        Mock controls
        {armed && <span className="size-1.5 rounded-full bg-accent" aria-label="Failure simulation armed" />}
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-4 left-4 z-40 max-h-[calc(100vh-2rem)] w-[min(300px,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-line bg-surface px-4 pt-3 pb-4 text-[13px] text-ink shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
      aria-label="Mock controls"
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">Mock controls</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="-mr-1.5 rounded-md p-1 text-ink-faint hover:bg-subtle hover:text-ink"
          aria-label="Close mock controls"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mb-2 text-xs text-ink-faint">Demo tooling for the mock data layer. No real backend is involved.</p>

      <Section title="Next action">
        <Toggle label="Fail the next save" checked={config.failNext} onChange={(v) => setMockConfig({ failNext: v, conflictNext: v ? false : config.conflictNext })} />
        <Toggle
          label="Next save hits a “record changed” conflict"
          checked={config.conflictNext}
          onChange={(v) => setMockConfig({ conflictNext: v, failNext: v ? false : config.failNext })}
        />
      </Section>

      <Section title="Network">
        <Toggle label="Simulate latency (300–800ms)" checked={config.latency} onChange={(v) => setMockConfig({ latency: v })} />
        <label className="flex items-center justify-between gap-3 py-1">
          <span className="text-ink-muted">Random failure rate</span>
          <select
            value={config.failureRate}
            onChange={(e) => setMockConfig({ failureRate: Number(e.target.value) })}
            className="h-7 rounded-md border border-line-strong bg-surface px-2 text-[13px] focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
          >
            <option value={0}>Off</option>
            <option value={0.1}>10%</option>
            <option value={0.25}>25%</option>
            <option value={0.5}>50%</option>
          </select>
        </label>
      </Section>

      <Section title="Realtime">
        <Toggle label="New player report every 20s" checked={config.liveReports} onChange={(v) => setMockConfig({ liveReports: v })} />
        <button type="button" onClick={simulate_incoming_report} className="mt-1 text-[13px] font-medium text-brand hover:underline">
          Add a report now
        </button>
      </Section>

      <Section title="Session">
        <div className="flex flex-wrap gap-2">
          <SmallButton
            onClick={() => {
              session.simulateExpiry();
              setOpen(false);
            }}
          >
            Expire session
          </SmallButton>
          <SmallButton
            onClick={() => {
              session.simulateRestricted();
              setOpen(false);
            }}
          >
            Lose admin access
          </SmallButton>
        </div>
      </Section>

      <div className="border-t border-line pt-3">
        <SmallButton
          onClick={() => {
            if (window.confirm("Reset all mock data to the original fixtures?")) {
              resetStore();
              router.refresh();
            }
          }}
        >
          Reset mock data
        </SmallButton>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-2.5">
      <div className="mb-0.5 text-xs font-medium text-ink-faint">{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-ink-muted">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-3.5 shrink-0 accent-[var(--color-ink)]" />
    </label>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-7 items-center rounded-md border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink hover:bg-subtle">
      {children}
    </button>
  );
}
