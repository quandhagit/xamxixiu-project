"use client";

import type { ContentData } from "../../../src/types";
import type { ProjectState } from "../../../src/project/store";
import { TOPIC_TITLE_MAX_LENGTH } from "../../../src/timeline/topic-constants";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { Textarea } from "../ui/Textarea";

export function AnalyzeStep({
  project,
  draftContent,
  draftTopicTitle,
  operationLoading,
  analysisStale,
  onAnalyze,
  onTopicTitleChange,
  onTopicTitleBlur
}: {
  project?: ProjectState;
  draftContent?: ContentData;
  draftTopicTitle: string;
  operationLoading: boolean;
  analysisStale: boolean;
  onAnalyze: () => void;
  onTopicTitleChange: (value: string) => void;
  onTopicTitleBlur: () => void;
}): React.ReactElement {
  const analysis = project?.analysis;

  return (
    <div className="space-y-3">
      <Panel className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">
            Quick AI
          </h3>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Chạy một lần: tone, voice, meme và SFX như luồng cũ. Có thể bỏ qua
            và dùng các nút AI nhỏ ở Capture, Voice, Timeline.
          </p>
        </div>
        {operationLoading ? (
          <span className="text-[12px] text-ink-2">
            Đang analyze...
          </span>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={operationLoading}
            onClick={onAnalyze}
          >
            {analysis ? "Chạy Quick AI lại" : "Quick AI"}
          </Button>
        )}
      </Panel>

      {operationLoading ? (
        <Panel className="space-y-2">
          <div className="h-2 w-2/3 animate-pulse rounded-sm bg-elevated" />
          <div className="h-2 w-1/2 animate-pulse rounded-sm bg-elevated" />
          <div className="h-16 animate-pulse rounded-md bg-app" />
        </Panel>
      ) : null}

      {analysisStale ? (
        <Panel className="border-warning/30 bg-warning/10 text-[13px] text-warning">
          Danh sách comment đã đổi sau lần Analyze gần nhất.
          Hãy Analyze lại để meme/SFX khớp với các comment đang được dùng.
        </Panel>
      ) : null}

      {analysis && !operationLoading ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Tone", analysis.tone],
              ["Topic type", analysis.topicType],
              ["Intensity", `${analysis.intensity}/10`],
              ["Music", analysis.musicType]
            ].map(([label, value]) => (
              <Panel key={label} className="p-2.5">
                <p className="text-[11px] text-ink-3">{label}</p>
                <p className="mt-1 text-[13px] font-medium capitalize text-ink">
                  {value}
                </p>
              </Panel>
            ))}
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
              disabled={operationLoading}
              placeholder="Nhập topic title..."
              onChange={(event) =>
                onTopicTitleChange(event.target.value)
              }
              onBlur={onTopicTitleBlur}
              className="mt-2 min-h-[72px] leading-5"
            />
          </Panel>

          <Panel>
            <p className="text-[11px] uppercase tracking-wide text-ink-3">
              Topic voice
            </p>
            <p className="mt-1 text-[13px] text-ink">
              {analysis.topicVoiceId ?? "Chưa được chọn"}
            </p>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink">
                Comment analysis
              </h3>
              <span className="text-[11px] text-ink-3">
                {analysis.reactions.length} comments
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {analysis.reactions.map((reaction) => (
                <div
                  key={reaction.commentIndex}
                  className="grid gap-2 rounded-md border border-line bg-app p-2.5 sm:grid-cols-3"
                >
                  <div className="sm:col-span-3">
                    <p className="text-[11px] text-ink-3">Text</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-ink">
                      {draftContent?.comments[reaction.commentIndex]?.text ??
                        "Không tìm thấy text"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-3">Comment</p>
                    <p className="mt-0.5 text-[13px] text-ink">
                      #{reaction.commentIndex}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-3">Voice</p>
                    <p className="mt-0.5 text-[13px] text-ink">
                      {reaction.voiceId ?? "Chưa chọn"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-3">Emotion</p>
                    <p className="mt-0.5 text-[13px] capitalize text-ink-2">
                      {reaction.emotion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
