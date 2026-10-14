"use client";

import { BackendGapNotice } from "@/components/shared/BackendGapNotice";
import { unavailableReason } from "@/lib/api/capabilities";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, CircleCheck, CircleX, EyeOff, PauseCircle, PlayCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { RestoreAccountModal, SuspendAccountModal } from "@/components/modals/AccountModals";
import { ResumeLeagueModal, SuspendLeagueModal } from "@/components/modals/LeagueModals";
import { HidePostModal, RestorePostModal } from "@/components/modals/PostModals";
import { ReviewReportModal } from "@/components/modals/ReviewModals";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { Button, ButtonLink } from "@/components/shared/Button";
import { Card, CardBody, CardHeader, DetailList, Notice } from "@/components/shared/Card";
import { GamePostSummary, MiniLeagueSummary } from "@/components/shared/ContentSummaries";
import { RecordNotFound } from "@/components/shared/NotFound";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlayerLink, PlayerProfileCard } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime, humanize, TARGET_TYPE_LABEL } from "@/lib/format";
import { useAdminAction } from "@/lib/hooks/useAdminAction";
import { IS_API } from "@/lib/config";
import { ReportEvidence } from "@/components/monitoring/ReportEvidence";
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
      if (!report) return null;
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
            db.mini_leagues.filter((l) => l.organiser_id === targetPlayer.player_id && l.status !== "suspended").length
          : 0,
        post,
        league,
        owner: ownerId ? selectPlayer(db, ownerId) : null,
        match,
        matchSides: match ? [match.side_a, match.side_b].map((ids) => ids.map((id) => names.get(id)?.display_name ?? id).join(" & ")) : null,
        adminPost,
        deleted: !targetPlayer && !post && !league && !match && !adminPost ? selectDeletedRecord(db, report.target_id) : null,
        related: selectReportsForTarget(db, report.target_type, report.target_id).filter((r) => r.report_id !== report.report_id),
        activity: selectActivityFor(db, "report", report.report_id),
      };
    });

  if (!data) return <RecordNotFound what="Report" backHref="/reports" backLabel="Back to reports" />;
  const { report, targetPlayer, post, league, match, adminPost } = data;
  const pending = report.status === "pending";

  const opts = (success: string) => ({ success, onSuccess: close, onConflict: close });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: report.report_id }]}
        title={report.reason}
        meta={<StatusBadge status={report.status} />}
        description={`${TARGET_TYPE_LABEL[report.target_type]} report · received ${formatDateTime(report.created_at)}`}
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
            ? "Resolving and dismissing aren't available yet: the database can't store the required review note (DB05). Account, post and league actions are disabled until DB02–DB04."
            : null
        }
      />

      {/* Screens 22 / 23: outcome states */}
      {!pending && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-xl border px-5 py-4 text-sm ${
            report.status === "resolved" ? "border-success/30 bg-success-soft" : "border-line-strong bg-neutral-soft"
          }`}
          role="status"
        >
          {report.status === "resolved" ? (
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleX className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
          )}
          <div>
            <div className={`font-semibold ${report.status === "resolved" ? "text-success" : "text-ink"}`}>
              {report.status === "resolved" ? "Report resolved" : "Report dismissed"}
              {report.reviewed_at && <span className="font-normal text-ink-muted"> · {formatDateTime(report.reviewed_at)}</span>}
            </div>
            {report.resolution_note && <p className="mt-0.5 text-ink">{report.resolution_note}</p>}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {IS_API && <ReportEvidence key={reportId} reportId={reportId} showCurrentTarget />}
          <Card>
            <CardHeader title="Report" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Reason", value: report.reason },
                  { label: "Reported by", value: <PlayerLink player={data.reporter} fallbackId={report.reported_by_player_id} /> },
                  { label: "Received", value: formatDateTime(report.created_at) },
                  { label: "Report ID", value: <span className="font-mono text-xs">{report.report_id}</span> },
                ]}
              />
              {report.details && (
                <div className="mt-4">
                  <div className="text-xs font-medium tracking-wide text-ink-faint uppercase">Reporter&apos;s description</div>
                  <blockquote className="mt-1 rounded-lg border-l-4 border-line-strong bg-subtle px-4 py-3 text-sm text-ink">{report.details}</blockquote>
                </div>
              )}
            </CardBody>
          </Card>

          <section aria-labelledby="target-heading">
            <h2 id="target-heading" className="mb-3 text-base font-semibold text-ink">
              Reported {TARGET_TYPE_LABEL[report.target_type].toLowerCase()}
            </h2>

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
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-ink">{data.matchSides.join(" vs ")}</div>
                      <div className="text-sm text-ink-muted">
                        {humanize(match.format)} · {match.venue}
                        {match.suburb ? `, ${match.suburb}` : ""} · {formatDateTime(match.proposed_time)}
                      </div>
                    </div>
                    <ButtonLink href={`/games/${match.match_id}`} size="sm">
                      View game
                    </ButtonLink>
                  </div>
                </CardBody>
              </Card>
            )}

            {adminPost && (
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-ink">{adminPost.title}</div>
                      <div className="text-sm text-ink-muted">Home carousel card · {humanize(adminPost.status)}</div>
                    </div>
                    <ButtonLink href="/content" size="sm">
                      Open content
                    </ButtonLink>
                  </div>
                </CardBody>
              </Card>
            )}

            {!IS_API && report.target_type === "club" && (
              <Notice title={`Club ${report.target_id}`}>Club details aren&apos;t available from the admin API yet.</Notice>
            )}

            {!targetPlayer && !post && !league && !match && !adminPost && report.target_type !== "club" && report.target_type !== "group" && (
              <Notice tone="warning" title="Content no longer exists">
                {data.deleted
                  ? `"${data.deleted.label}" was deleted ${formatDateTime(data.deleted.deleted_at)}. Reason: ${data.deleted.reason}`
                  : `${TARGET_TYPE_LABEL[report.target_type]} ${report.target_id} could not be found.`}
              </Notice>
            )}

            {pending && (
              <p className="mt-3 text-xs text-ink-muted">
                Actions on the reported {TARGET_TYPE_LABEL[report.target_type].toLowerCase()} are separate from the report outcome. Resolve the
                report once you&apos;ve taken any action needed.
              </p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={`Other reports (${data.related.length})`} description="About the same target." />
            {data.related.length === 0 ? (
              <CardBody>
                <p className="text-sm text-ink-muted">This is the only report.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {data.related.map((r) => (
                  <li key={r.report_id}>
                    <Link href={`/reports/${r.report_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-subtle">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{r.reason}</div>
                        <div className="text-xs text-ink-muted">{formatDateTime(r.created_at)}</div>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <ActivityTimeline entries={data.activity} empty="No action taken on this report yet." />
            </CardBody>
          </Card>
        </div>
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
