import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildCompileSpec } from "../capcut/compile/spec-builder.js";
import { renderTopicTitleCard } from "../capcut/compile/title-card.js";
import type {
  CompileItem,
  CompileSpec
} from "../capcut/compile/types.js";
import type { CommentCaptureStyle } from "../capture-style.js";
import type { TopicTitleStyle } from "../topic-title-style.js";
import { applyCaptureStyle } from "../process-image.js";
import type { VideoTimeline } from "../types.js";
import { clipUsesFlyUp } from "../timeline/clip-motion.js";
import type { TimelineClip, TimelineProject } from "../timeline/project.js";
import {
  TOPIC_TITLE_ANIMATION_DURATION,
  TOPIC_TITLE_WIDTH_FRACTION
} from "../timeline/topic-constants.js";
import {
  resolveFfmpegPath,
  resolveFfprobePath
} from "../binaries.js";

const execFileAsync = promisify(execFile);

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
  ".m4v",
  ".gif"
]);

export function isAnimatedVisual(file: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase());
}

const probeCache = new Map<string, MediaProbe>();

interface StagedInput {
  file: string;
  index: number;
}

interface SizedLayer {
  item: CompileItem;
  input: StagedInput;
  width: number;
  height: number;
  x: number;
  y: number;
  preScaled?: boolean;
}

export interface VisualFilterLayer {
  item: Pick<CompileItem, "start" | "duration" | "opacity">;
  width: number;
  height: number;
  preScaled?: boolean;
}

interface ProbeResult {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
  }>;
}

interface MediaProbe {
  width: number;
  height: number;
  hasAudio: boolean;
}

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function seconds(value: number): string {
  return Math.max(0, value).toFixed(3);
}

async function readTimeline(
  projectDirectory: string
): Promise<VideoTimeline> {
  const timelinePath = path.join(
    projectDirectory,
    "timeline.json"
  );
  try {
    return JSON.parse(
      await fs.readFile(timelinePath, "utf-8")
    ) as VideoTimeline;
  } catch {
    throw new Error(
      "Chưa có timeline. Hãy tạo timeline trước khi xuất video."
    );
  }
}

async function probeCacheKey(file: string): Promise<string> {
  const stat = await fs.stat(file);
  return `${file}:${stat.mtimeMs}:${stat.size}`;
}

async function probeMedia(file: string): Promise<MediaProbe> {
  const cacheKey = await probeCacheKey(file);
  const cached = probeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const extension = path.extname(file).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(extension)) {
    try {
      const metadata = await sharp(file).metadata();
      if (metadata.width && metadata.height) {
        const imageProbe = {
          width: metadata.width,
          height: metadata.height,
          hasAudio: false
        };
        probeCache.set(cacheKey, imageProbe);
        return imageProbe;
      }
    } catch {
      // Fall through to ffprobe for odd still formats.
    }
  }

  const { stdout } = await execFileAsync(
    resolveFfprobePath(),
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      file
    ],
    {
      maxBuffer: 4 * 1024 * 1024
    }
  );
  const probe = JSON.parse(stdout) as ProbeResult;
  const stream = probe.streams?.find(
    (item) =>
      item.codec_type === "video" &&
      item.width &&
      item.height
  );
  if (!stream?.width || !stream.height) {
    throw new Error(
      `Không đọc được kích thước media: ${file}`
    );
  }
  const result = {
    width: stream.width,
    height: stream.height,
    hasAudio:
      probe.streams?.some(
        (item) => item.codec_type === "audio"
      ) === true
  };
  probeCache.set(cacheKey, result);
  return result;
}

function targetWidth(
  item: CompileItem,
  nativeWidth: number,
  canvasWidth: number
): number {
  if (item.ref === "topic-title-card") {
    return nativeWidth * (item.scale ?? 1);
  }
  return (item.scale ?? 1) * canvasWidth;
}

function assetBasename(file: string): string {
  return path.basename(file.replaceAll("\\", "/")).toLowerCase();
}

