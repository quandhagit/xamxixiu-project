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

interface ProjectStoreOptions {
  projectsDirectory: string;
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

  constructor(options: ProjectStoreOptions) {
    this.projectsDirectory =
      options.projectsDirectory;
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
