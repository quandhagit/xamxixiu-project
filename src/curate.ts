import fs from "node:fs/promises";
import path from "node:path";
import {
  getDeepseek,
  getDeepseekModel
} from "./ai/deepseek.js";
import { isDirectCli } from "./cli.js";
import type { ThreadData } from "./types.js";
import {
  CURATE_KEEP_MAX,
  CURATE_KEEP_MIN
} from "./comments/comment-constants.js";
import {
  CURATION_KINDS,
  applyCuration,
  computeCuratedOrder,
  parseCurationResult
} from "./comments/curate-apply.js";
import { reorderCommentsByOrder } from "./comments/order.js";
import {
  applyImageOrder,
  inverseImageOrder
} from "./comments/apply-image-order.js";

const MAX_COMMENT_CHARS = 500;

const SYSTEM_PROMPT = `
You are a short-form video editor choosing which Threads comments appear in a
Vietnamese reaction video. Each kept comment is read aloud by a voice-over and
shown as a screenshot, so the final cut must flow well.

Select between ${CURATE_KEEP_MIN} and ${CURATE_KEEP_MAX} comments to KEEP
(target about ${Math.round((CURATE_KEEP_MIN + CURATE_KEEP_MAX) / 2)}) and
exclude the rest.

Selection rules:
- The set must read as a smooth story: a clear opener, a build-up, and a
  satisfying last comment.
- Cover different viewpoints; exclude comments that repeat another comment's
  idea (kind "duplicate").
- Exclude off-topic comments (kind "off-topic"), flat or low-effort comments
  with no personality (kind "low-energy"), comments that would be tedious to
  hear read aloud because they are too long (kind "too-long"), and spam, links
  or ads (kind "spam").
- Do NOT choose by like count alone. Funny or sharp comments often have few
  likes.
- A reply only makes sense with its parent comment (see parentCommentIndex).
  If you keep a reply, keep its parent too.
- Comments marked locked "keep" or "exclude" were decided by the user. Do not
  change them, but plan the rest of the selection around them.

Ordering rules:
- Also decide the reading order of the kept comments so the video flows:
  a strong hook first, escalation in the middle, the funniest or most
  satisfying comment last. Related comments should sit next to each other.
- A thread is a top-level comment plus its replies. Replies always stay
  directly after their parent and keep their current order, so only order
  threads: list any comment of a thread (the top-level one is best) at the
  position where that thread should appear.
- Locked comments stay kept or excluded as decided, but they may be moved.

Return JSON only, with exactly this shape:
{
  "keep": [{ "commentIndex": number, "reason": string }],
  "exclude": [{ "commentIndex": number, "reason": string, "kind": ${CURATION_KINDS.map((kind) => `"${kind}"`).join(" | ")} }],
  "order": [number]
}
- commentIndex must be one of the indexes provided.
- Every comment must appear in exactly one of keep or exclude.
- "order" lists the commentIndex of kept comments (or their threads) in the
  final reading order. Do not list excluded comments in it.
- Write each reason in Vietnamese, one short sentence.
`;

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(
      await fs.readFile(file, "utf-8")
    ) as T;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}

async function requestWithRetry(
  prompt: string
): Promise<string> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `DeepSeek request ${attempt}/${maxAttempts}...`
      );

      const response =
        await getDeepseek().chat.completions.create({
          model: getDeepseekModel(),
          messages: [
            {
              role: "system",
              content: "Return only valid JSON."
            },
            { role: "user", content: prompt }
          ]
        });
      const text =
        response.choices[0]?.message.content?.trim();

      if (!text) {
        throw new Error(
          "DeepSeek returned an empty response."
        );
      }

      return text;
    } catch (error) {
      const status =
        error instanceof Error &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : undefined;
      const retryable =
        status === 503 || status === 429 || status === 500;

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      const delay = attempt * 3000;

      console.log(
        `DeepSeek temporarily unavailable. Retrying in ${delay / 1000}s...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, delay)
      );
    }
  }

  throw new Error("DeepSeek request failed after retries.");
}

export async function runCurate(
  projectDir: string
): Promise<void> {
  const contentPath = path.join(projectDir, "content.json");
  const threadPath = path.join(projectDir, "thread.json");
  const content =
    (await readJson<ThreadData>(contentPath)) ??
    (await readJson<ThreadData>(threadPath));

  if (!content) {
    throw new Error(
      `No content.json or thread.json in ${projectDir}`
    );
  }

  if (content.comments.length < 2) {
    console.log("Fewer than 2 comments; nothing to curate.");
    return;
  }

  const prompt = `
${SYSTEM_PROMPT}

POST:
${JSON.stringify(
    {
      author: content.author,
      text: content.text.slice(0, MAX_COMMENT_CHARS * 2)
    },
    null,
    2
  )}

COMMENTS:
${JSON.stringify(
    content.comments.map((comment, index) => ({
      commentIndex: index,
      author: comment.author,
      text: comment.text.slice(0, MAX_COMMENT_CHARS),
      textLength: comment.text.length,
      likes: comment.likes,
      ...(comment.parentCommentIndex !== undefined
        ? { parentCommentIndex: comment.parentCommentIndex }
        : {}),
      ...(comment.curation?.source === "user"
        ? { locked: comment.excluded ? "exclude" : "keep" }
        : {})
    })),
    null,
    2
  )}
`;

  const text = await requestWithRetry(prompt);
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let raw: unknown;

  try {
    raw = JSON.parse(cleaned);
  } catch {
    console.error("DeepSeek returned invalid JSON:");
    console.error(text);
    throw new Error(
      "Failed to parse DeepSeek response as JSON."
    );
  }

  const result = parseCurationResult(
    raw,
    content.comments.length
  );
  const applied = applyCuration(content, result);
  const order = computeCuratedOrder(
    applied.content.comments,
    result.order
  );
  const moved = order.some(
    (oldIndex, newIndex) => oldIndex !== newIndex
  );
  const next: ThreadData = moved
    ? {
        ...applied.content,
        comments: reorderCommentsByOrder(
          applied.content.comments,
          order
        )
      }
    : applied.content;

  if (moved) {
    // Renames comment-N.png / comment-N.mp3 and remaps analysis,
    // reactions and audio failures to the new positions.
    await applyImageOrder(
      projectDir,
      order,
      content.comments.length
    );
  }

  try {
    await fs.writeFile(
      contentPath,
      JSON.stringify(next, null, 2),
      "utf-8"
    );
  } catch (error: unknown) {
    if (moved) {
      await applyImageOrder(
        projectDir,
        inverseImageOrder(order),
        content.comments.length
      );
    }

    throw error;
  }

  console.log("");
  console.log("Curation complete.");
  console.log(
    `Kept: ${applied.summary.kept}, excluded: ${applied.summary.excluded}, reordered: ${moved ? "yes" : "no"}`
  );
}

async function main(): Promise<void> {
  const projectDir = process.argv[2];

  if (!projectDir) {
    throw new Error("Usage: yarn curate <project-directory>");
  }

  await runCurate(projectDir);
}

if (isDirectCli(import.meta.url)) {
  await main();
}
