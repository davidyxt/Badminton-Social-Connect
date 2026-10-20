"use client";

import { IS_API } from "@/lib/config";
import { ReportEvidence } from "@/components/monitoring/ReportEvidence";

import { EvidenceSnapshot } from "@/components/shared/EvidenceSnapshot";
import { BackendGapNotice } from "@/components/shared/BackendGapNotice";
import { unavailableReason } from "@/lib/api/capabilities";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, CircleCheck, CircleX, EyeOff, PauseCircle, PlayCircle, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RestoreAccountModal, SuspendAccountModal } from "@/components/modals/AccountModals";
import { ResumeLeagueModal, SuspendLeagueModal } from "@/components/modals/LeagueModals";
import { HidePostModal, RestorePostModal } from "@/components/modals/PostModals";
import { ReviewReportModal } from "@/components/modals/ReviewModals";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { Button, ButtonLink } from "@/components/shared/Button";
import { DetailList, Notice, SectionHeading } from "@/components/shared/Card";
import { GamePostSummary, MiniLeagueSummary } from "@/components/shared/ContentSummaries";
import { RecordNotFound } from "@/components/shared/NotFound";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlayerLink, PlayerProfileCard } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CATEGORY_LABEL, formatDateTime, humanize, TARGET_TYPE_LABEL } from "@/lib/format";
import { useAdminAction } from "@/lib/hooks/useAdminAction";
import { MINI_LEAGUES_ENABLED, isVisibleTargetType } from "@/lib/features";
import {
  admin_hide_post,
  admin_restore_account,
  admin_restore_post,
  admin_resume_league,
  admin_review_report,
  admin_suspend_account,
  admin_suspend_league,
  selectActivityFor,
  selectDeletedRecord,
  selectGamePost,
  selectMatch,
  selectMiniLeague,
  selectPlayer,
  selectPlayerMap,
  selectPlayerProfile,
  selectRanking,
  selectReportsForTarget,
  useQuery,
} from "@/lib/mock-api";

type Dialog = "resolve" | "dismiss" | "suspend" | "restore" | "hide" | "restore-post" | "suspend-league" | "resume-league" | null;

