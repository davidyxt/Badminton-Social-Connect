"use client";

import { Scale } from "lucide-react";
import { useState } from "react";
import { DisputeScopeNotice } from "@/components/disputes/DisputeScopeNotice";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs } from "@/components/shared/Tabs";
import { formatDateTime, humanize } from "@/lib/format";
import { selectMatch, useQuery } from "@/lib/mock-api";
import type { Dispute, DisputeStatus } from "@/lib/types";

interface Row {
  dispute: Dispute;
  players: string;
  format: string;
  raisedBy: string;
}

/** NEW (no Figma design, flagged scope): result disputes queue. */
export default function DisputesPage() {
  const [tab, setTab] = useState<DisputeStatus | "all">("open");

  const { rows, counts } = useQuery((db) => {
    const names = new Map(db.players.map((p) => [p.player_id, p.display_name]));
    const side = (ids: string[]) => ids.map((id) => names.get(id) ?? id).join(" & ");
    const rows: Row[] = db.disputes.map((dispute) => {
      const match = selectMatch(db, dispute.match_id);
      return {
        dispute,
        players: match ? `${side(match.side_a)} vs ${side(match.side_b)}` : `${dispute.match_id} (not found)`,
        format: match ? humanize(match.format) : "",
        raisedBy: (dispute.raised_by && names.get(dispute.raised_by)) ?? dispute.raised_by ?? "Unknown",
      };
    });
    const counts = { open: 0, under_review: 0, resolved: 0, dismissed: 0 };
    for (const d of db.disputes) counts[d.status]++;
    return { rows, counts };
  });

  const visible = tab === "all" ? rows : rows.filter((r) => r.dispute.status === tab);

  const columns: Column<Row>[] = [
    {
      id: "id",
      header: "Dispute",
      sortValue: (r) => r.dispute.dispute_id,
      cell: (r) => <span className="font-mono text-xs text-ink-muted">{r.dispute.dispute_id}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "match",
      header: "Match",
      sortValue: (r) => r.players,
      cell: (r) => (
        <div className="min-w-0">
          <div className="max-w-[260px] truncate font-medium text-ink">{r.players}</div>
          <div className="text-xs text-ink-muted">{r.format}</div>
        </div>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      sortValue: (r) => r.dispute.reason,
      cell: (r) => <div className="line-clamp-2 max-w-sm text-ink-muted">{r.dispute.reason}</div>,
    },
    { id: "raisedBy", header: "Raised by", sortValue: (r) => r.raisedBy, cell: (r) => r.raisedBy, className: "whitespace-nowrap" },
    {
      id: "raised",
      header: "Raised",
      sortValue: (r) => r.dispute.created_at,
      cell: (r) => formatDateTime(r.dispute.created_at),
      className: "whitespace-nowrap",
    },
    { id: "status", header: "Status", sortValue: (r) => r.dispute.status, cell: (r) => <StatusBadge status={r.dispute.status} /> },
  ];

  return (
    <>
      <PageHeader title="Disputes" description="Players disputing a submitted match result. Read-only." />
      <DisputeScopeNotice />
      <Tabs
        label="Dispute status"
        active={tab}
        onChange={(id) => setTab(id as DisputeStatus | "all")}
        tabs={[
          { id: "open", label: "Open", count: counts.open },
          { id: "under_review", label: "Under review", count: counts.under_review },
          { id: "resolved", label: "Resolved", count: counts.resolved },
          { id: "dismissed", label: "Dismissed", count: counts.dismissed },
          { id: "all", label: "All", count: rows.length },
        ]}
      />
      <DataTable
        key={tab}
        caption="Disputes"
        rows={visible}
        columns={columns}
        getRowId={(r) => r.dispute.dispute_id}
        rowHref={(r) => `/disputes/${r.dispute.dispute_id}`}
        getSearchText={(r) => `${r.dispute.dispute_id} ${r.dispute.match_id} ${r.players} ${r.dispute.reason} ${r.raisedBy}`}
        searchPlaceholder="Search player, reason or ID"
        initialSort={{ columnId: "raised", direction: tab === "open" ? "asc" : "desc" }}
        empty={
          <EmptyState
            icon={<Scale className="size-6" aria-hidden />}
            title={tab === "open" && visible.length === 0 ? "No open disputes" : "No matching disputes"}
            description={
              tab === "open" && visible.length === 0
                ? "You're all caught up. Disputes appear here when a player challenges a submitted result."
                : "No disputes match your search. Try clearing it."
            }
          />
        }
      />
    </>
  );
}
