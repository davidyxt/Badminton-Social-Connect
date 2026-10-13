"use client";

/**
 * Single-series SVG charts (no chart library). Every chart in the console is one
 * series, so the title names it and no legend box is needed. Marks follow the
 * dataviz spec: 2px line with a ~10% area wash, columns <= 24px wide with a 4px
 * rounded top, hairline solid gridlines, a hover tooltip, and a table view so
 * values are never gated on the chart.
 */
import { useId, useMemo, useRef, useState } from "react";

export interface ChartPoint {
  /** x label, e.g. a date */
  label: string;
  value: number;
}

const SERIES = "var(--color-brand)";
const GRID = "var(--color-line)";
const H = 220;
const PAD = { top: 16, right: 48, bottom: 28, left: 44 };

/** Whole-number data (counts) never gets fractional ticks. */
function niceTicks(min: number, max: number, count = 4, integer = false): number[] {
  if (max === min) max = min + 1;
  const rawStep = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? rawStep;
  const step = integer ? Math.max(1, Math.round(nice)) : nice;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const fmt = (n: number) => n.toLocaleString("en-AU");

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const observer = useRef<ResizeObserver | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    ref.current = el;
    if (!el) return;
    setWidth(el.clientWidth || 640);
    observer.current = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.current.observe(el);
  };
  return { setRef, width };
}

