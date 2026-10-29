import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = "7.1.1";
const zipName = `ffmpeg-${version}-essentials_build.zip`;
const zipUrl =
  `https://github.com/GyanD/codexffmpeg/releases/download/${version}/${zipName}`;
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const vendorDirectory = path.join(root, "vendor", "ffmpeg");
const ffmpegPath = path.join(vendorDirectory, "ffmpeg.exe");
const ffprobePath = path.join(vendorDirectory, "ffprobe.exe");
const versionPath = path.join(vendorDirectory, "ffmpeg.version");
const licensePath = path.join(vendorDirectory, "LICENSE");

function ready() {
  return (
    fs.existsSync(versionPath) &&
    fs.readFileSync(versionPath, "utf8").trim() === version &&
    fs.existsSync(ffmpegPath) &&
    fs.existsSync(ffprobePath) &&
    fs.statSync(ffmpegPath).size > 1_000_000 &&
    fs.statSync(ffprobePath).size > 1_000_000
  );
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1_000_000) {
    throw new Error(
      `Downloaded ffmpeg zip is too small (${bytes.length} bytes).`
    );
  }
  await fs.promises.writeFile(destination, bytes);
}

function findFile(directory, name) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name) {
      return full;
    }
    if (entry.isDirectory()) {
      const nested = findFile(full, name);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

if (ready()) {
  console.log(`ffmpeg ${version} already present`);
  process.exit(0);
}

fs.mkdirSync(vendorDirectory, { recursive: true });

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xamxixiu-ffmpeg-"));
const zipPath = path.join(tempRoot, zipName);
const extractPath = path.join(tempRoot, "extract");

try {
  console.log(`Downloading ffmpeg ${version}...`);
  await download(zipUrl, zipPath);
  fs.mkdirSync(extractPath, { recursive: true });
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath "${zipPath.replaceAll('"', '`"')}" -DestinationPath "${extractPath.replaceAll('"', '`"')}" -Force`
    ],
    { stdio: "inherit" }
  );

  const ffmpegSource = findFile(extractPath, "ffmpeg.exe");
  const ffprobeSource = findFile(extractPath, "ffprobe.exe");
  if (!ffmpegSource || !ffprobeSource) {
    throw new Error("ffmpeg.exe or ffprobe.exe missing from the zip.");
  }

  fs.copyFileSync(ffmpegSource, ffmpegPath);
  fs.copyFileSync(ffprobeSource, ffprobePath);

  const licenseSource =
    findFile(extractPath, "LICENSE") ??
    findFile(extractPath, "LICENSE.txt");
  if (licenseSource) {
    fs.copyFileSync(licenseSource, licensePath);
  }

  fs.writeFileSync(versionPath, `${version}\n`);
  console.log(`Saved ${ffmpegPath}`);
  console.log(`Saved ${ffprobePath}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
