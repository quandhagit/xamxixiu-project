import {
  app,
  BrowserWindow
} from "electron";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

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
  AssetLibrary
} from "../assets/library.js";

const rendererUrl =
  process.env.XAMXIXIU_RENDERER_URL ??
  "http://localhost:3000";
const currentFile =
  fileURLToPath(import.meta.url);
const currentDirectory =
  path.dirname(currentFile);

function getProjectRoot(): string {
  return process.env.XAMXIXIU_PROJECT_ROOT ??
    process.cwd();
}

function getBundledAssetsRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets");
  }
  return path.join(getProjectRoot(), "assets");
}

let vbeeServices: VbeeServices | undefined;

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
    vbeeServices = await startVbeeServices();
  } catch (error) {
    console.error("[Vbee] Could not start webhook tunnel:", error);
  }

  const store = new ProjectStore({
    projectsDirectory: path.join(
      getProjectRoot(),
      "projects"
    )
  });
  const assetRoot = path.join(
    app.getPath("userData"),
    "assets"
  );
  process.env.XAMXIXIU_ASSET_ROOT = assetRoot;
  const library = new AssetLibrary(assetRoot);
  await library.initialize(getBundledAssetsRoot());

  registerIpc(store, library);
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
