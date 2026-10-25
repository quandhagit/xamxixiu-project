export function assetMediaSrc(assetId: string): string {
  return `xammedia://library/?id=${encodeURIComponent(assetId)}`;
}

export function assetFileName(file: string): string {
  return file.split(/[\\/]/).pop() ?? file;
}
