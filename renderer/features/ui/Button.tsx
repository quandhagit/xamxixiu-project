"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "border border-line bg-elevated text-ink hover:bg-panel disabled:hover:bg-elevated",
  ghost:
    "text-ink-2 hover:bg-elevated hover:text-ink disabled:hover:bg-transparent disabled:hover:text-ink-2",
  danger:
    "border border-danger/30 text-danger hover:bg-danger/10 disabled:hover:bg-transparent"
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-[13px]"
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}): React.ReactElement {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variantClass[variant],
        sizeClass[size],
        className
      )}
      {...props}
    />
  );
}
