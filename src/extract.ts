import type { Locator, Page } from "playwright";
import type {
  ThreadComment,
  ThreadData
} from "./types.js";

export type ExtractedComment = ThreadComment;
export type ExtractedThread = ThreadData;

export interface ProfileLinkSnapshot {
  href: string;
  text: string;
}

export interface PressableCardSnapshot {
  index: number;
  profileLinks: ProfileLinkSnapshot[];
  dirAutoTexts: string[];
  buttonAriaLabels: string[];
  innerText: string;
  selfLeft: number;
  levels: Array<Array<{ index: number; left: number }>>;
}

export interface ParsedPressableComment {
  author: string;
  text: string;
  likes: number;
}

/**
 * The thread column. The right rail (Quotes excerpts, follow
 * suggestions) also uses pressable cards and must not be captured.
 */
export const THREAD_COLUMN_SELECTOR =
  '[aria-label="Column body"]';

/**
 * Opening post and comments: pressable cards inside the thread
 * column, excluding a quoted post nested inside a comment.
 */
export const PRESSABLE_SELECTOR =
  `${THREAD_COLUMN_SELECTOR} [data-pressable-container="true"]:not([data-pressable-container="true"] [data-pressable-container="true"])`;

export async function extractThread(
  page: Page
): Promise<ExtractedThread> {
  const cards = await snapshotPressableCards(page);

  console.log(
    `Found ${cards.length} pressable containers`
  );

  if (cards.length === 0) {
    throw new Error(
      "Could not find any Threads containers"
    );
  }

  const results: Array<{
    index: number;
    author: string;
    text: string;
    likes: number;
    parentContainerIndex?: number;
  }> = [];

  for (const card of cards) {
    const content = parsePressableComment(card);

    if (!content) {
      continue;
    }

    const parentContainerIndex =
      parentIndexFromSnapshot(card);

    results.push({
      index: card.index,
      author: content.author,
      text: content.text,
      likes: content.likes,
      ...(parentContainerIndex !== undefined
        ? { parentContainerIndex }
        : {})
    });
  }

  if (results.length === 0) {
    throw new Error(
      "Could not extract any Threads content"
    );
  }

  const post =
    results[0];

  const comments: ThreadComment[] =
    results
      .slice(1)
      .map((item, commentIndex) => ({
        author: item.author,
        text: item.text,
        likes: item.likes,
        containerIndex: item.index,
        commentIndex
      }));

  const containerToCommentIndex = new Map(
    comments.map((comment, index) => [
      comment.containerIndex,
      index
    ])
  );

  results.slice(1).forEach((item, index) => {
    const comment = comments[index];
    const parentContainerIndex =
      item.parentContainerIndex;
    const parentFromDom =
      parentContainerIndex !== undefined
        ? containerToCommentIndex.get(
          parentContainerIndex
        )
        : undefined;

    if (
      parentFromDom !== undefined &&
      parentFromDom !== index
    ) {
      comment.parentCommentIndex = parentFromDom;
    }
  });

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
      {
        ...comment,
        replies: undefined
      }
    ];
  }

  return {
    url: page.url(),
    author: post.author,
    text: post.text,
    likes: post.likes,
    postContainerIndex: post.index,
    comments
  };
}

export async function extractPressableComment(
  page: Page,
  containerIndex: number
): Promise<ParsedPressableComment | undefined> {
  const cards = await snapshotPressableCards(page);
  const card = cards.find(
    (item) => item.index === containerIndex
  );

  if (!card) {
    return undefined;
  }

  return parsePressableComment(card);
}

export async function readPressableComment(
  container: Locator
): Promise<ParsedPressableComment | undefined> {
  const snapshot = await snapshotPressableCard(container);
  return snapshot
    ? parsePressableComment(snapshot)
    : undefined;
}

const REPLY_INDENT_PX = 16;

/**
 * Parent of a reply is the closest earlier card in the nearest
 * ancestor that is indented less than this card. Sibling replies
 * share a left edge, so they are not each other's parent. The
 * opening post is container 0 and is not a comment parent.
 */
export function chooseParentIndex(
  selfIndex: number,
  selfLeft: number,
  levels: Array<Array<{ index: number; left: number }>>
): number | undefined {
  for (const members of levels) {
    const ordered = members
      .slice()
      .sort((a, b) => a.index - b.index);
    let parentIndex: number | undefined;

    for (const member of ordered) {
      if (member.index >= selfIndex) {
        break;
      }

      if (member.left < selfLeft - REPLY_INDENT_PX) {
        parentIndex = member.index;
      }
    }

    if (parentIndex === undefined) {
      continue;
    }

    return parentIndex > 0 ? parentIndex : undefined;
  }

  return undefined;
}

