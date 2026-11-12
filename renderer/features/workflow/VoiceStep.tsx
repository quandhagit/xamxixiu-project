"use client";

import type {
  AudioFailureTarget,
  ContentData
} from "../../../src/types";
import type { ProjectState } from "../../../src/project/store";
import {
  TOPIC_TITLE_MAX_LENGTH,
  normalizeTopicTitle
} from "../../../src/timeline/topic-constants";
import { VoiceSelect } from "../voice/VoiceSelect";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { Textarea } from "../ui/Textarea";

export function VoiceStep({
  project,
  draftContent,
  draftTopicTitle,
  audioAssets,
  skipTopicTitleVoice,
  titleVoiceMode,
  defaultTitleVoiceEnabled,
  operationLoading,
  onGenerateAll,
  onTopicTitleChange,
  onTopicTitleBlur,
  onTopicTextChange,
  onCommentTextChange,
  onVoiceChange,
  onRetryAudio,
  onTitleVoiceModeChange,
  onAssignVoices
}: {
  project?: ProjectState;
  draftContent?: ContentData;
  draftTopicTitle: string;
  audioAssets: Record<string, string>;
  skipTopicTitleVoice: boolean;
  titleVoiceMode: "auto" | "on" | "off";
  defaultTitleVoiceEnabled: boolean;
  operationLoading: boolean;
  onGenerateAll: () => void;
  onTopicTitleChange: (value: string) => void;
  onTopicTitleBlur: () => void;
  onTopicTextChange: (text: string) => void;
  onCommentTextChange: (index: number, text: string) => void;
  onVoiceChange: (target: AudioFailureTarget, voiceId: string) => void;
  onRetryAudio: (target: AudioFailureTarget) => void;
  onTitleVoiceModeChange: (mode: "auto" | "on" | "off") => void;
  onAssignVoices: () => void;
}): React.ReactElement {
  const topicFailure = project?.audioFailures.find(
    (item) => item.target === "topic"
  );

  return (
    <div className="space-y-3">
      <Panel className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">
            Voice generation
          </h3>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Chỉnh text bên trái. Bấm AI chọn voice, hoặc chọn tay rồi Generate.
          </p>
        </div>
        {operationLoading ? (
          <span className="text-[12px] text-warning">
            Đang generate voice...
          </span>
        ) : (
          <div className="flex gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={operationLoading}
              onClick={onAssignVoices}
            >
              AI chọn voice
            </Button>
            <Button variant="primary" size="sm" onClick={onGenerateAll}>
              Generate all
            </Button>
          </div>
        )}
      </Panel>

      <Panel className={skipTopicTitleVoice ? "opacity-70" : undefined}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-3">
            Topic title voice
          </p>
          <span className="text-[11px] text-ink-3">
            {draftTopicTitle.length}/{TOPIC_TITLE_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          value={draftTopicTitle}
          maxLength={TOPIC_TITLE_MAX_LENGTH}
          disabled={operationLoading}
          placeholder="Nhập topic title..."
          onChange={(event) => onTopicTitleChange(event.target.value)}
          onBlur={onTopicTitleBlur}
          className="mt-2 min-h-[72px] leading-5"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-accent"
              checked={!skipTopicTitleVoice}
              disabled={operationLoading}
              onChange={(event) =>
                onTitleVoiceModeChange(event.target.checked ? "on" : "off")
              }
            />
            Generate topic title voice
          </label>
          <span className="text-ink-3">
            Mặc định {defaultTitleVoiceEnabled ? "bật" : "tắt"} vì topic
            {defaultTitleVoiceEnabled ? " dài hơn 200 ký tự." : " ngắn ≤ 200 ký tự."}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={operationLoading || titleVoiceMode === "auto"}
            onClick={() => onTitleVoiceModeChange("auto")}
          >
            Reset về mặc định
          </Button>
        </div>
        {skipTopicTitleVoice ? (
          <p className="mt-2 text-[12px] text-warning">
            Đang tắt title voice. Bật lại nếu vẫn muốn generate.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[11px] text-ink-3">Voice</p>
            <VoiceSelect
              value={project?.analysis?.topicTitleVoiceId ?? "ngoc-huyen"}
              disabled={operationLoading}
              onChange={(voiceId) => onVoiceChange("topic-title", voiceId)}
            />
            {audioAssets["topic-title.mp3"] ? (
              <audio
                className="mt-3 w-full"
                controls
                preload="metadata"
                src={audioAssets["topic-title.mp3"]}
              >
                Trình duyệt không hỗ trợ audio.
              </audio>
            ) : (
              <p className="mt-2 text-[12px] text-warning">
                Chưa có audio. Bấm Generate all để tạo.
              </p>
            )}
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={
            operationLoading ||
            skipTopicTitleVoice ||
            !normalizeTopicTitle(draftTopicTitle)
          }
          onClick={() => onRetryAudio("topic-title")}
        >
          {skipTopicTitleVoice
            ? "Không generate topic title voice"
            : operationLoading
              ? "Đang tạo..."
              : audioAssets["topic-title.mp3"]
                ? "Generate lại title voice"
                : "Generate topic title voice"}
        </Button>
      </Panel>

      {draftContent ? (
        <div className="space-y-3">
          <Panel className="grid gap-3 lg:grid-cols-[1fr_0.45fr]">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-3">
                Topic text
              </p>
              <Textarea
                value={draftContent.text}
                onChange={(event) => onTopicTextChange(event.target.value)}
                className="mt-2 min-h-[130px] leading-5"
              />
            </div>
            <div className="rounded-md border border-line bg-app p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-3">
                Topic voice
              </p>
              <VoiceSelect
                value={project?.analysis?.topicVoiceId ?? "ngoc-huyen"}
                disabled={operationLoading}
                onChange={(voiceId) => onVoiceChange("topic", voiceId)}
              />
              <p className="mt-2 text-[12px] text-ink-3">
                {project?.audioFiles.includes("topic.mp3")
                  ? "✓ Audio generated"
                  : operationLoading
                    ? "Đang xử lý..."
                    : topicFailure?.message ?? "Chưa có audio"}
              </p>
              {audioAssets["topic.mp3"] ? (
                <audio
                  className="mt-3 w-full"
                  controls
                  preload="metadata"
                  src={audioAssets["topic.mp3"]}
                >
                  Trình duyệt không hỗ trợ audio.
                </audio>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={operationLoading}
                onClick={() => onRetryAudio("topic")}
              >
                {topicFailure ? "Retry" : "Generate"}
              </Button>
            </div>
          </Panel>

          {draftContent.comments
            .map((comment, index) => ({ comment, index }))
            .filter(({ comment }) => !comment.excluded)
            .map(({ comment, index }) => {
              const target: AudioFailureTarget = `comment-${index}`;
              const failure = project?.audioFailures.find(
                (item) => item.target === target
              );
              const audioFile = `comment-${index}.mp3`;
              const reaction = project?.analysis?.reactions.find(
                (item) => item.commentIndex === index
              );

              return (
                <Panel
                  key={`${comment.containerIndex}-${index}`}
                  className="grid gap-3 lg:grid-cols-[1fr_0.45fr]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-wide text-ink-3">
                        Comment {index}
                      </p>
                      <span className="text-[11px] text-ink-3">
                        {comment.author}
                      </span>
                    </div>
                    <Textarea
                      value={comment.text}
                      onChange={(event) =>
                        onCommentTextChange(index, event.target.value)
                      }
                      className="mt-2 min-h-[120px] leading-5"
                    />
                  </div>
                  <div className="rounded-md border border-line bg-app p-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-ink-3">
                      Selected voice
                    </p>
                    <VoiceSelect
                      value={reaction?.voiceId ?? "ngoc-huyen"}
                      disabled={operationLoading}
                      onChange={(voiceId) => onVoiceChange(target, voiceId)}
                    />
                    <p className="mt-2 text-[12px] text-ink-3">
                      {project?.audioFiles.includes(audioFile)
                        ? "✓ Audio generated"
                        : failure
                          ? failure.message
                          : operationLoading
                            ? "Đang xử lý..."
                            : "Chưa có audio"}
                    </p>
                    {audioAssets[audioFile] ? (
                      <audio
                        className="mt-3 w-full"
                        controls
                        preload="metadata"
                        src={audioAssets[audioFile]}
                      >
                        Trình duyệt không hỗ trợ audio.
                      </audio>
                    ) : null}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      disabled={operationLoading || comment.excluded === true}
                      onClick={() => onRetryAudio(target)}
                    >
                      {comment.excluded
                        ? "Excluded"
                        : failure
                          ? "Retry"
                          : "Generate"}
                    </Button>
                  </div>
                </Panel>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}
