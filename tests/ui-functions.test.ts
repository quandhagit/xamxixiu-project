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
  normalizeTopicTitle,
  resolveTopicTitleVoiceEnabled,
  shouldGenerateTopicTitleVoice,
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
  clearComboOnProject,
  setClipSfxOffset
} from "../renderer/features/preview/timeline-edit";
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
  withAnimationLabel
} from "../src/timeline/clip-motion";
import { videoTimelineToProject } from "../src/timeline/from-video-timeline";
import {
  cloneTimelineProject,
  type TimelineClip
} from "../src/timeline/project";
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
import { applyMemeSuggestions } from "../src/ai/suggest-memes";
import { sanitizeAnalysis } from "../src/assets/prompt-catalog";
import {
  isCommentMemeOrSfxClip,
  isTopicIntroMemeOrOpenSfx
} from "../src/timeline/comment-overlay-clips";
import {
  clearCommentAnalysisAssets,
  clearCommentMemesAndSfx,
  clearCommentReactionAssets
} from "../src/timeline/clear-comment-assets";
import type { ThreadAnalysis, ThreadComment, VideoTimeline } from "../src/types";
import { cn } from "../renderer/features/ui/cn";
import {
  assetsForTarget,
  pickerTitle,
  selectedAssetId
} from "../renderer/features/preview/asset-picker";
import { assetFileName, assetMediaSrc } from "../renderer/features/preview/asset-media";
import {
  clipActionDockOpen,
  clipActionsDockOutside,
  clipBarWidth,
  clipCanRemove,
  clipOpensAssetPicker,
  clipPointerIntent,
  formatClipLabel,
  getProjectTracks,
  getTimelineTracks,
  isVideoAsset,
  targetFromProjectClip,
  TRACK_IDS,
  TRACK_LABELS
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
  it("keeps the five existing steps in pipeline order", () => {
    assert.deepEqual([...WORKFLOW_STEPS], [
      "INPUT",
      "CAPTURE",
      "ANALYZE",
      "VOICE",
      "TIMELINE"
    ]);
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

  it("docks lock and remove outside the bar when a clip is too short", () => {
    assert.equal(clipBarWidth(0.2, 64), 18);
    assert.equal(clipBarWidth(2, 64), 128);
    assert.equal(clipActionsDockOutside(18), true);
    assert.equal(clipActionsDockOutside(40), true);
    assert.equal(clipActionsDockOutside(72), false);
    assert.equal(clipActionDockOpen({ selected: false, hovered: false }), false);
    assert.equal(clipActionDockOpen({ selected: false, hovered: true }), true);
    assert.equal(clipActionDockOpen({ selected: true, hovered: false }), true);
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

describe("speech text cleanup", () => {
  it("strips emoji, elongated letters, and repeated punctuation", () => {
    assert.equal(cleanSpeechText("Trờiii 😂 quáaaaa!!!!"), "Trời quáa!");
  });

  it("builds and applies accept/reject diffs", () => {
    const diffs = diffCleanedSpeechText([
      { text: "ok" },
      { text: "heeee 🔥" }
    ]);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0]?.index, 1);
    const accepted = applySpeechTextDiffs(
      [{ text: "ok" }, { text: "heeee 🔥" }],
      diffs,
      [1]
    );
    assert.equal(accepted[1]?.text, "he");
  });
});

describe("timeline project and hyperframes", () => {
  it("records the Hyperframes engine decision", () => {
    assert.equal(SPIKE_DECISION.engine, "hyperframes");
    assert.equal(SPIKE_DECISION.canvas.width, 1080);
    assert.equal(SPIKE_DECISION.canvas.height, 1920);
  });

  it("converts a video timeline, auto-formats memes, and compiles HTML", () => {
    const project = videoTimelineToProject(timeline());
    const formatted = autoFormat(project, {
      ...project.settings,
      memeGap: 0.2,
      memeMinDuration: 1,
      memeMaxDuration: 4,
      fadeIn: 0.3,
      fadeOut: 0.3
    });
    const meme = formatted.clips.find((clip) => clip.trackId === "meme");
    assert.ok(meme);
    assert.equal(meme?.fadeIn, 0.3);
    const html = compileTimelineProject(formatted);
    assert.match(html, /data-composition-id="xamxixiu"/);
    assert.match(html, /data-width="1080"/);
    assert.match(html, /data-height="1920"/);
  });

  it("trims voice, moves clips, and inserts a beep that mutes overlapping voice", () => {
    const spike = createSpikeTimelineProject();
    const withBeep = addBeepClip(spike, 1, 0.2);
    const beep = withBeep.clips.find((clip) => clip.trackId === "beep");
    assert.ok(beep);
    assert.equal(
      clipCanRemove({
        trackId: "beep",
        placeholder: false,
        locked: beep.locked
      }),
      true
    );
    const withoutBeep = removeClip(withBeep, beep.id);
    assert.equal(
      withoutBeep.clips.some((clip) => clip.id === beep.id),
      false
    );
    const moved = moveClip(withBeep, "comment", 0.5);
    const comment = moved.clips.find((clip) => clip.id === "comment");
    assert.equal(comment?.start, 0.5);
    const trimmed = trimClip(moved, "voice", "out", 3);
    const voice = trimmed.clips.find((clip) => clip.id === "voice");
    assert.ok((voice?.duration ?? 99) <= 3);
    const html = compileTimelineProject(withBeep);
    assert.match(html, /data-track-index="7"/);
  });

  it("flies topic title and topic meme up from the bottom", () => {
    assert.equal(clipAnimationLabel({ trackId: "title-card" }), "Slide up");
    assert.equal(
      withAnimationLabel("Hello", { trackId: "title-card" }),
      "Hello · Slide up"
    );
    assert.equal(clipUsesFlyUp({ trackId: "title-card" }), true);
    assert.equal(
      clipUsesFlyUp({ trackId: "meme", animation: "slide-up", commentIndex: 0 }),
      true
    );
    assert.equal(clipUsesFlyUp({ trackId: "meme", commentIndex: 0 }), false);
    assert.equal(clipFlyUpProgress(0, 0.35), 0);
    assert.equal(clipFlyUpProgress(0.35, 0.35), 1);
    assert.equal(clipFlyUpProgress(0, 0), 1);
    assert.equal(
      clipFlyUpTopPercent({ restTopPercent: 40, progress: 0, mode: "title" }),
      100
    );
    assert.equal(
      clipFlyUpTopPercent({ restTopPercent: 40, progress: 1, mode: "title" }),
      40
    );
    assert.equal(
      clipFlyUpTopPercent({ restTopPercent: 30, progress: 0, mode: "full" }),
      130
    );

    const source = timeline({
      topicIntro: {
        case: "short",
        title: "Hello",
        titleVoiceDuration: 0,
        openSfxFile: "open.mp3",
        openSfxDuration: 0.4,
        titleCardFile: "title.png",
        animationDuration: 0.35,
        blocksDuration: 2,
        captureStart: 0
      },
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
          overlays: [
            {
              type: "meme",
              file: "topic-meme.png",
              start: 0,
              duration: 2,
              animation: "slide-up",
              animationDuration: 0.35,
              y: 0.4,
              scale: 0.7
            }
          ]
        }
      ]
    });
    const project = videoTimelineToProject(source);
    const title = project.clips.find((clip) => clip.trackId === "title-card");
    const topicMeme = project.clips.find(
      (clip) => clip.trackId === "meme" && clip.file === "topic-meme.png"
    );
    const titleTrack = getProjectTracks(project).find(
      (track) => track.id === "title-card"
    );
    assert.match(titleTrack?.clips[0]?.label ?? "", /Slide up/);
    const memeTrack = getProjectTracks(project).find(
      (track) => track.id === "meme"
    );
    assert.match(
      memeTrack?.clips.find((clip) => clip.file === "topic-meme.png")?.label ?? "",
      /Slide up/
    );
    assert.equal(title?.animation, "slide-up");
    assert.equal(title?.animationDuration, 0.35);
    assert.equal(topicMeme?.animation, "slide-up");
    const html = compileTimelineProject(project);
    assert.match(html, /y: \d+/);
    assert.ok(title);
    const slower = setClipAnimationDuration(project, title.id, 0.8);
    assert.equal(
      slower.clips.find((clip) => clip.id === title.id)?.animationDuration,
      0.8
    );
    assert.match(
      compileTimelineProject(slower),
      /fromTo\("#title-card".*duration: 0.8/
    );
    const locked = cloneTimelineProject(project);
    const lockedTitle = locked.clips.find((clip) => clip.id === title.id);
    assert.ok(lockedTitle);
    lockedTitle.locked = true;
    assert.equal(
      setClipAnimationDuration(locked, title.id, 1).clips.find(
        (clip) => clip.id === title.id
      )?.animationDuration,
      0.35
    );
    const off = setClipAnimationDuration(project, title.id, 0);
    assert.doesNotMatch(
      compileTimelineProject(off),
      /fromTo\("#title-card"/
    );
  });

  it("does not move locked meme clips during auto format", () => {
    const project = createSpikeTimelineProject();
    const locked = project.clips.find((clip) => clip.id === "meme-b");
    assert.ok(locked);
    if (locked) {
      locked.locked = true;
      locked.start = 3;
    }
    const formatted = autoFormat(project);
    assert.equal(
      formatted.clips.find((clip) => clip.id === "meme-b")?.start,
      3
    );
  });
});

describe("meme combo presets", () => {
  function memeClip(partial: Partial<TimelineClip> = {}): TimelineClip {
    return {
      id: "meme-0",
      trackId: "meme",
      start: 1,
      duration: 1.4,
      trimIn: 0,
      sourceDuration: 1.4,
      file: "meme.png",
      fadeIn: 0.3,
      fadeOut: 0.3,
      volume: 1,
      locked: false,
      label: "Meme",
      kind: "image",
      commentIndex: 0,
      ...partial
    };
  }

  function comboLibrary(): Asset[] {
    return [
      asset({
        id: "meme-laugh",
        type: "meme",
        mediaKind: "image",
        category: "laughing"
      }),
      asset({
        id: "meme-laugh-2",
        type: "meme",
        mediaKind: "image",
        category: "laughing"
      }),
      asset({
        id: "sfx-boom",
        type: "sfx",
        mediaKind: "audio",
        category: "boom"
      }),
      asset({
        id: "sfx-boom-2",
        type: "sfx",
        mediaKind: "audio",
        category: "boom"
      })
    ];
  }

  function laughingReaction(commentIndex: number) {
    return {
      commentIndex,
      emotion: "laughing" as const,
      memeCategory: "laughing",
      sfxCategory: "boom",
      animation: "none" as const,
      duration: 1
    };
  }

  it("maps emotion to a built-in combo and skips stacked punches", () => {
    assert.equal(comboFromEmotion("laughing").id, "punch");
    assert.equal(comboFromEmotion("angry").id, "punch");
    assert.equal(
      comboFromEmotion("laughing", { previousPunch: true }).id,
      "soft"
    );
    assert.equal(comboFromEmotion("cringe").id, "cringe");
    assert.equal(comboFromEmotion("shocked").id, "shock");
    assert.equal(comboFromEmotion("happy").id, "soft");
    assert.equal(comboFromEmotion("laughing", { isVideo: true }).id, "none");
  });

  it("applies and clears a combo without deleting the meme file", () => {
    const punch = getBuiltinCombo("punch");
    const baked = applyCombo({ file: "kept.png", comboLocked: true }, punch);
    assert.equal(baked.file, "kept.png");
    assert.equal(baked.comboId, "punch");
    assert.equal(baked.scale, punch.scale);
    assert.equal(baked.animation, "zoom-in");
    const cleared = clearCombo(baked);
    assert.equal(cleared.file, "kept.png");
    assert.equal(cleared.comboId, "none");
    assert.equal(cleared.animation, undefined);
    assert.equal(cleared.comboLocked, false);
  });

  it("forces video memes to the none combo", () => {
    const thread = analysis({
      reactions: [laughingReaction(0)]
    });
    const matched = matchReactions(thread, [
      asset({
        id: "meme-vid",
        type: "meme",
        mediaKind: "video",
        category: "laughing"
      }),
      asset({
        id: "sfx-boom",
        type: "sfx",
        mediaKind: "audio",
        category: "boom"
      })
    ]);
    assert.equal(matched[0]?.meme?.mediaKind, "video");
    assert.equal(matched[0]?.sfx, null);
    assert.equal(matched[0]?.comboId, "none");
    assert.equal(matched[0]?.animation, "none");
  });

  it("assigns punch then soft when consecutive comments both punch", () => {
    const matched = matchReactions(
      analysis({
        reactions: [laughingReaction(0), laughingReaction(1)]
      }),
      comboLibrary()
    );
    const imageMatches = matched.filter((item) => item.meme?.mediaKind === "image");
    assert.equal(imageMatches[0]?.comboId, "punch");
    assert.equal(imageMatches[1]?.comboId, "soft");
  });

  it("falls back to a real meme/SFX when AI ids are missing and keeps comboId", () => {
    const library = comboLibrary();
    const matched = matchReactions(
      analysis({
        reactions: [
          {
            ...laughingReaction(0),
            memeAssetId: "not-a-real-id",
            memeCategory: "laughing",
            sfxAssetId: null,
            sfxCategory: null,
            comboId: "shock"
          }
        ]
      }),
      library
    );
    assert.ok(
      matched[0]?.meme?.id === "meme-laugh" ||
        matched[0]?.meme?.id === "meme-laugh-2"
    );
    assert.ok(matched[0]?.sfx);
    assert.equal(matched[0]?.comboId, "shock");
    assert.equal(matched[0]?.animation, "shake-1");
  });

  it("fills meme, sfx, and combo when AI returns no reactions", () => {
    const library = comboLibrary();
    const suggested = applyMemeSuggestions(
      analysis({
        reactions: [
          {
            commentIndex: 0,
            emotion: "laughing",
            memeCategory: null,
            sfxCategory: null,
            animation: "none",
            duration: 1
          }
        ]
      }),
      {},
      library,
      [0]
    );
    assert.equal(suggested.reactions[0]?.memeCategory, "laughing");
    assert.equal(suggested.reactions[0]?.comboId, "punch");
    assert.equal(suggested.reactions[0]?.animation, "zoom-in");
    const sanitized = sanitizeAnalysis(
      analysis({
        reactions: [
          {
            commentIndex: 0,
            emotion: "shocked",
            memeAssetId: "missing",
            memeCategory: null,
            sfxCategory: null,
            animation: "none",
            duration: 1
          }
        ]
      }),
      library
    );
    assert.equal(sanitized.reactions[0]?.memeAssetId, null);
    assert.equal(sanitized.reactions[0]?.memeCategory, "shocked");
    const assigned = assignReactionCombos(suggested.reactions);
    assert.equal(assigned[0]?.comboId, "punch");
  });

  it("keeps a locked combo on rematch and preserves custom bake on rebuild", () => {
    const library = comboLibrary();
    const image = library.find((item) => item.id === "meme-laugh");
    const sfx = library.find((item) => item.id === "sfx-boom");
    assert.ok(image);
    assert.ok(sfx);
    const rematched = matchReactions(
      analysis({ reactions: [laughingReaction(0)] }),
      library,
      [
        {
          commentIndex: 0,
          emotion: "laughing",
          meme: image,
          sfx,
          animation: "shake-1",
          duration: 1,
          comboId: "shock",
          comboLocked: true
        }
      ]
    );
    assert.equal(rematched[0]?.comboId, "shock");
    assert.equal(rematched[0]?.animation, "shake-1");

    const punch = getBuiltinCombo("punch");
    const previous = [
      applyCombo(memeClip({ file: "old.png", comboLocked: true }), punch)
    ];
    previous[0].scale = 0.41;
    const next = [
      applyCombo(memeClip({ file: "new.png", id: "meme-0" }), getBuiltinCombo("soft"))
    ];
    const preserved = preserveComboClips(next, previous);
    assert.equal(preserved[0]?.file, "new.png");
    assert.equal(preserved[0]?.comboId, "punch");
    assert.equal(preserved[0]?.scale, 0.41);
    assert.equal(isCustomCombo(previous[0]), true);

    const stamped = stampComboFromClips(
      [{ commentIndex: 0, comboId: "none" }],
      previous
    );
    assert.equal(stamped[0]?.comboId, "punch");
    assert.equal(stamped[0]?.comboLocked, true);
    assert.deepEqual(
      persistBuiltInComboIds(
        [{ commentIndex: 0, emotion: "laughing" }],
        rematched
      )[0]?.comboId,
      "shock"
    );
  });

  it("compiles zoom-in and shake with the same motion math as preview", () => {
    assert.equal(clipMotionName({ animation: "zoom-in" }), "zoom-in");
    assert.equal(clipMotionName({ animation: "shake-1" }), "shake");
    assert.equal(clipZoomMultiplier(0), 1.12);
    assert.equal(clipZoomMultiplier(1), 1);
    assert.equal(clipShakeOffsetPercent(1), 0);
    assert.equal(clipSlideLeftPercent(50, 0), -50);
    assert.equal(clipSlideLeftPercent(50, 1), 50);

    const project = createSpikeTimelineProject();
    const meme = project.clips.find((clip) => clip.id === "meme-b");
    assert.ok(meme);
    Object.assign(meme, applyCombo(meme, getBuiltinCombo("punch")));
    const zoomHtml = compileTimelineProject(project);
    assert.match(zoomHtml, /scale: 1.12/);
    Object.assign(meme, applyCombo(meme, getBuiltinCombo("shock")));
    const shakeHtml = compileTimelineProject(project);
    assert.match(shakeHtml, /repeat: 3, yoyo: true/);
    assert.match(shakeHtml, /x: 38/);
  });

  it("does not let auto-format wipe combo bake", () => {
    const punch = getBuiltinCombo("punch");
    const project = createSpikeTimelineProject();
    const meme = project.clips.find((clip) => clip.id === "meme-b");
    assert.ok(meme);
    Object.assign(meme, applyCombo(meme, punch));
    const formatted = autoFormat(project, {
      ...project.settings,
      fadeIn: 0.9,
      fadeOut: 0.9
    });
    const kept = formatted.clips.find((clip) => clip.id === "meme-b");
    assert.equal(kept?.comboId, "punch");
    assert.equal(kept?.fadeIn, punch.fadeIn);
    assert.equal(kept?.scale, punch.scale);
    assert.equal(kept?.animation, "zoom-in");
  });

  it("does not value-import .js paths from renderer-bundled src modules", () => {
    assert.deepEqual(clientJsValueImports(), []);
  });

  it("applies and clears a combo on the timeline without deleting the meme or SFX", () => {
    const punch = getBuiltinCombo("punch");
    const project = createSpikeTimelineProject();
    const meme = memeClip({ id: "meme-combo", start: 1, commentIndex: 0 });
    const sfx: TimelineClip = {
      id: "sfx-0",
      trackId: "sfx",
      start: 1,
      duration: 0.4,
      trimIn: 0,
      sourceDuration: 0.4,
      file: "boom.mp3",
      fadeIn: 0,
      fadeOut: 0,
      volume: 1,
      locked: false,
      label: "SFX",
      kind: "audio",
      commentIndex: 0
    };
    project.clips.push(meme, sfx);
    const baked = applyComboToProject(project, meme.id, punch);
    const bakedMeme = baked.clips.find((clip) => clip.id === meme.id);
    const bakedSfx = baked.clips.find((clip) => clip.id === sfx.id);
    assert.equal(bakedMeme?.file, "meme.png");
    assert.equal(bakedMeme?.comboId, "punch");
    assert.equal(bakedMeme?.animation, "zoom-in");
    assert.equal(bakedSfx?.file, "boom.mp3");
    assert.equal(bakedSfx?.start, 1 + punch.sfxOffset);
    const offset = setClipSfxOffset(baked, meme.id, 0.4);
    assert.equal(
      offset.clips.find((clip) => clip.id === sfx.id)?.start,
      1.4
    );
    const cleared = clearComboOnProject(offset, meme.id);
    const clearedMeme = cleared.clips.find((clip) => clip.id === meme.id);
    assert.equal(clearedMeme?.file, "meme.png");
    assert.equal(clearedMeme?.comboId, "none");
    assert.equal(clearedMeme?.animation, undefined);
    assert.equal(
      cleared.clips.find((clip) => clip.id === sfx.id)?.file,
      "boom.mp3"
    );
  });
});

describe("clear comment memes and sfx", () => {
  it("keeps title meme and Open SFX, removes comment meme/video/sfx", () => {
    assert.equal(
      isTopicIntroMemeOrOpenSfx({
        id: "topic-open-sfx",
        trackId: "sfx",
        label: "Open SFX"
      }),
      true
    );
    assert.equal(
      isTopicIntroMemeOrOpenSfx({
        id: "meme-topic-intro",
        trackId: "meme",
        label: "meme",
        commentIndex: null
      }),
      true
    );
    assert.equal(
      isCommentMemeOrSfxClip({
        id: "meme-0",
        trackId: "meme",
        label: "meme",
        commentIndex: 0
      }),
      true
    );

    const project = createSpikeTimelineProject();
    project.clips.push(
      {
        id: "topic-open-sfx",
        trackId: "sfx",
        start: 0,
        duration: 0.4,
        trimIn: 0,
        sourceDuration: 0.4,
        file: "open.mp3",
        fadeIn: 0,
        fadeOut: 0,
        volume: 1,
        locked: false,
        label: "Open SFX",
        kind: "audio"
      },
      {
        id: "meme-topic-title",
        trackId: "meme",
        start: 0,
        duration: 2,
        trimIn: 0,
        sourceDuration: 2,
        file: "topic-meme.png",
        fadeIn: 0.2,
        fadeOut: 0,
        volume: 1,
        locked: false,
        label: "Topic meme",
        kind: "image",
        commentIndex: null
      },
      {
        id: "sfx-0",
        trackId: "sfx",
        start: 1.5,
        duration: 0.3,
        trimIn: 0,
        sourceDuration: 0.3,
        file: "boom.mp3",
        fadeIn: 0,
        fadeOut: 0,
        volume: 1,
        locked: false,
        label: "sfx",
        kind: "audio",
        commentIndex: 0
      },
      {
        id: "meme-0",
        trackId: "meme",
        start: 1.5,
        duration: 1.2,
        trimIn: 0,
        sourceDuration: 1.2,
        file: "comment-meme.png",
        fadeIn: 0.1,
        fadeOut: 0.1,
        volume: 1,
        locked: true,
        label: "Comment meme",
        kind: "image",
        commentIndex: 0
      }
    );
    const cleared = clearCommentMemesAndSfx(project);
    const ids = cleared.clips.map((clip) => clip.id);
    assert.equal(ids.includes("topic-open-sfx"), true);
    assert.equal(ids.includes("meme-topic-title"), true);
    assert.equal(ids.includes("title-card") || ids.includes("bg"), true);
    assert.equal(ids.includes("meme-a"), false);
    assert.equal(ids.includes("meme-b"), false);
    assert.equal(ids.includes("sfx-0"), false);
    assert.equal(ids.includes("meme-0"), false);
    assert.equal(ids.includes("music"), true);
    assert.equal(ids.includes("voice"), true);
  });

  it("clears comment meme/sfx from reactions and analysis, not topicMemeId", () => {
    const meme = asset({
      id: "meme-laugh",
      type: "meme",
      mediaKind: "image",
      category: "laughing"
    });
    const sfx = asset({
      id: "sfx-boom",
      type: "sfx",
      mediaKind: "audio",
      category: "boom"
    });
    const reactions = clearCommentReactionAssets([
      {
        commentIndex: 0,
        emotion: "laughing",
        meme,
        sfx,
        animation: "zoom-in",
        duration: 1.2,
        comboId: "punch",
        comboLocked: true
      }
    ]);
    assert.equal(reactions[0]?.meme, null);
    assert.equal(reactions[0]?.sfx, null);
    assert.equal(reactions[0]?.comboId, "none");
    assert.equal(reactions[0]?.animation, "none");
    const next = clearCommentAnalysisAssets(
      analysis({
        topicMemeId: "keep-topic",
        reactions: [
          {
            commentIndex: 0,
            emotion: "laughing",
            memeAssetId: "meme-laugh",
            memeCategory: "laughing",
            sfxAssetId: "sfx-boom",
            sfxCategory: "boom",
            comboId: "punch",
            animation: "zoom-in",
            duration: 1.2
          }
        ]
      })
    );
    assert.equal(next.topicMemeId, "keep-topic");
    assert.equal(next.reactions[0]?.memeAssetId, null);
    assert.equal(next.reactions[0]?.sfxAssetId, null);
    assert.equal(next.reactions[0]?.comboId, "none");
  });
});