export function parentIndexFromSnapshot(
  snapshot: PressableCardSnapshot
): number | undefined {
  return chooseParentIndex(
    snapshot.index,
    snapshot.selfLeft,
    snapshot.levels
  );
}

export async function extractParentContainerIndex(
  container: Locator,
  selector: string
): Promise<number | undefined> {
  const snapshot = await snapshotPressableCard(
    container,
    selector
  );

  if (!snapshot) {
    return undefined;
  }

  return parentIndexFromSnapshot(snapshot);
}

export async function snapshotPressableCards(
  page: Page
): Promise<PressableCardSnapshot[]> {
  return page.evaluate(
    (pressableSelector) => {
      const all = Array.from(
        document.querySelectorAll(pressableSelector)
      );

      const isVisible = (node: Element): boolean => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }

        const style = window.getComputedStyle(node);

        if (
          style.display === "none" ||
          style.visibility === "hidden"
        ) {
          return false;
        }

        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      return all.map((element, index) => {
        const profileLinks = Array.from(
          element.querySelectorAll(
            'a[role="link"][href^="/@"]'
          )
        ).map((link) => ({
          href: link.getAttribute("href") ?? "",
          text: (link as HTMLElement).innerText ?? ""
        }));

        const dirAutoTexts = Array.from(
          element.querySelectorAll('[dir="auto"]')
        )
          .filter((node) => isVisible(node))
          .map(
            (node) => (node as HTMLElement).innerText ?? ""
          );

        const buttonAriaLabels = Array.from(
          element.querySelectorAll("button")
        )
          .map(
            (button) => button.getAttribute("aria-label") ?? ""
          )
          .filter(Boolean);

        const levels: Array<
          Array<{ index: number; left: number }>
        > = [];
        let node = element.parentElement;

        for (
          let depth = 0;
          depth < 8 && node;
          depth += 1
        ) {
          const members: Array<{
            index: number;
            left: number;
          }> = [];
          const found = node.querySelectorAll(
            pressableSelector
          );

          for (let i = 0; i < found.length; i += 1) {
            const memberIndex = all.indexOf(found[i]);

            if (memberIndex < 0) {
              continue;
            }

            members.push({
              index: memberIndex,
              left: found[i].getBoundingClientRect().left
            });
          }

          levels.push(members);
          node = node.parentElement;
        }

        return {
          index,
          profileLinks,
          dirAutoTexts,
          buttonAriaLabels,
          innerText:
            (element as HTMLElement).innerText ?? "",
          selfLeft: element.getBoundingClientRect().left,
          levels
        };
      });
    },
    PRESSABLE_SELECTOR
  );
}

async function snapshotPressableCard(
  container: Locator,
  selector = PRESSABLE_SELECTOR
): Promise<PressableCardSnapshot | undefined> {
  const index = await container.evaluate(
    (element, pressableSelector) => Array.from(
      document.querySelectorAll(pressableSelector)
    ).indexOf(element),
    selector
  );

  if (index < 0) {
    return undefined;
  }

  const cards = await snapshotPressableCards(
    container.page()
  );
  return cards.find((card) => card.index === index);
}

export function parsePressableComment(
  snapshot: PressableCardSnapshot
): ParsedPressableComment | undefined {
  const author = authorFromSnapshot(snapshot);

  if (!author) {
    return undefined;
  }

  const text = contentTextFromSnapshot(
    snapshot,
    author
  );

  if (!text) {
    return undefined;
  }

  return {
    author,
    text,
    likes: likesFromSnapshot(snapshot)
  };
}

function authorFromSnapshot(
  snapshot: PressableCardSnapshot
): string {
  for (const link of snapshot.profileLinks) {
    // Avatar links share this href but have no text. The
    // timestamp link points at /post/ and must not win.
    if (!/^\/@[^/]+\/?$/.test(link.href)) {
      continue;
    }

    const text =
      link.text
        .trim()
        .split("\n")[0]
        ?.trim() ?? "";

    if (!text) {
      continue;
    }

    return text;
  }

  return "";
}

function contentTextFromSnapshot(
  snapshot: PressableCardSnapshot,
  author: string
): string {
  const texts: string[] = [];

  for (const rawText of snapshot.dirAutoTexts) {
    const text = normalizeText(rawText);

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

function likesFromSnapshot(
  snapshot: PressableCardSnapshot
): number {
  for (const ariaLabel of snapshot.buttonAriaLabels) {
    const match = ariaLabel.match(
      /([\d,.]+)\s*(?:likes?|likes)/i
    );

    if (!match) {
      continue;
    }

    return parseNumber(match[1]);
  }

  const lines = snapshot.innerText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const value = parseDisplayNumber(line);

    if (value !== null) {
      return value;
    }
  }

  return 0;
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
