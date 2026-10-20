"use client";

import { BackendGapNotice } from "@/components/shared/BackendGapNotice";
import { featureGap } from "@/lib/api/capabilities";
import Link from "next/link";
import { Download, ScrollText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useSession } from "@/lib/auth/session";
import { ACTION_FEATURE, ACTION_LABEL, TARGET_TYPE_LABEL, downloadFile, formatDateTime, humanize, resultStatusOf, toCsv } from "@/lib/format";
import { localDateTime, localDay, resolveTarget } from "@/lib/activity";
import { selectVisibleActivity, useQuery } from "@/lib/mock-api";
import type { ActivityLog } from "@/lib/types";

interface Row {
  entry: ActivityLog;
  actionLabel: string;
  feature: string;
  typeLabel: string;
  /** The target's status after the action (DB01 "new state"), or null when the action didn't change status. */
  status: string | null;
  /** Human label for the target, when it still exists. */
  targetLabel: string | null;
  /** Link to the record, when it still exists. */
  targetHref: string | null;
  admin: string;
  /** Local calendar date (YYYY-MM-DD) for the date range filter. */
  day: string;
}

/** Screen 45 */
export default function ActivityLogPage() {
  const { admin } = useSession();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useQuery<Row[]>((db) =>
    selectVisibleActivity(db)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((entry) => {
        const target = resolveTarget(db, entry.target_type, entry.target_id);
        return {
          entry,
          actionLabel: ACTION_LABEL[entry.action] ?? humanize(entry.action),
          feature: ACTION_FEATURE[entry.action] ?? "Other",
          typeLabel: TARGET_TYPE_LABEL[entry.target_type] ?? humanize(entry.target_type),
          status: entry.new_status !== undefined ? entry.new_status : resultStatusOf(entry.action, entry.details),
          targetLabel: target.label,
          targetHref: target.href,
          admin: admin && admin.admin_id === entry.admin_id ? admin.display_name : entry.admin_id,
          day: localDay(entry.created_at),
        };
      }),
  );

  const rangeInvalid = Boolean(from && to && from > to);
  const inRange = rangeInvalid ? rows : rows.filter((r) => (!from || r.day >= from) && (!to || r.day <= to));

  const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  const typeOptions = unique(rows.map((r) => r.entry.target_type)).map((t) => ({ value: t, label: TARGET_TYPE_LABEL[t] ?? humanize(t) }));
  const featureOptions = unique(rows.map((r) => r.feature)).map((f) => ({ value: f, label: f }));
  const actionOptions = unique(rows.map((r) => r.entry.action))
    .map((a) => ({ value: a, label: ACTION_LABEL[a] ?? humanize(a) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const NO_CHANGE = "none";
  const statusOptions = [
    ...unique(rows.flatMap((r) => (r.status ? [r.status] : []))).map((st) => ({ value: st, label: humanize(st) })),
    ...(rows.some((r) => !r.status) ? [{ value: NO_CHANGE, label: "No status change" }] : []),
  ];

  const columns: Column<Row>[] = [
    {
      id: "when",
      header: "When",
      sortValue: (r) => r.entry.created_at,
      cell: (r) => formatDateTime(r.entry.created_at),
      className: "whitespace-nowrap",
    },
    {
      id: "action",
      header: "Action",
      sortValue: (r) => r.actionLabel,
      cell: (r) => (
        <div>
          <div className="font-medium text-ink">{r.actionLabel}</div>
          <div className="text-[13px] text-ink-muted">{r.feature}</div>
        </div>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "target",
      header: "Target",
      sortValue: (r) => `${r.typeLabel} ${r.targetLabel ?? r.entry.target_id}`,
      cell: (r) => (
        <div className="min-w-0">
          {r.targetHref ? (
            <Link href={r.targetHref} className="block max-w-[220px] truncate font-medium text-ink hover:text-brand hover:underline">
              {r.targetLabel}
            </Link>
          ) : (
            <span className="block font-mono text-xs text-ink-faint" title="This record no longer exists">
              {r.entry.target_id} (deleted)
            </span>
          )}
          <div className="text-[13px] text-ink-muted">{r.typeLabel}</div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.status ?? "",
      cell: (r) => (r.status ? <StatusBadge status={r.status} /> : <span className="text-ink-faint">—</span>),
      className: "whitespace-nowrap",
    },
    {
      id: "details",
      header: "Details",
      cell: (r) => <div className="line-clamp-2 max-w-md text-ink-muted">{r.entry.details}</div>,
    },
    { id: "admin", header: "Admin", sortValue: (r) => r.admin, cell: (r) => r.admin, className: "whitespace-nowrap" },
  ];

  const exportCsv = (filtered: Row[]) => {
    const csv = toCsv(
      filtered.map((r) => ({
        // Local time, like the table and the date filter.
        when: localDateTime(r.entry.created_at),
        action: r.actionLabel,
        action_code: r.entry.action,
        feature: r.feature,
        status: r.status ? humanize(r.status) : "",
        target_type: r.typeLabel,
        target_id: r.entry.target_id,
        target: r.targetLabel ?? "(deleted)",
        details: r.entry.details,
        admin: r.admin,
        log_id: r.entry.log_id,
      })),
    );
    const suffix = from || to ? `_${from || "start"}_to_${to || "now"}` : "";
    downloadFile(`activity-log${suffix}.csv`, csv);
  };

  const dateInput =
    "h-8 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink tabular-nums transition-colors hover:border-ink-faint/60 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none";

  return (
    <>
      <PageHeader title="Activity log" meta={<LiveIndicator />} description="Every admin action, newest first." />
      <BackendGapNotice message={featureGap("activityLog")} />

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
          <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            From
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            To
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={dateInput} />
          </label>
          {(from || to) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Clear dates
            </Button>
          )}
        </div>
        {rangeInvalid && (
          <p role="alert" className="text-[13px] text-danger">
            The start date is after the end date, so the date range isn&apos;t applied.
          </p>
        )}
      </div>

      <DataTable
        caption="Activity log"
        rows={inRange}
        columns={columns}
        pageSize={15}
        getRowId={(r) => r.entry.log_id}
        getSearchText={(r) => `${r.actionLabel} ${r.entry.details} ${r.entry.target_id} ${r.targetLabel ?? ""} ${r.admin}`}
        searchPlaceholder="Search actions, details or IDs"
        filters={[
          { id: "type", label: "Type", options: typeOptions, getValue: (r) => r.entry.target_type },
          { id: "feature", label: "Feature", options: featureOptions, getValue: (r) => r.feature },
          { id: "action", label: "Action", options: actionOptions, getValue: (r) => r.entry.action },
          { id: "status", label: "Status", options: statusOptions, getValue: (r) => r.status ?? NO_CHANGE },
        ]}
        initialSort={{ columnId: "when", direction: "desc" }}
        toolbarExtra={(filtered) => (
          <Button size="sm" icon={<Download aria-hidden />} disabled={filtered.length === 0} onClick={() => exportCsv(filtered)}>
            Export CSV ({filtered.length})
          </Button>
        )}
        empty={
          <EmptyState
            icon={<ScrollText className="size-6" aria-hidden />}
            title={rows.length === 0 ? "No admin actions yet" : "No matching actions"}
            description={
              rows.length === 0
                ? "Actions you take across the console will be recorded here."
                : "No actions match your dates, search or filters. Try widening them."
            }
          />
        }
      />
    </>
  );
}
