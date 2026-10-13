"use client";

import { ConfirmDialog, type ConfirmDialogProps } from "@/components/shared/ConfirmDialog";
import { Notice } from "@/components/shared/Card";

type FlowProps = Pick<ConfirmDialogProps, "open" | "onClose" | "onConfirm">;

/** Resolve (screen 22) or dismiss (screen 23) a report. Both require a note. */
export function ReviewReportModal({ outcome, ...props }: FlowProps & { outcome: "resolved" | "dismissed" }) {
  const resolving = outcome === "resolved";
  return (
    <ConfirmDialog
      {...props}
      title={resolving ? "Resolve this report?" : "Dismiss this report?"}
      description={
        resolving
          ? "Marks the report as actioned and removes it from the pending queue."
          : "Marks the report as not requiring action and removes it from the pending queue."
      }
      confirmLabel={resolving ? "Resolve report" : "Dismiss report"}
      reason={{
        label: resolving ? "Resolution note" : "Reason for dismissing",
        required: true,
        placeholder: resolving ? "e.g. Post hidden for promoting gambling" : "e.g. No breach of community guidelines",
        hint: "Recorded with the report and in the activity log.",
      }}
    >
      {resolving && (
        <Notice>
          Resolving records the outcome only. Suspend the account, hide the post or suspend the league separately if needed.
        </Notice>
      )}
    </ConfirmDialog>
  );
}
