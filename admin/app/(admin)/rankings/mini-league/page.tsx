"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Card, SectionHeading } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { PlayerLink } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, humanize } from "@/lib/format";
import { selectPlayerMap, useQuery } from "@/lib/mock-api";

/** Screen 16 (read-only). */
export default function MiniLeagueRankingsPage() {
  const [picked, setPicked] = useState<string | null>(null);

  const { leagues, standings, players } = useQuery((db) => ({
    leagues: db.mini_leagues,
    standings: db.league_standings,
    players: selectPlayerMap(db),
  }));

  if (leagues.length === 0) {
    return (
      <Card>
        <EmptyState title="No Mini Leagues yet" description="Standings appear here once a league has started." />
      </Card>
    );
  }

  const fallback = leagues.find((l) => l.status === "active") ?? leagues[0];
  const league = leagues.find((l) => l.league_id === picked) ?? fallback;
  const rows = standings
    .filter((s) => s.league_id === league.league_id)
    .sort((a, b) => b.points - a.points || b.won - a.won || a.lost - b.lost);

  return (
    <>
      <div className="mb-6">
        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          League
          <select
            value={league.league_id}
            onChange={(e) => setPicked(e.target.value)}
            className="h-8 max-w-[320px] rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink transition-colors hover:border-ink-faint/60 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
          >
            {leagues.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section>
        <SectionHeading
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              {league.name}
              <StatusBadge status={league.status} />
            </span>
          }
          description={`${humanize(league.format)} · ${league.suburb} · ${formatDate(league.start_date)} – ${formatDate(league.end_date)} · 3 points a win, 1 a loss`}
          actions={
            <Link href={`/mini-leagues/${league.league_id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
              League details
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState title="No standings yet" description="Standings appear once league matches have results." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{league.name} standings</caption>
                <thead className="border-b border-line bg-subtle text-xs font-medium text-ink-muted">
                  <tr>
                    <th scope="col" className="w-14 px-4 py-2 text-right font-medium">#</th>
                    <th scope="col" className="px-4 py-2 font-medium">Player</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Played</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Won</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Lost</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((s, i) => (
                    <tr key={s.player_id} className="hover:bg-subtle">
                      <td className="px-4 py-2.5 text-right text-ink-muted tabular-nums">{i + 1}</td>
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
        </Card>
      </section>
    </>
  );
}
