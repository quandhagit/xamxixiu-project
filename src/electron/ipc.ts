import {
  dialog,
  ipcMain,
  shell
} from "electron";
import {
  spawn
} from "node:child_process";
import fs from "node:fs/promises";

import type {
  DesktopApi,
  ImportAssetsPayload,
  SaveAssetAssignmentsPayload,
  UpdateAssetPayload,
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
import {
  generateCapCutProjectWithCli,
  validateCapCutBaseProject
} from "../capcut/cli-adapter.js";
import type {
  CapCutBaseProject
} from "../project/store.js";
import type {
  AudioFailureTarget
} from "../types.js";
import path from "node:path";
import {
  AssetLibrary,
  isAssetType
} from "../assets/library.js";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm"
};

function isInsideDirectory(
  root: string,
  candidate: string
): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

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
  store: ProjectStore,
  library: AssetLibrary
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
      await fs.rm(
        result.rawDir,
        {
          recursive: true,
          force: true
        }
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
    "project:get-preview-asset",
    async (
      _event,
      projectId: string,
      sourcePath: string
    ) => {
      const projectDirectory =
        path.resolve(
          store.getProjectDirectory(projectId)
        );
      const libraryRoot = path.resolve(library.root);
      const normalized = sourcePath.replaceAll("\\", "/");
      const projectPrefix = `projects/${projectId}/`;
      const candidates = [
        path.resolve(sourcePath),
        path.resolve(projectDirectory, sourcePath),
        path.resolve(libraryRoot, sourcePath)
      ];
      if (normalized.startsWith(projectPrefix)) {
        candidates.push(
          path.resolve(
            projectDirectory,
            normalized.slice(projectPrefix.length)
          )
        );
      }
      if (normalized.startsWith("assets/")) {
        candidates.push(
          path.resolve(libraryRoot, normalized.slice("assets/".length)),
          path.resolve(process.cwd(), normalized)
        );
      }
      const assetPath = candidates.find((candidate) =>
        isInsideDirectory(projectDirectory, candidate) ||
        isInsideDirectory(libraryRoot, candidate)
      );
      if (!assetPath) {
        throw new Error(
          "Preview asset path is outside the project/assets directories"
        );
      }

      const extension =
        path.extname(assetPath).toLowerCase();
      const mimeType = MIME_TYPES[extension];
      if (!mimeType) {
        throw new Error(
          "Unsupported preview asset type"
        );
      }
      const buffer = await fs.readFile(assetPath);
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    }
  );

  ipcMain.handle(
    "assets:list",
    () => library.list()
  );

  ipcMain.handle(
    "assets:import",
    async (_event, payload: ImportAssetsPayload) => {
      if (
        !payload ||
        !isAssetType(payload.type) ||
        (
          payload.category !== undefined &&
          typeof payload.category !== "string"
        )
      ) {
        throw new Error("Invalid asset import payload");
      }
      const result = await dialog.showOpenDialog({
        title: `Import ${payload.type} assets`,
        properties: ["openFile", "multiSelections"],
        filters: [{
          name: "Supported media",
          extensions: payload.type === "meme"
            ? ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm"]
            : payload.type === "background"
              ? ["mp4", "mov", "webm"]
              : ["mp3", "wav", "m4a"]
        }]
      });
      if (result.canceled || result.filePaths.length === 0) {
        return [];
      }
      return library.importAssets({
        type: payload.type,
        category: payload.category,
        files: result.filePaths
      });
    }
  );

  ipcMain.handle(
    "assets:update",
    (_event, payload: UpdateAssetPayload) => {
      if (
        !payload ||
        typeof payload.id !== "string" ||
        !payload.update ||
        typeof payload.update !== "object"
      ) {
        throw new Error("Invalid asset update payload");
      }
      return library.update(payload.id, payload.update);
    }
  );

  ipcMain.handle(
    "assets:delete",
    async (_event, assetId: string) => {
      if (typeof assetId !== "string" || !assetId) {
        throw new Error("Invalid asset id");
      }
      const projectReferences =
        await store.getAssetReferences(assetId);
      if (projectReferences.length > 0) {
        return {
          deleted: false,
          projectReferences
        };
      }
      await library.delete(assetId);
      return {
        deleted: true,
        projectReferences: []
      };
    }
  );

  ipcMain.handle(
    "assets:preview",
    async (_event, assetId: string) => {
      if (typeof assetId !== "string" || !assetId) {
        throw new Error("Invalid asset id");
      }
      const preview = await library.preview(assetId);
      return `data:${preview.mimeType};base64,${preview.buffer.toString("base64")}`;
    }
  );

  ipcMain.handle(
    "projects:save-asset-assignments",
    async (
      _event,
      payload: SaveAssetAssignmentsPayload
    ) => {
      if (
        !payload ||
        typeof payload.projectId !== "string" ||
        !Array.isArray(payload.reactions)
      ) {
        throw new Error("Invalid asset assignment payload");
      }
      return store.saveReactions(
        payload.projectId,
        payload.reactions,
        await library.list(),
        {
          backgroundAssetId:
            payload.backgroundAssetId,
          musicAssetId:
            payload.musicAssetId
        }
      );
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
    "project:create-timeline",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);
      await runYarnCommand(
        ["create-timeline", directory],
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
    "project:create-capcut-project",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);
      return generateCapCutProjectWithCli(
        directory
      );
    }
  );

  ipcMain.handle(
    "capcut:get-base-project",
    async () =>
      store.getCapCutBaseProject()
  );

  ipcMain.handle(
    "capcut:choose-base-project",
    async () => {
      const result =
        await dialog.showOpenDialog({
          properties: ["openDirectory"],
          title:
            "Chọn CapCut project rỗng làm base"
        });
      if (
        result.canceled ||
        result.filePaths.length === 0
      ) {
        return undefined;
      }

      const directory =
        result.filePaths[0];
      const projectFile =
        path.join(
          directory,
          "Timelines",
          "project.json"
        );
      let timelineId: string | undefined;
      try {
        const projectJson =
          JSON.parse(
            await fs.readFile(
              projectFile,
              "utf-8"
            )
          ) as {
            main_timeline_id?: string;
          };
        timelineId =
          projectJson.main_timeline_id;
      } catch {
        await fs.access(
          path.join(
            directory,
            "draft_content.json"
          )
        );
      }

      const baseProject: CapCutBaseProject = {
        directory,
        timelineId
      };
      await validateCapCutBaseProject(
        baseProject
      );
      return store.setCapCutBaseProject(
        baseProject
      );
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
