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
import type {
  CapCutBaseProject
} from "../project/store.js";
import type {
  Asset,
  AssetType,
  AssetUpdate
} from "../assets/library.js";
import type {
  MatchedReaction
} from "../assets/matcher.js";

export interface UpdateContentPayload {
  projectId: string;
  content: ContentData;
}

export interface ImportAssetsPayload {
  type: AssetType;
  category?: string;
}

export interface UpdateAssetPayload {
  id: string;
  update: AssetUpdate;
}

export interface SaveAssetAssignmentsPayload {
  projectId: string;
  reactions: MatchedReaction[];
  backgroundAssetId?: string | null;
  musicAssetId?: string | null;
}

export interface DeleteAssetResult {
  deleted: boolean;
  projectReferences: string[];
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
  createTimeline(
    projectId: string
  ): Promise<ProjectState>;
  createCapCutProject(
    projectId: string
  ): Promise<string>;
  getCapCutBaseProject(): Promise<
    CapCutBaseProject | undefined
  >;
  chooseCapCutBaseProject(): Promise<
    CapCutBaseProject | undefined
  >;
  getProjects(): Promise<ProjectSummary[]>;
  getProject(
    projectId: string
  ): Promise<ProjectState | undefined>;
  getProjectAsset(
    projectId: string,
    relativePath: string
  ): Promise<string>;
  getPreviewAsset(
    projectId: string,
    sourcePath: string
  ): Promise<string>;
  listAssets(): Promise<Asset[]>;
  importAssets(
    payload: ImportAssetsPayload
  ): Promise<Asset[]>;
  updateAsset(
    payload: UpdateAssetPayload
  ): Promise<Asset>;
  deleteAsset(
    assetId: string
  ): Promise<DeleteAssetResult>;
  getAssetPreview(
    assetId: string
  ): Promise<string>;
  saveAssetAssignments(
    payload: SaveAssetAssignmentsPayload
  ): Promise<ProjectState>;
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
