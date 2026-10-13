"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SignInForm } from "@/components/layout/SignInForm";
import { useSession } from "@/lib/auth/session";

/** Screen 46 */
export default function SignInPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/overview");
  }, [status, router]);

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Administrator sign in</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">Use your administrator account.</p>
      <SignInForm />
    </>
  );
}
