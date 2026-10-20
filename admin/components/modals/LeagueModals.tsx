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
      description="The league will be hidden from players and no matches can be recorded until it's resumed. Standings are kept."
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
      description="The league becomes visible again and returns to the status it had before it was suspended."
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
      description="The league stays visible and active for current members, but no new players can join."
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
      description={`The league, its standings and its membership (${memberCount} player${memberCount === 1 ? "" : "s"}) will be permanently removed.`}
      confirmLabel="Delete league"
      confirmPhrase="DELETE"
      reason={{ label: "Reason for deleting", required: true, placeholder: "e.g. Organiser requested removal" }}
    >
      <Notice tone="danger">Deleting can&apos;t be undone from the console. Suspend the league instead if you might need it back.</Notice>
    </ConfirmDialog>
  );
}
