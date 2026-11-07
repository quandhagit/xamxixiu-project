import {
  app,
  BrowserWindow,
  ipcMain
} from "electron";
import electronUpdater from "electron-updater";

import type {
  UpdaterStatus
} from "./ipc-types.js";

const { autoUpdater } = electronUpdater;

let lastStatus: UpdaterStatus | null = null;
let pendingVersion: string | undefined;
let installWhenReady = false;
let downloadInFlight = false;
let ipcRegistered = false;

function broadcast(status: UpdaterStatus): void {
  lastStatus = status;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("updater:status", status);
    }
  }
}

async function startUpdate(): Promise<void> {
  installWhenReady = true;
  if (lastStatus?.state === "ready") {
    autoUpdater.quitAndInstall();
    return;
  }
  if (downloadInFlight) {
    return;
  }
  downloadInFlight = true;
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    downloadInFlight = false;
    broadcast({
      state: "error",
      message: error instanceof Error
        ? error.message
        : "Không tải được bản cập nhật."
    });
  }
}

function registerUpdaterIpc(): void {
  if (ipcRegistered) {
    return;
  }
  ipcRegistered = true;

  ipcMain.handle("updater:get-status", () => lastStatus);
  ipcMain.handle("updater:start", () => startUpdate());
}

export function setupAutoUpdater(): void {
  registerUpdaterIpc();

  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.error("[Updater]", error);
    downloadInFlight = false;
    if (
      lastStatus === null &&
      !installWhenReady
    ) {
      return;
    }
    broadcast({
      state: "error",
      message: error instanceof Error
        ? error.message
        : "Không tải được bản cập nhật."
    });
  });

  autoUpdater.on("update-available", (info) => {
    pendingVersion = info.version;
    console.log(`[Updater] Có bản mới ${info.version}`);
    broadcast({
      state: "available",
      version: info.version
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.max(
      0,
      Math.min(100, Math.round(progress.percent))
    );
    broadcast({
      state: "downloading",
      version: pendingVersion ?? "",
      percent
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    downloadInFlight = false;
    pendingVersion = info.version;
    broadcast({
      state: "ready",
      version: info.version
    });
    if (installWhenReady) {
      autoUpdater.quitAndInstall();
    }
  });

  void autoUpdater.checkForUpdates().catch((error) => {
    console.error("[Updater] Check failed:", error);
  });
}
