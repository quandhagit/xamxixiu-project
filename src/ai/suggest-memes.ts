import fs from "node:fs/promises";
import path from "node:path";
import { scanAssets } from "../assets/scanner.js";
import type { Asset } from "../assets/library.js";
import {
  reactionMemeAssets,
  reactionSfxAssets,
  sanitizeAnalysis,
  toPromptAsset,
  topicMemeAssets
} from "../assets/prompt-catalog.js";
import { ANALYZE_TARGET_COMMENT_COUNT } from "../comments/comment-constants.js";
import type { ThreadAnalysis, ThreadData } from "../types.js";
import { generateJsonWithRetry, parseModelJson } from "./json.js";
import { applyMiddleCommentTransitionSfx, hasMemeOrVideo } from "./meme-rules.js";
import {
  assignReactionCombos,
  isBuiltInComboId,
  memeCategoryForEmotion
} from "../timeline/meme-combo.js";

export interface SuggestedMemePatch {
  topicMemeId?: string | null;
  musicType?: ThreadAnalysis["musicType"];
  reactions?: Array<{
    commentIndex: number;
    memeAssetId?: string | null;
    memeCategory?: string | null;
    sfxAssetId?: string | null;
    sfxCategory?: string | null;
    comboId?: string;
    candidates?: string[];
  }>;
}

export async function suggestMemes(
  projectDir: string,
  existing: ThreadAnalysis
): Promise<ThreadAnalysis> {
  const assets = await scanAssets();
  const thread = await readThread(projectDir);
  const selectableMemes = reactionMemeAssets(assets);
  const selectableSfx = reactionSfxAssets(assets);
  const topicMemeIds = topicMemeAssets(assets).map((asset) => asset.id);
  const includedComments = thread.comments
    .map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => !comment.excluded);
  const videoCount = selectableMemes.filter(
    (asset) => asset.mediaKind === "video"
  ).length;
  const imageCount = selectableMemes.filter(
    (asset) => asset.mediaKind === "image"
  ).length;
  const videoTarget =
    videoCount === 0
      ? "There are no video memes. Use image memes plus SFX."
      : `Prefer video memes when they fit (${videoCount} videos, ${imageCount} images). Humorous threads can use video on about 65% of ~${ANALYZE_TARGET_COMMENT_COUNT} comments, but only with real video ids from the list.`;

  const prompt = `
You are a short-form video editor picking meme/SFX/music/combo for a Threads video.
Tone: ${existing.tone}. Topic type: ${existing.topicType}.
Do not force memes on serious/sad/educational content.
${videoTarget}
Image memes MUST have an sfxAssetId from AVAILABLE SFX ASSETS. Video memes must have sfxAssetId null.
Middle comments with no meme need sfxCategory "transition".
comboId must be one of: punch, cringe, shock, soft, none. Video memes use none.
Do not change voiceId values.

AVAILABLE MEME ASSETS:
${JSON.stringify(selectableMemes.map(toPromptAsset), null, 2)}

AVAILABLE SFX ASSETS:
${JSON.stringify(selectableSfx.map(toPromptAsset), null, 2)}

AVAILABLE TOPIC MEMES:
${JSON.stringify(topicMemeIds, null, 2)}

Post: ${thread.text}

Comments:
${includedComments.map(({ comment, index }) => `
Comment ${index} (voice ${
    existing.reactions.find((reaction) => reaction.commentIndex === index)?.voiceId ?? "none"
  }, emotion ${
    existing.reactions.find((reaction) => reaction.commentIndex === index)?.emotion ?? "neutral"
  }): ${comment.text}
`).join("\n")}

Return JSON:
{
  "topicMemeId": "id or null",
  "musicType": "funny | dramatic | chill | sad | neutral",
  "reactions": [{
    "commentIndex": 0,
    "memeAssetId": "id or null",
    "memeCategory": "laughing or null",
    "sfxAssetId": "id or null",
    "sfxCategory": "transition or null",
    "comboId": "punch | cringe | shock | soft | none",
    "candidates": ["id", "id", "id"]
  }]
}
`;

  const parsed = parseModelJson<SuggestedMemePatch>(
    await generateJsonWithRetry(prompt)
  );
  return applyMemeSuggestions(
    existing,
    parsed,
    assets,
    includedComments.map(({ index }) => index)
  );
}

