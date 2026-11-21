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
  parentIndexFromSnapshot,
  parsePressableComment,
  PRESSABLE_SELECTOR,
  snapshotPressableCards,
  THREAD_COLUMN_SELECTOR
} from "./extract.js";

import {
  createImageProcessor,
  processImage,
  type ImageProcessor
} from "./process-image.js";

import {
  screenshotContainer
} from "./screenshot.js";

import {
  DEFAULT_CAPTURE_VIEWPORT,
  parseCaptureViewport,
  type CaptureViewport,
  type ThreadComment,
  type ThreadData
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
const SCROLL_WAIT_MS = 600;
const POST_GOTO_TIMEOUT_MS = 8000;
const SCROLL_TOP_WAIT_MS = 400;
const POLL_WAIT_MS = 400;

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
  const cards = await snapshotPressableCards(page);
  const parsed = cards.map((card) => ({
    index: card.index,
    content: parsePressableComment(card)
  }));
  const expectedCard = parsed.find(
    (card) => card.index === expected
  );

  if (
    expectedCard?.content &&
    matches(
      expectedCard.content.author,
      expectedCard.content.text
    )
  ) {
    return expected;
  }

  for (const card of parsed) {
    if (
      card.content &&
      matches(card.content.author, card.content.text)
    ) {
      return card.index;
    }
  }

  return undefined;
}

async function waitForThreadCards(page: Page): Promise<void> {
  await page.waitForSelector(PRESSABLE_SELECTOR, {
    timeout: POST_GOTO_TIMEOUT_MS
  });
}

async function waitForFirstCardText(
  page: Page,
  timeoutMs: number
): Promise<void> {
  await page
    .waitForFunction(
      (selector) => {
        const element = document.querySelector(selector);
        return (
          !!element &&
          ((element as HTMLElement).innerText?.trim().length ??
            0) > 0
        );
      },
      PRESSABLE_SELECTOR,
      { timeout: timeoutMs }
    )
    .catch(() => undefined);
}

async function viewportSignature(page: Page): Promise<string> {
  return page.evaluate((selector) => {
    const cards = Array.from(
      document.querySelectorAll(selector)
    );
    const first = (cards[0] as HTMLElement | undefined)
      ?.innerText
      .slice(0, 80) ?? "";
    const last = (
      cards.at(-1) as HTMLElement | undefined
    )?.innerText.slice(0, 80) ?? "";
    return `${cards.length}|${first}|${last}`;
  }, PRESSABLE_SELECTOR);
}

async function waitForViewportChange(
  page: Page,
  previous: string,
  timeoutMs: number
): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const next = await viewportSignature(page);

    if (next !== previous) {
      return;
    }

    await page.waitForTimeout(50);
  }
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
function enqueueProcessedImage(
  processor: ImageProcessor,
  rawPath: string,
  processedDir: string
): void {
  processor.enqueue(
    rawPath,
    path.join(processedDir, path.basename(rawPath)),
    { deleteInput: true }
  );
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
  processedDir: string,
  processor: ImageProcessor,
  commentTarget: number,
  viewport: CaptureViewport
): Promise<ThreadData> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await waitForFirstCardText(page, SCROLL_TOP_WAIT_MS);

  const openingCards = await snapshotPressableCards(page);
  const post = openingCards[0]
    ? parsePressableComment(openingCards[0])
    : undefined;

  if (!post) {
    throw new Error("Could not extract any Threads content");
  }

  const postKey = commentKey(post.author, post.text);
  const topicPath = path.join(rawDir, "topic.png");

  const stitchOverflow = viewport === "mobile";

  await screenshotContainer(
    page,
    0,
    topicPath,
    undefined,
    stitchOverflow
  );
  enqueueProcessedImage(processor, topicPath, processedDir);

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
    const cards = await snapshotPressableCards(page);
    const contents = cards.map((card) =>
      parsePressableComment(card)
    );
    const keys = contents.map((content) =>
      content
        ? commentKey(content.author, content.text)
        : undefined
    );
    const parents = cards.map((card) =>
      parentIndexFromSnapshot(card)
    );

    for (
      let i = 0;
      i < cards.length &&
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
      const rawPath = path.join(rawDir, filename);

      try {
        await screenshotContainer(
          page,
          cards[i].index,
          rawPath,
          () =>
            findContainerIndexByContent(
              page,
              (author, text) =>
                commentKey(author, text) === key,
              cards[i].index
            ),
          stitchOverflow
        );
      } catch {
        continue;
      }

      enqueueProcessedImage(
        processor,
        rawPath,
        processedDir
      );
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

    const beforeScroll = await viewportSignature(page);
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.9);
    });
    await waitForViewportChange(
      page,
      beforeScroll,
      SCROLL_WAIT_MS
    );

    // Click "view more" style buttons if the thread lazy-loads via buttons.
    const moreButton = page
      .getByRole("button", {
        name: /xem thêm|view more|show more|more replies/i
      })
      .first();

    if (await moreButton.isVisible().catch(() => false)) {
      const beforeMore = await viewportSignature(page);
      await moreButton.click().catch(() => undefined);
      await waitForViewportChange(
        page,
        beforeMore,
        SCROLL_WAIT_MS
      );
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
  commentLimit?: number,
  viewport: CaptureViewport = DEFAULT_CAPTURE_VIEWPORT
): Promise<CaptureResult> {
  const captureViewport = parseCaptureViewport(viewport);
  const context = await createContext(captureViewport);
  const processor = createImageProcessor();

  try {
    console.log("\nOpening Threads...\n");

    const page = await openThreads(
      context,
      url
    );

    await waitForThreadCards(page);

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
    const processedDir = path.join(
      projectDir,
      "processed"
    );

    await fs.mkdir(rawDir, {
      recursive: true
    });
    await fs.mkdir(processedDir, {
      recursive: true
    });

    console.log("Loading and capturing comments...\n");

    const thread = await harvestThread(
      page,
      rawDir,
      processedDir,
      processor,
      normalizeCaptureCount(commentLimit),
      captureViewport
    );
    const sourceUrl = url.trim();
    if (sourceUrl) {
      thread.url = sourceUrl;
    }
    thread.viewport = captureViewport;
    await processor.drain();

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
    await processor.drain().catch(() => undefined);
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
  viewport?: CaptureViewport;
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

        const column = document.querySelector(columnSelector);

        if (column && !element.closest(columnSelector)) {
          continue;
        }

        container = element.closest(
          '[data-pressable-container="true"]'
        );

        if (!container || (column && !column.contains(container))) {
          container = null;
          continue;
        }

        while (
          container &&
          !containers.includes(container)
        ) {
          const parent: Element | null =
            container.parentElement?.closest(
              '[data-pressable-container="true"]'
            ) ?? null;

          if (
            !parent ||
            (column && !column.contains(parent))
          ) {
            break;
          }

          container = parent;
        }

        if (!container || !containers.includes(container)) {
          container = null;
          continue;
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

  const captureViewport = parseCaptureViewport(input.viewport);
  const context = await createContext(captureViewport);

  try {
    const page = await openThreads(
      context,
      input.url
    );

    await waitForThreadCards(page);

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
      await waitForThreadCards(page);

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
      await page.waitForTimeout(POLL_WAIT_MS);

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
        () =>
          findContainerIndexByContent(
            page,
            (candidateAuthor, candidateText) =>
              candidateAuthor.trim() === author &&
              candidateText.trim() === text,
            containerIndex
          ),
        captureViewport === "mobile"
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
