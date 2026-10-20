"use client";

import { ConfirmDialog, type ConfirmDialogProps } from "@/components/shared/ConfirmDialog";
import { Notice } from "@/components/shared/Card";
import { MINI_LEAGUES_ENABLED } from "@/lib/features";

type FlowProps = Pick<ConfirmDialogProps, "open" | "onClose" | "onConfirm">;

/** Screen 10 */
export function SuspendAccountModal({ playerName, contentCount, ...props }: FlowProps & { playerName: string; contentCount: number }) {
  return (
    <ConfirmDialog
      {...props}
      tone="danger"
      title={`Suspend ${playerName}?`}
      description={`They'll be signed out and can't post or join games${MINI_LEAGUES_ENABLED ? ", or play in Mini Leagues," : ""} until access is restored.`}
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
          {contentCount} active game post{contentCount === 1 ? "" : "s"}
          {MINI_LEAGUES_ENABLED && <> or Mini League{contentCount === 1 ? "" : "s"}</>} they organise will be hidden
          while suspended.
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
      description="They can sign in, post and join games again. Content hidden by the suspension comes back too."
      confirmLabel="Restore access"
      reason={{ label: "Note", placeholder: "Optional: why access is being restored" }}
    />
  );
}
