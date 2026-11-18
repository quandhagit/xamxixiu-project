export function isTopicIntroMemeOrOpenSfx(clip: {
  id: string;
  trackId: string;
  label: string;
  commentIndex?: number | null;
}): boolean {
  if (clip.commentIndex === -1) {
    return false;
  }
  if (clip.trackId === "sfx") {
    return clip.id === "topic-open-sfx" || clip.label === "Open SFX";
  }
  if (clip.trackId === "meme" || clip.trackId === "video") {
    return (
      clip.commentIndex === null ||
      clip.id === "topic-meme" ||
      clip.id.startsWith("topic-meme")
    );
  }
  return false;
}

export function isCommentMemeOrSfxClip(clip: {
  id: string;
  trackId: string;
  label: string;
  commentIndex?: number | null;
}): boolean {
  if (
    clip.trackId !== "meme" &&
    clip.trackId !== "video" &&
    clip.trackId !== "sfx"
  ) {
    return false;
  }
  return !isTopicIntroMemeOrOpenSfx(clip);
}

export function isBulkClearableOverlayClip(clip: {
  id: string;
  trackId: string;
  label: string;
  commentIndex?: number | null;
  locked?: boolean;
}): boolean {
  if (clip.locked) {
    return false;
  }
  if (clip.trackId === "beep") {
    return true;
  }
  return isCommentMemeOrSfxClip(clip);
}
