"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { DisputeScopeNotice } from "@/components/disputes/DisputeScopeNotice";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { ButtonLink } from "@/components/shared/Button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/shared/Card";
import { RecordNotFound } from "@/components/shared/NotFound";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlayerLink } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime, humanize } from "@/lib/format";
import {
  selectActivityFor,
  selectDisputesForMatch,
  selectMatch,
  selectMiniLeague,
  selectPlayer,
  selectPlayerMap,
  selectResult,
  selectResultForMatch,
  useQuery,
} from "@/lib/mock-api";

/** NEW (no Figma design): read-only dispute detail. Final v6 gives administrators no dispute decision. */
export default function DisputeDetailPage() {
  const { disputeId } = useParams<{ disputeId: string }>();

  const data = useQuery((db) => {
    const dispute = db.disputes.find((d) => d.dispute_id === disputeId);
    if (!dispute) return null;
    const match = selectMatch(db, dispute.match_id);
    const players = selectPlayerMap(db);
    // Disputes now point at the exact submission being disputed; fall back for older rows.
    const result = selectResult(db, dispute.result_id) ?? (match ? selectResultForMatch(db, match.match_id) : null);
    return {
      dispute,
      match,
      players,
      raisedBy: selectPlayer(db, dispute.raised_by),
      result,
      submittedBy: result ? selectPlayer(db, result.submitted_by) : null,
      league: match?.league_id ? selectMiniLeague(db, match.league_id) : null,
      otherDisputes: match ? selectDisputesForMatch(db, match.match_id).filter((d) => d.dispute_id !== dispute.dispute_id) : [],
      activity: selectActivityFor(db, "dispute", dispute.dispute_id),
    };
  });

  if (!data) return <RecordNotFound what="Dispute" backHref="/disputes" backLabel="Back to disputes" />;
  const { dispute, match, result, league } = data;

  const side = (ids: string[]) => (
    <div className="flex flex-col gap-1.5">
      {ids.map((id) => (
        <PlayerLink key={id} player={data.players.get(id)} fallbackId={id} />
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Disputes", href: "/disputes" }, { label: dispute.dispute_id }]}
        title="Result dispute"
        meta={<StatusBadge status={dispute.status} />}
        description={`Raised ${formatDateTime(dispute.created_at)} · match ${dispute.match_id}`}
      />

      <DisputeScopeNotice />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Dispute" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Raised by", value: <PlayerLink player={data.raisedBy} fallbackId={dispute.raised_by} /> },
                  { label: "Raised", value: formatDateTime(dispute.created_at) },
                  { label: "Dispute ID", value: <span className="font-mono text-xs">{dispute.dispute_id}</span> },
                  { label: "Status", value: <StatusBadge status={dispute.status} /> },
                ]}
              />
              <div className="mt-4">
                <div className="text-xs font-medium tracking-wide text-ink-faint uppercase">Player&apos;s reason</div>
                <blockquote className="mt-1 rounded-lg border-l-4 border-line-strong bg-subtle px-4 py-3 text-sm text-ink">{dispute.reason}</blockquote>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Match"
              actions={
                match && (
                  <ButtonLink href={`/games/${match.match_id}`} size="sm" icon={<ExternalLink className="size-4" aria-hidden />}>
                    View game
                  </ButtonLink>
                )
              }
            />
            <CardBody>
              {!match ? (
                <p className="text-sm text-ink-muted">Match {dispute.match_id} could not be found.</p>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-line px-4 py-3">
                      <div className="mb-2 flex items-center justify-between text-xs font-medium tracking-wide text-ink-faint uppercase">
                        Side A
                        {result?.winning_side === "A" && <span className="normal-case tracking-normal text-ink-muted">Submitted as winner</span>}
                      </div>
                      {side(match.side_a)}
                    </div>
                    <div className="rounded-lg border border-line px-4 py-3">
                      <div className="mb-2 flex items-center justify-between text-xs font-medium tracking-wide text-ink-faint uppercase">
                        Side B
                        {result?.winning_side === "B" && <span className="normal-case tracking-normal text-ink-muted">Submitted as winner</span>}
                      </div>
                      {side(match.side_b)}
                    </div>
                  </div>
                  <DetailList
                    items={[
                      { label: "Venue", value: [match.venue, match.suburb].filter(Boolean).join(", ") },
                      { label: "Time", value: formatDateTime(match.proposed_time) },
                      { label: "Format", value: humanize(match.format) },
                      {
                        label: "Mini League",
                        value: league ? (
                          <Link href={`/mini-leagues/${league.league_id}`} className="font-medium text-ink hover:text-brand hover:underline">
                            {league.name}
                          </Link>
                        ) : match.league_id ? (
                          <span className="text-ink-faint">{match.league_id} (deleted)</span>
                        ) : (
                          "Not a league match"
                        ),
                      },
                      { label: "Match status", value: <StatusBadge status={match.status} /> },
                    ]}
                  />
                  <div className="border-t border-line pt-4">
                    <div className="mb-3 text-sm font-semibold text-ink">Disputed result</div>
                    {result ? (
                      <DetailList
                        items={[
                          { label: "Score", value: <span className="font-medium tabular-nums">{result.score}</span> },
                          { label: "Result status", value: <StatusBadge status={result.status} /> },
                          { label: "Submitted by", value: <PlayerLink player={data.submittedBy} fallbackId={result.submitted_by} /> },
                          { label: "Submitted", value: formatDateTime(result.submitted_at) },
                        ]}
                      />
                    ) : (
                      <p className="text-sm text-ink-muted">No result has been submitted for this match.</p>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {data.otherDisputes.length > 0 && (
            <Card>
              <CardHeader title={`Other disputes (${data.otherDisputes.length})`} description="On the same match." />
              <ul className="divide-y divide-line">
                {data.otherDisputes.map((d) => (
                  <li key={d.dispute_id}>
                    <Link href={`/disputes/${d.dispute_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-subtle">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{d.reason}</div>
                        <div className="text-xs text-ink-muted">{formatDateTime(d.created_at)}</div>
                      </div>
                      <StatusBadge status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <ActivityTimeline entries={data.activity} empty="No admin actions recorded on this dispute." />
            </CardBody>
          </Card>
        </div>
      </div>

    </>
  );
}
