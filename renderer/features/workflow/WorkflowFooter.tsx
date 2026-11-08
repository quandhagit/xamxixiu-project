"use client";

import { Button } from "../ui/Button";
import type { WorkflowStep } from "./steps";

export function WorkflowFooter({
  currentIndex,
  stepCount,
  currentStep,
  operationLoading,
  onBack,
  onNext
}: {
  currentIndex: number;
  stepCount: number;
  currentStep: WorkflowStep;
  operationLoading: boolean;
  onBack: () => void;
  onNext: () => void;
}): React.ReactElement {
  return (
    <footer className="flex h-12 shrink-0 items-center justify-between border-t border-line bg-sidebar px-3">
      <Button
        variant="ghost"
        onClick={onBack}
        disabled={currentIndex === 0}
      >
        ← Back
      </Button>
      <Button
        variant="primary"
        onClick={onNext}
        disabled={currentIndex === stepCount - 1 || operationLoading}
      >
        {operationLoading
          ? "Đang xử lý..."
          : currentStep === "CAPTURE" ||
              currentStep === "ANALYZE" ||
              currentStep === "VOICE"
            ? "Chạy bước tiếp →"
            : "Next →"}
      </Button>
    </footer>
  );
}
