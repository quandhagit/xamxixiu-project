"use client";

import { cn } from "./cn";

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  orientation = "horizontal"
}: {
  items: Array<{ id: T; label: string; hint?: string }>;
  value: T;
  onChange: (id: T) => void;
  orientation?: "horizontal" | "vertical";
}): React.ReactElement {
  const vertical = orientation === "vertical";

  return (
    <div
      role="tablist"
      className={cn(
        "flex",
        vertical ? "flex-col gap-0.5" : "flex-wrap gap-1 border-b border-line"
      )}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={cn(
              "rounded-md text-left transition",
              vertical ? "px-2.5 py-1.5" : "px-2.5 py-1.5",
              selected
                ? "bg-accent/15 text-ink"
                : "text-ink-2 hover:bg-elevated hover:text-ink"
            )}
          >
            <span className="block text-[13px] font-medium">
              {item.label}
            </span>
            {item.hint ? (
              <span className="mt-0.5 block text-[11px] font-normal text-ink-3">
                {item.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
