"use client";

import { CalendarRange } from "lucide-react";
import { useState } from "react";
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
    `rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap ${active ? "bg-brand text-white" : "text-ink-muted hover:text-ink"}`;
  const inputCls =
    "h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink focus:ring-2 focus:ring-brand/30 focus:outline-none";

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-line-strong bg-surface p-0.5" role="group" aria-label="Date range">
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
        <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
          <CalendarRange className="size-4 text-ink-faint" aria-hidden />
          {longLabel(value.from)} – {longLabel(value.to)} · {days} day{days === 1 ? "" : "s"}
          {isWeekly(value.from, value.to) ? " · weekly totals" : " · daily"}
        </span>
      </div>

      {customOpen && (
        <div id="custom-range-panel" className="mt-3 rounded-xl border border-line bg-surface px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm text-ink-muted">
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
            <label className="flex flex-col gap-1 text-sm text-ink-muted">
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
            <div className="flex gap-2">
              <Button variant="primary" onClick={apply}>
                Apply
              </Button>
              <Button variant="ghost" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
          {error ? (
            <p className="mt-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : (
            <p className="mt-2 text-xs text-ink-faint">
              Data is available from {longLabel(min)} to {longLabel(max)}. Ranges over 31 days are shown as weekly totals.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
