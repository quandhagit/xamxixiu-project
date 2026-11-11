import {
  cloneTimelineProject,
  type TimelineProject
} from "./project.js";

export function pushHistory(
  stack: TimelineProject[],
  project: TimelineProject,
  limit = 40
): TimelineProject[] {
  return [...stack, cloneTimelineProject(project)].slice(-limit);
}

export function undoHistory(
  past: TimelineProject[],
  present: TimelineProject
): { past: TimelineProject[]; present: TimelineProject; future: TimelineProject } | undefined {
  if (past.length === 0) {
    return undefined;
  }
  const previous = past[past.length - 1];
  return {
    past: past.slice(0, -1),
    present: previous,
    future: cloneTimelineProject(present)
  };
}
