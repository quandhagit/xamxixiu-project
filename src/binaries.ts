import fs from "node:fs";
import path from "node:path";

function resourcesRoot(): string | undefined {
  const value = (process as NodeJS.Process & {
    resourcesPath?: string;
  }).resourcesPath;

  return typeof value === "string" && value.length > 0
    ? value
    : undefined;
}

function firstExistingFile(
  candidates: Array<string | undefined>
): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Skip unreadable candidates.
    }
  }

  return undefined;
}

function vendorRoot(): string {
  return path.resolve(
    process.env.XAMXIXIU_PROJECT_ROOT ?? process.cwd(),
    "vendor"
  );
}

/** Writable runtime root (projects, browser profile). */
export function getRuntimeRoot(): string {
  return process.env.XAMXIXIU_PROJECT_ROOT ?? process.cwd();
}

export function getBrowserDataDir(): string {
  return (
    process.env.XAMXIXIU_BROWSER_DATA ??
    path.join(getRuntimeRoot(), ".browser-data")
  );
}

export function resolveFfmpegPath(): string {
  return (
    firstExistingFile([
      process.env.FFMPEG_PATH?.trim(),
      resourcesRoot()
        ? path.join(resourcesRoot() as string, "ffmpeg", "ffmpeg.exe")
        : undefined,
      path.join(vendorRoot(), "ffmpeg", "ffmpeg.exe")
    ]) ?? "ffmpeg"
  );
}

export function resolveFfprobePath(): string {
  return (
    firstExistingFile([
      process.env.FFPROBE_PATH?.trim(),
      resourcesRoot()
        ? path.join(resourcesRoot() as string, "ffmpeg", "ffprobe.exe")
        : undefined,
      path.join(vendorRoot(), "ffmpeg", "ffprobe.exe")
    ]) ?? "ffprobe"
  );
}

export function resolveChromiumExecutable(): string | undefined {
  return firstExistingFile([
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim(),
    resourcesRoot()
      ? path.join(
          resourcesRoot() as string,
          "playwright-chromium",
          "chrome.exe"
        )
      : undefined,
    path.join(vendorRoot(), "playwright-chromium", "chrome.exe")
  ]);
}
