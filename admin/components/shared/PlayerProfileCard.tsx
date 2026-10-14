import Link from "next/link";
import { BadgeCheck, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import type { Player, PlayerProfile, Ranking } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const cls = size === "lg" ? "size-14 text-lg" : size === "sm" ? "size-7 text-xs" : "size-9 text-sm";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand ${cls}`} aria-hidden>
      {initials}
    </span>
  );
}

/** Name + avatar, linking to the player profile. */
export function PlayerLink({ player, fallbackId }: { player: Player | null | undefined; fallbackId?: string | null }) {
  if (!player) return <span className="text-ink-faint">{fallbackId ?? "Unknown player"}</span>;
  return (
    <Link href={`/users/${player.player_id}`} className="inline-flex items-center gap-2 font-medium text-ink hover:text-brand hover:underline">
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
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={player.display_name} size={compact ? "md" : "lg"} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {compact ? (
                <Link href={`/users/${player.player_id}`} className="font-semibold text-ink hover:text-brand hover:underline">
                  {player.display_name}
                </Link>
              ) : (
                <span className="text-lg font-semibold text-ink">{player.display_name}</span>
              )}
              {player.is_verified && <BadgeCheck className="size-4 text-brand" aria-label="Verified" />}
              <StatusBadge status={player.account_state === "deleted" ? "deleted" : player.status} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
              <span>{player.email}</span>
              {profile && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden />
                  {profile.suburb}, {profile.state}
                </span>
              )}
              <span>Joined {formatDate(player.joined_at)}</span>
            </div>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
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
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="border-line px-5 py-3 [&:not(:first-child)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</dd>
      {sub && <dd className="text-xs text-ink-faint">{sub}</dd>}
    </div>
  );
}
