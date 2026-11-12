import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Page } from "playwright";

import {
  createContext,
  openThreads
} from "./browser.js";

import {
  extractParentContainerIndex,
  extractPressableComment,
  PRESSABLE_SELECTOR,
  readPressableComment,
  THREAD_COLUMN_SELECTOR
} from "./extract.js";

import {
  processImage
} from "./process-image.js";

import {
  screenshotContainer
} from "./screenshot.js";

import type {
  ThreadComment,
  ThreadData
} from "./types.js";

import {
  expandComment
} from "./comments/speech-abbreviations.js";

import {
  CAPTURE_COMMENT_MAX,
  CAPTURE_COMMENT_TARGET
} from "./comments/comment-constants.js";
import { getRuntimeRoot } from "./binaries.js";

export interface CaptureResult {
  projectDir: string;
  threadPath: string;
  rawDir: string;
}

const MAX_SCROLL_ROUNDS = 40;
const MAX_STALLED_ROUNDS = 5;
const SCROLL_WAIT_MS = 1500;

interface HarvestedComment {
  key: string;
  author: string;
  text: string;
  likes: number;
  parentKey?: string;
}

/**
 * Finds where a comment currently sits in the container list. Checks the
 * expected index first, then scans the rest (Threads virtualizes the list,
 * so indexes shift while scrolling).
 */
async function findContainerIndexByContent(
  page: Page,
  matches: (author: string, text: string) => boolean,
  expected: number
): Promise<number | undefined> {
  const containers = page.locator(PRESSABLE_SELECTOR);
  const count = await containers.count();
  const order = [
    expected,
    ...Array.from({ length: count }, (_, i) => i).filter(
      (i) => i !== expected
    )
  ];

  for (const i of order) {
    if (i < 0 || i >= count) {
      continue;
    }

    const content = await readPressableComment(
      containers.nth(i)
    ).catch(() => undefined);

    if (content && matches(content.author, content.text)) {
      return i;
    }
  }

  return undefined;
}

/**
 * When the shared comment is the focused post, its container also holds the
 * sort bar and reply composer. Returns how many px to cut from the bottom so
 * the image ends right under the like/reply/repost/share row (0 otherwise).
 */
async function actionBarCropPx(
  page: Page,
  containerIndex: number
): Promise<number> {
  return page
    .locator(PRESSABLE_SELECTOR)
    .nth(containerIndex)
    .evaluate((element) => {
      const composer = element.querySelector(
        '[contenteditable="true"][role="textbox"]'
      );

      if (!composer) {
        return 0;
      }

      const labels =
        /^(thích|trả lời|đăng lại|chia sẻ|like|reply|repost|share)$/i;
      const box = element.getBoundingClientRect();
      const composerTop =
        composer.getBoundingClientRect().top;
      let actionsBottom = 0;

      for (const svg of Array.from(
        element.querySelectorAll("svg")
      )) {
        const label = (
          svg.getAttribute("aria-label") ??
          svg.querySelector("title")?.textContent ??
          ""
        ).trim();

        if (!labels.test(label)) {
          continue;
        }

        const rect = svg.getBoundingClientRect();

        if (rect.bottom < composerTop) {
          actionsBottom = Math.max(
            actionsBottom,
            rect.bottom
          );
        }
      }

      if (actionsBottom <= 0) {
        return 0;
      }

      // Keep the action row's own padding below the icons.
      const keepBelow = 12;

      return Math.max(
        0,
        Math.floor(box.bottom - actionsBottom - keepBelow)
      );
    })
    .catch(() => 0);
}

function commentKey(author: string, text: string): string {
  return `${author}\u0000${text}`;
}

/**
 * Threads unmounts off-screen containers while scrolling, so the whole
 * thread is never in the DOM at once. Instead of scrolling first and
 * capturing afterwards, harvest (extract + screenshot) every container that
 * is rendered at each scroll step, de-duplicating by author + text.
 */
