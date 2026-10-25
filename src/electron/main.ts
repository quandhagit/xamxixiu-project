import {
  app,
  BrowserWindow,
  protocol
} from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";
import {
  handleAssetMediaRequest
} from "./media-protocol.js";

import {
  registerIpc
} from "./ipc.js";
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

protocol.registerSchemesAsPrivileged([
  {
    scheme: "xammedia",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
]);

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0b0d12",
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

  if (process.env.NODE_ENV === "production") {
    void window.loadFile(
      path.join(
        app.getAppPath(),
        "renderer",
        "out",
        "index.html"
      )
    );
  } else {
    void window.loadURL(rendererUrl);
  }

  return window;
}

app.whenReady().then(async () => {
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
