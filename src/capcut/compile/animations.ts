import path from "node:path";
import type { CapCutBaseProject } from "../../project/store.js";
import type { TimelineScene, VideoTimeline } from "../../types.js";
import {
  getSceneBlocks,
  getSceneDuration,
  SCENE_GAP_SECONDS
} from "../../timeline/timing.js";
import { runCapCut } from "./command.js";
import type { CapCutSegment } from "./types.js";

function isVideoAsset(file: string): boolean {
  return [".mp4", ".mov", ".webm", ".mkv"].some(
    extension => file.toLowerCase().endsWith(extension)
  );
}

function parseSegments(output: string): CapCutSegment[] {
  const jsonLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("[") && line.endsWith("]"));
  if (!jsonLine) {
    throw new Error(
      `capcut segments không trả về danh sách hợp lệ: ${output}`
    );
  }
  return JSON.parse(jsonLine) as CapCutSegment[];
}

export async function applyMemeFadeIns(
  projectDirectory: string,
  timeline: VideoTimeline,
  targetProject: CapCutBaseProject
): Promise<void> {
  const activeTimelineArgs = targetProject.timelineId
    ? ["--active-timeline"]
    : [];
  const segments = parseSegments(
    await runCapCut(
      [
        "segments",
        targetProject.directory,
        ...activeTimelineArgs,
        "--track",
        "video"
      ],
      projectDirectory
    )
  );
  const used = new Set<string>();
  let sceneStart = 0;

  for (const scene of timeline.scenes) {
    for (const block of getSceneBlocks(scene)) {
      for (const overlay of block.overlays) {
      if (
        overlay.type !== "meme" ||
        isVideoAsset(overlay.file) ||
        (!overlay.fadeIn &&
          !overlay.animationDuration)
      ) {
        continue;
      }
      const label = path.basename(overlay.file);
      const expectedStartUs =
        Math.round(
          (sceneStart + overlay.start) * 1_000_000
        );
      const segment = segments.find(
        (candidate) =>
          !used.has(candidate.id) &&
          candidate.label === label &&
          Math.abs(
            candidate.start_us - expectedStartUs
          ) <= 1
      );
      if (!segment) {
        throw new Error(
          `Không tìm thấy meme segment để fade-in: ${label} tại ${sceneStart + overlay.start}s`
        );
      }
      used.add(segment.id);
      const animationDuration = Math.min(
        overlay.animationDuration ??
        overlay.fadeIn ??
        0.5,
        overlay.duration
      );
      if (animationDuration <= 0) {
        continue;
      }
      // Comment memes follow the timeline rule and always fade in.
      // The topic intro is the only meme that uses a directional intro.
      const animation =
        scene.id === "topic"
          ? "slide-up"
          : "fade-in";
      await runCapCut(
        [
          "image-anim",
          targetProject.directory,
          segment.id,
          "--intro",
          animation,
          "--intro-duration",
          String(animationDuration),
          ...activeTimelineArgs
        ],
        projectDirectory
      );
      }
    }
    // Keep this offset identical to buildCompileSpec. Comment scenes have
    // a 0.1s gap, so omitting it shifts every later overlay by one gap.
    sceneStart += getSceneDuration(scene) + SCENE_GAP_SECONDS;
  }
}

