"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Images, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AdminPostForm, CardImage, type AdminPostFormValues } from "@/components/content/AdminPostForm";
import { Button } from "@/components/shared/Button";
import { Card, CardBody, CardHeader } from "@/components/shared/Card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { useAdminAction } from "@/lib/hooks/useAdminAction";
import { create_admin_post, delete_admin_post, update_admin_post, useQuery } from "@/lib/mock-api";
import type { AdminPost } from "@/lib/types";

type Dialog = { kind: "create" } | { kind: "edit"; post: AdminPost } | { kind: "remove"; post: AdminPost } | null;

/** What's missing before a card can be published, or null if it's ready. */
function publishBlocker(p: Pick<AdminPost, "image_url" | "body">): string | null {
  const missing = [!p.image_url.trim() && "an image", !p.body.trim() && "body text"].filter(Boolean);
  return missing.length ? `Add ${missing.join(" and ")} to publish.` : null;
}

/** NEW (no Figma design): home page carousel management. */
export default function ContentPage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { run, pending } = useAdminAction();
  const close = () => setDialog(null);

  const posts = useQuery((db) => [...db.admin_posts].sort((a, b) => a.display_order - b.display_order));
  const published = posts.filter((p) => p.status === "published");

  const move = (post: AdminPost, delta: -1 | 1) =>
    run(() => update_admin_post({ adminPostId: post.admin_post_id, display_order: post.display_order + delta }), {
      saving: "Moving card…",
      success: `Moved to position ${post.display_order + delta}`,
    });

  const togglePublish = (post: AdminPost) => {
    const publishing = post.status === "draft";
    return run(() => update_admin_post({ adminPostId: post.admin_post_id, status: publishing ? "published" : "draft" }), {
      saving: publishing ? "Publishing…" : "Unpublishing…",
      success: publishing ? "Card published" : "Card moved to draft",
      successDetail: publishing ? "It now shows on the player home page." : "It no longer shows on the player home page.",
    });
  };

  const submitForm = (values: AdminPostFormValues) => {
    if (dialog?.kind === "edit") {
      const { post } = dialog;
      // Only send changed fields so the activity log records the right action.
      const patch: Partial<AdminPostFormValues> = {};
      (Object.keys(values) as (keyof AdminPostFormValues)[]).forEach((k) => {
        if (values[k] !== post[k]) (patch as Record<string, unknown>)[k] = values[k];
      });
      if (Object.keys(patch).length === 0) {
        close();
        return Promise.resolve("success" as const);
      }
      return run(() => update_admin_post({ adminPostId: post.admin_post_id, ...patch }), {
        success: "Card saved",
        onSuccess: close,
        onConflict: close,
      });
    }
    return run(() => create_admin_post(values), {
      success: values.status === "published" ? "Card created and published" : "Draft card created",
      onSuccess: close,
      onConflict: close,
    });
  };

  const formInitial: AdminPostFormValues =
    dialog?.kind === "edit"
      ? {
          title: dialog.post.title,
          body: dialog.post.body,
          image_url: dialog.post.image_url,
          display_order: dialog.post.display_order,
          status: dialog.post.status,
        }
      : { title: "", body: "", image_url: "", display_order: posts.length + 1, status: "draft" };

  return (
    <>
      <PageHeader
        title="Content"
        description="Cards in the player home page carousel. Only published cards show to players, in display order."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ kind: "create" })}>
            New card
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader
          title="Player home page preview"
          description={`${published.length} published ${published.length === 1 ? "card" : "cards"}, in the order players see them.`}
        />
        <CardBody>
          {published.length === 0 ? (
            <p className="text-sm text-ink-muted">No published cards. Players won&apos;t see a carousel until you publish one.</p>
          ) : (
            <ol className="flex gap-3 overflow-x-auto pb-1" aria-label="Published cards in display order">
              {published.map((p, i) => (
                <li key={p.admin_post_id} className="w-56 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
                  <div className="relative">
                    <CardImage src={p.image_url} alt="" className="aspect-[16/9] w-full" />
                    <span className="absolute top-2 left-2 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-medium text-white tabular-nums">{i + 1}</span>
                  </div>
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-medium text-ink">{p.title}</div>
                    <div className="line-clamp-2 text-xs text-ink-muted">{p.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`All cards (${posts.length})`} description="Drafts stay hidden from players. Use the arrows to change the order." />
        {posts.length === 0 ? (
          <EmptyState
            icon={<Images className="size-6" aria-hidden />}
            title="No carousel cards yet"
            description="Create a card to show announcements on the player home page."
            action={
              <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ kind: "create" })}>
                New card
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {posts.map((post, i) => {
              const blocker = post.status === "draft" ? publishBlocker(post) : null;
              return (
                <li key={post.admin_post_id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start">
                  <div className="flex items-center gap-1 sm:flex-col sm:pt-1">
                    <span className="w-8 text-center text-sm font-semibold text-ink tabular-nums" aria-label={`Position ${post.display_order}`}>
                      {post.display_order}
                    </span>
                    <button
                      type="button"
                      onClick={() => void move(post, -1)}
                      disabled={pending || i === 0}
                      className="rounded-md p-1 text-ink-muted hover:bg-neutral-soft hover:text-ink disabled:opacity-30"
                      aria-label={`Move "${post.title}" up`}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void move(post, 1)}
                      disabled={pending || i === posts.length - 1}
                      className="rounded-md p-1 text-ink-muted hover:bg-neutral-soft hover:text-ink disabled:opacity-30"
                      aria-label={`Move "${post.title}" down`}
                    >
                      <ArrowDown className="size-4" />
                    </button>
                  </div>

                  <CardImage src={post.image_url} alt={post.title} className="aspect-[16/9] w-full shrink-0 rounded-lg border border-line sm:w-40" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-ink">{post.title}</h3>
                      <StatusBadge status={post.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{post.body || <span className="italic text-ink-faint">No body text</span>}</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {post.status === "published" ? `Published ${formatDateTime(post.published_at)}` : "Draft, not visible to players"}
                    </p>
                    {blocker && <p className="mt-1 text-xs font-medium text-warning">{blocker}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                      size="sm"
                      icon={post.status === "published" ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      disabled={pending || Boolean(blocker)}
                      title={blocker ?? undefined}
                      onClick={() => void togglePublish(post)}
                    >
                      {post.status === "published" ? "Unpublish" : "Publish"}
                    </Button>
                    <Button size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setDialog({ kind: "edit", post })}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:text-danger"
                      icon={<Trash2 className="size-4" aria-hidden />}
                      onClick={() => setDialog({ kind: "remove", post })}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <AdminPostForm
        // Remount when switching between cards so the form picks up the right values.
        key={dialog?.kind === "edit" ? dialog.post.admin_post_id : "new"}
        open={dialog?.kind === "create" || dialog?.kind === "edit"}
        mode={dialog?.kind === "edit" ? "edit" : "create"}
        initial={formInitial}
        maxOrder={dialog?.kind === "edit" ? Math.max(posts.length, 1) : posts.length + 1}
        onClose={close}
        onSubmit={submitForm}
      />

      <ConfirmDialog
        open={dialog?.kind === "remove"}
        tone="danger"
        title="Remove this card?"
        description={
          dialog?.kind === "remove"
            ? `"${dialog.post.title}" will be removed from the carousel${dialog.post.status === "published" ? " and the player home page" : ""}. To hide it temporarily, unpublish it instead.`
            : undefined
        }
        confirmLabel="Remove card"
        onClose={close}
        onConfirm={() =>
          dialog?.kind === "remove"
            ? run(() => delete_admin_post({ adminPostId: dialog.post.admin_post_id }), {
                saving: "Removing card…",
                success: "Card removed",
                onSuccess: close,
                onConflict: close,
              })
            : undefined
        }
      />
    </>
  );
}
