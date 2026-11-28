import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { Asset } from "../src/assets/library";
import {
  matchReactions,
  type MatchedReaction
} from "../src/assets/matcher";
import {
  buildCommentForest,
  groupCommentsAsThread,
  reorderComments
} from "../src/comments/order";
import { isAnalysisStale } from "../src/comments/analysis-stale";
import {
  commentProcessedPngName,
  emptyImportedComment,
  importCommentImage
} from "../src/comments/import-comment-image";
import {
  applyTimelineAssetReplacement,
  canRemoveTimelineAsset
} from "../src/timeline/replace-asset";
import {
  DEFAULT_TOPIC_TITLE,
  isTopicTitleMissing,
  normalizeTopicTitle,
  resolveTimelineTopicTitle,
  resolveTopicTitleVoiceEnabled,
  TOPIC_POST_COMMENT_INDEX,
  TOPIC_TITLE_MAX_LENGTH,
  TOPIC_TITLE_TRANSFORM_Y
} from "../src/timeline/topic-constants";
import {
  applySpeechTextDiffs,
  cleanSpeechText,
  diffCleanedSpeechText
} from "../src/comments/clean-speech-text";
import {
  autoFormat,
  moveClip,
  setClipAnimationDuration,
  trimClip
} from "../src/timeline/auto-format";
import {
  applyComboToProject,
  autoFormat as formatTimelineProject,
  clearComboOnProject,
  moveClip as moveEditorClip,
  removeClip as removeEditorClip,
  setClipFades,
  setClipImageEffect,
  setClipLocked,
  setClipPosition,
  setClipSfxOffset,
  splitClip,
  trimClip as trimEditorClip
} from "../renderer/features/preview/timeline-edit";
import {
  emptyTimelineHistory,
  HISTORY_LIMIT,
  pushHistory,
  redoHistory,
  timelineHotkey,
  timelineProjectsEqual,
  undoHistory,
  type TimelineHistory
} from "../src/timeline/history";
import {
  clipPreviewFiles,
  comboStampNeeded,
  continueEditorBurst,
  flushEditorBurst,
  previewFilesChanged
} from "../src/timeline/persist";
import {
  compileTimelineProject,
  createSpikeTimelineProject
} from "../src/hyperframes/compile";
import { addBeepClip, removeClip } from "../src/timeline/beep";
import {
  clipAnimationLabel,
  clipFlyUpProgress,
  clipFlyUpTopPercent,
  clipMotionName,
  clipShakeOffsetPercent,
  clipSlideLeftPercent,
  clipUsesFlyUp,
  clipZoomMultiplier,
  withAnimationLabel,
  ZOOM_IN_FROM
} from "../src/timeline/clip-motion";
import { videoTimelineToProject } from "../src/timeline/from-video-timeline";
import {
  sequenceCommentVisualClips,
  sequenceMemeOverlays
} from "../src/timeline/overlay-sequence";
import {
  clipMutesVideoElement,
  cloneTimelineProject,
  createEmptyTimelineProject,
  DEFAULT_AUTO_FORMAT,
  roundTime,
  type TimelineClip,
  type TimelineProject
} from "../src/timeline/project";
import { packTimelineScenes } from "../src/timeline/scene-pack";
import {
  applyCombo,
  assignReactionCombos,
  clearCombo,
  comboFromEmotion,
  getBuiltinCombo,
  isCustomCombo,
  persistBuiltInComboIds,
  preserveComboClips,
  stampComboFromClips
} from "../src/timeline/meme-combo";
import {
  canMoveClipOnPreview,
  clampClipAxis,
  clipPositionFromPointer,
  overlayRestLeftPercent,
  overlayRestTopPercent
} from "../src/timeline/clip-position";
import { stackCommentPositions } from "../src/timeline/comment-stack";
import {
  applyMemeDefaultLayout,
  clampMemeDefaultStyle,
  DEFAULT_MEME_STYLE,
  DEFAULT_OVERLAY_STYLE_DEFAULTS,
  overlayStyleDefaultsFromSettings
} from "../src/meme-style";
import {
  clampImageEffectStyle,
  DEFAULT_IMAGE_EFFECT,
  resolveClipImageEffect,
  imageEffectLeftPercent,
  imageEffectOpacity,
  imageEffectPopScale,
  imageEffectScale,
  imageEffectTopPercent,
  POP_FROM,
  POP_PEAK
} from "../src/image-effect";
import {
  clampWatermarkStyle,
  DEFAULT_WATERMARK_STYLE,
  pingPong,
  watermarkCssText,
  watermarkHasText,
  watermarkOpacity,
  watermarkPoint,
  watermarkTextSize,
  watermarkTravel
} from "../src/watermark-style";
import { applyMemeSuggestions } from "../src/ai/suggest-memes";
import { sanitizeAnalysis } from "../src/assets/prompt-catalog";
import {
  isBulkClearableOverlayClip,
  isCommentMemeOrSfxClip,
  isTopicIntroMemeOrOpenSfx
} from "../src/timeline/comment-overlay-clips";
import {
  clearCommentAnalysisAssets,
  clearCommentMemesAndSfx,
  clearCommentReactionAssets,
  collectClearedOverlayKinds
} from "../src/timeline/clear-comment-assets";
import {
  DEFAULT_CAPTURE_VIEWPORT,
  parseCaptureViewport,
  type ThreadAnalysis,
  type ThreadComment,
  type VideoTimeline
} from "../src/types";
import { cn } from "../renderer/features/ui/cn";
import {
  chooseParentIndex,
  parsePressableComment,
  parentIndexFromSnapshot,
  PRESSABLE_SELECTOR,
  THREAD_COLUMN_SELECTOR,
  type PressableCardSnapshot
} from "../src/extract";
import {
  captureCardRoot,
  composerOverlayRoot,
  isBottomChrome,
  screenshotClipFitsViewport,
  screenshotClipRect,
  screenshotExtractRect
} from "../src/screenshot";
import { getExportEngine } from "../src/hyperframes/engine";
import { mediaType } from "../src/capcut/compile/spec-builder";
import {
  applyImageEffectToSpec,
  applyTimelineProjectLayout,
  isAnimatedVisual,
  overlayPixelFormat,
  visualFilters
} from "../src/export/video-exporter";
import {
  topicTitleCardMetrics,
  wrapTopicTitle
} from "../src/capcut/compile/title-card";
import {
  assetsForTarget,
  pickerTitle,
  selectedAssetId
} from "../renderer/features/preview/asset-picker";
import { assetFileName, assetMediaSrc } from "../renderer/features/preview/asset-media";
import { isIgnorableStreamClosedError } from "../src/electron/stream-closed-error";
import {
  clipBarWidth,
  clipCanRemove,
  clipChooseLabel,
  clipHasAssetPickerTarget,
  clipOpensAssetPicker,
  clipPointerIntent,
  findTrackClip,
  formatClipLabel,
  getProjectTracks,
  getSceneBands,
  getTimelineSceneBands,
  getTimelineTracks,
  activeSceneBandId,
  TIMELINE_SELECTION_KEEP_SELECTOR,
  isVideoAsset,
  targetFromProjectClip,
  TRACK_IDS,
  TRACK_LABELS,
  isEditorTimelineTrack,
  trackLaneHeight
} from "../renderer/features/preview/timeline-tracks";
import {
  getPreviewAudioTracks,
  getPreviewScene,
  previewProgressPercent,
  previewSeekThreshold,
  previewTimeFromBar
} from "../renderer/features/preview/preview-timeline";
import {
  sampleWaveformPeaks,
  waveformBarCount,
  waveformBarHeightPercent
} from "../renderer/features/preview/waveform";
import {
  isPreviewFullscreen,
  previewCaptureStyleScale,
  previewFrameClass,
  previewFullscreenFrameWidth,
  previewHostClass,
  previewStageBoxStyle,
  previewStageMode,
  previewStageScale
} from "../renderer/features/preview/preview-chrome";
import {
  formatProjectId,
  projectCaptureViewport,
  projectSourceUrl,
  identityImageSlots,
  withVoiceAssignment
} from "../renderer/features/workflow/project-helpers";
import { WORKFLOW_STEPS } from "../renderer/features/workflow/steps";
import { pickPreviewMeme } from "../renderer/features/custom/preview-meme";
import { createDefaultAnalysis } from "../src/ai/default-analysis";
import {
  clampCommentCaptureStyle,
  commentCaptureCardStyle,
  commentCaptureCssText,
  commentCaptureDisplayScale,
  DEFAULT_COMMENT_CAPTURE_STYLE,
  parseHexColor,
  shadowOffset
} from "../src/capture-style";
import {
  clampTopicTitleStyle,
  DEFAULT_TOPIC_TITLE_STYLE,
  OVERLAY_CANVAS_PX_SCALE,
  OVERLAY_REFERENCE_WIDTH,
  overlayCanvasPx,
  TOPIC_TITLE_PREVIEW_TEXT,
  topicTitleCardStyle,
  topicTitleCssText,
  topicTitleDisplayScale,
  topicTitleExportScale
} from "../src/topic-title-style";
import {
  APP_VIEW_HREF,
  APP_VIEWS,
  appViewFromPathname,
  appViewPanelClass,
  isAppViewVisible,
  keptAppViewPanels
} from "../renderer/features/app/app-view";
import {
  playingIfActive,
  shouldAdvancePreviewClock
} from "../renderer/features/preview/use-timeline-preview";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(testsDir, "..");
const rendererRoot = path.join(repoRoot, "renderer/features/app");

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function importSpecifiers(source: string): Array<{ typeOnly: boolean; specifier: string }> {
  const matches: Array<{ typeOnly: boolean; specifier: string }> = [];
  const pattern =
    /(?:^|\n)\s*import\s+(type\s+)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    matches.push({
      typeOnly: Boolean(match[1]),
      specifier: match[2]
    });
  }
  return matches;
}

function resolveSourceImport(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  const withoutJs = specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier;
  const resolved = path.resolve(path.dirname(fromFile), withoutJs);
  for (const candidate of [resolved, `${resolved}.ts`, `${resolved}.tsx`]) {
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Try the next extension.
    }
  }
  return undefined;
}

function clientJsValueImports(): Array<{ file: string; specifier: string }> {
  const rendererDir = path.join(repoRoot, "renderer");
  const srcMarker = `${path.sep}src${path.sep}`;
  const queue = listSourceFiles(rendererDir);
  const seen = new Set<string>();
  const bad: Array<{ file: string; specifier: string }> = [];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const item of importSpecifiers(source)) {
      if (item.typeOnly) {
        continue;
      }
      if (item.specifier.endsWith(".js") && file.includes(srcMarker)) {
        bad.push({
          file: path.relative(repoRoot, file).replaceAll("\\", "/"),
          specifier: item.specifier
        });
        continue;
      }
      const resolved = resolveSourceImport(file, item.specifier);
      if (resolved) {
        queue.push(resolved);
      }
    }
  }
  return bad;
}

function hasClass(
  className: string,
  token: string
): boolean {
  return className.split(/\s+/).includes(token);
}

function comment(
  author: string,
  extras: Partial<ThreadComment> = {}
): ThreadComment {
  return {
    author,
    text: extras.text ?? author,
    likes: extras.likes ?? 0,
    containerIndex: extras.containerIndex ?? 0,
    ...extras
  };
}

function analysis(
  extras: Partial<ThreadAnalysis> = {}
): ThreadAnalysis {
  return {
    tone: "casual",
    topicType: "other",
    intensity: 5,
    musicType: "neutral",
    reactions: [
      {
        commentIndex: 0,
        emotion: "neutral",
        memeCategory: null,
        sfxCategory: null,
        animation: "none",
        duration: 1
      }
    ],
    ...extras
  };
}

function asset(partial: Partial<Asset> & Pick<Asset, "id" | "type" | "mediaKind">): Asset {
  return {
    file: partial.file ?? `${partial.id}.bin`,
    category: partial.category ?? "test",
    tags: partial.tags ?? [],
    intensity: partial.intensity ?? 0.5,
    createdAt: partial.createdAt ?? "2026-01-01",
    updatedAt: partial.updatedAt ?? "2026-01-01",
    spec: partial.spec,
    id: partial.id,
    type: partial.type,
    mediaKind: partial.mediaKind
  };
}

function timeline(partial: Partial<VideoTimeline> = {}): VideoTimeline {
  return {
    version: 1,
    canvas: { width: 1080, height: 1920, fps: 30 },
    totalDuration: 4,
    backgroundFile: "bg.mp4",
    musicFile: "music.mp3",
    scenes: [
      {
        id: "topic",
        commentIndex: null,
        imageFile: "processed/topic.png",
        imageStart: 0,
        imageDuration: 2,
        audioFile: "audio/topic.mp3",
        audioStart: 0,
        audioDuration: 2,
        overlays: []
      },
      {
        id: "comment-0",
        commentIndex: 0,
        imageFile: "processed/comment-01.png",
        imageStart: 0,
        imageDuration: 2,
        audioFile: "audio/comment-0.mp3",
        audioStart: 0,
        audioDuration: 1.5,
        overlays: [
          {
            type: "meme",
            file: "meme.png",
            start: 1.5,
            duration: 0.5
          },
          {
            type: "sfx",
            file: "boom.mp3",
            start: 1.5,
            duration: 0.4
          }
        ]
      }
    ],
    ...partial
  };
}

describe("workflow chrome", () => {
  it("bootstraps analysis without a dedicated Analyze step", () => {
    const seeded = createDefaultAnalysis({
      topicTitle: "Hello",
      comments: [
        comment("a"),
        comment("b", { excluded: true }),
        comment("c")
      ]
    });
    assert.equal(seeded.topicVoiceId, "ngoc-huyen");
    assert.equal(seeded.topicIntroEnabled, true);
    assert.equal(seeded.topicTitleVoiceMode, "off");
    assert.equal(
      createDefaultAnalysis(
        { comments: [] },
        { topicTitleVoiceMode: "on" }
      ).topicTitleVoiceMode,
      "on"
    );
    assert.equal(
      createDefaultAnalysis(
        { comments: [] },
        { topicTitleVoiceMode: "auto" }
      ).topicTitleVoiceMode,
      "off"
    );
    assert.deepEqual(
      seeded.reactions.map((reaction) => reaction.commentIndex),
      [0, 2]
    );
    const kept = createDefaultAnalysis(
      {
        topicTitle: "Hello",
        comments: [comment("a"), comment("c")]
      },
      {
        topicVoiceId: "minh-hoang",
        reactions: [
          {
            commentIndex: 0,
            emotion: "laughing",
            voiceId: "minh-hoang",
            memeCategory: null,
            sfxCategory: null,
            animation: "none",
            duration: 1
          }
        ]
      }
    );
    assert.equal(kept.topicVoiceId, "minh-hoang");
    assert.equal(kept.reactions[0]?.emotion, "laughing");
    assert.equal(kept.reactions[1]?.commentIndex, 1);
    assert.equal(kept.reactions[1]?.voiceId, "ngoc-huyen");

    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/workflow/WorkflowWorkspace.tsx"),
      "utf8"
    );
    assert.match(
      workspace,
      /createDefaultAnalysis\(nextContent, current\.analysis\)/
    );
    assert.doesNotMatch(workspace, /Chưa có analysis/);
    assert.doesNotMatch(workspace, /Hãy Analyze/);
  });

  it("keeps the four workflow steps in pipeline order", () => {
    assert.deepEqual([...WORKFLOW_STEPS], [
      "INPUT",
      "CAPTURE",
      "VOICE",
      "TIMELINE"
    ]);
  });

  it("hides the workflow footer on the last step and keeps the timeline toolbar above the tracks", () => {
    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/workflow/WorkflowWorkspace.tsx"),
      "utf8"
    );
    const timeline = readFileSync(
      path.join(repoRoot, "renderer/features/preview/TimelineWorkspace.tsx"),
      "utf8"
    );
    assert.match(workspace, /currentStep !== "TIMELINE"/);
    assert.match(
      timeline,
      /\{toolbar\}\s*<TimelineTracks/s
    );
    assert.match(timeline, /cursor-ns-resize/);
    assert.match(timeline, /xamxixiu\.timelinePaneHeight/);
    assert.match(timeline, /data-keep-selection/);
    assert.match(timeline, /replacing \|\| loading/);
    assert.match(timeline, /Đang cập nhật timeline/);
    assert.match(timeline, /aria-busy="true"/);
  });

  it("blocks leaving Capture without a topic title and saves capture on next", () => {
    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/workflow/WorkflowWorkspace.tsx"),
      "utf8"
    );
    const capture = readFileSync(
      path.join(repoRoot, "renderer/features/workflow/CaptureStep.tsx"),
      "utf8"
    );
    assert.match(workspace, /isTopicTitleMissing\(draftTopicTitleRef\.current\)/);
    assert.match(workspace, /setTitleMissing\(true\)/);
    assert.match(workspace, /await persistDraft\(\)/);
    assert.match(workspace, /await persistTopicTitle\(saved\)/);
    assert.match(capture, /titleInvalid && "border-danger/);
    assert.match(capture, /scrollIntoView/);
  });

  it("reads the saved Threads URL from the project", () => {
    assert.equal(
      projectSourceUrl({
        content: {
          url: " https://www.threads.com/@user/post/1 ",
          author: "",
          text: "",
          likes: 0,
          postContainerIndex: 0,
          comments: []
        }
      }),
      "https://www.threads.com/@user/post/1"
    );
    assert.equal(
      projectSourceUrl({
        thread: {
          url: "https://www.threads.com/@user/post/2",
          author: "",
          text: "",
          likes: 0,
          postContainerIndex: 0,
          comments: []
        }
      }),
      "https://www.threads.com/@user/post/2"
    );
    assert.equal(projectSourceUrl(undefined), "");
  });

  it("formats project ids without the -thread suffix", () => {
    assert.equal(
      formatProjectId({
        id: "2026-11-07T05-24-35-795Z-thread",
        directory: "/tmp",
        hasThread: true,
        hasAnalysis: true,
        hasTimeline: true,
        hasReactions: true,
        audioCount: 1
      }),
      "2026-11-07T05-24-35-795Z"
    );
  });

  it("builds identity image slots for capture comments", () => {
    assert.deepEqual(identityImageSlots(3), [0, 1, 2]);
  });
});

