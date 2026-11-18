/**
 * Hyperframes is the target preview/render engine (Apache-2.0, HTML compositions).
 * Spike (Pha 0): declarative HTML matches TimelineProject; player embeds in the
 * renderer; producer/CLI renders MP4. FFmpeg remains a fallback exporter.
 */
export const HYPERFRAMES_ENGINE = "hyperframes" as const;

export const ENABLE_CAPCUT = false;

export type ExportEngine = "hyperframes" | "ffmpeg";

export function getExportEngine(): ExportEngine {
  const value = process.env.XAMXIXIU_EXPORT_ENGINE?.trim().toLowerCase();
  if (value === "ffmpeg") {
    return "ffmpeg";
  }
  return "hyperframes";
}

export const SPIKE_DECISION = {
  engine: HYPERFRAMES_ENGINE,
  canvas: { width: 1080, height: 1920, fps: 30 },
  reasons: [
    "Declarative data-start/data-duration clips map 1:1 to TimelineProject.",
    "Apache-2.0 is safe to ship in the Electron app.",
    "Player and producer share the same HTML source as preview and export."
  ]
} as const;
