import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import type { GamePost, MiniLeague, Player } from "@/lib/types";
import { PlayerLink } from "./PlayerProfileCard";
import { StatusBadge } from "./StatusBadge";

/** Shared frame: a title row with actions, an optional description, then a dot-separated meta line (strings) and any linked items. */
function SummaryFrame({ title, description, meta, actions }: { title: ReactNode; description?: ReactNode; meta: ReactNode[]; actions?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{title}</div>
          {description}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {/* Text facts form one run so a wrapped line never starts with a separator; linked items (organiser) get their own line. */}
      <p className="mt-2 text-[13px] text-ink-muted">{meta.filter((m) => typeof m === "string").join(" · ")}</p>
      {meta
        .filter((m) => typeof m !== "string")
        .map((item, i) => (
          <div key={i} className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-muted">
            {item}
          </div>
        ))}
    </div>
  );
}

/** Game post as players see it, with moderation status. Used in report detail and moderation. */
export function GamePostSummary({ post, organiser, actions }: { post: GamePost; organiser: Player | null; actions?: ReactNode }) {
  const spots = [
    post.spots_total === null ? null : post.spots_filled === null ? `${post.spots_total} players` : `${post.spots_filled}/${post.spots_total}`,
    humanize(post.format),
    post.skill_band,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <SummaryFrame
      actions={actions}
      title={
        <>
          <span className="text-sm font-semibold text-ink">{post.title}</span>
          <StatusBadge status={post.status} />
          {post.hidden_by_account_suspension && <StatusBadge status="suspended" label="Hidden by account suspension" tone="neutral" />}
        </>
      }
      description={
        <>
          {post.notes && <p className="mt-1 text-sm text-ink-muted">{post.notes}</p>}
          {post.deleted_at && (
            <p className="mt-1 text-[13px] text-danger">
              Deleted {formatDateTime(post.deleted_at)}
              {post.deletion_reason ? `: ${post.deletion_reason}` : ""}
            </p>
          )}
        </>
      }
      meta={[
        formatDateTime(post.proposed_time),
        [post.venue, post.suburb].filter(Boolean).join(", ") || "Location not set",
        spots,
        <>
          Organiser:{" "}
          {post.organiser_group_id ? (
            <span className="text-ink">{post.organiser_group_name ?? "A group"}</span>
          ) : (
            <PlayerLink player={organiser} fallbackId={post.organiser_id} />
          )}
        </>,
      ]}
    />
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
    <SummaryFrame
      actions={actions}
      title={
        <>
          {linkName ? (
            <Link href={`/mini-leagues/${league.league_id}`} className="text-sm font-semibold text-ink hover:text-brand">
              {league.name}
            </Link>
          ) : (
            <span className="text-sm font-semibold text-ink">{league.name}</span>
          )}
          <StatusBadge status={league.status} />
        </>
      }
      description={league.description && <p className="mt-1 text-sm text-ink-muted">{league.description}</p>}
      meta={[
        `${formatDate(league.start_date)} – ${formatDate(league.end_date)}`,
        [league.suburb, league.format].filter(Boolean).join(" · ") || "Location not set",
        `${league.member_ids.length}${league.max_members === null ? "" : `/${league.max_members}`} members`,
        <>
          Organiser: <PlayerLink player={organiser} fallbackId={league.organiser_id} />
        </>,
      ]}
    />
  );
}