export function applyMemeSuggestions(
  existing: ThreadAnalysis,
  parsed: SuggestedMemePatch,
  assets: Asset[],
  includedIndexes: number[]
): ThreadAnalysis {
  const reactionsByIndex = new Map(
    existing.reactions.map((reaction) => [reaction.commentIndex, { ...reaction }])
  );
  for (const item of parsed.reactions ?? []) {
    const current = reactionsByIndex.get(item.commentIndex);
    if (!current) {
      continue;
    }
    reactionsByIndex.set(item.commentIndex, {
      ...current,
      memeAssetId: item.memeAssetId ?? null,
      memeCategory: item.memeCategory ?? null,
      sfxAssetId: item.sfxAssetId ?? null,
      sfxCategory: item.sfxCategory ?? null,
      comboId: isBuiltInComboId(item.comboId ?? "")
        ? item.comboId
        : current.comboId
    });
  }

  const analysis: ThreadAnalysis = {
    ...existing,
    topicMemeId: parsed.topicMemeId ?? existing.topicMemeId ?? null,
    musicType: parsed.musicType ?? existing.musicType,
    reactions: [...reactionsByIndex.values()].sort(
      (left, right) => left.commentIndex - right.commentIndex
    )
  };
  fillMissingMemeSlots(analysis, assets);
  const memeById = new Map(
    assets
      .filter((asset) => asset.type === "meme")
      .map((asset) => [asset.id, asset])
  );
  analysis.reactions = assignReactionCombos(
    analysis.reactions,
    (reaction) =>
      memeById.get(reaction.memeAssetId ?? "")?.mediaKind === "video"
  );
  sanitizeAnalysis(analysis, assets);
  applyMiddleCommentTransitionSfx(
    analysis,
    includedIndexes,
    assets
      .filter(
        (asset) =>
          asset.type === "sfx" &&
          asset.category === "transition"
      )
      .map((asset) => asset.id)
  );
  return analysis;
}

function fillMissingMemeSlots(
  analysis: ThreadAnalysis,
  assets: Asset[]
): void {
  const hasImage = assets.some(
    (asset) => asset.type === "meme" && asset.mediaKind === "image"
  );
  const hasVideo = assets.some(
    (asset) => asset.type === "meme" && asset.mediaKind === "video"
  );
  const hasSfx = assets.some((asset) => asset.type === "sfx");
  if (!hasImage && !hasVideo) {
    return;
  }
  for (const reaction of analysis.reactions) {
    if (hasMemeOrVideo(reaction)) {
      continue;
    }
    const category = memeCategoryForEmotion(reaction.emotion);
    if (!category) {
      continue;
    }
    reaction.memeCategory = category;
    if (hasImage && hasSfx) {
      reaction.sfxCategory = reaction.sfxCategory ?? "boom";
    }
  }
}

export interface MemeCandidateSet {
  commentIndex: number;
  memeAssetIds: string[];
}

export function memeCandidatesFromAnalysis(
  analysis: ThreadAnalysis,
  extra?: MemeCandidateSet[]
): MemeCandidateSet[] {
  const byIndex = new Map<number, string[]>();
  for (const reaction of analysis.reactions) {
    const ids = extra?.find((item) => item.commentIndex === reaction.commentIndex)
      ?.memeAssetIds ?? [];
    if (reaction.memeAssetId) {
      ids.unshift(reaction.memeAssetId);
    }
    byIndex.set(reaction.commentIndex, [...new Set(ids)].slice(0, 5));
  }
  return [...byIndex.entries()].map(([commentIndex, memeAssetIds]) => ({
    commentIndex,
    memeAssetIds
  }));
}

async function readThread(projectDir: string): Promise<ThreadData> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(projectDir, "content.json"), "utf-8")
    ) as ThreadData;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return JSON.parse(
        await fs.readFile(path.join(projectDir, "thread.json"), "utf-8")
      ) as ThreadData;
    }
    throw error;
  }
}
