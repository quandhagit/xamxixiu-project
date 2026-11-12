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
import { pickScoredAsset, scoreAssetForText } from "../assets/score-asset.js";
import type {
  ReactionEmotion,
  ReactionEvent,
  ThreadAnalysis,
  ThreadData
} from "../types.js";
import { generateJsonWithRetry, parseModelJson } from "./json.js";
import { applyMiddleCommentTransitionSfx, hasMemeOrVideo } from "./meme-rules.js";
import {
  assignReactionCombos,
  comboFromEmotion,
  isBuiltInComboId
} from "../timeline/meme-combo.js";

const CASUAL_MEME_DENSITY = 0.7;

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

export interface MemeSuggestionComment {
  commentIndex: number;
  text: string;
}

export async function suggestMemes(
  projectDir: string,
  existing: ThreadAnalysis
): Promise<ThreadAnalysis> {
  const assets = await scanAssets();
  const thread = await readThread(projectDir);
  const selectableMemes = reactionMemeAssets(assets);
  const selectableSfx = reactionSfxAssets(assets);
  const topicMemes = topicMemeAssets(assets);
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
      : `Video memes exist (${videoCount} videos, ${imageCount} images). Use a video meme only when the comment is a visual gag or needs a moving reaction. Do not target a video percentage.`;

  const prompt = `
You are a short-form video editor picking meme/SFX/music/combo for a Threads video.
Tone: ${existing.tone}. Topic type: ${existing.topicType}.
Ignore stored emotion if it is "neutral" — infer punch from the comment text.
Match meme ids to each comment using use / when / avoid. Skip an asset when avoid fits.
Casual or humorous threads: put a meme on about 60–80% of comments, leaving breathing room.
Serious, sad, or educational threads: fewer or no reaction memes.
Never reuse the same memeAssetId or sfxAssetId across comments.
Image memes MUST have an sfxAssetId from AVAILABLE SFX ASSETS. Video memes must have sfxAssetId null.
Middle comments with no meme need sfxCategory "transition".
comboId must be one of: punch, cringe, shock, soft, none. Video memes use none.
Pick topicMemeId from AVAILABLE TOPIC MEMES when that list is not empty.
Do not change voiceId values.
${videoTarget}

AVAILABLE MEME ASSETS:
${JSON.stringify(selectableMemes.map(toPromptAsset), null, 2)}

AVAILABLE SFX ASSETS:
${JSON.stringify(selectableSfx.map(toPromptAsset), null, 2)}

AVAILABLE TOPIC MEMES:
${JSON.stringify(topicMemes.map(toPromptAsset), null, 2)}

Post: ${thread.text}

Comments:
${includedComments.map(({ comment, index }) => `
Comment ${index}: ${comment.text}
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
    "candidates": ["unused-meme-id", "unused-meme-id", "unused-meme-id"]
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
    includedComments.map(({ index }) => index),
    includedComments.map(({ comment, index }) => ({
      commentIndex: index,
      text: comment.text
    }))
  );
}

