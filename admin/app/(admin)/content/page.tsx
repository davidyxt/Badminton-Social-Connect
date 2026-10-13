"use client";

import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Images,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  AdminPostForm,
  CardImage,
  type AdminPostFormValues,
} from "@/components/content/AdminPostForm";
import { Button } from "@/components/shared/Button";
import { Card, SectionHeading } from "@/components/shared/Card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { useAdminAction } from "@/lib/hooks/useAdminAction";
import {
  create_admin_post,
  delete_admin_post,
  update_admin_post,
  useQuery,
} from "@/lib/mock-api";
import type { AdminPost } from "@/lib/types";

/**
 * `post` and `position` are snapshots from when the dialog opened: the edit is
 * saved against that version (`updated_at`), so a change made in another
 * session in the meantime is reported as a conflict rather than overwritten.
 */
type Dialog =
  | { kind: "create" }
  | { kind: "edit"; post: AdminPost; position: number }
  | { kind: "remove"; post: AdminPost }
  | null;

/** What's missing before a card can be published, or null if it's ready. */
function publishBlocker(
  p: Pick<AdminPost, "image_url" | "body">,
): string | null {
  const missing = [
    !p.image_url.trim() && "an image",
    !p.body.trim() && "body text",
  ].filter(Boolean);
  return missing.length ? `Add ${missing.join(" and ")} to publish.` : null;
}

