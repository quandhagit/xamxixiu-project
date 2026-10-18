import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const ASSET_TYPES = [
  "meme",
  "sfx",
  "music",
  "background"
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetMediaKind = "image" | "video" | "audio";

export interface Asset {
  id: string;
  file: string;
  type: AssetType;
  category: string;
  tags: string[];
  intensity: number;
  mediaKind: AssetMediaKind;
  usage?: string;
  spec?: string;
  createdAt: string;
  updatedAt: string;
}

interface CatalogAsset extends Omit<Asset, "file"> {
  relativePath: string;
}

interface AssetCatalog {
  version: 1;
  assets: CatalogAsset[];
}

export interface AssetUpdate {
  category?: string;
  tags?: string[];
  intensity?: number;
  usage?: string;
  spec?: string;
}

export interface AssetImport {
  type: AssetType;
  category?: string;
  files: string[];
}

const EXTENSIONS: Record<AssetType, Set<string>> = {
  meme: new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm"]),
  sfx: new Set([".mp3", ".wav", ".m4a"]),
  music: new Set([".mp3", ".wav", ".m4a"]),
  background: new Set([".mp4", ".mov", ".webm"])
};

const TYPE_DIRECTORIES: Record<AssetType, string> = {
  meme: "memes",
  sfx: "sfx",
  music: "music",
  background: "backgrounds"
};

export const DEFAULT_CATEGORIES: Record<AssetType, string[]> = {
  meme: [
    "agree",
    "happy",
    "laughing",
    "sad",
    "angry",
    "confused",
    "cringe",
    "scared",
    "shocked",
    "shy",
    "topic",
    "video"
  ],
  sfx: [
    "boom",
    "ding",
    "fail",
    "impact",
    "record-scratch",
    "sad",
    "slap",
    "suspicious",
    "wow",
    "open topic",
    "transition"
  ],
  music: [],
  background: []
};

const TAG_MAP: Record<AssetType, Record<string, string[]>> = {
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
    shy: ["shy", "awkward", "embarrassed"],
    topic: ["topic"]
  },
  sfx: {
    boom: ["boom", "impact", "dramatic"],
    ding: ["ding", "correct", "success"],
    fail: ["fail", "wrong", "rejected"],
    impact: ["impact", "emphasis"],
    "record-scratch": ["awkward", "cringe", "sudden-stop"],
    sad: ["sad", "disappointment"],
    slap: ["slap", "roast", "comedy"],
    suspicious: ["suspicious", "sus", "side-eye"],
    wow: ["wow", "surprise", "impressed"],
    "open topic": ["open-topic", "intro"],
    transition: ["transition"]
  },
  music: {},
  background: {}
};

function defaultTags(type: AssetType, category: string): string[] {
  return TAG_MAP[type][category] ?? [category];
}

function isSamplePath(relativePath: string): boolean {
  return relativePath
    .replaceAll("\\", "/")
    .split("/")
    .some((part) => part.toLowerCase().includes("_sample"));
}

export function getAssetRoot(): string {
  return path.resolve(
    process.env.XAMXIXIU_ASSET_ROOT ??
    path.join(process.cwd(), "assets")
  );
}

export function isAssetType(value: unknown): value is AssetType {
  return typeof value === "string" &&
    ASSET_TYPES.includes(value as AssetType);
}

export function getMediaKind(extension: string): AssetMediaKind {
  const normalized = extension.toLowerCase();
  if ([".mp4", ".mov", ".webm"].includes(normalized)) {
    return "video";
  }
  if ([".mp3", ".wav", ".m4a"].includes(normalized)) {
    return "audio";
  }
  return "image";
}

export function isSupportedAssetFile(
  type: AssetType,
  file: string
): boolean {
  return EXTENSIONS[type].has(path.extname(file).toLowerCase());
}

function safeSegment(value: string, fallback: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  return cleaned || fallback;
}

async function atomicWriteJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(temporary, file);
}

