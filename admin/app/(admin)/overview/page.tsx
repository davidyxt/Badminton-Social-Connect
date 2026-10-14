"use client";

import Link from "next/link";
import { SectionHeading, StatGroup, StatTile } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { resolveTarget } from "@/lib/activity";
import { ACTION_LABEL, formatDateTime, humanize, TARGET_TYPE_LABEL } from "@/lib/format";
import { MINI_LEAGUES_ENABLED } from "@/lib/features";
import { isDisputeUnresolved, selectVisibleActivity, selectVisibleReports, useQuery } from "@/lib/mock-api";

interface QueueItem {
  key: string;
  href: string;
  title: string;
  detail: string;
  at: string;
  status: string;
}

const QUEUE_LIMIT = 8;

/** Screen 01 */
export default function OverviewPage() {
  const data = useQuery((db) => {
    const names = new Map(db.players.map((p) => [p.player_id, p.display_name]));
    const pendingReports = selectVisibleReports(db).filter((r) => r.status === "pending").sort((a, b) => a.created_at.localeCompare(b.created_at));
    const openDisputes = db.disputes.filter(isDisputeUnresolved).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const suspendedLeagues = MINI_LEAGUES_ENABLED ? db.mini_leagues.filter((l) => l.status === "suspended") : [];
    const lastSuspended = (leagueId: string) =>
      db.activity_log
        .filter((a) => a.target_type === "mini_league" && a.target_id === leagueId && a.action === "suspend_league")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.created_at ?? null;

    const matchLabel = (matchId: string) => {
      const m = db.matches.find((x) => x.match_id === matchId);
      if (!m) return matchId;
      const side = (ids: string[]) => ids.map((id) => names.get(id) ?? id).join(" & ");
      return `${side(m.side_a)} vs ${side(m.side_b)}`;
    };

    return {
      counts: {
        pendingReports: pendingReports.length,
        openDisputes: openDisputes.length,
        suspendedPlayers: db.players.filter((p) => p.status === "suspended").length,
        hiddenPosts: db.game_posts.filter((p) => p.status === "hidden").length,
        activeLeagues: db.mini_leagues.filter((l) => l.status === "active").length,
        publishedCards: db.admin_posts.filter((p) => p.status === "published").length,
        players: db.players.length,
      },
      reports: pendingReports.map<QueueItem>((r) => ({
        key: r.report_id,
        href: `/reports/${r.report_id}`,
        title: r.reason,
        detail: `${TARGET_TYPE_LABEL[r.target_type]} report from ${names.get(r.reported_by_player_id) ?? r.reported_by_player_id}`,
        at: r.created_at,
        status: r.status,
      })),
      disputes: openDisputes.map<QueueItem>((d) => ({
        key: d.dispute_id,
        href: `/disputes/${d.dispute_id}`,
        title: `Disputed result: ${matchLabel(d.match_id)}`,
        detail: d.reason,
        at: d.created_at,
        status: d.status,
      })),
      leagues: suspendedLeagues.map<QueueItem>((l) => ({
        key: l.league_id,
        href: `/mini-leagues/${l.league_id}`,
        title: l.name,
        detail: l.suspended_by_account_suspension ? "Suspended with the organiser's account" : "Suspended Mini League",
        at: lastSuspended(l.league_id) ?? l.created_at,
        status: l.status,
      })),
      activity: selectVisibleActivity(db)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 6)
        .map((entry) => ({ entry, href: resolveTarget(db, entry.target_type, entry.target_id).href })),
    };
  });

  const { counts } = data;
  const sections = [
    { title: "Pending reports", note: "Oldest first", items: data.reports, more: "/reports" },
    { title: "Open disputes", note: "Oldest first", items: data.disputes, more: "/disputes" },
    ...(MINI_LEAGUES_ENABLED ? [{ title: "Suspended Mini Leagues", note: undefined, items: data.leagues, more: "/mini-leagues" }] : []),
  ];
  const queueSize = data.reports.length + data.disputes.length + data.leagues.length;

  return (
    <>
      <PageHeader title="Overview" meta={<LiveIndicator />} />

      <div className="space-y-8">
        <StatGroup>
          <StatTile label="Pending reports" value={counts.pendingReports} tone={counts.pendingReports ? "warning" : undefined} />
          <StatTile label="Open disputes" value={counts.openDisputes} tone={counts.openDisputes ? "danger" : undefined} />
          <StatTile label="Suspended players" value={counts.suspendedPlayers} />
          <StatTile label="Hidden posts" value={counts.hiddenPosts} />
          {MINI_LEAGUES_ENABLED && <StatTile label="Active leagues" value={counts.activeLeagues} />}
          <StatTile label="Published cards" value={counts.publishedCards} hint="Home carousel" />
          <StatTile label="Total players" value={counts.players} />
        </StatGroup>

        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0">
            <SectionHeading
              title="Needs attention"
              description={queueSize ? `${queueSize} item${queueSize === 1 ? "" : "s"} waiting on an administrator` : undefined}
            />
            {queueSize === 0 ? (
              <div className="rounded-lg border border-line bg-surface">
                <EmptyState title="All clear" description={MINI_LEAGUES_ENABLED ? "No pending reports, open disputes or suspended leagues." : "No pending reports or open disputes."} />
              </div>
            ) : (
              <div className="space-y-6">
                {sections
                  .filter((s) => s.items.length > 0)
                  .map((s) => (
                    <section key={s.title} aria-label={s.title}>
                      <div className="flex items-baseline justify-between gap-3 pb-2">
                        <h3 className="text-[13px] font-medium text-ink">
                          {s.title}
                          <span className="ml-1.5 font-normal text-ink-faint tabular-nums">{s.items.length}</span>
                          {s.note && <span className="ml-2 text-xs font-normal text-ink-faint">· {s.note}</span>}
                        </h3>
                        <Link href={s.more} className="text-[13px] text-brand hover:underline">
                          View all
                        </Link>
                      </div>
                      <ul className="divide-y divide-line border-y border-line">
                        {s.items.slice(0, QUEUE_LIMIT).map((item) => (
                          <li key={item.key}>
                            <Link href={item.href} className="-mx-2 flex items-center gap-4 rounded-md px-2 py-2.5 hover:bg-subtle">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-ink">{item.title}</div>
                                <div className="truncate text-[13px] text-ink-muted">{item.detail}</div>
                              </div>
                              <StatusBadge status={item.status} />
                              <span className="hidden w-36 shrink-0 text-right text-xs whitespace-nowrap text-ink-faint tabular-nums sm:block">
                                {formatDateTime(item.at)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
              </div>
            )}
          </section>

          <section className="min-w-0">
            <SectionHeading
              title="Recent activity"
              actions={
                <Link href="/activity-log" className="text-[13px] text-brand hover:underline">
                  Activity log
                </Link>
              }
            />
            {data.activity.length === 0 ? (
              <p className="text-[13px] text-ink-muted">No admin actions yet.</p>
            ) : (
              <ol className="divide-y divide-line border-y border-line">
                {data.activity.map(({ entry: e, href }) => {
                  const body = (
                    <>
                      <div className="text-[13px] font-medium text-ink">{ACTION_LABEL[e.action] ?? humanize(e.action)}</div>
                      <div className="line-clamp-2 text-[13px] text-ink-muted">{e.details}</div>
                      <div className="mt-0.5 text-xs text-ink-faint">
                        {TARGET_TYPE_LABEL[e.target_type] ?? humanize(e.target_type)} · {formatDateTime(e.created_at)}
                      </div>
                    </>
                  );
                  // Links to the record, like the Activity log; plain text once the record is gone.
                  return (
                    <li key={e.log_id}>
                      {href ? (
                        <Link href={href} className="-mx-2 block rounded-md px-2 py-2.5 hover:bg-subtle">
                          {body}
                        </Link>
                      ) : (
                        <div className="py-2.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
