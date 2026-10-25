import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = "2026.10.1";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const vendorDirectory = path.join(root, "vendor");
const executablePath = path.join(vendorDirectory, "cloudflared.exe");
const licensePath = path.join(vendorDirectory, "cloudflared.LICENSE");
const versionPath = path.join(vendorDirectory, "cloudflared.version");
const executableUrl =
  `https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-windows-amd64.exe`;
const licenseUrl =
  `https://raw.githubusercontent.com/cloudflare/cloudflared/${version}/LICENSE`;

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Download failed (${response.status}) for ${url}`
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    destination.endsWith(".exe") &&
    bytes.length < 1_000_000
  ) {
    throw new Error(
      `Downloaded cloudflared is too small (${bytes.length} bytes).`
    );
  }

  await fs.promises.writeFile(destination, bytes);
}

fs.mkdirSync(vendorDirectory, { recursive: true });

const installedVersion = fs.existsSync(versionPath)
  ? fs.readFileSync(versionPath, "utf8").trim()
  : "";
const executableReady =
  installedVersion === version &&
  fs.existsSync(executablePath) &&
  fs.statSync(executablePath).size > 1_000_000;

if (executableReady) {
  console.log(`cloudflared ${version} already present`);
} else {
  console.log(`Downloading cloudflared ${version}...`);
  await download(executableUrl, executablePath);
  await fs.promises.writeFile(versionPath, `${version}\n`);
  console.log(`Saved ${executablePath}`);
}

if (!fs.existsSync(licensePath)) {
  await download(licenseUrl, licensePath);
  console.log(`Saved ${licensePath}`);
}
