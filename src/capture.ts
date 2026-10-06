import fs from "node:fs/promises";
import path from "node:path";

import {
  createContext,
  openThreads
} from "./browser.js";

import {
  extractThread
} from "./extract.js";

import {
  screenshotContainer
} from "./screenshot.js";

export interface CaptureResult {
  projectDir: string;
  threadPath: string;
  rawDir: string;
}

export async function captureThread(
  url: string
): Promise<CaptureResult> {
  const context = await createContext();

  try {
    console.log("\nOpening Threads...\n");

    const page = await openThreads(
      context,
      url
    );

    await page.waitForTimeout(3000);

    console.log("Extracting thread...\n");

    const thread = await extractThread(page);

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

    const projectId = `${timestamp}-thread`;

    const projectDir = path.join(
      "projects",
      projectId
    );

    const rawDir = path.join(
      projectDir,
      "raw"
    );

    await fs.mkdir(rawDir, {
      recursive: true
    });

    // Save thread.json
    const threadPath = path.join(
      projectDir,
      "thread.json"
    );

    await fs.writeFile(
      threadPath,
      JSON.stringify(thread, null, 2),
      "utf-8"
    );

    console.log(
      `Saved: ${threadPath}`
    );

    // Screenshot main post
    await screenshotContainer(
      page,
      thread.postContainerIndex,
      path.join(rawDir, "topic.png")
    );

    // Screenshot comments
    for (
      let i = 0;
      i < thread.comments.length;
      i++
    ) {
      const comment = thread.comments[i];

      const filename = `comment-${String(
        i + 1
      ).padStart(2, "0")}.png`;

      await screenshotContainer(
        page,
        comment.containerIndex,
        path.join(rawDir, filename)
      );
    }

    return {
      projectDir,
      threadPath,
      rawDir
    };
  } finally {
    await context.close();
  }
}