import { Notice } from "@/components/shared/Card";

/** Persistent banner on the disputes screens: they are a read-only monitoring view. */
export function DisputeScopeNotice() {
  return (
    <div className="mb-6">
      <Notice title="Read-only">
        Under the Final v6 admin design, administrators can review disputes but can&apos;t resolve them or change match results and rankings. The
        admin API rejects dispute resolution, so there are no decision controls here.
      </Notice>
    </div>
  );
}
