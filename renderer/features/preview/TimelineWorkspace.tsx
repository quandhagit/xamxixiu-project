"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import type { Asset } from "../../../src/assets/library";
import type {
  ExportProgress,
  TimelineAssetTarget
} from "../../../src/electron/ipc-types";
import { canRemoveTimelineAsset } from "../../../src/timeline/replace-asset";
import { isBulkClearableOverlayClip } from "../../../src/timeline/comment-overlay-clips";
import type { ProjectState } from "../../../src/project/store";
import type { VideoTimeline } from "../../../src/types";
import type { TimelineProject } from "../../../src/timeline/project";
import {
  DEFAULT_AUTO_FORMAT
} from "../../../src/timeline/project";
import {
  applyComboToProject,
  clearComboOnProject,
  moveClip,
  removeClip,
  setClipAnimationDuration,
  /* setClipComboLocked, */
  setClipFades,
  /* setClipLocked, */
  setClipPosition,
  setClipScale,
  setClipSfxOffset,
  /* splitClip, */
  trimClip
} from "./timeline-edit";
import {
  clipFlyUpDuration,
  clipHasTimedMotion
} from "../../../src/timeline/clip-motion";
import {
  BUILTIN_COMBOS,
  comboFromClip,
  CUSTOM_COMBO_ID,
  findCombo,
  isCustomCombo,
  type MemeCombo
} from "../../../src/timeline/meme-combo";
import { cloneTimelineProject } from "../../../src/timeline/project";
import {
  emptyTimelineHistory,
  pushHistory,
  redoHistory,
  timelineHotkey,
  timelineProjectsEqual,
  undoHistory,
  type TimelineHistory
} from "../../../src/timeline/history";
import {
  continueEditorBurst,
  EDITOR_BURST_MS,
  flushEditorBurst,
  type EditorBurst
} from "../../../src/timeline/persist";
import { HyperframesPlayer } from "./HyperframesPlayer";
import { computeWaveformPeaks } from "./waveform";
import { TOPIC_TITLE_MAX_LENGTH } from "../../../src/timeline/topic-constants";
import {
  AssetPickerDialog
} from "./AssetPickerDialog";
import {
  assetsForTarget,
  pickerTitle,
  selectedAssetId
} from "./asset-picker";
import {
  clipCanRemove,
  clipChooseLabel,
  clipHasAssetPickerTarget,
  findTrackClip,
  type TimelineTrackClip
} from "./timeline-tracks";
import { TimelineTracks } from "./TimelineTracks";
import { useTimelinePreview } from "./use-timeline-preview";
import { useErrorToast } from "../app/ErrorToast";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Textarea } from "../ui/Textarea";

interface TimelineWorkspaceProps {
  projectId: string;
  timeline?: VideoTimeline;
  timelineProject?: TimelineProject;
  previewAssets: Record<string, string>;
  analysis?: ProjectState["analysis"];
  reactions?: ProjectState["reactions"];
  visible?: boolean;
  loading: boolean;
  onProjectUpdated: (project: ProjectState) => Promise<void> | void;
  onTimelineProjectChange?: (project: TimelineProject) => void;
  onCreateTimeline: () => Promise<void>;
}

