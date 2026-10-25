import {
  contextBridge,
  ipcRenderer
} from "electron";

import type {
  CaptureCommentPayload,
  DesktopApi,
  ImportAssetsPayload,
  ReplaceTimelineAssetPayload,
  SaveAssetAssignmentsPayload,
  UpdateAssetPayload,
  UpdateContentPayload,
  UpdateVoicePayload,
  AppSettings,
  ExportProgress
} from "./ipc-types.js";

const api: DesktopApi = {
  captureThread: (url) =>
    ipcRenderer.invoke(
      "capture:thread",
      url
    ),

  captureComment: (
    payload: CaptureCommentPayload
  ) =>
    ipcRenderer.invoke(
      "capture:comment",
      payload
    ),

  analyzeProject: (projectId) =>
    ipcRenderer.invoke(
      "project:analyze",
      projectId
    ),

  generateAudio: (projectId) =>
    ipcRenderer.invoke(
      "project:generate-audio",
      projectId
    ),

  retryAudio: (projectId, target) =>
    ipcRenderer.invoke(
      "project:retry-audio",
      projectId,
      target
    ),

  updateVoice: (payload: UpdateVoicePayload) =>
    ipcRenderer.invoke(
      "project:update-voice",
      payload
    ),

  matchReactions: (projectId) =>
    ipcRenderer.invoke(
      "project:match-reactions",
      projectId
    ),

  createTimeline: (projectId) =>
    ipcRenderer.invoke(
      "project:create-timeline",
      projectId
    ),

  createCapCutProject: (projectId) =>
    ipcRenderer.invoke(
      "project:create-capcut-project",
      projectId
    ),

  exportVideo: (projectId) =>
    ipcRenderer.invoke(
      "project:export-video",
      projectId
    ),

  onExportProgress: (callback) => {
    const listener = (
      _event: unknown,
      progress: ExportProgress
    ): void => {
      callback(progress);
    };
    ipcRenderer.on("export:progress", listener);
    return () => {
      ipcRenderer.removeListener(
        "export:progress",
        listener
      );
    };
  },

  showItemInFolder: (targetPath) =>
    ipcRenderer.invoke(
      "shell:show-item",
      targetPath
    ),

  openPath: (targetPath) =>
    ipcRenderer.invoke(
      "shell:open-path",
      targetPath
    ),

  getCapCutBaseProject: () =>
    ipcRenderer.invoke(
      "capcut:get-base-project"
    ),

  chooseCapCutBaseProject: () =>
    ipcRenderer.invoke(
      "capcut:choose-base-project"
    ),

  getProjects: () =>
    ipcRenderer.invoke("projects:get-all"),

  getProject: (projectId) =>
    ipcRenderer.invoke(
      "projects:get",
      projectId
    ),

  deleteProject: (projectId) =>
    ipcRenderer.invoke(
      "projects:delete",
      projectId
    ),

  getProjectAsset: (projectId, relativePath) =>
    ipcRenderer.invoke(
      "project:get-asset",
      projectId,
      relativePath
    ),
  getPreviewAsset: (projectId, sourcePath) =>
    ipcRenderer.invoke(
      "project:get-preview-asset",
      projectId,
      sourcePath
    ),
  listAssets: () =>
    ipcRenderer.invoke("assets:list"),
  importAssets: (
    payload: ImportAssetsPayload
  ) =>
    ipcRenderer.invoke("assets:import", payload),
  updateAsset: (
    payload: UpdateAssetPayload
  ) =>
    ipcRenderer.invoke("assets:update", payload),
  deleteAsset: (assetId) =>
    ipcRenderer.invoke("assets:delete", assetId),
  getAssetPreview: (assetId) =>
    ipcRenderer.invoke("assets:preview", assetId),
  saveAssetAssignments: (
    payload: SaveAssetAssignmentsPayload
  ) =>
    ipcRenderer.invoke(
      "projects:save-asset-assignments",
      payload
    ),
  replaceTimelineAsset: (
    payload: ReplaceTimelineAssetPayload
  ) =>
    ipcRenderer.invoke(
      "project:replace-timeline-asset",
      payload
    ),

  updateContent: (
    payload: UpdateContentPayload
  ) =>
    ipcRenderer.invoke(
      "project:update-content",
      payload
    ),

  resetContent: (projectId) =>
    ipcRenderer.invoke(
      "project:reset-content",
      projectId
    ),

  createProjectState: (projectId) =>
    ipcRenderer.invoke(
      "projects:create-state",
      projectId
    ),

  openProjectFolder: (projectId) =>
    ipcRenderer.invoke(
      "projects:open-folder",
      projectId
    ),

  getSettings: () =>
    ipcRenderer.invoke("settings:get"),

  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke(
      "settings:save",
      settings
    ),

  chooseSettingsDirectory: () =>
    ipcRenderer.invoke(
      "settings:choose-directory"
    )
};

contextBridge.exposeInMainWorld(
  "xamxixiu",
  api
);
