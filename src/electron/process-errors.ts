import { app, dialog } from "electron";
import { isIgnorableStreamClosedError } from "./stream-closed-error.js";

export { isIgnorableStreamClosedError };

export function installMainProcessErrorHandlers(): void {
  process.on("uncaughtException", (error) => {
    if (isIgnorableStreamClosedError(error)) {
      console.warn("[Main] Ignored closed stream:", error.message);
      return;
    }
    console.error("[Main] Uncaught exception:", error);
    if (app.isReady()) {
      dialog.showErrorBox(
        "Error",
        error.stack ?? error.message
      );
    }
  });

  process.on("unhandledRejection", (reason) => {
    if (isIgnorableStreamClosedError(reason)) {
      console.warn("[Main] Ignored closed stream (rejection)");
      return;
    }
    console.error("[Main] Unhandled rejection:", reason);
  });
}
