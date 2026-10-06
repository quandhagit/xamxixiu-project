import fs from "node:fs/promises";

import {
  matchReactions
} from "./assets/matcher.js";

import type {
  ThreadAnalysis
} from "./types.js";

import type {
  Asset
} from "./assets/scanner.js";

const projectDir = process.argv[2];

if (!projectDir) {
  throw new Error(
    "Usage: yarn match-reactions <project-dir>"
  );
}

const analysisPath =
  `${projectDir}/analysis.json`;

const assetsPath =
  "assets/assets.json";

const outputPath =
  `${projectDir}/reactions.json`;

const analysisRaw =
  await fs.readFile(
    analysisPath,
    "utf-8"
  );

const assetsRaw =
  await fs.readFile(
    assetsPath,
    "utf-8"
  );

const analysis =
  JSON.parse(
    analysisRaw
  ) as ThreadAnalysis;

const assets =
  JSON.parse(
    assetsRaw
  ) as Asset[];

const reactions =
  matchReactions(
    analysis,
    assets
  );

await fs.writeFile(
  outputPath,
  JSON.stringify(
    reactions,
    null,
    2
  ),
  "utf-8"
);

console.log(
  `Matched ${reactions.length} reactions.`
);

console.log(
  `Saved: ${outputPath}`
);