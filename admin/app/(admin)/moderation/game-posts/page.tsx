"use client";

import { unavailableReason } from "@/lib/api/capabilities";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeOff, RotateCcw, Trash2, X } from "lucide-react";
import { Suspense, useState } from "react";
import { DeletePostModal, HidePostModal, RestorePostModal } from "@/components/modals/PostModals";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { Button } from "@/components/shared/Button";
import { DetailList, Notice, SectionHeading } from "@/components/shared/Card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PlayerLink } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs } from "@/components/shared/Tabs";
import { formatDateTime, humanize } from "@/lib/format";
import { useAdminAction } from "@/lib/hooks/useAdminAction";
import {
  admin_delete_post,
  admin_hide_post,
  admin_restore_post,
  selectActivityFor,
  selectDeletedRecord,
  selectGamePost,
  selectPlayer,
  selectReportsForTarget,
  useQuery,
} from "@/lib/mock-api";
import type { GamePost, Player } from "@/lib/types";

const BASE = "/moderation/game-posts";

interface Row {
  post: GamePost;
  organiser: Player | null;
  openReports: number;
}

type StatusTab = "all" | "published" | "hidden";
type Dialog = "hide" | "restore" | "delete" | null;

/** Screens 24 (list), 27 (post detail), 28 (hidden, restorable), 29 (hide), 30 (delete), 31 (restore). */
export default function GamePostModerationPage() {
  return (
    <Suspense fallback={null}>
      <GamePostModeration />
    </Suspense>
  );
}

function GamePostModeration() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("post");
  const [tab, setTab] = useState<StatusTab>("all");

  const rows = useQuery<Row[]>((db) => {
    const players = new Map(db.players.map((p) => [p.player_id, p]));
    return db.game_posts.map((post) => ({
      post,
      organiser: players.get(post.organiser_id) ?? null,
      openReports: db.reports.filter((r) => r.status === "pending" && r.target_type === "game_post" && r.target_id === post.post_id).length,
    }));
  });

  const hiddenCount = rows.filter((r) => r.post.status === "hidden").length;
  const visible = tab === "all" ? rows : rows.filter((r) => (tab === "hidden" ? r.post.status === "hidden" : r.post.status !== "hidden"));

  const columns: Column<Row>[] = [
    {
      id: "title",
      header: "Game post",
      sortValue: (r) => r.post.title,
      cell: (r) => (
        <div className="min-w-0">
          <div className={`font-medium ${r.post.post_id === selectedId ? "text-brand" : "text-ink"}`}>{r.post.title}</div>
          <div className="text-[13px] text-ink-muted">by {r.post.organiser_group_name ?? r.organiser?.display_name ?? (r.post.organiser_id || "a group")}</div>
        </div>
      ),
    },
    { id: "status", header: "Status", sortValue: (r) => r.post.status, cell: (r) => <StatusBadge status={r.post.status} /> },
    { id: "format", header: "Format", sortValue: (r) => r.post.format, cell: (r) => humanize(r.post.format) },
    { id: "suburb", header: "Suburb", sortValue: (r) => r.post.suburb, cell: (r) => r.post.suburb },
    {
      id: "time",
      header: "Proposed time",
      sortValue: (r) => r.post.proposed_time,
      cell: (r) => formatDateTime(r.post.proposed_time),
      className: "whitespace-nowrap",
    },
    {
      id: "reports",
      header: "Open reports",
      align: "right",
      sortValue: (r) => r.openReports,
      cell: (r) => (r.openReports ? <span className="font-medium text-warning">{r.openReports}</span> : <span className="text-ink-faint">0</span>),
    },
  ];

  const clearSelection = () => router.replace(BASE, { scroll: false });

  return (
    <>
      {selectedId && <PostPanel key={selectedId} postId={selectedId} onClose={clearSelection} />}

      <Tabs
        label="Post status"
        active={tab}
        onChange={(id) => setTab(id as StatusTab)}
        tabs={[
          { id: "all", label: "All", count: rows.length },
          { id: "published", label: "Published", count: rows.length - hiddenCount },
          { id: "hidden", label: "Hidden", count: hiddenCount },
        ]}
      />
      <DataTable
        caption="Game posts"
        rows={visible}
        columns={columns}
        getRowId={(r) => r.post.post_id}
        rowHref={(r) => `${BASE}?post=${r.post.post_id}`}
        getSearchText={(r) => `${r.post.title} ${r.organiser?.display_name ?? ""} ${r.post.organiser_group_name ?? ""} ${r.post.suburb} ${r.post.venue} ${r.post.post_id}`}
        searchPlaceholder="Search title, organiser or suburb"
        filters={[
          {
            id: "format",
            label: "Format",
            options: [
              { value: "singles", label: "Singles" },
              { value: "doubles", label: "Doubles" },
              { value: "mixed_doubles", label: "Mixed doubles" },
            ],
            getValue: (r) => r.post.format,
          },
          {
            id: "reports",
            label: "Reports",
            options: [{ value: "open", label: "Has open reports" }],
            getValue: (r) => (r.openReports > 0 ? "open" : ""),
          },
        ]}
        initialSort={{ columnId: "time", direction: "desc" }}
        empty={<EmptyState title="No game posts match" description="Try a different search, status or filter." />}
      />
    </>
  );
}

