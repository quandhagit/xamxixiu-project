import type {
  ContentData,
  ThreadComment
} from "../types.js";
import type {
  SpeechAbbreviationEntry
} from "../comments/speech-abbreviations.js";
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
  AssetMediaKind,
  AssetType,
  AssetUpdate
} from "../assets/library.js";
import type {
  MatchedReaction
} from "../assets/matcher.js";
import type {
  TimelineAssetTarget
} from "../timeline/replace-asset.js";

export type { TimelineAssetTarget };

export interface UpdateContentPayload {
  projectId: string;
  content: ContentData;
  imageOrder?: number[];
}

export interface UpdateVoicePayload {
  projectId: string;
  target: AudioFailureTarget;
  voiceId: string;
}

export interface CaptureCommentPayload {
  projectId: string;
  url: string;
  imageIndex: number;
  existing: Array<{
    author: string;
    text: string;
  }>;
}

export interface ImportAssetsPayload {
  type: AssetType;
  category?: string;
  mediaKind?: AssetMediaKind;
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
  topicMemeId?: string | null;
}

export interface ReplaceTimelineAssetPayload {
  projectId: string;
  target: TimelineAssetTarget;
  assetId: string | null;
}

export interface UpdateTopicIntroPayload {
  projectId: string;
  topicTitle?: string;
  enabled?: boolean;
}

export interface DeleteAssetResult {
  deleted: boolean;
  projectReferences: string[];
}

export interface AppSettings {
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  vbeeAccessToken: string;
  vbeeAppId: string;
  vbeeWebhookPort: string;
  capcutDraftsDir: string;
}

export interface SaveSettingsResult {
  settings: AppSettings;
  tunnelRestarted: boolean;
  tunnelError?: string;
}

export interface ExportProgress {
  phase: "preparing" | "rendering" | "done";
  percent: number;
  time?: number;
  duration?: number;
}

export type UpdaterStatus =
  | {
      state: "available";
      version: string;
    }
  | {
      state: "downloading";
      version: string;
      percent: number;
    }
  | {
      state: "ready";
      version: string;
    }
  | {
      state: "error";
      message: string;
    };

export interface DesktopApi {
  captureThread(
    url: string,
    commentLimit?: number
  ): Promise<ProjectState>;
  captureComment(
    payload: CaptureCommentPayload
  ): Promise<ThreadComment>;
  curateComments(
    projectId: string
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
  updateVoice(
    payload: UpdateVoicePayload
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
  exportVideo(
    projectId: string
  ): Promise<string | null>;
  onExportProgress(
    callback: (progress: ExportProgress) => void
  ): () => void;
  getUpdaterStatus(): Promise<UpdaterStatus | null>;
  startUpdate(): Promise<void>;
  onUpdaterStatus(
    callback: (status: UpdaterStatus) => void
  ): () => void;
  showItemInFolder(
    targetPath: string
  ): Promise<void>;
  openPath(targetPath: string): Promise<void>;
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
  deleteProject(
    projectId: string
  ): Promise<void>;
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
  replaceTimelineAsset(
    payload: ReplaceTimelineAssetPayload
  ): Promise<ProjectState>;
  updateTopicIntro(
    payload: UpdateTopicIntroPayload
  ): Promise<ProjectState>;
  updateContent(
    payload: UpdateContentPayload
  ): Promise<ProjectState>;
  resetContent(
    projectId: string
  ): Promise<ProjectState>;
  createProjectState(
    projectId: string
  ): Promise<ProjectState>;
  openProjectFolder(
    projectId: string
  ): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(
    settings: AppSettings
  ): Promise<SaveSettingsResult>;
  getSpeechAbbreviations(): Promise<
    SpeechAbbreviationEntry[]
  >;
  saveSpeechAbbreviations(
    entries: SpeechAbbreviationEntry[]
  ): Promise<SpeechAbbreviationEntry[]>;
  chooseSettingsDirectory(): Promise<string | null>;
  /** Opens Chromium on the Threads login page; resolves when the user closes it. */
  openLoginBrowser(): Promise<void>;
}
