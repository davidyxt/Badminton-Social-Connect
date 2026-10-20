"use client";

import { KpiTile, NotTracked, SampleDataNotice } from "@/components/analytics/AnalyticsParts";
import { DateRangePicker } from "@/components/analytics/DateRangePicker";
import { isWeekly } from "@/components/analytics/range";
import { Card, CardBody, SectionHeading, StatGroup, StatTile } from "@/components/shared/Card";
import { ColumnChart } from "@/components/shared/Charts";
import { PageHeader } from "@/components/shared/PageHeader";
import type { AnalyticsMetric } from "@/lib/mock-api";
import { useMetric, useRangeControl } from "./useMetric";

export interface MetricSpec {
  metric: AnalyticsMetric;
  /** e.g. "League joins" */
  label: string;
  /** Column header in the table view, e.g. "Joins" */
  valueLabel: string;
  description: string;
}

/** `heading` is off when the page shows one metric, since the page title already names it. */
function MetricSection({ spec, unit, heading }: { spec: MetricSpec; unit: string; heading: boolean }) {
  const m = useMetric(spec.metric);
  return (
    <section className="min-w-0">
      {heading && <SectionHeading title={spec.label} description={spec.description} />}
      <Card>
        <CardBody>
          {m.unavailable ? <NotTracked label={spec.label} /> : <ColumnChart title={`${spec.label}, ${unit}`} points={m.points} valueLabel={spec.valueLabel} />}
        </CardBody>
      </Card>
    </section>
  );
}

function MetricTiles({ spec }: { spec: MetricSpec }) {
  const m = useMetric(spec.metric);
  const avg = m.total / m.days;
  return (
    <>
      <KpiTile label={`${spec.label} (total)`} value={m.total} previous={m.previous} days={m.days} unavailable={m.unavailable} />
      <StatTile
        label="Daily average"
        value={m.unavailable ? <span className="text-ink-faint">—</span> : avg.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
        hint={m.unavailable ? "Not tracked yet" : `Over ${m.days} days`}
      />
    </>
  );
}

/** Layout shared by the analytics breakdown screens (04–07). One chart per metric, side by side. */
export function MetricBreakdown({ title, description, metrics }: { title: string; description: string; metrics: MetricSpec[] }) {
  const control = useRangeControl();
  const unit = isWeekly(control.value.from, control.value.to) ? "per week" : "per day";

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Usage & Analytics", href: "/analytics" }, { label: title }]} title={title} description={description} />
      <SampleDataNotice />
      <DateRangePicker {...control} />
      <div className="space-y-8">
        <StatGroup className={metrics.length > 1 ? "" : "lg:max-w-md"}>
          {metrics.map((spec) => (
            <MetricTiles key={spec.metric} spec={spec} />
          ))}
        </StatGroup>
        <div className={`grid gap-x-6 gap-y-8 ${metrics.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {metrics.map((spec) => (
            <MetricSection key={spec.metric} spec={spec} unit={unit} heading={metrics.length > 1} />
          ))}
        </div>
      </div>
    </>
  );
}