function ChartFrame({
  title,
  summary,
  points,
  valueLabel,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  points: ChartPoint[];
  valueLabel: string;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <figcaption className="text-[13px] font-medium text-ink-muted">
          {title}
          {summary && <span className="ml-2 font-normal text-ink-muted">{summary}</span>}
        </figcaption>
        <button type="button" onClick={() => setShowTable((s) => !s)} className="rounded-md px-1.5 py-0.5 text-xs text-ink-muted hover:bg-subtle hover:text-ink" aria-pressed={showTable}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? (
        <div className="max-h-[260px] overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-subtle text-xs text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Period</th>
                <th className="px-3 py-2 text-right font-medium">{valueLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {points.map((p) => (
                <tr key={p.label}>
                  <td className="px-3 py-1.5 text-ink-muted">{p.label}</td>
                  <td className="px-3 py-1.5 text-right text-ink tabular-nums">{fmt(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}

function Tooltip({ x, y, width, label, value, valueLabel }: { x: number; y: number; width: number; label: string; value: number; valueLabel: string }) {
  const left = Math.min(Math.max(x - 70, 0), width - 140);
  return (
    <div
      className="pointer-events-none absolute z-10 w-[140px] rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
      style={{ left, top: Math.max(0, y - 64) }}
    >
      <div className="text-ink-muted">{label}</div>
      <div className="mt-0.5 font-semibold text-ink tabular-nums">
        {fmt(value)} <span className="font-normal text-ink-muted">{valueLabel.toLowerCase()}</span>
      </div>
    </div>
  );
}

function xLabelIndexes(n: number, max = 6): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

export function LineChart({
  title,
  summary,
  points,
  valueLabel,
  zeroBased = false,
}: {
  title: string;
  summary?: React.ReactNode;
  points: ChartPoint[];
  valueLabel: string;
  zeroBased?: boolean;
}) {
  const { setRef, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const { ticks, x, y } = useMemo(() => {
    const values = points.map((p) => p.value);
    const lo = zeroBased ? 0 : Math.min(...values);
    const hi = Math.max(...values);
    const pad = zeroBased ? 0 : (hi - lo) * 0.15 || 10;
    const ticks = niceTicks(lo - pad, hi + pad, 4, values.every(Number.isInteger));
    const t0 = ticks[0];
    const t1 = ticks[ticks.length - 1];
    return {
      ticks,
      x: (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
      y: (v: number) => PAD.top + innerH - ((v - t0) / (t1 - t0)) * innerH,
    };
  }, [points, zeroBased, innerW, innerH]);

  if (points.length === 0) return <p className="text-[13px] text-ink-muted">No data for this period.</p>;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const last = points[points.length - 1];

  return (
    <ChartFrame title={title} summary={summary} points={points} valueLabel={valueLabel}>
      <div ref={setRef} className="relative">
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`${title}. ${points.length} points, latest ${fmt(last.value)}.`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - rect.left - PAD.left;
            const i = Math.round((px / innerW) * (points.length - 1));
            setHover(Math.min(points.length - 1, Math.max(0, i)));
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={SERIES} stopOpacity={0.12} />
              <stop offset="1" stopColor={SERIES} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[11px] tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          {xLabelIndexes(points.length).map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-faint text-[11px] tabular-nums">
              {points[i].label}
            </text>
          ))}
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-line-strong)" strokeWidth={1} />
          )}
          <circle
            cx={x(hover ?? points.length - 1)}
            cy={y(points[hover ?? points.length - 1].value)}
            r={4.5}
            fill={SERIES}
            stroke="var(--color-surface)"
            strokeWidth={2}
          />
          {hover === null && (
            <text x={x(points.length - 1) + 8} y={y(last.value)} dy="0.32em" className="fill-ink text-[11px] font-medium tabular-nums">
              {fmt(last.value)}
            </text>
          )}
        </svg>
        {hover !== null && (
          <Tooltip x={x(hover)} y={y(points[hover].value)} width={width} label={points[hover].label} value={points[hover].value} valueLabel={valueLabel} />
        )}
      </div>
    </ChartFrame>
  );
}

export function ColumnChart({
  title,
  summary,
  points,
  valueLabel,
}: {
  title: string;
  summary?: React.ReactNode;
  points: ChartPoint[];
  valueLabel: string;
}) {
  const { setRef, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (points.length === 0) return <p className="text-[13px] text-ink-muted">No data for this period.</p>;

  const ticks = niceTicks(0, Math.max(...points.map((p) => p.value), 1), 4, points.every((p) => Number.isInteger(p.value)));
  const top = ticks[ticks.length - 1];
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const slot = innerW / points.length;
  const barW = Math.max(2, Math.min(24, slot - 2));
  const r = Math.min(4, barW / 2);
  const maxIndex = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);

  return (
    <ChartFrame title={title} summary={summary} points={points} valueLabel={valueLabel}>
      <div ref={setRef} className="relative">
        <svg width={width} height={H} role="img" aria-label={`${title}. ${points.length} periods, peak ${fmt(points[maxIndex].value)}.`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[11px] tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          {xLabelIndexes(points.length).map((i) => (
            <text key={i} x={PAD.left + slot * i + slot / 2} y={H - 8} textAnchor="middle" className="fill-ink-faint text-[11px] tabular-nums">
              {points[i].label}
            </text>
          ))}
          {points.map((p, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const x0 = cx - barW / 2;
            const yTop = y(p.value);
            const h = PAD.top + innerH - yTop;
            const rr = Math.min(r, h);
            const d =
              h <= 0
                ? ""
                : `M${x0},${PAD.top + innerH} L${x0},${yTop + rr} Q${x0},${yTop} ${x0 + rr},${yTop} L${x0 + barW - rr},${yTop} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + rr} L${x0 + barW},${PAD.top + innerH} Z`;
            return (
              <g key={p.label} onMouseEnter={() => setHover(i)}>
                {/* Hit target spans the whole slot, larger than the mark. */}
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
                {d && <path d={d} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.45} />}
              </g>
            );
          })}
          {hover === null && points[maxIndex].value > 0 && (
            <text x={PAD.left + slot * maxIndex + slot / 2} y={y(points[maxIndex].value) - 6} textAnchor="middle" className="fill-ink text-[11px] font-medium tabular-nums">
              {fmt(points[maxIndex].value)}
            </text>
          )}
        </svg>
        {hover !== null && (
          <Tooltip
            x={PAD.left + slot * hover + slot / 2}
            y={y(points[hover].value)}
            width={width}
            label={points[hover].label}
            value={points[hover].value}
            valueLabel={valueLabel}
          />
        )}
      </div>
    </ChartFrame>
  );
}
