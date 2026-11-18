import type { TimelineProject } from "./project.js";

function cloneTimelineProject(project: TimelineProject): TimelineProject {
  return JSON.parse(JSON.stringify(project)) as TimelineProject;
}

export const HISTORY_LIMIT = 40;

export interface TimelineHistory {
  past: TimelineProject[];
  future: TimelineProject[];
}

export function emptyTimelineHistory(): TimelineHistory {
  return { past: [], future: [] };
}

export function timelineProjectsEqual(
  left: TimelineProject,
  right: TimelineProject
): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

export function pushHistory(
  history: TimelineHistory,
  present: TimelineProject,
  limit = HISTORY_LIMIT
): TimelineHistory {
  const last = history.past[history.past.length - 1];
  if (last && timelineProjectsEqual(last, present)) {
    return history;
  }
  return {
    past: [...history.past, cloneTimelineProject(present)].slice(-limit),
    future: []
  };
}

export function undoHistory(
  history: TimelineHistory,
  present: TimelineProject
): { history: TimelineHistory; present: TimelineProject } | undefined {
  if (history.past.length === 0) {
    return undefined;
  }
  const previous = history.past[history.past.length - 1];
  if (!previous) {
    return undefined;
  }
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [cloneTimelineProject(present), ...history.future]
    },
    present: cloneTimelineProject(previous)
  };
}

export function redoHistory(
  history: TimelineHistory,
  present: TimelineProject
): { history: TimelineHistory; present: TimelineProject } | undefined {
  if (history.future.length === 0) {
    return undefined;
  }
  const next = history.future[0];
  if (!next) {
    return undefined;
  }
  return {
    history: {
      past: [...history.past, cloneTimelineProject(present)].slice(
        -HISTORY_LIMIT
      ),
      future: history.future.slice(1)
    },
    present: cloneTimelineProject(next)
  };
}

export function isEditableHotkeyTarget(
  target:
    | EventTarget
    | { tagName?: string; isContentEditable?: boolean }
    | null
    | undefined
): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
  };
  if (element.isContentEditable) {
    return true;
  }
  const tag = String(element.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function timelineHotkey(event: {
  ctrlKey: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  code?: string;
  key?: string;
  target?:
    | EventTarget
    | { tagName?: string; isContentEditable?: boolean }
    | null;
}): "undo" | "redo" | undefined {
  if (!event.ctrlKey || event.altKey || event.shiftKey) {
    return undefined;
  }
  if (isEditableHotkeyTarget(event.target)) {
    return undefined;
  }
  const code = event.code ?? "";
  const key = (event.key ?? "").toLowerCase();
  if (code === "KeyZ" || key === "z") {
    return "undo";
  }
  if (code === "KeyY" || key === "y") {
    return "redo";
  }
  return undefined;
}
