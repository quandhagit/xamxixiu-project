import {
  clipFlyUpTopPercent,
  clipMotionName,
  clipUsesFlyUp,
  DEFAULT_FLY_UP_DURATION,
  ZOOM_IN_FROM
} from "../timeline/clip-motion.js";
import {
  clipsOnTrack,
  type TimelineClip,
  type TimelineProject
} from "../timeline/project.js";

export interface CompileOptions {
  resolveSrc?: (file: string) => string;
  compositionId?: string;
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

function visualStyle(clip: TimelineClip): string {
  const width = clip.scale ? `${Math.round(clip.scale * 100)}%` : "100%";
  const left = 50 + (clip.x ?? 0) * 50;
  const top = 50 - (clip.y ?? (clip.trackId === "title-card" ? 0.2 : 0)) * 50;
  return [
    "position:absolute",
    `left:${left}%`,
    `top:${top}%`,
    "transform:translate(-50%,-50%)",
    `width:${width}`,
    "max-height:100%",
    "object-fit:contain"
  ].join(";");
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

function mediaTag(clip: TimelineClip, src: string, trackIndex: number): string {
  const start = clip.start.toFixed(3);
  const duration = clip.duration.toFixed(3);
  const attrs = [
    `id="${escapeHtml(clip.id)}"`,
    `class="clip"`,
    `data-start="${start}"`,
    `data-duration="${duration}"`,
    `data-track-index="${trackIndex}"`,
    clip.trimIn ? `data-media-start="${clip.trimIn.toFixed(3)}"` : "",
    `data-volume="${clip.volume}"`,
    `src="${escapeHtml(src)}"`
  ].filter(Boolean);

  if (clip.kind === "audio") {
    return `<audio ${attrs.join(" ")}></audio>`;
  }
  if (clip.kind === "video") {
    return `<video ${attrs.join(" ")} style="${visualStyle(clip)}" muted playsinline></video>`;
  }
  return `<img ${attrs.join(" ")} alt="${escapeHtml(clip.label)}" style="${visualStyle(clip)}" />`;
}

function gsapFades(
  clips: TimelineClip[],
  canvasHeight: number,
  canvasWidth: number
): string {
  const lines: string[] = [];
  for (const clip of clips) {
    if (clip.kind === "audio") {
      continue;
    }
    const duration = clip.animationDuration ?? DEFAULT_FLY_UP_DURATION;
    const motion = clipMotionName(clip);
    if (clipUsesFlyUp(clip) && duration > 0) {
      const restTop = 50 - (clip.y ?? (clip.trackId === "title-card" ? 0.2 : 0)) * 50;
      const startTop = clipFlyUpTopPercent({
        restTopPercent: restTop,
        progress: 0,
        mode: clip.trackId === "title-card" ? "title" : "full"
      });
      const fromY = Math.round(((startTop - restTop) / 100) * canvasHeight);
      lines.push(
        `tl.fromTo("#${cssEscape(clip.id)}", { y: ${fromY} }, { y: 0, duration: ${duration} }, ${clip.start});`
      );
    }
    if (motion === "slide-left" && duration > 0) {
      const fromX = -Math.round(canvasWidth);
      lines.push(
        `tl.fromTo("#${cssEscape(clip.id)}", { x: ${fromX} }, { x: 0, duration: ${duration} }, ${clip.start});`
      );
    }
    if (motion === "zoom-in" && duration > 0) {
      lines.push(
        `tl.fromTo("#${cssEscape(clip.id)}", { scale: ${ZOOM_IN_FROM} }, { scale: 1, duration: ${duration} }, ${clip.start});`
      );
    }
    if (motion === "shake" && duration > 0) {
      const beat = duration / 4;
      const amplitude = Math.round(canvasWidth * 0.035);
      lines.push(
        `tl.fromTo("#${cssEscape(clip.id)}", { x: ${amplitude} }, { x: 0, duration: ${beat}, repeat: 3, yoyo: true }, ${clip.start});`
      );
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
      TRACK_INDEX[clip.trackId] ?? 1
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
        ${gsapFades(expanded, project.canvas.height, project.canvas.width)}
        window.__timelines = window.__timelines || {};
        window.__timelines.${compositionId} = tl;
      </script>
    </div>
  </body>
</html>
`;
}

export function createSpikeTimelineProject(): TimelineProject {
  return {
    version: 1,
    canvas: { width: 1080, height: 1920, fps: 30 },
    totalDuration: 8,
    settings: {
      memeGap: 0.1,
      memeMinDuration: 1,
      memeMaxDuration: 4,
      fadeIn: 0.3,
      fadeOut: 0.3,
      preserveLocked: true,
      rippleVoiceTrim: true
    },
    clips: [
      {
        id: "bg",
        trackId: "background",
        start: 0,
        duration: 8,
        trimIn: 0,
        sourceDuration: 8,
        file: "spike/bg.png",
        fadeIn: 0,
        fadeOut: 0,
        volume: 0,
        locked: false,
        label: "Background",
        kind: "image"
      },
      {
        id: "comment",
        trackId: "images",
        start: 0,
        duration: 5,
        trimIn: 0,
        sourceDuration: 5,
        file: "spike/comment.png",
        fadeIn: 0.2,
        fadeOut: 0.2,
        volume: 1,
        locked: false,
        label: "Comment",
        kind: "image"
      },
      {
        id: "voice",
        trackId: "voice",
        start: 0.3,
        duration: 4.5,
        trimIn: 0,
        sourceDuration: 4.5,
        file: "spike/voice.mp3",
        fadeIn: 0,
        fadeOut: 0,
        volume: 1,
        locked: false,
        label: "Voice",
        kind: "audio",
        muteUnderBeep: true
      },
      {
        id: "beep",
        trackId: "beep",
        start: 2.2,
        duration: 0.2,
        trimIn: 0,
        sourceDuration: 0.2,
        file: "spike/beep.wav",
        fadeIn: 0.01,
        fadeOut: 0.01,
        volume: 1,
        locked: false,
        label: "Beep",
        kind: "audio"
      },
      {
        id: "meme-a",
        trackId: "video",
        start: 4.8,
        duration: 1.6,
        trimIn: 0,
        sourceDuration: 1.6,
        file: "spike/meme-a.mp4",
        fadeIn: 0.3,
        fadeOut: 0.3,
        volume: 0,
        locked: false,
        label: "Meme A",
        kind: "video"
      },
      {
        id: "meme-b",
        trackId: "meme",
        start: 6.5,
        duration: 1.4,
        trimIn: 0,
        sourceDuration: 1.4,
        file: "spike/meme-b.png",
        fadeIn: 0.3,
        fadeOut: 0.3,
        volume: 1,
        locked: false,
        label: "Meme B",
        kind: "image"
      },
      {
        id: "music",
        trackId: "music",
        start: 0,
        duration: 8,
        trimIn: 0,
        sourceDuration: 8,
        file: "spike/music.mp3",
        fadeIn: 0.4,
        fadeOut: 0.8,
        volume: 0.25,
        locked: false,
        label: "Music",
        kind: "audio"
      }
    ]
  };
}
