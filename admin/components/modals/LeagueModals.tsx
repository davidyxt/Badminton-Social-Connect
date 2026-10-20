"use client";

import { ConfirmDialog, type ConfirmDialogProps } from "@/components/shared/ConfirmDialog";
import { Notice } from "@/components/shared/Card";

type FlowProps = Pick<ConfirmDialogProps, "open" | "onClose" | "onConfirm">;

/** Screen 39 */
export function SuspendLeagueModal({ leagueName, ...props }: FlowProps & { leagueName: string }) {
  return (
    <ConfirmDialog
      {...props}
      tone="danger"
      title={`Suspend ${leagueName}?`}
      description="Hidden from players, and no matches can be recorded until it's resumed. Standings are kept."
      confirmLabel="Suspend league"
      reason={{ label: "Reason for suspension", required: true, placeholder: "e.g. Exclusionary league description", hint: "Recorded in the activity log." }}
    />
  );
}

/** Screen 40 */
export function ResumeLeagueModal({ leagueName, ...props }: FlowProps & { leagueName: string }) {
  return (
    <ConfirmDialog
      {...props}
      title={`Resume ${leagueName}?`}
      description="Visible again, with the status it had before the suspension."
      confirmLabel="Resume league"
      reason={{ label: "Note", placeholder: "Optional: why the league is being resumed" }}
    />
  );
}

/** Screen 41: a lesser state than suspension. */
export function CloseRegistrationModal({ leagueName, ...props }: FlowProps & { leagueName: string }) {
  return (
    <ConfirmDialog
      {...props}
      title={`Close registration for ${leagueName}?`}
      description="Stays active for current members. No new players can join."
      confirmLabel="Close registration"
      reason={{ label: "Note", placeholder: "Optional: e.g. League is at capacity" }}
    />
  );
}

/** Screen 42: typed confirmation, irreversible. */
export function DeleteLeagueModal({ leagueName, memberCount, ...props }: FlowProps & { leagueName: string; memberCount: number }) {
  return (
    <ConfirmDialog
      {...props}
      tone="danger"
      title={`Delete ${leagueName}?`}
      description={`Permanently removes the league, its standings and its ${memberCount} member${memberCount === 1 ? "" : "s"}.`}
      confirmLabel="Delete league"
      confirmPhrase="DELETE"
      reason={{ label: "Reason for deleting", required: true, placeholder: "e.g. Organiser requested removal" }}
    >
      <Notice tone="danger">This can&apos;t be undone. Suspend the league instead if you might need it back.</Notice>
    </ConfirmDialog>
  );
}
