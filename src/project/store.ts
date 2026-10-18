import fs from "node:fs/promises";
import path from "node:path";
import type {
  AudioFailure,
  ContentData,
  ThreadAnalysis,
  ThreadData,
  VideoTimeline
} from "../types.js";
import type {
  MatchedReaction
} from "../assets/matcher.js";
import type { Asset } from "../assets/scanner.js";

export interface ProjectSummary {
  id: string;
  directory: string;
  hasThread: boolean;
  hasAnalysis: boolean;
  hasTimeline: boolean;
  hasReactions: boolean;
  audioCount: number;
}

export interface ProjectState extends ProjectSummary {
  thread?: ThreadData;
  content?: ContentData;
  analysis?: ThreadAnalysis;
  reactions?: MatchedReaction[];
  timeline?: VideoTimeline;
  audioFiles: string[];
  audioFailures: AudioFailure[];
}

export interface CapCutBaseProject {
  directory: string;
  timelineId?: string;
}

interface ProjectStoreOptions {
  projectsDirectory: string;
  capCutSettingsFile?: string;
}

async function readJson<T>(
  file: string
): Promise<T | undefined> {
  try {
    const content = await fs.readFile(
      file,
      "utf-8"
    );
    return JSON.parse(content) as T;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}

async function atomicWriteJson(
  file: string,
  value: unknown
): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(
    temporary,
    JSON.stringify(value, null, 2),
    "utf-8"
  );
  await fs.rename(temporary, file);
}

