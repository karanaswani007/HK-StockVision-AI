import { cn } from "@/lib/cn";
import { DISCLAIMER } from "@/lib/market/constants";
import { formatPct } from "@/lib/format";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "surface" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-on-accent hover:opacity-90",
    surface: "border border-line bg-surface-2 text-fg hover:border-accent",
    ghost: "text-fg hover:bg-surface-2",
    danger: "bg-down text-on-accent hover:opacity-90",
  };
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-lg border border-line bg-surface p-4", className)}>{children}</section>;
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-medium tracking-widest text-accent uppercase">{kicker}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-md border border-line bg-bg p-1" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={String(option.id)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn("min-h-11 rounded-sm px-3 text-sm", active ? "bg-accent text-on-accent" : "text-muted hover:text-fg")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ChangePill({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-sm text-faint">—</span>;
  const tone = value > 0 ? "tint-up" : value < 0 ? "tint-down" : "bg-surface-2 text-muted";
  return <span className={cn("inline-flex rounded-sm px-2 py-1 font-mono text-xs font-medium", tone)}>{formatPct(value)}</span>;
}

export function DelayedBadge() {
  return <span className="tint-warn rounded-sm px-2 py-1 text-xs font-medium">Delayed</span>;
}

export function Disclaimer({ className }: { className?: string }) {
  return <p className={cn("text-xs leading-relaxed text-faint", className)}>{DISCLAIMER}</p>;
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-3 rounded-lg border border-line bg-surface text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm text-down">{message}</p>
      {onRetry ? (
        <Button variant="surface" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-muted">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export const fieldClass =
  "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none focus:border-accent";
