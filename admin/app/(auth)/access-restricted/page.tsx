"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { useSession } from "@/lib/auth/session";

/** Screen 47 */
export default function AccessRestrictedPage() {
  const session = useSession();
  const router = useRouter();

  return (
    <>
      <div className="mb-4 flex size-8 items-center justify-center rounded-md border border-line bg-surface text-ink-muted">
        <Lock className="size-4" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Administrator access required</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {session.admin?.email ? (
          <>
            <span className="font-medium text-ink">{session.admin.email}</span> doesn&apos;t have administrator access.
          </>
        ) : (
          "This account doesn't have administrator access."
        )}{" "}
        This console is limited to the platform administrator.
      </p>
      <p className="mt-3 text-sm text-ink-muted">Players should use the Badminton Social Connect app instead.</p>
      <Button
        variant="primary"
        className="mt-6 h-9 w-full"
        onClick={() => {
          session.signOut();
          router.replace("/sign-in");
        }}
      >
        Sign in with a different account
      </Button>
    </>
  );
}
