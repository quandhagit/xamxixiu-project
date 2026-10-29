import {
  app,
  dialog,
  type BrowserWindow
} from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

export function setupAutoUpdater(
  getWindow: () => BrowserWindow | undefined
): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.error("[Updater]", error);
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[Updater] Có bản mới ${info.version}, đang tải...`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const window = getWindow();
    const options = {
      type: "info" as const,
      buttons: ["Khởi động lại & cập nhật", "Để sau"],
      defaultId: 0,
      cancelId: 1,
      title: "Có bản cập nhật",
      message: `Đã tải xong phiên bản ${info.version}.`,
      detail:
        "Khởi động lại để cập nhật ngay, hoặc ứng dụng sẽ tự cập nhật khi bạn thoát."
    };
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  void autoUpdater.checkForUpdates().catch((error) => {
    console.error("[Updater] Check failed:", error);
  });
}
