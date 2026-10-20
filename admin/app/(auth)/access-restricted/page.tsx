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
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Lock className="size-5" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-ink">Administrator access required</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {session.admin?.email ? (
          <>
            <span className="font-medium text-ink">{session.admin.email}</span> is signed in but doesn&apos;t have administrator access.
          </>
        ) : (
          "The account you're signed in with doesn't have administrator access."
        )}{" "}
        This console is limited to the designated platform administrator.
      </p>
      <p className="mt-3 text-sm text-ink-muted">If you&apos;re a player, use the Badminton Social Connect app instead.</p>
      <Button
        variant="primary"
        className="mt-6 w-full"
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
