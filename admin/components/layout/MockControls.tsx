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

export function MockControls() {
  const [open, setOpen] = useState(false);
  const config = useMockConfig();
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!config.liveReports) return;
    const t = setInterval(simulate_incoming_report, LIVE_REPORT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [config.liveReports]);

  const armed = config.failNext || config.conflictNext || config.failureRate > 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-xs font-semibold text-ink shadow-lg hover:bg-subtle"
      >
        <FlaskConical className="size-4 text-accent" aria-hidden />
        Mock controls
        {armed && <span className="size-2 rounded-full bg-accent" aria-label="Failure simulation armed" />}
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-4 left-4 z-40 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-line-strong bg-surface p-4 text-sm shadow-2xl"
      aria-label="Mock controls"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <FlaskConical className="size-4 text-accent" aria-hidden />
          Mock controls
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-ink-faint hover:text-ink" aria-label="Close mock controls">
          <X className="size-4" />
        </button>
      </div>
      <p className="mb-3 text-xs text-ink-muted">Demo tooling for the mock data layer. No real backend is involved.</p>

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
          <span>Random failure rate</span>
          <select
            value={config.failureRate}
            onChange={(e) => setMockConfig({ failureRate: Number(e.target.value) })}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm"
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
        <button type="button" onClick={simulate_incoming_report} className="mt-1 text-sm font-medium text-brand hover:underline">
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

      <div className="mt-3 border-t border-line pt-3">
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
      <div className="mb-1 text-xs font-semibold tracking-wide text-ink-faint uppercase">{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
    </label>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md border border-line-strong px-2.5 py-1 text-xs font-medium hover:bg-subtle">
      {children}
    </button>
  );
}
