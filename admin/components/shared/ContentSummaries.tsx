import Link from "next/link";
import { CalendarDays, MapPin, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { formatDate, formatDateTime } from "@/lib/format";
import type { GamePost, MiniLeague, Player } from "@/lib/types";
import { PlayerLink } from "./PlayerProfileCard";
import { StatusBadge } from "./StatusBadge";

/** Game post as players see it, with moderation status. Used in report detail and moderation. */
export function GamePostSummary({ post, organiser, actions }: { post: GamePost; organiser: Player | null; actions?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{post.title}</span>
            <StatusBadge status={post.status} />
            {post.hidden_by_account_suspension && <StatusBadge status="suspended" label="Hidden by account suspension" tone="neutral" />}
          </div>
          {post.notes && <p className="mt-1 text-sm text-ink-muted">{post.notes}</p>}
          {post.deleted_at && (
            <p className="mt-1 text-sm text-danger">
              Deleted {formatDateTime(post.deleted_at)}
              {post.deletion_reason ? `: ${post.deletion_reason}` : ""}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-5 py-3 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-4" aria-hidden />
          {formatDateTime(post.proposed_time)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4" aria-hidden />
          {[post.venue, post.suburb].filter(Boolean).join(", ") || "Location not set"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <UsersRound className="size-4" aria-hidden />
          {[
            post.spots_total === null ? null : post.spots_filled === null ? `${post.spots_total} players` : `${post.spots_filled}/${post.spots_total}`,
            post.format,
            post.skill_band,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          Organiser:{" "}
          {post.organiser_group_id ? (
            <span className="text-ink">{post.organiser_group_name ?? "A group"}</span>
          ) : (
            <PlayerLink player={organiser} fallbackId={post.organiser_id} />
          )}
        </span>
      </div>
    </div>
  );
}

/** Mini League summary. Used in report detail and moderation. */
export function MiniLeagueSummary({
  league,
  organiser,
  actions,
  linkName = true,
}: {
  league: MiniLeague;
  organiser: Player | null;
  actions?: ReactNode;
  /** Off on the league's own detail page. */
  linkName?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {linkName ? (
              <Link href={`/mini-leagues/${league.league_id}`} className="font-semibold text-ink hover:text-brand hover:underline">
                {league.name}
              </Link>
            ) : (
              <span className="font-semibold text-ink">{league.name}</span>
            )}
            <StatusBadge status={league.status} />
          </div>
          {league.description && <p className="mt-1 text-sm text-ink-muted">{league.description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-5 py-3 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-4" aria-hidden />
          {formatDate(league.start_date)} – {formatDate(league.end_date)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4" aria-hidden />
          {[league.suburb, league.format].filter(Boolean).join(" · ") || "Location not set"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <UsersRound className="size-4" aria-hidden />
          {league.member_ids.length}
          {league.max_members === null ? "" : `/${league.max_members}`} members
        </span>
        <span className="inline-flex items-center gap-1.5">
          Organiser: <PlayerLink player={organiser} fallbackId={league.organiser_id} />
        </span>
      </div>
    </div>
  );
}
