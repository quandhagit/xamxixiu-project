export const WORKFLOW_STEPS = [
  "INPUT",
  "CAPTURE",
  "VOICE",
  "TIMELINE"
] as const;

export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];
