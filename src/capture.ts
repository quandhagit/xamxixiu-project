import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Page } from "playwright";

import {
  createContext,
  openThreads
} from "./browser.js";

import {
  extractPressableComment,
  extractThread
} from "./extract.js";

import {
  processImage
} from "./process-image.js";

import {
  screenshotContainer
} from "./screenshot.js";

import type {
  ThreadComment
} from "./types.js";

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
      path.join(rawDir, "topic.png"),
      124
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

export interface CaptureCommentInput {
  projectDir: string;
  url: string;
  imageIndex: number;
  existing: Array<{
    author: string;
    text: string;
  }>;
}

function replyCodesFromUrl(url: string): string[] {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  const match =
    /\/reply\/([^/]+)/.exec(parsed.pathname);

  if (!match?.[1]) {
    return [];
  }

  const codes = new Set<string>([match[1]]);

  try {
    const decoded =
      decodeURIComponent(match[1]);

    if (decoded.trim()) {
      codes.add(decoded);
    }
  } catch {
    // Keep the raw path segment when it is not valid encoding.
  }

  return [...codes];
}

async function findReplyContainerIndex(
  page: Page,
  codes: string[]
): Promise<number> {
  return page.evaluate((needles) => {
    const anchors = Array.from(
      document.querySelectorAll("a[href]")
    );
    const anchor = anchors.find((element) => {
      const href =
        element.getAttribute("href") ?? "";

      return needles.some(
        (code) =>
          code.length > 0 &&
          href.includes(code)
      );
    });

    if (!anchor) {
      return -1;
    }

    const container = anchor.closest(
      '[data-pressable-container="true"]'
    );

    if (!container) {
      return -1;
    }

    return Array.from(
      document.querySelectorAll(
        '[data-pressable-container="true"]'
      )
    ).indexOf(container);
  }, codes);
}

export async function captureComment(
  input: CaptureCommentInput
): Promise<ThreadComment> {
  const codes = replyCodesFromUrl(input.url);

  if (codes.length === 0) {
    throw new Error(
      "URL must contain a /reply/{code} segment"
    );
  }

  const filename = `comment-${String(
    input.imageIndex + 1
  ).padStart(2, "0")}.png`;
  const outputPath = path.join(
    input.projectDir,
    "processed",
    filename
  );

  const context = await createContext();

  try {
    const page = await openThreads(
      context,
      input.url
    );

    await page.waitForTimeout(3000);

    for (const code of replyCodesFromUrl(page.url())) {
      if (!codes.includes(code)) {
        codes.push(code);
      }
    }

    const containerIndex =
      await findReplyContainerIndex(page, codes);

    if (containerIndex < 0) {
      throw new Error(
        "Could not find the reply comment"
      );
    }

    const extracted =
      await extractPressableComment(
        page,
        containerIndex
      );

    if (!extracted) {
      throw new Error(
        "Could not extract the reply comment"
      );
    }

    const author = extracted.author.trim();
    const text = extracted.text.trim();
    const duplicate = input.existing.some(
      (item) =>
        item.author.trim() === author &&
        item.text.trim() === text
    );

    if (duplicate) {
      throw new Error(
        "This comment is already in the draft"
      );
    }

    await fs.mkdir(
      path.dirname(outputPath),
      { recursive: true }
    );
    await fs.rm(outputPath, { force: true });

    const tempPath = path.join(
      os.tmpdir(),
      `xamxixiu-${Date.now()}-${filename}`
    );

    try {
      await screenshotContainer(
        page,
        containerIndex,
        tempPath
      );
      await processImage(
        tempPath,
        outputPath
      );
    } catch (error: unknown) {
      await fs.rm(outputPath, {
        force: true
      });
      throw error;
    } finally {
      await fs.rm(tempPath, {
        force: true
      });
    }

    return {
      author: extracted.author,
      text: extracted.text,
      likes: extracted.likes,
      containerIndex,
      commentIndex: input.imageIndex
    };
  } finally {
    await context.close();
  }
}