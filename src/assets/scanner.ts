import {
  AssetLibrary,
  getAssetRoot
} from "./library.js";
export type {
  Asset,
  AssetMediaKind,
  AssetType
} from "./library.js";
export { findAsset, isSampleAsset } from "./library.js";

export async function scanAssets(
  root = getAssetRoot()
) {
  const library = new AssetLibrary(root);
  await library.initialize();
  return library.list();
}