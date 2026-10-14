"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import { clampDate, daysInRange, isWeekly, longLabel, PRESETS, presetRange, type DateRange } from "./range";

/**
 * Preset ranges plus a Custom panel (screen 03). Presentational: the range
 * lives with the caller; only the unsaved custom dates are held here.
 */
export function DateRangePicker({ value, onChange, min, max }: { value: DateRange; onChange: (r: DateRange) => void; min: string; max: string }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState({ from: value.from, to: value.to });
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLButtonElement>(null);

  // Close on a click outside the picker or Escape anywhere, not only when focus is in the panel.
  useEffect(() => {
    if (!customOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setCustomOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const focusInside = wrapRef.current?.contains(document.activeElement);
      setCustomOpen(false);
      if (focusInside) customRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [customOpen]);

  // Typed dates outside the data window are pulled in on Apply; say so before then.
  const outOfRange = [draft.from, draft.to].some((d) => d && (d < min || d > max));

  const openCustom = () => {
    setDraft({ from: value.from, to: value.to });
    setError(null);
    setCustomOpen(true);
  };

  const apply = () => {
    if (!draft.from || !draft.to) return setError("Choose both a start and an end date.");
    const from = clampDate(draft.from, min, max);
    const to = clampDate(draft.to, min, max);
    if (from > to) return setError("The start date must be on or before the end date.");
    onChange({ preset: "custom", from, to });
    setCustomOpen(false);
  };

  const days = daysInRange(value.from, value.to);
  const segment = (active: boolean) =>
    `inline-flex h-full items-center rounded px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
      active ? "bg-subtle text-ink ring-1 ring-line-strong" : "text-ink-muted hover:text-ink"
    }`;
  const inputCls =
    "h-8 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none";

  return (
    <div className="mb-6">
      <div ref={wrapRef} className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Date range">
          {PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              className={segment(value.preset === d && !customOpen)}
              aria-pressed={value.preset === d && !customOpen}
              onClick={() => {
                setCustomOpen(false);
                onChange(presetRange(d, min, max));
              }}
            >
              {d} days
            </button>
          ))}
          <button
            ref={customRef}
            type="button"
            className={segment(value.preset === "custom" || customOpen)}
            aria-pressed={value.preset === "custom" || customOpen}
            aria-expanded={customOpen}
            aria-controls="custom-range-panel"
            onClick={() => (customOpen ? setCustomOpen(false) : openCustom())}
          >
            Custom
          </button>
        </div>
        <span className="text-[13px] text-ink-muted tabular-nums">
          {longLabel(value.from)} – {longLabel(value.to)}
          <span className="text-ink-faint">
            {" "}
            · {days} day{days === 1 ? "" : "s"}
            {isWeekly(value.from, value.to) ? " · weekly totals" : " · daily"}
          </span>
        </span>

        {customOpen && (
          <div
            id="custom-range-panel"
            className="absolute top-full left-0 z-20 mt-2 w-[min(400px,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[13px] text-ink-muted">
                From
                <input
                  type="date"
                  className={inputCls}
                  value={draft.from}
                  min={min}
                  max={max}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, from: e.target.value }));
                    setError(null);
                  }}
                  aria-invalid={!!error}
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px] text-ink-muted">
                To
                <input
                  type="date"
                  className={inputCls}
                  value={draft.to}
                  min={min}
                  max={max}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, to: e.target.value }));
                    setError(null);
                  }}
                  aria-invalid={!!error}
                />
              </label>
            </div>
            {error ? (
              <p className="mt-2 text-[13px] text-danger" role="alert">
                {error}
              </p>
            ) : outOfRange ? (
              <p className="mt-2 text-[13px] text-warning" role="status">
                Data is available from {longLabel(min)} to {longLabel(max)}. Dates outside that are moved to fit when you apply.
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-faint">
                Available {longLabel(min)} to {longLabel(max)}. Ranges over 31 days show weekly totals.
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={apply}>
                Apply
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
