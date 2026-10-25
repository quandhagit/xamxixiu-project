import { assetMediaSrc } from "./asset-media";

const thumbnailCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | undefined>>();
const MAX_CAPTURES = 2;
const CAPTURE_TIMEOUT_MS = 8000;
let activeCaptures = 0;
const waiting: Array<() => void> = [];

async function withCaptureSlot<T>(
  task: () => Promise<T>
): Promise<T> {
  if (activeCaptures >= MAX_CAPTURES) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  activeCaptures += 1;
  try {
    return await task();
  } finally {
    activeCaptures -= 1;
    waiting.shift()?.();
  }
}

function captureFrame(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", tryGrab);
      video.removeEventListener("canplay", tryGrab);
      video.removeEventListener("seeked", tryGrab);
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (error) {
        reject(error);
        return;
      }
    };

    const grab = (): void => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        return;
      }
      const scale = Math.min(1, 320 / width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        finish(new Error("Canvas unavailable"));
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        finish();
        resolve(dataUrl);
      } catch (reason) {
        finish(
          reason instanceof Error
            ? reason
            : new Error("Could not export thumbnail")
        );
      }
    };

    const tryGrab = (): void => {
      if (!settled) {
        grab();
      }
    };

    const timeout = window.setTimeout(() => {
      finish(new Error("Thumbnail capture timed out"));
    }, CAPTURE_TIMEOUT_MS);

    video.addEventListener("error", () => {
      finish(new Error("Could not load video"));
    }, { once: true });
    video.addEventListener("loadeddata", tryGrab);
    video.addEventListener("canplay", tryGrab);
    video.addEventListener("seeked", tryGrab);
    video.src = src;
  });
}

export function getCachedVideoThumbnail(
  assetId: string
): string | undefined {
  return thumbnailCache.get(assetId);
}

export function loadVideoThumbnail(
  assetId: string
): Promise<string | undefined> {
  const cached = thumbnailCache.get(assetId);
  if (cached) {
    return Promise.resolve(cached);
  }
  const pending = inflight.get(assetId);
  if (pending) {
    return pending;
  }
  const request = withCaptureSlot(async () => {
    const existing = thumbnailCache.get(assetId);
    if (existing) {
      return existing;
    }
    const dataUrl = await captureFrame(assetMediaSrc(assetId));
    thumbnailCache.set(assetId, dataUrl);
    return dataUrl;
  }).catch(() => undefined).finally(() => {
    inflight.delete(assetId);
  });
  inflight.set(assetId, request);
  return request;
}
