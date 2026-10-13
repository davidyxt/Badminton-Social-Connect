"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { useSession } from "@/lib/auth/session";
import { resetIdleTimer } from "@/lib/auth/useIdleTimeout";
import { IS_API } from "@/lib/config";

const inputClass =
  "mt-1.5 block h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

export function SignInForm({ submitLabel = "Sign in" }: { submitLabel?: string }) {
  const session = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Enter your email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (next.email || next.password) return;
    setSubmitting(true);
    try {
      // Reset first so the guard doesn't treat the old idle window as expired.
      resetIdleTimer();
      await session.signIn(email, password);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Couldn't sign in. Try again." });
      setSubmitting(false);
      return;
    }
    // Signing in always lands on Overview; the guard re-routes non-admins to access-restricted.
    router.replace("/overview");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {errors.form && (
        <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {errors.form}
        </div>
      )}
      <div>
        <label htmlFor="email" className="block text-[13px] font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          placeholder="admin@badmintonsocialconnect.com.au"
          className={inputClass}
        />
        {errors.email && (
          <p id="email-error" className="mt-1.5 text-[13px] text-danger">
            {errors.email}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="block text-[13px] font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : undefined}
          className={inputClass}
        />
        {errors.password && (
          <p id="password-error" className="mt-1.5 text-[13px] text-danger">
            {errors.password}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" loading={submitting} className="mt-2 h-9 w-full">
        {submitting ? "Signing in…" : submitLabel}
      </Button>
      {!IS_API && (
        <p className="text-xs text-ink-faint">
          Mock sign-in: any email and password work. Use an email starting with <span className="font-mono">player</span> to see the
          access-restricted screen.
        </p>
      )}
    </form>
  );
}
