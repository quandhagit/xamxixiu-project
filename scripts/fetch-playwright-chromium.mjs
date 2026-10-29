import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const vendorDirectory = path.join(root, "vendor", "playwright-chromium");
const chromePath = path.join(vendorDirectory, "chrome.exe");
const versionPath = path.join(vendorDirectory, "chromium.version");
const require = createRequire(import.meta.url);

function playwrightVersion() {
  const pkg = require("playwright/package.json");
  return typeof pkg.version === "string" ? pkg.version : "unknown";
}

function ready(version) {
  return (
    fs.existsSync(versionPath) &&
    fs.readFileSync(versionPath, "utf8").trim() === version &&
    fs.existsSync(chromePath) &&
    fs.statSync(chromePath).size > 1_000_000
  );
}

const version = playwrightVersion();

if (ready(version)) {
  console.log(`Playwright Chromium ${version} already present`);
  process.exit(0);
}

console.log(`Installing Playwright Chromium for playwright@${version}...`);
const install = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "install", "chromium"],
  {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);
if (install.status !== 0) {
  throw new Error("playwright install chromium failed");
}

const { chromium } = await import("playwright");
const executablePath = chromium.executablePath();
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error(
    `Chromium executable not found at ${executablePath || "(empty)"}`
  );
}

const sourceDir = path.dirname(executablePath);
fs.rmSync(vendorDirectory, { recursive: true, force: true });
fs.mkdirSync(path.dirname(vendorDirectory), { recursive: true });
fs.cpSync(sourceDir, vendorDirectory, { recursive: true });

if (!fs.existsSync(chromePath)) {
  throw new Error(`Copied Chromium folder is missing chrome.exe: ${vendorDirectory}`);
}

fs.writeFileSync(versionPath, `${version}\n`);
console.log(`Saved ${chromePath}`);
