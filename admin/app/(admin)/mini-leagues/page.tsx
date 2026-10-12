"use client";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlayerLink } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/format";
import { useQuery } from "@/lib/mock-api";
import type { MiniLeague, Player } from "@/lib/types";

interface Row {
  league: MiniLeague;
  organiser: Player | null;
  matches: number;
  openReports: number;
}

/** Screens 37 / 38: all Mini Leagues. */
export default function MiniLeaguesPage() {
  const rows = useQuery<Row[]>((db) => {
    const players = new Map(db.players.map((p) => [p.player_id, p]));
    return db.mini_leagues.map((league) => ({
      league,
      organiser: players.get(league.organiser_id) ?? null,
      matches: db.matches.filter((m) => m.league_id === league.league_id).length,
      openReports: db.reports.filter((r) => r.status === "pending" && r.target_type === "mini_league" && r.target_id === league.league_id).length,
    }));
  });

  const suspended = rows.filter((r) => r.league.status === "suspended").length;

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "Mini League",
      sortValue: (r) => r.league.name,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{r.league.name}</div>
          <div className="text-xs text-ink-muted capitalize">
            {r.league.format} · {r.league.suburb}
          </div>
        </div>
      ),
    },
    {
      id: "organiser",
      header: "Organiser",
      sortValue: (r) => r.organiser?.display_name ?? "",
      cell: (r) => <PlayerLink player={r.organiser} fallbackId={r.league.organiser_id} />,
    },
    { id: "status", header: "Status", sortValue: (r) => r.league.status, cell: (r) => <StatusBadge status={r.league.status} /> },
    {
      id: "members",
      header: "Members",
      align: "right",
      sortValue: (r) => r.league.member_ids.length,
      cell: (r) => (r.league.max_members === null ? `${r.league.member_ids.length}` : `${r.league.member_ids.length}/${r.league.max_members}`),
    },
    { id: "matches", header: "Matches", align: "right", sortValue: (r) => r.matches, cell: (r) => r.matches },
    {
      id: "dates",
      header: "Dates",
      sortValue: (r) => r.league.start_date,
      cell: (r) => `${formatDate(r.league.start_date)} – ${formatDate(r.league.end_date)}`,
      className: "whitespace-nowrap",
    },
    {
      id: "reports",
      header: "Open reports",
      align: "right",
      sortValue: (r) => r.openReports,
      cell: (r) => (r.openReports ? <span className="font-medium text-warning">{r.openReports}</span> : <span className="text-ink-faint">0</span>),
    },
  ];

  return (
    <>
      <PageHeader title="Mini Leagues" description={`${rows.length} leagues · ${suspended} suspended. Open a league to see members, standings and matches.`} />
      <DataTable
        caption="Mini Leagues"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.league.league_id}
        rowHref={(r) => `/mini-leagues/${r.league.league_id}`}
        getSearchText={(r) => `${r.league.name} ${r.organiser?.display_name ?? ""} ${r.league.suburb} ${r.league.league_id}`}
        searchPlaceholder="Search league, organiser or suburb"
        filters={[
          {
            id: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "registration_closed", label: "Registration closed" },
              { value: "suspended", label: "Suspended" },
            ],
            getValue: (r) => r.league.status,
          },
          {
            id: "format",
            label: "Format",
            options: [
              { value: "singles", label: "Singles" },
              { value: "doubles", label: "Doubles" },
            ],
            getValue: (r) => r.league.format,
          },
        ]}
        initialSort={{ columnId: "dates", direction: "desc" }}
        empty={<EmptyState title="No Mini Leagues match" description="Try a different search or clear the filters." />}
      />
    </>
  );
}
