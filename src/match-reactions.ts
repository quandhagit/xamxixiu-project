import fs from "node:fs/promises";
import path from "node:path";

import {
  matchReactions,
  type MatchedReaction
} from "./assets/matcher.js";
import { scanAssets } from "./assets/scanner.js";
import { isDirectCli } from "./cli.js";

import type {
  ThreadAnalysis
} from "./types.js";
import type { TimelineProject } from "./timeline/project.js";
import {
  persistBuiltInComboIds,
  stampComboFromClips
} from "./timeline/meme-combo.js";

export async function runMatchReactions(
  projectDir: string
): Promise<void> {
  const analysisPath =
    `${projectDir}/analysis.json`;

  const outputPath =
    `${projectDir}/reactions.json`;

  const analysisRaw =
    await fs.readFile(
      analysisPath,
      "utf-8"
    );

  const analysis =
    JSON.parse(
      analysisRaw
    ) as ThreadAnalysis;

  const assets = await scanAssets();
  let previous: MatchedReaction[] = [];
  try {
    previous = JSON.parse(
      await fs.readFile(outputPath, "utf-8")
    ) as MatchedReaction[];
    if (!Array.isArray(previous)) {
      previous = [];
    }
  } catch {
    previous = [];
  }

  try {
    const previousProject = JSON.parse(
      await fs.readFile(
        path.join(projectDir, "timeline-project.json"),
        "utf-8"
      )
    ) as TimelineProject;
    previous = stampComboFromClips(
      previous,
      previousProject.clips ?? []
    );
  } catch {
    // First match has no saved timeline project yet.
  }

  const reactions =
    matchReactions(
      analysis,
      assets,
      previous
    );

  analysis.reactions = persistBuiltInComboIds(
    analysis.reactions,
    reactions
  );
  const analysisTemporary = `${analysisPath}.tmp`;
  await fs.writeFile(
    analysisTemporary,
    JSON.stringify(analysis, null, 2),
    "utf-8"
  );
  await fs.rename(analysisTemporary, analysisPath);

  const temporary = `${outputPath}.tmp`;
  await fs.writeFile(
    temporary,
    JSON.stringify(
      reactions,
      null,
      2
    ),
    "utf-8"
  );
  await fs.rename(temporary, outputPath);
  await fs.rm(path.join(projectDir, "timeline.json"), { force: true });

  console.log(
    `Matched ${reactions.length} reactions.`
  );

  console.log(
    `Saved: ${outputPath}`
  );
}

if (isDirectCli(import.meta.url)) {
  const projectDir = process.argv[2];

  if (!projectDir) {
    throw new Error(
      "Usage: yarn match-reactions <project-dir>"
    );
  }

  await runMatchReactions(projectDir);
}
