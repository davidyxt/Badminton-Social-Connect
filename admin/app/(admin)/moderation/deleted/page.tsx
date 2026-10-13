"use client";

import { Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PlayerLink } from "@/components/shared/PlayerProfileCard";
import { formatDateTime, TARGET_TYPE_LABEL } from "@/lib/format";
import { useQuery } from "@/lib/mock-api";
import type { DeletedRecord, Player } from "@/lib/types";

interface Row {
  record: DeletedRecord;
  owner: Player | null;
}

/** Screen 26: read-only. Deleted content can't be restored. */
export default function DeletedRecordsPage() {
  const rows = useQuery<Row[]>((db) => {
    const players = new Map(db.players.map((p) => [p.player_id, p]));
    return db.deleted_records.map((record) => ({
      record,
      owner: players.get(record.owner_id) ?? null,
    }));
  });

  const columns: Column<Row>[] = [
    {
      id: "label",
      header: "Record",
      sortValue: (r) => r.record.label,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{r.record.label}</div>
          <div className="text-[13px] text-ink-muted">
            {TARGET_TYPE_LABEL[r.record.target_type]} · <span className="font-mono text-xs text-ink-faint">{r.record.target_id}</span>
          </div>
        </div>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      sortValue: (r) => r.owner?.display_name ?? r.record.owner_id,
      cell: (r) => <PlayerLink player={r.owner} fallbackId={r.record.owner_id} />,
    },
    { id: "reason", header: "Reason", cell: (r) => <span className="line-clamp-2 max-w-sm text-ink-muted">{r.record.reason}</span> },
    {
      id: "deleted",
      header: "Deleted",
      sortValue: (r) => r.record.deleted_at,
      cell: (r) => formatDateTime(r.record.deleted_at),
      className: "whitespace-nowrap",
    },
  ];

  return (
    <>
      <p className="mb-3 text-[13px] text-ink-muted">Read-only record of removed game posts and Mini Leagues. Deleted content can&apos;t be restored.</p>
      <DataTable
        caption="Deleted records"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.record.deleted_id}
        getSearchText={(r) => `${r.record.label} ${r.owner?.display_name ?? ""} ${r.record.reason} ${r.record.target_id}`}
        searchPlaceholder="Search title, owner or reason"
        filters={[
          {
            id: "type",
            label: "Type",
            options: [
              { value: "game_post", label: "Game post" },
              { value: "mini_league", label: "Mini League" },
            ],
            getValue: (r) => r.record.target_type,
          },
        ]}
        initialSort={{ columnId: "deleted", direction: "desc" }}
        empty={<EmptyState icon={<Trash2 aria-hidden />} title="No deleted records" description="Nothing matches, or nothing has been deleted yet." />}
      />
    </>
  );
}
