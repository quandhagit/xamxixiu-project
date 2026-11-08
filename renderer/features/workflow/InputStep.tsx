"use client";

import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Panel } from "../ui/Panel";

export function InputStep({
  url,
  captureLoading,
  onUrlChange,
  onCapture
}: {
  url: string;
  captureLoading: boolean;
  onUrlChange: (url: string) => void;
  onCapture: () => void;
}): React.ReactElement {
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
      />
      <Button
        variant="primary"
        className="mt-3"
        onClick={onCapture}
        disabled={!url.trim() || captureLoading}
      >
        {captureLoading ? "Đang capture..." : "Capture →"}
      </Button>
      <p className="mt-2 text-[12px] text-ink-3">
        Playwright sẽ mở Threads, lấy nội dung và xử lý ảnh.
      </p>
    </Panel>
  );
}
