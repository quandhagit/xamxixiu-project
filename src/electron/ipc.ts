import {
  ipcMain,
  shell
} from "electron";
import {
  spawn
} from "node:child_process";
import fs from "node:fs/promises";

import type {
  DesktopApi,
  UpdateContentPayload
} from "./ipc-types.js";
import {
  ProjectStore
} from "../project/store.js";
import {
  captureThread
} from "../capture.js";
import {
  processProjectImages
} from "../process-image.js";
import type {
  AudioFailureTarget
} from "../types.js";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function runYarnCommand(
  args: string[],
  cwd: string
): Promise<void> {
  const isWindows =
    process.platform === "win32";
  const yarnCommand =
    isWindows ? "yarn.cmd" : "yarn";
  const command =
    isWindows
      ? [
          yarnCommand,
          args[0],
          ...args.slice(1).map(
            (arg) =>
              `"${arg.replaceAll(
                "\"",
                "\\\""
              )}"`
          )
        ].join(" ")
      : yarnCommand;

  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      isWindows ? [] : args,
      {
        cwd,
        env: process.env,
        shell: isWindows,
        stdio: "inherit",
        windowsHide: true
      }
    );

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${yarnCommand} ${args.join(" ")} exited with code ${code ?? "unknown"}`
        )
      );
    });
  });
}

export function registerIpc(
  store: ProjectStore
): void {
  ipcMain.handle(
    "capture:thread",
    async (_event, url: string) => {
      if (!url.trim()) {
        throw new Error(
          "Threads URL cannot be empty"
        );
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new Error(
          "Invalid Threads URL"
        );
      }

      const allowedHosts = new Set([
        "threads.net",
        "www.threads.net",
        "threads.com",
        "www.threads.com"
      ]);

      if (!allowedHosts.has(
        parsedUrl.hostname.toLowerCase()
      )) {
        throw new Error(
          "URL must belong to Threads"
        );
      }

      const result =
        await captureThread(url);
      const processedDirectory =
        path.join(
          result.projectDir,
          "processed"
        );

      await processProjectImages(
        result.rawDir,
        processedDirectory
      );

      const projectId =
        path.basename(result.projectDir);
      const project =
        await store.getProject(projectId);

      if (!project) {
        throw new Error(
          `Captured project could not be loaded: ${projectId}`
        );
      }

      return project;
    }
  );

  ipcMain.handle(
    "project:analyze",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);
      await runYarnCommand(
        ["analyze", directory],
        process.cwd()
      );
      const project =
        await store.getProject(projectId);

      if (!project) {
        throw new Error(
          `Project could not be loaded: ${projectId}`
        );
      }

      return project;
    }
  );

  ipcMain.handle(
    "project:get-asset",
    async (
      _event,
      projectId: string,
      relativePath: string
    ) => {
      if (
        !relativePath ||
        relativePath.includes("..") ||
        path.isAbsolute(relativePath)
      ) {
        throw new Error(
          "Invalid project asset path"
        );
      }

      const extension =
        path.extname(relativePath).toLowerCase();
      const mimeType = MIME_TYPES[extension];

      if (!mimeType) {
        throw new Error(
          "Unsupported project asset type"
        );
      }

      const projectDirectory =
        store.getProjectDirectory(projectId);
      const assetPath = path.resolve(
        projectDirectory,
        relativePath
      );
      const projectRoot =
        path.resolve(projectDirectory);

      if (
        !assetPath.startsWith(
          `${projectRoot}${path.sep}`
        )
      ) {
        throw new Error(
          "Project asset path is outside the project"
        );
      }

      const buffer =
        await fs.readFile(assetPath);

      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    }
  );

  ipcMain.handle(
    "project:update-content",
    async (
      _event,
      payload: UpdateContentPayload
    ) => {
      const directory =
        store.getProjectDirectory(
          payload.projectId
        );
      const target =
        path.join(directory, "content.json");
      const temporary =
        `${target}.tmp`;

      await fs.writeFile(
        temporary,
        JSON.stringify(payload.content, null, 2),
        "utf-8"
      );
      await fs.rename(temporary, target);

      const project =
        await store.getProject(payload.projectId);

      if (!project) {
        throw new Error(
          `Project could not be loaded: ${payload.projectId}`
        );
      }

      return project;
    }
  );

  ipcMain.handle(
    "project:generate-audio",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);
      await runYarnCommand(
        ["generate-audio", directory],
        process.cwd()
      );
      const project =
        await store.getProject(projectId);

      if (!project) {
        throw new Error(
          `Project could not be loaded: ${projectId}`
        );
      }

      return project;
    }
  );

  ipcMain.handle(
    "project:retry-audio",
    async (
      _event,
      projectId: string,
      target: AudioFailureTarget
    ) => {
      const directory =
        store.getProjectDirectory(projectId);
      await runYarnCommand(
        [
          "generate-audio",
          directory,
          target
        ],
        process.cwd()
      );
      const project =
        await store.getProject(projectId);

      if (!project) {
        throw new Error(
          `Project could not be loaded: ${projectId}`
        );
      }

      return project;
    }
  );

  ipcMain.handle(
    "project:match-reactions",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);
      await runYarnCommand(
        ["scan-assets"],
        process.cwd()
      );
      await runYarnCommand(
        ["match-reactions", directory],
        process.cwd()
      );
      const project =
        await store.getProject(projectId);

      if (!project) {
        throw new Error(
          `Project could not be loaded: ${projectId}`
        );
      }

      return project;
    }
  );

  ipcMain.handle(
    "projects:get-all",
    () => store.getProjects()
  );

  ipcMain.handle(
    "projects:get",
    (_event, projectId: string) =>
      store.getProject(projectId)
  );

  ipcMain.handle(
    "projects:create-state",
    (_event, projectId: string) =>
      store.createProjectState(projectId)
  );

  ipcMain.handle(
    "projects:open-folder",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);
      const error =
        await shell.openPath(directory);

      if (error) {
        throw new Error(error);
      }
    }
  );
}

export function getDesktopApi(): DesktopApi {
  throw new Error(
    "getDesktopApi is only available through preload"
  );
}
