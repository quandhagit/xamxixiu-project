"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AssetLibraryManager } from "../assets/AssetLibraryManager";
import { WorkflowWorkspace } from "../workflow/WorkflowWorkspace";
import { AppChrome } from "./AppChrome";
import {
  appViewFromPathname,
  appViewPanelClass,
  isAppViewVisible
} from "./app-view";

export function AppShell(): React.ReactElement {
  const pathname = usePathname() ?? "/";
  const active = appViewFromPathname(pathname);
  const [projectLabel, setProjectLabel] = useState(
    "Chưa chọn project"
  );

  return (
    <AppChrome active={active} projectLabel={projectLabel}>
      <div className={appViewPanelClass("workflow", active)}>
        <WorkflowWorkspace
          visible={isAppViewVisible(active, "workflow")}
          onProjectLabelChange={setProjectLabel}
        />
      </div>
      <div className={appViewPanelClass("library", active)}>
        <AssetLibraryManager
          visible={isAppViewVisible(active, "library")}
        />
      </div>
    </AppChrome>
  );
}
