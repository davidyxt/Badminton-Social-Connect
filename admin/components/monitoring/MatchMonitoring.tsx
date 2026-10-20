"use client";
import { useState } from "react";
import { Card, CardBody, CardHeader, DetailList, Notice } from "@/components/shared/Card";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useConsoleRead } from "@/lib/hooks/useConsoleRead";
import { useQuery, selectPlayerMap } from "@/lib/mock-api";
import type { MatchContext, ResultFlag } from "@/lib/api/reads";
import { formatDateTime, humanize } from "@/lib/format";
import { ReadFeedback } from "./ReadFeedback";
import { SnapshotDetails } from "./SnapshotDetails";

export function MatchMonitoring({ matchId }: { matchId: string }) {
  const [page, setPage] = useState(1);
  const context = useConsoleRead<MatchContext>(`/matches/${matchId}/context`);
  const flags = useConsoleRead<ResultFlag[]>("/result_flags", { match_id: matchId, page, limit: 25 });
  const players = useQuery(selectPlayerMap);
  const name = (id: string | null) => id ? players.get(id)?.display_name ?? id : "Not recorded";
  return <div className="space-y-6">
    <Card><CardHeader title="Submitted scores & confirmations" description="Stored opposing-side confirmations; this is not a complete per-player decision history." /><CardBody>
      <ReadFeedback {...context} />
      {context.response && <>
        {context.response.data.results.length ? context.response.data.results.map((r) => <div key={r.result_id} className="mb-4 border-b border-line pb-4 last:mb-0 last:border-0 last:pb-0"><DetailList items={[
          { label: "Result", value: r.result_id }, { label: "Status", value: <StatusBadge status={r.status} /> },
          { label: "Games (A–B)", value: r.games?.length ? r.games.map(([a, b]) => `${a}–${b}`).join(", ") : "Not recorded" },
          { label: "Submitted by", value: name(r.submitted_by) }, { label: "Submitted", value: formatDateTime(r.created_at) },
          { label: "Confirmed by", value: name(r.confirmed_by) }, { label: "Confirmed", value: formatDateTime(r.confirmed_at) },
        ]} /></div>) : <p className="text-sm text-ink-muted">No result has been submitted.</p>}
        {context.response.data.related_counts.results > context.response.data.results.length && <Notice>Showing the first {context.response.data.results.length} submissions of {context.response.data.related_counts.results}.</Notice>}
      </>}
    </CardBody></Card>
    <Card><CardHeader title="Result anomaly flags" description="Informational only. Flags do not block or reject a result." /><CardBody>
      <ReadFeedback {...flags} />
      {flags.response && <>
        {flags.response.data.length ? flags.response.data.map((f) => <div key={f.flag_id} className="mb-4 border-b border-line pb-4"><div className="font-medium">{humanize(f.kind)}</div><div className="mb-2 text-xs text-ink-muted">{formatDateTime(f.created_at)} · Result {f.result_id}</div><SnapshotDetails value={f.detail} /></div>) : <p className="text-sm text-ink-muted">No anomaly flags recorded for this match.</p>}
        <div className="mt-4 flex items-center gap-3"><Button size="sm" disabled={page === 1} onClick={() => setPage((n) => n - 1)}>Previous</Button><span className="text-sm">Page {page}</span><Button size="sm" disabled={page * 25 >= (flags.response.pagination?.total ?? 0)} onClick={() => setPage((n) => n + 1)}>Next</Button></div>
      </>}
    </CardBody></Card>
  </div>;
}
