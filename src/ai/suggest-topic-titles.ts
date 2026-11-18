import { TOPIC_TITLE_MAX_LENGTH } from "../timeline/topic-constants.js";
import { generateJsonWithRetry, parseModelJson } from "./json.js";

export async function suggestTopicTitles(input: {
  author: string;
  text: string;
  comments: string[];
}): Promise<string[]> {
  const prompt = `
Create 5 short Vietnamese topic titles for a Threads video.

Rules:
- Vietnamese, concise, no hashtags, no quotes.
- Each title <= ${TOPIC_TITLE_MAX_LENGTH} characters.
- Summarize the post, not a single comment.
- Return JSON: { "titles": ["...", "..."] }

Author: ${input.author}
Post: ${input.text}

Comments:
${input.comments.slice(0, 12).map((text, index) => `${index}. ${text}`).join("\n")}
`;
  const parsed = parseModelJson<{ titles?: string[] }>(
    await generateJsonWithRetry(prompt)
  );
  const unique = new Set<string>();
  for (const title of parsed.titles ?? []) {
    const cleaned = title.trim().slice(0, TOPIC_TITLE_MAX_LENGTH);
    if (cleaned) {
      unique.add(cleaned);
    }
  }
  return [...unique].slice(0, 5);
}
