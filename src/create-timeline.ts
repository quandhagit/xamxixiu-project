import fs from "node:fs/promises";
import path from "node:path";

import {
  buildTimeline
} from "./timeline/builder.js";

const projectDir = process.argv[2];

if (!projectDir) {
  throw new Error(
    'Usage: yarn create-timeline "<project-dir>"'
  );
}

const timeline =
  await buildTimeline(projectDir);

const outputPath = path.join(
  projectDir,
  "timeline.json"
);

await fs.writeFile(
  outputPath,
  JSON.stringify(timeline, null, 2),
  "utf-8"
);

console.log(
  `Timeline created: ${outputPath}`
);
console.log(
  `Scenes: ${timeline.scenes.length}`
);
console.log(
  `Duration: ${timeline.totalDuration.toFixed(2)}s`
);
