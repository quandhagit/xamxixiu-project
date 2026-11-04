"use client";

import { useEffect, useMemo, useState } from "react";
import type { Asset } from "../../../src/assets/library";
import type {
  ExportProgress,
  TimelineAssetTarget
} from "../../../src/electron/ipc-types";
import { canRemoveTimelineAsset } from "../../../src/timeline/replace-asset";
import type { ProjectState } from "../../../src/project/store";
import type { VideoTimeline } from "../../../src/types";
import { TOPIC_TITLE_MAX_LENGTH } from "../../../src/timeline/topic-constants";
import {
  AssetPickerDialog,
  assetsForTarget,
  pickerTitle
} from "./AssetPickerDialog";
import { TimelinePreview } from "./TimelinePreview";
import { TimelineTracks } from "./TimelineTracks";
import { useTimelinePreview } from "./use-timeline-preview";
import { useErrorToast } from "../app/ErrorToast";

interface TimelineWorkspaceProps {
  projectId: string;
  timeline?: VideoTimeline;
  previewAssets: Record<string, string>;
  analysis?: ProjectState["analysis"];
  reactions?: ProjectState["reactions"];
  loading: boolean;
  onProjectUpdated: (project: ProjectState) => Promise<void> | void;
  onCreateTimeline: () => Promise<void>;
  onRematch: () => Promise<void>;
}

function selectedAssetId(
  target: TimelineAssetTarget,
  analysis: ProjectState["analysis"],
  reactions: ProjectState["reactions"]
): string | undefined {
  if (target.kind === "topic-title") {
    return undefined;
  }
  if (target.kind === "background") {
    return analysis?.backgroundAssetId ?? undefined;
  }
  if (target.kind === "music") {
    return analysis?.musicAssetId ?? undefined;
  }
  if (target.kind === "topic-meme") {
    return analysis?.topicMemeId ?? undefined;
  }
  const reaction = reactions?.find(
    (item) => item.commentIndex === target.commentIndex
  );
  if (target.kind === "sfx") {
    return reaction?.sfx?.id;
  }
  return reaction?.meme?.id;
}

