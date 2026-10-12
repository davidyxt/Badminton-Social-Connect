"use client";

import { unavailableReason } from "@/lib/api/capabilities";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeOff, RotateCcw, Trash2, X } from "lucide-react";
import { Suspense, useState } from "react";
import { DeletePostModal, HidePostModal, RestorePostModal } from "@/components/modals/PostModals";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { Button } from "@/components/shared/Button";
import { Card, CardBody, CardHeader, Notice } from "@/components/shared/Card";
import { GamePostSummary } from "@/components/shared/ContentSummaries";
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
          <div className="text-xs text-ink-muted">by {r.organiser?.display_name ?? r.post.organiser_id}</div>
        </div>
      ),
    },
    { id: "status", header: "Status", sortValue: (r) => r.post.status, cell: (r) => <StatusBadge status={r.post.status} /> },
    { id: "format", header: "Format", sortValue: (r) => r.post.format, cell: (r) => <span className="capitalize">{r.post.format}</span> },
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
        getSearchText={(r) => `${r.post.title} ${r.organiser?.display_name ?? ""} ${r.post.suburb} ${r.post.venue} ${r.post.post_id}`}
        searchPlaceholder="Search title, organiser or suburb"
        filters={[
          {
            id: "format",
            label: "Format",
            options: [
              { value: "singles", label: "Singles" },
              { value: "doubles", label: "Doubles" },
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

  const closeButton = (
    <Button size="sm" variant="ghost" icon={<X className="size-4" aria-hidden />} onClick={onClose}>
      Close
    </Button>
  );

  const { post } = data;
  if (!post) {
    return (
      <div className="mb-6">
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

  return (
    <section aria-label="Selected game post" className="mb-6 space-y-4 rounded-xl border border-line-strong bg-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Game post {post.post_id}</h2>
        {closeButton}
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

      <GamePostSummary
        post={post}
        organiser={data.organiser}
        actions={
          <>
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
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Reports (${data.reports.length})`} description="Reports about this game post." />
          {data.reports.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-muted">No reports.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {data.reports.map((r) => (
                <li key={r.report_id}>
                  <Link href={`/reports/${r.report_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-subtle">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{r.reason}</div>
                      <div className="text-xs text-ink-muted">{formatDateTime(r.created_at)}</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Activity" description={<>Organiser: <PlayerLink player={data.organiser} fallbackId={post.organiser_id} /></>} />
          <CardBody>
            <ActivityTimeline entries={data.activity} empty="No admin actions on this post yet." />
          </CardBody>
        </Card>
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
