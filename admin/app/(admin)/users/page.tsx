"use client";

import { BackendGapNotice } from "@/components/shared/BackendGapNotice";
import { featureGap } from "@/lib/api/capabilities";
import { BadgeCheck } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Avatar, reliabilityTone } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/format";
import { useQuery } from "@/lib/mock-api";
import type { Player, PlayerProfile } from "@/lib/types";

interface Row {
  player: Player;
  profile: PlayerProfile | null;
  openReports: number;
}

/** Screen 08 */
export default function UsersPage() {
  const rows = useQuery<Row[]>((db) => {
    const profiles = new Map(db.player_profiles.map((p) => [p.player_id, p]));
    return db.players.map((player) => ({
      player,
      profile: profiles.get(player.player_id) ?? null,
      openReports: db.reports.filter((r) => r.status === "pending" && r.target_type === "player" && r.target_id === player.player_id).length,
    }));
  });

  const suspended = rows.filter((r) => r.player.status === "suspended").length;

  const columns: Column<Row>[] = [
    {
      id: "player",
      header: "Player",
      sortValue: (r) => r.player.display_name,
      cell: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.player.display_name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-ink">
              {r.player.display_name}
              {r.player.is_verified && <BadgeCheck className="size-4 text-brand" aria-label="Verified" />}
            </div>
            <div className="truncate text-xs text-ink-muted">
              {r.player.email}
              {r.profile && ` · ${r.profile.suburb}, ${r.profile.state}`}
            </div>
          </div>
        </div>
      ),
    },
    { id: "status", header: "Status", sortValue: (r) => r.player.status, cell: (r) => <StatusBadge status={r.player.status} /> },
    { id: "band", header: "Rating band", sortValue: (r) => r.player.self_rating_band, cell: (r) => r.player.self_rating_band },
    {
      id: "reliability",
      header: "Reliability",
      align: "right",
      sortValue: (r) => r.profile?.reliability_score ?? -1,
      cell: (r) =>
        r.profile ? <span className={`font-medium ${reliabilityTone(r.profile.reliability_score)}`}>{r.profile.reliability_score}%</span> : "—",
    },
    { id: "games", header: "Games", align: "right", sortValue: (r) => r.profile?.games_played ?? 0, cell: (r) => r.profile?.games_played ?? "—" },
    {
      id: "noshows",
      header: "No-shows",
      align: "right",
      sortValue: (r) => r.profile?.no_show_count ?? 0,
      cell: (r) => <span className={(r.profile?.no_show_count ?? 0) >= 3 ? "font-medium text-danger" : ""}>{r.profile?.no_show_count ?? "—"}</span>,
    },
    {
      id: "reports",
      header: "Reports",
      align: "right",
      sortValue: (r) => r.openReports,
      cell: (r) => (r.openReports ? <span className="font-medium text-warning">{r.openReports}</span> : <span className="text-ink-faint">0</span>),
    },
    { id: "joined", header: "Joined", sortValue: (r) => r.player.joined_at, cell: (r) => formatDate(r.player.joined_at), className: "whitespace-nowrap" },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description={`${rows.length} players · ${suspended} suspended. Search, filter and open a profile to review or take action.`}
      />
      <BackendGapNotice message={featureGap("suspension")} />
      <DataTable
        caption="Players"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.player.player_id}
        rowHref={(r) => `/users/${r.player.player_id}`}
        getSearchText={(r) => `${r.player.display_name} ${r.player.email} ${r.profile?.suburb ?? ""} ${r.player.player_id}`}
        searchPlaceholder="Search name, email or suburb"
        filters={[
          {
            id: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
            ],
            getValue: (r) => r.player.status,
          },
          {
            id: "band",
            label: "Band",
            options: ["Beginner", "Intermediate", "Advanced"].map((b) => ({ value: b, label: b })),
            getValue: (r) => r.player.self_rating_band,
          },
          {
            id: "verified",
            label: "Verified",
            options: [
              { value: "yes", label: "Verified" },
              { value: "no", label: "Not verified" },
            ],
            getValue: (r) => (r.player.is_verified ? "yes" : "no"),
          },
        ]}
        initialSort={{ columnId: "player", direction: "asc" }}
        empty={<EmptyState title="No players match" description="Try a different search or clear the filters." />}
      />
    </>
  );
}
