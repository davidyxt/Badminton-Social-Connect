"use client";

import { ConfirmDialog, type ConfirmDialogProps } from "@/components/shared/ConfirmDialog";
import { Notice } from "@/components/shared/Card";

type FlowProps = Pick<ConfirmDialogProps, "open" | "onClose" | "onConfirm">;

/** Screen 29 */
export function HidePostModal({ postTitle, ...props }: FlowProps & { postTitle: string }) {
  return (
    <ConfirmDialog
      {...props}
      tone="danger"
      title="Hide this game post?"
      description={
        <>
          <span className="font-medium text-ink">&ldquo;{postTitle}&rdquo;</span> is removed from Find Games and the organiser&apos;s followers. You
          can restore it later.
        </>
      }
      confirmLabel="Hide post"
      reason={{ label: "Reason for hiding", required: true, placeholder: "e.g. Promotes gambling", hint: "Recorded in the activity log." }}
    />
  );
}

/** Screen 31 */
export function RestorePostModal({ postTitle, ...props }: FlowProps & { postTitle: string }) {
  return (
    <ConfirmDialog
      {...props}
      title="Restore this game post?"
      description={
        <>
          <span className="font-medium text-ink">&ldquo;{postTitle}&rdquo;</span> will be visible again with its previous status.
        </>
      }
      confirmLabel="Restore post"
      reason={{ label: "Note", placeholder: "Optional: why this post is being restored" }}
    />
  );
}

/** Screen 30: typed confirmation, irreversible. */
export function DeletePostModal({ postTitle, ...props }: FlowProps & { postTitle: string }) {
  return (
    <ConfirmDialog
      {...props}
      tone="danger"
      title="Delete this game post?"
      description={
        <>
          <span className="font-medium text-ink">&ldquo;{postTitle}&rdquo;</span> will be permanently removed.
        </>
      }
      confirmLabel="Delete post"
      confirmPhrase="DELETE"
      reason={{ label: "Reason for deleting", required: true, placeholder: "e.g. Commercial spam" }}
    >
      <Notice tone="danger">This can&apos;t be undone. Hide the post instead if you might need it back.</Notice>
    </ConfirmDialog>
  );
}