export function matchExportClip(
  project: TimelineProject,
  item: CompileItem
): TimelineClip | undefined {
  if (item.ref === "topic-title-card") {
    return project.clips.find(
      (clip) => clip.trackId === "title-card" || clip.kind === "title"
    );
  }
  if (!item.path) {
    return undefined;
  }
  const key = assetBasename(item.path);
  const visual = project.clips.filter(
    (clip) =>
      clip.kind !== "audio" &&
      clip.trackId !== "background" &&
      assetBasename(clip.file) === key
  );
  if (visual.length <= 1) {
    return visual[0];
  }
  return (
    visual.find((clip) => Math.abs(clip.start - item.start) < 0.08) ??
    visual[0]
  );
}

export function applyTimelineProjectLayout(
  spec: CompileSpec,
  project?: TimelineProject
): CompileSpec {
  if (!project) {
    return spec;
  }
  for (const track of spec.tracks) {
    if (track.type === "audio" || track.name === "background") {
      continue;
    }
    for (const item of track.items) {
      const clip = matchExportClip(project, item);
      if (!clip) {
        continue;
      }
      if (clip.x !== undefined) {
        item.x = clip.x;
      }
      if (clip.y !== undefined) {
        item.y = clip.y;
      }
      if (clip.scale !== undefined) {
        item.scale =
          item.ref === "topic-title-card"
            ? clip.scale / TOPIC_TITLE_WIDTH_FRACTION
            : clip.scale;
      }
      item.flyUp = clipUsesFlyUp(clip);
      if (item.flyUp) {
        item.animationDuration =
          clip.animationDuration ?? item.animationDuration;
      }
    }
  }
  return spec;
}

function overlayPosition(
  item: CompileItem,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const centerX =
    canvasWidth * (0.5 + (item.x ?? 0) * 0.5);
  const centerY =
    canvasHeight * (0.5 - (item.y ?? 0) * 0.5);
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(centerY - height / 2)
  };
}

async function preScaleStill(
  source: string,
  directory: string,
  name: string,
  width: number,
  height: number
): Promise<string> {
  const destination = path.join(
    directory,
    `${name}.png`
  );
  await sharp(source)
    .resize(width, height, {
      fit: "fill"
    })
    .png()
    .toFile(destination);
  return destination;
}

async function styleCaptureStill(
  source: string,
  directory: string,
  name: string,
  width: number,
  height: number,
  x: number,
  y: number,
  style: CommentCaptureStyle
): Promise<{
  file: string;
  width: number;
  height: number;
  x: number;
  y: number;
}> {
  const resized = await preScaleStill(
    source,
    directory,
    `${name}-plain`,
    width,
    height
  );
  const destination = path.join(directory, `${name}.png`);
  const applied = await applyCaptureStyle(resized, destination, style);
  return {
    file: destination,
    width: applied.width,
    height: applied.height,
    x: x - applied.originX,
    y: y - applied.originY
  };
}

export interface VideoExportProgress {
  phase: "preparing" | "rendering" | "done";
  percent: number;
  time?: number;
  duration?: number;
}

function lastMatch(
  text: string,
  pattern: RegExp
): RegExpMatchArray | undefined {
  return [...text.matchAll(pattern)].at(-1);
}

function parseProgressTime(text: string): number | undefined {
  const microseconds = lastMatch(
    text,
    /out_time_us=(\d+)/g
  );
  if (microseconds) {
    return Number(microseconds[1]) / 1_000_000;
  }
  const milliseconds = lastMatch(
    text,
    /out_time_ms=(\d+)/g
  );
  if (milliseconds) {
    return Number(milliseconds[1]) / 1_000;
  }
  const clock = lastMatch(
    text,
    /time=(\d+):(\d+):(\d+(?:\.\d+)?)/g
  );
  if (!clock) {
    return undefined;
  }
  return (
    Number(clock[1]) * 3600 +
    Number(clock[2]) * 60 +
    Number(clock[3])
  );
}

