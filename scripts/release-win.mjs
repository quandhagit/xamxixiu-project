import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
createRequire(import.meta.url)("dotenv").config({
  path: path.join(root, ".env")
});

const yarnCommand =
  process.platform === "win32" ? "yarn.cmd" : "yarn";
const owner = "quandhagit";
const repo = "xamxixiu-project";
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "xamxixiu-release",
  "X-GitHub-Api-Version": "2022-11-28"
};

function githubToken() {
  const token = (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ""
  ).trim();
  if (!token) {
    throw new Error(
      "Missing GITHUB_TOKEN. Add it to .env (or set GH_TOKEN)."
    );
  }
  return token;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with code ${result.status ?? 1}`
    );
  }
}

function readPackageVersion() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );
  if (
    typeof packageJson.version !== "string" ||
    !packageJson.version
  ) {
    throw new Error("package.json is missing version");
  }
  return packageJson.version;
}

function installerNameFromLatestYml(contents) {
  const pathMatch = contents.match(/^path:\s*(.+)\s*$/m);
  const urlMatch = contents.match(/^\s+url:\s*(.+\.exe)\s*$/m);
  const name = (pathMatch?.[1] ?? urlMatch?.[1] ?? "").trim();
  if (!name.endsWith(".exe")) {
    throw new Error("latest.yml does not name an installer .exe");
  }
  return name;
}

function resolveArtifact(distDirectory, preferredName, version) {
  const candidates = [
    path.join(distDirectory, preferredName),
    path.join(distDirectory, `Xam-Xi-Xiu-Setup-${version}.exe`),
    path.join(distDirectory, `Xam Xi Xiu Setup ${version}.exe`)
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `Installer not found. Looked for ${preferredName} in dist/`
    );
  }
  return found;
}

async function githubJson(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...githubHeaders,
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message = typeof body === "object" && body?.message
      ? body.message
      : text || response.statusText;
    const error = new Error(`GitHub ${response.status}: ${message}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function isAlreadyExists(error) {
  if (error.status !== 422) {
    return false;
  }
  const serialized = JSON.stringify(error.body ?? error.message);
  return serialized.includes("already_exists") ||
    /already exists/i.test(serialized);
}

async function listReleases(token) {
  const releases = [];
  let page = 1;
  while (page <= 5) {
    const batch = await githubJson(
      token,
      `${apiBase}/releases?per_page=100&page=${page}`
    );
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }
    releases.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page += 1;
  }
  return releases;
}

function pickRelease(matches) {
  const published = matches.filter((release) => !release.draft);
  const pool = published.length > 0 ? published : matches;
  return [...pool].sort((left, right) => {
    const leftAssets = left.assets?.length ?? 0;
    const rightAssets = right.assets?.length ?? 0;
    return rightAssets - leftAssets;
  })[0];
}

async function ensureRelease(token, version) {
  const tag = `v${version}`;
  const matches = (await listReleases(token)).filter(
    (release) =>
      release.tag_name === tag ||
      release.tag_name === version
  );
  if (matches.length > 1) {
    console.warn(
      `[release] Found ${matches.length} GitHub releases for ${tag}; using one and leaving extras for you to delete.`
    );
  }
  if (matches.length > 0) {
    return pickRelease(matches);
  }

  try {
    return await githubJson(token, `${apiBase}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        name: version,
        draft: false,
        prerelease: false,
        generate_release_notes: false
      })
    });
  } catch (error) {
    if (!isAlreadyExists(error)) {
      throw error;
    }
    const retry = pickRelease(
      (await listReleases(token)).filter(
        (release) =>
          release.tag_name === tag ||
          release.tag_name === version
      )
    );
    if (!retry) {
      throw error;
    }
    return retry;
  }
}

async function publishRelease(token, release) {
  if (!release.draft) {
    return release;
  }
  return githubJson(token, `${apiBase}/releases/${release.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft: false })
  });
}

async function deleteAssetIfPresent(token, release, fileName) {
  const assets = await githubJson(
    token,
    `${apiBase}/releases/${release.id}/assets?per_page=100`
  );
  const existing = Array.isArray(assets)
    ? assets.find((asset) => asset.name === fileName)
    : undefined;
  if (!existing) {
    return;
  }
  console.log(`[release] Replacing ${fileName}`);
  await githubJson(
    token,
    `${apiBase}/releases/assets/${existing.id}`,
    { method: "DELETE" }
  );
}

async function uploadAsset(token, release, fileName, filePath) {
  await deleteAssetIfPresent(token, release, fileName);
  const stat = fs.statSync(filePath);
  console.log(
    `[release] Uploading ${fileName} (${stat.size} bytes)`
  );
  const uploadUrl =
    `${release.upload_url.slice(0, release.upload_url.indexOf("{"))}` +
    `?name=${encodeURIComponent(fileName)}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...githubHeaders,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(stat.size)
    },
    body: fs.createReadStream(filePath),
    duplex: "half"
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Upload ${fileName} failed (${response.status}): ${text}`
    );
  }
}

async function publishToGithub(version) {
  const token = githubToken();
  const distDirectory = path.join(root, "dist");
  const latestYmlPath = path.join(distDirectory, "latest.yml");
  if (!fs.existsSync(latestYmlPath)) {
    throw new Error("dist/latest.yml was not generated");
  }
  const installerName = installerNameFromLatestYml(
    fs.readFileSync(latestYmlPath, "utf8")
  );
  const installerPath = resolveArtifact(
    distDirectory,
    installerName,
    version
  );
  const blockmapPath = `${installerPath}.blockmap`;
  if (!fs.existsSync(blockmapPath)) {
    throw new Error(`Missing blockmap: ${blockmapPath}`);
  }

  const release = await ensureRelease(token, version);
  console.log(
    `[release] Using GitHub release ${release.html_url ?? release.tag_name}`
  );
  await uploadAsset(token, release, "latest.yml", latestYmlPath);
  await uploadAsset(token, release, installerName, installerPath);
  await uploadAsset(
    token,
    release,
    `${installerName}.blockmap`,
    blockmapPath
  );
  const published = await publishRelease(token, release);
  console.log(`[release] Published ${published.html_url}`);
}

async function main() {
  const version = readPackageVersion();
  console.log(`[release] Building Windows installer ${version}`);
  run(yarnCommand, ["fetch:binaries"]);
  run(yarnCommand, ["build"]);
  run(yarnCommand, [
    "electron-builder",
    "--win",
    "--publish",
    "never"
  ]);
  await publishToGithub(version);
}

main().catch((error) => {
  console.error(`[release] ${error.message}`);
  process.exit(1);
});
