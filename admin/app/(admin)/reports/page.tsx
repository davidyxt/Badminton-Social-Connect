"use client";

import { Building2, Flag, Gamepad2, Images, Swords, Trophy, UserRound } from "lucide-react";
import { useState } from "react";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs } from "@/components/shared/Tabs";
import { CATEGORY_LABEL, formatDateTime, TARGET_TYPE_LABEL } from "@/lib/format";
import { useQuery } from "@/lib/mock-api";
import type { Report, ReportStatus } from "@/lib/types";

interface Row {
  report: Report;
  reporter: string;
  target: string;
}

const TARGET_ICON = { player: UserRound, game_post: Gamepad2, mini_league: Trophy, match: Swords, admin_post: Images, group: Building2 };

/** Screens 17 (queue) and 18 (no matching reports). */
export default function ReportsPage() {
  const [tab, setTab] = useState<ReportStatus | "all">("pending");

  const { rows, counts } = useQuery((db) => {
    const names = new Map(db.players.map((p) => [p.player_id, p.display_name]));
    const targetLabel = (r: Report) => {
      if (r.target_type === "player") return names.get(r.target_id) ?? r.target_id;
      if (r.target_type === "game_post") return db.game_posts.find((p) => p.post_id === r.target_id)?.title ?? `${r.target_id} (deleted)`;
      if (r.target_type === "mini_league") return db.mini_leagues.find((l) => l.league_id === r.target_id)?.name ?? `${r.target_id} (deleted)`;
      if (r.target_type === "admin_post") return db.admin_posts.find((p) => p.admin_post_id === r.target_id)?.title ?? `${r.target_id} (deleted)`;
      if (r.target_type === "match") {
        const m = db.matches.find((x) => x.match_id === r.target_id);
        return m ? [m.side_a, m.side_b].map((ids) => ids.map((id) => names.get(id) ?? id).join(" & ")).join(" vs ") : `${r.target_id} (deleted)`;
      }
      if (r.target_type === "group") return db.groups.find((g) => g.group_id === r.target_id)?.name ?? r.target_id;
      return r.target_id;
    };
    const rows: Row[] = db.reports.map((report) => ({
      report,
      reporter: names.get(report.reported_by_player_id) ?? report.reported_by_player_id,
      target: targetLabel(report),
    }));
    const counts = { pending: 0, resolved: 0, dismissed: 0 };
    for (const r of db.reports) counts[r.status]++;
    return { rows, counts };
  });

  const visible = tab === "all" ? rows : rows.filter((r) => r.report.status === tab);

  const columns: Column<Row>[] = [
    {
      id: "reason",
      header: "Report",
      sortValue: (r) => r.report.reason,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{r.report.reason}</div>
          <div className="line-clamp-1 max-w-md text-xs text-ink-muted">{r.report.details}</div>
        </div>
      ),
    },
    {
      id: "target",
      header: "Reported",
      sortValue: (r) => r.target,
      cell: (r) => {
        // Fall back for any target type added to the database later.
        const Icon = TARGET_ICON[r.report.target_type] ?? Flag;
        return (
          <div className="flex items-center gap-2">
            <Icon className="size-4 shrink-0 text-ink-faint" aria-hidden />
            <div className="min-w-0">
              <div className="max-w-[220px] truncate text-ink">{r.target}</div>
              <div className="text-xs text-ink-muted">{TARGET_TYPE_LABEL[r.report.target_type]}</div>
            </div>
          </div>
        );
      },
    },
    { id: "reporter", header: "Reported by", sortValue: (r) => r.reporter, cell: (r) => r.reporter, className: "whitespace-nowrap" },
    { id: "status", header: "Status", sortValue: (r) => r.report.status, cell: (r) => <StatusBadge status={r.report.status} /> },
    {
      id: "created",
      header: "Received",
      sortValue: (r) => r.report.created_at,
      cell: (r) => formatDateTime(r.report.created_at),
      className: "whitespace-nowrap",
    },
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        meta={<LiveIndicator />}
        description="Player reports about accounts, game posts and Mini Leagues. New reports appear here automatically."
      />
      <Tabs
        label="Report status"
        active={tab}
        onChange={(id) => setTab(id as ReportStatus | "all")}
        tabs={[
          { id: "pending", label: "Pending", count: counts.pending },
          { id: "resolved", label: "Resolved", count: counts.resolved },
          { id: "dismissed", label: "Dismissed", count: counts.dismissed },
          { id: "all", label: "All", count: rows.length },
        ]}
      />
      <DataTable
        key={tab}
        caption="Reports"
        rows={visible}
        columns={columns}
        getRowId={(r) => r.report.report_id}
        rowHref={(r) => `/reports/${r.report.report_id}`}
        getSearchText={(r) => `${r.report.reason} ${r.report.details} ${r.target} ${r.reporter} ${r.report.report_id}`}
        searchPlaceholder="Search reason, player or content"
        filters={[
          {
            id: "type",
            label: "Type",
            options: [
              { value: "player", label: "Player" },
              { value: "game_post", label: "Game post" },
              { value: "mini_league", label: "Mini League" },
              { value: "match", label: "Match" },
              { value: "admin_post", label: "Carousel card" },
              { value: "group", label: "Group" },
            ],
            getValue: (r) => r.report.target_type,
          },
          {
            id: "category",
            label: "Category",
            options: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
            getValue: (r) => r.report.category,
          },
        ]}
        initialSort={{ columnId: "created", direction: tab === "pending" ? "asc" : "desc" }}
        empty={
          // Screen 18
          <EmptyState
            icon={<Flag className="size-6" aria-hidden />}
            title={tab === "pending" && visible.length === 0 ? "No pending reports" : "No matching reports"}
            description={
              tab === "pending" && visible.length === 0
                ? "You're all caught up. New reports will appear here as soon as players submit them."
                : "No reports match your search or filters. Try clearing them."
            }
          />
        }
      />
    </>
  );
}
