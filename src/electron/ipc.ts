import {
  dialog,
  ipcMain,
  shell
} from "electron";
import fs from "node:fs/promises";

import type {
  AddBeepPayload,
  AutoFormatTimelinePayload,
  CaptureCommentPayload,
  CleanCommentTextPayload,
  DesktopApi,
  ExportProgress,
  ImportAssetsPayload,
  ReplaceTimelineAssetPayload,
  SaveAssetAssignmentsPayload,
  SaveTimelineProjectPayload,
  UpdateAssetPayload,
  UpdateContentPayload,
  UpdateTopicIntroPayload,
  UpdateVoicePayload
} from "./ipc-types.js";
import { applyTimelineAssetReplacement } from "../timeline/replace-asset.js";
import {
  ProjectStore
} from "../project/store.js";
import {
  loadSettings,
  saveSettings
} from "./settings.js";
import { runAnalyze } from "../analyze.js";
import { scanAssets } from "../assets/scanner.js";
import {
  captureComment,
  captureThread
} from "../capture.js";
import { openLoginBrowser } from "../browser.js";
import { runCurate } from "../curate.js";
import { runMatchReactions } from "../match-reactions.js";
import { generateAudio } from "../tts/generate-audio.js";
import {
  applyImageOrder,
  inverseImageOrder
} from "../comments/apply-image-order.js";
import {
  discardUnsavedCommentFiles
} from "../comments/reset-content.js";
import {
  processProjectImages
} from "../process-image.js";
import { exportWithHyperframes } from "../hyperframes/export.js";
import { suggestCleanCommentText } from "../ai/clean-comment-text.js";
import { suggestTopicTitles } from "../ai/suggest-topic-titles.js";
import { assignVoices } from "../ai/assign-voices.js";
import { suggestMemes } from "../ai/suggest-memes.js";
import { autoFormat } from "../timeline/auto-format.js";
import {
  clearCommentAnalysisAssets,
  clearCommentMemesAndSfx,
  clearCommentReactionAssets
} from "../timeline/clear-comment-assets.js";
import { addBeepClip, createBeepWav } from "../timeline/beep.js";
import { videoTimelineToProject } from "../timeline/from-video-timeline.js";
import { ENABLE_CAPCUT } from "../hyperframes/engine.js";
import type {
  AudioFailureTarget,
  ThreadData,
  VideoTimeline
} from "../types.js";
import {
  entriesToTable,
  expandThread
} from "../comments/speech-abbreviations.js";
import {
  loadAbbreviationEntries,
  saveAbbreviationEntries
} from "./abbreviations.js";
import {
  deleteUserCombo,
  loadUserCombos,
  saveUserCombo
} from "./meme-combos.js";
import {
  renderTopicTitleCard
} from "../capcut/compile/title-card.js";
import {
  TOPIC_TITLE_CARD_FILE
} from "../timeline/topic-constants.js";
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

function importExtensions(
  type: ImportAssetsPayload["type"],
  mediaKind?: ImportAssetsPayload["mediaKind"]
): string[] {
  if (mediaKind === "image") {
    return ["png", "jpg", "jpeg", "webp", "gif"];
  }
  if (mediaKind === "video" || type === "background") {
    return ["mp4", "mov", "webm"];
  }
  if (mediaKind === "audio" || type === "sfx" || type === "music") {
    return ["mp3", "wav", "m4a"];
  }
  if (type === "meme") {
    return ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm"];
  }
  return ["mp3", "wav", "m4a"];
}

function errorCode(error: unknown): string | undefined {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error)
  ) {
    return undefined;
  }

  const code = error.code;

  return typeof code === "string"
    ? code
    : undefined;
}

function isInsideDirectory(
  root: string,
  candidate: string
): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

