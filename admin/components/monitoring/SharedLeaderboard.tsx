"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/shared/Card";
import { Button } from "@/components/shared/Button";
import { useConsoleRead } from "@/lib/hooks/useConsoleRead";
import type { Leaderboard } from "@/lib/api/reads";
import { ReadFeedback } from "./ReadFeedback";

export function SharedLeaderboard() {
  const [scope, setScope] = useState("state");
  const [state, setState] = useState("VIC");
  const [offset, setOffset] = useState(0);
  const read = useConsoleRead<Leaderboard | null>("/rankings/leaderboard", { scope, ...(scope === "state" ? { state } : {}), limit: 25, offset });
  const board = read.response?.data;
  return <Card className="mt-6"><CardHeader title="Shared player leaderboard" description="Established, registered and discoverable players only. Nearby uses the signed-in administrator's suburb." /><CardBody>
    <div className="mb-4 flex flex-wrap gap-3"><label className="text-sm">Scope <select className="ml-2 rounded border border-line p-2" value={scope} onChange={(e) => { setScope(e.target.value); setOffset(0); }}><option value="state">State</option><option value="nearby">Nearby</option></select></label>
    {scope === "state" && <label className="text-sm">State <select className="ml-2 rounded border border-line p-2" value={state} onChange={(e) => { setState(e.target.value); setOffset(0); }}>{["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((s) => <option key={s}>{s}</option>)}</select></label>}</div>
    <ReadFeedback {...read} />
    {board ? <>
      <p className="mb-3 text-sm text-ink-muted">{board.total} eligible players · {board.state}{board.suburb ? ` · ${board.suburb}` : ""}</p>
      {board.entries.length ? <table className="w-full text-left text-sm"><thead><tr>{["Rank", "Player", "Rating", "Grade"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{board.entries.map((p) => <tr key={p.id} className="border-t border-line"><td className="p-2">{p.rank}</td><td className="p-2"><Link href={`/users/${p.id}`} className="text-brand underline">{p.name}</Link></td><td className="p-2">{p.rating}</td><td className="p-2">{p.grade}</td></tr>)}</tbody></table> : <p className="text-sm text-ink-muted">No eligible players in this area.</p>}
      <div className="mt-4 flex gap-3"><Button size="sm" disabled={offset === 0} onClick={() => setOffset((n) => n - 25)}>Previous</Button><Button size="sm" disabled={offset + 25 >= board.total} onClick={() => setOffset((n) => n + 25)}>Next</Button></div>
    </> : !read.loading && !read.error && <p className="text-sm text-ink-muted">No leaderboard is available for this administrator&apos;s registration and location.</p>}
  </CardBody></Card>;
}
