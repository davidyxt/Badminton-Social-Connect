"use client";

import { unavailableReason } from "@/lib/api/capabilities";
import Link from "next/link";
import { PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { DeleteLeagueModal, ResumeLeagueModal, SuspendLeagueModal } from "@/components/modals/LeagueModals";
import { Button } from "@/components/shared/Button";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PlayerLink } from "@/components/shared/PlayerProfileCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAdminAction } from "@/lib/hooks/useAdminAction";
import { admin_delete_league, admin_resume_league, admin_suspend_league, useQuery } from "@/lib/mock-api";
import type { MiniLeague, Player } from "@/lib/types";

interface Row {
  league: MiniLeague;
  organiser: Player | null;
  openReports: number;
}

type Dialog = { kind: "suspend" | "resume" | "delete"; league: MiniLeague } | null;

/** Screen 25 */
export default function MiniLeagueModerationPage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { run } = useAdminAction();
  const close = () => setDialog(null);

  const rows = useQuery<Row[]>((db) => {
    const players = new Map(db.players.map((p) => [p.player_id, p]));
    return db.mini_leagues.map((league) => ({
      league,
      organiser: players.get(league.organiser_id) ?? null,
      openReports: db.reports.filter((r) => r.status === "pending" && r.target_type === "mini_league" && r.target_id === league.league_id).length,
    }));
  });

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "Mini League",
      sortValue: (r) => r.league.name,
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/mini-leagues/${r.league.league_id}`} className="font-medium text-ink hover:text-brand">
            {r.league.name}
          </Link>
          <div className="text-[13px] text-ink-muted capitalize">{[r.league.format, r.league.suburb].filter(Boolean).join(" · ")}</div>
        </div>
      ),
    },
    {
      id: "organiser",
      header: "Organiser",
      sortValue: (r) => r.organiser?.display_name ?? "",
      cell: (r) => <PlayerLink player={r.organiser} fallbackId={r.league.organiser_id} />,
    },
    { id: "status", header: "Status", sortValue: (r) => r.league.status, cell: (r) => <StatusBadge status={r.league.status} /> },
    {
      id: "members",
      header: "Members",
      align: "right",
      sortValue: (r) => r.league.member_ids.length,
      cell: (r) => (r.league.max_members === null ? `${r.league.member_ids.length}` : `${r.league.member_ids.length}/${r.league.max_members}`),
    },
    {
      id: "reports",
      header: "Open reports",
      align: "right",
      sortValue: (r) => r.openReports,
      cell: (r) => (r.openReports ? <span className="font-medium text-warning">{r.openReports}</span> : <span className="text-ink-faint">0</span>),
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          {r.league.status === "suspended" ? (
            <Button size="sm" icon={<PlayCircle className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_resume_league")} onClick={() => setDialog({ kind: "resume", league: r.league })}>
              Resume
            </Button>
          ) : (
            <Button size="sm" icon={<PauseCircle className="size-4" aria-hidden />} disabledReason={unavailableReason("admin_suspend_league")} onClick={() => setDialog({ kind: "suspend", league: r.league })}>
              Suspend
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="size-4" aria-hidden />}
            disabledReason={unavailableReason("admin_delete_league")} onClick={() => setDialog({ kind: "delete", league: r.league })}
            aria-label={`Delete ${r.league.name}`}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const opts = (saving: string, success: string) => ({ saving, success, onSuccess: close, onConflict: close });
  const league = dialog?.league;

  return (
    <>
      <DataTable
        caption="Mini Leagues"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.league.league_id}
        rowHref={(r) => `/mini-leagues/${r.league.league_id}`}
        getSearchText={(r) => `${r.league.name} ${r.organiser?.display_name ?? ""} ${r.league.suburb} ${r.league.league_id}`}
        searchPlaceholder="Search league, organiser or suburb"
        filters={[
          {
            id: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "registration_closed", label: "Registration closed" },
              { value: "suspended", label: "Suspended" },
            ],
            getValue: (r) => r.league.status,
          },
          {
            id: "reports",
            label: "Reports",
            options: [{ value: "open", label: "Has open reports" }],
            getValue: (r) => (r.openReports > 0 ? "open" : ""),
          },
        ]}
        initialSort={{ columnId: "reports", direction: "desc" }}
        empty={<EmptyState title="No Mini Leagues match" description="Try a different search or clear the filters." />}
      />

      {league && (
        <>
          <SuspendLeagueModal
            open={dialog.kind === "suspend"}
            leagueName={league.name}
            onClose={close}
            onConfirm={({ reason }) => run(() => admin_suspend_league({ leagueId: league.league_id, reason }), opts("Suspending league…", "Mini League suspended"))}
          />
          <ResumeLeagueModal
            open={dialog.kind === "resume"}
            leagueName={league.name}
            onClose={close}
            onConfirm={({ reason }) => run(() => admin_resume_league({ leagueId: league.league_id, note: reason }), opts("Resuming league…", "Mini League resumed"))}
          />
          <DeleteLeagueModal
            open={dialog.kind === "delete"}
            leagueName={league.name}
            memberCount={league.member_ids.length}
            onClose={close}
            onConfirm={({ reason }) => run(() => admin_delete_league({ leagueId: league.league_id, reason }), opts("Deleting league…", "Mini League deleted"))}
          />
        </>
      )}
    </>
  );
}
