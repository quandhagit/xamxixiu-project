"use client";

import type { ProjectSummary } from "../../../src/project/store";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import type { WorkflowStep } from "./steps";

export function WorkflowSidebar({
  steps,
  currentStep,
  currentIndex,
  onSelectStep,
  projects,
  selectedProjectId,
  onSelectProject,
  onDeleteProject,
  projectBusy,
  formatProjectId
}: {
  steps: readonly WorkflowStep[];
  currentStep: WorkflowStep;
  currentIndex: number;
  onSelectStep: (step: WorkflowStep) => void;
  projects: ProjectSummary[];
  selectedProjectId?: string;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  projectBusy: boolean;
  formatProjectId: (project: ProjectSummary) => string;
}): React.ReactElement {
  return (
    <aside className="flex w-[180px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="border-b border-line p-2">
        <p className="mb-1.5 px-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">
          Workflow
        </p>
        <nav className="flex flex-col gap-0.5">
          {steps.map((step, index) => {
            const active = step === currentStep;
            const completed = index < currentIndex;

            return (
              <button
                key={step}
                type="button"
                onClick={() => onSelectStep(step)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition",
                  active
                    ? "bg-accent/15 text-ink"
                    : "text-ink-2 hover:bg-elevated hover:text-ink"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-medium",
                    active
                      ? "bg-accent text-white"
                      : completed
                        ? "bg-success/20 text-success"
                        : "bg-elevated text-ink-3"
                  )}
                >
                  {completed ? "✓" : index + 1}
                </span>
                {step}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-2">
        <div className="mb-1.5 flex items-center justify-between px-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
            Recent
          </p>
          <span className="text-[11px] text-ink-3">
            {projects.length}
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {projects.length === 0 ? (
            <p className="px-1.5 py-2 text-[12px] text-ink-3">
              Chưa có project nào.
            </p>
          ) : (
            projects.map((project) => {
              const selected = project.id === selectedProjectId;
              return (
                <div
                  key={project.id}
                  className={cn(
                    "flex items-center gap-0.5 rounded-md",
                    selected && "bg-accent/15"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className={cn(
                      "min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[12px]",
                      selected ? "text-ink" : "text-ink-2 hover:text-ink"
                    )}
                  >
                    {formatProjectId(project)}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 px-0 text-ink-3 hover:text-danger"
                    disabled={projectBusy}
                    aria-label={`Xóa project ${formatProjectId(project)}`}
                    onClick={() => onDeleteProject(project.id)}
                  >
                    ×
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