export function applyMemeSuggestions(
  existing: ThreadAnalysis,
  parsed: SuggestedMemePatch,
  assets: Asset[],
  includedIndexes: number[],
  comments: MemeSuggestionComment[] = []
): ThreadAnalysis {
  const commentsByIndex = new Map(
    comments.map((item) => [item.commentIndex, item.text])
  );
  const candidatesByIndex = new Map<number, string[]>();
  const reactionsByIndex = new Map(
    existing.reactions.map((reaction) => [reaction.commentIndex, { ...reaction }])
  );
  for (const item of parsed.reactions ?? []) {
    const current = reactionsByIndex.get(item.commentIndex);
    if (!current) {
      continue;
    }
    candidatesByIndex.set(item.commentIndex, item.candidates ?? []);
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
  if (!analysis.topicMemeId) {
    analysis.topicMemeId = topicMemeAssets(assets)[0]?.id ?? null;
  }
  dedupeReactionAssets(analysis, assets, candidatesByIndex, commentsByIndex);
  fillMissingMemeSlots(analysis, assets, commentsByIndex);
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

function commentQuery(
  reaction: ReactionEvent,
  commentsByIndex: Map<number, string>
): string {
  const text = commentsByIndex.get(reaction.commentIndex) ?? "";
  const emotion =
    reaction.emotion && reaction.emotion !== "neutral"
      ? reaction.emotion
      : "";
  return `${emotion} ${text}`.trim();
}

function assignMeme(
  reaction: ReactionEvent,
  meme: Asset | null,
  sfx: Asset | null
): void {
  reaction.memeAssetId = meme?.id ?? null;
  reaction.memeCategory = meme?.category ?? null;
  if (!meme) {
    return;
  }
  if (meme.mediaKind === "video") {
    reaction.sfxAssetId = null;
    reaction.sfxCategory = null;
    reaction.comboId = "none";
    return;
  }
  reaction.sfxAssetId = sfx?.id ?? null;
  reaction.sfxCategory = sfx?.category ?? null;
  if (!isBuiltInComboId(reaction.comboId ?? "")) {
    reaction.comboId = comboFromEmotion(
      (meme.category as ReactionEmotion) || reaction.emotion,
      { previousPunch: false }
    ).id;
  }
}

function pickMemeForComment(
  memes: Asset[],
  usedMemeIds: Set<string>,
  query: string
): Asset | null {
  const images = memes.filter((asset) => asset.mediaKind === "image");
  const videos = memes.filter((asset) => asset.mediaKind === "video");
  return (
    pickScoredAsset(images, usedMemeIds, query, false) ??
    pickScoredAsset(videos, usedMemeIds, query, false)
  );
}

function pickSfxForMeme(
  meme: Asset | null,
  sfxPool: Asset[],
  usedSfxIds: Set<string>,
  query: string
): Asset | null {
  if (!meme || meme.mediaKind === "video") {
    return null;
  }
  return (
    pickScoredAsset(sfxPool, usedSfxIds, query, false) ??
    pickScoredAsset(sfxPool, usedSfxIds, query, true)
  );
}

function dedupeReactionAssets(
  analysis: ThreadAnalysis,
  assets: Asset[],
  candidatesByIndex: Map<number, string[]>,
  commentsByIndex: Map<number, string>
): void {
  const memes = reactionMemeAssets(assets);
  const sfxPool = reactionSfxAssets(assets);
  const memeById = new Map(memes.map((asset) => [asset.id, asset]));
  const usedMemeIds = new Set<string>();
  const usedSfxIds = new Set<string>();

  for (const reaction of analysis.reactions) {
    const query = commentQuery(reaction, commentsByIndex);
    let meme = reaction.memeAssetId
      ? memeById.get(reaction.memeAssetId) ?? null
      : null;
    if (!meme) {
      if (reaction.sfxAssetId && usedSfxIds.has(reaction.sfxAssetId)) {
        const replacement = pickScoredAsset(sfxPool, usedSfxIds, query, false);
        reaction.sfxAssetId = replacement?.id ?? null;
        reaction.sfxCategory = replacement?.category ?? reaction.sfxCategory;
      } else if (reaction.sfxAssetId) {
        usedSfxIds.add(reaction.sfxAssetId);
      }
      continue;
    }
    if (usedMemeIds.has(meme.id)) {
      const nextId = (candidatesByIndex.get(reaction.commentIndex) ?? []).find(
        (id) => !usedMemeIds.has(id) && memeById.has(id)
      );
      meme = nextId
        ? memeById.get(nextId) ?? null
        : pickMemeForComment(memes, usedMemeIds, query);
    } else {
      usedMemeIds.add(meme.id);
    }

    let sfx = reaction.sfxAssetId
      ? sfxPool.find((asset) => asset.id === reaction.sfxAssetId) ?? null
      : null;
    if (meme?.mediaKind === "video") {
      sfx = null;
    } else if (sfx && usedSfxIds.has(sfx.id)) {
      sfx = pickSfxForMeme(meme, sfxPool, usedSfxIds, query);
    } else if (sfx) {
      usedSfxIds.add(sfx.id);
    }
    if (meme?.mediaKind === "image" && !sfx) {
      sfx = pickSfxForMeme(meme, sfxPool, usedSfxIds, query);
    }
    if (!meme) {
      reaction.memeAssetId = null;
      reaction.memeCategory = null;
      continue;
    }
    assignMeme(reaction, meme, sfx);
  }
}

function shouldFillMemeDensity(analysis: ThreadAnalysis): boolean {
  return analysis.tone !== "serious" && analysis.musicType !== "sad";
}

function fillMissingMemeSlots(
  analysis: ThreadAnalysis,
  assets: Asset[],
  commentsByIndex: Map<number, string>
): void {
  const memes = reactionMemeAssets(assets);
  const sfxPool = reactionSfxAssets(assets);
  if (memes.length === 0) {
    return;
  }
  const usedMemeIds = new Set(
    analysis.reactions
      .map((reaction) => reaction.memeAssetId)
      .filter((id): id is string => Boolean(id))
  );
  const usedSfxIds = new Set(
    analysis.reactions
      .map((reaction) => reaction.sfxAssetId)
      .filter((id): id is string => Boolean(id))
  );
  if (!shouldFillMemeDensity(analysis)) {
    return;
  }
  const targetCount = Math.max(
    1,
    Math.round(analysis.reactions.length * CASUAL_MEME_DENSITY)
  );
  const missing = analysis.reactions
    .filter((reaction) => !hasMemeOrVideo(reaction))
    .map((reaction) => {
      const query = commentQuery(reaction, commentsByIndex);
      const scored = [...memes]
        .filter((asset) => !usedMemeIds.has(asset.id))
        .sort((left, right) => {
          const delta =
            scoreAssetForText(right, query) - scoreAssetForText(left, query);
          if (delta !== 0) {
            return delta;
          }
          return left.id.localeCompare(right.id);
        });
      return { reaction, query, best: scored[0] ?? null };
    })
    .sort((left, right) => {
      const leftScore = left.best ? scoreAssetForText(left.best, left.query) : -1;
      const rightScore = right.best
        ? scoreAssetForText(right.best, right.query)
        : -1;
      return rightScore - leftScore;
    });

  let filled = analysis.reactions.filter(hasMemeOrVideo).length;
  for (const item of missing) {
    if (filled >= targetCount) {
      break;
    }
    const meme = pickMemeForComment(memes, usedMemeIds, item.query);
    if (!meme) {
      continue;
    }
    const sfx = pickSfxForMeme(meme, sfxPool, usedSfxIds, item.query);
    if (meme.mediaKind === "image" && !sfx) {
      usedMemeIds.delete(meme.id);
      continue;
    }
    assignMeme(item.reaction, meme, sfx);
    filled += 1;
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
