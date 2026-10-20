"use client";

import { usePathname } from "next/navigation";
import { BackendGapNotice } from "@/components/shared/BackendGapNotice";
import { featureGap } from "@/lib/api/capabilities";
import { IS_API } from "@/lib/config";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs } from "@/components/shared/Tabs";
import { useQuery } from "@/lib/mock-api";

/** Shared header and sub-nav for the content moderation screens (24-31). */
export default function ModerationLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const counts = useQuery((db) => ({
    posts: db.game_posts.length,
    leagues: db.mini_leagues.length,
    deleted: db.deleted_records.length,
  }));

  return (
    <>
      <PageHeader title="Content moderation" description="Review game posts and Mini Leagues players can see, and hide, suspend or remove content that breaks the rules." />
      <Tabs
        label="Moderation sections"
        tabs={[
          { id: "posts", label: "Game posts", href: "/moderation/game-posts", count: counts.posts },
          { id: "leagues", label: "Mini Leagues", href: "/moderation/mini-leagues", count: counts.leagues },
          { id: "deleted", label: "Deleted records", href: "/moderation/deleted", count: counts.deleted },
        ]}
      />
      <BackendGapNotice
        message={IS_API ? "You can review active content and retained game-post deletions. Hiding, restoring, suspending and administrator deletion are not available yet." : null}
      />
      {pathname === "/moderation/deleted" && <BackendGapNotice message={featureGap("deletedRecords")} />}
      {children}
    </>
  );
}