async function walk(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await walk(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    return files;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export class AssetLibrary {
  readonly root: string;
  private readonly catalogFile: string;

  constructor(root = getAssetRoot()) {
    this.root = path.resolve(root);
    this.catalogFile = path.join(this.root, "catalog.json");
  }

  async initialize(sampleRoot?: string): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    for (const [type, directory] of Object.entries(TYPE_DIRECTORIES) as Array<[AssetType, string]>) {
      await fs.mkdir(path.join(this.root, directory), { recursive: true });
      for (const category of DEFAULT_CATEGORIES[type]) {
        await fs.mkdir(path.join(this.root, directory, category), { recursive: true });
      }
    }
    try {
      await fs.access(this.catalogFile);
      return;
    } catch {
      // First run.
    }

    const catalog: AssetCatalog = { version: 1, assets: [] };
    if (sampleRoot) {
      await this.seedSamples(path.resolve(sampleRoot), catalog);
    } else {
      await this.indexExistingFiles(catalog);
    }
    await atomicWriteJson(this.catalogFile, catalog);
  }

  async list(): Promise<Asset[]> {
    const catalog = await this.readCatalog();
    const assets = await Promise.all(catalog.assets.map(async (entry) => {
      const file = this.resolveRelative(entry.relativePath);
      try {
        await fs.access(file);
        return { ...entry, file };
      } catch {
        return null;
      }
    }));
    return assets
      .filter((asset): asset is Asset & CatalogAsset => asset !== null)
      .map(({ relativePath: _relativePath, ...asset }) => asset);
  }

  async get(id: string): Promise<Asset | undefined> {
    return (await this.list()).find((asset) => asset.id === id);
  }

  async importAssets(input: AssetImport): Promise<Asset[]> {
    if (!isAssetType(input.type) || !Array.isArray(input.files) || input.files.length === 0) {
      throw new Error("Invalid asset import payload");
    }
    const catalog = await this.readCatalog();
    const imported: Asset[] = [];
    for (const sourceValue of input.files) {
      if (typeof sourceValue !== "string" || !isSupportedAssetFile(input.type, sourceValue)) {
        throw new Error(`Unsupported ${input.type} asset: ${sourceValue}`);
      }
      const source = await fs.realpath(path.resolve(sourceValue));
      const stat = await fs.stat(source);
      if (!stat.isFile()) {
        throw new Error(`Asset source is not a file: ${sourceValue}`);
      }
      const category = safeSegment(input.category ?? input.type, input.type);
      const directory = path.join(
        this.root,
        TYPE_DIRECTORIES[input.type],
        category
      );
      await fs.mkdir(directory, { recursive: true });
      const extension = path.extname(source).toLowerCase();
      const basename = safeSegment(path.basename(source, path.extname(source)), "asset");
      let destination = path.join(directory, `${basename}${extension}`);
      let suffix = 2;
      while (await fs.access(destination).then(() => true).catch(() => false)) {
        destination = path.join(directory, `${basename}-${suffix}${extension}`);
        suffix += 1;
      }
      await fs.copyFile(source, destination);
      const now = new Date().toISOString();
      const entry: CatalogAsset = {
        id: crypto.randomUUID(),
        relativePath: path.relative(this.root, destination).replaceAll("\\", "/"),
        type: input.type,
        category,
        tags: defaultTags(input.type, category),
        intensity: 0.5,
        mediaKind: getMediaKind(extension),
        createdAt: now,
        updatedAt: now
      };
      catalog.assets.push(entry);
      imported.push(this.toAsset(entry));
    }
    await atomicWriteJson(this.catalogFile, catalog);
    return imported;
  }

  async update(id: string, update: AssetUpdate): Promise<Asset> {
    const catalog = await this.readCatalog();
    const entry = catalog.assets.find((asset) => asset.id === id);
    if (!entry) {
      throw new Error(`Asset not found: ${id}`);
    }
    if (update.category !== undefined) {
      entry.category = safeSegment(update.category, entry.type);
    }
    if (update.tags !== undefined) {
      if (!Array.isArray(update.tags) || update.tags.some((tag) => typeof tag !== "string")) {
        throw new Error("Asset tags must be strings");
      }
      entry.tags = [...new Set(update.tags.map((tag) => tag.trim()).filter(Boolean))];
    }
    if (update.intensity !== undefined) {
      if (!Number.isFinite(update.intensity) || update.intensity < 0 || update.intensity > 1) {
        throw new Error("Asset intensity must be between 0 and 1");
      }
      entry.intensity = update.intensity;
    }
    for (const field of ["usage", "spec"] as const) {
      const value = update[field];
      if (value !== undefined) {
        if (typeof value !== "string") {
          throw new Error(`Asset ${field} must be a string`);
        }
        entry[field] = value.trim() || undefined;
      }
    }
    entry.updatedAt = new Date().toISOString();
    await atomicWriteJson(this.catalogFile, catalog);
    return this.toAsset(entry);
  }

  async delete(id: string): Promise<void> {
    const catalog = await this.readCatalog();
    const index = catalog.assets.findIndex((asset) => asset.id === id);
    if (index < 0) {
      throw new Error(`Asset not found: ${id}`);
    }
    const [entry] = catalog.assets.splice(index, 1);
    await fs.rm(this.resolveRelative(entry.relativePath), { force: true });
    await atomicWriteJson(this.catalogFile, catalog);
  }

  async preview(id: string): Promise<{ mimeType: string; buffer: Buffer }> {
    const asset = await this.get(id);
    if (!asset) {
      throw new Error(`Asset not found: ${id}`);
    }
    const mimeTypes: Record<string, string> = {
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".webp": "image/webp", ".gif": "image/gif", ".mp3": "audio/mpeg",
      ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp4": "video/mp4",
      ".mov": "video/quicktime", ".webm": "video/webm"
    };
    const mimeType = mimeTypes[path.extname(asset.file).toLowerCase()];
    if (!mimeType) {
      throw new Error("Unsupported preview asset type");
    }
    return { mimeType, buffer: await fs.readFile(asset.file) };
  }

  private async readCatalog(): Promise<AssetCatalog> {
    await this.initialize();
    const parsed = JSON.parse(await fs.readFile(this.catalogFile, "utf-8")) as AssetCatalog;
    if (parsed.version !== 1 || !Array.isArray(parsed.assets)) {
      throw new Error("Invalid asset catalog");
    }
    return parsed;
  }

  private resolveRelative(relativePath: string): string {
    const resolved = path.resolve(this.root, relativePath);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Asset path escapes the library root");
    }
    return resolved;
  }

  private toAsset(entry: CatalogAsset): Asset {
    const { relativePath, ...asset } = entry;
    return { ...asset, file: this.resolveRelative(relativePath) };
  }

  private async indexExistingFiles(catalog: AssetCatalog): Promise<void> {
    for (const type of ASSET_TYPES) {
      const base = path.join(this.root, TYPE_DIRECTORIES[type]);
      for (const file of await walk(base)) {
        if (!isSupportedAssetFile(type, file)) continue;
        const relative = path.relative(base, file);
        const parts = relative.split(path.sep);
        const category = parts.length > 1 ? parts[0] : type;
        const now = new Date().toISOString();
        catalog.assets.push({
          id: crypto.createHash("sha256").update(`${type}:${relative.replaceAll("\\", "/")}`).digest("hex").slice(0, 24),
          relativePath: path.relative(this.root, file).replaceAll("\\", "/"),
          type,
          category,
          tags: defaultTags(type, category),
          intensity: 0.5,
          mediaKind: getMediaKind(path.extname(file)),
          ...(type === "meme" ? { spec: await this.readNearbySpec(file, base) } : {}),
          createdAt: now,
          updatedAt: now
        });
      }
    }
  }

  private async seedSamples(sampleRoot: string, catalog: AssetCatalog): Promise<void> {
    const allFiles = await walk(sampleRoot);
    for (const source of allFiles) {
      const relative = path.relative(sampleRoot, source);
      const normalized = relative.replaceAll("\\", "/");
      if (!isSamplePath(normalized)) continue;
      const type = ASSET_TYPES.find((candidate) =>
        normalized.startsWith(`${TYPE_DIRECTORIES[candidate]}/`) ||
        normalized === TYPE_DIRECTORIES[candidate]
      );
      if (!type || !isSupportedAssetFile(type, source)) continue;
      const destination = path.join(this.root, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
      const specSource = path.join(path.dirname(source), "spec.md");
      const specDestination = path.join(path.dirname(destination), "spec.md");
      const spec = await fs.readFile(specSource, "utf-8")
        .then(async (value) => {
          await fs.copyFile(specSource, specDestination).catch(() => undefined);
          return value.trim();
        })
        .catch(() => undefined);
      const parts = path.relative(
        path.join(sampleRoot, TYPE_DIRECTORIES[type]),
        source
      ).split(path.sep);
      const category = parts.length > 1 ? parts[0] : type;
      const now = new Date().toISOString();
      catalog.assets.push({
        id: crypto.createHash("sha256").update(`sample:${normalized}`).digest("hex").slice(0, 24),
        relativePath: relative.replaceAll("\\", "/"),
        type,
        category,
        tags: defaultTags(type, category),
        intensity: 0.5,
        mediaKind: getMediaKind(path.extname(source)),
        ...(spec ? { spec } : {}),
        createdAt: now,
        updatedAt: now
      });
    }
  }

  private async readNearbySpec(file: string, root: string): Promise<string | undefined> {
    let directory = path.dirname(file);
    while (directory.startsWith(root)) {
      const spec = await fs.readFile(path.join(directory, "spec.md"), "utf-8")
        .then((value) => value.trim())
        .catch(() => undefined);
      if (spec) return spec;
      if (directory === root) break;
      directory = path.dirname(directory);
    }
    return undefined;
  }
}
