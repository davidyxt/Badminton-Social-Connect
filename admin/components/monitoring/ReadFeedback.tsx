"use client";
import { Button } from "@/components/shared/Button";

export function ReadFeedback({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) {
  if (error) return <div role="alert" className="mb-3 text-sm text-danger">{error} <Button size="sm" variant="ghost" onClick={retry}>Retry</Button></div>;
  return loading ? <p role="status" className="text-sm text-ink-muted">Loading records…</p> : null;
}
