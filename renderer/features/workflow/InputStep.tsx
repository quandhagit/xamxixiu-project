"use client";

import {
  CAPTURE_COMMENT_MAX
} from "../../../src/comments/comment-constants";
import type { CaptureViewport } from "../../../src/types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Panel } from "../ui/Panel";

export function InputStep({
  url,
  captureCount,
  captureViewport,
  captureLoading,
  onUrlChange,
  onCaptureCountChange,
  onCaptureViewportChange,
  onCapture
}: {
  url: string;
  captureCount: number;
  captureViewport: CaptureViewport;
  captureLoading: boolean;
  onUrlChange: (url: string) => void;
  onCaptureCountChange: (count: number) => void;
  onCaptureViewportChange: (viewport: CaptureViewport) => void;
  onCapture: () => void;
}): React.ReactElement {
  const countReady =
    Number.isInteger(captureCount) &&
    captureCount >= 1 &&
    captureCount <= CAPTURE_COMMENT_MAX;

  return (
    <Panel className="max-w-xl">
      <label
        htmlFor="threads-url"
        className="text-[13px] font-medium text-ink"
      >
        Threads URL
      </label>
      <Input
        id="threads-url"
        className="mt-2"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        placeholder="https://www.threads.com/@..."
        disabled={captureLoading}
      />
      <label
        htmlFor="capture-count"
        className="mt-3 block text-[13px] font-medium text-ink"
      >
        Số ảnh
      </label>
      <div className="mt-2 w-24">
        <Input
          id="capture-count"
          type="number"
          min={1}
          max={CAPTURE_COMMENT_MAX}
          step={1}
          value={captureCount || ""}
          disabled={captureLoading}
          onChange={(event) => {
            if (event.target.value === "") {
              onCaptureCountChange(0);
              return;
            }

            const next = Number(event.target.value);

            if (Number.isInteger(next)) {
              onCaptureCountChange(next);
            }
          }}
        />
      </div>
      <p className="mt-1 text-[12px] text-ink-3">
        {`Số comment được chụp, từ 1 đến ${CAPTURE_COMMENT_MAX}. Ảnh bài gốc luôn được chụp thêm.`}
      </p>
      <p className="mt-3 text-[13px] font-medium text-ink">
        Layout capture
      </p>
      <div className="mt-2 flex gap-4 text-[13px] text-ink">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name="capture-viewport"
            value="mobile"
            checked={captureViewport === "mobile"}
            disabled={captureLoading}
            onChange={() => onCaptureViewportChange("mobile")}
          />
          Mobile
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name="capture-viewport"
            value="desktop"
            checked={captureViewport === "desktop"}
            disabled={captureLoading}
            onChange={() => onCaptureViewportChange("desktop")}
          />
          Desktop
        </label>
      </div>
      <Button
        variant="primary"
        className="mt-3"
        onClick={onCapture}
        disabled={!url.trim() || !countReady || captureLoading}
      >
        {captureLoading ? "Đang capture..." : "Capture →"}
      </Button>
    </Panel>
  );
}
