"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs } from "@/components/shared/Tabs";
import { MINI_LEAGUES_ENABLED } from "@/lib/features";

/** Shared header and sub-nav for screens 15 and 16. */
export default function RankingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Rankings" description="Read-only leaderboards." />
      {/* With Mini Leagues out of scope, Singles is the only leaderboard, so there's nothing to switch between. */}
      {MINI_LEAGUES_ENABLED && (
        <Tabs
          label="Rankings"
          tabs={[
            { id: "singles", label: "Singles", href: "/rankings/singles" },
            { id: "mini-league", label: "Mini League", href: "/rankings/mini-league" },
          ]}
        />
      )}
      {children}
    </>
  );
}
