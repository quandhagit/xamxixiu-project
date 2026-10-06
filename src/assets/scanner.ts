import fs from "node:fs/promises";
import path from "node:path";

export type AssetType =
  | "meme"
  | "sfx"
  | "music";

export interface Asset {
  id: string;
  file: string;
  type: AssetType;
  category: string;
  tags: string[];
  intensity: number;
}

const ASSET_DIRS: Record<AssetType, string> = {
  meme: "assets/memes",
  sfx: "assets/sfx",
  music: "assets/music"
};

const SUPPORTED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".mov",
  ".mp3",
  ".wav",
  ".m4a"
]);

const TAG_MAP: Record<
  AssetType,
  Record<string, string[]>
> = {
  meme: {
    agree: ["agree", "approval"],
    happy: ["happy", "positive"],
    laughing: ["laughing", "funny"],
    sad: ["sad", "disappointed"],
    angry: ["angry", "mad"],
    confused: ["confused", "uncertain"],
    cringe: ["cringe", "awkward"],
    scared: ["scared", "fear"],
    shocked: ["shocked", "surprised"],
    shy: ["shy", "awkward", "embarrassed"]
  },

  sfx: {
    boom: ["boom", "impact", "dramatic"],
    ding: ["ding", "correct", "success"],
    fail: ["fail", "wrong", "rejected"],
    impact: ["impact", "emphasis"],
    "record-scratch": [
      "awkward",
      "cringe",
      "sudden-stop"
    ],
    sad: ["sad", "disappointment"],
    slap: ["slap", "roast", "comedy"],
    suspicious: [
      "suspicious",
      "sus",
      "side-eye"
    ],
    wow: ["wow", "surprise", "impressed"]
  },

  music: {}
};

export async function scanAssets(): Promise<Asset[]> {
  const assets: Asset[] = [];

  for (const [type, directory] of Object.entries(
    ASSET_DIRS
  ) as Array<[AssetType, string]>) {
    const files = await getFiles(directory);

    for (const file of files) {
      const extension = path.extname(file).toLowerCase();

      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        continue;
      }

      const relativePath = path.relative(directory, file);

      const pathParts = relativePath.split(path.sep);

      const category =
        pathParts.length > 1
          ? pathParts[0]
          : type;

      const filename = path.basename(file, extension);
      const tags =
        TAG_MAP[type][category] ?? [category];

      assets.push({
        id: filename,
        file: file.replaceAll("\\", "/"),
        type,
        category,
        tags,
        intensity: 0.5
      });
    }
  }

  return assets;
}

async function getFiles(
  directory: string
): Promise<string[]> {
  try {
    const entries = await fs.readdir(
      directory,
      {
        withFileTypes: true
      }
    );

    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(
        directory,
        entry.name
      );

      if (entry.isDirectory()) {
        files.push(
          ...(await getFiles(fullPath))
        );

        continue;
      }

      files.push(fullPath);
    }

    return files;
  } catch {
    return [];
  }
}