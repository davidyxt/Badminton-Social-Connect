import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink/85",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-subtle",
  danger: "bg-danger text-white hover:bg-danger-hover",
  ghost: "text-ink-muted hover:bg-subtle hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5",
  md: "h-8 px-3",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  /** Disables the button and explains why on hover (e.g. the backend doesn't support the action yet). */
  disabledReason?: string | null;
}

export function Button({ variant = "secondary", size = "md", loading, icon, className = "", children, disabled, disabledReason, title, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading || !!disabledReason}
      title={disabledReason ?? title}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
