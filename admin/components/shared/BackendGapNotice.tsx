import { Notice } from "./Card";

/** Explains a feature the real admin API can't serve yet. Renders nothing in mock mode (pass null). */
export function BackendGapNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-5">
      <Notice title="Not available yet">{message}</Notice>
    </div>
  );
}
