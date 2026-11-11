import type {
  ReactionEvent,
  ThreadAnalysis
} from "../types.js";
import type { Asset } from "./library.js";
import {
  findAsset,
  isSampleAsset
} from "./library.js";
import { memeCategoryForEmotion } from "../timeline/meme-combo.js";

export interface PromptAsset {
  id: string;
  kind: Asset["mediaKind"];
  category: string;
  tags: string[];
  intensity: number;
  use: string;
  when: string;
  avoid: string;
}

interface ParsedSpec {
  use?: string;
  when?: string;
  avoid?: string;
}

export function isSelectableAsset(
  asset: Asset,
  options?: { includeTopic?: boolean }
): boolean {
  if (isSampleAsset(asset)) {
    return false;
  }
  if (
    asset.type === "meme" &&
    asset.category === "topic" &&
    !options?.includeTopic
  ) {
    return false;
  }
  return true;
}

export function toPromptAsset(asset: Asset): PromptAsset {
  const parsed = parseSpec(asset.spec);
  const label = fileLabel(asset);
  return {
    id: asset.id,
    kind: asset.mediaKind,
    category: asset.category,
    tags: asset.tags,
    intensity: asset.intensity,
    use: parsed.use || fallbackUse(asset, label),
    when: parsed.when || fallbackWhen(asset, label),
    avoid: parsed.avoid || fallbackAvoid(asset)
  };
}

export function reactionMemeAssets(assets: Asset[]): Asset[] {
  return assets.filter(
    (asset) => asset.type === "meme" && isSelectableAsset(asset)
  );
}

export function reactionSfxAssets(assets: Asset[]): Asset[] {
  return assets.filter(
    (asset) => asset.type === "sfx" && isSelectableAsset(asset)
  );
}

export function topicMemeAssets(assets: Asset[]): Asset[] {
  return assets.filter(
    (asset) =>
      asset.type === "meme" &&
      asset.category === "topic" &&
      isSelectableAsset(asset, { includeTopic: true })
  );
}

export function sanitizeAnalysis(
  analysis: ThreadAnalysis,
  assets: Asset[]
): ThreadAnalysis {
  const usedMemeIds = new Set<string>();
  analysis.reactions = (analysis.reactions ?? []).map((reaction) =>
    sanitizeReaction(reaction, assets, usedMemeIds)
  );
  return analysis;
}

function sanitizeReaction(
  reaction: ReactionEvent,
  assets: Asset[],
  usedMemeIds: Set<string>
): ReactionEvent {
  const meme = resolveSelectable(
    assets,
    reaction.memeAssetId,
    "meme"
  );
  let memeAssetId = reaction.memeAssetId ?? null;
  let memeCategory = reaction.memeCategory ?? null;
  let sfxAssetId = reaction.sfxAssetId ?? null;
  let sfxCategory = reaction.sfxCategory ?? null;

  if (memeAssetId) {
    if (!meme) {
      memeAssetId = null;
      memeCategory =
        memeCategory ?? memeCategoryForEmotion(reaction.emotion);
    } else if (usedMemeIds.has(meme.id)) {
      memeAssetId = null;
      memeCategory = memeCategory ?? meme.category;
    } else {
      memeAssetId = meme.id;
      usedMemeIds.add(meme.id);
      if (meme.category !== "video" && meme.category !== "topic") {
        memeCategory = meme.category;
      }
    }
  }

  const selectedMeme = memeAssetId
    ? resolveSelectable(assets, memeAssetId, "meme")
    : undefined;

  if (selectedMeme?.mediaKind === "video") {
    sfxAssetId = null;
    sfxCategory = null;
  }

  const sfx = resolveSelectable(assets, sfxAssetId, "sfx");
  if (sfxAssetId) {
    if (!sfx) {
      sfxAssetId = null;
    } else {
      sfxAssetId = sfx.id;
      sfxCategory = sfx.category;
    }
  }

  if (
    selectedMeme?.mediaKind === "image" &&
    !sfxAssetId &&
    !sfxCategory
  ) {
    const fallbackSfx = assets.find(
      (asset) => asset.type === "sfx" && isSelectableAsset(asset)
    );
    if (fallbackSfx) {
      sfxAssetId = fallbackSfx.id;
      sfxCategory = fallbackSfx.category;
    } else {
      memeAssetId = null;
      memeCategory = null;
    }
  }

  return {
    ...reaction,
    memeAssetId,
    memeCategory,
    sfxAssetId,
    sfxCategory
  };
}

function resolveSelectable(
  assets: Asset[],
  id: string | null | undefined,
  type: Asset["type"]
): Asset | undefined {
  if (!id) {
    return undefined;
  }
  const asset = findAsset(assets, { id, type });
  if (!asset || !isSelectableAsset(asset)) {
    return undefined;
  }
  return asset;
}

function parseSpec(spec?: string): ParsedSpec {
  if (!spec) {
    return {};
  }
  return {
    use: specField(spec, "Best for"),
    when: specField(spec, "Works with comments that"),
    avoid: specField(spec, "Do not use when")
  };
}

function specField(spec: string, label: string): string | undefined {
  const match = spec.match(
    new RegExp(`^-\\s*${escapeRegExp(label)}:\\s*(.+)$`, "im")
  );
  const value = match?.[1]?.trim();
  return value || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fileLabel(asset: Asset): string {
  const basename = asset.file.split(/[\\/]/).pop() ?? asset.id;
  return basename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function fallbackUse(asset: Asset, label: string): string {
  if (asset.type === "sfx") {
    return `${asset.category} sound effect (${label})`;
  }
  if (asset.mediaKind === "video") {
    return `Video reaction: ${label}`;
  }
  return `${asset.category} image reaction (${label})`;
}

function fallbackWhen(asset: Asset, label: string): string {
  if (asset.type === "sfx") {
    return `A ${asset.category} editing beat that fits ${label}.`;
  }
  const tags = asset.tags.length > 0
    ? asset.tags.join(", ")
    : asset.category;
  return `A comment that needs a ${tags} reaction.`;
}

function fallbackAvoid(asset: Asset): string {
  if (asset.category === "transition") {
    return "A punchline that needs a reaction SFX instead of a cut.";
  }
  return "Serious, sensitive, tragic, or disrespectful context.";
}
