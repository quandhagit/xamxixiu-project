"use client";

import type { ContentData } from "../../../src/types";
import { TOPIC_TITLE_MAX_LENGTH } from "../../../src/timeline/topic-constants";
import type { SpeechTextDiff } from "../../../src/comments/clean-speech-text";
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
  draftTopicTitle,
  titleSuggestions,
  textDiffs,
  onReset,
  onCurate,
  onSave,
  onTopicTextChange,
  onCommentsChange,
  onAddComment,
  onTopicTitleChange,
  onCleanText,
  onAcceptDiff,
  onRejectDiff,
  onSuggestTitles,
  onPickTitle
}: {
  draftContent?: ContentData;
  captureAssets: Record<string, string>;
  imageSlots: number[];
  addCommentLoading: boolean;
  operationLoading: boolean;
  hasProject: boolean;
  draftTopicTitle: string;
  titleSuggestions: string[];
  textDiffs: SpeechTextDiff[];
  onReset: () => void;
  onCurate: () => void;
  onSave: () => void;
  onTopicTextChange: (text: string) => void;
  onCommentsChange: (
    comments: ContentData["comments"],
    slots: number[]
  ) => void;
  onAddComment: (url: string) => void;
  onTopicTitleChange: (value: string) => void;
  onCleanText: () => void;
  onAcceptDiff: (index: number) => void;
  onRejectDiff: (index: number) => void;
  onSuggestTitles: () => void;
  onPickTitle: (title: string) => void;
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
            onClick={onCleanText}
            disabled={!hasProject || !draftContent || operationLoading}
          >
            AI làm sạch text
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

          <Panel>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-3">
                Topic title
              </p>
              <span className="text-[11px] text-ink-3">
                {draftTopicTitle.length}/{TOPIC_TITLE_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              value={draftTopicTitle}
              maxLength={TOPIC_TITLE_MAX_LENGTH}
              placeholder="Bắt buộc nhập title, hoặc bấm AI gợi ý"
              onChange={(event) => onTopicTitleChange(event.target.value)}
              className="mt-2 min-h-[72px] leading-5"
            />
            {!draftTopicTitle.trim() ? (
              <p className="mt-2 text-[12px] text-warning">
                Chưa có topic title. Hãy nhập hoặc generate bằng AI.
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={!draftContent || operationLoading}
                onClick={onSuggestTitles}
              >
                AI gợi ý title
              </Button>
              {titleSuggestions.map((title) => (
                <Button
                  key={title}
                  variant="ghost"
                  size="sm"
                  onClick={() => onPickTitle(title)}
                >
                  {title}
                </Button>
              ))}
            </div>
          </Panel>

          {textDiffs.length > 0 ? (
            <Panel className="space-y-2">
              <p className="text-[12px] font-medium text-ink">
                Đề xuất làm sạch text — Accept/Reject từng dòng
              </p>
              {textDiffs.map((diff) => (
                <div
                  key={diff.index}
                  className="rounded-md border border-line bg-app p-2.5 text-[12px]"
                >
                  <p className="text-ink-3">
                    {diff.index === -1 ? "Post" : `Comment #${diff.index}`}
                  </p>
                  <p className="mt-1 text-ink-3 line-through">{diff.before}</p>
                  <p className="mt-1 text-ink">{diff.after}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onAcceptDiff(diff.index)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRejectDiff(diff.index)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </Panel>
          ) : null}

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
