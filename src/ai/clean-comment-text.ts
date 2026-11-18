import {
  cleanSpeechText,
  diffCleanedSpeechText,
  needsAiSpeechCleanup,
  type SpeechTextDiff
} from "../comments/clean-speech-text.js";
import { generateJsonWithRetry, parseModelJson } from "./json.js";

export interface CleanCommentTextInput {
  texts: string[];
}

export async function suggestCleanCommentText(
  input: CleanCommentTextInput
): Promise<SpeechTextDiff[]> {
  const ruleDiffs = diffCleanedSpeechText(
    input.texts.map((text) => ({ text }))
  );
  const afterRule = input.texts.map((text, index) => {
    const diff = ruleDiffs.find((item) => item.index === index);
    return diff?.after ?? text;
  });
  const aiIndexes = afterRule
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => needsAiSpeechCleanup(text))
    .map(({ index }) => index);

  if (aiIndexes.length === 0) {
    return ruleDiffs;
  }

  const prompt = `
You clean Vietnamese social-media comments so they can be read aloud by TTS.

Rules:
- Remove emojis, icons, and decorative symbols.
- Remove elongated letters and punctuation (đcoooo → được, ???? → ?).
- Expand slang only when it would be misread; keep meaning.
- Do not add new opinions. Keep the speaker's intent.
- Return JSON: { "items": [{ "index": 0, "text": "cleaned" }] }
- Only include indexes that still need changes.

Comments:
${JSON.stringify(
    aiIndexes.map((index) => ({
      index,
      text: afterRule[index]
    })),
    null,
    2
  )}
`;

  const parsed = parseModelJson<{
    items?: Array<{ index: number; text: string }>;
  }>(await generateJsonWithRetry(prompt));

  const merged = new Map(ruleDiffs.map((diff) => [diff.index, diff]));
  for (const item of parsed.items ?? []) {
    if (
      typeof item.index !== "number" ||
      typeof item.text !== "string" ||
      !aiIndexes.includes(item.index)
    ) {
      continue;
    }
    const before = input.texts[item.index];
    const after = cleanSpeechText(item.text);
    if (!before || after === before) {
      continue;
    }
    merged.set(item.index, {
      index: item.index,
      before,
      after
    });
  }
  return [...merged.values()].sort((left, right) => left.index - right.index);
}
