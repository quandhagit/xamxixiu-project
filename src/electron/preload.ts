import {
  contextBridge,
  ipcRenderer
} from "electron";

import type {
  DesktopApi,
  ImportAssetsPayload,
  SaveAssetAssignmentsPayload,
  UpdateAssetPayload,
  UpdateContentPayload
} from "./ipc-types.js";

const api: DesktopApi = {
  captureThread: (url) =>
    ipcRenderer.invoke(
      "capture:thread",
      url
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

  updateContent: (
    payload: UpdateContentPayload
  ) =>
    ipcRenderer.invoke(
      "project:update-content",
      payload
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
    )
};

contextBridge.exposeInMainWorld(
  "xamxixiu",
  api
);
