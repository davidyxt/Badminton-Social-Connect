"use client";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PlayerLink } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useQuery } from "@/lib/mock-api";
import type { Player, Ranking } from "@/lib/types";

interface Row {
  rank: number;
  ranking: Ranking;
  player: Player | null;
}

/** Screen 15 (read-only). */
export default function SinglesRankingsPage() {
  const rows = useQuery<Row[]>((db) => {
    const players = new Map(db.players.map((p) => [p.player_id, p]));
    return db.rankings
      .filter((r) => r.format === "singles")
      .sort((a, b) => b.ranking_points - a.ranking_points)
      .map((ranking, i) => ({ rank: i + 1, ranking, player: players.get(ranking.player_id) ?? null }));
  });

  const columns: Column<Row>[] = [
    { id: "rank", header: "#", align: "right", sortValue: (r) => r.rank, cell: (r) => <span className="text-ink-muted">{r.rank}</span>, className: "w-14" },
    { id: "player", header: "Player", sortValue: (r) => r.player?.display_name ?? r.ranking.player_id, cell: (r) => <PlayerLink player={r.player} fallbackId={r.ranking.player_id} /> },
    { id: "band", header: "Band", sortValue: (r) => r.ranking.band, cell: (r) => r.ranking.band },
    { id: "points", header: "Points", align: "right", sortValue: (r) => r.ranking.ranking_points, cell: (r) => <span className="font-medium text-ink">{r.ranking.ranking_points.toLocaleString("en-AU")}</span> },
    { id: "verified", header: "Verified games", align: "right", sortValue: (r) => r.ranking.verified_games_count, cell: (r) => r.ranking.verified_games_count },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.player?.status ?? "",
      cell: (r) => (r.player ? <StatusBadge status={r.player.status} tone={r.player.status === "active" ? "neutral" : undefined} /> : <span className="text-ink-faint">—</span>),
    },
  ];

  return (
    <>
      <p className="mb-3 text-[13px] text-ink-muted">
        <span className="tabular-nums">{rows.length}</span> ranked players · points from verified results · Band A 1600+, B 1300–1599, C below 1300
      </p>
      <DataTable
        caption="Singles rankings"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.ranking.player_id}
        rowHref={(r) => `/users/${r.ranking.player_id}`}
        getSearchText={(r) => `${r.player?.display_name ?? ""} ${r.ranking.player_id}`}
        searchPlaceholder="Search player"
        filters={[
          {
            id: "band",
            label: "Band",
            options: ["A", "B", "C"].map((b) => ({ value: b, label: `Band ${b}` })),
            getValue: (r) => r.ranking.band,
          },
        ]}
        initialSort={{ columnId: "rank", direction: "asc" }}
        pageSize={15}
        empty={<EmptyState title="No players match" description="Try a different search or clear the band filter." />}
      />
    </>
  );
}
