"use client";

import { BackendGapNotice } from "@/components/shared/BackendGapNotice";
import { featureGap } from "@/lib/api/capabilities";
import { unavailableReason } from "@/lib/api/capabilities";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, CircleCheck, RotateCcw } from "lucide-react";
import { useState } from "react";
import { RestoreAccountModal, SuspendAccountModal } from "@/components/modals/AccountModals";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { Button } from "@/components/shared/Button";
import { Card, CardBody, CardHeader, DetailList, Notice } from "@/components/shared/Card";
import { LineChart } from "@/components/shared/Charts";
import { RecordNotFound } from "@/components/shared/NotFound";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlayerProfileCard } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs } from "@/components/shared/Tabs";
import { formatDate, formatDateTime, formatShortDate, TARGET_TYPE_LABEL } from "@/lib/format";
import { useAdminAction } from "@/lib/hooks/useAdminAction";
import { IS_API } from "@/lib/config";
import { PlayerRating } from "@/components/monitoring/PlayerRating";
import {
  admin_restore_account,
  admin_suspend_account,
  selectActivityFor,
  selectPlayer,
  selectPlayerProfile,
  selectRanking,
  selectRankingHistory,
  selectReportsAboutPlayer,
  useQuery,
} from "@/lib/mock-api";

type Tab = "overview" | "ranking" | "activity";

