"use client";

import { usePathname } from "next/navigation";
import { BackendGapNotice } from "@/components/shared/BackendGapNotice";
import { featureGap } from "@/lib/api/capabilities";
import { IS_API } from "@/lib/config";
import { MINI_LEAGUES_ENABLED, isVisibleTargetType } from "@/lib/features";
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
    deleted: db.deleted_records.filter((r) => isVisibleTargetType(r.target_type)).length,
  }));

  const actionsGap = IS_API
    ? "Hiding and restoring aren't available yet: the database has no visibility state (DB03). Deleting is blocked until product agrees how deletion affects rankings (DB06). You can review content, but the actions are disabled."
    : null;

  return (
    <>
      <PageHeader title="Content moderation" />
      <Tabs
        label="Moderation sections"
        tabs={[
          { id: "posts", label: "Game posts", href: "/moderation/game-posts", count: counts.posts },
          ...(MINI_LEAGUES_ENABLED ? [{ id: "leagues", label: "Mini Leagues", href: "/moderation/mini-leagues", count: counts.leagues }] : []),
          { id: "deleted", label: "Deleted records", href: "/moderation/deleted", count: counts.deleted },
        ]}
      />
      {/* One quiet notice per page: the shared action gap, plus the deleted-records gap on that tab. */}
      <BackendGapNotice message={[actionsGap, pathname === "/moderation/deleted" ? featureGap("deletedRecords") : null].filter(Boolean).join(" ") || null} />
      {children}
    </>
  );
}
