import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { Player, PlayerProfile, Ranking } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = (name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const cls = size === "lg" ? "size-10 text-sm" : size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-soft font-medium text-ink-muted ${cls}`} aria-hidden>
      {initials}
    </span>
  );
}

/** Name + avatar, linking to the player profile. */
export function PlayerLink({ player, fallbackId }: { player: Player | null | undefined; fallbackId?: string | null }) {
  if (!player) return <span className="text-ink-faint">{fallbackId ?? "Unknown player"}</span>;
  return (
    <Link href={`/users/${player.player_id}`} className="inline-flex items-center gap-2 font-medium text-ink hover:text-brand">
      <Avatar name={player.display_name} size="sm" />
      {player.display_name}
      {player.status === "suspended" && <StatusBadge status="suspended" />}
    </Link>
  );
}

export function reliabilityTone(score: number) {
  return score >= 85 ? "text-success" : score >= 70 ? "text-warning" : "text-danger";
}

/**
 * Summary block (rating, reliability, games played) shown on the player
 * profile and wherever a report targets a player.
 */
export function PlayerProfileCard({
  player,
  profile,
  ranking,
  actions,
  compact,
}: {
  player: Player;
  profile: PlayerProfile | null;
  ranking?: Ranking | null;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={player.display_name} size={compact ? "md" : "lg"} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {compact ? (
                <Link href={`/users/${player.player_id}`} className="text-sm font-semibold text-ink hover:text-brand">
                  {player.display_name}
                </Link>
              ) : (
                <span className="text-base font-semibold text-ink">{player.display_name}</span>
              )}
              {player.is_verified && <BadgeCheck className="size-4 text-brand" aria-label="Verified" />}
              {player.registration_state === "deleted" ? (
                <StatusBadge status="deleted" label="Deleted" />
              ) : player.registration_state === "registration_pending" ? (
                <StatusBadge status="pending" label="Registration pending" tone="neutral" />
              ) : (
                <StatusBadge status={player.status} />
              )}
            </div>
            {/* One text run, so a wrapped line never starts with a separator. */}
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {[
                player.email,
                profile && (profile.suburb || profile.state) ? [profile.suburb, profile.state].filter(Boolean).join(", ") : null,
                `Joined ${formatDate(player.joined_at)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {/* Same divider pattern as StatGroup: tiles draw right/bottom hairlines, the grid is pulled 1px under the clipped edge. */}
      <div className="overflow-hidden rounded-b-lg border-t border-line">
        <dl className="-mr-px -mb-px grid grid-cols-2 sm:grid-cols-4">
          <Stat label="Rating band" value={player.self_rating_band} sub={ranking ? `Singles ${ranking.ranking_points} pts · Band ${ranking.band}` : undefined} />
          <Stat
            label="Reliability"
            value={profile ? <span className={reliabilityTone(profile.reliability_score)}>{profile.reliability_score}%</span> : "—"}
          />
          <Stat label="Games played" value={profile?.games_played ?? "—"} />
          <Stat
            label="No-shows"
            value={profile ? <span className={profile.no_show_count >= 3 ? "text-danger" : ""}>{profile.no_show_count}</span> : "—"}
          />
        </dl>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 border-r border-b border-line px-4 py-3">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums text-ink">{value}</dd>
      {sub && <dd className="text-xs text-ink-faint">{sub}</dd>}
    </div>
  );
}
