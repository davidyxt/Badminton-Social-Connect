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

/** Slightly tighter cell padding so all eight columns fit at 1280px without horizontal scroll. */
const TIGHT = "px-3!";

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
      className: TIGHT,
      header: "Player",
      sortValue: (r) => r.player.display_name,
      cell: (r) => (
        <div className="flex max-w-[216px] items-center gap-3">
          <Avatar name={r.player.display_name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-ink">
              <span className="truncate">{r.player.display_name}</span>
              {r.player.is_verified && <BadgeCheck className="size-3.5 shrink-0 text-brand" aria-label="Verified" />}
            </div>
            {/* Location stays searchable and is on the profile; the email alone keeps the column narrow. */}
            <div className="truncate text-[13px] text-ink-muted" title={[r.profile?.suburb, r.profile?.state].filter(Boolean).join(", ") || undefined}>
              {r.player.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      className: TIGHT,
      header: "Status",
      sortValue: (r) => `${r.player.registration_state}-${r.player.status}`,
      // Only a suspension gets colour; routine and lifecycle states stay quiet.
      cell: (r) =>
        r.player.registration_state === "deleted" ? (
          <StatusBadge status="deleted" label="Deleted" />
        ) : r.player.registration_state === "registration_pending" ? (
          <StatusBadge status="pending" label="Registration pending" tone="neutral" />
        ) : (
          <StatusBadge status={r.player.status} />
        ),
    },
    { id: "band", header: "Band", className: `${TIGHT} whitespace-nowrap`, sortValue: (r) => r.player.self_rating_band, cell: (r) => r.player.self_rating_band },
    {
      id: "reliability",
      className: TIGHT,
      header: "Reliability",
      align: "right",
      sortValue: (r) => r.profile?.reliability_score ?? -1,
      cell: (r) =>
        r.profile ? (
          <span className={r.profile.reliability_score >= 85 ? "text-ink" : `font-medium ${reliabilityTone(r.profile.reliability_score)}`}>
            {r.profile.reliability_score}%
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    { id: "games", header: "Games", className: TIGHT, align: "right", sortValue: (r) => r.profile?.games_played ?? 0, cell: (r) => r.profile?.games_played ?? "—" },
    {
      id: "noshows",
      className: TIGHT,
      header: "No-shows",
      align: "right",
      sortValue: (r) => r.profile?.no_show_count ?? 0,
      cell: (r) => {
        const n = r.profile?.no_show_count;
        if (n === undefined) return <span className="text-ink-faint">—</span>;
        return <span className={n >= 3 ? "font-medium text-danger" : n === 0 ? "text-ink-faint" : ""}>{n}</span>;
      },
    },
    {
      id: "reports",
      className: TIGHT,
      header: "Reports",
      align: "right",
      sortValue: (r) => r.openReports,
      cell: (r) => (r.openReports ? <span className="font-medium text-warning">{r.openReports}</span> : <span className="text-ink-faint">0</span>),
    },
    {
      id: "joined",
      header: "Joined",
      align: "right",
      sortValue: (r) => r.player.joined_at,
      cell: (r) => <span className="text-ink-muted">{formatDate(r.player.joined_at)}</span>,
      className: `whitespace-nowrap ${TIGHT}`,
    },
  ];

  return (
    <>
      <PageHeader title="Users" description={`${rows.length} players · ${suspended} suspended`} />
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
            id: "account",
            label: "Account",
            options: [
              { value: "registered", label: "Registered" },
              { value: "registration_pending", label: "Registration pending" },
              { value: "deleted", label: "Deleted" },
            ],
            getValue: (r) => r.player.registration_state,
          },
          {
            id: "band",
            label: "Band",
            options: [...new Set(rows.map((r) => r.player.self_rating_band))].sort().map((b) => ({ value: b, label: b })),
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
