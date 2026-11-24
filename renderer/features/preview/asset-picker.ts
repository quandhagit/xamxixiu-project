import type { Asset } from "../../../src/assets/library";
import type { TimelineAssetTarget } from "../../../src/electron/ipc-types";
import type { ProjectState } from "../../../src/project/store";
import { overlayFilesMatch } from "../../../src/timeline/replace-asset";
import { isTopicPostIndex } from "../../../src/timeline/topic-constants";

export function assetsForTarget(
  assets: Asset[],
  target: TimelineAssetTarget
): Asset[] {
  if (target.kind === "topic-title") {
    return [];
  }
  if (target.kind === "background") {
    return assets.filter((asset) => asset.type === "background");
  }
  if (target.kind === "music") {
    return assets.filter((asset) => asset.type === "music");
  }
  if (target.kind === "sfx") {
    return assets.filter((asset) => asset.type === "sfx");
  }
  if (target.kind === "video") {
    return assets.filter(
      (asset) => asset.type === "meme" && asset.mediaKind === "video"
    );
  }
  return assets.filter((asset) => {
    if (asset.type !== "meme") {
      return false;
    }
    return target.kind === "topic-meme" || asset.mediaKind === "image";
  });
}

export function pickerTitle(target: TimelineAssetTarget): string {
  if (target.kind === "topic-title") {
    return "Topic title";
  }
  if (target.kind === "background") {
    return "Chọn background";
  }
  if (target.kind === "music") {
    return "Chọn music";
  }
  const afterTopic =
    "commentIndex" in target && isTopicPostIndex(target.commentIndex);
  if (target.kind === "sfx") {
    return afterTopic ? "Chọn sound effect · sau topic" : "Chọn sound effect";
  }
  if (target.kind === "video") {
    return afterTopic
      ? "Chọn video meme · sau topic"
      : `Chọn video meme${"commentIndex" in target ? ` · comment #${target.commentIndex}` : ""}`;
  }
  if (target.kind === "topic-meme") {
    return "Chọn topic meme";
  }
  return afterTopic
    ? "Chọn meme · sau topic"
    : `Chọn meme · comment #${target.commentIndex}`;
}

export function selectedAssetId(
  target: TimelineAssetTarget,
  analysis: ProjectState["analysis"],
  reactions: ProjectState["reactions"],
  options?: {
    clips?: Array<{ id: string; file: string }>;
    assets?: Asset[];
  }
): string | undefined {
  if (target.kind === "topic-title") {
    return undefined;
  }
  if (target.kind === "background") {
    return analysis?.backgroundAssetId ?? undefined;
  }
  if (target.kind === "music") {
    return analysis?.musicAssetId ?? undefined;
  }
  if (target.kind === "topic-meme") {
    return analysis?.topicMemeId ?? undefined;
  }
  if ("clipId" in target && target.clipId) {
    const file = options?.clips?.find((clip) => clip.id === target.clipId)?.file;
    if (file && options?.assets) {
      const matched = options.assets.find((asset) =>
        overlayFilesMatch(asset.file, file)
      );
      if (matched) {
        return matched.id;
      }
    }
  } else if (
    target.kind === "meme" ||
    target.kind === "video" ||
    target.kind === "sfx"
  ) {
    return undefined;
  }
  if ("commentIndex" in target && isTopicPostIndex(target.commentIndex)) {
    if (target.kind === "sfx") {
      return analysis?.topicPostSfxId ?? undefined;
    }
    return analysis?.topicPostMemeId ?? undefined;
  }
  const reaction = reactions?.find(
    (item) => item.commentIndex === target.commentIndex
  );
  if (target.kind === "sfx") {
    return reaction?.sfx?.id;
  }
  if (target.kind === "video") {
    const memes = [
      ...(reaction?.meme ? [reaction.meme] : []),
      ...(reaction?.extraMemes ?? [])
    ];
    return memes.find((item) => item.mediaKind === "video")?.id;
  }
  return reaction?.meme?.id;
}
