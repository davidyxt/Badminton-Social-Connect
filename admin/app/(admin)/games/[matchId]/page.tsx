"use client";

import { ResultFlagList } from "@/components/shared/ResultFlagList";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { Card, CardBody, CardHeader, DetailList, Notice } from "@/components/shared/Card";
import { GamePostSummary } from "@/components/shared/ContentSummaries";
import { RecordNotFound } from "@/components/shared/NotFound";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlayerLink } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime, humanize } from "@/lib/format";
import {
  selectDisputesForMatch,
  selectFlagsForMatch,
  selectGamePost,
  selectMatch,
  selectMiniLeague,
  selectPlayer,
  selectPlayerMap,
  selectResultForMatch,
  useQuery,
} from "@/lib/mock-api";
import type { Player } from "@/lib/types";

function Side({ label, ids, players, winner }: { label: string; ids: string[]; players: Map<string, Player>; winner: boolean }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-ink-faint uppercase">{label}</span>
        {winner && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <Trophy className="size-3.5" aria-hidden />
            Winner
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {ids.map((id) => (
          <li key={id}>
            <PlayerLink player={players.get(id)} fallbackId={id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Screen 44 (read-only). */
export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();

  const data = useQuery((db) => {
    const match = selectMatch(db, matchId);
    if (!match) return null;
    const result = selectResultForMatch(db, matchId);
    const post = match.post_id ? selectGamePost(db, match.post_id) : null;
    return {
      match,
      result,
      players: selectPlayerMap(db),
      submittedBy: result ? selectPlayer(db, result.submitted_by) : null,
      confirmedBy: result ? selectPlayer(db, result.confirmed_by) : null,
      flags: selectFlagsForMatch(db, matchId),
      disputes: selectDisputesForMatch(db, matchId),
      league: match.league_id ? selectMiniLeague(db, match.league_id) : null,
      post,
      organiser: post ? selectPlayer(db, post.organiser_id) : null,
    };
  });

  if (!data) return <RecordNotFound what="Match" backHref="/games" backLabel="Back to games" />;

  const { match, result, players, disputes, league, post } = data;
  const name = (ids: string[]) => ids.map((id) => players.get(id)?.display_name ?? id).join(" & ");
  const openDisputes = disputes.filter((d) => d.status === "open");

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Games & results", href: "/games" }, { label: match.match_id }]}
        title={`${name(match.side_a)} vs ${name(match.side_b)}`}
        meta={<StatusBadge status={match.status} />}
        description={[humanize(match.format), [match.venue, match.suburb].filter(Boolean).join(", "), formatDateTime(match.proposed_time)].join(" · ")}
      />

      <div className="mb-5 space-y-3">
        {openDisputes.length > 0 && (
          <Notice tone="danger" title="Result disputed">
            {openDisputes.length === 1 ? "A dispute about this result is open. " : `${openDisputes.length} disputes about this result are open. `}
            {openDisputes.map((d, i) => (
              <span key={d.dispute_id}>
                {i > 0 && ", "}
                <Link href={`/disputes/${d.dispute_id}`} className="font-medium underline">
                  Review {d.dispute_id}
                </Link>
              </span>
            ))}
          </Notice>
        )}
        <Notice>Results are confirmed by the players. Administrators can&apos;t approve or edit them; disputed results are handled in Disputes.</Notice>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Participants" />
            <CardBody>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Side label="Side A" ids={match.side_a} players={players} winner={result?.winning_side === "A"} />
                <Side label="Side B" ids={match.side_b} players={players} winner={result?.winning_side === "B"} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Result" />
            <CardBody>
              {result ? (
                <DetailList
                  items={[
                    { label: "Score", value: <span className="font-medium tabular-nums">{result.score}</span> },
                    { label: "Result status", value: <StatusBadge status={result.status} /> },
                    {
                      label: "Winning side",
                      value: result.winning_side ? `Side ${result.winning_side} (${name(result.winning_side === "A" ? match.side_a : match.side_b)})` : "—",
                    },
                    {
                      label: "Games",
                      value:
                        result.games.length > 0 ? (
                          <span className="tabular-nums">{result.games.map(([a, b], i) => `Game ${i + 1}: ${a}–${b}`).join(" · ")}</span>
                        ) : (
                          "—"
                        ),
                    },
                    { label: "Submitted by", value: <PlayerLink player={data.submittedBy} fallbackId={result.submitted_by} /> },
                    { label: "Submitted", value: formatDateTime(result.submitted_at) },
                    {
                      label: "Confirmed by",
                      value: result.confirmed_by ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <PlayerLink player={data.confirmedBy} fallbackId={result.confirmed_by} />
                          <span className="text-ink-muted">{formatDateTime(result.confirmed_at)}</span>
                        </span>
                      ) : result.status === "expired" ? (
                        "Not confirmed before it expired"
                      ) : (
                        "Not confirmed yet"
                      ),
                    },
                    {
                      label: "Counts towards rankings",
                      value: result.excluded_from_ranking ? <StatusBadge status="excluded" label="Excluded" tone="neutral" /> : result.status === "confirmed" ? "Yes" : "Only once confirmed",
                    },
                  ]}
                />
              ) : (
                <p className="text-sm text-ink-muted">{match.status === "scheduled" ? "This match hasn't been played yet." : "No result has been submitted yet."}</p>
              )}
            </CardBody>
          </Card>

          {post && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">Originating game post</h2>
              <GamePostSummary post={post} organiser={data.organiser} />
            </div>
          )}
          {match.post_id && !post && (
            <Notice>The originating game post ({match.post_id}) has been deleted.</Notice>
          )}
        </div>

        <div className="space-y-6">
          {data.flags.length > 0 && (
            <Card>
              <CardHeader title={`Result flags (${data.flags.length})`} description="Noticed by the rating engine. Informational only: a flag never rejects a result." />
              <CardBody>
                <ResultFlagList flags={data.flags} />
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title={`Disputes (${disputes.length})`} />
            {disputes.length === 0 ? (
              <CardBody>
                <p className="text-sm text-ink-muted">No disputes raised.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {disputes.map((d) => (
                  <li key={d.dispute_id}>
                    <Link href={`/disputes/${d.dispute_id}`} className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-subtle">
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm text-ink">{d.reason}</div>
                        <div className="text-xs text-ink-muted">
                          {(d.raised_by && players.get(d.raised_by)?.display_name) ?? d.raised_by ?? "Unknown"} · {formatDateTime(d.created_at)}
                        </div>
                      </div>
                      <StatusBadge status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Mini League" />
            <CardBody>
              {league ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/mini-leagues/${league.league_id}`} className="text-sm font-medium text-ink hover:text-brand hover:underline">
                    {league.name}
                  </Link>
                  <StatusBadge status={league.status} />
                </div>
              ) : match.league_id ? (
                <p className="text-sm text-ink-muted">League {match.league_id} has been deleted.</p>
              ) : (
                <p className="text-sm text-ink-muted">Not a league match.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
