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
import { useSession } from "@/lib/auth/session";
import { ACTION_FEATURE, ACTION_LABEL, TARGET_TYPE_LABEL, downloadFile, formatDateTime, humanize, toCsv } from "@/lib/format";
import { useQuery } from "@/lib/mock-api";
import type { ActivityLog, MockDatabase } from "@/lib/types";

interface Row {
  entry: ActivityLog;
  actionLabel: string;
  feature: string;
  typeLabel: string;
  /** Human label for the target, when it still exists. */
  targetLabel: string | null;
  /** Link to the record, when it still exists. */
  targetHref: string | null;
  admin: string;
  /** Local calendar date (YYYY-MM-DD) for the date range filter. */
  day: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Resolves a log target to a label + link, or nulls when the record no longer exists. */
function resolveTarget(db: MockDatabase, type: string, id: string): { label: string | null; href: string | null } {
  switch (type) {
    case "player": {
      const p = db.players.find((x) => x.player_id === id);
      return p ? { label: p.display_name, href: `/users/${id}` } : { label: null, href: null };
    }
    case "report": {
      const r = db.reports.find((x) => x.report_id === id);
      return r ? { label: r.reason, href: `/reports/${id}` } : { label: null, href: null };
    }
    case "mini_league": {
      const l = db.mini_leagues.find((x) => x.league_id === id);
      return l ? { label: l.name, href: `/mini-leagues/${id}` } : { label: null, href: null };
    }
    case "game_post": {
      const g = db.game_posts.find((x) => x.post_id === id);
      return g ? { label: g.title, href: `/moderation/game-posts?post=${id}` } : { label: null, href: null };
    }
    case "dispute": {
      const d = db.disputes.find((x) => x.dispute_id === id);
      return d ? { label: id, href: `/disputes/${id}` } : { label: null, href: null };
    }
    case "admin_post": {
      const a = db.admin_posts.find((x) => x.admin_post_id === id);
      return a ? { label: a.title, href: "/content" } : { label: null, href: null };
    }
    default:
      return { label: null, href: null };
  }
}

/** Screen 45 */
export default function ActivityLogPage() {
  const { admin } = useSession();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useQuery<Row[]>((db) =>
    [...db.activity_log]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((entry) => {
        const target = resolveTarget(db, entry.target_type, entry.target_id);
        return {
          entry,
          actionLabel: ACTION_LABEL[entry.action] ?? humanize(entry.action),
          feature: ACTION_FEATURE[entry.action] ?? "Other",
          typeLabel: TARGET_TYPE_LABEL[entry.target_type] ?? humanize(entry.target_type),
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
      id: "details",
      header: "Details",
      cell: (r) => <div className="line-clamp-2 max-w-md text-ink-muted">{r.entry.details}</div>,
    },
    { id: "admin", header: "Admin", sortValue: (r) => r.admin, cell: (r) => r.admin, className: "whitespace-nowrap" },
  ];

  const exportCsv = (filtered: Row[]) => {
    const csv = toCsv(
      filtered.map((r) => ({
        when: r.entry.created_at,
        action: r.actionLabel,
        action_code: r.entry.action,
        feature: r.feature,
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