/** Detail for the selected post, shown above the list. */
function PostPanel({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { run } = useAdminAction();
  const close = () => setDialog(null);

  const data = useQuery((db) => {
    const post = selectGamePost(db, postId);
    return {
      post,
      organiser: post ? selectPlayer(db, post.organiser_id) : null,
      reports: selectReportsForTarget(db, "game_post", postId),
      activity: selectActivityFor(db, "game_post", postId),
      deleted: post ? null : selectDeletedRecord(db, postId),
    };
  });

  const { post } = data;
  if (!post) {
    return (
      <div className="mb-8">
        <Notice tone="warning" title="Game post not found">
          {data.deleted
            ? `"${data.deleted.label}" was permanently deleted ${formatDateTime(data.deleted.deleted_at)}.`
            : `No game post with ID ${postId}. It may have been deleted, or the link is wrong.`}{" "}
          <button type="button" onClick={onClose} className="font-medium underline">
            Clear selection
          </button>
        </Notice>
      </div>
    );
  }

  const isHidden = post.status === "hidden";
  const lastHide = data.activity.find((a) => a.action === "hide_post");
  const spots = post.spots_total === null ? null : post.spots_filled === null ? `${post.spots_total} players` : `${post.spots_filled} of ${post.spots_total} filled`;

  return (
    <section aria-label="Selected game post" className="mb-8 space-y-6 border-b border-line pb-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-base font-semibold text-ink">{post.title}</h2>
              <StatusBadge status={post.status} />
              {post.hidden_by_account_suspension && <StatusBadge status="suspended" label="Hidden by account suspension" tone="neutral" />}
            </div>
            <p className="mt-0.5 font-mono text-xs text-ink-faint">{post.post_id}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isHidden ? (
              <Button size="sm" variant="primary" icon={<RotateCcw className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_restore_post")} onClick={() => setDialog("restore")}>
                Restore post
              </Button>
            ) : (
              <Button size="sm" variant="danger" icon={<EyeOff className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_hide_post")} onClick={() => setDialog("hide")}>
                Hide post
              </Button>
            )}
            <Button size="sm" icon={<Trash2 className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_delete_post")} onClick={() => setDialog("delete")}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" icon={<X className="size-4" aria-hidden />} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {/* Screen 28: hidden and restorable */}
        {isHidden && (
          <Notice tone="danger" title="Hidden from players">
            {post.hidden_by_account_suspension && !lastHide
              ? "Hidden automatically when the organiser's account was suspended."
              : lastHide
                ? `Hidden ${formatDateTime(lastHide.created_at)}. ${lastHide.details.replace(/[.!?]?$/, ".")}`
                : "This post isn't visible in Find Games."}{" "}
            It can be restored, and will go back to {humanize(post.status_before_hidden ?? "open").toLowerCase()}.
          </Notice>
        )}

        {post.notes && <p className="max-w-3xl text-sm text-ink-muted">{post.notes}</p>}
        {post.deleted_at && (
          <p className="text-[13px] text-danger">
            Deleted {formatDateTime(post.deleted_at)}
            {post.deletion_reason ? `: ${post.deletion_reason}` : ""}
          </p>
        )}
      </div>

      <DetailList
        columns={3}
        items={[
          { label: "When", value: formatDateTime(post.proposed_time) },
          { label: "Where", value: [post.venue, post.suburb].filter(Boolean).join(", ") || "Location not set" },
          {
            label: "Organiser",
            value: post.organiser_group_id ? post.organiser_group_name ?? "A group" : <PlayerLink player={data.organiser} fallbackId={post.organiser_id} />,
          },
          { label: "Format", value: [humanize(post.format), post.skill_band].filter(Boolean).join(" · ") },
          { label: "Spots", value: spots ?? "Not set" },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <SectionHeading title={`Reports (${data.reports.length})`} />
          {data.reports.length === 0 ? (
            <p className="text-[13px] text-ink-muted">No reports.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {data.reports.map((r) => (
                <li key={r.report_id}>
                  <Link href={`/reports/${r.report_id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-subtle">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{r.reason}</div>
                      <div className="text-[13px] text-ink-muted">{formatDateTime(r.created_at)}</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <SectionHeading title="Activity" />
          <ActivityTimeline entries={data.activity} empty="No admin actions on this post yet." />
        </div>
      </div>

      <HidePostModal
        open={dialog === "hide"}
        postTitle={post.title}
        onClose={close}
        onConfirm={({ reason }) =>
          run(() => admin_hide_post({ postId: post.post_id, reason }), {
            saving: "Hiding post…",
            success: "Game post hidden",
            onSuccess: close,
            onConflict: close,
          })
        }
      />
      <RestorePostModal
        open={dialog === "restore"}
        postTitle={post.title}
        onClose={close}
        onConfirm={({ reason }) =>
          run(() => admin_restore_post({ postId: post.post_id, note: reason }), {
            saving: "Restoring post…",
            success: "Game post restored",
            onSuccess: close,
            onConflict: close,
          })
        }
      />
      <DeletePostModal
        open={dialog === "delete"}
        postTitle={post.title}
        onClose={close}
        onConfirm={({ reason }) =>
          run(() => admin_delete_post({ postId: post.post_id, reason }), {
            saving: "Deleting post…",
            success: "Game post deleted",
            successDetail: "Listed under Deleted records.",
            onSuccess: () => {
              close();
              onClose();
            },
            onConflict: close,
          })
        }
      />
    </section>
  );
}
