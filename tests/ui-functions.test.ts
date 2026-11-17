import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { Asset } from "../src/assets/library";
import {
  matchReactions,
  type MatchedReaction
} from "../src/assets/matcher";
import {
  buildCommentForest,
  reorderComments
} from "../src/comments/order";
import { isAnalysisStale } from "../src/comments/analysis-stale";
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
  shouldGenerateTopicTitleVoice,
  TOPIC_POST_COMMENT_INDEX,
  TOPIC_TITLE_MAX_LENGTH,
  TOPIC_TITLE_VOICE_MIN_TEXT_LENGTH
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
import { SPIKE_DECISION } from "../src/hyperframes/engine";
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
  clipPositionFromPointer
} from "../src/timeline/clip-position";
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
import type { ThreadAnalysis, ThreadComment, VideoTimeline } from "../src/types";
import { cn } from "../renderer/features/ui/cn";
import { chooseParentIndex } from "../src/extract";
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
  getTimelineTracks,
  isVideoAsset,
  targetFromProjectClip,
  TRACK_IDS,
  TRACK_LABELS,
  trackLaneHeight
} from "../renderer/features/preview/timeline-tracks";
import {
  getPreviewAudioTracks,
  getPreviewScene,
  previewSeekThreshold
} from "../renderer/features/preview/preview-timeline";
import {
  isPreviewFullscreen,
  previewFrameClass,
  previewHostClass,
  previewStageMode
} from "../renderer/features/preview/preview-chrome";
import {
  formatProjectId,
  identityImageSlots,
  withVoiceAssignment
} from "../renderer/features/workflow/project-helpers";
import { WORKFLOW_STEPS } from "../renderer/features/workflow/steps";
import { createDefaultAnalysis } from "../src/ai/default-analysis";
import {
  APP_VIEW_HREF,
  APP_VIEWS,
  appViewFromPathname,
  appViewPanelClass,
  isAppViewVisible,
  keptAppViewPanels
} from "../renderer/features/app/app-view";
import { playingIfActive } from "../renderer/features/preview/use-timeline-preview";

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

describe("app tab keep-alive", () => {
  it("maps renderer pathnames to chrome tabs", () => {
    assert.equal(appViewFromPathname("/"), "workflow");
    assert.equal(appViewFromPathname(""), "workflow");
    assert.equal(appViewFromPathname("/library"), "library");
    assert.equal(appViewFromPathname("/library/"), "library");
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
    assert.doesNotMatch(chrome, /<a\b[^>]*href=/);
    assert.equal(APP_VIEW_HREF.workflow, "/");
    assert.equal(APP_VIEW_HREF.library, "/library/");

    assert.match(shell, /<WorkflowWorkspace/);
    assert.match(shell, /<AssetLibraryManager/);
    assert.doesNotMatch(
      shell,
      /active === "workflow" \?\s*\(?\s*<WorkflowWorkspace/
    );
    assert.doesNotMatch(
      shell,
      /active === "library" \?\s*\(?\s*<AssetLibraryManager/
    );
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

  it("skips title voice for short topic text", () => {
    assert.equal(shouldGenerateTopicTitleVoice("short"), false);
    assert.equal(
      shouldGenerateTopicTitleVoice(
        "a".repeat(TOPIC_TITLE_VOICE_MIN_TEXT_LENGTH + 1)
      ),
      true
    );
  });

  it("lets the user override the default title-voice rule", () => {
    assert.equal(
      resolveTopicTitleVoiceEnabled({ topicTitleVoiceMode: "on" }, "short"),
      true
    );
    assert.equal(
      resolveTopicTitleVoiceEnabled(
        { topicTitleVoiceMode: "off" },
        "a".repeat(TOPIC_TITLE_VOICE_MIN_TEXT_LENGTH + 1)
      ),
      false
    );
    assert.equal(
      resolveTopicTitleVoiceEnabled({ topicTitleVoiceMode: "auto" }, "short"),
      false
    );
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

describe("timeline tracks", () => {
  it("exposes the track ids including beep", () => {
    assert.deepEqual([...TRACK_IDS], [
      "background",
      "title-card",
      "images",
      "meme",
      "video",
      "voice",
      "sfx",
      "beep",
      "music"
    ]);
    assert.equal(TRACK_LABELS.voice, "Voice");
    assert.equal(TRACK_LABELS.beep, "Beep");
    assert.equal(trackLaneHeight("meme"), 44);
    assert.equal(trackLaneHeight("images"), 44);
    assert.equal(trackLaneHeight("voice"), 32);
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
    assert.deepEqual(meme?.target, { kind: "meme", commentIndex: 0 });
    const sfx = byId.sfx.clips.find((clip) => clip.file === "boom.mp3");
    assert.deepEqual(sfx?.target, { kind: "sfx", commentIndex: 0 });
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

    assert.deepEqual(meme?.target, { kind: "meme", commentIndex: 0 });
    assert.equal(clipOpensAssetPicker(meme!), true);
    assert.equal(canRemoveTimelineAsset(meme!.target!), true);

    assert.deepEqual(video?.target, { kind: "video", commentIndex: 0 });
    assert.equal(clipOpensAssetPicker(video!), true);
    assert.equal(canRemoveTimelineAsset(video!.target!), true);

    assert.deepEqual(sfx?.target, { kind: "sfx", commentIndex: 0 });
    assert.equal(clipOpensAssetPicker(sfx!), true);
    assert.equal(canRemoveTimelineAsset(sfx!.target!), true);

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
      { kind: "video", commentIndex: 2 }
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

  it("does not add a topic-post meme placeholder when one already exists", () => {
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
    assert.equal(
      memeTrack?.clips.some((clip) => clip.id === "meme-add-topic"),
      false
    );
    assert.equal(
      memeTrack?.clips.some((clip) => clip.file === "after-topic.png"),
      true
    );
  });

  it("does not add a meme placeholder when that comment already has a meme", () => {
    const tracks = getProjectTracks(videoTimelineToProject(timeline()));
    const memeTrack = tracks.find((track) => track.id === "meme");
    assert.equal(
      memeTrack?.clips.some((clip) => clip.id === "meme-add-0"),
      false
    );
    assert.equal(
      memeTrack?.clips.some((clip) => clip.file === "meme.png"),
      true
    );
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
    assert.match(previewFrameClass("docked"), /52vh/);
    assert.doesNotMatch(previewFrameClass("docked"), /38vh/);
    assert.match(previewHostClass("overlay"), /fixed inset-0/);
    assert.match(previewFrameClass("native"), /100dvh/);
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
      "sfx-1"
    );
    assert.equal(
      selectedAssetId({ kind: "meme", commentIndex: 0 }, current, reactions),
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
          animation: "shake",
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

