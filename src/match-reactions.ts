import fs from "node:fs/promises";
import path from "node:path";

import {
  matchReactions
} from "./assets/matcher.js";
import { scanAssets } from "./assets/scanner.js";
import { isDirectCli } from "./cli.js";

import type {
  ThreadAnalysis
} from "./types.js";

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

  const reactions =
    matchReactions(
      analysis,
      assets
    );

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
