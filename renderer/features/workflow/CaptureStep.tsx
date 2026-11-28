"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  DEFAULT_COMMENT_CAPTURE_STYLE,
  type CommentCaptureStyle
} from "../../../src/capture-style";
import {
  COMMENT_IMAGE_MAX_BYTES,
  isCommentImageMime
} from "../../../src/comments/comment-constants";
import { CaptureStyleImage } from "../custom/CaptureStyleImage";
import type { ContentData } from "../../../src/types";
import { TOPIC_TITLE_MAX_LENGTH } from "../../../src/timeline/topic-constants";
import type { SpeechTextDiff } from "../../../src/comments/clean-speech-text";
import { CaptureComments } from "../capture/CaptureComments";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Panel } from "../ui/Panel";
import { Textarea } from "../ui/Textarea";
import { cn } from "../ui/cn";

function isImageFile(file: File): boolean {
  if (isCommentImageMime(file.type) || file.type.startsWith("image/")) {
    return true;
  }

  return file.type === "" && /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

function firstImageFile(files: FileList | null | undefined): File | undefined {
  if (!files) {
    return undefined;
  }

  return Array.from(files).find(isImageFile);
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export function CaptureStep({
  draftContent,
  captureAssets,
  captureStyle = DEFAULT_COMMENT_CAPTURE_STYLE,
  imageSlots,
  addCommentLoading,
  operationLoading,
  hasProject,
  draftTopicTitle,
  titleInvalid = false,
  titleInvalidNonce = 0,
  titleSuggestions,
  textDiffs,
  onReset,
  onCurate,
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
  captureStyle?: CommentCaptureStyle;
  imageSlots: number[];
  addCommentLoading: boolean;
  operationLoading: boolean;
  hasProject: boolean;
  draftTopicTitle: string;
  titleInvalid?: boolean;
  titleInvalidNonce?: number;
  titleSuggestions: string[];
  textDiffs: SpeechTextDiff[];
  onReset: () => void;
  onCurate: () => void;
  onTopicTextChange: (text: string) => void;
  onCommentsChange: (
    comments: ContentData["comments"],
    slots: number[]
  ) => void;
  onAddComment: (bytes: Uint8Array, text: string) => void;
  onTopicTitleChange: (value: string) => void;
  onCleanText: () => void;
  onAcceptDiff: (index: number) => void;
  onRejectDiff: (index: number) => void;
  onSuggestTitles: () => void;
  onPickTitle: (title: string) => void;
}): React.ReactElement {
  const titlePanelRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);
  const addTextRef = useRef<HTMLTextAreaElement>(null);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const [addOpen, setAddOpen] = useState(false);
  const [addDragging, setAddDragging] = useState(false);
  const [addError, setAddError] = useState<string>();
  const [pendingBytes, setPendingBytes] = useState<Uint8Array>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [draftComment, setDraftComment] = useState("");

  useEffect(() => {
    if (!titleInvalid) {
      return;
    }
    titlePanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    titleInputRef.current?.focus();
  }, [titleInvalid, titleInvalidNonce]);

  useEffect(() => {
    return () => revokePreview();
  }, []);

  useEffect(() => {
    if (!addOpen) {
      return;
    }

    function handlePaste(event: ClipboardEvent): void {
      const file = firstImageFile(event.clipboardData?.files);

      if (!file) {
        const items = event.clipboardData?.items;
        const fromItems = items
          ? Array.from(items)
              .map((item) => item.getAsFile())
              .find(
                (candidate): candidate is File =>
                  candidate != null && isImageFile(candidate)
              )
          : undefined;

        if (!fromItems) {
          return;
        }

        event.preventDefault();
        void stageImage(fromItems);
        return;
      }

      event.preventDefault();
      void stageImage(file);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addOpen, addCommentLoading]);

  function revokePreview(): void {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = undefined;
    }
  }

  function closeAddDialog(): void {
    revokePreview();
    setAddOpen(false);
    setAddDragging(false);
    setAddError(undefined);
    setPendingBytes(undefined);
    setPreviewUrl(undefined);
    setDraftComment("");
  }

  async function stageImage(file: File): Promise<void> {
    if (addCommentLoading) {
      return;
    }

    if (!isImageFile(file)) {
      setAddError("Hãy chọn một file ảnh.");
      return;
    }

    if (file.size > COMMENT_IMAGE_MAX_BYTES) {
      setAddError("Ảnh quá lớn (tối đa 10MB).");
      return;
    }

    const bytes = await fileToBytes(file);
    const nextUrl = URL.createObjectURL(file);
    revokePreview();
    previewUrlRef.current = nextUrl;
    setPendingBytes(bytes);
    setPreviewUrl(nextUrl);
    setAddError(undefined);
    window.requestAnimationFrame(() => {
      addTextRef.current?.focus();
    });
  }

  function savePendingComment(): void {
    const text = draftComment.trim();

    if (!pendingBytes || !text || addCommentLoading) {
      return;
    }

    onAddComment(pendingBytes, text);
    closeAddDialog();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setAddDragging(false);
    const file = firstImageFile(event.dataTransfer.files);

    if (!file) {
      setAddError("Hãy thả một file ảnh.");
      return;
    }

    void stageImage(file);
  }

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
            onClick={() => {
              setAddError(undefined);
              setDraftComment("");
              setAddOpen(true);
            }}
            disabled={
              !hasProject ||
              !draftContent ||
              addCommentLoading ||
              operationLoading
            }
          >
            {addCommentLoading ? "Đang thêm..." : "Thêm comment"}
          </Button>
        </div>
      </div>
      <Dialog
        open={addOpen}
        onClose={closeAddDialog}
        className="max-w-lg"
        labelledBy="add-comment-title"
      >
        <div className="border-b border-line px-4 py-3">
          <h3
            id="add-comment-title"
            className="text-sm font-medium text-ink"
          >
            Thêm comment
          </h3>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Dán ảnh (Ctrl+V), thả file, hoặc chọn từ máy, rồi điền comment
            và bấm Lưu.
          </p>
        </div>
        <div className="space-y-3 px-4 py-3">
          <input
            ref={addFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              const file = firstImageFile(event.target.files);
              event.target.value = "";

              if (!file) {
                setAddError("Hãy chọn một file ảnh.");
                return;
              }

              void stageImage(file);
            }}
          />
          {previewUrl ? (
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setAddDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setAddDragging(true);
              }}
              onDragLeave={(event) => {
                if (
                  event.currentTarget.contains(
                    event.relatedTarget as Node
                  )
                ) {
                  return;
                }
                setAddDragging(false);
              }}
              onDrop={handleDrop}
              className={cn(
                "flex min-h-[140px] items-center justify-center overflow-hidden rounded-lg border bg-app p-3",
                addDragging ? "border-accent" : "border-line"
              )}
            >
              <img
                src={previewUrl}
                alt="Ảnh comment sẽ thêm"
                className="max-h-[220px] max-w-full object-contain"
              />
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => addFileRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  addFileRef.current?.click();
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setAddDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setAddDragging(true);
              }}
              onDragLeave={(event) => {
                if (
                  event.currentTarget.contains(
                    event.relatedTarget as Node
                  )
                ) {
                  return;
                }
                setAddDragging(false);
              }}
              onDrop={handleDrop}
              className={cn(
                "flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center",
                addDragging
                  ? "border-accent bg-accent/10"
                  : "border-line bg-app"
              )}
            >
              <p className="text-[13px] text-ink">
                Dán, thả, hoặc chọn ảnh comment
              </p>
              <p className="mt-1 text-[12px] text-ink-3">
                PNG, JPG, WebP, GIF · tối đa 10MB
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={addCommentLoading}
                onClick={(event) => {
                  event.stopPropagation();
                  addFileRef.current?.click();
                }}
              >
                Chọn từ máy
              </Button>
            </div>
          )}
          {previewUrl ? (
            <>
              <Textarea
                ref={addTextRef}
                value={draftComment}
                onChange={(event) =>
                  setDraftComment(event.target.value)
                }
                placeholder="Nội dung comment"
                className="min-h-[96px] leading-5"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={addCommentLoading}
                  onClick={() => addFileRef.current?.click()}
                >
                  Đổi ảnh
                </Button>
              </div>
            </>
          ) : null}
          {addError ? (
            <p className="text-[12px] text-danger">{addError}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-1.5 border-t border-line px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={closeAddDialog}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={
              addCommentLoading ||
              !pendingBytes ||
              draftComment.trim().length === 0
            }
            onClick={savePendingComment}
          >
            {addCommentLoading ? "Đang thêm..." : "Lưu"}
          </Button>
        </div>
      </Dialog>

      {draftContent ? (
        <>
          <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
            <Panel className="flex min-h-[160px] items-start justify-center bg-app">
              {captureAssets.topic ? (
                <CaptureStyleImage
                  src={captureAssets.topic}
                  alt="Threads topic screenshot"
                  className="max-h-[260px] max-w-full object-contain"
                  captureStyle={captureStyle}
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

          <div ref={titlePanelRef}>
          <Panel
            className={titleInvalid ? "border-danger" : undefined}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-3">
                Topic title
              </p>
              <span className="text-[11px] text-ink-3">
                {draftTopicTitle.length}/{TOPIC_TITLE_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              ref={titleInputRef}
              value={draftTopicTitle}
              maxLength={TOPIC_TITLE_MAX_LENGTH}
              placeholder="Bắt buộc nhập title, hoặc bấm AI gợi ý"
              onChange={(event) => onTopicTitleChange(event.target.value)}
              className={cn(
                "mt-2 min-h-[72px] leading-5",
                titleInvalid && "border-danger focus:ring-danger"
              )}
            />
            {!draftTopicTitle.trim() || titleInvalid ? (
              <p className={cn(
                "mt-2 text-[12px]",
                titleInvalid ? "text-danger" : "text-warning"
              )}>
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
          </div>

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
            captureStyle={captureStyle}
            onChange={onCommentsChange}
          />
        </>
      ) : null}
    </div>
  );
}
