"use client";

import type { ContentData } from "../../../src/types";
import { CaptureComments } from "../capture/CaptureComments";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { Textarea } from "../ui/Textarea";

export function CaptureStep({
  draftContent,
  captureAssets,
  imageSlots,
  addCommentLoading,
  operationLoading,
  hasProject,
  onReset,
  onCurate,
  onSave,
  onTopicTextChange,
  onCommentsChange,
  onAddComment
}: {
  draftContent?: ContentData;
  captureAssets: Record<string, string>;
  imageSlots: number[];
  addCommentLoading: boolean;
  operationLoading: boolean;
  hasProject: boolean;
  onReset: () => void;
  onCurate: () => void;
  onSave: () => void;
  onTopicTextChange: (text: string) => void;
  onCommentsChange: (
    comments: ContentData["comments"],
    slots: number[]
  ) => void;
  onAddComment: (url: string) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-ink-2">
          Screenshot bên trái · Nội dung có thể sửa bên phải
        </p>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={!hasProject || operationLoading}
          >
            Reset mặc định
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCurate}
            disabled={!hasProject || !draftContent || operationLoading}
          >
            AI chọn comment
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={!draftContent || operationLoading}
          >
            Lưu nội dung
          </Button>
        </div>
      </div>

      {draftContent ? (
        <>
          <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
            <Panel className="flex min-h-[160px] items-start justify-center bg-app">
              {captureAssets.topic ? (
                <img
                  src={captureAssets.topic}
                  alt="Threads topic screenshot"
                  className="max-h-[260px] max-w-full rounded-md object-contain"
                />
              ) : (
                <p className="py-8 text-[13px] text-ink-3">
                  Đang tải screenshot...
                </p>
              )}
            </Panel>
            <Panel>
              <div className="flex justify-between text-[11px] text-ink-3">
                <span>{draftContent.author}</span>
                <span>{draftContent.likes} likes</span>
              </div>
              <Textarea
                value={draftContent.text}
                onChange={(event) =>
                  onTopicTextChange(event.target.value)
                }
                className="mt-2 min-h-[160px] leading-6"
              />
            </Panel>
          </div>

          <CaptureComments
            comments={draftContent.comments}
            imageSlots={imageSlots}
            assets={captureAssets}
            addLoading={addCommentLoading}
            onChange={onCommentsChange}
            onAdd={onAddComment}
          />
        </>
      ) : null}
    </div>
  );
}
