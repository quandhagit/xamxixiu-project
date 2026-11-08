"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { SettingsDialog } from "./SettingsDialog";
import { APP_VIEW_HREF } from "./app-view";

export function AppChrome({
  active,
  projectLabel,
  children
}: {
  active: "workflow" | "library";
  projectLabel?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-app text-ink">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-sidebar px-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="shrink-0 text-[13px] font-medium text-ink">
            Xàm Xí Xíu
          </h1>
          <nav className="flex items-center gap-0.5">
            <Link
              href={APP_VIEW_HREF.workflow}
              scroll={false}
              aria-current={active === "workflow" ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-[13px] transition",
                active === "workflow"
                  ? "bg-accent/15 text-ink"
                  : "text-ink-2 hover:bg-elevated hover:text-ink"
              )}
            >
              Workflow
            </Link>
            <Link
              href={APP_VIEW_HREF.library}
              scroll={false}
              aria-current={active === "library" ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-[13px] transition",
                active === "library"
                  ? "bg-accent/15 text-ink"
                  : "text-ink-2 hover:bg-elevated hover:text-ink"
              )}
            >
              Library
            </Link>
          </nav>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {projectLabel ? (
            <div className="max-w-[240px] truncate rounded-md border border-line bg-panel px-2 py-0.5 text-[12px] text-ink-2">
              {projectLabel}
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </Button>
        </div>
      </header>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </main>
  );
}