describe("capture viewport", () => {
  it("parses desktop or defaults to mobile", () => {
    assert.equal(DEFAULT_CAPTURE_VIEWPORT, "mobile");
    assert.equal(parseCaptureViewport("desktop"), "desktop");
    assert.equal(parseCaptureViewport("mobile"), "mobile");
    assert.equal(parseCaptureViewport("tablet"), "mobile");
    assert.equal(parseCaptureViewport(undefined), "mobile");
  });

  it("reads the saved capture viewport from the project", () => {
    assert.equal(
      projectCaptureViewport({
        content: {
          url: "",
          author: "",
          text: "",
          likes: 0,
          postContainerIndex: 0,
          comments: [],
          viewport: "desktop"
        }
      }),
      "desktop"
    );
    assert.equal(
      projectCaptureViewport({
        thread: {
          url: "",
          author: "",
          text: "",
          likes: 0,
          postContainerIndex: 0,
          comments: []
        }
      }),
      "mobile"
    );
    assert.equal(projectCaptureViewport(undefined), "mobile");
  });

  it("shows Desktop/Mobile radios on Input, defaulting to Mobile", () => {
    const input = readFileSync(
      path.join(repoRoot, "renderer/features/workflow/InputStep.tsx"),
      "utf8"
    );
    const workspace = readFileSync(
      path.join(
        repoRoot,
        "renderer/features/workflow/WorkflowWorkspace.tsx"
      ),
      "utf8"
    );
    assert.match(input, /type="radio"/);
    assert.match(input, /value="mobile"/);
    assert.match(input, /value="desktop"/);
    assert.match(input, />\s*Mobile\s*</);
    assert.match(input, />\s*Desktop\s*</);
    assert.match(input, /checked=\{captureViewport === "mobile"\}/);
    assert.match(workspace, /DEFAULT_CAPTURE_VIEWPORT/);
    assert.match(workspace, /captureViewport/);
    assert.match(workspace, /captureThread\(/);
    assert.match(workspace, /captureViewport/);
  });

  it("launches iPhone 13 for mobile capture and 1440 for login", () => {
    const browser = readFileSync(
      path.join(repoRoot, "src/browser.ts"),
      "utf8"
    );
    assert.match(browser, /devices\["iPhone 13"\]/);
    assert.match(browser, /width: 1440/);
    assert.match(browser, /height: 1200/);
    assert.match(browser, /launchContext\("desktop"\)/);
    assert.match(browser, /viewport: mobile\.viewport/);
    assert.match(browser, /isMobile: mobile\.isMobile/);
    assert.match(browser, /hasTouch: mobile\.hasTouch/);
    const login = browser.slice(
      browser.indexOf("export async function openLoginBrowser")
    );
    assert.match(login, /launchContext\("desktop"\)/);
    assert.doesNotMatch(login, /launchContext\("mobile"\)/);
  });

  it("passes viewport through captureThread and IPC", () => {
    const capture = readFileSync(
      path.join(repoRoot, "src/capture.ts"),
      "utf8"
    );
    const ipc = readFileSync(
      path.join(repoRoot, "src/electron/ipc.ts"),
      "utf8"
    );
    const types = readFileSync(
      path.join(repoRoot, "src/electron/ipc-types.ts"),
      "utf8"
    );
    const preload = readFileSync(
      path.join(repoRoot, "src/electron/preload.ts"),
      "utf8"
    );
    const createProject = readFileSync(
      path.join(repoRoot, "src/create-project.ts"),
      "utf8"
    );
    assert.match(
      capture,
      /viewport: CaptureViewport = DEFAULT_CAPTURE_VIEWPORT/
    );
    assert.match(capture, /thread\.viewport = captureViewport/);
    assert.match(capture, /parseCaptureViewport\(viewport\)/);
    assert.match(ipc, /parseCaptureViewport\(viewport\)/);
    assert.match(
      readFileSync(
        path.join(
          repoRoot,
          "renderer/features/workflow/project-helpers.ts"
        ),
        "utf8"
      ),
      /project\?\.content\?\.viewport/
    );
    assert.match(types, /viewport\?: CaptureViewport/);
    assert.match(
      preload,
      /captureThread: \(url, commentLimit, viewport\)/
    );
    assert.match(createProject, /DEFAULT_CAPTURE_VIEWPORT/);
  });

  it("adds extra comments from a pasted image instead of a Threads URL", () => {
    const captureStep = readFileSync(
      path.join(repoRoot, "renderer/features/workflow/CaptureStep.tsx"),
      "utf8"
    );
    const workspace = readFileSync(
      path.join(
        repoRoot,
        "renderer/features/workflow/WorkflowWorkspace.tsx"
      ),
      "utf8"
    );
    const ipc = readFileSync(
      path.join(repoRoot, "src/electron/ipc.ts"),
      "utf8"
    );
    const types = readFileSync(
      path.join(repoRoot, "src/electron/ipc-types.ts"),
      "utf8"
    );
    assert.match(captureStep, /Dán ảnh \(Ctrl\+V\)/);
    assert.match(captureStep, /type="file"/);
    assert.match(captureStep, /onDrop=\{handleDrop\}/);
    assert.match(captureStep, /window\.addEventListener\("paste"/);
    assert.match(captureStep, /Chọn từ máy/);
    assert.match(captureStep, /Nội dung comment/);
    assert.match(captureStep, /"Lưu"/);
    assert.match(captureStep, /savePendingComment/);
    assert.doesNotMatch(captureStep, /Dán link reply Threads/);
    assert.match(workspace, /importCommentImage\(/);
    assert.match(ipc, /capture:comment-image/);
    assert.doesNotMatch(ipc, /capture:comment"/);
    assert.match(types, /ImportCommentImagePayload/);
    assert.doesNotMatch(types, /CaptureCommentPayload/);
  });

  it("falls back to pressable cards when Column body is missing", () => {
    assert.ok(PRESSABLE_SELECTOR.includes(THREAD_COLUMN_SELECTOR));
    assert.match(
      PRESSABLE_SELECTOR,
      /body:not\(:has\(\[aria-label="Column body"\]\)\)/
    );
    const extract = readFileSync(
      path.join(repoRoot, "src/extract.ts"),
      "utf8"
    );
    assert.match(extract, /snapshotPressableCards/);
    assert.match(extract, /PRESSABLE_SELECTOR/);
  });
});

describe("app tab keep-alive", () => {
  it("maps renderer pathnames to chrome tabs", () => {
    assert.equal(appViewFromPathname("/"), "workflow");
    assert.equal(appViewFromPathname(""), "workflow");
    assert.equal(appViewFromPathname("/library"), "library");
    assert.equal(appViewFromPathname("/library/"), "library");
    assert.equal(appViewFromPathname("/custom"), "custom");
    assert.equal(appViewFromPathname("/custom/"), "custom");
  });

  it("keeps both workspaces present when switching to library and back", () => {
    const start = keptAppViewPanels("/");
    const library = keptAppViewPanels("/library/");
    const back = keptAppViewPanels("/");

    assert.deepEqual(
      start.map((panel) => panel.view),
      [...APP_VIEWS]
    );
    assert.deepEqual(
      library.map((panel) => panel.view),
      [...APP_VIEWS]
    );
    assert.deepEqual(
      back.map((panel) => panel.view),
      [...APP_VIEWS]
    );

    assert.equal(
      isAppViewVisible(appViewFromPathname("/"), "workflow"),
      true
    );
    assert.equal(
      isAppViewVisible(appViewFromPathname("/library/"), "workflow"),
      false
    );
    assert.equal(
      isAppViewVisible(appViewFromPathname("/library/"), "library"),
      true
    );
    assert.equal(
      isAppViewVisible(appViewFromPathname("/"), "library"),
      false
    );
    assert.equal(
      isAppViewVisible(appViewFromPathname("/custom/"), "custom"),
      true
    );
    assert.equal(
      isAppViewVisible(appViewFromPathname("/custom/"), "workflow"),
      false
    );

    const hiddenWorkflow = library.find(
      (panel) => panel.view === "workflow"
    );
    const visibleLibrary = library.find(
      (panel) => panel.view === "library"
    );
    const restoredWorkflow = back.find(
      (panel) => panel.view === "workflow"
    );

    assert.equal(hiddenWorkflow?.visible, false);
    assert.equal(hasClass(hiddenWorkflow?.className ?? "", "hidden"), true);
    assert.equal(visibleLibrary?.visible, true);
    assert.equal(hasClass(visibleLibrary?.className ?? "", "hidden"), false);
    assert.equal(restoredWorkflow?.visible, true);
    assert.equal(hasClass(restoredWorkflow?.className ?? "", "hidden"), false);
    assert.equal(
      appViewPanelClass("workflow", "library"),
      hiddenWorkflow?.className
    );
  });

  it("pauses timeline preview while the workflow tab is hidden", () => {
    assert.equal(playingIfActive(true, true), true);
    assert.equal(playingIfActive(true, false), false);
    assert.equal(playingIfActive(false, true), false);
  });

  it("uses client-side tab links and always mounts both workspaces", () => {
    const chrome = readFileSync(
      path.join(rendererRoot, "AppChrome.tsx"),
      "utf8"
    );
    const shell = readFileSync(
      path.join(rendererRoot, "AppShell.tsx"),
      "utf8"
    );

    assert.match(chrome, /import Link from "next\/link"/);
    assert.match(chrome, /href=\{APP_VIEW_HREF\.workflow\}/);
    assert.match(chrome, /href=\{APP_VIEW_HREF\.library\}/);
    assert.match(chrome, /href=\{APP_VIEW_HREF\.custom\}/);
    assert.doesNotMatch(chrome, /<a\b[^>]*href=/);
    assert.equal(APP_VIEW_HREF.workflow, "/");
    assert.equal(APP_VIEW_HREF.library, "/library/");
    assert.equal(APP_VIEW_HREF.custom, "/custom/");

    assert.match(shell, /<WorkflowWorkspace/);
    assert.match(shell, /<AssetLibraryManager/);
    assert.match(shell, /<CustomWorkspace/);
    assert.doesNotMatch(
      shell,
      /active === "workflow" \?\s*\(?\s*<WorkflowWorkspace/
    );
    assert.doesNotMatch(
      shell,
      /active === "library" \?\s*\(?\s*<AssetLibraryManager/
    );
    assert.doesNotMatch(
      shell,
      /active === "custom" \?\s*\(?\s*<CustomWorkspace/
    );
  });
});

describe("comment capture style", () => {
  it("clamps radius, border, shadow and hex colors", () => {
    assert.deepEqual(
      clampCommentCaptureStyle(undefined),
      DEFAULT_COMMENT_CAPTURE_STYLE
    );
    assert.equal(DEFAULT_COMMENT_CAPTURE_STYLE.radius, 0);
    assert.deepEqual(
      clampCommentCaptureStyle({
        radius: 200,
        border: -4,
        borderColor: "#fff",
        shadow: 12.6,
        shadowColor: "red"
      }),
      {
        radius: 80,
        border: 0,
        borderColor: "#ffffff",
        shadow: 13,
        shadowColor: "#000000",
        x: 0,
        y: 0.5
      }
    );
    assert.equal(DEFAULT_COMMENT_CAPTURE_STYLE.x, 0);
    assert.equal(DEFAULT_COMMENT_CAPTURE_STYLE.y, 0.5);
    assert.deepEqual(
      clampCommentCaptureStyle({ x: 2, y: -3 }),
      {
        ...DEFAULT_COMMENT_CAPTURE_STYLE,
        x: 1,
        y: -1
      }
    );
    assert.equal(parseHexColor("#AbC"), "#aabbcc");
    assert.equal(parseHexColor("zzz"), undefined);
    assert.equal(shadowOffset(10), 3);
    assert.deepEqual(
      commentCaptureCardStyle({
        radius: 8,
        border: 2,
        borderColor: "#112233",
        shadow: 9,
        shadowColor: "#000000"
      }),
      {
        borderRadius: "14.22px",
        border: "3.56px solid #112233",
        boxShadow: "0 5.33px 16px #000000"
      }
    );
    assert.equal(
      commentCaptureCssText({
        radius: 8,
        border: 2,
        borderColor: "#112233",
        shadow: 9,
        shadowColor: "#000000"
      }),
      "border-radius:14.22px;border:3.56px solid #112233;box-shadow:0 5.33px 16px #000000"
    );
    assert.equal(commentCaptureDisplayScale(270, 1080), 0.25);
    assert.deepEqual(
      commentCaptureCardStyle(
        {
          radius: 8,
          border: 2,
          borderColor: "#112233",
          shadow: 9,
          shadowColor: "#000000"
        },
        0.25
      ),
      {
        borderRadius: "3.56px",
        border: "0.89px solid #112233",
        boxShadow: "0 1.33px 4px #000000"
      }
    );
  });

  it("renders Comment Capture controls and live preview", () => {
    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/custom/CustomWorkspace.tsx"),
      "utf8"
    );
    const tabs = readFileSync(
      path.join(repoRoot, "renderer/features/custom/custom-tabs.ts"),
      "utf8"
    );
    const page = readFileSync(
      path.join(repoRoot, "renderer/app/custom/page.tsx"),
      "utf8"
    );
    assert.match(tabs, /Comment Capture/);
    assert.match(workspace, /previewStageBoxStyle/);
    assert.match(workspace, /COMMENT_PREVIEW_WIDTH_FRACTION/);
    assert.match(workspace, /commentCaptureCardStyle\(style\)/);
    assert.match(workspace, /overlayRestLeftPercent\(style\.x\)/);
    assert.match(workspace, /overlayRestTopPercent\(style\.y\)/);
    assert.match(workspace, /id="capture-x"/);
    assert.match(workspace, /id="capture-y"/);
    assert.doesNotMatch(workspace, /CaptureStyleImage/);
    assert.match(workspace, /saveSettings/);
    assert.match(workspace, /commentCapture: next/);
    assert.match(workspace, /setSaved\(next\)/);
    assert.doesNotMatch(workspace, /result\.settings\.commentCapture/);
    assert.match(workspace, /processed\/comment-01\.png/);
    assert.match(workspace, /getProjectAsset/);
    assert.match(workspace, /PREVIEW_CHECKERBOARD/);
    assert.match(workspace, /COMMENT_CAPTURE_STYLE_CHANGED/);
    assert.match(page, /export default function CustomPage/);
  });

  it("previews the latest Custom style on Capture and Timeline instead of baking files", () => {
    const processImage = readFileSync(
      path.join(repoRoot, "src/process-image.ts"),
      "utf8"
    );
    const capture = readFileSync(
      path.join(repoRoot, "src/capture.ts"),
      "utf8"
    );
    const captureStep = readFileSync(
      path.join(repoRoot, "renderer/features/workflow/CaptureStep.tsx"),
      "utf8"
    );
    const comments = readFileSync(
      path.join(repoRoot, "renderer/features/capture/CaptureComments.tsx"),
      "utf8"
    );
    const player = readFileSync(
      path.join(repoRoot, "renderer/features/preview/HyperframesPlayer.tsx"),
      "utf8"
    );
    const workflow = readFileSync(
      path.join(repoRoot, "renderer/features/workflow/WorkflowWorkspace.tsx"),
      "utf8"
    );
    assert.match(processImage, /export async function applyCaptureStyle/);
    assert.match(processImage, /function imageSize/);
    assert.match(processImage, /overlayCanvasPx/);
    assert.doesNotMatch(processImage, /16 \/ 9/);
    assert.match(processImage, /width: imageSize\(canvasWidth\)/);
    assert.match(processImage, /fit: "inside"/);
    assert.doesNotMatch(
      processImage.slice(
        processImage.indexOf("export async function processImage"),
        processImage.indexOf("export async function applyCaptureStyle")
      ),
      /dest-in/
    );
    assert.doesNotMatch(capture, /input\.style/);
    assert.match(captureStep, /CaptureStyleImage/);
    assert.match(comments, /CaptureStyleImage/);
    assert.match(player, /commentCaptureCardStyle\(captureStyle\)/);
    assert.doesNotMatch(player, /CANVAS_CSS_PX_SCALE/);
    assert.match(player, /previewStageBoxStyle/);
    assert.match(workflow, /useCommentCaptureStyle\(visible\)/);
    const html = compileTimelineProject(createSpikeTimelineProject(), {
      captureStyle: {
        radius: 8,
        border: 2,
        borderColor: "#112233",
        shadow: 9,
        shadowColor: "#000000"
      }
    });
    assert.match(html, /id="comment"[^>]*border-radius:14.22px/);
    assert.doesNotMatch(html, /id="meme-b"[^>]*border-radius:14.22px/);
  });
});

describe("topic title style", () => {
  it("clamps radius, colors, font and keeps the default card look", () => {
    assert.deepEqual(
      clampTopicTitleStyle(undefined),
      DEFAULT_TOPIC_TITLE_STYLE
    );
    assert.equal(DEFAULT_TOPIC_TITLE_STYLE.radius, 24);
    assert.equal(DEFAULT_TOPIC_TITLE_STYLE.padding, 24);
    assert.equal(DEFAULT_TOPIC_TITLE_STYLE.fontSize, 24);
    assert.equal(DEFAULT_TOPIC_TITLE_STYLE.color, "#ffffff");
    assert.equal(DEFAULT_TOPIC_TITLE_STYLE.background, "#000000");
    assert.deepEqual(
      clampTopicTitleStyle({
        background: "#fff",
        border: 40,
        borderColor: "red",
        radius: -2,
        padding: 200,
        fontFamily: "Comic Sans",
        fontSize: 0,
        color: "#AbC"
      }),
      {
        background: "#ffffff",
        border: 24,
        borderColor: "#000000",
        radius: 0,
        padding: 80,
        fontFamily: "Roboto, Arial, sans-serif",
        fontSize: 1,
        color: "#aabbcc",
        x: 0,
        y: TOPIC_TITLE_TRANSFORM_Y
      }
    );
    assert.equal(DEFAULT_TOPIC_TITLE_STYLE.x, 0);
    assert.equal(DEFAULT_TOPIC_TITLE_STYLE.y, TOPIC_TITLE_TRANSFORM_Y);
    assert.deepEqual(
      clampTopicTitleStyle({ x: 4, y: -2 }),
      {
        ...DEFAULT_TOPIC_TITLE_STYLE,
        x: 1,
        y: -1
      }
    );
    assert.deepEqual(
      topicTitleCardStyle(DEFAULT_TOPIC_TITLE_STYLE),
      {
        backgroundColor: "#000000",
        borderRadius: "42.67px",
        border: "none",
        color: "#ffffff",
        fontFamily: "Roboto, Arial, sans-serif",
        fontSize: "42.67px",
        fontWeight: 700,
        textAlign: "center",
        boxSizing: "border-box",
        padding: "42.67px",
        lineHeight: 1.2,
        whiteSpace: "pre-wrap"
      }
    );
    assert.match(
      topicTitleCssText(DEFAULT_TOPIC_TITLE_STYLE),
      /font-size:42.67px/
    );
    assert.match(
      topicTitleCssText(DEFAULT_TOPIC_TITLE_STYLE),
      /background:#000000/
    );
  });

  it("renders Topic Title controls and live preview", () => {
    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/custom/CustomWorkspace.tsx"),
      "utf8"
    );
    const tabs = readFileSync(
      path.join(repoRoot, "renderer/features/custom/custom-tabs.ts"),
      "utf8"
    );
    assert.match(tabs, /Topic Title/);
    assert.match(workspace, /TOPIC_TITLE_PREVIEW_TEXT/);
    assert.equal(
      TOPIC_TITLE_PREVIEW_TEXT,
      "Đây là title topic của bạn"
    );
    assert.match(workspace, /saveSettings/);
    assert.match(workspace, /topicTitle: next/);
    assert.match(workspace, /setSaved\(next\)/);
    assert.doesNotMatch(workspace, /result\.settings\.topicTitle/);
    assert.match(workspace, /TOPIC_TITLE_STYLE_CHANGED/);
    assert.match(workspace, /TOPIC_TITLE_FONTS/);
    assert.match(workspace, /title-padding/);
    assert.match(workspace, /PREVIEW_CHECKERBOARD/);
    assert.match(workspace, /previewStageBoxStyle/);
    assert.match(workspace, /previewStageScale/);
    assert.match(workspace, /topicTitleCardStyle\(style\)/);
    assert.doesNotMatch(workspace, /CANVAS_CSS_PX_SCALE/);
    assert.match(workspace, /TOPIC_TITLE_WIDTH_FRACTION/);
    assert.match(workspace, /overlayRestLeftPercent\(style\.x\)/);
    assert.match(workspace, /overlayRestTopPercent\(style\.y\)/);
    assert.match(workspace, /id="title-x"/);
    assert.match(workspace, /id="title-y"/);
  });

  it("compiles title-card as live HTML CSS and leaves comment images alone", () => {
    const player = readFileSync(
      path.join(repoRoot, "renderer/features/preview/HyperframesPlayer.tsx"),
      "utf8"
    );
    const workflow = readFileSync(
      path.join(repoRoot, "renderer/features/workflow/WorkflowWorkspace.tsx"),
      "utf8"
    );
    const compile = readFileSync(
      path.join(repoRoot, "src/hyperframes/compile.ts"),
      "utf8"
    );
    const exporter = readFileSync(
      path.join(repoRoot, "src/hyperframes/export.ts"),
      "utf8"
    );
    assert.match(player, /topicTitleCardStyle\(titleStyle\)/);
    assert.doesNotMatch(player, /CANVAS_CSS_PX_SCALE/);
    assert.match(player, /previewStageBoxStyle/);
    assert.match(player, /clip\.trackId === "title-card"/);
    assert.match(workflow, /useTopicTitleStyle\(visible\)/);
    assert.match(compile, /topicTitleCssText/);
    assert.match(exporter, /titleStyle/);
    const project = createSpikeTimelineProject();
    project.clips.push({
      id: "title-card",
      trackId: "title-card",
      start: 0,
      duration: 2,
      trimIn: 0,
      sourceDuration: 2,
      file: "processed/topic-title-card.png",
      fadeIn: 0,
      fadeOut: 0,
      volume: 1,
      locked: false,
      label: "Hello title",
      kind: "title"
    });
    const html = compileTimelineProject(project, {
      titleStyle: {
        background: "#123456",
        border: 4,
        borderColor: "#abcdef",
        radius: 16,
        padding: 12,
        fontFamily: "Arial, sans-serif",
        fontSize: 40,
        color: "#fedcba"
      }
    });
    assert.match(html, /<div id="title-card"/);
    assert.match(html, /id="title-card"[^>]*font-size:71.11px/);
    assert.match(html, /id="title-card"[^>]*background:#123456/);
    assert.match(html, /id="title-card"[^>]*padding:21.33px/);
    assert.match(html, /id="title-card"[^>]*border:7.11px solid #abcdef/);
    assert.match(html, /Hello title/);
    assert.doesNotMatch(html, /id="comment"[^>]*font-size:40px/);
    assert.doesNotMatch(html, /id="comment"[^>]*background:#123456/);
    assert.doesNotMatch(html, /id="meme-b"[^>]*font-size:40px/);
  });

  it("lets title-card move on preview and persist x/y", () => {
    const player = readFileSync(
      path.join(repoRoot, "renderer/features/preview/HyperframesPlayer.tsx"),
      "utf8"
    );
    assert.equal(
      canMoveClipOnPreview({ trackId: "title-card", kind: "title" }),
      true
    );
    assert.match(player, /TOPIC_TITLE_TRANSFORM_Y/);
    const project = createSpikeTimelineProject();
    project.clips.push({
      id: "title-card",
      trackId: "title-card",
      start: 0,
      duration: 2,
      trimIn: 0,
      sourceDuration: 2,
      file: "processed/topic-title-card.png",
      fadeIn: 0,
      fadeOut: 0,
      volume: 1,
      locked: false,
      label: "Title",
      kind: "title",
      x: 0,
      y: TOPIC_TITLE_TRANSFORM_Y
    });
    const moved = setClipPosition(project, "title-card", 0.15, -0.3);
    const clip = moved.clips.find((item) => item.id === "title-card");
    assert.equal(clip?.x, 0.15);
    assert.equal(clip?.y, -0.3);
  });

  it("slides title up the same full distance as meme overlays", () => {
    const titleRest = 40;
    const memeRest = 50;
    assert.equal(
      clipFlyUpTopPercent({ restTopPercent: titleRest, progress: 0 }) -
        titleRest,
      100
    );
    assert.equal(
      clipFlyUpTopPercent({ restTopPercent: memeRest, progress: 0 }) -
        memeRest,
      100
    );
    assert.equal(
      clipFlyUpTopPercent({ restTopPercent: titleRest, progress: 1 }),
      titleRest
    );
    const player = readFileSync(
      path.join(repoRoot, "renderer/features/preview/HyperframesPlayer.tsx"),
      "utf8"
    );
    const exporter = readFileSync(
      path.join(repoRoot, "src/export/video-exporter.ts"),
      "utf8"
    );
    assert.doesNotMatch(player, /mode: \"title\"/);
    assert.doesNotMatch(
      exporter,
      /canvasHeight - layer.height \/ 2/
    );
  });

  it("scales docked and fullscreen from the same 1080 canvas and copies editor x/y into ffmpeg", () => {
    assert.equal(previewStageScale(270), 270 / 1080);
    assert.equal(previewStageScale(1080), 1);
    assert.deepEqual(previewStageBoxStyle(0.25).width, 1080);
    assert.deepEqual(previewStageBoxStyle(0.25).height, 1920);
    assert.equal(OVERLAY_REFERENCE_WIDTH, 607.5);
    assert.equal(OVERLAY_CANVAS_PX_SCALE, 16 / 9);
    assert.equal(overlayCanvasPx(4), 4 * (16 / 9));
    assert.equal(topicTitleDisplayScale(270), 0.25);
    assert.equal(topicTitleDisplayScale(1080), 1);
    assert.equal(topicTitleExportScale(1080), 16 / 9);
    assert.equal(topicTitleExportScale(607.5), 16 / 9);
    const titleCard = readFileSync(
      path.join(repoRoot, "src/capcut/compile/title-card.ts"),
      "utf8"
    );
    assert.doesNotMatch(titleCard, /TOPIC_TITLE_MIN_HEIGHT/);
    assert.doesNotMatch(titleCard, /TOPIC_TITLE_LINE_HEIGHT/);
    assert.doesNotMatch(titleCard, /stroke-width/);
    assert.doesNotMatch(titleCard, /density: 96/);
    assert.match(titleCard, /resize\(cardWidth, cardHeight/);
    assert.match(titleCard, /overlayCanvasPx/);
    assert.doesNotMatch(titleCard, /16 \/ 9/);
    assert.deepEqual(
      wrapTopicTitle("một hai ba bốn năm sáu bảy tám", 8),
      ["một hai", "ba bốn", "năm sáu", "bảy tám"]
    );
    const exporter = readFileSync(
      path.join(repoRoot, "src/hyperframes/export.ts"),
      "utf8"
    );
    assert.match(exporter, /titleStyle,\s*timelineProject/s);
    const spec = applyTimelineProjectLayout(
      {
        name: "test",
        width: 1080,
        height: 1920,
        fps: 30,
        ratio: "9:16",
        tracks: [
          {
            type: "video",
            name: "topic-title-card",
            items: [{
              start: 0,
              duration: 2,
              path: "processed/topic-title-card.png",
              ref: "topic-title-card",
              scale: 1,
              x: 0,
              y: 0.2,
              flyUp: true
            }]
          },
          {
            type: "video",
            name: "overlays",
            items: [{
              start: 1.2,
              duration: 1,
              path: "C:/tmp/meme.png",
              ref: "overlay-comment-0-0",
              x: 0,
              y: 0,
              scale: 0.7
            }]
          }
        ]
      },
      {
        version: 1,
        canvas: { width: 1080, height: 1920, fps: 30 },
        totalDuration: 4,
        settings: DEFAULT_AUTO_FORMAT,
        clips: [
          {
            id: "title-card",
            trackId: "title-card",
            start: 0,
            duration: 2,
            trimIn: 0,
            sourceDuration: 2,
            file: "processed/topic-title-card.png",
            fadeIn: 0,
            fadeOut: 0,
            volume: 1,
            locked: false,
            label: "Title",
            kind: "title",
            x: 0.12,
            y: -0.4,
            scale: 0.5,
            animation: "slide-up",
            animationDuration: 0.4
          },
          {
            id: "meme-0",
            trackId: "meme",
            start: 1.2,
            duration: 1,
            trimIn: 0,
            sourceDuration: 1,
            file: "assets/meme.png",
            fadeIn: 0,
            fadeOut: 0,
            volume: 1,
            locked: false,
            label: "Meme",
            kind: "image",
            commentIndex: 0,
            x: -0.2,
            y: 0.35,
            scale: 0.55,
            animation: "slide-up",
            animationDuration: 0.5
          }
        ]
      }
    );
    const title = spec.tracks[0]?.items[0];
    const meme = spec.tracks[1]?.items[0];
    assert.equal(title?.x, 0.12);
    assert.equal(title?.y, -0.4);
    assert.equal(title?.scale, 0.625);
    assert.equal(title?.flyUp, true);
    assert.equal(title?.animationDuration, 0.4);
    assert.equal(meme?.x, -0.2);
    assert.equal(meme?.y, 0.35);
    assert.equal(meme?.scale, 0.55);
    assert.equal(meme?.flyUp, true);
    assert.equal(meme?.animationDuration, 0.5);
  });

  it("paints form px as CSS px at fullscreen while sharing the 1080 canvas", () => {
    const dockedWidth = 270;
    const fullscreenWidth = previewFullscreenFrameWidth(1920, 1080);
    const dockedBox = previewStageBoxStyle(previewStageScale(dockedWidth));
    const fullscreenBox = previewStageBoxStyle(
      previewStageScale(fullscreenWidth)
    );
    const nativeBox = previewStageBoxStyle(previewStageScale(1080));

    assert.equal(OVERLAY_REFERENCE_WIDTH, 607.5);
    assert.equal(OVERLAY_CANVAS_PX_SCALE, 16 / 9);
    assert.equal(overlayCanvasPx(4), 4 * (16 / 9));
    assert.equal(overlayCanvasPx(24), 24 * (16 / 9));
    assert.equal(topicTitleExportScale(1080), 16 / 9);
    assert.equal(topicTitleExportScale(fullscreenWidth), 16 / 9);
    assert.equal(
      overlayCanvasPx(4) * (fullscreenWidth / 1080),
      4
    );
    assert.equal(
      topicTitleDisplayScale(dockedWidth),
      previewStageScale(dockedWidth)
    );
    assert.equal(
      topicTitleDisplayScale(fullscreenWidth),
      previewStageScale(fullscreenWidth)
    );
    assert.equal(commentCaptureDisplayScale(dockedWidth), dockedWidth / 1080);
    assert.equal(dockedBox.width, 1080);
    assert.equal(dockedBox.height, 1920);
    assert.equal(fullscreenBox.width, 1080);
    assert.equal(fullscreenBox.height, 1920);
    assert.equal(nativeBox.width, 1080);
    assert.equal(nativeBox.transform, "scale(1)");
    assert.equal(dockedBox.transform, `scale(${dockedWidth / 1080})`);
    assert.equal(
      fullscreenBox.transform,
      `scale(${fullscreenWidth / 1080})`
    );
    assert.notEqual(dockedBox.transform, fullscreenBox.transform);

    const titleStyle = {
      background: "#123456",
      border: 4,
      borderColor: "#abcdef",
      radius: 16,
      padding: 12,
      fontFamily: "Arial, sans-serif",
      fontSize: 40,
      color: "#fedcba"
    };
    const css = topicTitleCardStyle(titleStyle);
    const metrics = topicTitleCardMetrics("Hello title", titleStyle);
    assert.equal(css.fontSize, "71.11px");
    assert.equal(css.padding, "21.33px");
    assert.equal(css.border, "7.11px solid #abcdef");
    assert.equal(css.borderRadius, "28.44px");
    assert.equal(metrics.fontSize, overlayCanvasPx(40));
    assert.equal(metrics.padding, overlayCanvasPx(12));
    assert.equal(metrics.border, overlayCanvasPx(4));
    assert.equal(metrics.radius, overlayCanvasPx(16));
    assert.equal(metrics.cardWidth, 864);
    assert.equal(
      css.fontSize,
      `${Math.round(metrics.fontSize * 100) / 100}px`
    );
    assert.equal(
      css.padding,
      `${Math.round(metrics.padding * 100) / 100}px`
    );

    const captureCss = commentCaptureCardStyle({
      radius: 8,
      border: 4,
      borderColor: "#112233",
      shadow: 9,
      shadowColor: "#000000"
    });
    assert.equal(captureCss.borderRadius, "14.22px");
    assert.equal(captureCss.border, "7.11px solid #112233");
    assert.equal(captureCss.boxShadow, "0 5.33px 16px #000000");

    const project = createSpikeTimelineProject();
    project.clips.push({
      id: "title-card",
      trackId: "title-card",
      start: 0,
      duration: 2,
      trimIn: 0,
      sourceDuration: 2,
      file: "processed/topic-title-card.png",
      fadeIn: 0,
      fadeOut: 0,
      volume: 1,
      locked: false,
      label: "Hello title",
      kind: "title"
    });
    const html = compileTimelineProject(project, {
      captureStyle: {
        radius: 8,
        border: 2,
        borderColor: "#112233",
        shadow: 9,
        shadowColor: "#000000"
      },
      titleStyle
    });
    assert.match(html, /id="title-card"[^>]*font-size:71.11px/);
    assert.match(html, /id="title-card"[^>]*padding:21.33px/);
    assert.match(html, /id="title-card"[^>]*border:7.11px solid #abcdef/);
    assert.match(html, /id="comment"[^>]*border-radius:14.22px/);
    assert.match(html, /id="comment"[^>]*border:3.56px solid #112233/);

    const player = readFileSync(
      path.join(repoRoot, "renderer/features/preview/HyperframesPlayer.tsx"),
      "utf8"
    );
    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/custom/CustomWorkspace.tsx"),
      "utf8"
    );
    const compile = readFileSync(
      path.join(repoRoot, "src/hyperframes/compile.ts"),
      "utf8"
    );
    const previewCompile = readFileSync(
      path.join(repoRoot, "renderer/features/preview/compile-hyperframes.ts"),
      "utf8"
    );
    const processImage = readFileSync(
      path.join(repoRoot, "src/process-image.ts"),
      "utf8"
    );
    const titleCard = readFileSync(
      path.join(repoRoot, "src/capcut/compile/title-card.ts"),
      "utf8"
    );
    const timeline = readFileSync(
      path.join(repoRoot, "renderer/features/preview/preview-timeline.ts"),
      "utf8"
    );
    assert.match(player, /previewStageBoxStyle/);
    assert.match(player, /previewStageScale/);
    assert.match(player, /topicTitleCardStyle\(titleStyle\)/);
    assert.match(player, /commentCaptureCardStyle\(captureStyle\)/);
    assert.match(workspace, /topicTitleCardStyle\(style\)/);
    assert.match(workspace, /commentCaptureCardStyle\(style\)/);
    assert.match(workspace, /previewStageBoxStyle\(displayScale\)/);
    assert.match(workspace, /COMMENT_PREVIEW_WIDTH_FRACTION/);
    const captureImage = readFileSync(
      path.join(repoRoot, "renderer/features/custom/CaptureStyleImage.tsx"),
      "utf8"
    );
    assert.match(captureImage, /commentCaptureCardStyle\(captureStyle, scale\)/);
    const captureStyleSource = readFileSync(
      path.join(repoRoot, "src/capture-style.ts"),
      "utf8"
    );
    assert.match(captureStyleSource, /overlayCanvasPx/);
    assert.match(captureStyleSource, /COMMENT_OVERLAY_PX_SCALE = 16 \/ 9/);
    assert.doesNotMatch(captureStyleSource, /topic-title-style/);
    assert.match(compile, /topicTitleCssText\(titleStyle \?\? DEFAULT_TOPIC_TITLE_STYLE\)/);
    assert.match(compile, /commentCaptureCssText\(captureStyle\)/);
    assert.match(previewCompile, /topicTitleCssText\(titleStyle \?\? DEFAULT_TOPIC_TITLE_STYLE\)/);
    assert.match(processImage, /overlayCanvasPx\(value\)/);
    assert.match(titleCard, /overlayCanvasPx\(style\.fontSize\)/);
    assert.match(titleCard, /resize\(cardWidth, cardHeight/);
    assert.doesNotMatch(titleCard, /density: 96/);
    assert.doesNotMatch(player, /CANVAS_CSS_PX_SCALE/);
    assert.doesNotMatch(workspace, /CANVAS_CSS_PX_SCALE/);
    assert.doesNotMatch(compile, /CANVAS_CSS_PX_SCALE/);
    assert.doesNotMatch(previewCompile, /CANVAS_CSS_PX_SCALE/);
    assert.doesNotMatch(timeline, /CANVAS_CSS_PX_SCALE/);
    assert.doesNotMatch(processImage, /16 \/ 9/);
  });
});

describe("meme default style", () => {
  it("clamps x, y, scale and fade in", () => {
    assert.deepEqual(clampMemeDefaultStyle(undefined), DEFAULT_MEME_STYLE);
    assert.equal(DEFAULT_MEME_STYLE.x, 0);
    assert.equal(DEFAULT_MEME_STYLE.y, 0);
    assert.equal(DEFAULT_MEME_STYLE.scale, 1);
    assert.equal(DEFAULT_MEME_STYLE.fadeIn, 0);
    assert.deepEqual(
      clampMemeDefaultStyle({
        x: 4,
        y: -3,
        scale: 0.05,
        fadeIn: -1
      }),
      {
        x: 1,
        y: -1,
        scale: 0.2,
        fadeIn: 0
      }
    );
    assert.deepEqual(
      clampMemeDefaultStyle({
        x: 0.25,
        y: -0.4,
        scale: 2,
        fadeIn: 9
      }),
      {
        x: 0.25,
        y: -0.4,
        scale: 1.2,
        fadeIn: 5
      }
    );
  });

  it("renders Meme controls and live preview", () => {
    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/custom/CustomWorkspace.tsx"),
      "utf8"
    );
    const tabs = readFileSync(
      path.join(repoRoot, "renderer/features/custom/custom-tabs.ts"),
      "utf8"
    );
    assert.match(tabs, /id: "meme"/);
    assert.match(tabs, /Meme/);
    assert.match(tabs, /id: "comment-capture"/);
    assert.doesNotMatch(tabs, /id: "images"/);
    assert.match(tabs, /id: "watermark"/);
    assert.match(tabs, /Watermark/);
    assert.match(workspace, /meme: next/);
    assert.match(workspace, /MEME_STYLE_CHANGED/);
    assert.match(workspace, /IMAGE_EFFECT_CHANGED/);
    assert.match(workspace, /WATERMARK_STYLE_CHANGED/);
    assert.match(workspace, /id="image-entrance"/);
    assert.match(workspace, /id="watermark-text"/);
    assert.match(workspace, /id="meme-x"/);
    assert.match(workspace, /id="meme-y"/);
    assert.match(workspace, /id="meme-scale"/);
    assert.match(workspace, /id="meme-fade-in"/);
    assert.match(workspace, /overlayRestLeftPercent\(style\.x\)/);
    assert.match(workspace, /overlayRestTopPercent\(style\.y\)/);
    assert.match(workspace, /listAssets/);
    assert.match(workspace, /getAssetPreview/);
    assert.match(workspace, /pickPreviewMeme/);
    assert.match(workspace, /alt="Preview meme"/);
  });

  it("picks a sample library image for the meme preview", () => {
    const happy = {
      id: "happy-sample",
      type: "meme",
      mediaKind: "image",
      file: "assets/memes/happy/_sample.jpg"
    };
    const angry = {
      id: "angry-sample",
      type: "meme",
      mediaKind: "image",
      file: "assets/memes/angry/_sample.jpg"
    };
    const video = {
      id: "video-meme",
      type: "meme",
      mediaKind: "video",
      file: "assets/memes/video/clip.mp4"
    };
    const other = {
      id: "laughing-01",
      type: "meme",
      mediaKind: "image",
      file: "assets/memes/laughing/laughing-01.jpg"
    };
    assert.equal(
      pickPreviewMeme([video, other, angry, happy])?.id,
      "happy-sample"
    );
    assert.equal(pickPreviewMeme([video, other, angry])?.id, "angry-sample");
    assert.equal(pickPreviewMeme([video, other])?.id, "laughing-01");
    assert.equal(pickPreviewMeme([video]), undefined);
  });

  it("applies custom layout to none combos and keeps punch fade in", () => {
    const defaults = {
      x: 0.2,
      y: -0.1,
      scale: 0.8,
      fadeIn: 0.15
    };
    const none = applyMemeDefaultLayout(
      applyCombo({ file: "meme.png" }, getBuiltinCombo("none")),
      defaults,
      { keepComboFadeIn: false }
    );
    assert.equal(none.x, 0.2);
    assert.equal(none.y, -0.1);
    assert.equal(none.scale, 0.8);
    assert.equal(none.fadeIn, 0.15);

    const punch = applyCombo({ file: "meme.png" }, getBuiltinCombo("punch"));
    const laid = applyMemeDefaultLayout(punch, defaults, {
      keepComboFadeIn: true
    });
    assert.equal(laid.x, 0.2);
    assert.equal(laid.y, -0.1);
    assert.equal(laid.scale, 0.8);
    assert.equal(laid.fadeIn, punch.fadeIn);
    assert.equal(laid.animation, "zoom-in");
  });
});

describe("voice assignment", () => {
  it("updates topic, title, and comment voices without touching the others", () => {
    const base = analysis({
      topicVoiceId: "a",
      topicTitleVoiceId: "b",
      reactions: [
        {
          commentIndex: 0,
          voiceId: "c",
          emotion: "happy",
          memeCategory: null,
          sfxCategory: null,
          animation: "none",
          duration: 1
        },
        {
          commentIndex: 1,
          voiceId: "d",
          emotion: "sad",
          memeCategory: null,
          sfxCategory: null,
          animation: "none",
          duration: 1
        }
      ]
    });

    assert.equal(
      withVoiceAssignment(base, "topic", "ngoc-huyen").topicVoiceId,
      "ngoc-huyen"
    );
    assert.equal(
      withVoiceAssignment(base, "topic-title", "nam-khang").topicTitleVoiceId,
      "nam-khang"
    );
    const commentVoice = withVoiceAssignment(base, "comment-1", "minh-hoang");
    assert.equal(commentVoice.reactions[0].voiceId, "c");
    assert.equal(commentVoice.reactions[1].voiceId, "minh-hoang");
  });

  it("assigns a comment voice before any AI voice step has run", () => {
    const seeded = createDefaultAnalysis({
      topicTitle: "Hello",
      comments: [comment("one"), comment("two")]
    });
    const next = withVoiceAssignment(seeded, "comment-1", "minh-hoang");
    assert.equal(next.reactions[1]?.voiceId, "minh-hoang");

    const empty = analysis({ reactions: [] });
    const created = withVoiceAssignment(empty, "comment-0", "nam-khang");
    assert.equal(created.reactions[0]?.commentIndex, 0);
    assert.equal(created.reactions[0]?.voiceId, "nam-khang");
  });
});

describe("capture comment order", () => {
  it("reorders sibling comments and keeps image slots aligned", () => {
    const comments = [
      comment("one"),
      comment("two"),
      comment("three")
    ];
    const next = reorderComments(comments, [0, 1, 2], 0, 2);
    assert.deepEqual(
      next.comments.map((item) => item.author),
      ["two", "three", "one"]
    );
    assert.deepEqual(next.imageSlots, [1, 2, 0]);
  });

  it("does not move a reply onto a different parent", () => {
    const comments = [
      comment("root"),
      comment("reply", { parentCommentIndex: 0 })
    ];
    const next = reorderComments(comments, [0, 1], 1, 0);
    assert.equal(next.comments[0].author, "root");
    assert.equal(next.comments[1].author, "reply");
  });

  it("builds a forest with replies under their parent", () => {
    const forest = buildCommentForest([
      comment("root"),
      comment("reply", { parentCommentIndex: 0 })
    ]);
    assert.equal(forest.length, 1);
    assert.equal(forest[0].children.length, 1);
    assert.equal(forest[0].children[0].index, 1);
  });

  it("groups two root comments under the first selected", () => {
    const comments = [
      comment("parent"),
      comment("child")
    ];
    const next = groupCommentsAsThread(
      comments,
      [0, 1],
      [0, 1]
    );
    assert.equal(next.comments[0]?.parentCommentIndex, undefined);
    assert.equal(next.comments[1]?.parentCommentIndex, 0);
    assert.deepEqual(next.imageSlots, [0, 1]);
    const forest = buildCommentForest(next.comments);
    assert.equal(forest.length, 1);
    assert.equal(forest[0]?.children[0]?.index, 1);
  });

  it("keeps an existing reply nested instead of flattening it", () => {
    const comments = [
      comment("parent"),
      comment("reply", { parentCommentIndex: 0 }),
      comment("other")
    ];
    const next = groupCommentsAsThread(
      comments,
      [0, 1, 2],
      [0, 1, 2]
    );
    assert.equal(next.comments[1]?.parentCommentIndex, 0);
    assert.equal(next.comments[2]?.parentCommentIndex, 0);
    const forest = buildCommentForest(next.comments);
    assert.equal(forest.length, 1);
    assert.deepEqual(
      forest[0]?.children.map((node) => node.index),
      [1, 2]
    );
  });

  it("keeps a reply under its selected parent instead of flattening onto the group parent", () => {
    const comments = [
      comment("group-parent"),
      comment("child"),
      comment("grandchild", { parentCommentIndex: 1 })
    ];
    const next = groupCommentsAsThread(
      comments,
      [0, 1, 2],
      [0, 1, 2]
    );
    assert.equal(next.comments[1]?.parentCommentIndex, 0);
    assert.equal(next.comments[2]?.parentCommentIndex, 1);
  });

  it("inverts a reply into the parent when the reply is selected first", () => {
    const comments = [
      comment("old-parent"),
      comment("reply", { parentCommentIndex: 0 })
    ];
    const next = groupCommentsAsThread(
      comments,
      [0, 1],
      [1, 0]
    );
    assert.equal(next.comments[1]?.parentCommentIndex, undefined);
    assert.equal(next.comments[0]?.parentCommentIndex, 1);
    const forest = buildCommentForest(next.comments);
    assert.equal(forest.length, 1);
    assert.equal(forest[0]?.index, 1);
    assert.equal(forest[0]?.children[0]?.index, 0);
  });

  it("does not attach a comment to itself and keeps image slots", () => {
    const comments = [
      comment("one"),
      comment("two")
    ];
    const same = groupCommentsAsThread(
      comments,
      [3, 7],
      [0, 0]
    );
    assert.equal(same.comments[0]?.parentCommentIndex, undefined);
    assert.equal(same.comments[1]?.parentCommentIndex, undefined);
    assert.deepEqual(same.imageSlots, [3, 7]);
  });
});

describe("analyze freshness", () => {
  it("is stale when a reaction points at an excluded comment", () => {
    assert.equal(
      isAnalysisStale(
        {
          comments: [
            comment("keep"),
            comment("drop", { excluded: true })
          ]
        },
        analysis({
          reactions: [
            {
              commentIndex: 1,
              emotion: "neutral",
              memeCategory: null,
              sfxCategory: null,
              animation: "none",
              duration: 1
            }
          ]
        })
      ),
      true
    );
  });

  it("is fresh when every included comment in range has a reaction", () => {
    assert.equal(
      isAnalysisStale(
        { comments: [comment("a"), comment("b")] },
        analysis({
          reactions: [
            {
              commentIndex: 0,
              emotion: "neutral",
              memeCategory: null,
              sfxCategory: null,
              animation: "none",
              duration: 1
            },
            {
              commentIndex: 1,
              emotion: "happy",
              memeCategory: null,
              sfxCategory: null,
              animation: "none",
              duration: 1
            }
          ]
        })
      ),
      false
    );
  });
});

describe("topic title helpers", () => {
  it("trims and caps topic title length", () => {
    assert.equal(normalizeTopicTitle("  hello  "), "hello");
    assert.equal(
      normalizeTopicTitle("x".repeat(TOPIC_TITLE_MAX_LENGTH + 10)).length,
      TOPIC_TITLE_MAX_LENGTH
    );
    assert.equal(isTopicTitleMissing("  "), true);
    assert.equal(isTopicTitleMissing(undefined), true);
    assert.equal(isTopicTitleMissing("Hello"), false);
    assert.equal(isTopicTitleMissing("\n\t"), true);
  });

  it("reads the title only when the user turns it on", () => {
    assert.equal(
      resolveTopicTitleVoiceEnabled({ topicTitleVoiceMode: "on" }),
      true
    );
    assert.equal(
      resolveTopicTitleVoiceEnabled({ topicTitleVoiceMode: "off" }),
      false
    );
    assert.equal(
      resolveTopicTitleVoiceEnabled({ topicTitleVoiceMode: "auto" }),
      false
    );
    assert.equal(resolveTopicTitleVoiceEnabled({}), false);
    assert.equal(resolveTopicTitleVoiceEnabled(undefined), false);
  });

  it("falls back to content title, then post text, then a default", () => {
    assert.equal(
      resolveTimelineTopicTitle("  From analysis  ", "content", "post"),
      "From analysis"
    );
    assert.equal(
      resolveTimelineTopicTitle("  ", "Content title", "post"),
      "Content title"
    );
    assert.equal(
      resolveTimelineTopicTitle("", "", "A short post"),
      "A short post"
    );
    assert.equal(resolveTimelineTopicTitle("", "", ""), DEFAULT_TOPIC_TITLE);
    assert.equal(
      resolveTimelineTopicTitle(undefined, undefined, "x".repeat(90)).length,
      TOPIC_TITLE_MAX_LENGTH
    );
  });
});

describe("image entrance effect", () => {
  it("defaults to none and clamps unknown entrances", () => {
    assert.equal(DEFAULT_IMAGE_EFFECT.entrance, "none");
    assert.equal(DEFAULT_IMAGE_EFFECT.duration, 0.35);
    assert.deepEqual(clampImageEffectStyle(undefined), DEFAULT_IMAGE_EFFECT);
    assert.equal(
      clampImageEffectStyle({ entrance: "spin", duration: 9 }).entrance,
      "none"
    );
    assert.equal(
      clampImageEffectStyle({ entrance: "pop", duration: 0.01 }).duration,
      0.08
    );
  });

  it("computes zoom, pop, fade, and four slide directions", () => {
    assert.equal(imageEffectScale("zoom-in", 0), ZOOM_IN_FROM);
    assert.equal(imageEffectScale("zoom-in", 1), 1);
    assert.equal(imageEffectPopScale(0), POP_FROM);
    assert.equal(imageEffectPopScale(0.7), POP_PEAK);
    assert.equal(imageEffectPopScale(1), 1);
    assert.equal(imageEffectOpacity("fade", 0), 0);
    assert.equal(imageEffectOpacity("fade", 1), 1);
    assert.equal(imageEffectOpacity("none", 0), 1);
    assert.equal(imageEffectTopPercent("slide-up", 50, 0), 150);
    assert.equal(imageEffectTopPercent("slide-up", 50, 1), 50);
    assert.equal(imageEffectTopPercent("slide-down", 50, 0), -50);
    assert.equal(imageEffectTopPercent("slide-down", 50, 1), 50);
    assert.equal(imageEffectLeftPercent("slide-left", 50, 0), -50);
    assert.equal(imageEffectLeftPercent("slide-left", 50, 1), 50);
    assert.equal(imageEffectLeftPercent("slide-right", 50, 0), 150);
    assert.equal(imageEffectLeftPercent("slide-right", 50, 1), 50);
  });

  it("lets a comment clip override the global entrance", () => {
    const global = clampImageEffectStyle({
      entrance: "zoom-in",
      duration: 0.4
    });
    assert.deepEqual(
      resolveClipImageEffect(
        { trackId: "images" },
        global
      ),
      global
    );
    assert.deepEqual(
      resolveClipImageEffect(
        {
          trackId: "images",
          animation: "pop",
          animationDuration: 0.2
        },
        global
      ),
      { entrance: "pop", duration: 0.2 }
    );
    assert.equal(
      resolveClipImageEffect(
        { trackId: "images", animation: "none" },
        global
      ).entrance,
      "none"
    );
    assert.equal(
      clipAnimationLabel({
        trackId: "images",
        animation: "slide-down",
        animationDuration: 0.3
      }),
      "Slide down"
    );

    const project = createEmptyTimelineProject();
    project.clips = [
      sceneClip({
        id: "img-0",
        trackId: "images",
        start: 0,
        duration: 3,
        commentIndex: 0
      })
    ];
    const next = setClipImageEffect(project, "img-0", {
      entrance: "slide-left",
      duration: 0.5
    });
    const clip = next.clips[0];
    assert.equal(clip?.animation, "slide-left");
    assert.equal(clip?.animationDuration, 0.5);
    assert.equal(
      setClipImageEffect(project, "voice-0", {
        entrance: "pop",
        duration: 0.2
      }),
      project
    );

    const spec = applyImageEffectToSpec(
      {
        name: "test",
        width: 1080,
        height: 1920,
        fps: 30,
        ratio: "9:16",
        tracks: [
          {
            type: "video",
            name: "images",
            items: [
              { start: 0, duration: 3, path: "img-0.bin", type: "photo" }
            ]
          }
        ]
      },
      global,
      next
    );
    assert.equal(spec.tracks[0]?.items[0]?.entrance, "slide-left");
    assert.equal(spec.tracks[0]?.items[0]?.animationDuration, 0.5);

    const source = timeline();
    const built = videoTimelineToProject(source);
    const image = built.clips.find((item) => item.trackId === "images");
    assert.ok(image);
    image.animation = "pop";
    image.animationDuration = 0.22;
    const rebuilt = videoTimelineToProject(source, built);
    const kept = rebuilt.clips.find((item) => item.id === image.id);
    assert.equal(kept?.animation, "pop");
    assert.equal(kept?.animationDuration, 0.22);

    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/preview/TimelineWorkspace.tsx"),
      "utf8"
    );
    assert.match(workspace, /id="clip-image-entrance"/);
    assert.match(workspace, /id="clip-image-duration"/);
    assert.match(workspace, /setClipImageEffect/);
  });
});

describe("watermark drift", () => {
  it("clamps text and keeps ping-pong inside the frame", () => {
    assert.equal(DEFAULT_WATERMARK_STYLE.text, "");
    assert.equal(watermarkHasText(DEFAULT_WATERMARK_STYLE), false);
    const style = clampWatermarkStyle({
      text: "X".repeat(100),
      fontSize: 4,
      blur: 90,
      speed: 10,
      color: "red"
    });
    assert.equal(style.text.length, 80);
    assert.equal(style.fontSize, 12);
    assert.equal(style.blur, 24);
    assert.equal(watermarkOpacity(DEFAULT_WATERMARK_STYLE), 1);
    assert.equal(watermarkOpacity({ ...DEFAULT_WATERMARK_STYLE, blur: 12 }), 0.5);
    assert.equal(watermarkOpacity(style), 0);
    assert.match(
      watermarkCssText({ ...DEFAULT_WATERMARK_STYLE, text: "x", blur: 12 }),
      /opacity:0.5/
    );
    assert.doesNotMatch(
      watermarkCssText({ ...DEFAULT_WATERMARK_STYLE, text: "x", blur: 12 }),
      /filter:blur/
    );
    assert.equal(style.speed, 40);
    assert.equal(style.color, DEFAULT_WATERMARK_STYLE.color);

    const moving = clampWatermarkStyle({
      text: "XamXiXiu",
      fontSize: 32,
      speed: 80
    });
    const canvas = { width: 1080, height: 1920 };
    const size = watermarkTextSize(moving);
    for (let time = 0; time <= 20; time += 0.25) {
      const point = watermarkPoint(time, moving, canvas);
      assert.ok(point.x >= size.pad - 0.001);
      assert.ok(point.y >= size.pad - 0.001);
      assert.ok(point.x + size.width <= canvas.width - size.pad + 0.001);
      assert.ok(point.y + size.height <= canvas.height - size.pad + 0.001);
    }
  });

  it("changes direction after hitting an edge", () => {
    assert.equal(pingPong(100, 50, 0), 0);
    assert.equal(pingPong(100, 50, 2), 100);
    assert.equal(pingPong(100, 50, 3), 50);
    const moving = clampWatermarkStyle({
      text: "XamXiXiu",
      fontSize: 32,
      speed: 80
    });
    const canvas = { width: 1080, height: 1920 };
    const travel = watermarkTravel(moving, canvas);
    const bounceX = travel.travelX / travel.vx;
    const before = watermarkPoint(bounceX - 0.2, moving, canvas);
    const peak = watermarkPoint(bounceX, moving, canvas);
    const after = watermarkPoint(bounceX + 0.2, moving, canvas);
    assert.ok(before.x < peak.x);
    assert.ok(after.x < peak.x);
  });

  it("hides the watermark lane because it comes from settings, not the project file", () => {
    const project = createEmptyTimelineProject();
    project.totalDuration = 8;
    const tracks = getProjectTracks(project);
    assert.equal(tracks.some((track) => track.id === "watermark"), false);
    assert.equal(isEditorTimelineTrack("watermark"), false);
    assert.equal(isEditorTimelineTrack("voice"), true);
    assert.equal(
      clipCanRemove({ trackId: "watermark", locked: true }),
      false
    );
    assert.equal(project.clips.some((clip) => clip.trackId === "watermark"), false);
  });
});

describe("timeline tracks", () => {
  it("exposes the track ids including beep", () => {
    assert.deepEqual([...TRACK_IDS], [
      "background",
      "title-card",
      "images",
      "meme",
      "sfx",
      "video",
      "watermark",
      "voice",
      "beep",
      "music"
    ]);
    assert.equal(TRACK_LABELS.voice, "Voice");
    assert.equal(TRACK_LABELS.beep, "Beep");
    assert.equal(TRACK_LABELS.watermark, "Watermark");
    assert.equal(
      TRACK_IDS.filter(isEditorTimelineTrack).includes("watermark"),
      false
    );
    assert.equal(trackLaneHeight("meme"), 44);
    assert.equal(trackLaneHeight("images"), 44);
    assert.equal(trackLaneHeight("watermark"), 44);
    assert.equal(trackLaneHeight("voice"), 44);
    assert.equal(trackLaneHeight("sfx"), 44);
    assert.equal(waveformBarCount(64), 32);
    assert.equal(waveformBarCount(0), 0);
    assert.deepEqual(sampleWaveformPeaks([0.2, 1, 0.4, 0.8], 2), [1, 0.8]);
    assert.equal(waveformBarHeightPercent(0), 14);
    assert.equal(waveformBarHeightPercent(1), 96);
    const tracksSource = readFileSync(
      path.join(repoRoot, "renderer/features/preview/TimelineTracks.tsx"),
      "utf8"
    );
    assert.match(tracksSource, /waveformBarHeightPercent/);
    assert.match(tracksSource, /flex items-end justify-between/);
    assert.doesNotMatch(tracksSource, /peaks\.slice\(0, 24\)/);
  });

  it("classifies video files and clip labels", () => {
    assert.equal(isVideoAsset("reaction.mp4"), true);
    assert.equal(isVideoAsset("meme.png"), false);
    assert.equal(formatClipLabel("folder/boom.mp3"), "boom.mp3");
    assert.equal(formatClipLabel(undefined), "+");
  });

  it("maps a timeline into editable clips without dropping seekable duration", () => {
    const tracks = getTimelineTracks(timeline());
    const byId = Object.fromEntries(
      tracks.map((track) => [track.id, track])
    );
    assert.equal(byId.background.clips[0]?.file, "bg.mp4");
    assert.equal(byId.music.clips[0]?.editable, true);
    assert.equal(byId.images.clips.length, 2);
    assert.equal(byId.voice.clips.length, 2);
    const meme = byId.meme.clips.find((clip) => clip.file === "meme.png");
    assert.equal(meme?.editable, true);
    assert.deepEqual(meme?.target, {
      kind: "meme",
      commentIndex: 0,
      clipId: meme?.id
    });
    const sfx = byId.sfx.clips.find((clip) => clip.file === "boom.mp3");
    assert.deepEqual(sfx?.target, {
      kind: "sfx",
      commentIndex: 0,
      clipId: sfx?.id
    });
  });

  it("only allows removing meme, video, sfx, topic, and beep clips", () => {
    assert.equal(canRemoveTimelineAsset({ kind: "background" }), false);
    assert.equal(canRemoveTimelineAsset({ kind: "music" }), false);
    assert.equal(canRemoveTimelineAsset({ kind: "meme", commentIndex: 0 }), true);
    assert.equal(canRemoveTimelineAsset({ kind: "video", commentIndex: 0 }), true);
    assert.equal(canRemoveTimelineAsset({ kind: "sfx", commentIndex: 0 }), true);
    assert.equal(canRemoveTimelineAsset({ kind: "topic-title" }), true);
    assert.equal(
      clipCanRemove({
        trackId: "beep",
        placeholder: false
      }),
      true
    );
    assert.equal(
      clipCanRemove({
        trackId: "beep",
        placeholder: false,
        locked: true
      }),
      false
    );
    assert.equal(
      clipCanRemove({
        trackId: "voice",
        placeholder: false
      }),
      false
    );
  });

  it("keeps a minimum clip bar width", () => {
    assert.equal(clipBarWidth(0.2, 64), 18);
    assert.equal(clipBarWidth(2, 64), 128);
  });

  it("labels the settings choose button from the clip target", () => {
    assert.equal(clipChooseLabel({ kind: "meme", commentIndex: 0 }), "Chọn meme");
    assert.equal(
      clipChooseLabel({ kind: "video", commentIndex: 0 }),
      "Chọn video"
    );
    assert.equal(clipChooseLabel({ kind: "sfx", commentIndex: 0 }), "Chọn SFX");
    assert.equal(clipChooseLabel({ kind: "topic-meme" }), "Chọn topic meme");
    assert.equal(clipChooseLabel({ kind: "topic-title" }), "Sửa title");
    assert.equal(clipChooseLabel({ kind: "background" }), "Chọn background");
    assert.equal(
      clipHasAssetPickerTarget({ target: { kind: "meme", commentIndex: 0 } }),
      true
    );
    assert.equal(clipHasAssetPickerTarget({ target: { kind: "music" } }), true);
    assert.equal(clipHasAssetPickerTarget({}), false);
  });

  it("treats a tap as click and a longer pointer move as drag", () => {
    assert.equal(clipPointerIntent(100, 102), "click");
    assert.equal(clipPointerIntent(100, 104), "drag");
    assert.equal(clipPointerIntent(100, 90), "drag");
  });

  it("maps project clips so background, video, meme, and sfx can be replaced", () => {
    const source = timeline();
    const comment = source.scenes[1];
    if (comment) {
      comment.overlays = [
        { type: "meme", file: "meme.png", start: 1.5, duration: 0.5 },
        { type: "meme", file: "react.mp4", start: 1.6, duration: 0.4 },
        { type: "sfx", file: "boom.mp3", start: 1.5, duration: 0.4 }
      ];
    }
    const tracks = getProjectTracks(videoTimelineToProject(source));
    const byId = Object.fromEntries(
      tracks.map((track) => [track.id, track])
    );
    const background = byId.background?.clips[0];
    const meme = byId.meme?.clips.find((clip) => clip.file === "meme.png");
    const video = byId.video?.clips.find((clip) => clip.file === "react.mp4");
    const sfx = byId.sfx?.clips.find((clip) => clip.file === "boom.mp3");
    const voice = byId.voice?.clips[0];

    assert.deepEqual(background?.target, { kind: "background" });
    assert.equal(clipOpensAssetPicker(background!), true);
    assert.equal(canRemoveTimelineAsset(background!.target!), false);

    assert.deepEqual(meme?.target, {
      kind: "meme",
      commentIndex: 0,
      clipId: meme?.id
    });
    assert.equal(clipOpensAssetPicker(meme!), true);
    assert.equal(canRemoveTimelineAsset(meme!.target!), true);

    assert.deepEqual(video?.target, {
      kind: "video",
      commentIndex: 0,
      clipId: video?.id
    });
    assert.equal(clipOpensAssetPicker(video!), true);
    assert.equal(canRemoveTimelineAsset(video!.target!), true);

    assert.deepEqual(sfx?.target, {
      kind: "sfx",
      commentIndex: 0,
      clipId: sfx?.id
    });
    assert.equal(clipOpensAssetPicker(sfx!), true);
    assert.equal(canRemoveTimelineAsset(sfx!.target!), true);
    assert.equal(
      byId.meme?.clips.some((clip) => clip.id === "meme-add-0" && clip.placeholder),
      true
    );
    assert.equal(
      byId.video?.clips.some((clip) => clip.id === "video-add-0" && clip.placeholder),
      true
    );
    assert.equal(
      byId.sfx?.clips.some((clip) => clip.id === "sfx-add-0" && clip.placeholder),
      true
    );

    assert.equal(clipOpensAssetPicker(voice!), false);
    assert.equal(
      clipOpensAssetPicker({
        editable: true,
        locked: true,
        target: { kind: "meme", commentIndex: 0 }
      }),
      false
    );
    assert.deepEqual(
      targetFromProjectClip({
        id: "video-1",
        trackId: "video",
        start: 0,
        duration: 1,
        trimIn: 0,
        sourceDuration: 1,
        file: "react.mp4",
        fadeIn: 0,
        fadeOut: 0,
        volume: 1,
        locked: false,
        label: "Video",
        kind: "video",
        commentIndex: 2
      }),
      { kind: "video", commentIndex: 2, clipId: "video-1" }
    );
  });

  it("adds meme, video, and sfx placeholders after each comment voice", () => {
    const source = timeline();
    const comment = source.scenes[1];
    if (comment) {
      comment.overlays = [];
    }
    const tracks = getProjectTracks(videoTimelineToProject(source));
    const byId = Object.fromEntries(
      tracks.map((track) => [track.id, track])
    );
    const memeAdd = byId.meme?.clips.find((clip) => clip.id === "meme-add-0");
    const videoAdd = byId.video?.clips.find((clip) => clip.id === "video-add-0");
    const sfxAdd = byId.sfx?.clips.find((clip) => clip.id === "sfx-add-0");
    const titleAdd = byId["title-card"]?.clips.find(
      (clip) => clip.id === "title-card-add"
    );
    const topicAdd = byId.meme?.clips.find(
      (clip) => clip.id === "topic-meme-add"
    );

    assert.equal(memeAdd?.placeholder, true);
    assert.deepEqual(memeAdd?.target, { kind: "meme", commentIndex: 0 });
    assert.equal(videoAdd?.placeholder, true);
    assert.deepEqual(videoAdd?.target, { kind: "video", commentIndex: 0 });
    assert.equal(sfxAdd?.placeholder, true);
    assert.deepEqual(sfxAdd?.target, { kind: "sfx", commentIndex: 0 });
    assert.equal(titleAdd?.placeholder, true);
    assert.deepEqual(titleAdd?.target, { kind: "topic-title" });
    assert.equal(topicAdd?.placeholder, true);
    assert.deepEqual(topicAdd?.target, { kind: "topic-meme" });
    assert.equal(clipOpensAssetPicker(memeAdd!), true);
    assert.equal(clipCanRemove(memeAdd!), false);
    assert.equal(clipHasAssetPickerTarget(memeAdd!), true);
    const project = videoTimelineToProject(source);
    assert.equal(findTrackClip(project, "meme-add-0")?.placeholder, true);
    assert.equal(findTrackClip(project, "missing"), undefined);
  });

  it("adds meme, video, and sfx placeholders after the topic voice", () => {
    const tracks = getProjectTracks(videoTimelineToProject(timeline()));
    const byId = Object.fromEntries(
      tracks.map((track) => [track.id, track])
    );
    const memeAdd = byId.meme?.clips.find((clip) => clip.id === "meme-add-topic");
    const videoAdd = byId.video?.clips.find(
      (clip) => clip.id === "video-add-topic"
    );
    const sfxAdd = byId.sfx?.clips.find((clip) => clip.id === "sfx-add-topic");
    const topicVoice = byId.voice?.clips.find((clip) =>
      clip.id.startsWith("voice-topic")
    );

    assert.equal(memeAdd?.placeholder, true);
    assert.deepEqual(memeAdd?.target, {
      kind: "meme",
      commentIndex: TOPIC_POST_COMMENT_INDEX
    });
    assert.equal(videoAdd?.placeholder, true);
    assert.deepEqual(videoAdd?.target, {
      kind: "video",
      commentIndex: TOPIC_POST_COMMENT_INDEX
    });
    assert.equal(sfxAdd?.placeholder, true);
    assert.deepEqual(sfxAdd?.target, {
      kind: "sfx",
      commentIndex: TOPIC_POST_COMMENT_INDEX
    });
    assert.equal(memeAdd?.start, (topicVoice?.start ?? 0) + (topicVoice?.duration ?? 0));
    assert.equal(clipOpensAssetPicker(memeAdd!), true);
  });

  it("keeps a topic-post meme placeholder after one already exists", () => {
    const source = timeline();
    const topic = source.scenes[0];
    if (topic) {
      topic.overlays = [
        {
          type: "meme",
          file: "after-topic.png",
          start: topic.audioStart + topic.audioDuration,
          duration: 1
        }
      ];
    }
    const project = videoTimelineToProject(source);
    const postMeme = project.clips.find(
      (clip) => clip.commentIndex === TOPIC_POST_COMMENT_INDEX
    );
    assert.equal(postMeme?.file, "after-topic.png");
    assert.equal(postMeme?.trackId, "meme");
    const tracks = getProjectTracks(project);
    const memeTrack = tracks.find((track) => track.id === "meme");
    const add = memeTrack?.clips.find((clip) => clip.id === "meme-add-topic");
    assert.equal(add?.placeholder, true);
    assert.ok((add?.start ?? 0) >= (postMeme?.start ?? 0) + (postMeme?.duration ?? 0) - 0.0001);
    assert.equal(
      memeTrack?.clips.some((clip) => clip.file === "after-topic.png"),
      true
    );
  });

  it("keeps a meme placeholder when that comment already has a meme", () => {
    const tracks = getProjectTracks(videoTimelineToProject(timeline()));
    const memeTrack = tracks.find((track) => track.id === "meme");
    const existing = memeTrack?.clips.find((clip) => clip.file === "meme.png");
    const add = memeTrack?.clips.find((clip) => clip.id === "meme-add-0");
    assert.equal(add?.placeholder, true);
    assert.ok((add?.start ?? 0) >= (existing?.start ?? 0) + (existing?.duration ?? 0) - 0.0001);
    assert.equal(
      memeTrack?.clips.some((clip) => clip.file === "meme.png"),
      true
    );
  });

  it("gives unique clip ids when a comment has two overlays of the same type", () => {
    const source = timeline();
    const comment = source.scenes[1];
    if (comment) {
      comment.overlays = [
        { type: "meme", file: "meme.png", start: 1.5, duration: 0.5 },
        { type: "meme", file: "meme.png", start: 2, duration: 0.5 },
        { type: "sfx", file: "boom.mp3", start: 1.5, duration: 0.4 },
        { type: "sfx", file: "boom.mp3", start: 2, duration: 0.4 }
      ];
    }
    const project = videoTimelineToProject(source);
    const memeIds = project.clips
      .filter((clip) => clip.trackId === "meme" && clip.commentIndex === 0)
      .map((clip) => clip.id);
    const sfxIds = project.clips
      .filter((clip) => clip.trackId === "sfx" && clip.commentIndex === 0)
      .map((clip) => clip.id);
    assert.equal(memeIds.length, 2);
    assert.equal(new Set(memeIds).size, 2);
    assert.equal(sfxIds.length, 2);
    assert.equal(new Set(sfxIds).size, 2);
    const topic = source.scenes[0];
    if (topic) {
      topic.overlays = [
        {
          type: "meme",
          file: "after-topic.png",
          start: topic.audioStart + topic.audioDuration,
          duration: 1
        },
        {
          type: "meme",
          file: "after-topic.png",
          start: topic.audioStart + topic.audioDuration + 1,
          duration: 1
        }
      ];
    }
    const withTopic = videoTimelineToProject(source);
    const topicIds = withTopic.clips
      .filter((clip) => clip.commentIndex === TOPIC_POST_COMMENT_INDEX)
      .map((clip) => clip.id);
    assert.equal(topicIds.length, 2);
    assert.equal(new Set(topicIds).size, 2);
  });

  it("places a later meme immediately after the previous meme", () => {
    const overlays = [
      { type: "meme", start: 1.5, duration: 1.2 },
      { type: "meme", start: 1.5, duration: 1 },
      { type: "sfx", start: 1.5, duration: 3 }
    ];
    sequenceMemeOverlays(overlays);
    assert.equal(overlays[0]?.start, 1.5);
    assert.equal(overlays[0]?.duration, 3);
    assert.equal(overlays[1]?.start, 4.5);
    assert.equal(overlays[1]?.duration, 1);
    assert.equal(overlays[2]?.start, 1.5);
    assert.equal(overlays[2]?.duration, 3);

    const source = timeline();
    const comment = source.scenes[1];
    if (comment) {
      comment.overlays = [
        { type: "meme", file: "first.png", start: 1.5, duration: 1.2 },
        { type: "meme", file: "second.png", start: 1.5, duration: 1 }
      ];
    }
    const project = videoTimelineToProject(source);
    const memes = project.clips
      .filter((clip) => clip.trackId === "meme" && clip.commentIndex === 0)
      .sort((left, right) => left.start - right.start);
    assert.equal(memes.length, 2);
    assert.equal(memes[1]?.start, (memes[0]?.start ?? 0) + (memes[0]?.duration ?? 0));
    sequenceCommentVisualClips(project.clips);
    const again = project.clips
      .filter((clip) => clip.trackId === "meme" && clip.commentIndex === 0)
      .sort((left, right) => left.start - right.start);
    assert.equal(again[1]?.start, (again[0]?.start ?? 0) + (again[0]?.duration ?? 0));
  });

  it("matches each extra meme duration to its paired sfx, or the default", () => {
    const overlays = [
      { type: "meme", start: 2, duration: 1 },
      { type: "meme", start: 2, duration: 1 },
      { type: "meme", start: 2, duration: 1 },
      { type: "sfx", start: 2, duration: 1.6 },
      { type: "sfx", start: 2, duration: 0.8 }
    ];
    sequenceMemeOverlays(overlays);
    assert.equal(overlays[0]?.duration, 1.6);
    assert.equal(overlays[0]?.start, 2);
    assert.equal(overlays[3]?.start, 2);
    assert.equal(overlays[1]?.duration, 0.8);
    assert.equal(overlays[1]?.start, 3.6);
    assert.equal(overlays[4]?.start, 3.6);
    assert.equal(overlays[2]?.duration, 1);
    assert.equal(overlays[2]?.start, 4.4);
  });

  it("does not snap sfx-only overlays to the start of the video", () => {
    const overlays = [
      { type: "sfx", start: 2.4, duration: 0.8 },
      { type: "sfx", start: 2.4, duration: 0.5 }
    ];
    sequenceMemeOverlays(overlays);
    assert.equal(overlays[0]?.start, 2.4);
    assert.equal(overlays[1]?.start, 3.2);
  });

  it("keeps a title-card clip when topic intro has no Open SFX", () => {
    const source = timeline({
      topicIntro: {
        case: "short",
        title: "Hello title",
        titleVoiceDuration: 0,
        titleCardFile: "processed/topic-title-card.png",
        animationDuration: 0.35,
        blocksDuration: 2,
        captureStart: 0
      }
    });
    const project = videoTimelineToProject(source);
    const title = project.clips.find((clip) => clip.trackId === "title-card");
    assert.equal(title?.file, "processed/topic-title-card.png");
    assert.equal(title?.x, 0);
    assert.equal(title?.y, TOPIC_TITLE_TRANSFORM_Y);
    assert.equal(
      project.clips.some((clip) => clip.id === "topic-open-sfx"),
      false
    );
    const tracks = getProjectTracks(project);
    const titleTrack = tracks.find((track) => track.id === "title-card");
    assert.equal(
      titleTrack?.clips.some(
        (clip) => clip.file === "processed/topic-title-card.png" && !clip.placeholder
      ),
      true
    );
  });

  it("uses custom title x/y on first build and keeps previous title position", () => {
    const source = timeline({
      topicIntro: {
        case: "short",
        title: "Hello title",
        titleVoiceDuration: 0,
        titleCardFile: "processed/topic-title-card.png",
        animationDuration: 0.35,
        blocksDuration: 2,
        captureStart: 0
      }
    });
    const defaults = {
      ...DEFAULT_OVERLAY_STYLE_DEFAULTS,
      titleX: 0.15,
      titleY: 0.4
    };
    const first = videoTimelineToProject(source, undefined, defaults);
    const title = first.clips.find((clip) => clip.id === "title-card");
    assert.equal(title?.x, 0.15);
    assert.equal(title?.y, 0.4);

    const previous = cloneTimelineProject(first);
    const previousTitle = previous.clips.find((clip) => clip.id === "title-card");
    if (previousTitle) {
      previousTitle.x = -0.2;
      previousTitle.y = -0.3;
    }
    const rebuilt = videoTimelineToProject(source, previous, defaults);
    const kept = rebuilt.clips.find((clip) => clip.id === "title-card");
    assert.equal(kept?.x, -0.2);
    assert.equal(kept?.y, -0.3);
  });

  it("stacks child comments below the parent using the same x", () => {
    assert.equal(overlayRestLeftPercent(0), 50);
    assert.equal(overlayRestTopPercent(0.5), 25);
    const stacked = stackCommentPositions([200, 150], 0.2, 0.5);
    assert.equal(stacked[0]?.x, 0.2);
    assert.equal(stacked[0]?.y, 0.5);
    assert.equal(stacked[1]?.x, 0.2);
    assert.ok((stacked[1]?.y ?? 0) < 0.5);
    const fromSettings = overlayStyleDefaultsFromSettings({
      commentCapture: { x: 0.1, y: 0.4 },
      topicTitle: { x: -0.2, y: 0.3 },
      meme: { x: 0.05, y: -0.1, scale: 0.9, fadeIn: 0.2 }
    });
    assert.equal(fromSettings.commentX, 0.1);
    assert.equal(fromSettings.commentY, 0.4);
    assert.equal(fromSettings.titleX, -0.2);
    assert.equal(fromSettings.titleY, 0.3);
    assert.equal(fromSettings.meme.scale, 0.9);
  });

  it("groups topic and a comment thread into scene bands without bed tracks", () => {
    const source = timeline({
      totalDuration: 20,
      scenes: [
        {
          id: "topic",
          commentIndex: null,
          imageFile: "processed/topic.png",
          imageStart: 0,
          imageDuration: 2,
          audioFile: "audio/topic.mp3",
          audioStart: 0,
          audioDuration: 2,
          overlays: []
        },
        {
          id: "comments-0-1",
          commentIndex: 0,
          imageFile: "processed/comment-0.png",
          imageStart: 0,
          imageDuration: 4,
          sceneDuration: 4,
          audioFile: "audio/comment-0.mp3",
          audioStart: 0,
          audioDuration: 2,
          overlays: [],
          blocks: [
            {
              commentIndex: 0,
              imageFile: "processed/comment-0.png",
              imageStart: 0,
              imageDuration: 4,
              audioFile: "audio/comment-0.mp3",
              audioStart: 0,
              audioDuration: 2,
              overlays: []
            },
            {
              commentIndex: 1,
              imageFile: "processed/comment-1.png",
              imageStart: 2,
              imageDuration: 2,
              audioFile: "audio/comment-1.mp3",
              audioStart: 2,
              audioDuration: 1.8,
              overlays: []
            }
          ]
        }
      ]
    });
    const project = videoTimelineToProject(source);
    const bands = getSceneBands(project);
    assert.equal(bands.length, 2);
    assert.equal(bands[0]?.kind, "topic");
    assert.equal(bands[0]?.label, "Topic");
    assert.equal(bands[0]?.start, 0);
    assert.equal(bands[0]?.end, 2.1);
    assert.equal(bands[1]?.kind, "comment");
    assert.equal(bands[1]?.label, "Cmt #0–#1");
    assert.equal(bands[1]?.start, 2.1);
    assert.equal(bands[1]?.end, 6.1);
    assert.ok((bands[1]?.end ?? 0) < 20);
    assert.deepEqual(bands[1]?.commentIndexes, [0, 1]);

    const fromTimeline = getTimelineSceneBands(source);
    assert.equal(fromTimeline.length, 2);
    assert.equal(fromTimeline[0]?.label, "Topic");
    assert.equal(fromTimeline[1]?.label, "Cmt #0–#1");
    assert.equal(fromTimeline[0]?.end, 2.1);
    assert.equal(fromTimeline[1]?.start, 2.1);
    assert.equal(fromTimeline[1]?.end, 6.1);
    assert.equal(activeSceneBandId(bands, 0.5), bands[0]?.id);
    assert.equal(activeSceneBandId(bands, 4), bands[1]?.id);

    const packed = getSceneBands(twoCommentProject());
    assert.equal(packed.length, 2);
    assert.equal(packed[0]?.label, "Cmt #0");
    assert.equal(packed[0]?.start, 0);
    assert.equal(packed[0]?.end, 5);
    assert.equal(packed[1]?.label, "Cmt #1");
    assert.equal(packed[1]?.start, 5);
    assert.equal(packed[1]?.end, 8);

    const tracksSource = readFileSync(
      path.join(repoRoot, "renderer/features/preview/TimelineTracks.tsx"),
      "utf8"
    );
    assert.match(tracksSource, />\s*Scene\s*</);
    assert.match(tracksSource, /getSceneBands/);
    assert.match(tracksSource, /TIMELINE_SELECTION_KEEP_SELECTOR/);
    assert.match(tracksSource, /data-scene-band/);
    assert.match(TIMELINE_SELECTION_KEEP_SELECTOR, /data-clip-id/);
    assert.match(TIMELINE_SELECTION_KEEP_SELECTOR, /data-keep-selection/);
    assert.match(TIMELINE_SELECTION_KEEP_SELECTOR, /data-scene-band/);
  });
});

describe("timeline preview chrome", () => {
  it("picks docked, native, and overlay stage modes", () => {
    assert.equal(
      previewStageMode({ native: false, overlay: false }),
      "docked"
    );
    assert.equal(
      previewStageMode({ native: true, overlay: false }),
      "native"
    );
    assert.equal(
      previewStageMode({ native: true, overlay: true }),
      "overlay"
    );
  });

  it("uses a taller docked frame and a fullscreen host", () => {
    const player = readFileSync(
      path.join(repoRoot, "renderer/features/preview/HyperframesPlayer.tsx"),
      "utf8"
    );
    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/preview/TimelineWorkspace.tsx"),
      "utf8"
    );
    assert.match(player, /"data-clip-id": clip\.id/);
    assert.match(player, /onSelect=\{\(\) => onSelectClip\?\.\(clip\.id\)\}/);
    assert.match(player, /function PreviewSeekBar/);
    assert.match(player, /expanded && onSeek/);
    assert.match(player, /onScrubbingChange/);
    assert.match(workspace, /onSeek=\{preview\.setPreviewTime\}/);
    assert.match(workspace, /onScrubbingChange=\{preview\.setPreviewScrubbing\}/);
    assert.doesNotMatch(
      workspace.slice(
        workspace.indexOf("<HyperframesPlayer"),
        workspace.indexOf("onSelectClip={setSelectedClipId}")
      ),
      /setPreviewPlaying\(false\)/
    );
    assert.match(previewFrameClass("docked"), /52vh/);
    assert.doesNotMatch(previewFrameClass("docked"), /38vh/);
    assert.match(previewHostClass("overlay"), /fixed inset-0/);
    assert.match(previewFrameClass("native"), /100dvh/);
    assert.equal(previewFullscreenFrameWidth(1920, 1080), 607.5);
    assert.equal(
      previewCaptureStyleScale("native", 607.5, 1920, 1080),
      1
    );
    assert.equal(
      previewCaptureStyleScale("docked", 270, 1920, 1080),
      270 / 607.5
    );
    assert.equal(
      previewStageBoxStyle(previewStageScale(270)).transform,
      `scale(${270 / 1080})`
    );
    assert.equal(
      previewStageBoxStyle(previewStageScale(607.5)).width,
      previewStageBoxStyle(previewStageScale(270)).width
    );
  });

  it("detects whether the preview host owns fullscreen", () => {
    const host = { contains(node: Node) { return node === child; } };
    const child = {} as Node;
    assert.equal(isPreviewFullscreen(host, child), true);
    assert.equal(isPreviewFullscreen(host, host as unknown as Node), true);
    assert.equal(isPreviewFullscreen(host, {} as Node), false);
    assert.equal(isPreviewFullscreen(null, child), false);
  });
});

describe("timeline preview clock", () => {
  it("resolves the scene at a given playhead time", () => {
    const scene = getPreviewScene(timeline(), 2.2);
    assert.ok(scene);
    assert.equal(scene.scene.id, "comment-0");
    assert.ok(scene.elapsed >= 0);
  });

  it("builds music, voice, and sfx preview audio tracks", () => {
    const tracks = getPreviewAudioTracks(timeline());
    assert.ok(tracks.some((track) => track.key === "music"));
    assert.ok(tracks.some((track) => track.key.startsWith("voice-")));
    assert.ok(tracks.some((track) => track.key.startsWith("sfx-")));
  });

  it("uses a tighter seek threshold while playing", () => {
    assert.equal(previewSeekThreshold(true), 0.08);
    assert.equal(previewSeekThreshold(false), 1 / 30);
  });

  it("maps a fullscreen scrubber click onto clamped preview time", () => {
    const bar = { left: 100, width: 200 };
    assert.equal(previewTimeFromBar(200, bar, 10), 5);
    assert.equal(previewTimeFromBar(80, bar, 10), 0);
    assert.equal(previewTimeFromBar(400, bar, 10), 10);
    assert.equal(previewTimeFromBar(200, { left: 0, width: 0 }, 10), 0);
    assert.equal(previewProgressPercent(2.5, 10), 25);
    assert.equal(previewProgressPercent(12, 10), 100);
    assert.equal(previewProgressPercent(1, 0), 0);
    assert.equal(shouldAdvancePreviewClock(true, false), true);
    assert.equal(shouldAdvancePreviewClock(true, true), false);
    assert.equal(shouldAdvancePreviewClock(false, false), false);
  });
});

describe("asset picker", () => {
  const library = [
    asset({ id: "bg-1", type: "background", mediaKind: "video" }),
    asset({ id: "music-1", type: "music", mediaKind: "audio" }),
    asset({ id: "sfx-1", type: "sfx", mediaKind: "audio" }),
    asset({ id: "meme-img", type: "meme", mediaKind: "image" }),
    asset({ id: "meme-vid", type: "meme", mediaKind: "video" })
  ];

  it("filters library assets by clip target", () => {
    assert.deepEqual(
      assetsForTarget(library, { kind: "background" }).map((item) => item.id),
      ["bg-1"]
    );
    assert.deepEqual(
      assetsForTarget(library, { kind: "sfx", commentIndex: 0 }).map(
        (item) => item.id
      ),
      ["sfx-1"]
    );
    assert.deepEqual(
      assetsForTarget(library, { kind: "video", commentIndex: 0 }).map(
        (item) => item.id
      ),
      ["meme-vid"]
    );
    assert.deepEqual(
      assetsForTarget(library, { kind: "meme", commentIndex: 0 }).map(
        (item) => item.id
      ),
      ["meme-img"]
    );
    assert.equal(assetsForTarget(library, { kind: "topic-title" }).length, 0);
  });

  it("keeps picker titles for each target kind", () => {
    assert.equal(pickerTitle({ kind: "background" }), "Chọn background");
    assert.equal(
      pickerTitle({ kind: "video", commentIndex: 3 }),
      "Chọn video meme · comment #3"
    );
    assert.equal(
      pickerTitle({ kind: "meme", commentIndex: 2 }),
      "Chọn meme · comment #2"
    );
    assert.equal(
      pickerTitle({ kind: "meme", commentIndex: TOPIC_POST_COMMENT_INDEX }),
      "Chọn meme · sau topic"
    );
    assert.equal(
      pickerTitle({ kind: "sfx", commentIndex: TOPIC_POST_COMMENT_INDEX }),
      "Chọn sound effect · sau topic"
    );
  });

  it("reads the currently assigned asset for a clip", () => {
    const reactions: MatchedReaction[] = [
      {
        commentIndex: 0,
        emotion: "happy",
        meme: asset({ id: "meme-img", type: "meme", mediaKind: "image" }),
        sfx: asset({ id: "sfx-1", type: "sfx", mediaKind: "audio" }),
        animation: "none",
        duration: 1
      }
    ];
    const current = analysis({
      backgroundAssetId: "bg-1",
      musicAssetId: "music-1",
      topicMemeId: "meme-vid"
    });
    assert.equal(
      selectedAssetId({ kind: "background" }, current, reactions),
      "bg-1"
    );
    assert.equal(
      selectedAssetId({ kind: "sfx", commentIndex: 0 }, current, reactions),
      undefined
    );
    assert.equal(
      selectedAssetId({ kind: "meme", commentIndex: 0 }, current, reactions),
      undefined
    );
    assert.equal(
      selectedAssetId(
        { kind: "meme", commentIndex: 0, clipId: "meme-0" },
        current,
        reactions,
        {
          clips: [{ id: "meme-0", file: "meme-img.bin" }],
          assets: library
        }
      ),
      "meme-img"
    );
    assert.equal(
      selectedAssetId({ kind: "topic-title" }, current, reactions),
      undefined
    );
  });

  it("rejects removing background or music through replacement", () => {
    assert.throws(
      () =>
        applyTimelineAssetReplacement(
          [],
          analysis(),
          library,
          { kind: "background" },
          null
        ),
      /Background cannot be removed/
    );
    const next = applyTimelineAssetReplacement(
      [],
      analysis(),
      library,
      { kind: "music" },
      "music-1"
    );
    assert.equal(next.selections?.musicAssetId, "music-1");
  });

  it("assigns meme and sfx immediately after the topic", () => {
    const assigned = applyTimelineAssetReplacement(
      [],
      analysis(),
      library,
      { kind: "meme", commentIndex: TOPIC_POST_COMMENT_INDEX },
      "meme-img"
    );
    assert.equal(assigned.selections?.topicPostMemeId, "meme-img");
    const withSfx = applyTimelineAssetReplacement(
      [],
      analysis({ topicPostMemeId: "meme-img" }),
      library,
      { kind: "sfx", commentIndex: TOPIC_POST_COMMENT_INDEX },
      "sfx-1"
    );
    assert.equal(withSfx.selections?.topicPostSfxId, "sfx-1");
    const video = applyTimelineAssetReplacement(
      [],
      analysis(),
      library,
      { kind: "video", commentIndex: TOPIC_POST_COMMENT_INDEX },
      "meme-vid"
    );
    assert.equal(video.selections?.topicPostMemeId, "meme-vid");
    assert.equal(video.selections?.topicPostSfxId, null);
  });

  it("appends extra meme, video, and sfx instead of replacing the primary slot", () => {
    const first = applyTimelineAssetReplacement(
      [],
      analysis(),
      library,
      { kind: "meme", commentIndex: 0 },
      "meme-img"
    );
    assert.equal(first.reactions[0]?.meme?.id, "meme-img");
    const second = applyTimelineAssetReplacement(
      first.reactions,
      analysis(),
      library,
      { kind: "meme", commentIndex: 0 },
      "meme-img"
    );
    assert.equal(second.reactions[0]?.meme?.id, "meme-img");
    assert.equal(second.reactions[0]?.extraMemes?.[0]?.id, "meme-img");
    const withVideo = applyTimelineAssetReplacement(
      second.reactions,
      analysis(),
      library,
      { kind: "video", commentIndex: 0 },
      "meme-vid"
    );
    assert.equal(withVideo.reactions[0]?.meme?.id, "meme-img");
    assert.equal(
      withVideo.reactions[0]?.extraMemes?.map((item) => item.id).join(","),
      "meme-img,meme-vid"
    );
    const withSfx = applyTimelineAssetReplacement(
      withVideo.reactions,
      analysis(),
      library,
      { kind: "sfx", commentIndex: 0 },
      "sfx-1"
    );
    assert.ok(withSfx.reactions[0]?.sfx);
    const extraSfx = applyTimelineAssetReplacement(
      withSfx.reactions,
      analysis(),
      library,
      { kind: "sfx", commentIndex: 0 },
      "sfx-1"
    );
    assert.equal(extraSfx.reactions[0]?.extraSfx?.[0]?.id, "sfx-1");
  });

  it("replaces or removes only the clip matching clipId", () => {
    const seeded = applyTimelineAssetReplacement(
      applyTimelineAssetReplacement(
        [],
        analysis(),
        library,
        { kind: "meme", commentIndex: 0 },
        "meme-img"
      ).reactions,
      analysis(),
      library,
      { kind: "meme", commentIndex: 0 },
      "meme-img"
    );
    const extra = seeded.reactions[0]?.extraMemes?.[0];
    assert.ok(extra);
    const clips = [
      {
        id: "meme-primary",
        file: seeded.reactions[0]!.meme!.file,
        trackId: "meme",
        commentIndex: 0,
        start: 1
      },
      {
        id: "meme-extra",
        file: extra.file,
        trackId: "meme",
        commentIndex: 0,
        start: 2
      }
    ];
    const replaced = applyTimelineAssetReplacement(
      seeded.reactions,
      analysis(),
      library,
      { kind: "meme", commentIndex: 0, clipId: "meme-extra" },
      "meme-img",
      clips
    );
    assert.equal(replaced.reactions[0]?.meme?.id, "meme-img");
    assert.equal(replaced.reactions[0]?.extraMemes?.[0]?.id, "meme-img");
    const removed = applyTimelineAssetReplacement(
      replaced.reactions,
      analysis(),
      library,
      { kind: "meme", commentIndex: 0, clipId: "meme-extra" },
      null,
      clips
    );
    assert.equal(removed.reactions[0]?.meme?.id, "meme-img");
    assert.equal(removed.reactions[0]?.extraMemes?.length ?? 0, 0);
  });
});

describe("main process stream errors", () => {
  it("ignores the Electron ReadableStream already-closed race", () => {
    const closed = Object.assign(
      new Error("Invalid state: ReadableStream is already closed"),
      { code: "ERR_INVALID_STATE" }
    );
    assert.equal(isIgnorableStreamClosedError(closed), true);
    assert.equal(isIgnorableStreamClosedError(new Error("boom")), false);
    assert.equal(isIgnorableStreamClosedError("nope"), false);
  });
});

describe("media helpers", () => {
  it("builds the custom media protocol URL", () => {
    assert.equal(
      assetMediaSrc("meme/ok"),
      "xammedia://library/?id=meme%2Fok"
    );
    assert.equal(assetFileName("a\\b\\c.png"), "c.png");
  });
});

describe("className helper", () => {
  it("drops falsey class fragments", () => {
    assert.equal(cn("a", false, undefined, "b"), "a b");
  });
});

describe("reply parent from indent", () => {
  it("attaches every indented reply to the comment above, not a sibling", () => {
    const root = 386;
    const reply = 427;
    const levels = [
      [{ index: 3, left: reply }],
      [{ index: 3, left: reply }],
      [
        { index: 3, left: reply },
        { index: 4, left: reply }
      ],
      [
        { index: 2, left: root },
        { index: 3, left: reply },
        { index: 4, left: reply }
      ]
    ];

    assert.equal(chooseParentIndex(3, reply, levels), 2);
    assert.equal(chooseParentIndex(4, reply, levels), 2);
  });

  it("keeps a direct reply to the post as a root", () => {
    const left = 386;

    assert.equal(
      chooseParentIndex(2, left, [
        [{ index: 2, left }],
        [
          { index: 0, left },
          { index: 1, left },
          { index: 2, left }
        ]
      ]),
      undefined
    );
  });

  it("uses the nearest less-indented card for a single reply", () => {
    assert.equal(
      chooseParentIndex(9, 427, [
        [
          { index: 8, left: 386 },
          { index: 9, left: 427 }
        ]
      ]),
      8
    );
  });
});

describe("screenshot clip", () => {
  it("crops extra pixels from the top and bottom of a card", () => {
    assert.deepEqual(
      screenshotClipRect(
        { x: 10.4, y: 20.2, width: 100.8, height: 80.9 },
        8,
        12
      ),
      { x: 10, y: 28, width: 101, height: 61 }
    );
  });

  it("trims Threads card padding above the avatar", () => {
    const source = readFileSync(
      path.join(repoRoot, "src/screenshot.ts"),
      "utf8"
    );
    assert.match(source, /contentInsetTopPx/);
    assert.match(source, /TOP_CROP_KEEP_PX = 8/);
    assert.match(source, /cropTopPx/);
  });

  it("does not use a viewport clip when the topic card is taller than the screen", () => {
    const clip = screenshotClipRect(
      { x: 0, y: 70, width: 390, height: 1200 },
      8,
      0
    );
    assert.equal(
      screenshotClipFitsViewport({ width: 390, height: 844 }, clip),
      false
    );
    assert.equal(
      screenshotClipFitsViewport({ width: 1440, height: 1200 }, {
        x: 10,
        y: 20,
        width: 500,
        height: 400
      }),
      true
    );
    assert.deepEqual(
      screenshotExtractRect(
        { width: 1170, height: 3600 },
        { width: 390, height: 1200 },
        8,
        0
      ),
      { left: 0, top: 24, width: 1170, height: 3576 }
    );
    const capture = readFileSync(
      path.join(repoRoot, "src/capture.ts"),
      "utf8"
    );
    const screenshot = readFileSync(
      path.join(repoRoot, "src/screenshot.ts"),
      "utf8"
    );
    assert.doesNotMatch(capture, /actionBarCropPx/);
    assert.doesNotMatch(capture, /DESKTOP_TOPIC_CROP_PX/);
    assert.doesNotMatch(capture, /topicPath, 124/);
    assert.match(screenshot, /resolveCaptureLocator/);
    assert.match(screenshot, /withPageReplyComposerHidden/);
    assert.match(screenshot, /stitchOverflow = false/);
  });

  it("hides a fixed bottom reply composer so it cannot cover comments", () => {
    assert.equal(
      isBottomChrome(
        { width: 390, height: 120, bottom: 844 },
        { width: 390, height: 844 }
      ),
      true
    );
    assert.equal(
      isBottomChrome(
        { width: 390, height: 56, bottom: 56 },
        { width: 390, height: 844 }
      ),
      false
    );
    assert.equal(
      composerOverlayRoot(
        "textbox",
        ["inner", "bar", "page"],
        (node) => node === "bar"
      ),
      "bar"
    );
    const screenshot = readFileSync(
      path.join(repoRoot, "src/screenshot.ts"),
      "utf8"
    );
    assert.match(screenshot, /withPageReplyComposerHidden\(page/);
  });

  it("picks the inner post card instead of the wrap that has the reply composer", () => {
    assert.equal(
      captureCardRoot(
        "outer",
        "composer",
        ["post", "quote"],
        (parent, child) => parent === "outer"
      ),
      "post"
    );
    assert.equal(
      captureCardRoot(
        "comment",
        undefined,
        [],
        () => false
      ),
      "comment"
    );
    assert.equal(
      captureCardRoot(
        "outer",
        "composer",
        ["wrap"],
        (parent) => parent === "wrap"
      ),
      "outer"
    );
  });
});

describe("pressable card snapshot parse", () => {
  const snapshot = (
    overrides: Partial<PressableCardSnapshot> = {}
  ): PressableCardSnapshot => ({
    index: 1,
    profileLinks: [
      { href: "/@alice", text: "alice" },
      { href: "/@alice/post/123", text: "2h" }
    ],
    dirAutoTexts: ["alice", "hello world", "5"],
    buttonAriaLabels: ["Like", "12 likes"],
    innerText: "alice\nhello world\n12",
    selfLeft: 427,
    levels: [
      [
        { index: 0, left: 386 },
        { index: 1, left: 427 }
      ]
    ],
    ...overrides
  });

  it("parses author, cleaned text, and likes from a viewport snapshot", () => {
    const parsed = parsePressableComment(snapshot());
    assert.equal(parsed?.author, "alice");
    assert.equal(parsed?.text, "hello world");
    assert.equal(parsed?.likes, 12);
  });

  it("ignores avatar-only profile links and post permalinks", () => {
    const parsed = parsePressableComment(
      snapshot({
        profileLinks: [
          { href: "/@alice", text: "" },
          { href: "/@alice/post/123", text: "alice" },
          { href: "/@alice", text: "alice" }
        ]
      })
    );
    assert.equal(parsed?.author, "alice");
  });

  it("reads parent index from the same snapshot geometry", () => {
    assert.equal(
      parentIndexFromSnapshot(
        snapshot({
          index: 3,
          selfLeft: 427,
          levels: [
            [
              { index: 2, left: 386 },
              { index: 3, left: 427 }
            ]
          ]
        })
      ),
      2
    );
  });
});

describe("export engine default", () => {
  it("uses ffmpeg unless hyperframes is requested", () => {
    const previous = process.env.XAMXIXIU_EXPORT_ENGINE;
    delete process.env.XAMXIXIU_EXPORT_ENGINE;
    try {
      assert.equal(getExportEngine(), "ffmpeg");
      process.env.XAMXIXIU_EXPORT_ENGINE = "hyperframes";
      assert.equal(getExportEngine(), "hyperframes");
    } finally {
      if (previous === undefined) {
        delete process.env.XAMXIXIU_EXPORT_ENGINE;
      } else {
        process.env.XAMXIXIU_EXPORT_ENGINE = previous;
      }
    }
  });
});

describe("video visual filters", () => {
  it("skips lanczos for pre-scaled stills and keeps PNG alpha", () => {
    const filters = visualFilters(
      {
        item: { start: 0, duration: 2, opacity: 1 },
        width: 800,
        height: 400,
        preScaled: true
      },
      30
    );
    assert.equal(filters.includes("lanczos"), false);
    assert.ok(filters.includes("yuva420p"));
    assert.equal(overlayPixelFormat(1), "yuva420p");
  });

  it("keeps alpha when opacity is below 1", () => {
    const filters = visualFilters(
      {
        item: { start: 0, duration: 2, opacity: 0.5 },
        width: 800,
        height: 400,
        preScaled: true
      },
      30
    );
    assert.ok(filters.includes("yuva420p"));
    assert.ok(filters.includes("colorchannelmixer=aa=0.5"));
    assert.equal(overlayPixelFormat(0.5), "yuva420p");
  });

  it("treats gif overlays as animated instead of stills", () => {
    assert.equal(mediaType("memes/dance.gif"), "video");
    assert.equal(mediaType("memes/still.png"), "photo");
    assert.equal(isAnimatedVisual("overlays-12.gif"), true);
    assert.equal(isAnimatedVisual("comment-01.png"), false);
  });
});

describe("builtin meme combos", () => {
  it("keeps default combos at 100% scale and centered", () => {
    for (const id of ["punch", "cringe", "shock", "soft", "none"] as const) {
      const combo = getBuiltinCombo(id);
      assert.equal(combo.scale, 1);
      assert.equal(combo.x, 0);
      assert.equal(combo.y, 0);
      assert.equal(combo.sfxOffset, 0);
    }
    const punch = getBuiltinCombo("punch");
    assert.equal(punch.animation, "zoom-in");
    assert.equal(punch.name, "Zoom in");
    assert.equal(punch.fadeIn, 0.2);
    assert.equal(punch.animationDuration, 0.12);
    assert.equal(clipShakeOffsetPercent(0), 0);
    assert.equal(clipShakeOffsetPercent(1), 0);
    assert.equal(getBuiltinCombo("cringe").name, "Slide up");
    assert.equal(getBuiltinCombo("shock").name, "Shake");
    assert.equal(getBuiltinCombo("soft").name, "Fade in");
    assert.equal(getBuiltinCombo("none").name, "None");
    assert.equal(getBuiltinCombo("none").fadeIn, 0);
    const baked = applyCombo({ file: "meme.png" }, punch);
    assert.equal(baked.scale, 1);
    assert.equal(baked.x, 0);
    assert.equal(baked.y, 0);
    assert.equal(baked.sfxOffset, 0);
  });

  it("zooms in from a smaller scale instead of shrinking the clip", () => {
    assert.ok(ZOOM_IN_FROM < 1);
    assert.equal(clipZoomMultiplier(0), ZOOM_IN_FROM);
    assert.equal(clipZoomMultiplier(1), 1);
    const project = createSpikeTimelineProject();
    const meme = project.clips.find((clip) => clip.id === "meme-b");
    assert.ok(meme);
    Object.assign(meme, applyCombo(meme, getBuiltinCombo("punch")));
    const html = compileTimelineProject(project);
    assert.match(html, new RegExp(`scale: ${ZOOM_IN_FROM}`));
    assert.match(html, /\{ scale: 1,/);
  });

  it("keeps video meme audio unmuted while background video stays muted", () => {
    assert.equal(
      clipMutesVideoElement({ kind: "video", trackId: "background" }),
      true
    );
    assert.equal(
      clipMutesVideoElement({ kind: "video", trackId: "video" }),
      false
    );
    const html = compileTimelineProject(createSpikeTimelineProject());
    assert.match(html, /id="meme-a"[^>]*playsinline/);
    assert.doesNotMatch(html, /id="meme-a"[^>]* muted/);
  });

  it("does not keep stale builtin scale when AI rematches unlocked clips", () => {
    const stalePunch = {
      id: "meme-0",
      trackId: "meme" as const,
      start: 1,
      duration: 1.2,
      trimIn: 0,
      sourceDuration: 1.2,
      file: "meme.png",
      fadeIn: 0.08,
      fadeOut: 0,
      volume: 1,
      locked: false,
      label: "Meme",
      kind: "image" as const,
      commentIndex: 0,
      animation: "zoom-in",
      animationDuration: 0.18,
      comboId: "punch",
      scale: 0.72,
      x: 0.08,
      y: -0.12,
      sfxOffset: 0.12
    };
    const rebuilt = applyCombo(
      { ...stalePunch, scale: 1, x: 0, y: 0 },
      getBuiltinCombo("punch")
    );
    const [kept] = preserveComboClips([rebuilt], [stalePunch]);
    assert.equal(kept?.scale, 1);
    assert.equal(kept?.x, 0);
    assert.equal(kept?.y, 0);
    assert.equal(kept?.sfxOffset, 0);
    assert.equal(isCustomCombo(kept!), false);

    const locked = { ...stalePunch, comboLocked: true };
    const [preserved] = preserveComboClips([rebuilt], [locked]);
    assert.equal(preserved?.scale, 0.72);
    assert.equal(preserved?.x, 0.08);
  });
});

describe("AI meme suggestions", () => {
  const library = [
    asset({
      id: "meme-laugh",
      type: "meme",
      mediaKind: "image",
      category: "laughing",
      tags: ["haha", "cười"]
    }),
    asset({
      id: "meme-shock",
      type: "meme",
      mediaKind: "image",
      category: "shocked",
      tags: ["sốc"]
    }),
    asset({
      id: "meme-happy",
      type: "meme",
      mediaKind: "image",
      category: "happy",
      tags: ["ok"]
    }),
    asset({
      id: "sfx-boom",
      type: "sfx",
      mediaKind: "audio",
      category: "boom"
    }),
    asset({
      id: "sfx-wow",
      type: "sfx",
      mediaKind: "audio",
      category: "wow",
      tags: ["sốc"]
    }),
    asset({
      id: "sfx-ding",
      type: "sfx",
      mediaKind: "audio",
      category: "ding"
    }),
    asset({
      id: "topic-card",
      type: "meme",
      mediaKind: "image",
      category: "topic"
    })
  ];

  function emptyReactions(count: number): ThreadAnalysis {
    return analysis({
      tone: "casual",
      reactions: Array.from({ length: count }, (_, commentIndex) => ({
        commentIndex,
        emotion: "neutral" as const,
        memeCategory: null,
        sfxCategory: null,
        memeAssetId: null,
        sfxAssetId: null,
        animation: "none" as const,
        duration: 1
      }))
    });
  }

  it("fills missing slots from comment text without repeating memes", () => {
    const next = applyMemeSuggestions(
      emptyReactions(4),
      { reactions: [] },
      library,
      [0, 1, 2, 3],
      [
        { commentIndex: 0, text: "haha cười quá" },
        { commentIndex: 1, text: "sốc thật luôn" },
        { commentIndex: 2, text: "ok ổn" },
        { commentIndex: 3, text: "whatever" }
      ]
    );
    const memeIds = next.reactions
      .map((reaction) => reaction.memeAssetId)
      .filter((id): id is string => Boolean(id));
    assert.ok(memeIds.length >= 2);
    assert.equal(new Set(memeIds).size, memeIds.length);
    assert.equal(next.reactions[0]?.memeAssetId, "meme-laugh");
    assert.equal(next.reactions[1]?.memeAssetId, "meme-shock");
    assert.equal(
      next.reactions.every(
        (reaction) =>
          !reaction.memeAssetId ||
          library.find((item) => item.id === reaction.memeAssetId)?.mediaKind !==
          "video"
      ),
      true
    );
    assert.equal(next.topicMemeId, "topic-card");
  });

  it("replaces a repeated meme id with a candidate", () => {
    const next = applyMemeSuggestions(
      emptyReactions(2),
      {
        reactions: [
          {
            commentIndex: 0,
            memeAssetId: "meme-laugh",
            sfxAssetId: "sfx-boom",
            comboId: "punch"
          },
          {
            commentIndex: 1,
            memeAssetId: "meme-laugh",
            sfxAssetId: "sfx-boom",
            candidates: ["meme-shock"],
            comboId: "shock"
          }
        ]
      },
      library,
      [0, 1]
    );
    assert.equal(next.reactions[0]?.memeAssetId, "meme-laugh");
    assert.equal(next.reactions[1]?.memeAssetId, "meme-shock");
    assert.notEqual(
      next.reactions[0]?.sfxAssetId,
      next.reactions[1]?.sfxAssetId
    );
  });

  it("does not invent video memes when the library has none", () => {
    const next = applyMemeSuggestions(
      emptyReactions(2),
      {
        reactions: [
          {
            commentIndex: 0,
            memeAssetId: "missing-video",
            memeCategory: "video"
          }
        ]
      },
      library,
      [0, 1],
      [
        { commentIndex: 0, text: "haha cười" },
        { commentIndex: 1, text: "sốc" }
      ]
    );
    for (const reaction of next.reactions) {
      const meme = library.find((item) => item.id === reaction.memeAssetId);
      assert.notEqual(meme?.mediaKind, "video");
    }
  });

  it("does not force memes on serious threads", () => {
    const next = applyMemeSuggestions(
      analysis({
        tone: "serious",
        reactions: emptyReactions(2).reactions
      }),
      { reactions: [] },
      library,
      [0, 1],
      [
        { commentIndex: 0, text: "haha" },
        { commentIndex: 1, text: "sốc" }
      ]
    );
    assert.equal(
      next.reactions.every((reaction) => !reaction.memeAssetId),
      true
    );
  });
});

describe("clear comment overlays", () => {
  function overlayClip(
    partial: Partial<TimelineClip> & Pick<TimelineClip, "id" | "trackId">
  ): TimelineClip {
    const audio =
      partial.trackId === "sfx" ||
      partial.trackId === "beep" ||
      partial.trackId === "voice";
    return {
      start: 1,
      duration: 1,
      trimIn: 0,
      sourceDuration: 1,
      file: `${partial.id}.bin`,
      fadeIn: 0,
      fadeOut: 0,
      volume: 1,
      locked: false,
      label: partial.id,
      kind: audio ? "audio" : "image",
      ...partial
    };
  }

  it("drops unlocked comment meme, video, sfx, and beep but keeps locked and intro clips", () => {
    const project = createEmptyTimelineProject();
    project.clips = [
      overlayClip({
        id: "title-card",
        trackId: "title-card",
        label: "Title",
        kind: "title"
      }),
      overlayClip({
        id: "topic-open-sfx",
        trackId: "sfx",
        label: "Open SFX"
      }),
      overlayClip({
        id: "topic-meme",
        trackId: "meme",
        commentIndex: null,
        file: "topic.png"
      }),
      overlayClip({
        id: "voice-0",
        trackId: "voice",
        commentIndex: 0
      }),
      overlayClip({
        id: "meme-0",
        trackId: "meme",
        commentIndex: 0,
        comboId: "punch"
      }),
      overlayClip({
        id: "sfx-0",
        trackId: "sfx",
        commentIndex: 0
      }),
      overlayClip({
        id: "video-1",
        trackId: "video",
        commentIndex: 1,
        kind: "video"
      }),
      overlayClip({
        id: "meme-2",
        trackId: "meme",
        commentIndex: 2,
        locked: true,
        comboId: "shock"
      }),
      overlayClip({ id: "beep-free", trackId: "beep" }),
      overlayClip({ id: "beep-locked", trackId: "beep", locked: true })
    ];

    assert.equal(
      isBulkClearableOverlayClip(project.clips.find((clip) => clip.id === "meme-0")!),
      true
    );
    assert.equal(
      isBulkClearableOverlayClip(project.clips.find((clip) => clip.id === "meme-2")!),
      false
    );
    assert.equal(
      isBulkClearableOverlayClip(project.clips.find((clip) => clip.id === "beep-free")!),
      true
    );
    assert.equal(
      isTopicIntroMemeOrOpenSfx(
        project.clips.find((clip) => clip.id === "topic-open-sfx")!
      ),
      true
    );

    const kinds = collectClearedOverlayKinds(project);
    assert.deepEqual(kinds.get(0), { meme: true, sfx: true });
    assert.deepEqual(kinds.get(1), { meme: true, sfx: false });
    assert.equal(kinds.has(2), false);

    const next = clearCommentMemesAndSfx(project);
    const ids = next.clips.map((clip) => clip.id).sort();
    assert.deepEqual(ids, [
      "beep-locked",
      "meme-2",
      "title-card",
      "topic-meme",
      "topic-open-sfx",
      "voice-0"
    ]);

    const sourceAnalysis = analysis({
      topicMemeId: "topic-card",
      reactions: [
        {
          commentIndex: 0,
          emotion: "laughing",
          memeAssetId: "meme-laugh",
          memeCategory: "laughing",
          sfxAssetId: "sfx-boom",
          sfxCategory: "boom",
          comboId: "punch",
          comboLocked: true,
          animation: "zoom-in",
          duration: 1.2
        },
        {
          commentIndex: 2,
          emotion: "shocked",
          memeAssetId: "meme-shock",
          memeCategory: "shocked",
          sfxAssetId: null,
          sfxCategory: null,
          comboId: "shock",
          animation: "shake-3",
          duration: 1
        }
      ]
    });
    const clearedAnalysis = clearCommentAnalysisAssets(sourceAnalysis, kinds);
    assert.equal(clearedAnalysis.topicMemeId, "topic-card");
    assert.equal(clearedAnalysis.reactions[0]?.memeAssetId, null);
    assert.equal(clearedAnalysis.reactions[0]?.sfxAssetId, null);
    assert.equal(clearedAnalysis.reactions[0]?.comboId, "punch");
    assert.equal(clearedAnalysis.reactions[0]?.comboLocked, true);
    assert.equal(clearedAnalysis.reactions[0]?.animation, "zoom-in");
    assert.equal(clearedAnalysis.reactions[1]?.memeAssetId, "meme-shock");
    assert.equal(clearedAnalysis.reactions[1]?.comboId, "shock");

    const laugh = asset({
      id: "meme-laugh",
      type: "meme",
      mediaKind: "image"
    });
    const boom = asset({
      id: "sfx-boom",
      type: "sfx",
      mediaKind: "audio"
    });
    const reactions: MatchedReaction[] = [
      {
        commentIndex: 0,
        emotion: "laughing",
        meme: laugh,
        sfx: boom,
        animation: "zoom-in",
        duration: 1.2,
        comboId: "punch",
        comboLocked: true
      }
    ];
    const clearedReactions = clearCommentReactionAssets(reactions, kinds);
    assert.equal(clearedReactions[0]?.meme, null);
    assert.equal(clearedReactions[0]?.sfx, null);
    assert.equal(clearedReactions[0]?.comboId, "punch");
    assert.equal(clearedReactions[0]?.comboLocked, true);
    assert.equal(isCommentMemeOrSfxClip(project.clips.find((clip) => clip.id === "meme-0")!), true);
  });

  it("clears unlocked post-topic overlays and keeps the intro topic meme", () => {
    const project = createEmptyTimelineProject();
    project.clips = [
      overlayClip({
        id: "topic-meme",
        trackId: "meme",
        commentIndex: null,
        file: "topic.png"
      }),
      overlayClip({
        id: "meme-topic-post",
        trackId: "meme",
        commentIndex: TOPIC_POST_COMMENT_INDEX,
        file: "after.png"
      }),
      overlayClip({
        id: "sfx-topic-post",
        trackId: "sfx",
        commentIndex: TOPIC_POST_COMMENT_INDEX,
        file: "after.mp3"
      })
    ];
    const kinds = collectClearedOverlayKinds(project);
    assert.deepEqual(kinds.get(TOPIC_POST_COMMENT_INDEX), {
      meme: true,
      sfx: true
    });
    const next = clearCommentMemesAndSfx(project);
    assert.deepEqual(
      next.clips.map((clip) => clip.id),
      ["topic-meme"]
    );
    const cleared = clearCommentAnalysisAssets(
      analysis({
        topicMemeId: "topic-card",
        topicPostMemeId: "after-meme",
        topicPostSfxId: "after-sfx"
      }),
      kinds
    );
    assert.equal(cleared.topicMemeId, "topic-card");
    assert.equal(cleared.topicPostMemeId, null);
    assert.equal(cleared.topicPostSfxId, null);
  });

  it("rebuilds the timeline after clearing comment memes in IPC", () => {
    const ipc = readFileSync(
      path.join(repoRoot, "src/electron/ipc.ts"),
      "utf8"
    );
    const handler = ipc.slice(
      ipc.indexOf('"project:clear-comment-memes"')
    );
    assert.match(handler, /clearCommentAnalysisAssets/);
    assert.match(handler, /clearCommentReactionAssets/);
    assert.match(handler, /store\.rebuildTimeline\(projectId\)/);
    assert.doesNotMatch(
      handler.slice(0, handler.indexOf("project:save-timeline-project")),
      /saveTimelineProjectAndLoad/
    );
  });
});

describe("timeline undo redo", () => {
  type EditorState = {
    history: TimelineHistory;
    present: TimelineProject;
  };

  function editorState(present = createSpikeTimelineProject()): EditorState {
    return { history: emptyTimelineHistory(), present };
  }

  function applyChange(
    state: EditorState,
    next: TimelineProject
  ): EditorState {
    if (timelineProjectsEqual(state.present, next)) {
      return state;
    }
    return {
      history: pushHistory(state.history, state.present),
      present: next
    };
  }

  function undo(state: EditorState): EditorState {
    const result = undoHistory(state.history, state.present);
    assert.ok(result);
    return { history: result.history, present: result.present };
  }

  function redo(state: EditorState): EditorState {
    const result = redoHistory(state.history, state.present);
    assert.ok(result);
    return { history: result.history, present: result.present };
  }

  it("returns undefined when undo or redo stacks are empty", () => {
    const present = createSpikeTimelineProject();
    assert.equal(undoHistory(emptyTimelineHistory(), present), undefined);
    assert.equal(redoHistory(emptyTimelineHistory(), present), undefined);
  });

  it("splits at the playhead then undoes and redoes the split", () => {
    const start = editorState();
    const original = start.present.clips.find((clip) => clip.id === "meme-b");
    assert.ok(original);
    const splitAt = roundTime(original.start + original.duration / 2);
    const splitId = `meme-b-split-${Math.round(splitAt * 1000)}`;
    let state = applyChange(
      start,
      splitClip(start.present, "meme-b", splitAt)
    );
    assert.equal(state.present.clips.filter((clip) => clip.id === "meme-b" || clip.id === splitId).length, 2);
    const left = state.present.clips.find((clip) => clip.id === "meme-b");
    const right = state.present.clips.find((clip) => clip.id === splitId);
    assert.ok(left);
    assert.ok(right);
    assert.equal(left.duration, roundTime(splitAt - original.start));
    assert.equal(right.start, splitAt);
    assert.equal(right.trimIn, roundTime(original.trimIn + (splitAt - original.start)));

    state = undo(state);
    assert.equal(state.present.clips.some((clip) => clip.id === splitId), false);
    const restored = state.present.clips.find((clip) => clip.id === "meme-b");
    assert.ok(restored);
    assert.equal(restored.duration, original.duration);
    assert.equal(restored.id, original.id);

    state = redo(state);
    const redoneRight = state.present.clips.find((clip) => clip.id === splitId);
    assert.ok(redoneRight);
    assert.equal(redoneRight.start, splitAt);
    assert.equal(redoneRight.trimIn, right.trimIn);
  });

  it("moves a clip then undoes and redoes the start time", () => {
    const start = editorState();
    const original = start.present.clips.find((clip) => clip.id === "meme-b");
    assert.ok(original);
    let state = applyChange(
      start,
      moveEditorClip(start.present, "meme-b", 3.2)
    );
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-b")?.start,
      3.2
    );
    state = undo(state);
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-b")?.start,
      original.start
    );
    state = redo(state);
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-b")?.start,
      3.2
    );
  });

  it("undoes split then move as separate steps and redos both", () => {
    const start = editorState();
    const original = start.present.clips.find((clip) => clip.id === "meme-b");
    assert.ok(original);
    const splitAt = original.start + 0.5;
    const splitId = `meme-b-split-${Math.round(splitAt * 1000)}`;
    let state = applyChange(
      start,
      splitClip(start.present, "meme-b", splitAt)
    );
    const afterSplit = state.present;
    state = applyChange(state, moveEditorClip(state.present, splitId, 1.1));
    assert.equal(
      state.present.clips.find((clip) => clip.id === splitId)?.start,
      1.1
    );

    state = undo(state);
    assert.equal(
      state.present.clips.find((clip) => clip.id === splitId)?.start,
      afterSplit.clips.find((clip) => clip.id === splitId)?.start
    );
    assert.equal(state.present.clips.some((clip) => clip.id === splitId), true);

    state = undo(state);
    assert.equal(state.present.clips.some((clip) => clip.id === splitId), false);
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-b")?.duration,
      original.duration
    );

    state = redo(state);
    assert.equal(state.present.clips.some((clip) => clip.id === splitId), true);
    state = redo(state);
    assert.equal(
      state.present.clips.find((clip) => clip.id === splitId)?.start,
      1.1
    );
  });

  it("round-trips trim, remove, lock, fades, combo, beep, and auto-format", () => {
    let state = editorState();
    const voice = state.present.clips.find((clip) => clip.id === "voice");
    assert.ok(voice);

    state = applyChange(
      state,
      trimEditorClip(state.present, "voice", "out", voice.start + 2)
    );
    assert.equal(
      state.present.clips.find((clip) => clip.id === "voice")?.duration,
      2
    );
    state = undo(state);
    assert.equal(
      state.present.clips.find((clip) => clip.id === "voice")?.duration,
      voice.duration
    );
    state = redo(state);

    state = applyChange(state, removeEditorClip(state.present, "beep"));
    assert.equal(state.present.clips.some((clip) => clip.id === "beep"), false);
    state = undo(state);
    assert.equal(state.present.clips.some((clip) => clip.id === "beep"), true);
    state = redo(state);

    state = applyChange(state, setClipLocked(state.present, "meme-a", true));
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-a")?.locked,
      true
    );
    state = undo(state);
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-a")?.locked,
      false
    );
    state = redo(state);

    state = applyChange(state, setClipFades(state.present, "comment", 0.5, 0.4));
    const faded = state.present.clips.find((clip) => clip.id === "comment");
    assert.equal(faded?.fadeIn, 0.5);
    assert.equal(faded?.fadeOut, 0.4);
    state = undo(state);
    const unfaded = state.present.clips.find((clip) => clip.id === "comment");
    assert.equal(unfaded?.fadeIn, 0.2);
    assert.equal(unfaded?.fadeOut, 0.2);
    state = redo(state);

    const punch = getBuiltinCombo("punch");
    state = applyChange(
      state,
      applyComboToProject(state.present, "meme-b", punch)
    );
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-b")?.animation,
      "zoom-in"
    );
    state = undo(state);
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-b")?.animation,
      undefined
    );
    state = redo(state);
    state = applyChange(state, clearComboOnProject(state.present, "meme-b"));
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-b")?.comboId,
      "none"
    );
    state = undo(state);
    assert.equal(
      state.present.clips.find((clip) => clip.id === "meme-b")?.animation,
      "zoom-in"
    );

    state = applyChange(state, addBeepClip(state.present, 1.5));
    assert.equal(state.present.clips.some((clip) => clip.id === "beep-1500"), true);
    state = undo(state);
    assert.equal(state.present.clips.some((clip) => clip.id === "beep-1500"), false);
    state = redo(state);

    const beforeFormat = state.present.clips.map((clip) => ({
      id: clip.id,
      start: clip.start,
      duration: clip.duration
    }));
    const formatted = formatTimelineProject(state.present, {
      ...DEFAULT_AUTO_FORMAT,
      sceneGap: 1
    });
    const formatChanged = !timelineProjectsEqual(state.present, formatted);
    state = applyChange(state, formatted);
    const afterFormat = state.present.clips.map((clip) => ({
      id: clip.id,
      start: clip.start,
      duration: clip.duration
    }));
    if (formatChanged) {
      state = undo(state);
      assert.deepEqual(
        state.present.clips.map((clip) => ({
          id: clip.id,
          start: clip.start,
          duration: clip.duration
        })),
        beforeFormat
      );
      state = redo(state);
      assert.deepEqual(
        state.present.clips.map((clip) => ({
          id: clip.id,
          start: clip.start,
          duration: clip.duration
        })),
        afterFormat
      );
    }
  });

  it("drops the redo stack when a new edit is pushed after undo", () => {
    let state = applyChange(
      editorState(),
      moveEditorClip(createSpikeTimelineProject(), "meme-b", 2)
    );
    state = undo(state);
    assert.equal(state.history.future.length, 1);
    state = applyChange(state, moveEditorClip(state.present, "meme-b", 4));
    assert.equal(state.history.future.length, 0);
    assert.equal(redoHistory(state.history, state.present), undefined);
  });

  it("caps the past stack at 40 entries", () => {
    let state = editorState();
    for (let index = 0; index < HISTORY_LIMIT + 1; index += 1) {
      state = applyChange(
        state,
        moveEditorClip(state.present, "meme-b", 0.1 * (index + 1))
      );
    }
    assert.equal(state.history.past.length, HISTORY_LIMIT);
  });

  it("does not push a no-op split or an unchanged move", () => {
    const start = editorState();
    const meme = start.present.clips.find((clip) => clip.id === "meme-b");
    assert.ok(meme);
    const afterEdgeSplit = applyChange(
      start,
      splitClip(start.present, "meme-b", meme.start)
    );
    assert.equal(afterEdgeSplit.history.past.length, 0);
    const afterSameMove = applyChange(
      start,
      moveEditorClip(start.present, "meme-b", meme.start)
    );
    assert.equal(afterSameMove.history.past.length, 0);
  });

  it("maps Ctrl+Z and Ctrl+Y and ignores input fields and Shift+Z", () => {
    assert.equal(
      timelineHotkey({ ctrlKey: true, code: "KeyZ" }),
      "undo"
    );
    assert.equal(
      timelineHotkey({ ctrlKey: true, code: "KeyY" }),
      "redo"
    );
    assert.equal(timelineHotkey({ ctrlKey: false, code: "KeyZ" }), undefined);
    assert.equal(
      timelineHotkey({ ctrlKey: true, shiftKey: true, code: "KeyZ" }),
      undefined
    );
    assert.equal(
      timelineHotkey({
        ctrlKey: true,
        code: "KeyZ",
        target: { tagName: "INPUT" }
      }),
      undefined
    );
    assert.equal(
      timelineHotkey({
        ctrlKey: true,
        code: "KeyY",
        target: { tagName: "TEXTAREA" }
      }),
      undefined
    );
  });
});

describe("timeline persist performance", () => {
  it("treats the same clip files as an unchanged preview set", () => {
    const project = createSpikeTimelineProject();
    const files = clipPreviewFiles(project.clips);
    assert.deepEqual(files, clipPreviewFiles(project.clips));
    assert.equal(previewFilesChanged(files, files), false);
    assert.equal(
      previewFilesChanged(files, [...files, "spike/extra.png"]),
      true
    );
  });

  it("skips combo stamping when only fades change", () => {
    const previous = createSpikeTimelineProject();
    const faded = setClipFades(previous, "meme-b", 0.5, 0.4);
    assert.equal(comboStampNeeded(previous, faded), false);
    const punched = applyComboToProject(
      previous,
      "meme-b",
      getBuiltinCombo("punch")
    );
    assert.equal(comboStampNeeded(previous, punched), true);
    assert.equal(comboStampNeeded(undefined, previous), true);
  });

  it("records one burst origin so several fade tweaks undo together", () => {
    const origin = createSpikeTimelineProject();
    const first = setClipFades(origin, "comment", 0.4, 0.2);
    const second = setClipFades(first, "comment", 0.5, 0.3);
    const burst = continueEditorBurst(
      continueEditorBurst(undefined, origin, first),
      origin,
      second
    );
    const flushed = flushEditorBurst(burst, timelineProjectsEqual);
    assert.ok(flushed);
    assert.equal(flushed.origin.clips.find((clip) => clip.id === "comment")?.fadeIn, 0.2);
    assert.equal(flushed.latest.clips.find((clip) => clip.id === "comment")?.fadeIn, 0.5);
    let history = emptyTimelineHistory();
    history = pushHistory(history, flushed.origin);
    const undone = undoHistory(history, flushed.latest);
    assert.ok(undone);
    assert.equal(
      undone.present.clips.find((clip) => clip.id === "comment")?.fadeIn,
      0.2
    );
    assert.equal(
      flushEditorBurst(
        continueEditorBurst(undefined, origin, origin),
        timelineProjectsEqual
      ),
      undefined
    );
  });
});

describe("clip preview position", () => {
  it("maps pointer deltas onto clamped clip x/y", () => {
    const moved = clipPositionFromPointer({
      originX: 100,
      originY: 100,
      startClipX: 0,
      startClipY: 0,
      clientX: 150,
      clientY: 80,
      stageWidth: 200,
      stageHeight: 400
    });
    assert.equal(moved.x, 0.5);
    assert.equal(moved.y, 0.1);
    assert.equal(clampClipAxis(2), 1);
    assert.equal(clampClipAxis(-3), -1);
    const clamped = clipPositionFromPointer({
      originX: 0,
      originY: 0,
      startClipX: 0.9,
      startClipY: -0.9,
      clientX: 200,
      clientY: 400,
      stageWidth: 100,
      stageHeight: 100
    });
    assert.equal(clamped.x, 1);
    assert.equal(clamped.y, -1);
  });

  it("writes x/y for meme video and images and skips locked or audio clips", () => {
    const project = createSpikeTimelineProject();
    const meme = setClipPosition(project, "meme-b", 0.25, -0.4);
    assert.equal(meme.clips.find((clip) => clip.id === "meme-b")?.x, 0.25);
    assert.equal(meme.clips.find((clip) => clip.id === "meme-b")?.y, -0.4);
    const video = setClipPosition(project, "meme-a", -0.2, 0.3);
    assert.equal(video.clips.find((clip) => clip.id === "meme-a")?.x, -0.2);
    const image = setClipPosition(project, "comment", 0.1, 0.2);
    assert.equal(image.clips.find((clip) => clip.id === "comment")?.x, 0.1);
    const locked = setClipLocked(project, "meme-b", true);
    assert.equal(setClipPosition(locked, "meme-b", 1, 1), locked);
    assert.equal(setClipPosition(project, "voice", 0.5, 0.5), project);
    assert.equal(setClipPosition(project, "bg", 0.5, 0.5), project);
    assert.equal(canMoveClipOnPreview({ trackId: "meme", kind: "image" }), true);
    assert.equal(canMoveClipOnPreview({ trackId: "voice", kind: "audio" }), false);
    assert.equal(setClipPosition(meme, "meme-b", 0.25, -0.4), meme);
    const workspace = readFileSync(
      path.join(repoRoot, "renderer/features/preview/TimelineWorkspace.tsx"),
      "utf8"
    );
    assert.match(workspace, /canMoveClipOnPreview\(clip\)/);
    assert.match(workspace, /TOPIC_TITLE_TRANSFORM_Y/);
  });

  it("marks a punch combo custom after the overlay is moved", () => {
    const punched = applyComboToProject(
      createSpikeTimelineProject(),
      "meme-b",
      getBuiltinCombo("punch")
    );
    const clip = punched.clips.find((item) => item.id === "meme-b");
    assert.ok(clip);
    assert.equal(isCustomCombo(clip), false);
    const moved = setClipPosition(punched, "meme-b", 0.4, 0);
    const next = moved.clips.find((item) => item.id === "meme-b");
    assert.ok(next);
    assert.equal(isCustomCombo(next), true);
  });
});

function sceneClip(
  partial: Pick<TimelineClip, "id" | "trackId" | "start" | "duration"> &
    Partial<TimelineClip>
): TimelineClip {
  return {
    trimIn: 0,
    sourceDuration: partial.duration,
    fadeIn: 0,
    fadeOut: 0,
    volume: 1,
    locked: false,
    label: partial.id,
    kind: partial.kind ?? (partial.trackId === "voice" ? "audio" : "image"),
    file: `${partial.id}.bin`,
    ...partial
  };
}

function twoCommentProject(): TimelineProject {
  const project = createEmptyTimelineProject();
  project.clips = [
    sceneClip({
      id: "bg",
      trackId: "background",
      start: 0,
      duration: 20,
      kind: "image"
    }),
    sceneClip({
      id: "img-0",
      trackId: "images",
      start: 0,
      duration: 3,
      commentIndex: 0
    }),
    sceneClip({
      id: "voice-0",
      trackId: "voice",
      start: 0.2,
      duration: 2,
      commentIndex: 0,
      kind: "audio"
    }),
    sceneClip({
      id: "img-1",
      trackId: "images",
      start: 5,
      duration: 3,
      commentIndex: 1
    }),
    sceneClip({
      id: "voice-1",
      trackId: "voice",
      start: 5.2,
      duration: 2,
      commentIndex: 1,
      kind: "audio"
    })
  ];
  return project;
}

describe("scene auto format", () => {
  it("packs comment scenes with the requested gap and keeps voice offset", () => {
    const packed = packTimelineScenes(twoCommentProject(), 1);
    const img0 = packed.clips.find((clip) => clip.id === "img-0");
    const voice0 = packed.clips.find((clip) => clip.id === "voice-0");
    const img1 = packed.clips.find((clip) => clip.id === "img-1");
    const voice1 = packed.clips.find((clip) => clip.id === "voice-1");
    assert.ok(img0 && voice0 && img1 && voice1);
    assert.equal(img0.start, 0);
    assert.equal(voice0.start, 0.2);
    const scene0End = Math.max(
      img0.start + img0.duration,
      voice0.start + voice0.duration
    );
    assert.equal(img1.start, roundTime(scene0End + 1));
    assert.equal(roundTime(voice1.start - img1.start), 0.2);
  });

  it("keeps after-topic overlays with the topic scene", () => {
    const project = createEmptyTimelineProject();
    project.clips = [
      sceneClip({
        id: "topic-img",
        trackId: "images",
        start: 0,
        duration: 2,
        commentIndex: null
      }),
      sceneClip({
        id: "topic-voice",
        trackId: "voice",
        start: 0.1,
        duration: 1.4,
        commentIndex: null,
        kind: "audio"
      }),
      sceneClip({
        id: "topic-meme",
        trackId: "meme",
        start: 1.5,
        duration: 1,
        commentIndex: TOPIC_POST_COMMENT_INDEX
      }),
      sceneClip({
        id: "img-0",
        trackId: "images",
        start: 4,
        duration: 2,
        commentIndex: 0
      })
    ];
    const packed = packTimelineScenes(project, 1);
    const voice = packed.clips.find((clip) => clip.id === "topic-voice");
    const meme = packed.clips.find((clip) => clip.id === "topic-meme");
    const comment = packed.clips.find((clip) => clip.id === "img-0");
    assert.ok(voice && meme && comment);
    assert.equal(meme.start - voice.start, 1.4);
    const topicEnd = meme.start + meme.duration;
    assert.equal(comment.start, roundTime(topicEnd + 1));
  });

  it("stretches background to the packed duration", () => {
    const packed = packTimelineScenes(twoCommentProject(), 1);
    const background = packed.clips.find((clip) => clip.id === "bg");
    assert.ok(background);
    assert.equal(background.start, 0);
    assert.equal(background.duration, packed.totalDuration);
  });

  it("places scenes back-to-back when the gap is 0", () => {
    const packed = packTimelineScenes(twoCommentProject(), 0);
    const img0 = packed.clips.find((clip) => clip.id === "img-0");
    const img1 = packed.clips.find((clip) => clip.id === "img-1");
    const voice0 = packed.clips.find((clip) => clip.id === "voice-0");
    assert.ok(img0 && img1 && voice0);
    const scene0End = Math.max(
      img0.start + img0.duration,
      voice0.start + voice0.duration
    );
    assert.equal(img1.start, scene0End);
  });

  it("packs a parent and reply back-to-back inside one thread", () => {
    const packed = packTimelineScenes(twoCommentProject(), 1, [
      {},
      { parentCommentIndex: 0 }
    ]);
    const img0 = packed.clips.find((clip) => clip.id === "img-0");
    const voice0 = packed.clips.find((clip) => clip.id === "voice-0");
    const img1 = packed.clips.find((clip) => clip.id === "img-1");
    const voice1 = packed.clips.find((clip) => clip.id === "voice-1");
    assert.ok(img0 && voice0 && img1 && voice1);
    assert.equal(img0.start, 0);
    assert.equal(img1.start, 3);
    assert.equal(img0.start + img0.duration, img1.start + img1.duration);
    assert.equal(roundTime(voice1.start - img1.start), 0.2);
  });

  it("keeps the parent image visible through the reply", () => {
    const project = createEmptyTimelineProject();
    project.clips = [
      sceneClip({
        id: "img-0",
        trackId: "images",
        start: 0,
        duration: 6,
        commentIndex: 0
      }),
      sceneClip({
        id: "voice-0",
        trackId: "voice",
        start: 0.2,
        duration: 2,
        commentIndex: 0,
        kind: "audio"
      }),
      sceneClip({
        id: "img-1",
        trackId: "images",
        start: 3,
        duration: 3,
        commentIndex: 1
      }),
      sceneClip({
        id: "voice-1",
        trackId: "voice",
        start: 3.2,
        duration: 2,
        commentIndex: 1,
        kind: "audio"
      })
    ];
    const packed = packTimelineScenes(project, 1, [
      {},
      { parentCommentIndex: 0 }
    ]);
    const img0 = packed.clips.find((clip) => clip.id === "img-0");
    const voice0 = packed.clips.find((clip) => clip.id === "voice-0");
    const img1 = packed.clips.find((clip) => clip.id === "img-1");
    const voice1 = packed.clips.find((clip) => clip.id === "voice-1");
    assert.ok(img0 && voice0 && img1 && voice1);
    assert.equal(img1.start, 3);
    assert.equal(img0.duration, 6);
    assert.equal(img1.duration, 3);
    assert.equal(img0.start + img0.duration, img1.start + img1.duration);
    assert.equal(roundTime(voice0.start - img0.start), 0.2);
    assert.equal(roundTime(voice1.start - img1.start), 0.2);
    assert.equal(voice0.duration, 2);
  });

  it("restores a parent image that was packed before the reply instead of over it", () => {
    const project = createEmptyTimelineProject();
    project.clips = [
      sceneClip({
        id: "img-0",
        trackId: "images",
        start: 0,
        duration: 6,
        commentIndex: 0
      }),
      sceneClip({
        id: "voice-0",
        trackId: "voice",
        start: 0.2,
        duration: 2,
        commentIndex: 0,
        kind: "audio"
      }),
      sceneClip({
        id: "img-1",
        trackId: "images",
        start: 6,
        duration: 3,
        commentIndex: 1
      }),
      sceneClip({
        id: "voice-1",
        trackId: "voice",
        start: 6.2,
        duration: 2,
        commentIndex: 1,
        kind: "audio"
      })
    ];
    const packed = packTimelineScenes(project, 1, [
      {},
      { parentCommentIndex: 0 }
    ]);
    const img0 = packed.clips.find((clip) => clip.id === "img-0");
    const img1 = packed.clips.find((clip) => clip.id === "img-1");
    const voice0 = packed.clips.find((clip) => clip.id === "voice-0");
    const voice1 = packed.clips.find((clip) => clip.id === "voice-1");
    assert.ok(img0 && img1 && voice0 && voice1);
    assert.equal(img1.start, 3);
    assert.equal(img0.duration, 6);
    assert.equal(img1.duration, 3);
    assert.equal(img0.start + img0.duration, img1.start + img1.duration);
    assert.equal(roundTime(voice1.start - img1.start), 0.2);
    const again = packTimelineScenes(packed, 1, [
      {},
      { parentCommentIndex: 0 }
    ]);
    const img0Again = again.clips.find((clip) => clip.id === "img-0");
    const img1Again = again.clips.find((clip) => clip.id === "img-1");
    assert.ok(img0Again && img1Again);
    assert.equal(img1Again.start, 3);
    assert.equal(img0Again.duration, 6);
  });

  it("keeps sceneGap between two root comments", () => {
    const packed = packTimelineScenes(twoCommentProject(), 0.5, [{}, {}]);
    const img0 = packed.clips.find((clip) => clip.id === "img-0");
    const voice0 = packed.clips.find((clip) => clip.id === "voice-0");
    const img1 = packed.clips.find((clip) => clip.id === "img-1");
    assert.ok(img0 && voice0 && img1);
    const thread0End = Math.max(
      img0.start + img0.duration,
      voice0.start + voice0.duration
    );
    assert.equal(img1.start, roundTime(thread0End + 0.5));
  });

  it("treats a reply shown as root as its own scene", () => {
    const packed = packTimelineScenes(twoCommentProject(), 1, [{}, {}]);
    const img0 = packed.clips.find((clip) => clip.id === "img-0");
    const voice0 = packed.clips.find((clip) => clip.id === "voice-0");
    const img1 = packed.clips.find((clip) => clip.id === "img-1");
    assert.ok(img0 && voice0 && img1);
    const thread0End = Math.max(
      img0.start + img0.duration,
      voice0.start + voice0.duration
    );
    assert.equal(img1.start, roundTime(thread0End + 1));
  });
});

describe("import comment image", () => {
  it("names processed comment pngs from a 0-based index", () => {
    assert.equal(commentProcessedPngName(0), "comment-01.png");
    assert.equal(commentProcessedPngName(11), "comment-12.png");
  });

  it("writes a processed png and returns an empty comment", async () => {
    const projectDir = await mkdtemp(
      path.join(tmpdir(), "xamxixiu-comment-image-")
    );
    const bytes = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 4,
        background: { r: 20, g: 30, b: 40, alpha: 1 }
      }
    })
      .png()
      .toBuffer();

    try {
      const comment = await importCommentImage({
        projectDir,
        imageIndex: 3,
        bytes
      });
      assert.deepEqual(comment, emptyImportedComment(3));
      const output = path.join(
        projectDir,
        "processed",
        "comment-04.png"
      );
      const written = await sharp(output).metadata();
      assert.equal(written.format, "png");
      assert.ok(written.width && written.width <= 12);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it("rejects empty image bytes", async () => {
    await assert.rejects(
      () =>
        importCommentImage({
          projectDir: tmpdir(),
          imageIndex: 0,
          bytes: Buffer.alloc(0)
        }),
      /Comment image cannot be empty/
    );
  });
});


