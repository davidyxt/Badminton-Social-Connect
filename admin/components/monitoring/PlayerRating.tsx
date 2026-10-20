"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { Card, CardBody, CardHeader, DetailList, Notice } from "@/components/shared/Card";
import { LineChart } from "@/components/shared/Charts";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ReadFeedback } from "./ReadFeedback";
import { useConsoleRead } from "@/lib/hooks/useConsoleRead";
import type { RatingCard, RatingTrend, RatingHistoryRow, Registration } from "@/lib/api/reads";
import { formatDateTime, formatShortDate } from "@/lib/format";

export function PlayerRating({ playerId, history = false }: { playerId: string; history?: boolean }) {
  const [page, setPage] = useState(1);
  const card = useConsoleRead<RatingCard | null>(`/users/${playerId}/rating`);
  const registration = useConsoleRead<Registration>(`/users/${playerId}/registration`);
  const trend = useConsoleRead<RatingTrend | null>(history ? `/users/${playerId}/rating_trend` : null, { days: 30 });
  const changes = useConsoleRead<RatingHistoryRow[]>(history ? `/users/${playerId}/rating_history` : null, { page, limit: 25 });
  const rating = card.response?.data;
  const account = registration.response?.data;
  return <div className="space-y-6">
    <Card>
      <CardHeader title="Singles rating & registration" description="Read-only. Ratings come from the shared rating engine." />
      <CardBody>
        <ReadFeedback {...registration} /><ReadFeedback {...card} />
        {account && <div className="mb-4"><DetailList items={[
          { label: "Registration", value: <StatusBadge status={account.state} /> },
          { label: "Registered", value: formatDateTime(account.registered_at) },
          { label: "Deleted", value: formatDateTime(account.deleted_at) },
        ]} /></div>}
        {rating ? <DetailList items={[
          { label: "Rating", value: `${rating.rating}${rating.isStartingRating ? " (starting rating)" : ""}` },
          { label: "Status", value: rating.status }, { label: "Grade", value: rating.grade ?? "Not established yet" },
          { label: "Rating uncertainty (RD)", value: rating.rd },
          { label: "Placement matches", value: `${rating.placement.played} / ${rating.placement.required}` },
          { label: "Distinct opponents", value: `${rating.placement.opponents} / ${rating.placement.opponentsRequired}` },
          { label: "State rank", value: rating.stateRank === null ? "—" : `${rating.stateRank} (${rating.state ?? "State"})` },
          { label: "Nearby rank", value: rating.nearbyRank === null ? "—" : `${rating.nearbyRank} (${rating.suburb ?? "Nearby"})` },
          { label: "30-day change", value: rating.change30Days ?? "—" },
          { label: "Ratings last updated", value: formatDateTime(rating.ratingsUpdatedAt) },
        ]} /> : !card.loading && !card.error && <p className="text-sm text-ink-muted">No shared rating card is available for this account. Retained rating history is shown separately when available.</p>}
      </CardBody>
    </Card>
    {history && <>
      <Notice>Singles rating history records changes after processed matches. It may be replayed by the rating engine. Weekly leaderboard snapshots and doubles history are not available.</Notice>
      <Card><CardHeader title="30-day singles rating trend" /><CardBody>
        <ReadFeedback {...trend} />
        {trend.response && <LineChart title="Singles rating" valueLabel="Rating" points={(trend.response.data?.points ?? []).map((p) => ({ label: formatShortDate(p.date), value: p.rating }))} />}
      </CardBody></Card>
      <Card><CardHeader title="Rating changes" description={`${changes.response?.pagination?.total ?? "—"} retained records`} /><CardBody>
        <ReadFeedback {...changes} />
        {changes.response && <>
          {changes.response.data.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Played", "Before → After", "Change", "RD before → after", "Match"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>
            {changes.response.data.map((h) => <tr key={h.history_id} className="border-t border-line"><td className="p-2">{formatDateTime(h.played_at)}</td><td className="p-2">{Math.round(h.rating_before)} → {Math.round(h.rating_after)}</td><td className="p-2">{(h.rating_after - h.rating_before).toFixed(1)}</td><td className="p-2">{Math.round(h.rd_before)} → {Math.round(h.rd_after)}</td><td className="p-2"><Link className="text-brand underline" href={`/games/${h.match_id}`}>View match</Link></td></tr>)}
          </tbody></table></div> : <p className="text-sm text-ink-muted">No processed rating changes recorded.</p>}
          <div className="mt-4 flex items-center gap-3"><Button size="sm" disabled={page === 1} onClick={() => setPage((n) => n - 1)}>Previous</Button><span className="text-sm">Page {page}</span><Button size="sm" disabled={page * 25 >= (changes.response.pagination?.total ?? 0)} onClick={() => setPage((n) => n + 1)}>Next</Button></div>
        </>}
      </CardBody></Card>
    </>}
  </div>;
}