function runFfmpeg(
  args: string[],
  options?: {
    duration?: number;
    onProgress?: (progress: VideoExportProgress) => void;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveFfmpegPath(), args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    let stdout = "";
    const duration = options?.duration ?? 0;

    const emitTime = (time: number): void => {
      if (!Number.isFinite(time) || time < 0) {
        return;
      }
      const percent =
        duration > 0
          ? Math.min(99, Math.round((time / duration) * 100))
          : 0;
      options?.onProgress?.({
        phase: "rendering",
        percent,
        time,
        duration
      });
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const time = parseProgressTime(stdout);
      if (time !== undefined) {
        emitTime(time);
      }
      if (stdout.length > 8000) {
        stdout = stdout.slice(-2000);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      const time = parseProgressTime(text);
      if (time !== undefined) {
        emitTime(time);
      }
    });
    child.once("error", (error) => {
      reject(
        new Error(
          `Không tìm thấy ffmpeg. Chạy yarn fetch:binaries hoặc cài FFmpeg vào PATH. ${error.message}`
        )
      );
    });
    child.once("exit", (code) => {
      if (code === 0) {
        options?.onProgress?.({
          phase: "done",
          percent: 100,
          time: duration,
          duration
        });
        resolve();
        return;
      }
      const details = stderr.trim().slice(-2000);
      reject(
        new Error(
          `Xuất video thất bại (${code ?? "unknown"}): ${details}`
        )
      );
    });
  });
}

export function overlayPixelFormat(
  _opacity?: number
): "yuv420p" | "yuva420p" {
  return "yuva420p";
}

export function visualFilters(
  layer: VisualFilterLayer,
  fps: number
): string {
  const start = seconds(layer.item.start);
  const parts = [
    `fps=${fps}`,
    "setpts=PTS-STARTPTS",
    `trim=0:${seconds(layer.item.duration)}`,
    "setpts=PTS-STARTPTS"
  ];
  if (!layer.preScaled) {
    parts.push(
      `scale=${layer.width}:${layer.height}:flags=lanczos`
    );
  }
  parts.push(
    `format=${overlayPixelFormat(layer.item.opacity)}`,
    "setsar=1"
  );
  if ((layer.item.opacity ?? 1) < 1) {
    parts.push(
      `colorchannelmixer=aa=${layer.item.opacity}`
    );
  }
  if (layer.item.start > 0) {
    parts.push(`setpts=PTS+${start}/TB`);
  }
  return parts.join(",");
}

function overlayYExpression(
  layer: SizedLayer,
  canvasHeight: number
): string {
  if (!layer.item.flyUp) {
    return String(layer.y);
  }
  const animation = Math.max(
    0.001,
    layer.item.animationDuration ??
    TOPIC_TITLE_ANIMATION_DURATION
  );
  const restY = layer.y;
  const startY = restY + canvasHeight;
  return `'${startY}+(${restY - startY})*min(1\\,max(0\\,(t-${seconds(
    layer.item.start
  )})/${seconds(animation)}))'`;
}

function audioFilters(item: CompileItem): string {
  const parts = [
    `atrim=0:${seconds(item.duration)}`,
    "asetpts=PTS-STARTPTS",
    "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo"
  ];
  const delayMs = Math.round(item.start * 1000);
  if (delayMs > 0) {
    parts.push(`adelay=delays=${delayMs}:all=1`);
  }
  if (item.volume !== undefined && item.volume !== 1) {
    parts.push(`volume=${item.volume}`);
  }
  return parts.join(",");
}

function timelineDuration(spec: CompileSpec): number {
  return spec.tracks
    .flatMap((track) =>
      track.items.map(
        (item) => item.start + item.duration
      )
    )
    .reduce((max, value) => Math.max(max, value), 0);
}

