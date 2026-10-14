"use client";

import { BackendGapNotice } from "@/components/shared/BackendGapNotice";
import { featureGap, unavailableReason } from "@/lib/api/capabilities";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, CircleCheck, RotateCcw } from "lucide-react";
import { useState } from "react";
import { RestoreAccountModal, SuspendAccountModal } from "@/components/modals/AccountModals";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { Button } from "@/components/shared/Button";
import { DetailList, Notice, SectionHeading } from "@/components/shared/Card";
import { LineChart } from "@/components/shared/Charts";
import { RecordNotFound } from "@/components/shared/NotFound";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlayerProfileCard } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs } from "@/components/shared/Tabs";
import { formatDate, formatDateTime, formatShortDate, TARGET_TYPE_LABEL } from "@/lib/format";
import { useAdminAction } from "@/lib/hooks/useAdminAction";
import { MINI_LEAGUES_ENABLED } from "@/lib/features";
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
        leagues: MINI_LEAGUES_ENABLED ? db.mini_leagues.filter((l) => l.organiser_id === playerId) : [],
        activeContent:
          db.game_posts.filter((p) => p.organiser_id === playerId && (p.status === "open" || p.status === "full")).length +
          (MINI_LEAGUES_ENABLED ? db.mini_leagues.filter((l) => l.organiser_id === playerId && l.status !== "suspended").length : 0),
      };
    });

  if (!data) return <RecordNotFound what="Player" backHref="/users" backLabel="Back to users" />;

  const { player, profile, reports, activity } = data;
  // The newest suspend/restore entry decides; a suspension already undone by a restore is stale.
  const lastAccountChange = activity
    .filter((a) => a.action === "suspend_account" || a.action === "restore_account")
    .reduce<(typeof activity)[number] | undefined>((latest, a) => (!latest || a.created_at > latest.created_at ? a : latest), undefined);
  const lastSuspension = lastAccountChange?.action === "suspend_account" ? lastAccountChange : undefined;
  const latest = activity[0];
  const recentlyRestored = player.status === "active" && latest?.action === "restore_account";
  const history = data.history[format];
  const ranking = format === "singles" ? data.singles : data.doubles;

  const closeDialog = () => setDialog(null);

  // One compact state notice at most; a deleted account outranks everything else.
  const stateNotice =
    player.registration_state === "deleted" ? (
      <Notice tone="warning" title="Account deleted">
        Deleted{player.deleted_at ? ` ${formatDate(player.deleted_at)}` : ""} and anonymised. Games, results and reports are kept for history.
      </Notice>
    ) : player.status === "suspended" ? (
      // Screen 12: suspended state
      <Notice tone="danger" title="Account suspended">
        {lastSuspension ? (
          <>
            Suspended {formatDateTime(lastSuspension.created_at)}. {lastSuspension.details}
          </>
        ) : (
          "This player can't sign in, post or join games until access is restored."
        )}
      </Notice>
    ) : recentlyRestored ? (
      // Screen 14: access restored state
      <div className="flex gap-2 rounded-md bg-success-soft px-3 py-2 text-[13px] leading-5 text-ink" role="status">
        <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
        <div className="min-w-0">
          <div className="font-medium text-success">Account access restored</div>
          <div>
            Restored {formatDateTime(latest.created_at)}. {player.display_name} can sign in, post and join games again.
          </div>
        </div>
      </div>
    ) : player.registration_state === "registration_pending" ? (
      <Notice title="Registration not finished">This account hasn&apos;t completed registration, so it can&apos;t post or join games yet.</Notice>
    ) : null;

  const contentCount = data.posts.length + data.leagues.length;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Users", href: "/users" }, { label: player.display_name }]}
        title={player.display_name}
        description={`Player ID ${player.player_id}`}
      />

      <BackendGapNotice message={featureGap("suspension")} />

      {stateNotice && <div className="mb-5">{stateNotice}</div>}

      <PlayerProfileCard
        player={player}
        profile={profile}
        ranking={data.singles}
        actions={
          player.registration_state === "deleted" ? null : player.status === "active" ? (
            <Button variant="danger" icon={<Ban aria-hidden />} disabledReason={unavailableReason("admin_suspend_account")} onClick={() => setDialog("suspend")}>
              Suspend account
            </Button>
          ) : (
            <Button variant="primary" icon={<RotateCcw aria-hidden />} disabledReason={unavailableReason("admin_restore_account")} onClick={() => setDialog("restore")}>
              Restore access
            </Button>
          )
        }
      />

      <div className="mt-8">
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
        <div className="grid gap-x-10 gap-y-8 pt-1 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <section>
              <SectionHeading title={<Counted label="Reports" count={reports.length} />} description="About this player or content they organise." />
              {reports.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No reports.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {reports.map((r) => (
                    <li key={r.report_id}>
                      <Link href={`/reports/${r.report_id}`} className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-2.5 hover:bg-subtle">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">{r.reason}</div>
                          <div className="text-[13px] text-ink-muted">
                            {TARGET_TYPE_LABEL[r.target_type]} · {formatDate(r.created_at)}
                          </div>
                        </div>
                        <StatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionHeading title={<Counted label="Organised content" count={contentCount} />} />
              {contentCount === 0 ? (
                <p className="text-[13px] text-ink-muted">This player hasn&apos;t organised any {MINI_LEAGUES_ENABLED ? "games or leagues" : "games"}.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {data.posts.map((p) => (
                    <li key={p.post_id} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/moderation/game-posts?post=${p.post_id}`} className="block truncate text-sm font-medium text-ink hover:text-brand">
                          {p.title}
                        </Link>
                        <div className="text-[13px] text-ink-muted">
                          Game post · {p.suburb} · {formatDate(p.proposed_time)}
                        </div>
                      </div>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                  {data.leagues.map((l) => (
                    <li key={l.league_id} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/mini-leagues/${l.league_id}`} className="block truncate text-sm font-medium text-ink hover:text-brand">
                          {l.name}
                        </Link>
                        <div className="text-[13px] text-ink-muted">Mini League · {l.member_ids.length} members</div>
                      </div>
                      <StatusBadge status={l.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="lg:border-l lg:border-line lg:pl-8">
            <SectionHeading title="Profile" />
            <DetailList
              columns={1}
              items={[
                { label: "Bio", value: profile?.bio || "—" },
                { label: "Location", value: [profile?.suburb, profile?.state].filter(Boolean).join(", ") || "—" },
                { label: "Discoverable", value: profile?.is_discoverable ? "Yes" : "No" },
                { label: "Identity verified", value: player.is_verified ? "Yes" : "No" },
                {
                  label: "Singles ranking",
                  value: data.singles ? <span className="tabular-nums">{data.singles.ranking_points} · Band {data.singles.band}</span> : "—",
                },
                {
                  label: "Doubles ranking",
                  value: data.doubles ? <span className="tabular-nums">{data.doubles.ranking_points} · Band {data.doubles.band}</span> : "—",
                },
              ]}
            />
          </section>
        </div>
      )}

      {/* Screen 11 */}
      {tab === "ranking" && (
        <section className="pt-1">
          <SectionHeading
            title="Ranking history"
            description="Rating after each rated result. Read-only: ratings can't be edited from the console."
            actions={
              <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Format">
                {(["singles", "doubles"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    aria-pressed={format === f}
                    className={`h-6 rounded px-2.5 text-[13px] font-medium capitalize transition-colors ${
                      format === f ? "bg-neutral-soft text-ink" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            }
          />
          {featureGap("rankingHistory") && (
            <div className="mb-4">
              <Notice>{featureGap("rankingHistory")}</Notice>
            </div>
          )}
          <div className="rounded-lg border border-line bg-surface p-4">
            <LineChart
              title={`${format === "singles" ? "Singles" : "Doubles"} ranking points`}
              summary={ranking ? `Now ${ranking.ranking_points} · Band ${ranking.band} · ${ranking.verified_games_count} verified games` : undefined}
              valueLabel="Points"
              points={history.map((h) => ({ label: formatShortDate(h.recorded_at), value: h.ranking_points }))}
            />
          </div>
        </section>
      )}

      {tab === "activity" && (
        <section className="max-w-3xl pt-1">
          <SectionHeading title="Admin activity" description="Every administrator action taken on this account." />
          <ActivityTimeline entries={activity} />
        </section>
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

function Counted({ label, count }: { label: string; count: number }) {
  return (
    <>
      {label} <span className="ml-1 font-normal text-ink-faint tabular-nums">{count}</span>
    </>
  );
}