export function registerIpc(
  store: ProjectStore,
  library: AssetLibrary,
  options?: {
    restartWebhook?: () => Promise<void>;
  }
): void {
  ipcMain.handle(
    "browser:open-login",
    async () => {
      await openLoginBrowser();
    }
  );

  ipcMain.handle(
    "capture:thread",
    async (
      _event,
      url: string,
      commentLimit?: number
    ) => {
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
        await captureThread(url, commentLimit);
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

      // thread.json stays as the raw capture. content.json holds the text
      // rewritten for speech (abbreviations expanded) so the user can review it.
      const capturedThread = JSON.parse(
        await fs.readFile(result.threadPath, "utf-8")
      ) as ThreadData;
      await fs.writeFile(
        path.join(result.projectDir, "content.json"),
        JSON.stringify(
          expandThread(
            capturedThread,
            entriesToTable(await loadAbbreviationEntries())
          ),
          null,
          2
        ),
        "utf-8"
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
    "capture:comment",
    async (
      _event,
      payload: CaptureCommentPayload
    ) => {
      if (
        !payload ||
        typeof payload.projectId !== "string" ||
        typeof payload.url !== "string" ||
        !Array.isArray(payload.existing)
      ) {
        throw new Error(
          "Invalid capture comment payload"
        );
      }

      if (
        !Number.isInteger(payload.imageIndex) ||
        payload.imageIndex < 0
      ) {
        throw new Error(
          "imageIndex must be an integer greater than or equal to 0"
        );
      }

      for (const item of payload.existing) {
        if (
          !item ||
          typeof item.author !== "string" ||
          typeof item.text !== "string"
        ) {
          throw new Error(
            "Existing comments are invalid"
          );
        }
      }

      if (!payload.url.trim()) {
        throw new Error(
          "Threads URL cannot be empty"
        );
      }

      let parsedUrl: URL;

      try {
        parsedUrl = new URL(payload.url);
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

      const directory =
        store.getProjectDirectory(
          payload.projectId
        );

      try {
        const stat = await fs.stat(directory);

        if (!stat.isDirectory()) {
          throw new Error(
            `Project could not be loaded: ${payload.projectId}`
          );
        }
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.message.startsWith(
            "Project could not be loaded:"
          )
        ) {
          throw error;
        }

        throw new Error(
          `Project could not be loaded: ${payload.projectId}`
        );
      }

      return captureComment({
        projectDir: directory,
        url: payload.url,
        imageIndex: payload.imageIndex,
        existing: payload.existing,
        abbreviations: entriesToTable(
          await loadAbbreviationEntries()
        )
      });
    }
  );

  ipcMain.handle(
    "project:curate",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);
      await runCurate(directory);
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
    "project:analyze",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);
      await runAnalyze(directory);
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
    "project:clean-comment-text",
    async (_event, payload: CleanCommentTextPayload) => {
      if (!payload?.projectId || !Array.isArray(payload.texts)) {
        throw new Error("Invalid clean-text payload");
      }
      return suggestCleanCommentText({ texts: payload.texts });
    }
  );

  ipcMain.handle(
    "project:suggest-topic-titles",
    async (_event, projectId: string) => {
      const project = await store.getProject(projectId);
      const content = project?.content ?? project?.thread;
      if (!content) {
        throw new Error("Project content is missing");
      }
      return suggestTopicTitles({
        author: content.author,
        text: content.text,
        comments: content.comments
          .filter((comment) => !comment.excluded)
          .map((comment) => comment.text)
      });
    }
  );

  ipcMain.handle(
    "project:assign-voices",
    async (_event, projectId: string) => {
      const directory = store.getProjectDirectory(projectId);
      const project = await store.getProject(projectId);
      const patch = await assignVoices(directory, project?.analysis);
      const analysis = {
        tone: "casual" as const,
        topicType: "other" as const,
        intensity: 0.5,
        musicType: "neutral" as const,
        reactions: [],
        ...project?.analysis,
        ...patch
      };
      return store.saveAnalysis(projectId, analysis);
    }
  );

  ipcMain.handle(
    "project:suggest-memes",
    async (_event, projectId: string) => {
      const directory = store.getProjectDirectory(projectId);
      const project = await store.getProject(projectId);
      if (!project?.analysis) {
        throw new Error("Hãy chạy AI voice hoặc Quick AI trước khi chọn meme.");
      }
      const analysis = await suggestMemes(directory, project.analysis);
      await store.saveAnalysis(projectId, analysis);
      await scanAssets();
      await runMatchReactions(directory);
      return store.rebuildTimeline(projectId);
    }
  );

  ipcMain.handle(
    "project:clear-comment-memes",
    async (_event, projectId: string) => {
      const project = await store.getProject(projectId);
      if (!project) {
        throw new Error(`Project could not be loaded: ${projectId}`);
      }
      const assets = await library.list();
      if (project.analysis) {
        await store.saveAnalysis(
          projectId,
          clearCommentAnalysisAssets(project.analysis)
        );
      }
      await store.saveReactions(
        projectId,
        clearCommentReactionAssets(project.reactions ?? []),
        assets
      );
      const source = project.timelineProject ??
        (project.timeline
          ? videoTimelineToProject(project.timeline)
          : undefined);
      if (!source) {
        return store.getProject(projectId);
      }
      return store.saveTimelineProject(
        projectId,
        clearCommentMemesAndSfx(source)
      );
    }
  );

  ipcMain.handle(
    "project:save-timeline-project",
    async (_event, payload: SaveTimelineProjectPayload) => {
      if (!payload?.projectId || !payload.timelineProject) {
        throw new Error("Invalid timeline project payload");
      }
      return store.saveTimelineProject(
        payload.projectId,
        payload.timelineProject
      );
    }
  );

  ipcMain.handle(
    "project:auto-format-timeline",
    async (_event, payload: AutoFormatTimelinePayload) => {
      const project = await store.getProject(payload.projectId);
      const source = project?.timelineProject ??
        (project?.timeline
          ? videoTimelineToProject(project.timeline)
          : undefined);
      if (!source) {
        throw new Error("Chưa có timeline để format.");
      }
      return store.saveTimelineProject(
        payload.projectId,
        autoFormat(source, payload.settings ?? source.settings)
      );
    }
  );

  ipcMain.handle(
    "project:add-beep",
    async (_event, payload: AddBeepPayload) => {
      const directory = store.getProjectDirectory(payload.projectId);
      const beepDir = path.join(directory, "audio");
      await fs.mkdir(beepDir, { recursive: true });
      await fs.writeFile(
        path.join(beepDir, "beep.wav"),
        createBeepWav(payload.duration)
      );
      const project = await store.getProject(payload.projectId);
      const source = project?.timelineProject ??
        (project?.timeline
          ? videoTimelineToProject(project.timeline)
          : undefined);
      if (!source) {
        throw new Error("Chưa có timeline để thêm beep.");
      }
      return store.saveTimelineProject(
        payload.projectId,
        addBeepClip(source, payload.start, payload.duration)
      );
    }
  );

  ipcMain.handle(
    "project:save-content-topic-title",
    async (_event, projectId: string, topicTitle: string) => {
      if (typeof projectId !== "string" || typeof topicTitle !== "string") {
        throw new Error("Invalid topic title payload");
      }
      return store.saveContentTopicTitle(projectId, topicTitle);
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
      const insideCandidates = candidates.filter(
        (candidate) =>
          isInsideDirectory(projectDirectory, candidate) ||
          isInsideDirectory(libraryRoot, candidate)
      );
      if (insideCandidates.length === 0) {
        throw new Error(
          "Preview asset path is outside the project/assets directories"
        );
      }
      let assetPath = insideCandidates[0];
      for (const candidate of insideCandidates) {
        try {
          await fs.access(candidate);
          assetPath = candidate;
          break;
        } catch {
          // Try the next resolved path.
        }
      }

      const extension =
        path.extname(assetPath).toLowerCase();
      const mimeType = MIME_TYPES[extension];
      if (!mimeType) {
        throw new Error(
          "Unsupported preview asset type"
        );
      }
      let buffer: Buffer;
      try {
        buffer = await fs.readFile(assetPath);
      } catch {
        let timeline: VideoTimeline | undefined;
        try {
          timeline = JSON.parse(
            await fs.readFile(
              path.join(
                projectDirectory,
                "timeline.json"
              ),
              "utf-8"
            )
          ) as VideoTimeline;
        } catch {
          timeline = undefined;
        }
        if (
          path.basename(sourcePath) === "topic-title.mp3" &&
          timeline?.topicIntro?.case !== "long"
        ) {
          return "";
        }
        if (
          path.basename(assetPath) !==
          path.basename(TOPIC_TITLE_CARD_FILE)
        ) {
          throw new Error(
            `Preview asset not found: ${sourcePath}`
          );
        }
        if (!timeline?.topicIntro?.title) {
          throw new Error(
            "Preview asset not found: topic title card"
          );
        }
        const generated = await renderTopicTitleCard(
          projectDirectory,
          timeline.topicIntro.title
        );
        buffer = await fs.readFile(generated);
      }
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
          extensions: importExtensions(payload.type, payload.mediaKind)
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
            payload.musicAssetId,
          ...("topicMemeId" in payload
            ? { topicMemeId: payload.topicMemeId }
            : {})
        }
      );
    }
  );

  ipcMain.handle(
    "project:replace-timeline-asset",
    async (
      _event,
      payload: ReplaceTimelineAssetPayload
    ) => {
      if (
        !payload ||
        typeof payload.projectId !== "string" ||
        (payload.assetId !== null && typeof payload.assetId !== "string") ||
        !payload.target
      ) {
        throw new Error("Invalid timeline asset payload");
      }
      const project = await store.getProject(payload.projectId);
      if (!project) {
        throw new Error(
          `Project could not be loaded: ${payload.projectId}`
        );
      }
      const assets = await library.list();
      const replacement = applyTimelineAssetReplacement(
        project.reactions ?? [],
        project.analysis,
        assets,
        payload.target,
        payload.assetId
      );
      await store.saveReactions(
        payload.projectId,
        replacement.reactions,
        assets,
        replacement.selections
      );
      return store.rebuildTimeline(payload.projectId);
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
      const imageOrder = payload.imageOrder;
      const commentCount =
        payload.content.comments.length;
      const applyingOrder =
        !!imageOrder &&
        imageOrder.some(
          (value, index) => value !== index
        );
      const timelinePath = path.join(
        directory,
        "timeline.json"
      );
      let timelineBackup: Buffer | undefined;

      if (applyingOrder) {
        try {
          timelineBackup = await fs.readFile(
            timelinePath
          );
        } catch (error: unknown) {
          if (errorCode(error) !== "ENOENT") {
            throw error;
          }
        }
      }

      await applyImageOrder(
        directory,
        imageOrder,
        commentCount
      );

      const target =
        path.join(directory, "content.json");
      const temporary =
        `${target}.tmp`;

      try {
        await fs.writeFile(
          temporary,
          JSON.stringify(payload.content, null, 2),
          "utf-8"
        );
        await fs.rename(temporary, target);
      } catch (error: unknown) {
        await fs.rm(temporary, { force: true });

        if (applyingOrder && imageOrder) {
          await applyImageOrder(
            directory,
            inverseImageOrder(imageOrder),
            commentCount
          );

          if (timelineBackup) {
            await fs.writeFile(
              timelinePath,
              timelineBackup
            );
          }
        }

        throw error;
      }

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
    "project:reset-content",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);

      await discardUnsavedCommentFiles(directory);

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
    "project:update-voice",
    async (_event, payload: UpdateVoicePayload) => {
      if (
        !payload ||
        typeof payload.projectId !== "string" ||
        typeof payload.voiceId !== "string" ||
        (
          payload.target !== "topic" &&
          payload.target !== "topic-title" &&
          !/^comment-\d+$/.test(payload.target)
        )
      ) {
        throw new Error("Invalid voice payload");
      }

      return store.saveVoiceAssignment(
        payload.projectId,
        payload.target,
        payload.voiceId
      );
    }
  );

  ipcMain.handle(
    "project:update-topic-intro",
    async (_event, payload: UpdateTopicIntroPayload) => {
      if (
        !payload ||
        typeof payload.projectId !== "string" ||
        (
          payload.topicTitle !== undefined &&
          typeof payload.topicTitle !== "string"
        ) ||
        (
          payload.enabled !== undefined &&
          typeof payload.enabled !== "boolean"
        ) ||
        (
          payload.topicTitleVoiceMode !== undefined &&
          payload.topicTitleVoiceMode !== "auto" &&
          payload.topicTitleVoiceMode !== "on" &&
          payload.topicTitleVoiceMode !== "off"
        )
      ) {
        throw new Error("Invalid topic intro payload");
      }

      return store.saveTopicIntro(payload.projectId, {
        topicTitle: payload.topicTitle,
        enabled: payload.enabled,
        topicTitleVoiceMode: payload.topicTitleVoiceMode
      });
    }
  );

  ipcMain.handle(
    "project:generate-audio",
    async (_event, projectId: string) => {
      const directory =
        store.getProjectDirectory(projectId);
      await generateAudio(directory);
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
      await generateAudio(directory, target);
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
      await scanAssets();
      await runMatchReactions(directory);
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
      return store.rebuildTimeline(projectId);
    }
  );

  ipcMain.handle(
    "project:create-capcut-project",
    async () => {
      if (!ENABLE_CAPCUT) {
        throw new Error(
          "CapCut đã được gỡ. Hãy xuất video từ timeline."
        );
      }
      throw new Error("CapCut đã được gỡ.");
    }
  );

  ipcMain.handle(
    "project:export-video",
    async (event, projectId: string) => {
      if (
        typeof projectId !== "string" ||
        !projectId
      ) {
        throw new Error("Invalid project id");
      }
      const directory =
        store.getProjectDirectory(projectId);
      const defaultName = `${projectId.replace(
        /-thread$/,
        ""
      )}.mp4`;
      const result = await dialog.showSaveDialog({
        title: "Xuất video",
        defaultPath: path.join(
          directory,
          defaultName
        ),
        filters: [
          {
            name: "MP4 video",
            extensions: ["mp4"]
          }
        ]
      });
      if (
        result.canceled ||
        !result.filePath
      ) {
        return null;
      }
      const outputPath =
        result.filePath.toLowerCase().endsWith(
          ".mp4"
        )
          ? result.filePath
          : `${result.filePath}.mp4`;
      const sendProgress = (
        progress: ExportProgress
      ): void => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(
            "export:progress",
            progress
          );
        }
      };
      const project = await store.getProject(projectId);
      const timelineProject = project?.timelineProject ??
        (project?.timeline
          ? videoTimelineToProject(project.timeline)
          : undefined);
      if (!timelineProject) {
        throw new Error("Chưa có timeline để xuất video.");
      }
      return exportWithHyperframes(
        directory,
        timelineProject,
        outputPath,
        sendProgress
      );
    }
  );

  ipcMain.handle(
    "shell:show-item",
    async (_event, targetPath: string) => {
      if (
        typeof targetPath !== "string" ||
        !targetPath
      ) {
        throw new Error("Invalid path");
      }
      shell.showItemInFolder(
        path.resolve(targetPath)
      );
    }
  );

  ipcMain.handle(
    "shell:open-path",
    async (_event, targetPath: string) => {
      if (
        typeof targetPath !== "string" ||
        !targetPath
      ) {
        throw new Error("Invalid path");
      }
      const error = await shell.openPath(
        path.resolve(targetPath)
      );
      if (error) {
        throw new Error(error);
      }
    }
  );

  ipcMain.handle(
    "capcut:get-base-project",
    async () => undefined
  );

  ipcMain.handle(
    "capcut:choose-base-project",
    async () => undefined
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
    "projects:delete",
    async (_event, projectId: string) => {
      if (
        typeof projectId !== "string" ||
        !projectId
      ) {
        throw new Error("Invalid project id");
      }

      await store.deleteProject(projectId);
    }
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

  ipcMain.handle(
    "settings:get",
    () => loadSettings()
  );

  ipcMain.handle(
    "settings:get-abbreviations",
    () => loadAbbreviationEntries()
  );

  ipcMain.handle(
    "settings:save-abbreviations",
    (_event, input: unknown) =>
      saveAbbreviationEntries(input)
  );

  ipcMain.handle(
    "combos:list",
    () => loadUserCombos()
  );

  ipcMain.handle(
    "combos:save",
    (_event, input: unknown) => saveUserCombo(input)
  );

  ipcMain.handle(
    "combos:delete",
    (_event, comboId: string) => deleteUserCombo(comboId)
  );

  ipcMain.handle(
    "settings:choose-directory",
    async () => {
      const result = await dialog.showOpenDialog({
        title: "Chọn thư mục drafts của CapCut",
        properties: ["openDirectory", "createDirectory"]
      });
      if (
        result.canceled ||
        result.filePaths.length === 0
      ) {
        return null;
      }
      return result.filePaths[0];
    }
  );

  ipcMain.handle(
    "settings:save",
    async (_event, input: unknown) => {
      const previousPort =
        process.env.VBEE_WEBHOOK_PORT ?? "";
      const settings = await saveSettings(input);
      const nextPort =
        process.env.VBEE_WEBHOOK_PORT ?? "";
      if (
        previousPort === nextPort ||
        !options?.restartWebhook
      ) {
        return {
          settings,
          tunnelRestarted: false
        };
      }

      try {
        await options.restartWebhook();
        return {
          settings,
          tunnelRestarted: true
        };
      } catch (error) {
        return {
          settings,
          tunnelRestarted: false,
          tunnelError:
            error instanceof Error
              ? error.message
              : "Không khởi động lại được webhook."
        };
      }
    }
  );
}

export function getDesktopApi(): DesktopApi {
  throw new Error(
    "getDesktopApi is only available through preload"
  );
}