/** Screens 09 (profile), 10 (suspend), 11 (ranking history), 12 (suspended), 13 (restore), 14 (restored). */
export default function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [format, setFormat] = useState<"singles" | "doubles">("singles");
  const [dialog, setDialog] = useState<"suspend" | "restore" | null>(null);
  const { run } = useAdminAction();

  const data = useQuery(
    (db) => {
      const player = selectPlayer(db, playerId);
      if (!player) return null;
      return {
        player,
        profile: selectPlayerProfile(db, playerId),
        singles: selectRanking(db, playerId, "singles"),
        doubles: selectRanking(db, playerId, "doubles"),
        history: { singles: selectRankingHistory(db, playerId, "singles"), doubles: selectRankingHistory(db, playerId, "doubles") },
        reports: selectReportsAboutPlayer(db, playerId),
        activity: selectActivityFor(db, "player", playerId),
        posts: db.game_posts.filter((p) => p.organiser_id === playerId),
        leagues: db.mini_leagues.filter((l) => l.organiser_id === playerId),
        activeContent:
          db.game_posts.filter((p) => p.organiser_id === playerId && (p.status === "open" || p.status === "full")).length +
          db.mini_leagues.filter((l) => l.organiser_id === playerId && l.status !== "suspended").length,
      };
    });

  if (!data) return <RecordNotFound what="Player" backHref="/users" backLabel="Back to users" />;

  const { player, profile, reports, activity } = data;
  const lastSuspension = activity.find((a) => a.action === "suspend_account");
  const latest = activity[0];
  const recentlyRestored = player.status === "active" && latest?.action === "restore_account";
  const history = data.history[format];
  const ranking = format === "singles" ? data.singles : data.doubles;

  const closeDialog = () => setDialog(null);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Users", href: "/users" }, { label: player.display_name }]}
        title={player.display_name}
        meta={<StatusBadge status={player.account_state === "deleted" ? "deleted" : player.status} />}
        description={`Player ID ${player.player_id}`}
      />

      <BackendGapNotice message={featureGap("suspension")} />

      {/* Screen 12: suspended state */}
      {player.status === "suspended" && (
        <div className="mb-5">
          <Notice tone="danger" title="Account suspended">
            {lastSuspension ? (
              <>
                Suspended {formatDateTime(lastSuspension.created_at)}. {lastSuspension.details}
              </>
            ) : (
              "This player can't sign in, post or join games until access is restored."
            )}
          </Notice>
        </div>
      )}

      {/* Screen 14: access restored state */}
      {recentlyRestored && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm text-success" role="status">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <div className="font-semibold">Account access restored</div>
            <div>
              Restored {formatDateTime(latest.created_at)}. {player.display_name} can sign in, post and join games again.
            </div>
          </div>
        </div>
      )}

      <PlayerProfileCard
        player={player}
        profile={profile}
        ranking={data.singles}
        actions={
          player.status === "active" ? (
            <Button variant="danger" icon={<Ban className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_suspend_account")} onClick={() => setDialog("suspend")}>
              Suspend account
            </Button>
          ) : (
            <Button variant="primary" icon={<RotateCcw className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_restore_account")} onClick={() => setDialog("restore")}>
              Restore access
            </Button>
          )
        }
      />

      <div className="mt-6">
        <Tabs
          label="Profile sections"
          active={tab}
          onChange={(id) => setTab(id as Tab)}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "ranking", label: "Ranking history" },
            { id: "activity", label: "Admin activity", count: activity.length },
          ]}
        />
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {IS_API && <PlayerRating key={playerId} playerId={playerId} />}
            <Card>
              <CardHeader title={`Reports (${reports.length})`} description="Reports about this player or content they organise." />
              {reports.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-ink-muted">No reports.</p>
                </CardBody>
              ) : (
                <ul className="divide-y divide-line">
                  {reports.map((r) => (
                    <li key={r.report_id}>
                      <Link href={`/reports/${r.report_id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-subtle">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">{r.reason}</div>
                          <div className="text-xs text-ink-muted">
                            {TARGET_TYPE_LABEL[r.target_type]} · {formatDate(r.created_at)}
                          </div>
                        </div>
                        <StatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Organised content" />
              {data.posts.length + data.leagues.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-ink-muted">This player hasn&apos;t organised any games or leagues.</p>
                </CardBody>
              ) : (
                <ul className="divide-y divide-line">
                  {data.posts.map((p) => (
                    <li key={p.post_id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <Link href={`/moderation/game-posts?post=${p.post_id}`} className="truncate text-sm font-medium text-ink hover:text-brand hover:underline">
                          {p.title}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          Game post · {p.suburb} · {formatDate(p.proposed_time)}
                        </div>
                      </div>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                  {data.leagues.map((l) => (
                    <li key={l.league_id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <Link href={`/mini-leagues/${l.league_id}`} className="truncate text-sm font-medium text-ink hover:text-brand hover:underline">
                          {l.name}
                        </Link>
                        <div className="text-xs text-ink-muted">Mini League · {l.member_ids.length} members</div>
                      </div>
                      <StatusBadge status={l.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="self-start">
            <CardHeader title="Profile" />
            <CardBody>
              <DetailList
                columns={1}
                items={[
                  { label: "Bio", value: profile?.bio || "—" },
                  { label: "Location", value: profile ? `${profile.suburb}, ${profile.state}` : "—" },
                  { label: "Discoverable", value: profile?.is_discoverable ? "Yes" : "No" },
                  { label: "Identity verified", value: player.is_verified ? "Yes" : "No" },
                  {
                    label: "Rankings",
                    value: (
                      <>
                        Singles {data.singles?.ranking_points ?? "—"} (Band {data.singles?.band ?? "—"}) · Doubles {data.doubles?.ranking_points ?? "—"} (Band{" "}
                        {data.doubles?.band ?? "—"})
                      </>
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      )}

      {/* Screen 11 */}
      {tab === "ranking" && IS_API && <PlayerRating key={playerId} playerId={playerId} history />}
      {tab === "ranking" && !IS_API && (
        <Card>
          {featureGap("rankingHistory") && (
            <CardBody>
              <BackendGapNotice message={featureGap("rankingHistory")} />
            </CardBody>
          )}
          <CardHeader
            title="Ranking history"
            description="Weekly snapshots of ranking points. Read-only: ratings can't be edited from the console."
            actions={
              <div className="inline-flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="Format">
                {(["singles", "doubles"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    aria-pressed={format === f}
                    className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${format === f ? "bg-brand text-white" : "text-ink-muted hover:text-ink"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            }
          />
          <CardBody>
            <LineChart
              title={`${format === "singles" ? "Singles" : "Doubles"} ranking points`}
              summary={ranking ? `Now ${ranking.ranking_points} · Band ${ranking.band} · ${ranking.verified_games_count} verified games` : undefined}
              valueLabel="Points"
              points={history.map((h) => ({ label: formatShortDate(h.recorded_at), value: h.ranking_points }))}
            />
          </CardBody>
        </Card>
      )}

      {tab === "activity" && (
        <Card>
          <CardHeader title="Admin activity" description="Every administrator action taken on this account." />
          <CardBody>
            <ActivityTimeline entries={activity} />
          </CardBody>
        </Card>
      )}

      <SuspendAccountModal
        open={dialog === "suspend"}
        playerName={player.display_name}
        contentCount={data.activeContent}
        onClose={closeDialog}
        onConfirm={({ reason }) =>
          run(() => admin_suspend_account({ playerId: player.player_id, reason }), {
            saving: "Suspending account…",
            success: "Account suspended",
            successDetail: `${player.display_name} can no longer sign in.`,
            onSuccess: closeDialog,
            onConflict: closeDialog,
          })
        }
      />
      <RestoreAccountModal
        open={dialog === "restore"}
        playerName={player.display_name}
        onClose={closeDialog}
        onConfirm={({ reason }) =>
          run(() => admin_restore_account({ playerId: player.player_id, note: reason }), {
            saving: "Restoring access…",
            success: "Account access restored",
            onSuccess: closeDialog,
            onConflict: closeDialog,
          })
        }
      />
    </>
  );
}
