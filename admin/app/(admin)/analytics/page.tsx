"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { KpiTile, NotTracked, SampleDataNotice } from "@/components/analytics/AnalyticsParts";
import { DateRangePicker } from "@/components/analytics/DateRangePicker";
import { Card, CardBody, SectionHeading, StatGroup } from "@/components/shared/Card";
import { ColumnChart } from "@/components/shared/Charts";
import { PageHeader } from "@/components/shared/PageHeader";
import { useMetric, useRangeControl } from "./useMetric";

function BreakdownLink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-[13px] text-brand hover:underline">
      View breakdown
    </Link>
  );
}

/** A heading with a breakdown link above one lightly framed chart. */
function ChartSection({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <SectionHeading title={title} actions={<BreakdownLink href={href} />} />
      <Card>
        <CardBody>{children}</CardBody>
      </Card>
    </section>
  );
}

/** Screens 02 (usage overview) and 03 (custom date range open). */
export default function AnalyticsPage() {
  const control = useRangeControl();
  const newUsers = useMetric("new_users");
  const reports = useMetric("reports_received");
  const leagueJoins = useMetric("league_joins");
  const leagueMatches = useMetric("league_matches");
  const published = useMetric("games_published");
  const filled = useMetric("games_filled");
  const { days } = newUsers;
  const unit = days > 31 ? "Per week" : "Per day";

  return (
    <>
      <PageHeader title="Usage & Analytics" description="How players are using the app over the selected period." />
      <SampleDataNotice />
      <DateRangePicker {...control} />

      <div className="space-y-8">
        <StatGroup>
          <KpiTile label="New users" value={newUsers.total} previous={newUsers.previous} days={days} unavailable={newUsers.unavailable} />
          <KpiTile label="Reports received" value={reports.total} previous={reports.previous} days={days} unavailable={reports.unavailable} />
          <KpiTile label="League joins" value={leagueJoins.total} previous={leagueJoins.previous} days={days} unavailable={leagueJoins.unavailable} />
          <KpiTile label="League matches" value={leagueMatches.total} previous={leagueMatches.previous} days={days} unavailable={leagueMatches.unavailable} />
          <KpiTile label="Games published" value={published.total} previous={published.previous} days={days} unavailable={published.unavailable} />
          <KpiTile label="Games filled" value={filled.total} previous={filled.previous} days={days} unavailable={filled.unavailable} />
        </StatGroup>

        <div className="grid gap-x-6 gap-y-8 lg:grid-cols-2">
          <ChartSection title="New users" href="/analytics/new-users">
            <ColumnChart title={`${unit} sign-ups`} points={newUsers.points} valueLabel="New users" />
          </ChartSection>
          <ChartSection title="Reports received" href="/analytics/reports-received">
            <ColumnChart title={`${unit} reports`} points={reports.points} valueLabel="Reports" />
          </ChartSection>
          <ChartSection title="Mini League activity" href="/analytics/mini-league-activity">
            {leagueJoins.unavailable ? (
              <NotTracked label="Mini League activity" />
            ) : (
              <ColumnChart title={`${unit} league joins`} summary={`${leagueMatches.total.toLocaleString("en-AU")} league matches`} points={leagueJoins.points} valueLabel="Joins" />
            )}
          </ChartSection>
          <ChartSection title="Games published" href="/analytics/games-published">
            {published.unavailable ? (
              <NotTracked label="Games published" />
            ) : (
              <ColumnChart title={`${unit} games published`} summary={`${filled.total.toLocaleString("en-AU")} filled`} points={published.points} valueLabel="Games" />
            )}
          </ChartSection>
        </div>
      </div>
    </>
  );
}
