"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { KpiTile, NotTracked, SampleDataNotice } from "@/components/analytics/AnalyticsParts";
import { DateRangePicker } from "@/components/analytics/DateRangePicker";
import { Card, CardBody, CardHeader } from "@/components/shared/Card";
import { ColumnChart } from "@/components/shared/Charts";
import { PageHeader } from "@/components/shared/PageHeader";
import { useMetric, useRangeControl } from "./useMetric";

function BreakdownLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
      View breakdown
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
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

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="New users" value={newUsers.total} previous={newUsers.previous} days={days} unavailable={newUsers.unavailable} />
        <KpiTile label="Reports received" value={reports.total} previous={reports.previous} days={days} unavailable={reports.unavailable} />
        <KpiTile label="League joins" value={leagueJoins.total} previous={leagueJoins.previous} days={days} unavailable={leagueJoins.unavailable} />
        <KpiTile label="League matches" value={leagueMatches.total} previous={leagueMatches.previous} days={days} unavailable={leagueMatches.unavailable} />
        <KpiTile label="Games published" value={published.total} previous={published.previous} days={days} unavailable={published.unavailable} />
        <KpiTile label="Games filled" value={filled.total} previous={filled.previous} days={days} unavailable={filled.unavailable} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="New users" actions={<BreakdownLink href="/analytics/new-users" />} />
          <CardBody>
            <ColumnChart title={`${unit} sign-ups`} points={newUsers.points} valueLabel="New users" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Reports received" actions={<BreakdownLink href="/analytics/reports-received" />} />
          <CardBody>
            <ColumnChart title={`${unit} reports`} points={reports.points} valueLabel="Reports" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Mini League activity" actions={<BreakdownLink href="/analytics/mini-league-activity" />} />
          <CardBody>
            {leagueJoins.unavailable ? (
              <NotTracked label="Mini League activity" />
            ) : (
              <ColumnChart title={`${unit} league joins`} summary={`${leagueMatches.total.toLocaleString("en-AU")} league matches`} points={leagueJoins.points} valueLabel="Joins" />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Games published" actions={<BreakdownLink href="/analytics/games-published" />} />
          <CardBody>
            {published.unavailable ? (
              <NotTracked label="Games published" />
            ) : (
              <ColumnChart title={`${unit} games published`} summary={`${filled.total.toLocaleString("en-AU")} filled`} points={published.points} valueLabel="Games" />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
