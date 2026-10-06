import type {
  ContentData
} from "../types.js";
import type {
  AudioFailureTarget
} from "../types.js";
import type {
  ProjectState,
  ProjectSummary
} from "../project/store.js";

export interface UpdateContentPayload {
  projectId: string;
  content: ContentData;
}

export interface DesktopApi {
  captureThread(
    url: string
  ): Promise<ProjectState>;
  analyzeProject(
    projectId: string
  ): Promise<ProjectState>;
  generateAudio(
    projectId: string
  ): Promise<ProjectState>;
  retryAudio(
    projectId: string,
    target: AudioFailureTarget
  ): Promise<ProjectState>;
  matchReactions(
    projectId: string
  ): Promise<ProjectState>;
  getProjects(): Promise<ProjectSummary[]>;
  getProject(
    projectId: string
  ): Promise<ProjectState | undefined>;
  getProjectAsset(
    projectId: string,
    relativePath: string
  ): Promise<string>;
  updateContent(
    payload: UpdateContentPayload
  ): Promise<ProjectState>;
  createProjectState(
    projectId: string
  ): Promise<ProjectState>;
  openProjectFolder(
    projectId: string
  ): Promise<void>;
}
