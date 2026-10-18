import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { VideoTimeline } from "../../types.js";
import type { CapCutBaseProject } from "../../project/store.js";
import { runCapCut } from "./command.js";
import { buildCompileSpec } from "./spec-builder.js";
import { applyMemeFadeIns } from "./animations.js";
import { renderTopicTitleCard } from "./title-card.js";

async function assertCapCutProject(
  project: CapCutBaseProject
): Promise<void> {
  const stat = await fs.stat(project.directory)
    .catch(() => undefined);
  if (!stat?.isDirectory()) {
    throw new Error(
      `CapCut base project không tồn tại: ${project.directory}`
    );
  }

  if (project.timelineId) {
    await fs.access(
      path.join(
        project.directory,
        "Timelines",
        "project.json"
      )
    );
    await fs.access(
      path.join(
        project.directory,
        "Timelines",
        project.timelineId,
        "draft_content.json"
      )
    );
    return;
  }

  await fs.access(
    path.join(
      project.directory,
      "draft_content.json"
    )
  );
}

function getCapCutDraftsDirectory(): string {
  const localAppData =
    process.env.LOCALAPPDATA ??
    path.join(os.homedir(), "AppData", "Local");
  return path.join(
    localAppData,
    "CapCut",
    "User Data",
    "Projects",
    "com.lveditor.draft"
  );
}

function projectName(projectDirectory: string): string {
  const id = path.basename(projectDirectory)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `xamxixiu-${id || "project"}-${Date.now()}`;
}

function parseInitializedProject(output: string): CapCutBaseProject {
  const jsonLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("{") && line.endsWith("}"));

  if (!jsonLine) {
    throw new Error(
      `capcut init không trả về thông tin project hợp lệ: ${output}`
    );
  }

  const result = JSON.parse(jsonLine) as {
    draft_path?: string;
  };
  if (!result.draft_path) {
    throw new Error(
      `capcut init không trả về draft_path: ${output}`
    );
  }

  return { directory: result.draft_path };
}

export async function initializeCapCutProject(
  projectDirectory: string
): Promise<CapCutBaseProject> {
  const draftsDirectory = getCapCutDraftsDirectory();
  await fs.mkdir(draftsDirectory, {
    recursive: true
  });
  const output = await runCapCut(
    [
      "init",
      projectName(projectDirectory),
      "--drafts",
      draftsDirectory,
      "--template",
      "auto",
      "--ratio",
      "9:16"
    ],
    projectDirectory
  );
  const project = parseInitializedProject(output);
  await assertCapCutProject(project);
  return project;
}

export async function validateCapCutBaseProject(
  project: CapCutBaseProject
): Promise<CapCutBaseProject> {
  await assertCapCutProject(project);
  return project;
}

export async function generateCapCutProjectWithCli(
  projectDirectory: string,
  baseProject?: CapCutBaseProject
): Promise<string> {
  const initializedProject =
    baseProject ??
    await initializeCapCutProject(projectDirectory);
  await assertCapCutProject(initializedProject);
  const timelinePath = path.join(
    projectDirectory,
    "timeline.json"
  );
  const timeline = JSON.parse(
    await fs.readFile(timelinePath, "utf-8")
  ) as VideoTimeline;
  const topicTitleCardFile = timeline.topicIntro
    ? await renderTopicTitleCard(
        projectDirectory,
        timeline.topicIntro.title
      )
    : undefined;
  const spec = await buildCompileSpec(
    projectDirectory,
    timeline,
    topicTitleCardFile
  );
  const specPath = path.join(
    os.tmpdir(),
    `xamxixiu-capcut-${Date.now()}.json`
  );

  try {
    await fs.writeFile(
      specPath,
      JSON.stringify(spec, null, 2),
      "utf-8"
    );
    const activeTimelineArgs =
      initializedProject.timelineId
        ? ["--active-timeline"]
        : [];
    await runCapCut(
      [
        "compile",
        specPath,
        "--into",
        initializedProject.directory,
        ...activeTimelineArgs,
        "--check"
      ],
      projectDirectory
    );
    await runCapCut(
      [
        "compile",
        specPath,
        "--into",
        initializedProject.directory,
        ...activeTimelineArgs
      ],
      projectDirectory
    );
    await applyMemeFadeIns(
      projectDirectory,
      timeline,
      initializedProject
    );
    await runCapCut(
      [
        "diagnose",
        initializedProject.directory,
        ...activeTimelineArgs
      ],
      projectDirectory
    );
    await runCapCut(
      [
        "lint",
        initializedProject.directory,
        ...activeTimelineArgs
      ],
      projectDirectory
    );
    return initializedProject.directory;
  } finally {
    await fs.rm(specPath, {
      force: true
    });
  }
}