/** Screens 19 (detail), 20 (game post linkage), 21 (Mini League linkage), 22 (resolved), 23 (dismissed). */
export default function ReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const { run } = useAdminAction();
  const close = () => setDialog(null);

  const data = useQuery(
    (db) => {
      const report = db.reports.find((r) => r.report_id === reportId);
      // Reports about out-of-scope features (Mini Leagues) are hidden, so they read as not found.
      if (!report || !isVisibleTargetType(report.target_type)) return null;
      const targetPlayer = report.target_type === "player" ? selectPlayer(db, report.target_id) : null;
      const post = report.target_type === "game_post" ? selectGamePost(db, report.target_id) : null;
      const league = report.target_type === "mini_league" ? selectMiniLeague(db, report.target_id) : null;
      const ownerId = post?.organiser_id || league?.organiser_id || null;
      const match = report.target_type === "match" ? selectMatch(db, report.target_id) : null;
      const adminPost = report.target_type === "admin_post" ? (db.admin_posts.find((a) => a.admin_post_id === report.target_id) ?? null) : null;
      const names = selectPlayerMap(db);
      return {
        report,
        reporter: selectPlayer(db, report.reported_by_player_id),
        targetPlayer,
        targetProfile: targetPlayer ? selectPlayerProfile(db, targetPlayer.player_id) : null,
        targetRanking: targetPlayer ? selectRanking(db, targetPlayer.player_id, "singles") : null,
        targetContentCount: targetPlayer
          ? db.game_posts.filter((p) => p.organiser_id === targetPlayer.player_id && (p.status === "open" || p.status === "full")).length +
            (MINI_LEAGUES_ENABLED ? db.mini_leagues.filter((l) => l.organiser_id === targetPlayer.player_id && l.status !== "suspended").length : 0)
          : 0,
        post,
        league,
        owner: ownerId ? selectPlayer(db, ownerId) : null,
        match,
        matchSides: match ? [match.side_a, match.side_b].map((ids) => ids.map((id) => names.get(id)?.display_name ?? id).join(" & ")) : null,
        adminPost,
        group: report.target_type === "group" ? (db.groups.find((g) => g.group_id === report.target_id) ?? null) : null,
        deleted: !targetPlayer && !post && !league && !match && !adminPost ? selectDeletedRecord(db, report.target_id) : null,
        related: selectReportsForTarget(db, report.target_type, report.target_id).filter((r) => r.report_id !== report.report_id),
        activity: selectActivityFor(db, "report", report.report_id),
      };
    });

  if (!data) return <RecordNotFound what="Report" backHref="/reports" backLabel="Back to reports" />;
  const { report, targetPlayer, post, league, match, adminPost, group } = data;
  const pending = report.status === "pending";
  // Reviewed elsewhere (another tab or admin) while a review dialog was open: there's nothing left to review.
  if (!pending && (dialog === "resolve" || dialog === "dismiss")) setDialog(null);
  // "Mini League" is a product name, so it keeps its capitals mid-sentence.
  const targetNoun = report.target_type === "mini_league" ? TARGET_TYPE_LABEL.mini_league : TARGET_TYPE_LABEL[report.target_type].toLowerCase();

  const opts = (success: string) => ({ success, onSuccess: close, onConflict: close });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: report.report_id }]}
        title={report.reason}
        meta={<StatusBadge status={report.status} />}
        description={`${TARGET_TYPE_LABEL[report.target_type]} report`}
        actions={
          pending && (
            <>
              <Button icon={<CircleX className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_review_report")} onClick={() => setDialog("dismiss")}>
                Dismiss
              </Button>
              <Button variant="primary" icon={<CircleCheck className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_review_report")} onClick={() => setDialog("resolve")}>
                Resolve
              </Button>
            </>
          )
        }
      />

      <BackendGapNotice
        message={
          pending && unavailableReason("admin_review_report")
            ? `Resolving and dismissing aren't available yet: the database can't store the required private review note (DB05). Account and post actions are disabled until ${MINI_LEAGUES_ENABLED ? "DB02–DB04" : "DB02 and DB03"}.`
            : null
        }
      />

      {/* Screens 22 / 23: outcome states */}
      {!pending && (
        <div
          className={`mb-8 flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px] ${report.status === "resolved" ? "bg-success-soft" : "bg-subtle"}`}
          role="status"
        >
          {report.status === "resolved" ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleX className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
          )}
          <div className="min-w-0">
            <div className={`font-medium ${report.status === "resolved" ? "text-success" : "text-ink"}`}>
              {report.status === "resolved" ? "Report resolved" : "Report dismissed"}
              {report.reviewed_at && <span className="font-normal text-ink-muted"> · {formatDateTime(report.reviewed_at)}</span>}
            </div>
            {report.resolution_note && <p className="mt-0.5 text-ink">{report.resolution_note}</p>}
          </div>
        </div>
      )}

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_272px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="description-heading">
            <SectionHeading title={<span id="description-heading">Reporter&apos;s description</span>} />
            {report.details ? (
              <blockquote className="border-l-2 border-line-strong pl-4 text-sm leading-6 whitespace-pre-line text-ink">{report.details}</blockquote>
            ) : (
              <p className="text-[13px] text-ink-muted">No description given.</p>
            )}
          </section>

          <section aria-labelledby="evidence-heading">
            <SectionHeading title={<span id="evidence-heading">Evidence</span>} />
            {IS_API ? <ReportEvidence key={reportId} reportId={reportId} /> : <EvidenceSnapshot evidence={report.evidence} />}
          </section>

          <section aria-labelledby="target-heading">
            <SectionHeading
              title={<span id="target-heading">Reported {targetNoun}</span>}
              description={pending ? "Taking action here doesn't close the report. Resolve it once you're done." : undefined}
            />

            {targetPlayer && (
              <PlayerProfileCard
                compact
                player={targetPlayer}
                profile={data.targetProfile}
                ranking={data.targetRanking}
                actions={
                  targetPlayer.status === "active" ? (
                    <Button size="sm" variant="danger" icon={<Ban className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_suspend_account")} onClick={() => setDialog("suspend")}>
                      Suspend account
                    </Button>
                  ) : (
                    <Button size="sm" icon={<RotateCcw className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_restore_account")} onClick={() => setDialog("restore")}>
                      Restore access
                    </Button>
                  )
                }
              />
            )}

            {/* Screen 20 */}
            {post && (
              <GamePostSummary
                post={post}
                organiser={data.owner}
                actions={
                  post.status === "hidden" ? (
                    <Button size="sm" icon={<RotateCcw className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_restore_post")} onClick={() => setDialog("restore-post")}>
                      Restore post
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" icon={<EyeOff className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_hide_post")} onClick={() => setDialog("hide")}>
                      Hide post
                    </Button>
                  )
                }
              />
            )}

            {/* Screen 21 */}
            {league && (
              <MiniLeagueSummary
                league={league}
                organiser={data.owner}
                actions={
                  league.status === "suspended" ? (
                    <Button size="sm" icon={<PlayCircle className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_resume_league")} onClick={() => setDialog("resume-league")}>
                      Resume league
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" icon={<PauseCircle className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_suspend_league")} onClick={() => setDialog("suspend-league")}>
                      Suspend league
                    </Button>
                  )
                }
              />
            )}

            {match && data.matchSides && (
              <TargetRow
                title={data.matchSides.join(" vs ")}
                meta={`${humanize(match.format)} · ${match.venue}${match.suburb ? `, ${match.suburb}` : ""} · ${formatDateTime(match.proposed_time)}`}
                action={
                  <ButtonLink href={`/games/${match.match_id}`} size="sm">
                    View game
                  </ButtonLink>
                }
              />
            )}

            {adminPost && (
              <TargetRow
                title={adminPost.title}
                meta={`Home carousel card · ${humanize(adminPost.status)}`}
                action={
                  <ButtonLink href="/content" size="sm">
                    Open content
                  </ButtonLink>
                }
              />
            )}

            {group && <TargetRow title={group.name} meta={<span className="font-mono text-xs">{group.group_id}</span>} />}

            {!targetPlayer && !post && !league && !match && !adminPost && !group && (
              <Notice tone="warning" title="Content no longer exists">
                {data.deleted
                  ? `"${data.deleted.label}" was deleted ${formatDateTime(data.deleted.deleted_at)}. Reason: ${data.deleted.reason}`
                  : `${TARGET_TYPE_LABEL[report.target_type]} ${report.target_id} could not be found.`}
              </Notice>
            )}
          </section>

        </div>

        <aside className="min-w-0 space-y-8 lg:border-l lg:border-line lg:pl-8">
          <section aria-labelledby="details-heading">
            <SectionHeading title={<span id="details-heading">Details</span>} />
            <DetailList
              columns={1}
              items={[
                { label: "Category", value: CATEGORY_LABEL[report.category] ?? report.category },
                { label: "Reported by", value: <PlayerLink player={data.reporter} fallbackId={report.reported_by_player_id} /> },
                { label: "Received", value: formatDateTime(report.created_at) },
                { label: "Report ID", value: <span className="font-mono text-xs">{report.report_id}</span> },
              ]}
            />
          </section>

          <section aria-labelledby="related-heading">
            <SectionHeading
              title={
                <span id="related-heading">
                  Other reports <span className="font-normal text-ink-faint tabular-nums">{data.related.length}</span>
                </span>
              }
            />
            {data.related.length === 0 ? (
              <p className="text-[13px] text-ink-muted">None about this {targetNoun}.</p>
            ) : (
              <ul className="-mx-2">
                {data.related.map((r) => (
                  <li key={r.report_id}>
                    <Link href={`/reports/${r.report_id}`} className="flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-subtle">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-ink">{r.reason}</div>
                        <div className="text-xs text-ink-faint">{formatDateTime(r.created_at)}</div>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="activity-heading">
            <SectionHeading title={<span id="activity-heading">Activity</span>} />
            <ActivityTimeline entries={data.activity} empty="No action taken on this report yet." />
          </section>
        </aside>
      </div>

      <ReviewReportModal
        open={dialog === "resolve" || dialog === "dismiss"}
        outcome={dialog === "dismiss" ? "dismissed" : "resolved"}
        onClose={close}
        onConfirm={({ reason }) => {
          const outcome = dialog === "dismiss" ? "dismissed" : "resolved";
          return run(() => admin_review_report({ reportId: report.report_id, outcome, note: reason }), opts(outcome === "resolved" ? "Report resolved" : "Report dismissed"));
        }}
      />
      {targetPlayer && (
        <>
          <SuspendAccountModal
            open={dialog === "suspend"}
            playerName={targetPlayer.display_name}
            contentCount={data.targetContentCount}
            onClose={close}
            onConfirm={({ reason }) => run(() => admin_suspend_account({ playerId: targetPlayer.player_id, reason }), opts("Account suspended"))}
          />
          <RestoreAccountModal
            open={dialog === "restore"}
            playerName={targetPlayer.display_name}
            onClose={close}
            onConfirm={({ reason }) => run(() => admin_restore_account({ playerId: targetPlayer.player_id, note: reason }), opts("Account access restored"))}
          />
        </>
      )}
      {post && (
        <>
          <HidePostModal
            open={dialog === "hide"}
            postTitle={post.title}
            onClose={close}
            onConfirm={({ reason }) => run(() => admin_hide_post({ postId: post.post_id, reason }), opts("Game post hidden"))}
          />
          <RestorePostModal
            open={dialog === "restore-post"}
            postTitle={post.title}
            suspendedOrganiser={!post.organiser_group_id && data.owner?.status === "suspended" ? data.owner.display_name : null}
            onClose={close}
            onConfirm={({ reason }) => run(() => admin_restore_post({ postId: post.post_id, note: reason }), opts("Game post restored"))}
          />
        </>
      )}
      {league && (
        <>
          <SuspendLeagueModal
            open={dialog === "suspend-league"}
            leagueName={league.name}
            onClose={close}
            onConfirm={({ reason }) => run(() => admin_suspend_league({ leagueId: league.league_id, reason }), opts("Mini League suspended"))}
          />
          <ResumeLeagueModal
            open={dialog === "resume-league"}
            leagueName={league.name}
            onClose={close}
            onConfirm={({ reason }) => run(() => admin_resume_league({ leagueId: league.league_id, note: reason }), opts("Mini League resumed"))}
          />
        </>
      )}
    </>
  );
}

/** Compact record row for target types without a shared summary component (match, carousel card, group). */
function TargetRow({ title, meta, action }: { title: ReactNode; meta: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="mt-0.5 text-[13px] text-ink-muted">{meta}</div>
      </div>
      {action}
    </div>
  );
}
