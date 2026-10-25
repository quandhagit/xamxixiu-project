"use client";

import { useState } from "react";
import { SettingsDialog } from "./SettingsDialog";

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
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 px-8">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.35em] text-fuchsia-300">
              XÀM XÍ XÍU
            </p>
            <h1 className="mt-1 text-lg font-semibold">
              Threads content workspace
            </h1>
          </div>
          <nav className="flex gap-2">
            <a
              href="/"
              className={[
                "rounded-full px-4 py-2 text-sm transition",
                active === "workflow"
                  ? "bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-fuchsia-400/30"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              ].join(" ")}
            >
              Workflow
            </a>
            <a
              href="/library/"
              className={[
                "rounded-full px-4 py-2 text-sm transition",
                active === "library"
                  ? "bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-fuchsia-400/30"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              ].join(" ")}
            >
              Library
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {projectLabel ? (
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-400">
              {projectLabel}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
          >
            Settings
          </button>
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
