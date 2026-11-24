export function pickPreviewMeme<
  T extends { type: string; mediaKind?: string; file: string }
>(assets: T[]): T | undefined {
  const images = assets.filter(
    (asset) =>
      asset.type === "meme" &&
      asset.mediaKind !== "video" &&
      asset.mediaKind !== "audio"
  );
  const samples = images.filter((asset) =>
    asset.file.replaceAll("\\", "/").toLowerCase().includes("/_sample.")
  );
  return (
    samples.find((asset) =>
      asset.file.replaceAll("\\", "/").toLowerCase().includes("/happy/")
    ) ??
    samples[0] ??
    images[0]
  );
}
