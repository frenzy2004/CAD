import type { ReactNode } from "react";
import clsx from "clsx";

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: "neutral" | "working" | "success" | "warning" | "danger";
}

export function StatusBadge({
  children,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em]",
        tone === "neutral" &&
          "border-stone-700 bg-stone-900 text-stone-300",
        tone === "working" &&
          "border-sky-800 bg-sky-950/60 text-sky-300",
        tone === "success" &&
          "border-emerald-800 bg-emerald-950/60 text-emerald-300",
        tone === "warning" &&
          "border-orange-800 bg-orange-950/60 text-orange-300",
        tone === "danger" &&
          "border-red-800 bg-red-950/60 text-red-300",
      )}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-current"
      />
      {children}
    </span>
  );
}
