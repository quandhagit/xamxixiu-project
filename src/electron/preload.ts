import {
  contextBridge,
  ipcRenderer
} from "electron";

import type {
  DesktopApi,
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
