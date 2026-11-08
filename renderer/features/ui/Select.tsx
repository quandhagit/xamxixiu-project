"use client";

import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";
import { fieldClassName } from "./Input";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.ReactElement {
  return (
    <select
      className={cn(fieldClassName, className)}
      {...props}
    >
      {children}
    </select>
  );
}
