"use client";

import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { fieldClassName } from "./Input";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): React.ReactElement {
  return (
    <textarea
      className={cn(fieldClassName, "min-h-[80px] resize-y leading-5", className)}
      {...props}
    />
  );
}
