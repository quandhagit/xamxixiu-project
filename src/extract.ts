import type { Page } from "playwright";
import type {
  ThreadComment,
  ThreadData
} from "./types.js";

export type ExtractedComment = ThreadComment;
export type ExtractedThread = ThreadData;

const PRESSABLE_SELECTOR =
  '[data-pressable-container="true"]';

export async function extractThread(
  page: Page
): Promise<ExtractedThread> {
  const containers =
    page.locator(PRESSABLE_SELECTOR);

  const count =
    await containers.count();

  console.log(
    `Found ${count} pressable containers`
  );

  if (count === 0) {
    throw new Error(
      "Could not find any Threads containers"
    );
  }

  const results: Array<{
    index: number;
    author: string;
    text: string;
    likes: number;
  }> = [];

  for (let i = 0; i < count; i++) {
    const container =
      containers.nth(i);

    const profileLink =
      container
        .locator(
          'a[role="link"][href^="/@"]'
        )
        .first();

    if (!(await profileLink.count())) {
      continue;
    }

    const author =
      (
        await profileLink.innerText()
      ).trim();

    if (!author) {
      continue;
    }

    const text =
      await extractContentText(
        container,
        author
      );

    if (!text) {
      continue;
    }

    const likes =
      await extractLikes(container);

    results.push({
      index: i,
      author,
      text,
      likes
    });
  }

  if (results.length === 0) {
    throw new Error(
      "Could not extract any Threads content"
    );
  }

  const post =
    results[0];

  const comments =
    results
      .slice(1)
      .map((item) => ({
        author: item.author,
        text: item.text,
        likes: item.likes,
        containerIndex: item.index
      }));

  return {
    url: page.url(),
    author: post.author,
    text: post.text,
    likes: post.likes,
    postContainerIndex: post.index,
    comments
  };
}

async function extractContentText(
  container: ReturnType<Page["locator"]>,
  author: string
): Promise<string> {
  const candidates =
    container.locator(
      '[dir="auto"]'
    );

  const count =
    await candidates.count();

  const texts: string[] = [];

  for (let i = 0; i < count; i++) {
    const candidate =
      candidates.nth(i);

    if (!(await candidate.isVisible())) {
      continue;
    }

    const rawText =
      await candidate.innerText();

    const text =
      normalizeText(rawText);

    if (!text) {
      continue;
    }

    if (text === author) {
      continue;
    }

    if (isUiText(text)) {
      continue;
    }

    texts.push(text);
  }

  return selectContentText(texts);
}

function normalizeText(
  text: string
): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isUiText(
  text: string
): boolean {
  const normalized =
    text.trim();

  if (
    normalized === "Translate" ||
    normalized === "Top" ||
    normalized === "View activity" ||
    normalized === "Author"
  ) {
    return true;
  }

  if (
    /^Reply to\b/i.test(normalized)
  ) {
    return true;
  }

  if (
    /^\d+\s*\/\s*\d+$/.test(normalized)
  ) {
    return true;
  }

  if (
    /^\d+\s*(s|m|h|d|w)$/.test(normalized)
  ) {
    return true;
  }

  if (
    /^\d+(?:[,.]\d+)?[KkMm]?$/.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

function selectContentText(
  texts: string[]
): string {
  const unique =
    [...new Set(texts)];

  const contentTexts: string[] = [];

  for (const text of unique) {
    if (isUiText(text)) {
      continue;
    }

    const cleaned =
      cleanContentText(text);

    if (!cleaned) {
      continue;
    }

    if (isUiText(cleaned)) {
      continue;
    }

    contentTexts.push(cleaned);
  }

  contentTexts.sort(
    (a, b) =>
      b.length - a.length
  );

  const result: string[] = [];

  for (const text of contentTexts) {
    const alreadyIncluded =
      result.some(
        (existing) =>
          existing.includes(text)
      );

    if (!alreadyIncluded) {
      result.push(text);
    }
  }

  return result
    .reverse()
    .join("\n")
    .trim();
}

function cleanContentText(
  text: string
): string {
  let result =
    text;

  // Remove Threads UI.
  result =
    result.replace(
      /\bTranslate\b/gi,
      ""
    );

  result =
    result.replace(
      /\bView activity\b/gi,
      ""
    );

  result =
    result.replace(
      /\bTop\b/g,
      ""
    );

  result =
    result.replace(
      /\bAuthor\b/g,
      ""
    );

  // Remove reply UI.
  result =
    result.replace(
      /\bReply to\b[^\n]*/gi,
      ""
    );

  // Remove pagination.
  // Examples:
  // 1 / 2
  // 2 / 2
  result =
    result.replace(
      /\b\d+\s*\/\s*\d+\b/g,
      ""
    );

  // Remove standalone counters.
  // Examples:
  // 1
  // 45
  // 811
  // 8.4K
  // 1.2M
  result =
    result.replace(
      /(?:^|\n)\s*\d+(?:[,.]\d+)?[KkMm]?\s*(?=\n|$)/g,
      "\n"
    );

  // Remove standalone time values.
  // Examples:
  // 5m
  // 2h
  // 3d
  result =
    result.replace(
      /(?:^|\n)\s*\d+\s*(?:s|m|h|d|w)\s*(?=\n|$)/gi,
      "\n"
    );

  // Convert internet/teen-code laughter
  // to a period.
  //
  // Examples:
  // =))))
  // :))))
  // =)))
  // :)))
  // =))
  // :))
  //
  // Also handles expressions attached
  // directly to a word:
  //
  // r:))))
  // abc=))))
  //
  result =
    result.replace(
      /[=:;]+[-^']?\)+/g,
      "."
    );

  // Remove leftover slash from pagination.
  result =
    result.replace(
      /(?:^|\n)\s*\/\s*(?=\n|$)/g,
      "\n"
    );

  // Clean lines.
  result =
    result
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");

  // Avoid multiple periods.
  result =
    result.replace(
      /\.{2,}/g,
      "."
    );

  // Remove spaces before punctuation.
  result =
    result.replace(
      /\s+([,.!?])/g,
      "$1"
    );

  return result.trim();
}

async function extractLikes(
  container: ReturnType<Page["locator"]>
): Promise<number> {
  const buttons =
    container.locator("button");

  const count =
    await buttons.count();

  for (let i = 0; i < count; i++) {
    const button =
      buttons.nth(i);

    const ariaLabel =
      await button.getAttribute(
        "aria-label"
      );

    if (!ariaLabel) {
      continue;
    }

    const match =
      ariaLabel.match(
        /([\d,.]+)\s*(?:likes?|likes)/i
      );

    if (!match) {
      continue;
    }

    return parseNumber(
      match[1]
    );
  }

  const text =
    await container.innerText();

  const lines =
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  for (const line of lines) {
    const value =
      parseDisplayNumber(line);

    if (value !== null) {
      return value;
    }
  }

  return 0;
}

function parseDisplayNumber(
  value: string
): number | null {
  const normalized =
    value
      .replace(/,/g, "")
      .trim();

  if (
    /^\d+(\.\d+)?[Kk]$/.test(
      normalized
    )
  ) {
    return Math.round(
      Number(
        normalized.slice(0, -1)
      ) * 1000
    );
  }

  if (
    /^\d+(\.\d+)?[Mm]$/.test(
      normalized
    )
  ) {
    return Math.round(
      Number(
        normalized.slice(0, -1)
      ) * 1_000_000
    );
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  return null;
}

function parseNumber(
  value: string
): number {
  const result =
    parseDisplayNumber(value);

  return result ?? 0;
}