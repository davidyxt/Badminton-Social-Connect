"use client";

import { SectionHeading } from "@/components/shared/Card";
import { ResultFlagList } from "@/components/shared/ResultFlagList";
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
    const side = (ids: string[]) =>
      ids.map((id) => names.get(id) ?? id).join(" & ");
    return db.matches.map((match) => {
      const disputes = db.disputes.filter((d) => d.match_id === match.match_id);
      return {
        match,
        sideA: side(match.side_a),
        sideB: side(match.side_b),
        result: selectResultForMatch(db, match.match_id),
        league: match.league_id
          ? (db.mini_leagues.find((l) => l.league_id === match.league_id)
              ?.name ?? `${match.league_id} (deleted)`)
          : null,
        openDisputes: disputes.filter((d) => d.status === "open").length,
        disputes: disputes.length,
      };
    });
  });

  const columns: Column<Row>[] = [
    {
      id: "players",
      header: "Match",
      sortValue: (r) => r.sideA,
      cell: (r) => (
        <div className="max-w-[300px] min-w-[200px]">
          <div className="font-medium text-ink">
            {r.sideA} <span className="font-normal text-ink-faint">vs</span>{" "}
            {r.sideB}
          </div>
          <div className="text-[13px] text-ink-muted">
            {humanize(r.match.format)} · {r.match.match_id}
          </div>
        </div>
      ),
    },
    {
      id: "time",
      header: "When & where",
      sortValue: (r) => r.match.proposed_time,
      cell: (r) => (
        <div className="max-w-[220px] min-w-0">
          <div className="whitespace-nowrap text-ink tabular-nums">
            {formatDateTime(r.match.proposed_time)}
          </div>
          <div
            className="truncate text-[13px] text-ink-muted"
            title={[r.match.venue, r.match.suburb].filter(Boolean).join(", ")}
          >
            {[r.match.venue, r.match.suburb].filter(Boolean).join(", ")}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.match.status,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <StatusBadge status={r.match.status} />
          {r.openDisputes > 0 ? (
            <div className="mt-0.5 text-[13px] text-danger">Dispute open</div>
          ) : r.disputes > 0 ? (
            <div className="mt-0.5 text-[13px] text-ink-muted">
              Dispute resolved
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "score",
      header: "Score",
      sortValue: (r) => r.result?.score ?? "",
      cell: (r) =>
        r.result ? (
          <span className="whitespace-nowrap tabular-nums">
            {r.result.score}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      id: "league",
      header: "League",
      sortValue: (r) => r.league ?? "",
      cell: (r) =>
        r.league ? (
          <div
            className="max-w-[170px] truncate text-ink-muted"
            title={r.league}
          >
            {r.league}
          </div>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
  ];

  const disputed = rows.filter((r) => r.openDisputes > 0).length;
  const flags = useQuery((db) =>
    [...db.result_flags].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
  );
  const statusOptions = [...new Set(rows.map((r) => r.match.status))].sort();

  return (
    <>
      <PageHeader
        title="Games & results"
        meta={<LiveIndicator />}
        description={`${rows.length} matches · ${disputed} with an open dispute · Read-only: results are confirmed by players.`}
      />
      <div className="space-y-8">
        {flags.length > 0 && (
          <section>
            <SectionHeading
              title={
                <>
                  Result flags{" "}
                  <span className="font-normal text-ink-faint tabular-nums">
                    {flags.length}
                  </span>
                </>
              }
              description="Unusual results the rating engine noticed. Informational only; flags never reject a result."
            />
            <ResultFlagList flags={flags.slice(0, 5)} linkToMatch />
            {flags.length > 5 && (
              <p className="mt-2 text-[13px] text-ink-faint">
                Showing the 5 most recent. Each game page lists its own flags.
              </p>
            )}
          </section>
        )}
        <section>
          {flags.length > 0 && <SectionHeading title="Matches" />}
          <DataTable
            caption="Matches"
            rows={rows}
            columns={columns}
            getRowId={(r) => r.match.match_id}
            rowHref={(r) => `/games/${r.match.match_id}`}
            getSearchText={(r) =>
              `${r.sideA} ${r.sideB} ${r.match.venue} ${r.match.suburb} ${r.league ?? ""} ${r.match.match_id}`
            }
            searchPlaceholder="Search player, venue or league"
            filters={[
              {
                id: "status",
                label: "Status",
                options: statusOptions.map((s) => ({
                  value: s,
                  label: humanize(s),
                })),
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
            empty={
              <EmptyState
                title="No matches found"
                description="Try a different search or clear the filters."
              />
            }
          />
        </section>
      </div>
    </>
  );
}