export function TimelineWorkspace({
  projectId,
  timeline,
  timelineProject,
  previewAssets,
  analysis,
  reactions,
  visible = true,
  loading,
  onProjectUpdated,
  onTimelineProjectChange,
  onCreateTimeline
}: TimelineWorkspaceProps): React.ReactElement {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [target, setTarget] = useState<TimelineAssetTarget>();
  const [editingTitle, setEditingTitle] = useState<string>();
  const [replacing, setReplacing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<TimelineHistory>(emptyTimelineHistory);
  const [selectedClipId, setSelectedClipId] = useState<string>();
  const [zoom, setZoom] = useState(64);
  const [voicePeaks, setVoicePeaks] = useState<Record<string, number[]>>({});
  const [formatOpen, setFormatOpen] = useState(false);
  const [sceneGap, setSceneGap] = useState(
    timelineProject?.settings.sceneGap ?? DEFAULT_AUTO_FORMAT.sceneGap
  );
  const [userCombos, setUserCombos] = useState<MemeCombo[]>([]);
  const [exportOutput, setExportOutput] =
    useState<string>();
  const [exportProgress, setExportProgress] =
    useState<ExportProgress>();
  const setError = useErrorToast();
  const busy =
    loading || replacing || exporting;
  const [draft, setDraft] = useState<TimelineProject | undefined>(
    timelineProject
  );
  const draftRef = useRef(draft);
  const historyRef = useRef(history);
  const draggingRef = useRef(false);
  const historySnapshotRef = useRef<TimelineProject | undefined>(undefined);
  const burstRef = useRef<EditorBurst<TimelineProject> | undefined>(undefined);
  const burstTimerRef = useRef<number | undefined>(undefined);
  const saveQueueRef = useRef(Promise.resolve());
  const editorProject = draft ?? timelineProject;
  const preview = useTimelinePreview({
    duration: editorProject?.totalDuration ?? timeline?.totalDuration,
    active: visible
  });

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    return () => {
      if (burstTimerRef.current) {
        window.clearTimeout(burstTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setHistory(emptyTimelineHistory());
    burstRef.current = undefined;
    if (burstTimerRef.current) {
      window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = undefined;
    }
  }, [projectId]);

  useEffect(() => {
    if (draggingRef.current) {
      return;
    }
    setDraft(timelineProject);
  }, [timelineProject]);

  const voiceSignature = useMemo(() => {
    if (!editorProject) {
      return "";
    }
    return editorProject.clips
      .filter((clip) => clip.trackId === "voice")
      .map((clip) => clip.file)
      .join("\0");
  }, [editorProject]);

  useEffect(() => {
    if (!visible || !voiceSignature) {
      return;
    }
    const voiceFiles = voiceSignature.split("\0").filter(Boolean);
    void Promise.all(
      voiceFiles.map(async (file) => {
        const url = previewAssets[file];
        if (!url) {
          return [file, []] as const;
        }
        return [file, await computeWaveformPeaks(url)] as const;
      })
    ).then((entries) => {
      setVoicePeaks(Object.fromEntries(entries));
    });
  }, [visible, voiceSignature, previewAssets]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    void window.xamxixiu.listAssets().then(setLibrary).catch(() => {
      setLibrary([]);
    });
    if (typeof window.xamxixiu.listMemeCombos === "function") {
      void window.xamxixiu.listMemeCombos().then(setUserCombos).catch(() => {
        setUserCombos([]);
      });
    }
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
      const previous = draftRef.current ?? timelineProject;
      const project = await window.xamxixiu.updateTopicIntro({
        projectId,
        ...update
      });
      if (previous) {
        setHistory((current) => pushHistory(current, previous));
      }
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
      const previous = draftRef.current ?? timelineProject;
      const project = await window.xamxixiu.replaceTimelineAsset({
        projectId,
        target: selected,
        assetId
      });
      if (previous) {
        setHistory((current) => pushHistory(current, previous));
      }
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

  function applyDraft(next: TimelineProject): void {
    if (draftRef.current && timelineProjectsEqual(draftRef.current, next)) {
      return;
    }
    draftRef.current = next;
    setDraft(next);
  }

  function writeTimeline(next: TimelineProject): void {
    onTimelineProjectChange?.(next);
    if (typeof window.xamxixiu.saveTimelineProject !== "function") {
      setError("Cần restart app để lưu timeline editor.");
      return;
    }
    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        const latest = draftRef.current ?? next;
        await window.xamxixiu.saveTimelineProject({
          projectId,
          timelineProject: latest
        });
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Không thể lưu timeline."
        );
      });
  }

  function commitBurstIfAny(): void {
    if (burstTimerRef.current) {
      window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = undefined;
    }
    const burst = flushEditorBurst(
      burstRef.current,
      timelineProjectsEqual
    );
    burstRef.current = undefined;
    if (!burst) {
      return;
    }
    const draft = draftRef.current;
    if (draft && !timelineProjectsEqual(draft, burst.latest)) {
      return;
    }
    setHistory((current) => pushHistory(current, burst.origin));
    writeTimeline(burst.latest);
  }

  function persistEditor(
    next: TimelineProject,
    recordHistory = true
  ): void {
    commitBurstIfAny();
    const previous = draftRef.current ?? timelineProject;
    if (
      recordHistory &&
      previous &&
      timelineProjectsEqual(previous, next)
    ) {
      return;
    }
    if (recordHistory && previous) {
      setHistory((current) => pushHistory(current, previous));
    }
    applyDraft(next);
    writeTimeline(next);
  }

  function persistDraftBurst(next: TimelineProject): void {
    const origin =
      burstRef.current?.origin ?? draftRef.current ?? timelineProject;
    if (!origin) {
      return;
    }
    burstRef.current = continueEditorBurst(
      burstRef.current,
      origin,
      next
    );
    applyDraft(next);
    onTimelineProjectChange?.(next);
    if (burstTimerRef.current) {
      window.clearTimeout(burstTimerRef.current);
    }
    burstTimerRef.current = window.setTimeout(() => {
      commitBurstIfAny();
    }, EDITOR_BURST_MS);
  }

  function removeTrackClip(clip: TimelineTrackClip): void {
    if (selectedClipId === clip.id) {
      setSelectedClipId(undefined);
    }
    if (clip.trackId === "beep") {
      const current = draftRef.current ?? timelineProject;
      if (!current) {
        return;
      }
      persistEditor(removeClip(current, clip.id));
      return;
    }
    if (!clip.target) {
      return;
    }
    if (clip.target.kind === "topic-title") {
      void updateTopicIntro({ enabled: false });
      return;
    }
    void replaceAsset(clip.target, null);
  }

  async function undoEdit(): Promise<void> {
    const current = draftRef.current ?? timelineProject;
    if (!current) {
      return;
    }
    const result = undoHistory(historyRef.current, current);
    if (!result) {
      return;
    }
    setHistory(result.history);
    persistEditor(result.present, false);
  }

  async function redoEdit(): Promise<void> {
    const current = draftRef.current ?? timelineProject;
    if (!current) {
      return;
    }
    const result = redoHistory(historyRef.current, current);
    if (!result) {
      return;
    }
    setHistory(result.history);
    persistEditor(result.present, false);
  }

  async function runAutoFormat(): Promise<void> {
    setReplacing(true);
    setError(undefined);
    try {
      const previous = draftRef.current ?? timelineProject;
      const project = await window.xamxixiu.autoFormatTimeline({
        projectId,
        settings: {
          ...(editorProject?.settings ?? DEFAULT_AUTO_FORMAT),
          sceneGap: Math.max(0, sceneGap)
        }
      });
      if (previous) {
        setHistory((current) => pushHistory(current, previous));
      }
      await onProjectUpdated(project);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Auto format thất bại."
      );
    } finally {
      setReplacing(false);
    }
  }

  async function addBeepAtPlayhead(): Promise<void> {
    setReplacing(true);
    setError(undefined);
    try {
      const previous = draftRef.current ?? timelineProject;
      const project = await window.xamxixiu.addBeep({
        projectId,
        start: preview.previewTime
      });
      if (previous) {
        setHistory((current) => pushHistory(current, previous));
      }
      await onProjectUpdated(project);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Không thêm được beep."
      );
    } finally {
      setReplacing(false);
    }
  }

  async function suggestTimelineMemes(): Promise<void> {
    setReplacing(true);
    setError(undefined);
    try {
      const previous = draftRef.current ?? timelineProject;
      const project = await window.xamxixiu.suggestMemes(projectId);
      if (previous) {
        setHistory((current) => pushHistory(current, previous));
      }
      await onProjectUpdated(project);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "AI chọn meme thất bại."
      );
    } finally {
      setReplacing(false);
    }
  }

  async function clearTimelineMemes(): Promise<void> {
    setReplacing(true);
    setError(undefined);
    try {
      if (typeof window.xamxixiu.clearCommentMemes !== "function") {
        throw new Error("Cần restart app để gỡ hết meme/SFX.");
      }
      const previous = draftRef.current ?? timelineProject;
      const project = await window.xamxixiu.clearCommentMemes(projectId);
      if (previous) {
        setHistory((current) => pushHistory(current, previous));
      }
      await onProjectUpdated(project);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Không gỡ được meme/SFX."
      );
    } finally {
      setReplacing(false);
    }
  }

  useEffect(() => {
    if (!visible) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      const action = timelineHotkey(event);
      if (!action) {
        return;
      }
      event.preventDefault();
      if (busy) {
        return;
      }
      if (action === "undo") {
        void undoEdit();
      } else {
        void redoEdit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, busy, projectId, history, timelineProject]);

  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border border-line bg-sidebar px-2 py-1">
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        aria-label="Undo (Ctrl+Z)"
        disabled={busy || history.past.length === 0}
        onClick={() => void undoEdit()}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Redo (Ctrl+Y)"
        aria-label="Redo (Ctrl+Y)"
        disabled={busy || history.future.length === 0}
        onClick={() => void redoEdit()}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>
      <span className="text-[11px] text-ink-3">Zoom</span>
      <input
        type="range"
        min={24}
        max={140}
        value={zoom}
        onChange={(event) => setZoom(Number(event.target.value))}
      />
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void suggestTimelineMemes()}
        >
          AI chọn meme
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={
            busy ||
            !editorProject?.clips.some((clip) =>
              isBulkClearableOverlayClip(clip)
            )
          }
          onClick={() => void clearTimelineMemes()}
        >
          Gỡ hết meme/SFX
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !editorProject}
          onClick={() => setFormatOpen((open) => !open)}
        >
          Auto format
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !editorProject}
          onClick={() => void addBeepAtPlayhead()}
        >
          Thêm beep
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
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
            <HyperframesPlayer
              project={editorProject}
              assets={previewAssets}
              currentTime={preview.previewTime}
              playing={preview.previewPlaying}
              selectedClipId={selectedClipId}
              onToggle={preview.togglePreview}
              onSelectClip={setSelectedClipId}
              onPositionCommit={(clipId, x, y) => {
                const current = draftRef.current ?? editorProject;
                if (!current) {
                  return;
                }
                persistEditor(setClipPosition(current, clipId, x, y));
              }}
            />
            <div className="min-w-0 flex-1 space-y-2 overflow-y-auto">
              {formatOpen ? (
                <div className="rounded-lg border border-line bg-panel p-2.5">
                  <p className="text-[12px] font-medium text-ink">Auto format</p>
                  <label className="mt-2 block text-[11px] text-ink-2">
                    Khoảng cách scene (s)
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={sceneGap}
                      disabled={busy}
                      className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1"
                      onChange={(event) =>
                        setSceneGap(Number(event.target.value))
                      }
                    />
                  </label>
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={busy || !editorProject}
                    onClick={() => void runAutoFormat()}
                  >
                    Áp dụng
                  </Button>
                </div>
              ) : null}
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
              ) : (
                <p className="text-[12px] leading-5 text-ink-3">
                  Kéo clip để dời, kéo mép để cắt voice, thêm beep tại playhead.
                  Xuất video bằng Hyperframes (ffmpeg là fallback).
                </p>
              )}
              {selectedClipId && editorProject ? (
                <ClipFadePanel
                  project={editorProject}
                  clipId={selectedClipId}
                  disabled={busy}
                  userCombos={userCombos}
                  onCombosChange={setUserCombos}
                  onChange={(next) => persistEditor(next)}
                  onDraftChange={persistDraftBurst}
                  onFlushDraft={commitBurstIfAny}
                  onChoose={(clipTarget) => {
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
                  onRemove={removeTrackClip}
                  /* onSplit={() => {
                    if (!editorProject) {
                      return;
                    }
                    persistEditor(
                      splitClip(editorProject, selectedClipId, preview.previewTime)
                    );
                  }} */
                />
              ) : null}
            </div>
          </div>
          {toolbar}
          <TimelineTracks
            timeline={timeline}
            timelineProject={editorProject}
            previewTime={preview.previewTime}
            pixelsPerSecond={zoom}
            selectedClipId={selectedClipId}
            voicePeaks={voicePeaks}
            disabled={busy}
            onSeek={(time) => {
              preview.setPreviewPlaying(false);
              preview.setPreviewTime(time);
            }}
            onRemoveClip={removeTrackClip}
            onSelectClip={setSelectedClipId}
            onDragStart={() => {
              draggingRef.current = true;
              preview.setPreviewPlaying(false);
              const current = draftRef.current ?? timelineProject;
              if (current) {
                historySnapshotRef.current = cloneTimelineProject(current);
              }
            }}
            onMoveClip={(clipId, start) => {
              const current = draftRef.current ?? timelineProject;
              if (!current) {
                return;
              }
              applyDraft(moveClip(current, clipId, start));
            }}
            onTrimClip={(clipId, edge, time) => {
              const current = draftRef.current ?? timelineProject;
              if (!current) {
                return;
              }
              applyDraft(trimClip(current, clipId, edge, time));
            }}
            onDragEnd={() => {
              draggingRef.current = false;
              const snapshot = historySnapshotRef.current;
              historySnapshotRef.current = undefined;
              const next = draftRef.current;
              if (!next) {
                return;
              }
              if (snapshot && !timelineProjectsEqual(snapshot, next)) {
                setHistory((current) => pushHistory(current, snapshot));
              }
              persistEditor(next, false);
            }}
            /* onToggleLock={(clipId) => {
              if (!editorProject) {
                return;
              }
              const clip = editorProject.clips.find((item) => item.id === clipId);
              persistEditor(
                setClipLocked(editorProject, clipId, !clip?.locked)
              );
            }} */
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          {toolbar}
          <p className="rounded-lg border border-dashed border-line bg-panel p-6 text-[13px] text-ink-3">
            Chưa có timeline. Bấm Create timeline sau khi voice đã sẵn sàng.
          </p>
        </div>
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

function ClipFadePanel({
  project,
  clipId,
  disabled,
  userCombos,
  onCombosChange,
  onChange,
  onDraftChange,
  onFlushDraft,
  onChoose,
  onRemove
  /* , onSplit */
}: {
  project: TimelineProject;
  clipId: string;
  disabled: boolean;
  userCombos: MemeCombo[];
  onCombosChange: (combos: MemeCombo[]) => void;
  onChange: (project: TimelineProject) => void;
  onDraftChange?: (project: TimelineProject) => void;
  onFlushDraft?: () => void;
  onChoose: (target: TimelineAssetTarget) => void;
  onRemove: (clip: TimelineTrackClip) => void;
  /* onSplit: () => void; */
}): React.ReactElement | null {
  const trackClip = findTrackClip(project, clipId);
  const clip = project.clips.find((item) => item.id === clipId);
  const [comboName, setComboName] = useState("");
  const draftChange = onDraftChange ?? onChange;
  if (!trackClip && !clip) {
    return null;
  }
  const locked = Boolean(clip?.locked ?? trackClip?.locked);
  const pickerTarget = trackClip?.target;
  const canChoose = Boolean(
    pickerTarget && trackClip && clipHasAssetPickerTarget(trackClip)
  );
  const removable = trackClip ? clipCanRemove(trackClip) : false;

  if (!clip) {
    return (
      <div className="rounded-lg border border-line bg-panel p-2.5">
        <p className="text-[12px] font-medium text-ink">
          {trackClip?.label ?? "Clip"}
        </p>
        {trackClip?.target && clipHasAssetPickerTarget(trackClip) ? (
          <Button
            size="sm"
            className="mt-2"
            disabled={disabled || locked}
            onClick={() => onChoose(trackClip.target!)}
          >
            {clipChooseLabel(trackClip.target)}
          </Button>
        ) : null}
      </div>
    );
  }
  const imageMeme =
    clip.trackId === "meme" &&
    clip.kind !== "video" &&
    clip.commentIndex !== undefined &&
    clip.commentIndex !== null;
  const videoMeme = clip.trackId === "video";
  const custom = isCustomCombo(clip, userCombos);
  const selectedComboId = custom
    ? CUSTOM_COMBO_ID
    : (clip.comboId ?? "none");
  const namedCombo = findCombo(clip.comboId, userCombos);

  async function saveCurrentCombo(): Promise<void> {
    if (!clip) {
      return;
    }
    const combo = comboFromClip(clip, comboName);
    if (!combo || typeof window.xamxixiu.saveMemeCombo !== "function") {
      return;
    }
    const next = await window.xamxixiu.saveMemeCombo(combo);
    onCombosChange(next);
    setComboName("");
    onChange(applyComboToProject(project, clipId, combo));
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-2.5">
      <p className="text-[12px] font-medium text-ink">{clip.label}</p>
      {canChoose || removable ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {canChoose && pickerTarget ? (
            <Button
              size="sm"
              disabled={disabled || locked}
              onClick={() => onChoose(pickerTarget)}
            >
              {clipChooseLabel(pickerTarget)}
            </Button>
          ) : null}
          {removable && trackClip ? (
            <Button
              variant="danger"
              size="sm"
              disabled={disabled || locked}
              onClick={() => onRemove(trackClip)}
            >
              Gỡ
            </Button>
          ) : null}
        </div>
      ) : null}
      {imageMeme || videoMeme ? (
        <label className="mt-2 block text-[11px] text-ink-2">
          Effect
          <select
            className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1"
            disabled={disabled || clip.locked || videoMeme}
            value={videoMeme ? "none" : selectedComboId}
            onChange={(event) => {
              const id = event.target.value;
              if (id === CUSTOM_COMBO_ID) {
                return;
              }
              const combo = findCombo(id, userCombos);
              if (combo) {
                onChange(applyComboToProject(project, clipId, combo));
              }
            }}
          >
            {custom ? (
              <option value={CUSTOM_COMBO_ID}>Tùy chỉnh</option>
            ) : null}
            {BUILTIN_COMBOS.map((combo) => (
              <option key={combo.id} value={combo.id}>
                {combo.name}
              </option>
            ))}
            {userCombos.map((combo) => (
              <option key={combo.id} value={combo.id}>
                {combo.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-ink-2">
        <label>
          Fade in
          <input
            type="number"
            min={0}
            step={0.05}
            value={clip.fadeIn}
            disabled={disabled || clip.locked}
            className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1"
            onBlur={() => onFlushDraft?.()}
            onChange={(event) =>
              draftChange(
                setClipFades(
                  project,
                  clipId,
                  Number(event.target.value),
                  clip.fadeOut
                )
              )
            }
          />
        </label>
        <label>
          Fade out
          <input
            type="number"
            min={0}
            step={0.05}
            value={clip.fadeOut}
            disabled={disabled || clip.locked}
            className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1"
            onBlur={() => onFlushDraft?.()}
            onChange={(event) =>
              draftChange(
                setClipFades(
                  project,
                  clipId,
                  clip.fadeIn,
                  Number(event.target.value)
                )
              )
            }
          />
        </label>
        {clipHasTimedMotion(clip) ? (
          <label>
            Animation
            <input
              type="number"
              min={0}
              step={0.05}
              value={clipFlyUpDuration(clip)}
              disabled={disabled || clip.locked}
              className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1"
              onBlur={() => onFlushDraft?.()}
              onChange={(event) =>
                draftChange(
                  setClipAnimationDuration(
                    project,
                    clipId,
                    Number(event.target.value)
                  )
                )
              }
            />
          </label>
        ) : null}
        {imageMeme || videoMeme || clip.trackId === "images" ? (
          <>
            <label>
              X
              <input
                type="number"
                min={-1}
                max={1}
                step={0.05}
                value={clip.x ?? 0}
                disabled={disabled || clip.locked}
                className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1"
                onBlur={() => onFlushDraft?.()}
                onChange={(event) =>
                  draftChange(
                    setClipPosition(
                      project,
                      clipId,
                      Number(event.target.value),
                      clip.y ?? 0
                    )
                  )
                }
              />
            </label>
            <label>
              Y
              <input
                type="number"
                min={-1}
                max={1}
                step={0.05}
                value={clip.y ?? 0}
                disabled={disabled || clip.locked}
                className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1"
                onBlur={() => onFlushDraft?.()}
                onChange={(event) =>
                  draftChange(
                    setClipPosition(
                      project,
                      clipId,
                      clip.x ?? 0,
                      Number(event.target.value)
                    )
                  )
                }
              />
            </label>
          </>
        ) : null}
        {imageMeme ? (
          <>
            <label>
              Scale
              <input
                type="number"
                min={0.2}
                max={1.2}
                step={0.05}
                value={clip.scale ?? 1}
                disabled={disabled || clip.locked}
                className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1"
                onBlur={() => onFlushDraft?.()}
                onChange={(event) =>
                  draftChange(
                    setClipScale(project, clipId, Number(event.target.value))
                  )
                }
              />
            </label>
            <label>
              SFX offset
              <input
                type="number"
                min={0}
                step={0.05}
                value={clip.sfxOffset ?? 0}
                disabled={disabled || clip.locked}
                className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1"
                onBlur={() => onFlushDraft?.()}
                onChange={(event) =>
                  draftChange(
                    setClipSfxOffset(
                      project,
                      clipId,
                      Number(event.target.value)
                    )
                  )
                }
              />
            </label>
          </>
        ) : null}
      </div>
      {imageMeme ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            disabled={disabled || clip.locked || !namedCombo || !custom}
            onClick={() => {
              if (namedCombo) {
                onChange(applyComboToProject(project, clipId, namedCombo));
              }
            }}
          >
            Reset
          </Button>
          <Button
            size="sm"
            disabled={disabled || clip.locked}
            onClick={() => onChange(clearComboOnProject(project, clipId))}
          >
            Gỡ effect
          </Button>
          {/*
          <label className="flex items-center gap-1 text-[11px] text-ink-2">
            <input
              type="checkbox"
              checked={Boolean(clip.comboLocked)}
              disabled={disabled || clip.locked}
              onChange={(event) =>
                onChange(
                  setClipComboLocked(project, clipId, event.target.checked)
                )
              }
            />
            Khóa effect
          </label>
          */}
        </div>
      ) : null}
      {imageMeme ? (
        <div className="mt-2 flex gap-1.5">
          <input
            value={comboName}
            disabled={disabled || clip.locked}
            placeholder="Tên effect"
            className="min-w-0 flex-1 rounded-md border border-line bg-app px-2 py-1 text-[11px]"
            onChange={(event) => setComboName(event.target.value)}
          />
          <Button
            size="sm"
            disabled={disabled || clip.locked || !comboName.trim()}
            onClick={() => void saveCurrentCombo()}
          >
            Lưu
          </Button>
        </div>
      ) : null}
      {/*
      <Button
        size="sm"
        className="mt-2"
        disabled={disabled || clip.locked}
        onClick={onSplit}
      >
        Split tại playhead
      </Button>
      */}
    </div>
  );
}