async function harvestThread(
  page: Page,
  rawDir: string,
  commentTarget: number
): Promise<ThreadData> {
  const containers = page.locator(PRESSABLE_SELECTOR);

  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);

  const post = await readPressableComment(containers.first());

  if (!post) {
    throw new Error("Could not extract any Threads content");
  }

  const postKey = commentKey(post.author, post.text);

  await screenshotContainer(
    page,
    0,
    path.join(rawDir, "topic.png"),
    124
  );

  const harvested: HarvestedComment[] = [];
  const seen = new Set<string>([postKey]);
  let stalled = 0;

  for (
    let round = 0;
    round < MAX_SCROLL_ROUNDS &&
      harvested.length < commentTarget &&
      stalled < MAX_STALLED_ROUNDS;
    round++
  ) {
    const before = harvested.length;
    const count = await containers.count();
    const keys: Array<string | undefined> = [];
    const parents: Array<number | undefined> = [];
    const contents: Array<
      Awaited<ReturnType<typeof readPressableComment>>
    > = [];

    for (let i = 0; i < count; i++) {
      const content = await readPressableComment(
        containers.nth(i)
      ).catch(() => undefined);

      contents.push(content);
      keys.push(
        content
          ? commentKey(content.author, content.text)
          : undefined
      );
      parents.push(
        content
          ? await extractParentContainerIndex(
            containers.nth(i),
            PRESSABLE_SELECTOR
          ).catch(() => undefined)
          : undefined
      );
    }

    for (
      let i = 0;
      i < count &&
        harvested.length < commentTarget;
      i++
    ) {
      const key = keys[i];
      const content = contents[i];

      if (!key || !content) {
        continue;
      }

      const parentContainer = parents[i];
      const parentKey =
        parentContainer !== undefined
          ? keys[parentContainer]
          : undefined;
      const resolvedParent =
        parentKey &&
        parentKey !== postKey &&
        parentKey !== key
          ? parentKey
          : undefined;

      if (seen.has(key)) {
        if (resolvedParent) {
          const existing = harvested.find(
            (item) => item.key === key
          );

          if (existing && !existing.parentKey) {
            existing.parentKey = resolvedParent;
          }
        }

        continue;
      }

      const filename = `comment-${String(
        harvested.length + 1
      ).padStart(2, "0")}.png`;

      try {
        // Make sure the DOM did not shift since the read pass.
        const check = await readPressableComment(
          containers.nth(i)
        );

        if (
          !check ||
          commentKey(check.author, check.text) !== key
        ) {
          continue;
        }

        await screenshotContainer(
          page,
          i,
          path.join(rawDir, filename),
          0,
          () =>
            findContainerIndexByContent(
              page,
              (author, text) =>
                commentKey(author, text) === key,
              i
            )
        );
      } catch {
        continue;
      }

      seen.add(key);
      harvested.push({
        key,
        author: content.author,
        text: content.text,
        likes: content.likes,
        ...(resolvedParent
          ? { parentKey: resolvedParent }
          : {})
      });
    }

    stalled =
      harvested.length > before ? 0 : stalled + 1;

    if (harvested.length >= commentTarget) {
      break;
    }

    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.9);
    });
    await page.waitForTimeout(SCROLL_WAIT_MS);

    // Click "view more" style buttons if the thread lazy-loads via buttons.
    const moreButton = page
      .getByRole("button", {
        name: /xem thêm|view more|show more|more replies/i
      })
      .first();

    if (await moreButton.isVisible().catch(() => false)) {
      await moreButton.click().catch(() => undefined);
      await page.waitForTimeout(SCROLL_WAIT_MS);
    }
  }

  console.log(
    `Captured ${harvested.length} comments (target ${commentTarget}).\n`
  );

  const keyToIndex = new Map(
    harvested.map((item, index) => [item.key, index])
  );

  const comments: ThreadComment[] = harvested.map(
    (item, index) => {
      const parentIndex = item.parentKey
        ? keyToIndex.get(item.parentKey)
        : undefined;

      return {
        author: item.author,
        text: item.text,
        likes: item.likes,
        containerIndex: index + 1,
        commentIndex: index,
        ...(parentIndex !== undefined &&
          parentIndex !== index
          ? { parentCommentIndex: parentIndex }
          : {})
      };
    }
  );

  for (const comment of comments) {
    const parentIndex = comment.parentCommentIndex;

    if (parentIndex === undefined) {
      continue;
    }

    const parent = comments[parentIndex];

    if (!parent) {
      delete comment.parentCommentIndex;
      continue;
    }

    parent.replies = [
      ...(parent.replies ?? []),
      { ...comment, replies: undefined }
    ];
  }

  return {
    url: page.url(),
    author: post.author,
    text: post.text,
    likes: post.likes,
    postContainerIndex: 0,
    comments
  };
}

export function normalizeCaptureCount(
  value: number | undefined
): number {
  if (
    value === undefined ||
    !Number.isInteger(value)
  ) {
    return CAPTURE_COMMENT_TARGET;
  }

  return Math.min(
    CAPTURE_COMMENT_MAX,
    Math.max(1, value)
  );
}

