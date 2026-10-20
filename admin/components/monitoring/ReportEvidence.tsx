"use client";
import { Card, CardBody, CardHeader, Notice } from "@/components/shared/Card";
import { useConsoleRead } from "@/lib/hooks/useConsoleRead";
import type { ReportContext } from "@/lib/api/reads";
import { ReadFeedback } from "./ReadFeedback";
import { SnapshotDetails } from "./SnapshotDetails";

export function ReportEvidence({ reportId, showCurrentTarget = false }: { reportId: string; showCurrentTarget?: boolean }) {
  const read = useConsoleRead<ReportContext>(`/reports/${reportId}/context`);
  const context = read.response?.data;
  return <Card><CardHeader title="Evidence captured when reported" description="Original submission snapshot. Current content may have changed since the report." /><CardBody>
    <ReadFeedback {...read} />
    {context && <>
      {context.evidence_snapshot ? <SnapshotDetails value={context.evidence_snapshot} /> : <p className="text-sm text-ink-muted">No evidence snapshot was recorded for this report.</p>}
      {context.target_missing && <div className="mt-4"><Notice>The current target is unavailable. Any captured evidence above remains the original record.</Notice></div>}
      {showCurrentTarget && context.target && <details className="mt-4"><summary className="cursor-pointer font-medium">Current reported content</summary><div className="mt-3"><SnapshotDetails value={context.target} /></div></details>}
    </>}
  </CardBody></Card>;
}
