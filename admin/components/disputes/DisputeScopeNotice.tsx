import { Notice } from "@/components/shared/Card";

/** Persistent note on the disputes screens: they are a read-only monitoring view. */
export function DisputeScopeNotice() {
  return (
    <div className="mb-6">
      <Notice>Read-only. Admins can review disputes but can&apos;t resolve them or change results and rankings.</Notice>
    </div>
  );
}
