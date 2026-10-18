import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MEDIA_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".mp4", ".mov", ".webm", ".mp3", ".wav", ".m4a"
]);
const MAX_SAMPLE_BYTES = 2 * 1024 * 1024;
const REQUIRED_SAMPLES = [
  "assets/backgrounds/_sample.mp4",
  "assets/music/_sample.mp3",
  "assets/memes/video/_sample/reaction.mp4",
  "assets/memes/video/_sample/spec.md"
];
const IMAGE_CATEGORIES = [
  "agree", "angry", "confused", "cringe", "happy",
  "laughing", "sad", "scared", "shocked", "shy"
];
const SFX_CATEGORIES = [
  "boom", "ding", "fail", "impact", "record-scratch",
  "sad", "slap", "suspicious", "wow", "open topic", "transition"
];

function isSampleMedia(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const basename = path.posix.basename(normalized);
  return basename.startsWith("_sample.") ||
    normalized === "assets/memes/video/_sample/reaction.mp4";
}

function categoryKey(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts[1] === "backgrounds") return "background:background";
  if (parts[1] === "music") return "music:music";
  if (parts[1] === "sfx") return `sfx:${parts[2] ?? "sfx"}`;
  if (parts[1] === "memes") return `meme:${parts[2] ?? "meme"}`;
  return normalized;
}

const git = spawnSync("git", ["ls-files", "assets"], {
  encoding: "utf-8",
  shell: false
});
if (git.status !== 0) {
  console.error("[FAIL] asset-policy: git ls-files assets failed");
  process.exit(git.status ?? 1);
}

const tracked = git.stdout.split(/\r?\n/).filter(Boolean);
const errors = [];
const samplesByCategory = new Map();

const ALLOWED_SPECS = new Set([
  "assets/memes/_template/spec.md",
  "assets/memes/video/_sample/spec.md"
]);

for (const file of tracked) {
  const normalized = file.replaceAll("\\", "/");
  const extension = path.extname(file).toLowerCase();
  if (normalized === "assets/assets.json" ||
    normalized === "assets/catalog.json") {
    errors.push(`Generated catalog must not be tracked: ${file}`);
    continue;
  }
  if (normalized.endsWith("/spec.md") || path.posix.basename(normalized) === "spec.md") {
    if (!ALLOWED_SPECS.has(normalized)) {
      errors.push(`Tracked spec is not a sample/template: ${file}`);
    }
    continue;
  }
  if (!MEDIA_EXTENSIONS.has(extension)) {
    continue;
  }
  if (!isSampleMedia(file)) {
    errors.push(`Tracked media is not a sample: ${file}`);
    continue;
  }
  const key = categoryKey(file);
  samplesByCategory.set(key, [...(samplesByCategory.get(key) ?? []), file]);
  const size = fs.statSync(file).size;
  if (size > MAX_SAMPLE_BYTES) {
    errors.push(`Sample exceeds 2MB: ${file} (${size} bytes)`);
  }
}

for (const required of REQUIRED_SAMPLES) {
  if (!fs.existsSync(required)) {
    errors.push(`Missing required sample: ${required}`);
  }
}

for (const category of IMAGE_CATEGORIES) {
  const file = `assets/memes/${category}/_sample.jpg`;
  if (!fs.existsSync(file)) {
    errors.push(`Missing required sample: ${file}`);
  }
}
if (!fs.existsSync("assets/memes/_template/spec.md")) {
  errors.push("Missing required sample: assets/memes/_template/spec.md");
}
if (!fs.existsSync("assets/memes/topic/_sample.png")) {
  errors.push("Missing required sample: assets/memes/topic/_sample.png");
}
for (const category of SFX_CATEGORIES) {
  const file = `assets/sfx/${category}/_sample.mp3`;
  if (!fs.existsSync(file)) {
    errors.push(`Missing required sample: ${file}`);
  }
}

for (const [category, files] of samplesByCategory) {
  if (files.length > 1) {
    errors.push(`More than one sample in ${category}: ${files.join(", ")}`);
  }
}

if (errors.length > 0) {
  console.error("[FAIL] asset-policy");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

process.stdout.write("asset-policy checks passed\n");
