import {
  app,
  BrowserWindow,
  net,
  protocol
} from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath,
  pathToFileURL
} from "node:url";
import {
  handleAssetMediaRequest
} from "./media-protocol.js";

import {
  registerIpc
} from "./ipc.js";
import {
  setupAutoUpdater
} from "./updater.js";
import {
  startVbeeServices,
  type VbeeServices
} from "./vbee-tunnel.js";
import {
  ProjectStore
} from "../project/store.js";
import {
  applySettings,
  loadSettings
} from "./settings.js";
import {
  AssetLibrary
} from "../assets/library.js";
import {
  resolveChromiumExecutable,
  resolveFfmpegPath,
  resolveFfprobePath
} from "../binaries.js";

const rendererUrl =
  process.env.XAMXIXIU_RENDERER_URL ??
  "http://localhost:3000";
const currentFile =
  fileURLToPath(import.meta.url);
const currentDirectory =
  path.dirname(currentFile);

let vbeeServices: VbeeServices | undefined;

function getProjectRoot(): string {
  return process.env.XAMXIXIU_PROJECT_ROOT ??
    process.cwd();
}

function resolveCloudflaredPath(): string | undefined {
  const override = process.env.CLOUDFLARED_PATH?.trim();
  if (override) {
    return override;
  }

  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, "cloudflared.exe")
    : path.resolve(
        currentDirectory,
        "..",
        "..",
        "vendor",
        "cloudflared.exe"
      );

  return fs.existsSync(bundled) ? bundled : undefined;
}

async function startWebhookTunnel(): Promise<void> {
  await vbeeServices?.stop();
  vbeeServices = undefined;
  vbeeServices = await startVbeeServices({
    cloudflaredPath: resolveCloudflaredPath()
  });
}

function getBundledAssetsRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets");
  }
  return path.join(getProjectRoot(), "assets");
}

const rendererPrivileges = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true,
  corsEnabled: true,
  bypassCSP: true
} as const;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "xammedia",
    privileges: rendererPrivileges
  },
  {
    scheme: "xamui",
    privileges: rendererPrivileges
  }
]);

function rendererOutDirectory(): string {
  return path.join(
    app.getAppPath(),
    "renderer",
    "out"
  );
}

function rendererFileFromPathname(
  pathname: string
): string | undefined {
  const root = path.resolve(rendererOutDirectory());
  let relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!relative || relative.endsWith("/")) {
    relative = path.join(relative, "index.html");
  }
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    return undefined;
  }
  return target;
}

function registerRendererProtocol(): void {
  protocol.handle("xamui", async (request) => {
    let pathname = "/";
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const file = rendererFileFromPathname(pathname);
    if (!file) {
      return new Response("Not found", { status: 404 });
    }
    try {
      return await net.fetch(pathToFileURL(file).href);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#111315",
    icon: path.join(currentDirectory, "..", "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(
        currentDirectory,
        "preload.js"
      ),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.webContents.on(
    "did-fail-load",
    (_event, code, description, validatedURL) => {
      console.error(
        `[Renderer] Failed to load (${code}) ${validatedURL}: ${description}`
      );
    }
  );

  if (app.isPackaged) {
    void window.loadURL("xamui://app/");
  } else {
    void window.loadURL(rendererUrl);
  }

  return window;
}

function applyRuntimePaths(): void {
  if (app.isPackaged) {
    process.env.NODE_ENV ??= "production";
    if (!process.env.XAMXIXIU_PROJECT_ROOT) {
      process.env.XAMXIXIU_PROJECT_ROOT = app.getPath("userData");
    }
  }

  const ffmpeg = resolveFfmpegPath();
  const ffprobe = resolveFfprobePath();
  const chromium = resolveChromiumExecutable();

  if (ffmpeg !== "ffmpeg") {
    process.env.FFMPEG_PATH = ffmpeg;
  }
  if (ffprobe !== "ffprobe") {
    process.env.FFPROBE_PATH = ffprobe;
  }
  if (chromium) {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE = chromium;
  }
}

app.whenReady().then(async () => {
  applyRuntimePaths();

  try {
    applySettings(await loadSettings());
    await startWebhookTunnel();
  } catch (error) {
    console.error("[Vbee] Could not start webhook tunnel:", error);
  }

  const store = new ProjectStore({
    projectsDirectory: path.join(
      getProjectRoot(),
      "projects"
    )
  });
  const assetRoot = process.env.XAMXIXIU_ASSET_ROOT ?? (
    app.isPackaged
      ? path.join(app.getPath("userData"), "assets")
      : path.join(getProjectRoot(), "assets")
  );
  process.env.XAMXIXIU_ASSET_ROOT = assetRoot;
  const library = new AssetLibrary(assetRoot);
  await library.initialize(
    app.isPackaged ? getBundledAssetsRoot() : undefined
  );

  registerRendererProtocol();

  protocol.handle("xammedia", async (request) => {
    try {
      return await handleAssetMediaRequest(request, library);
    } catch {
      return new Response("Preview failed", { status: 500 });
    }
  });

  registerIpc(store, library, {
    restartWebhook: startWebhookTunnel
  });
  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void vbeeServices?.stop();
});
