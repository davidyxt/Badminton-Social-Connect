"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { DisputeScopeNotice } from "@/components/disputes/DisputeScopeNotice";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { ButtonLink } from "@/components/shared/Button";
import { DetailList, SectionHeading } from "@/components/shared/Card";
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
        description={`Match ${dispute.match_id}`}
      />

      <DisputeScopeNotice />

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_272px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="reason-heading">
            <SectionHeading title={<span id="reason-heading">Player&apos;s reason</span>} />
            <blockquote className="border-l-2 border-line-strong pl-4 text-sm leading-6 whitespace-pre-line text-ink">{dispute.reason}</blockquote>
          </section>

          <section aria-labelledby="match-heading">
            <SectionHeading
              title={<span id="match-heading">Match</span>}
              actions={
                match && (
                  <ButtonLink href={`/games/${match.match_id}`} size="sm" icon={<ExternalLink className="size-4" aria-hidden />}>
                    View game
                  </ButtonLink>
                )
              }
            />
            {!match ? (
              <p className="text-[13px] text-ink-muted">Match {dispute.match_id} could not be found.</p>
            ) : (
              <div className="space-y-6">
                <div className="grid overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-2 sm:divide-x sm:divide-line max-sm:divide-y max-sm:divide-line">
                  {(["A", "B"] as const).map((s) => (
                    <div key={s} className="px-4 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-[13px] text-ink-muted">
                        Side {s}
                        {result?.winning_side === s && <span className="text-xs font-medium text-ink">Submitted as winner</span>}
                      </div>
                      {side(s === "A" ? match.side_a : match.side_b)}
                    </div>
                  ))}
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
              </div>
            )}
          </section>

          {match && (
            <section aria-labelledby="result-heading" className="border-t border-line pt-6">
              <SectionHeading title={<span id="result-heading">Disputed result</span>} />
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
                <p className="text-[13px] text-ink-muted">No result has been submitted for this match.</p>
              )}
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-8 lg:border-l lg:border-line lg:pl-8">
          <section aria-labelledby="details-heading">
            <SectionHeading title={<span id="details-heading">Details</span>} />
            <DetailList
              columns={1}
              items={[
                { label: "Raised by", value: <PlayerLink player={data.raisedBy} fallbackId={dispute.raised_by} /> },
                { label: "Raised", value: formatDateTime(dispute.created_at) },
                { label: "Dispute ID", value: <span className="font-mono text-xs">{dispute.dispute_id}</span> },
              ]}
            />
          </section>

          {data.otherDisputes.length > 0 && (
            <section aria-labelledby="other-heading">
              <SectionHeading
                title={
                  <span id="other-heading">
                    Other disputes <span className="font-normal text-ink-faint tabular-nums">{data.otherDisputes.length}</span>
                  </span>
                }
              />
              <ul className="-mx-2">
                {data.otherDisputes.map((d) => (
                  <li key={d.dispute_id}>
                    <Link href={`/disputes/${d.dispute_id}`} className="flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-subtle">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-ink">{d.reason}</div>
                        <div className="text-xs text-ink-faint">{formatDateTime(d.created_at)}</div>
                      </div>
                      <StatusBadge status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="activity-heading">
            <SectionHeading title={<span id="activity-heading">Activity</span>} />
            <ActivityTimeline entries={data.activity} empty="No admin actions recorded on this dispute." />
          </section>
        </aside>
      </div>
    </>
  );
}
