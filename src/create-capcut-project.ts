import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import {
  generateCapCutProjectWithCli,
  validateCapCutBaseProject
} from "./capcut/cli-adapter.js";
import type {
  CapCutBaseProject
} from "./project/store.js";

const projectDirectory =
  process.argv[2];
const baseDirectory =
  process.argv[3] ??
  process.env.CAPCUT_APP_PROJECT_DIR;

if (!projectDirectory) {
  throw new Error(
    'Usage: yarn create-capcut-project "<project-directory>" [<capcut-base-project>]'
  );
}

let baseProject: CapCutBaseProject | undefined;
if (baseDirectory) {
  let timelineId: string | undefined;
  try {
    const projectJson =
      JSON.parse(
        await fs.readFile(
          path.join(
            baseDirectory,
            "Timelines",
            "project.json"
          ),
          "utf-8"
        )
      ) as {
        main_timeline_id?: string;
      };
    timelineId =
      projectJson.main_timeline_id;
  } catch {
    await fs.access(
      path.join(
        baseDirectory,
        "draft_content.json"
      )
    );
  }
  baseProject = {
    directory: baseDirectory,
    timelineId
  };
  await validateCapCutBaseProject(baseProject);
}

const outputDirectory =
  await generateCapCutProjectWithCli(
    projectDirectory,
    baseProject
  );

console.log(
  `CapCut project generated: ${outputDirectory}`
);