async function pathIsDirectory(
  directory: string
): Promise<boolean> {
  try {
    const stat = await fs.stat(directory);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function pathIsFile(
  file: string
): Promise<boolean> {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

export class ProjectStore {
  private readonly projectsDirectory: string;
  private readonly capCutSettingsFile: string;

  constructor(options: ProjectStoreOptions) {
    this.projectsDirectory =
      options.projectsDirectory;
    this.capCutSettingsFile =
      options.capCutSettingsFile ??
      path.join(
        this.projectsDirectory,
        "..",
        "capcut-settings.json"
      );
  }

  async getCapCutBaseProject(): Promise<
    CapCutBaseProject | undefined
  > {
    return readJson<CapCutBaseProject>(
      this.capCutSettingsFile
    );
  }

  async setCapCutBaseProject(
    project: CapCutBaseProject
  ): Promise<CapCutBaseProject> {
    await fs.writeFile(
      this.capCutSettingsFile,
      JSON.stringify(project, null, 2),
      "utf-8"
    );
    return project;
  }

  async getProjects(): Promise<ProjectSummary[]> {
    await fs.mkdir(
      this.projectsDirectory,
      { recursive: true }
    );

    const entries = await fs.readdir(
      this.projectsDirectory,
      { withFileTypes: true }
    );
    const projects: ProjectSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const id = entry.name;
      const directory = path.join(
        this.projectsDirectory,
        id
      );

      projects.push(
        await this.getSummary(id, directory)
      );
    }

    return projects.sort(
      (left, right) =>
        right.id.localeCompare(left.id)
    );
  }

  async getProject(
    projectId: string
  ): Promise<ProjectState | undefined> {
    const directory =
      this.getProjectDirectory(projectId);

    if (!(await pathIsDirectory(directory))) {
      return undefined;
    }

    const summary =
      await this.getSummary(projectId, directory);
    const audioFiles =
      await this.getAudioFiles(directory);
    const audioFailures =
      (await readJson<AudioFailure[]>(
        path.join(directory, "audio-failures.json")
      )) ?? [];

    return {
      ...summary,
      audioFiles,
      audioFailures,
      thread: await readJson<ThreadData>(
        path.join(directory, "thread.json")
      ),
      content: await readJson<ContentData>(
        path.join(directory, "content.json")
      ),
      analysis: await readJson<ThreadAnalysis>(
        path.join(directory, "analysis.json")
      ),
      reactions: await readJson<MatchedReaction[]>(
        path.join(directory, "reactions.json")
      ),
      timeline: await readJson<VideoTimeline>(
        path.join(directory, "timeline.json")
      )
    };
  }

  async createProjectState(
    projectId: string
  ): Promise<ProjectState> {
    const directory =
      this.getProjectDirectory(projectId);

    await fs.mkdir(directory, {
      recursive: true
    });

    const project =
      await this.getProject(projectId);

    if (!project) {
      throw new Error(
        `Could not create project state: ${projectId}`
      );
    }

    return project;
  }

  async saveReactions(
    projectId: string,
    reactions: MatchedReaction[],
    assets: Asset[],
    selections?: {
      backgroundAssetId?: string | null;
      musicAssetId?: string | null;
    }
  ): Promise<ProjectState> {
    if (!Array.isArray(reactions)) {
      throw new Error("Reactions must be an array");
    }
    const assetIds = new Set(assets.map((asset) => asset.id));
    for (const reaction of reactions) {
      if (
        !Number.isInteger(reaction.commentIndex) ||
        !Number.isFinite(reaction.duration) ||
        reaction.duration < 0.25 ||
        reaction.duration > 10
      ) {
        throw new Error("Invalid reaction assignment");
      }
      if (reaction.meme && !assetIds.has(reaction.meme.id)) {
        throw new Error(`Unknown meme asset: ${reaction.meme.id}`);
      }
      if (reaction.sfx && !assetIds.has(reaction.sfx.id)) {
        throw new Error(`Unknown SFX asset: ${reaction.sfx.id}`);
      }
      if (
        reaction.meme?.mediaKind === "video" &&
        (reaction.sfx || reaction.animation !== "none")
      ) {
        throw new Error("Video memes cannot use SFX or animation");
      }
      if (
        reaction.meme?.mediaKind === "image" &&
        !reaction.sfx
      ) {
        throw new Error("Image memes require an SFX");
      }
    }
    const directory = this.getProjectDirectory(projectId);
    const analysisFile = path.join(directory, "analysis.json");
    const analysis = selections
      ? await readJson<ThreadAnalysis>(analysisFile)
      : undefined;
    if (selections && !analysis) {
      throw new Error("Project analysis is missing");
    }
    if (selections && analysis) {
      for (const [key, type] of [
        ["backgroundAssetId", "background"],
        ["musicAssetId", "music"]
      ] as const) {
        const id = selections[key];
        if (
          id &&
          !assets.some(
            (asset) => asset.id === id && asset.type === type
          )
        ) {
          throw new Error(`Unknown ${type} asset: ${id}`);
        }
        analysis[key] = id ?? null;
      }
    }
    await atomicWriteJson(
      path.join(directory, "reactions.json"),
      reactions
    );
    if (selections && analysis) {
      await atomicWriteJson(analysisFile, analysis);
    }
    await fs.rm(
      path.join(directory, "timeline.json"),
      { force: true }
    );
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project could not be loaded: ${projectId}`);
    }
    return project;
  }

  async getAssetReferences(
    assetId: string
  ): Promise<string[]> {
    const references: string[] = [];
    for (const project of await this.getProjects()) {
      const state = await this.getProject(project.id);
      if (
        state?.reactions?.some(
          (reaction) =>
            reaction.meme?.id === assetId ||
            reaction.sfx?.id === assetId
        ) ||
        state?.analysis?.topicMemeId === assetId ||
        state?.analysis?.backgroundAssetId === assetId ||
        state?.analysis?.musicAssetId === assetId
      ) {
        references.push(project.id);
      }
    }
    return references;
  }

  getProjectDirectory(
    projectId: string
  ): string {
    if (
      !projectId ||
      projectId.includes("..") ||
      path.basename(projectId) !== projectId
    ) {
      throw new Error(
        `Invalid project id: ${projectId}`
      );
    }

    return path.join(
      this.projectsDirectory,
      projectId
    );
  }

  private async getSummary(
    id: string,
    directory: string
  ): Promise<ProjectSummary> {
    return {
      id,
      directory,
      hasThread: await pathIsFile(
        path.join(directory, "thread.json")
      ),
      hasAnalysis: await pathIsFile(
        path.join(directory, "analysis.json")
      ),
      hasTimeline: await pathIsFile(
        path.join(directory, "timeline.json")
      ),
      hasReactions: await pathIsFile(
        path.join(directory, "reactions.json")
      ),
      audioCount: await this.getAudioFiles(
        directory
      ).then((files) => files.length)
    };
  }

  private async getAudioFiles(
    directory: string
  ): Promise<string[]> {
    const audioDirectory = path.join(
      directory,
      "audio"
    );

    try {
      const entries = await fs.readdir(
        audioDirectory,
        { withFileTypes: true }
      );

      return entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.toLowerCase().endsWith(".mp3")
        )
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }
}