/** NEW (no Figma design): home page carousel management. */
export default function ContentPage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { run, pending } = useAdminAction();
  const close = () => setDialog(null);

  const posts = useQuery((db) =>
    [...db.admin_posts].sort((a, b) => a.display_order - b.display_order),
  );
  const published = posts.filter((p) => p.status === "published");

  // Positions are list positions (1-based), not raw display_order values: the
  // API can leave gaps in display_order after a delete.
  const move = (index: number, delta: -1 | 1) => {
    const post = posts[index];
    const position = index + delta + 1;
    return run(
      () =>
        update_admin_post({
          adminPostId: post.admin_post_id,
          display_order: position,
        }),
      {
        saving: "Moving card…",
        success: `Moved to position ${position}`,
      },
    );
  };

  const togglePublish = (post: AdminPost) => {
    const publishing = post.status === "draft";
    return run(
      () =>
        update_admin_post({
          adminPostId: post.admin_post_id,
          status: publishing ? "published" : "draft",
          expectedUpdatedAt: post.updated_at,
        }),
      {
        saving: publishing ? "Publishing…" : "Unpublishing…",
        success: publishing ? "Card published" : "Card moved to draft",
        successDetail: publishing
          ? "It now shows on the player home page."
          : "It no longer shows on the player home page.",
      },
    );
  };

  const submitForm = (values: AdminPostFormValues) => {
    if (dialog?.kind === "edit") {
      const { post } = dialog;
      const original: AdminPostFormValues = {
        ...post,
        display_order: dialog.position,
      };
      // Only send changed fields so the activity log records the right action.
      const patch: Partial<AdminPostFormValues> = {};
      (Object.keys(values) as (keyof AdminPostFormValues)[]).forEach((k) => {
        if (values[k] !== original[k])
          (patch as Record<string, unknown>)[k] = values[k];
      });
      if (Object.keys(patch).length === 0) {
        close();
        return Promise.resolve("success" as const);
      }
      return run(
        () =>
          update_admin_post({
            adminPostId: post.admin_post_id,
            ...patch,
            expectedUpdatedAt: post.updated_at,
          }),
        {
          success: "Card saved",
          onSuccess: close,
          onConflict: close,
        },
      );
    }
    return run(() => create_admin_post(values), {
      success:
        values.status === "published"
          ? "Card created and published"
          : "Draft card created",
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
          display_order: dialog.position,
          status: dialog.post.status,
        }
      : {
          title: "",
          body: "",
          image_url: "",
          display_order: posts.length + 1,
          status: "draft",
        };

  return (
    <>
      <PageHeader
        title="Content"
        description="Cards in the player home page carousel."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => setDialog({ kind: "create" })}
          >
            New card
          </Button>
        }
      />

      <div className="space-y-8">
        <section>
          <SectionHeading
            title="Player home page preview"
            description={`${published.length} published ${published.length === 1 ? "card" : "cards"}, in the order players see them.`}
          />
          {published.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No published cards. Players won&apos;t see a carousel until you
              publish one.
            </p>
          ) : (
            <ol
              className="flex snap-x gap-3 overflow-x-auto pb-1"
              aria-label="Published cards in display order"
            >
              {published.map((p, i) => (
                <li
                  key={p.admin_post_id}
                  className="w-52 shrink-0 snap-start overflow-hidden rounded-lg border border-line bg-surface"
                >
                  <div className="relative">
                    <CardImage
                      src={p.image_url}
                      alt=""
                      className="aspect-[16/9] w-full"
                    />
                    <span className="absolute top-2 left-2 rounded-md bg-ink/70 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
                      {i + 1}
                    </span>
                  </div>
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-medium text-ink">
                      {p.title}
                    </div>
                    <div className="line-clamp-2 text-[13px] text-ink-muted">
                      {p.body}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <SectionHeading
            title={
              <>
                All cards{" "}
                <span className="font-normal text-ink-faint tabular-nums">
                  {posts.length}
                </span>
              </>
            }
            description="Drafts stay hidden from players. Use the arrows to change the order."
          />
          {posts.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Images className="size-6" aria-hidden />}
                title="No carousel cards yet"
                description="Create a card to show announcements on the player home page."
                action={
                  <Button
                    variant="primary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setDialog({ kind: "create" })}
                  >
                    New card
                  </Button>
                }
              />
            </Card>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {posts.map((post, i) => {
                // Older published cards can lack an image; the API refuses any change to them, even reordering, until one is added.
                const blocker =
                  post.status === "draft"
                    ? publishBlocker(post)
                    : post.status === "published" && !post.image_url.trim()
                      ? "Published without an image. Add one before editing or moving this card; it can't be saved without it."
                      : null;
                return (
                  <li
                    key={post.admin_post_id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-3 pl-2 transition-colors hover:bg-subtle/60 sm:flex-nowrap sm:gap-x-4"
                  >
                    <div className="flex shrink-0 items-center gap-0.5">
                      <span
                        className="w-6 text-center text-[13px] font-medium text-ink-faint tabular-nums"
                        aria-label={`Position ${i + 1}`}
                      >
                        {i + 1}
                      </span>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => void move(i, -1)}
                          disabled={pending || i === 0}
                          className="rounded p-0.5 text-ink-faint hover:bg-neutral-soft hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                          aria-label={`Move "${post.title}" up`}
                        >
                          <ChevronUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void move(i, 1)}
                          disabled={pending || i === posts.length - 1}
                          className="rounded p-0.5 text-ink-faint hover:bg-neutral-soft hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                          aria-label={`Move "${post.title}" down`}
                        >
                          <ChevronDown className="size-4" />
                        </button>
                      </div>
                    </div>

                    <CardImage
                      src={post.image_url}
                      alt={post.title}
                      className="hidden aspect-[16/9] w-24 shrink-0 rounded-md sm:flex [&_span]:hidden"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <h3 className="truncate text-sm font-medium text-ink">
                          {post.title}
                        </h3>
                        <StatusBadge status={post.status} />
                      </div>
                      <p className="truncate text-[13px] text-ink-muted">
                        {post.body || (
                          <span className="text-ink-faint italic">
                            No body text
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {post.status === "published"
                          ? `Published ${formatDateTime(post.published_at)}`
                          : "Draft, not visible to players"}
                        {blocker && (
                          <span className="text-warning"> · {blocker}</span>
                        )}
                      </p>
                    </div>

                    <div className="flex w-full shrink-0 flex-wrap items-center gap-1 pl-12 sm:w-auto sm:justify-end sm:pl-0">
                      <Button
                        size="sm"
                        icon={
                          post.status === "published" ? (
                            <EyeOff aria-hidden />
                          ) : (
                            <Eye aria-hidden />
                          )
                        }
                        disabled={pending || Boolean(blocker)}
                        title={blocker ?? undefined}
                        onClick={() => void togglePublish(post)}
                      >
                        {post.status === "published" ? "Unpublish" : "Publish"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil aria-hidden />}
                        onClick={() =>
                          setDialog({ kind: "edit", post, position: i + 1 })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="hover:text-danger"
                        icon={<Trash2 aria-hidden />}
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
        </section>
      </div>

      <AdminPostForm
        // Remount when switching between cards so the form picks up the right values.
        key={dialog?.kind === "edit" ? dialog.post.admin_post_id : "new"}
        open={dialog?.kind === "create" || dialog?.kind === "edit"}
        mode={dialog?.kind === "edit" ? "edit" : "create"}
        initial={formInitial}
        maxOrder={
          dialog?.kind === "edit" ? Math.max(posts.length, 1) : posts.length + 1
        }
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
            ? run(
                () =>
                  delete_admin_post({ adminPostId: dialog.post.admin_post_id }),
                {
                  saving: "Removing card…",
                  success: "Card removed",
                  onSuccess: close,
                  onConflict: close,
                },
              )
            : undefined
        }
      />
    </>
  );
}