async function buildGraph(
  spec: CompileSpec,
  stagingDirectory: string,
  captureStyle?: CommentCaptureStyle
): Promise<{
  inputArgs: string[];
  filterScript: string;
  hasAudio: boolean;
  duration: number;
}> {
  const duration = Math.max(timelineDuration(spec), 0.1);
  const inputArgs: string[] = [];
  let nextIndex = 0;
  const layers: SizedLayer[] = [];
  const audioItems: Array<{
    item: CompileItem;
    input: StagedInput;
  }> = [];

  async function addInput(
    file: string,
    extraArgs: string[]
  ): Promise<StagedInput> {
    await fs.access(file);
    const input: StagedInput = {
      file,
      index: nextIndex
    };
    nextIndex += 1;
    inputArgs.push(...extraArgs, "-i", file);
    return input;
  }

  type PreparedVisual = {
    item: CompileItem;
    extraArgs: string[];
    file: string;
    width: number;
    height: number;
    x: number;
    y: number;
    preScaled: boolean;
    attachAudio: boolean;
  };

  const visualJobs: Array<Promise<PreparedVisual>> = [];
  const pendingAudio: CompileItem[] = [];

  for (const track of spec.tracks) {
    if (track.type === "text") {
      continue;
    }
    for (const [itemIndex, item] of track.items.entries()) {
      if (
        !item.path ||
        (track.type === "audio" &&
          (item.volume ?? 1) === 0)
      ) {
        continue;
      }
      const name = `${track.name}-${itemIndex}`;
      if (track.type === "audio") {
        pendingAudio.push(item);
        continue;
      }
      if (track.name === "background") {
        const extraArgs =
          item.type === "photo" &&
          !isAnimatedVisual(item.path)
            ? [
                "-loop",
                "1",
                "-framerate",
                String(spec.fps),
                "-t",
                seconds(item.duration)
              ]
            : [
                "-ss",
                seconds(item.sourceStart ?? 0),
                "-stream_loop",
                "-1",
                "-t",
                seconds(duration)
              ];
        visualJobs.push(Promise.resolve({
          item: {
            ...item,
            scale: undefined,
            x: 0,
            y: 0
          },
          extraArgs,
          file: item.path,
          width: spec.width,
          height: spec.height,
          x: 0,
          y: 0,
          preScaled: false,
          attachAudio: false
        }));
        continue;
      }
      const animated = isAnimatedVisual(item.path as string) ||
        item.type === "video";
      const extraArgs = animated
        ? [
            "-stream_loop",
            "-1",
            "-t",
            seconds(item.duration)
          ]
        : [
            "-loop",
            "1",
            "-framerate",
            String(spec.fps),
            "-t",
            seconds(item.duration)
          ];
      visualJobs.push((async () => {
        const native = await probeMedia(item.path as string);
        const width = even(
          targetWidth(item, native.width, spec.width)
        );
        const height = even(
          width * (native.height / native.width)
        );
        const position = overlayPosition(
          item,
          width,
          height,
          spec.width,
          spec.height
        );
        const isPhoto = !animated;
        if (isPhoto && captureStyle && track.name === "images") {
          const styled = await styleCaptureStill(
            item.path as string,
            stagingDirectory,
            name,
            width,
            height,
            position.x,
            position.y,
            captureStyle
          );
          return {
            item,
            extraArgs,
            file: styled.file,
            width: styled.width,
            height: styled.height,
            x: styled.x,
            y: styled.y,
            preScaled: true,
            attachAudio: false
          };
        }
        const file = isPhoto
          ? await preScaleStill(
              item.path as string,
              stagingDirectory,
              name,
              width,
              height
            )
          : item.path as string;
        return {
          item,
          extraArgs,
          file,
          width,
          height,
          ...position,
          preScaled: isPhoto,
          attachAudio: item.type === "video" && native.hasAudio
        };
      })());
    }
  }

  const preparedLayers = await Promise.all(visualJobs);
  for (const prepared of preparedLayers) {
    const input = await addInput(
      prepared.file,
      prepared.extraArgs
    );
    if (prepared.attachAudio) {
      audioItems.push({
        item: {
          ...prepared.item,
          volume: 1
        },
        input
      });
    }
    layers.push({
      item: prepared.item,
      input,
      width: prepared.width,
      height: prepared.height,
      x: prepared.x,
      y: prepared.y,
      preScaled: prepared.preScaled
    });
  }

  for (const item of pendingAudio) {
    audioItems.push({
      item,
      input: await addInput(item.path as string, [])
    });
  }

  const filters: string[] = [
    `color=c=black:s=${spec.width}x${spec.height}:d=${seconds(
      duration
    )}:r=${spec.fps},format=yuv420p[base]`
  ];

  let lastLabel = "base";
  layers.forEach((layer, index) => {
    const scaledLabel = `v${index}`;
    const outputLabel = `ov${index}`;
    if (layer.item.ref === "background") {
      filters.push(
        `[${layer.input.index}:v]fps=${spec.fps},setpts=PTS-STARTPTS,scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase:flags=bilinear,crop=${spec.width}:${spec.height},setsar=1,trim=0:${seconds(
          layer.item.duration
        )},setpts=PTS-STARTPTS,format=yuv420p[${scaledLabel}]`
      );
      filters.push(
        `[${lastLabel}][${scaledLabel}]overlay=0:0:format=auto[${outputLabel}]`
      );
    } else {
      const end = layer.item.start + layer.item.duration;
      filters.push(
        `[${layer.input.index}:v]${visualFilters(layer, spec.fps)}[${scaledLabel}]`
      );
      filters.push(
        `[${lastLabel}][${scaledLabel}]overlay=x=${layer.x}:y=${overlayYExpression(
          layer,
          spec.height
        )}:enable='between(t,${seconds(
          layer.item.start
        )},${seconds(end)})':format=auto[${outputLabel}]`
      );
    }
    lastLabel = outputLabel;
  });
  filters.push(`[${lastLabel}]format=yuv420p[vout]`);

  const hasAudio = audioItems.length > 0;
  if (hasAudio) {
    filters.push(
      `anullsrc=channel_layout=stereo:sample_rate=44100:d=${seconds(
        duration
      )}[aSilence]`
    );
    const mixInputs = ["[aSilence]"];
    audioItems.forEach((entry, index) => {
      const label = `a${index}`;
      filters.push(
        `[${entry.input.index}:a]${audioFilters(entry.item)}[${label}]`
      );
      mixInputs.push(`[${label}]`);
    });
    filters.push(
      `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0[aout]`
    );
  }

  return {
    inputArgs,
    filterScript: filters.join(";"),
    hasAudio,
    duration
  };
}

