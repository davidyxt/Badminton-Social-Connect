"use client";

import { ResultFlagList } from "@/components/shared/ResultFlagList";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Info } from "lucide-react";
import {
  Card,
  DetailList,
  Notice,
  SectionHeading,
} from "@/components/shared/Card";
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

/** One row of the scoreboard: the side's players, its per-game points and a winner mark. */
function SideRow({
  label,
  ids,
  players,
  winner,
  points,
}: {
  label: string;
  ids: string[];
  players: Map<string, Player>;
  winner: boolean;
  points: number[];
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="w-14 shrink-0 text-[13px] text-ink-muted">{label}</div>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-1.5">
        {ids.map((id) => (
          <li key={id}>
            <PlayerLink player={players.get(id)} fallbackId={id} />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-4 sm:justify-end">
        {winner && (
          <span className="text-xs font-medium text-success">Winner</span>
        )}
        {points.length > 0 && (
          <div className="flex gap-1">
            {points.map((pt, i) => (
              <span
                key={i}
                className={`w-8 text-right text-sm tabular-nums ${winner ? "font-semibold text-ink" : "text-ink-muted"}`}
              >
                {pt}
              </span>
            ))}
          </div>
        )}
      </div>
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

  if (!data)
    return (
      <RecordNotFound
        what="Match"
        backHref="/games"
        backLabel="Back to games"
      />
    );

  const { match, result, players, disputes, league, post } = data;
  const name = (ids: string[]) =>
    ids.map((id) => players.get(id)?.display_name ?? id).join(" & ");
  const openDisputes = disputes.filter((d) => d.status === "open");

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Games & results", href: "/games" },
          { label: match.match_id },
        ]}
        title={`${name(match.side_a)} vs ${name(match.side_b)}`}
        meta={<StatusBadge status={match.status} />}
        description={[
          humanize(match.format),
          [match.venue, match.suburb].filter(Boolean).join(", "),
          formatDateTime(match.proposed_time),
        ].join(" · ")}
      />

      <div className="space-y-8">
        {openDisputes.length > 0 && (
          <Notice tone="danger" title="Result disputed">
            {openDisputes.length === 1
              ? "A dispute about this result is open. "
              : `${openDisputes.length} disputes about this result are open. `}
            {openDisputes.map((d, i) => (
              <span key={d.dispute_id}>
                {i > 0 && ", "}
                <Link
                  href={`/disputes/${d.dispute_id}`}
                  className="font-medium underline"
                >
                  Review {d.dispute_id}
                </Link>
              </span>
            ))}
          </Notice>
        )}

        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-3">
          <div className="min-w-0 space-y-8 lg:col-span-2">
            <section>
              <Card>
                <div className="divide-y divide-line">
                  <SideRow
                    label="Side A"
                    ids={match.side_a}
                    players={players}
                    winner={result?.winning_side === "A"}
                    points={result ? result.games.map(([a]) => a) : []}
                  />
                  <SideRow
                    label="Side B"
                    ids={match.side_b}
                    players={players}
                    winner={result?.winning_side === "B"}
                    points={result ? result.games.map(([, b]) => b) : []}
                  />
                </div>
              </Card>
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-faint">
                <Info className="size-3.5 shrink-0" aria-hidden />
                Read-only. Results are confirmed by players; disputed results
                are handled in Disputes.
              </p>
            </section>

            <section>
              <SectionHeading title="Result" />
              {result ? (
                <DetailList
                  items={[
                    {
                      label: "Score",
                      value: (
                        <span className="font-medium tabular-nums">
                          {result.score}
                        </span>
                      ),
                    },
                    {
                      label: "Result status",
                      value: <StatusBadge status={result.status} />,
                    },
                    {
                      label: "Winning side",
                      value: result.winning_side
                        ? `Side ${result.winning_side} (${name(result.winning_side === "A" ? match.side_a : match.side_b)})`
                        : "—",
                    },
                    {
                      label: "Games",
                      value:
                        result.games.length > 0 ? (
                          <span className="tabular-nums">
                            {result.games
                              .map(([a, b], i) => `Game ${i + 1}: ${a}–${b}`)
                              .join(" · ")}
                          </span>
                        ) : (
                          "—"
                        ),
                    },
                    {
                      label: "Submitted by",
                      value: (
                        <PlayerLink
                          player={data.submittedBy}
                          fallbackId={result.submitted_by}
                        />
                      ),
                    },
                    {
                      label: "Submitted",
                      value: formatDateTime(result.submitted_at),
                    },
                    {
                      label: "Confirmed by",
                      value: result.confirmed_by ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <PlayerLink
                            player={data.confirmedBy}
                            fallbackId={result.confirmed_by}
                          />
                          <span className="text-[13px] text-ink-muted">
                            {formatDateTime(result.confirmed_at)}
                          </span>
                        </span>
                      ) : result.status === "expired" ? (
                        "Not confirmed before it expired"
                      ) : (
                        "Not confirmed yet"
                      ),
                    },
                    {
                      label: "Counts towards rankings",
                      value: result.excluded_from_ranking ? (
                        <StatusBadge
                          status="excluded"
                          label="Excluded"
                          tone="neutral"
                        />
                      ) : result.status === "confirmed" ? (
                        "Yes"
                      ) : (
                        "Only once confirmed"
                      ),
                    },
                  ]}
                />
              ) : (
                <p className="text-sm text-ink-muted">
                  {match.status === "scheduled"
                    ? "This match hasn't been played yet."
                    : "No result has been submitted yet."}
                </p>
              )}
            </section>

            {post && (
              <section>
                <SectionHeading title="Originating game post" />
                <GamePostSummary post={post} organiser={data.organiser} />
              </section>
            )}
            {match.post_id && !post && (
              <section>
                <SectionHeading title="Originating game post" />
                <p className="text-sm text-ink-muted">
                  The originating game post ({match.post_id}) has been deleted.
                </p>
              </section>
            )}
          </div>

          <aside className="min-w-0 space-y-6 lg:border-l lg:border-line lg:pl-8 [&>*+*]:border-t [&>*+*]:border-line [&>*+*]:pt-6">
            {data.flags.length > 0 && (
              <section>
                <SectionHeading
                  title={
                    <>
                      Result flags{" "}
                      <span className="font-normal text-ink-faint tabular-nums">
                        {data.flags.length}
                      </span>
                    </>
                  }
                  description="Informational only; a flag never rejects a result."
                />
                <ResultFlagList flags={data.flags} />
              </section>
            )}

            <section>
              <SectionHeading
                title={
                  <>
                    Disputes{" "}
                    <span className="font-normal text-ink-faint tabular-nums">
                      {disputes.length}
                    </span>
                  </>
                }
              />
              {disputes.length === 0 ? (
                <p className="text-sm text-ink-muted">No disputes raised.</p>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {disputes.map((d) => (
                    <li key={d.dispute_id}>
                      <Link
                        href={`/disputes/${d.dispute_id}`}
                        className="flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-subtle"
                      >
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm text-ink">
                            {d.reason}
                          </div>
                          <div className="text-[13px] text-ink-muted">
                            {(d.raised_by &&
                              players.get(d.raised_by)?.display_name) ??
                              d.raised_by ??
                              "Unknown"}{" "}
                            · {formatDateTime(d.created_at)}
                          </div>
                        </div>
                        <StatusBadge status={d.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionHeading title="Mini League" />
              {league ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/mini-leagues/${league.league_id}`}
                    className="text-sm font-medium text-ink hover:text-brand hover:underline"
                  >
                    {league.name}
                  </Link>
                  <StatusBadge status={league.status} />
                </div>
              ) : match.league_id ? (
                <p className="text-sm text-ink-muted">
                  League {match.league_id} has been deleted.
                </p>
              ) : (
                <p className="text-sm text-ink-muted">Not a league match.</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