export function TimelineWorkspace({
  projectId,
  timeline,
  previewAssets,
  analysis,
  reactions,
  loading,
  onProjectUpdated,
  onCreateTimeline,
  onRematch
}: TimelineWorkspaceProps): React.ReactElement {
  const preview = useTimelinePreview({
    timeline,
    assets: previewAssets
  });
  const [library, setLibrary] = useState<Asset[]>([]);
  const [target, setTarget] = useState<TimelineAssetTarget>();
  const [editingTitle, setEditingTitle] = useState<string>();
  const [replacing, setReplacing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatingCapCut, setGeneratingCapCut] =
    useState(false);
  const [exportOutput, setExportOutput] =
    useState<string>();
  const [exportProgress, setExportProgress] =
    useState<ExportProgress>();
  const [capCutOutput, setCapCutOutput] =
    useState<string>();
  const setError = useErrorToast();
  const busy =
    loading || replacing || exporting || generatingCapCut;

  useEffect(() => {
    void window.xamxixiu.listAssets().then(setLibrary).catch(() => {
      setLibrary([]);
    });
  }, []);

  const pickerAssets = useMemo(
    () => (target ? assetsForTarget(library, target) : []),
    [library, target]
  );

  async function updateTopicIntro(update: {
    topicTitle?: string;
    enabled?: boolean;
  }): Promise<void> {
    setEditingTitle(undefined);
    setReplacing(true);
    setError(undefined);
    try {
      if (typeof window.xamxixiu.updateTopicIntro !== "function") {
        throw new Error(
          "Cần restart app để sửa topic title trên timeline."
        );
      }
      const project = await window.xamxixiu.updateTopicIntro({
        projectId,
        ...update
      });
      await onProjectUpdated(project);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể cập nhật topic title."
      );
    } finally {
      setReplacing(false);
    }
  }

  async function replaceAsset(
    selected: TimelineAssetTarget,
    assetId: string | null
  ): Promise<void> {
    setTarget(undefined);
    setReplacing(true);
    setError(undefined);
    try {
      const project = await window.xamxixiu.replaceTimelineAsset({
        projectId,
        target: selected,
        assetId
      });
      await onProjectUpdated(project);
    } catch (reason: unknown) {
      if (assetId) {
        setTarget(selected);
      }
      setError(
        reason instanceof Error
          ? reason.message
          : assetId
            ? "Không thể đổi asset trên timeline."
            : "Không thể gỡ asset khỏi timeline."
      );
    } finally {
      setReplacing(false);
    }
  }

  async function exportVideo(): Promise<void> {
    setError(undefined);
    setExporting(true);
    const stopProgress =
      window.xamxixiu.onExportProgress(
        setExportProgress
      );
    try {
      const output = await window.xamxixiu.exportVideo(
        projectId
      );
      if (output) {
        setExportOutput(output);
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Xuất video thất bại."
      );
    } finally {
      stopProgress();
      setExporting(false);
      setExportProgress(undefined);
    }
  }

  async function generateCapCut(): Promise<void> {
    setError(undefined);
    setGeneratingCapCut(true);
    try {
      setCapCutOutput(
        await window.xamxixiu.createCapCutProject(
          projectId
        )
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Tạo project CapCut thất bại."
      );
    } finally {
      setGeneratingCapCut(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-6">
        <div>
          <h3 className="font-medium">Timeline</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Chọn hoặc gỡ meme, video, SFX và topic title ngay trên track.
            Timeline tự tính lại thời lượng sau mỗi lần đổi.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRematch()}
            className="rounded-lg border border-white/20 px-4 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-50"
          >
            Rematch
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCreateTimeline()}
            className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-cyan-300 disabled:opacity-50"
          >
            {loading
              ? "Đang tạo..."
              : timeline
                ? "Tạo lại timeline"
                : "Create timeline"}
          </button>
        </div>
      </div>

      {timeline ? (
        <>
          <TimelinePreview
            timeline={timeline}
            assets={previewAssets}
            preview={preview}
          />
          <TimelineTracks
            timeline={timeline}
            previewTime={preview.previewTime}
            disabled={busy}
            onSeek={(time) => {
              preview.setPreviewPlaying(false);
              preview.setPreviewTime(time);
            }}
            onEditClip={(clipTarget) => {
              if (clipTarget.kind !== "topic-title") {
                setTarget(clipTarget);
                return;
              }
              if (timeline?.topicIntro) {
                setEditingTitle(
                  analysis?.topicTitle ?? timeline.topicIntro.title
                );
                return;
              }
              if (analysis?.topicTitle?.trim()) {
                void updateTopicIntro({ enabled: true });
                return;
              }
              setEditingTitle(analysis?.topicTitle ?? "");
            }}
            onRemoveClip={(clipTarget) => {
              if (clipTarget.kind === "topic-title") {
                void updateTopicIntro({ enabled: false });
                return;
              }
              void replaceAsset(clipTarget, null);
            }}
          />
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-sm text-zinc-500">
          Chưa có timeline. Bấm Create timeline sau khi voice đã sẵn sàng.
        </p>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
        <h3 className="font-medium">Xuất video</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-400">
          Render file MP4 từ timeline hiện tại, hoặc generate
          project CapCut để chỉnh sửa tiếp.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !timeline}
            onClick={() => void exportVideo()}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {exporting ? "Đang xuất video..." : "Xuất video"}
          </button>
          <button
            type="button"
            disabled={busy || !timeline}
            onClick={() => void generateCapCut()}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
          >
            {generatingCapCut
              ? "Đang generate..."
              : "Generate CapCut"}
          </button>
        </div>
        {exporting && exportProgress ? (
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-200"
                style={{
                  width: `${Math.max(
                    2,
                    exportProgress.percent
                  )}%`
                }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {exportProgress.phase === "preparing"
                ? "Đang chuẩn bị media..."
                : exportProgress.phase === "done"
                  ? "Hoàn tất xuất video."
                  : `Đang render ${exportProgress.percent}%${
                      exportProgress.time !== undefined &&
                      exportProgress.duration
                        ? ` · ${exportProgress.time.toFixed(1)}s / ${exportProgress.duration.toFixed(1)}s`
                        : ""
                    }`}
            </p>
          </div>
        ) : null}
        {exportOutput ? (
          <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4">
            <p className="text-xs text-zinc-500">
              Video đã xuất
            </p>
            <p className="mt-2 break-all text-sm text-zinc-200">
              {exportOutput}
            </p>
            <button
              type="button"
              onClick={() =>
                void window.xamxixiu.showItemInFolder(
                  exportOutput
                )
              }
              className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
            >
              Mở thư mục
            </button>
          </div>
        ) : null}
        {capCutOutput ? (
          <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
            <p className="text-xs text-zinc-500">
              CapCut project
            </p>
            <p className="mt-2 break-all text-sm text-emerald-200">
              {capCutOutput}
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              Đóng CapCut nếu đang mở, sau đó mở project
              folder này.
            </p>
            <button
              type="button"
              onClick={() =>
                void window.xamxixiu.openPath(capCutOutput)
              }
              className="mt-3 rounded-lg border border-emerald-300/30 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-400/10"
            >
              Mở thư mục CapCut
            </button>
          </div>
        ) : null}
      </div>

      {editingTitle !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-zinc-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Topic title</h3>
              <span className="text-xs text-zinc-500">
                {editingTitle.length}/{TOPIC_TITLE_MAX_LENGTH}
              </span>
            </div>
            <textarea
              value={editingTitle}
              maxLength={TOPIC_TITLE_MAX_LENGTH}
              autoFocus
              onChange={(event) => setEditingTitle(event.target.value)}
              className="mt-4 min-h-[96px] w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200 outline-none focus:ring-2 focus:ring-fuchsia-400"
              placeholder="Nhập topic title..."
            />
            <p className="mt-3 text-xs text-zinc-500">
              Nếu đã generate title voice, hãy generate lại ở bước Voice.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              {timeline?.topicIntro && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void updateTopicIntro({ enabled: false })}
                  className="mr-auto rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                >
                  Gỡ khỏi timeline
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingTitle(undefined)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={busy || !editingTitle.trim()}
                onClick={() =>
                  void updateTopicIntro({
                    topicTitle: editingTitle,
                    enabled: true
                  })
                }
                className="rounded-lg bg-fuchsia-400 px-3 py-1.5 text-xs font-semibold text-fuchsia-950 hover:bg-fuchsia-300 disabled:opacity-50"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      <AssetPickerDialog
        open={Boolean(target)}
        title={target ? pickerTitle(target) : ""}
        assets={pickerAssets}
        selectedId={
          target
            ? selectedAssetId(target, analysis, reactions)
            : undefined
        }
        onClose={() => setTarget(undefined)}
        onSelect={(asset) => {
          if (!target) {
            return;
          }
          void replaceAsset(target, asset.id);
        }}
        onRemove={
          target &&
          canRemoveTimelineAsset(target) &&
          selectedAssetId(target, analysis, reactions)
            ? () => void replaceAsset(target, null)
            : undefined
        }
      />
    </div>
  );
}
