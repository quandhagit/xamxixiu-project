import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Panel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-panel p-3",
        className
      )}
      {...props}
    />
  );
}
