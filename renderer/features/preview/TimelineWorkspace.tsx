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
  AssetPickerDialog
} from "./AssetPickerDialog";
import {
  assetsForTarget,
  pickerTitle,
  selectedAssetId
} from "./asset-picker";
import { TimelinePreview } from "./TimelinePreview";
import { TimelineTracks } from "./TimelineTracks";
import { useTimelinePreview } from "./use-timeline-preview";
import { useErrorToast } from "../app/ErrorToast";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Textarea } from "../ui/Textarea";

interface TimelineWorkspaceProps {
  projectId: string;
  timeline?: VideoTimeline;
  previewAssets: Record<string, string>;
  analysis?: ProjectState["analysis"];
  reactions?: ProjectState["reactions"];
  visible?: boolean;
  loading: boolean;
  onProjectUpdated: (project: ProjectState) => Promise<void> | void;
  onCreateTimeline: () => Promise<void>;
  onRematch: () => Promise<void>;
}

export function TimelineWorkspace({
  projectId,
  timeline,
  previewAssets,
  analysis,
  reactions,
  visible = true,
  loading,
  onProjectUpdated,
  onCreateTimeline,
  onRematch
}: TimelineWorkspaceProps): React.ReactElement {
  const preview = useTimelinePreview({
    timeline,
    assets: previewAssets,
    active: visible
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
    if (!visible) {
      return;
    }
    void window.xamxixiu.listAssets().then(setLibrary).catch(() => {
      setLibrary([]);
    });
  }, [visible]);

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-sidebar px-2 py-1.5">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">Timeline</h3>
          <p className="text-[11px] text-ink-3">
            Click clip để đổi asset. Timeline tự tính lại thời lượng.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void onRematch()}
          >
            Rematch
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void onCreateTimeline()}
          >
            {loading
              ? "Đang tạo..."
              : timeline
                ? "Tạo lại timeline"
                : "Create timeline"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !timeline}
            onClick={() => void exportVideo()}
          >
            {exporting ? "Đang xuất..." : "Xuất video"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !timeline}
            onClick={() => void generateCapCut()}
          >
            {generatingCapCut ? "Đang generate..." : "Generate CapCut"}
          </Button>
        </div>
      </div>

      {exporting && exportProgress ? (
        <div className="shrink-0 border-b border-line px-2 py-1.5">
          <div className="h-1 overflow-hidden rounded-sm bg-elevated">
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{
                width: `${Math.max(2, exportProgress.percent)}%`
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-ink-3">
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

      {timeline ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <div className="flex min-h-0 shrink-0 gap-3">
            <TimelinePreview
              timeline={timeline}
              assets={previewAssets}
              preview={preview}
            />
            <div className="min-w-0 flex-1 space-y-2 overflow-y-auto">
              {exportOutput ? (
                <div className="rounded-lg border border-line bg-panel p-2.5">
                  <p className="text-[11px] text-ink-3">Video đã xuất</p>
                  <p className="mt-1 break-all text-[12px] text-ink">
                    {exportOutput}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() =>
                      void window.xamxixiu.showItemInFolder(exportOutput)
                    }
                  >
                    Mở thư mục
                  </Button>
                </div>
              ) : null}
              {capCutOutput ? (
                <div className="rounded-lg border border-success/30 bg-success/5 p-2.5">
                  <p className="text-[11px] text-ink-3">CapCut project</p>
                  <p className="mt-1 break-all text-[12px] text-success">
                    {capCutOutput}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-3">
                    Đóng CapCut nếu đang mở, sau đó mở project folder này.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() =>
                      void window.xamxixiu.openPath(capCutOutput)
                    }
                  >
                    Mở thư mục CapCut
                  </Button>
                </div>
              ) : (
                <p className="text-[12px] leading-5 text-ink-3">
                  Render MP4 từ timeline hiện tại, hoặc generate project CapCut
                  để chỉnh sửa tiếp.
                </p>
              )}
            </div>
          </div>
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
        </div>
      ) : (
        <p className="m-2 rounded-lg border border-dashed border-line bg-panel p-6 text-[13px] text-ink-3">
          Chưa có timeline. Bấm Create timeline sau khi voice đã sẵn sàng.
        </p>
      )}

      <Dialog
        open={editingTitle !== undefined}
        onClose={() => setEditingTitle(undefined)}
        className="max-w-lg p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-ink">Topic title</h3>
          <span className="text-[11px] text-ink-3">
            {editingTitle?.length ?? 0}/{TOPIC_TITLE_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          value={editingTitle ?? ""}
          maxLength={TOPIC_TITLE_MAX_LENGTH}
          autoFocus
          onChange={(event) => setEditingTitle(event.target.value)}
          className="mt-3 min-h-[96px] leading-5"
          placeholder="Nhập topic title..."
        />
        <p className="mt-2 text-[12px] text-ink-3">
          Nếu đã generate title voice, hãy generate lại ở bước Voice.
        </p>
        <div className="mt-4 flex justify-end gap-1.5">
          {timeline?.topicIntro ? (
            <Button
              variant="danger"
              size="sm"
              className="mr-auto"
              disabled={busy}
              onClick={() => void updateTopicIntro({ enabled: false })}
            >
              Gỡ khỏi timeline
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setEditingTitle(undefined)}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !editingTitle?.trim()}
            onClick={() =>
              void updateTopicIntro({
                topicTitle: editingTitle ?? "",
                enabled: true
              })
            }
          >
            Lưu
          </Button>
        </div>
      </Dialog>

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