export async function exportTimelineVideo(
  projectDirectory: string,
  outputPath: string,
  onProgress?: (progress: VideoExportProgress) => void,
  captureStyle?: CommentCaptureStyle,
  titleStyle?: TopicTitleStyle,
  timelineProject?: TimelineProject
): Promise<string> {
  onProgress?.({
    phase: "preparing",
    percent: 0
  });
  const timeline = await readTimeline(projectDirectory);
  const topicTitleCardFile = timeline.topicIntro
    ? await renderTopicTitleCard(
        projectDirectory,
        timeline.topicIntro.title,
        titleStyle
      )
    : undefined;
  const spec = applyTimelineProjectLayout(
    await buildCompileSpec(
      projectDirectory,
      timeline,
      topicTitleCardFile,
      { preserveVideoMemeDuration: true }
    ),
    timelineProject
  );
  const stagingDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "xamxixiu-export-")
  );
  try {
    const graph = await buildGraph(
      spec,
      stagingDirectory,
      captureStyle
    );
    await fs.mkdir(path.dirname(outputPath), {
      recursive: true
    });
    const args = [
      "-y",
      "-hide_banner",
      ...graph.inputArgs,
      "-filter_complex",
      graph.filterScript,
      "-map",
      "[vout]",
      ...(graph.hasAudio
        ? ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"]
        : ["-an"]),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(spec.fps),
      "-t",
      seconds(
        Math.max(graph.duration, timeline.totalDuration)
      ),
      "-progress",
      "pipe:1",
      "-nostats",
      "-movflags",
      "+faststart",
      outputPath
    ];
    await runFfmpeg(args, {
      duration: Math.max(
        graph.duration,
        timeline.totalDuration
      ),
      onProgress
    });
    return outputPath;
  } finally {
    await fs.rm(stagingDirectory, {
      recursive: true,
      force: true
    });
  }
}
