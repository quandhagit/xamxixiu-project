export function isTopicIntroMemeOrOpenSfx(clip: {
  id: string;
  trackId: string;
  label: string;
  commentIndex?: number | null;
}): boolean {
  if (clip.trackId === "sfx") {
    return clip.id === "topic-open-sfx" || clip.label === "Open SFX";
  }
  if (clip.trackId === "meme" || clip.trackId === "video") {
    return (
      clip.commentIndex === null ||
      clip.id.includes("topic")
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
