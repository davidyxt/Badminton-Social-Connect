"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/shared/Button";
import { returnPathFromLocation, useSession, withReturnPath } from "@/lib/auth/session";

/** Screen 47 */
export default function AccessRestrictedPage() {
  const session = useSession();
  const router = useRouter();

  // A valid admin has nothing to see here (e.g. an old bookmark); carry on to the console.
  const admitted = session.status === "authenticated";
  useEffect(() => {
    if (admitted) router.replace(returnPathFromLocation());
  }, [admitted, router]);

  if (admitted) return null;

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
          router.replace(withReturnPath("/sign-in", returnPathFromLocation()));
        }}
      >
        Sign in with a different account
      </Button>
    </>
  );
}