export async function captureThread(
  url: string,
  commentLimit?: number
): Promise<CaptureResult> {
  const context = await createContext();

  try {
    console.log("\nOpening Threads...\n");

    const page = await openThreads(
      context,
      url
    );

    await page.waitForTimeout(3000);

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

    const projectId = `${timestamp}-thread`;

    const projectDir = path.join(
      getRuntimeRoot(),
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

    console.log("Loading and capturing comments...\n");

    const thread = await harvestThread(
      page,
      rawDir,
      normalizeCaptureCount(commentLimit)
    );

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
  /** Abbreviation table (lowercased keys); defaults to the starter list. */
  abbreviations?: Record<string, string>;
}

function replyCodesFromUrl(url: string): string[] {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  const match =
    /\/(?:reply|post|share)\/([^/]+)/.exec(
      parsed.pathname
    );

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
  return page.evaluate(
    ({ needles, columnSelector, pressableSelector }) => {
      const anchors = Array.from(
        document.querySelectorAll("a[href]")
      );
      const containers = Array.from(
        document.querySelectorAll(pressableSelector)
      );
      // Permalink links also appear in the right-rail Quotes
      // card. Only a card inside the thread column counts, and
      // a link inside a nested quote still belongs to the
      // outer comment.
      let container: Element | null = null;

      for (const element of anchors) {
        const href =
          element.getAttribute("href") ?? "";

        if (
          !needles.some(
            (code) =>
              code.length > 0 &&
              href.includes(code)
          )
        ) {
          continue;
        }

        const column = element.closest(columnSelector);

        if (!column) {
          continue;
        }

        container = element.closest(
          '[data-pressable-container="true"]'
        );

        if (!container || !column.contains(container)) {
          container = null;
          continue;
        }

        let parent =
          container.parentElement?.closest(
            '[data-pressable-container="true"]'
          ) ?? null;

        while (parent && column.contains(parent)) {
          container = parent;
          parent =
            container.parentElement?.closest(
              '[data-pressable-container="true"]'
            ) ?? null;
        }

        break;
      }

      if (!container) {
        return -1;
      }

      return containers.indexOf(container);
    },
    {
      needles: codes,
      columnSelector: THREAD_COLUMN_SELECTOR,
      pressableSelector: PRESSABLE_SELECTOR
    }
  );
}

export async function captureComment(
  input: CaptureCommentInput
): Promise<ThreadComment> {
  const codes = replyCodesFromUrl(input.url);

  // Share links (e.g. /share/XXXX) have no /reply/{code};
  // the code is resolved from the redirected page URL below.
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

    if (/\/share\//.test(page.url())) {
      await page
        .waitForURL((u) => !/\/share\//.test(u.pathname), {
          timeout: 10000
        })
        .catch(() => undefined);
      await page.waitForTimeout(2000);

      for (const code of replyCodesFromUrl(page.url())) {
        if (!codes.includes(code)) {
          codes.push(code);
        }
      }
    }

    let containerIndex = codes.length > 0
      ? await findReplyContainerIndex(page, codes)
      : -1;

    for (
      let attempt = 0;
      containerIndex < 0 && attempt < 6;
      attempt++
    ) {
      await page.waitForTimeout(1500);

      for (const code of replyCodesFromUrl(page.url())) {
        if (!codes.includes(code)) {
          codes.push(code);
        }
      }

      containerIndex = codes.length > 0
        ? await findReplyContainerIndex(page, codes)
        : -1;
    }

    if (containerIndex < 0) {
      throw new Error(
        "Không tìm thấy comment trong trang. Hãy kiểm tra lại link."
      );
    }

    const extracted =
      await extractPressableComment(
        page,
        containerIndex
      );

    if (!extracted) {
      throw new Error(
        "Không đọc được nội dung comment."
      );
    }

    const author = extracted.author.trim();
    const text = extracted.text.trim();
    const duplicateIndex = input.existing.findIndex(
      (item) =>
        item.author.trim() === author &&
        item.text.trim() === text
    );

    if (duplicateIndex >= 0) {
      throw new Error(
        `Comment bạn vừa thêm đã có sẵn trong list comment. index: ${duplicateIndex}`
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
        tempPath,
        await actionBarCropPx(page, containerIndex),
        () =>
          findContainerIndexByContent(
            page,
            (candidateAuthor, candidateText) =>
              candidateAuthor.trim() === author &&
              candidateText.trim() === text,
            containerIndex
          )
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

    return expandComment(
      {
        author: extracted.author,
        text: extracted.text,
        likes: extracted.likes,
        containerIndex,
        commentIndex: input.imageIndex
      },
      input.abbreviations
    );
  } finally {
    await context.close();
  }
}
