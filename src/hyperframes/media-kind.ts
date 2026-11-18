const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv"];

export function isVideoAsset(file: string): boolean {
  const lower = file.toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function isAudioAsset(file: string): boolean {
  const lower = file.toLowerCase();
  return [".mp3", ".wav", ".m4a", ".aac", ".ogg"].some((extension) =>
    lower.endsWith(extension)
  );
}
