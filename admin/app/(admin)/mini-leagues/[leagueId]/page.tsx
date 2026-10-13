"use client";

import { unavailableReason } from "@/lib/api/capabilities";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CircleSlash, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { CloseRegistrationModal, DeleteLeagueModal, ResumeLeagueModal, SuspendLeagueModal } from "@/components/modals/LeagueModals";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { Button } from "@/components/shared/Button";
import { DetailList, Notice, SectionHeading } from "@/components/shared/Card";
import { RecordNotFound } from "@/components/shared/NotFound";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlayerLink } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAdminAction } from "@/lib/hooks/useAdminAction";
import {
  admin_close_league_registration,
  admin_delete_league,
  admin_resume_league,
  admin_suspend_league,
  selectActivityFor,
  selectDeletedRecord,
  selectMiniLeague,
  selectPlayerMap,
  selectReportsForTarget,
  selectResultForMatch,
  useQuery,
} from "@/lib/mock-api";

type Dialog = "suspend" | "resume" | "close-registration" | "delete" | null;

/** Screens 37 (active), 38 (suspended), 39 (suspend), 40 (resume), 41 (close registration), 42 (delete). */
export default function MiniLeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const { run } = useAdminAction();
  const close = () => setDialog(null);

  const data = useQuery((db) => {
    const league = selectMiniLeague(db, leagueId);
    if (!league) return { league: null, deleted: selectDeletedRecord(db, leagueId) } as const;
    const players = selectPlayerMap(db);
    const standings = db.league_standings
      .filter((s) => s.league_id === leagueId)
      .sort((a, b) => b.points - a.points || b.won - a.won || a.lost - b.lost);
    const matches = db.matches
      .filter((m) => m.league_id === leagueId)
      .sort((a, b) => b.proposed_time.localeCompare(a.proposed_time))
      .map((match) => ({ match, result: selectResultForMatch(db, match.match_id) }));
    return {
      league,
      deleted: null,
      players,
      organiser: players.get(league.organiser_id) ?? null,
      standings,
      matches,
      reports: selectReportsForTarget(db, "mini_league", leagueId),
      activity: selectActivityFor(db, "mini_league", leagueId),
    };
  });

  if (!data.league) {
    return (
      <RecordNotFound
        what="Mini League"
        backHref="/mini-leagues"
        backLabel="Back to Mini Leagues"
        detail={data.deleted ? `"${data.deleted.label}" was permanently deleted ${formatDateTime(data.deleted.deleted_at)}.` : undefined}
      />
    );
  }

  const { league, players, activity } = data;
  const name = (id: string) => players.get(id)?.display_name ?? id;
  const lastSuspension = activity.find((a) => a.action === "suspend_league");
  const lastClose = activity.find((a) => a.action === "close_league_registration");
  const isSuspended = league.status === "suspended";

  const opts = (saving: string, success: string) => ({ saving, success, onSuccess: close, onConflict: close });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Mini Leagues", href: "/mini-leagues" }, { label: league.name }]}
        title={league.name}
        meta={<StatusBadge status={league.status} />}
        description={<span className="font-mono text-xs text-ink-faint">{league.league_id}</span>}
        actions={
          <>
            {league.status === "active" && (
              <Button icon={<CircleSlash className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_close_league_registration")} onClick={() => setDialog("close-registration")}>
                Close registration
              </Button>
            )}
            {isSuspended ? (
              <Button variant="primary" icon={<PlayCircle className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_resume_league")} onClick={() => setDialog("resume")}>
                Resume league
              </Button>
            ) : (
              <Button variant="danger" icon={<PauseCircle className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_suspend_league")} onClick={() => setDialog("suspend")}>
                Suspend league
              </Button>
            )}
            <Button icon={<Trash2 className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_delete_league")} onClick={() => setDialog("delete")}>
              Delete
            </Button>
          </>
        }
      />

      <div className="space-y-8">
        <div className="space-y-4">
          {/* Screen 38: suspended and resumable */}
          {isSuspended && (
            <Notice tone="danger" title="League suspended">
              {league.suspended_by_account_suspension && !lastSuspension
                ? "Suspended automatically when the organiser's account was suspended."
                : lastSuspension
                  ? `Suspended ${formatDateTime(lastSuspension.created_at)}. ${lastSuspension.details.replace(/[.!?]?$/, ".")}`
                  : "This league is hidden from players and no matches can be recorded."}{" "}
              Standings are kept. Resuming returns it to {league.status_before_suspended === "registration_closed" ? "registration closed" : "active"}.
            </Notice>
          )}

          {league.status === "registration_closed" && (
            <Notice title="Registration closed">
              The league is still visible and active for its {league.member_ids.length} members, but no new players can join.
              {lastClose && ` Closed ${formatDateTime(lastClose.created_at)}.`}
            </Notice>
          )}

          {league.description && <p className="max-w-3xl text-sm text-ink-muted">{league.description}</p>}

          <DetailList
            columns={3}
            items={[
              { label: "Dates", value: `${formatDate(league.start_date)} – ${formatDate(league.end_date)}` },
              { label: "Where", value: <span className="capitalize">{[league.suburb, league.format].filter(Boolean).join(" · ") || "Location not set"}</span> },
              { label: "Organiser", value: <PlayerLink player={data.organiser} fallbackId={league.organiser_id} /> },
            ]}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="min-w-0 space-y-8 lg:col-span-2">
            <section>
              <SectionHeading title="Standings" description="Read-only. Calculated from confirmed results." />
              {data.standings.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No standings yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Standings for {league.name}</caption>
                    <thead className="border-b border-line bg-subtle text-xs text-ink-muted">
                      <tr>
                      <th scope="col" className="px-4 py-2 font-medium text-right">
                        #
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Player
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium text-right">
                        Played
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium text-right">
                        Won
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium text-right">
                        Lost
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium text-right">
                        Points
                      </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.standings.map((s, i) => (
                        <tr key={s.player_id} className="hover:bg-subtle">
                          <td className="w-12 px-4 py-2.5 text-right text-ink-faint tabular-nums">{i + 1}</td>
                          <td className="px-4 py-2.5">
                            <PlayerLink player={players.get(s.player_id)} fallbackId={s.player_id} />
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{s.played}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{s.won}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{s.lost}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-ink tabular-nums">{s.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <SectionHeading title={`Matches (${data.matches.length})`} />
              {data.matches.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No matches yet.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                  {data.matches.map(({ match, result }) => (
                    <li key={match.match_id}>
                      <Link href={`/games/${match.match_id}`} className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-subtle">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">
                            {match.side_a.map(name).join(" & ")} vs {match.side_b.map(name).join(" & ")}
                          </div>
                          <div className="text-[13px] text-ink-muted">
                            {formatDateTime(match.proposed_time)} · {match.venue}
                            {result && <span className="tabular-nums"> · {result.score}</span>}
                          </div>
                        </div>
                        <StatusBadge status={match.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionHeading title="Admin activity" />
              <ActivityTimeline entries={activity} empty="No admin actions on this league yet." />
            </section>
          </div>

          <div className="min-w-0 space-y-8">
            <section>
              <SectionHeading title={`Members (${league.member_ids.length}${league.max_members === null ? "" : `/${league.max_members}`})`} />
              {league.member_ids.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No members yet.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {league.member_ids.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-3 py-2">
                      <PlayerLink player={players.get(id)} fallbackId={id} />
                      {id === league.organiser_id && <span className="shrink-0 text-xs text-ink-faint">Organiser</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionHeading title={`Reports (${data.reports.length})`} />
              {data.reports.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No reports.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {data.reports.map((r) => (
                    <li key={r.report_id}>
                      <Link href={`/reports/${r.report_id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-subtle">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">{r.reason}</div>
                          <div className="text-[13px] text-ink-muted">{formatDateTime(r.created_at)}</div>
                        </div>
                        <StatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionHeading title="Moderation options" />
              <dl className="space-y-2.5 text-[13px]">
                <div>
                  <dt className="font-medium text-ink">Close registration</dt>
                  <dd className="text-ink-muted">Stops new players joining. The league stays visible and matches carry on.</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Suspend</dt>
                  <dd className="text-ink-muted">Hides the league and pauses matches. Can be resumed; standings are kept.</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Delete</dt>
                  <dd className="text-ink-muted">Permanently removes the league, its standings and membership.</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </div>

      <SuspendLeagueModal
        open={dialog === "suspend"}
        leagueName={league.name}
        onClose={close}
        onConfirm={({ reason }) => run(() => admin_suspend_league({ leagueId: league.league_id, reason }), opts("Suspending league…", "Mini League suspended"))}
      />
      <ResumeLeagueModal
        open={dialog === "resume"}
        leagueName={league.name}
        onClose={close}
        onConfirm={({ reason }) => run(() => admin_resume_league({ leagueId: league.league_id, note: reason }), opts("Resuming league…", "Mini League resumed"))}
      />
      <CloseRegistrationModal
        open={dialog === "close-registration"}
        leagueName={league.name}
        onClose={close}
        onConfirm={({ reason }) =>
          run(() => admin_close_league_registration({ leagueId: league.league_id, reason }), opts("Closing registration…", "Registration closed"))
        }
      />
      <DeleteLeagueModal
        open={dialog === "delete"}
        leagueName={league.name}
        memberCount={league.member_ids.length}
        onClose={close}
        onConfirm={({ reason }) =>
          run(() => admin_delete_league({ leagueId: league.league_id, reason }), {
            saving: "Deleting league…",
            success: "Mini League deleted",
            successDetail: "Listed under Deleted records.",
            onSuccess: () => {
              close();
              router.push("/mini-leagues");
            },
            onConflict: close,
          })
        }
      />
    </>
  );
}
