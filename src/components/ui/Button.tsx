import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
}

export function Button({
  children,
  className,
  type = "button",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold tracking-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" &&
          "border-orange-500 bg-orange-500 text-stone-950 hover:border-orange-400 hover:bg-orange-400",
        variant === "secondary" &&
          "border-stone-700 bg-stone-900 text-stone-100 hover:border-stone-500 hover:bg-stone-800",
        variant === "quiet" &&
          "border-transparent bg-transparent text-stone-300 hover:bg-stone-800 hover:text-stone-50",
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
