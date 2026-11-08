"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export const fieldClassName = [
  "w-full rounded-md border border-line bg-app px-2.5 py-1.5",
  "text-[13px] text-ink outline-none placeholder:text-ink-3",
  "focus:ring-1 focus:ring-accent",
  "disabled:cursor-not-allowed disabled:opacity-40"
].join(" ");

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(fieldClassName, className)}
      {...props}
    />
  );
});
