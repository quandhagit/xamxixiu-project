import path from "node:path";

import {
  captureThread
} from "./capture.js";

import {
  processProjectImages
} from "./process-image.js";

const url = process.argv[2];

if (!url) {
  throw new Error(
    'Usage: yarn create-project "<threads-url>"'
  );
}

console.log(
  "\n=============================="
);

console.log(
  "Creating Threads project"
);

console.log(
  "==============================\n"
);

// Step 1:
// Threads → thread.json + raw screenshots
const result = await captureThread(url);

// Step 2:
// raw → processed
const processedDir = path.join(
  result.projectDir,
  "processed"
);

console.log("\nProcessing images...\n");

await processProjectImages(
  result.rawDir,
  processedDir
);

console.log("\n==============================");
console.log(
  "Project created successfully!"
);
console.log("==============================\n");

console.log(
  `Project: ${result.projectDir}`
);