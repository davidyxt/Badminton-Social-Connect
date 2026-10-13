"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs } from "@/components/shared/Tabs";

/** Shared header and sub-nav for screens 15 and 16. */
export default function RankingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Rankings" description="Read-only leaderboards. Ratings can't be edited from the console." />
      <Tabs
        label="Rankings"
        tabs={[
          { id: "singles", label: "Singles", href: "/rankings/singles" },
          { id: "mini-league", label: "Mini League", href: "/rankings/mini-league" },
        ]}
      />
      {children}
    </>
  );
}
