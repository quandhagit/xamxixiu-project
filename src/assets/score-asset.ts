import type { Asset } from "./library.js";
import { toPromptAsset } from "./prompt-catalog.js";

export function tokenizeAssetQuery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

export function scoreAssetForText(asset: Asset, query: string): number {
  const tokens = tokenizeAssetQuery(query);
  if (tokens.length === 0) {
    return 0;
  }
  const prompt = toPromptAsset(asset);
  const haystack = [
    prompt.id,
    prompt.kind,
    prompt.category,
    ...prompt.tags,
    prompt.use,
    prompt.when
  ]
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (prompt.category === token) {
      score += 6;
    }
    if (prompt.tags.includes(token)) {
      score += 4;
    }
    if (haystack.includes(token)) {
      score += 2;
    }
    if (prompt.avoid.toLowerCase().includes(token)) {
      score -= 8;
    }
  }
  return score;
}

export function pickScoredAsset(
  candidates: Asset[],
  usedIds: Set<string>,
  query: string,
  allowReuse: boolean
): Asset | null {
  const unused = candidates.filter((asset) => !usedIds.has(asset.id));
  const pool = unused.length > 0 ? unused : allowReuse ? candidates : [];
  if (pool.length === 0) {
    return null;
  }
  const ranked = [...pool].sort((left, right) => {
    const delta =
      scoreAssetForText(right, query) - scoreAssetForText(left, query);
    if (delta !== 0) {
      return delta;
    }
    return left.id.localeCompare(right.id);
  });
  const asset = ranked[0];
  usedIds.add(asset.id);
  return asset;
}
