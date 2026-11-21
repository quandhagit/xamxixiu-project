import {
  commentCaptureCssText,
  type CommentCaptureStyle
} from "../../../src/capture-style";
import {
  DEFAULT_TOPIC_TITLE_STYLE,
  topicTitleCssText,
  type TopicTitleStyle
} from "../../../src/topic-title-style";
import { TOPIC_TITLE_WIDTH_FRACTION } from "../../../src/timeline/topic-constants";
import {
  clipMutesVideoElement,
  clipsOnTrack,
  type TimelineClip,
  type TimelineProject
} from "../../../src/timeline/project";

export interface CompileOptions {
  resolveSrc?: (file: string) => string;
  compositionId?: string;
  captureStyle?: CommentCaptureStyle;
  titleStyle?: TopicTitleStyle;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function srcOf(clip: TimelineClip, resolveSrc?: (file: string) => string): string {
  return resolveSrc ? resolveSrc(clip.file) : clip.file.replaceAll("\\", "/");
}

function isTitleClip(clip: TimelineClip): boolean {
  return clip.trackId === "title-card" || clip.kind === "title";
}

function visualStyle(
  clip: TimelineClip,
  captureStyle?: CommentCaptureStyle,
  titleStyle?: TopicTitleStyle
): string {
  const width = clip.scale
    ? `${Math.round(clip.scale * 100)}%`
    : isTitleClip(clip)
      ? `${Math.round(TOPIC_TITLE_WIDTH_FRACTION * 100)}%`
      : "100%";
  const left = 50 + (clip.x ?? 0) * 50;
  const top = 50 - (clip.y ?? (clip.trackId === "title-card" ? 0.2 : 0)) * 50;
  const parts = [
    "position:absolute",
    `left:${left}%`,
    `top:${top}%`,
    "transform:translate(-50%,-50%)",
    `width:${width}`,
    "max-height:100%",
    "object-fit:contain"
  ];
  if (clip.trackId === "images" && captureStyle) {
    parts.push(commentCaptureCssText(captureStyle));
  }
  if (isTitleClip(clip)) {
    parts.push(
      topicTitleCssText(titleStyle ?? DEFAULT_TOPIC_TITLE_STYLE)
    );
  }
  return parts.join(";");
}

function voiceSegments(project: TimelineProject, clip: TimelineClip): TimelineClip[] {
  if (!clip.muteUnderBeep) {
    return [clip];
  }
  const beeps = clipsOnTrack(project, "beep");
  const overlaps = beeps
    .map((beep) => ({
      start: Math.max(clip.start, beep.start),
      end: Math.min(clip.start + clip.duration, beep.start + beep.duration)
    }))
    .filter((range) => range.end - range.start > 0.01)
    .sort((left, right) => left.start - right.start);
  if (overlaps.length === 0) {
    return [clip];
  }
  const segments: TimelineClip[] = [];
  let cursor = clip.start;
  let part = 0;
  for (const range of overlaps) {
    if (range.start - cursor > 0.01) {
      const start = cursor;
      const duration = range.start - cursor;
      segments.push({
        ...clip,
        id: `${clip.id}-part-${part}`,
        start,
        duration,
        trimIn: clip.trimIn + (start - clip.start),
        volume: clip.volume
      });
      part += 1;
    }
    cursor = range.end;
  }
  if (clip.start + clip.duration - cursor > 0.01) {
    const start = cursor;
    segments.push({
      ...clip,
      id: `${clip.id}-part-${part}`,
      start,
      duration: clip.start + clip.duration - cursor,
      trimIn: clip.trimIn + (start - clip.start),
      volume: clip.volume
    });
  }
  return segments;
}

function mediaTag(
  clip: TimelineClip,
  src: string,
  trackIndex: number,
  captureStyle?: CommentCaptureStyle,
  titleStyle?: TopicTitleStyle
): string {
  const start = clip.start.toFixed(3);
  const duration = clip.duration.toFixed(3);
  const attrs = [
    `id="${escapeHtml(clip.id)}"`,
    `class="clip"`,
    `data-start="${start}"`,
    `data-duration="${duration}"`,
    `data-track-index="${trackIndex}"`,
    clip.trimIn ? `data-media-start="${clip.trimIn.toFixed(3)}"` : "",
    `data-volume="${clip.volume}"`
  ].filter(Boolean);

  if (isTitleClip(clip)) {
    return `<div ${attrs.join(" ")} style="${visualStyle(clip, captureStyle, titleStyle)}">${escapeHtml(clip.label)}</div>`;
  }

  attrs.push(`src="${escapeHtml(src)}"`);

  if (clip.kind === "audio") {
    return `<audio ${attrs.join(" ")}></audio>`;
  }
  if (clip.kind === "video") {
    const muted = clipMutesVideoElement(clip) ? " muted" : "";
    return `<video ${attrs.join(" ")} style="${visualStyle(clip, captureStyle, titleStyle)}"${muted} playsinline></video>`;
  }
  return `<img ${attrs.join(" ")} alt="${escapeHtml(clip.label)}" style="${visualStyle(clip, captureStyle, titleStyle)}" />`;
}

function gsapFades(clips: TimelineClip[]): string {
  const lines: string[] = [];
  for (const clip of clips) {
    if (clip.kind === "audio") {
      continue;
    }
    if (clip.fadeIn <= 0 && clip.fadeOut <= 0) {
      continue;
    }
    if (clip.fadeIn > 0) {
      lines.push(
        `tl.fromTo("#${cssEscape(clip.id)}", { opacity: 0 }, { opacity: 1, duration: ${clip.fadeIn} }, ${clip.start});`
      );
    }
    if (clip.fadeOut > 0) {
      const at = Math.max(clip.start, clip.start + clip.duration - clip.fadeOut);
      lines.push(
        `tl.to("#${cssEscape(clip.id)}", { opacity: 0, duration: ${clip.fadeOut} }, ${at});`
      );
    }
  }
  return lines.join("\n      ");
}

function cssEscape(id: string): string {
  return id.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

const TRACK_INDEX: Record<string, number> = {
  background: 0,
  images: 1,
  "title-card": 2,
  meme: 3,
  video: 4,
  voice: 5,
  sfx: 6,
  beep: 7,
  music: 8
};

export function compileTimelineProject(
  project: TimelineProject,
  options: CompileOptions = {}
): string {
  const compositionId = options.compositionId ?? "xamxixiu";
  const expanded = project.clips.flatMap((clip) =>
    clip.kind === "audio" ? voiceSegments(project, clip) : [clip]
  );
  const tags = expanded.map((clip) =>
    mediaTag(
      clip,
      srcOf(clip, options.resolveSrc),
      TRACK_INDEX[clip.trackId] ?? 1,
      options.captureStyle,
      options.titleStyle
    )
  );
  const duration = Math.max(project.totalDuration, 1).toFixed(3);

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; background: #000; overflow: hidden; }
      #stage { position: relative; width: ${project.canvas.width}px; height: ${project.canvas.height}px; background: #000; }
      .clip { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      img.clip, video.clip { object-fit: contain; }
      audio { display: none; }
    </style>
  </head>
  <body>
    <div
      id="stage"
      data-composition-id="${compositionId}"
      data-start="0"
      data-duration="${duration}"
      data-width="${project.canvas.width}"
      data-height="${project.canvas.height}"
      data-fps="${project.canvas.fps}"
    >
      ${tags.join("\n      ")}
      <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
      <script>
        const tl = gsap.timeline({ paused: true });
        ${gsapFades(expanded)}
        window.__timelines = window.__timelines || {};
        window.__timelines.${compositionId} = tl;
      </script>
    </div>
  </body>
</html>
`;
}
