"use client";

import { ConfirmDialog, type ConfirmDialogProps } from "@/components/shared/ConfirmDialog";
import { Notice } from "@/components/shared/Card";

type FlowProps = Pick<ConfirmDialogProps, "open" | "onClose" | "onConfirm">;

/** Screen 10 */
export function SuspendAccountModal({ playerName, contentCount, ...props }: FlowProps & { playerName: string; contentCount: number }) {
  return (
    <ConfirmDialog
      {...props}
      tone="danger"
      title={`Suspend ${playerName}?`}
      description="They will be signed out and won't be able to post games, join games or take part in Mini Leagues until access is restored."
      confirmLabel="Suspend account"
      reason={{
        label: "Reason for suspension",
        required: true,
        placeholder: "e.g. Abusive messages reported by multiple players",
        hint: "Recorded in the activity log. Not shown to the player.",
      }}
    >
      {contentCount > 0 && (
        <Notice tone="warning">
          {contentCount} active game post{contentCount === 1 ? "" : "s"} or Mini League{contentCount === 1 ? "" : "s"} they organise will be hidden
          while the account is suspended.
        </Notice>
      )}
    </ConfirmDialog>
  );
}

/** Screen 13 */
export function RestoreAccountModal({ playerName, ...props }: FlowProps & { playerName: string }) {
  return (
    <ConfirmDialog
      {...props}
      title={`Restore access for ${playerName}?`}
      description="They'll be able to sign in, post and join games again. Content hidden by the suspension will be restored with the account."
      confirmLabel="Restore access"
      reason={{ label: "Note", placeholder: "Optional: why access is being restored" }}
    />
  );
}
