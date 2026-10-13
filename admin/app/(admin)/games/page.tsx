"use client";

import { Card, CardBody, CardHeader } from "@/components/shared/Card";
import { ResultFlagList } from "@/components/shared/ResultFlagList";
import { Scale } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime, humanize } from "@/lib/format";
import { selectResultForMatch, useQuery } from "@/lib/mock-api";
import type { Match, MatchResult } from "@/lib/types";

interface Row {
  match: Match;
  sideA: string;
  sideB: string;
  result: MatchResult | null;
  league: string | null;
  openDisputes: number;
  disputes: number;
}

/** Screen 43 (read-only). */
export default function GamesPage() {
  const rows = useQuery<Row[]>((db) => {
    const names = new Map(db.players.map((p) => [p.player_id, p.display_name]));
    const side = (ids: string[]) => ids.map((id) => names.get(id) ?? id).join(" & ");
    return db.matches.map((match) => {
      const disputes = db.disputes.filter((d) => d.match_id === match.match_id);
      return {
        match,
        sideA: side(match.side_a),
        sideB: side(match.side_b),
        result: selectResultForMatch(db, match.match_id),
        league: match.league_id ? (db.mini_leagues.find((l) => l.league_id === match.league_id)?.name ?? `${match.league_id} (deleted)`) : null,
        openDisputes: disputes.filter((d) => d.status === "open").length,
        disputes: disputes.length,
      };
    });
  });

  const columns: Column<Row>[] = [
    {
      id: "players",
      header: "Players",
      sortValue: (r) => r.sideA,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">
            {r.sideA} <span className="font-normal text-ink-faint">vs</span> {r.sideB}
          </div>
          <div className="text-xs text-ink-muted">{r.match.match_id}</div>
        </div>
      ),
    },
    { id: "format", header: "Format", sortValue: (r) => r.match.format, cell: (r) => humanize(r.match.format) },
    {
      id: "venue",
      header: "Venue",
      sortValue: (r) => r.match.suburb,
      cell: (r) => (
        <div className="min-w-0">
          <div className="max-w-[200px] truncate text-ink">{r.match.venue}</div>
          <div className="text-xs text-ink-muted">{r.match.suburb}</div>
        </div>
      ),
    },
    { id: "time", header: "Time", sortValue: (r) => r.match.proposed_time, cell: (r) => formatDateTime(r.match.proposed_time), className: "whitespace-nowrap" },
    { id: "status", header: "Status", sortValue: (r) => r.match.status, cell: (r) => <StatusBadge status={r.match.status} /> },
    {
      id: "score",
      header: "Score",
      sortValue: (r) => r.result?.score ?? "",
      cell: (r) => (r.result ? <span className="whitespace-nowrap tabular-nums">{r.result.score}</span> : <span className="text-ink-faint">—</span>),
    },
    { id: "league", header: "League", sortValue: (r) => r.league ?? "", cell: (r) => r.league ?? <span className="text-ink-faint">—</span> },
    {
      id: "dispute",
      header: "Dispute",
      sortValue: (r) => r.openDisputes * 10 + r.disputes,
      cell: (r) =>
        r.openDisputes ? (
          <span className="inline-flex items-center gap-1 font-medium text-danger">
            <Scale className="size-3.5" aria-hidden />
            Open
          </span>
        ) : r.disputes ? (
          <span className="text-ink-muted">Resolved</span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
  ];

  const disputed = rows.filter((r) => r.openDisputes > 0).length;
  const flags = useQuery((db) => [...db.result_flags].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  const statusOptions = [...new Set(rows.map((r) => r.match.status))].sort();

  return (
    <>
      <PageHeader
        title="Games & results"
        meta={<LiveIndicator />}
        description={`${rows.length} matches · ${disputed} with an open dispute. Read-only: results are confirmed by players.`}
      />
      {flags.length > 0 && (
        <Card className="mb-5">
          <CardHeader
            title={`Result flags (${flags.length})`}
            description="Unusual results the rating engine noticed. Informational only: flags never reject a result, and there's nothing to resolve here."
          />
          <CardBody>
            <ResultFlagList flags={flags.slice(0, 5)} linkToMatch />
            {flags.length > 5 && <p className="mt-3 text-xs text-ink-muted">Showing the 5 most recent. Each game page lists its own flags.</p>}
          </CardBody>
        </Card>
      )}
      <DataTable
        caption="Matches"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.match.match_id}
        rowHref={(r) => `/games/${r.match.match_id}`}
        getSearchText={(r) => `${r.sideA} ${r.sideB} ${r.match.venue} ${r.match.suburb} ${r.league ?? ""} ${r.match.match_id}`}
        searchPlaceholder="Search player, venue or league"
        filters={[
          {
            id: "status",
            label: "Status",
            options: statusOptions.map((s) => ({ value: s, label: humanize(s) })),
            getValue: (r) => r.match.status,
          },
          {
            id: "format",
            label: "Format",
            options: [
              { value: "singles", label: "Singles" },
              { value: "doubles", label: "Doubles" },
            ],
            getValue: (r) => r.match.format,
          },
        ]}
        initialSort={{ columnId: "time", direction: "desc" }}
        empty={<EmptyState title="No matches found" description="Try a different search or clear the filters." />}
      />
    </>
  );
}
