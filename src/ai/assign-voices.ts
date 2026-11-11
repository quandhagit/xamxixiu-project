import fs from "node:fs/promises";
import path from "node:path";
import { VOICE_POOL } from "../tts/voice-pool.js";
import type {
  ReactionEvent,
  ThreadAnalysis,
  ThreadData
} from "../types.js";
import { generateJsonWithRetry, parseModelJson } from "./json.js";

const VOICE_OPTIONS = VOICE_POOL.map((voice) => ({
  id: voice.id,
  gender: voice.gender,
  style: voice.style
}));

export async function assignVoices(
  projectDir: string,
  existing?: ThreadAnalysis
): Promise<Partial<ThreadAnalysis>> {
  const content = await readThread(projectDir);
  const included = content.comments
    .map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => !comment.excluded);

  const prompt = `
Assign TTS voices and classify the overall tone of this Threads post.

Return JSON:
{
  "topicVoiceId": "id",
  "topicTitleVoiceId": "id",
  "tone": "serious | sarcastic | casual | dramatic | humorous",
  "topicType": "social | relationship | work | technology | news | entertainment | other",
  "intensity": 0.0,
  "reactions": [{ "commentIndex": 0, "voiceId": "id", "emotion": "neutral" }]
}

VOICE POOL:
${JSON.stringify(VOICE_OPTIONS, null, 2)}

Copy voiceId exactly. Emotion is the speaking/editing feeling.

Post author: ${content.author}
Post: ${content.text}

Comments:
${included.map(({ comment, index }) => `
Comment ${index}: ${comment.text}
`).join("\n")}
`;

  const parsed = parseModelJson<{
    topicVoiceId?: string;
    topicTitleVoiceId?: string;
    tone?: ThreadAnalysis["tone"];
    topicType?: ThreadAnalysis["topicType"];
    intensity?: number;
    reactions?: Array<{
      commentIndex: number;
      voiceId?: string;
      emotion?: ReactionEvent["emotion"];
    }>;
  }>(await generateJsonWithRetry(prompt));

  const voiceIds = new Set(VOICE_POOL.map((voice) => voice.id));
  const pickVoice = (id: string | undefined, fallback: string): string =>
    id && voiceIds.has(id) ? id : fallback;

  const reactionsByIndex = new Map(
    (existing?.reactions ?? []).map((reaction) => [
      reaction.commentIndex,
      reaction
    ])
  );

  for (const item of parsed.reactions ?? []) {
    const current = reactionsByIndex.get(item.commentIndex) ?? {
      commentIndex: item.commentIndex,
      emotion: "neutral" as const,
      memeCategory: null,
      sfxCategory: null,
      memeAssetId: null,
      sfxAssetId: null,
      animation: "none" as const,
      duration: 1
    };
    reactionsByIndex.set(item.commentIndex, {
      ...current,
      voiceId: pickVoice(item.voiceId, current.voiceId ?? VOICE_POOL[0]?.id ?? "ngoc-huyen"),
      emotion: item.emotion ?? current.emotion
    });
  }

  return {
    topicVoiceId: pickVoice(parsed.topicVoiceId, existing?.topicVoiceId ?? "ngoc-huyen"),
    topicTitleVoiceId: pickVoice(
      parsed.topicTitleVoiceId,
      existing?.topicTitleVoiceId ?? "ngoc-huyen"
    ),
    tone: parsed.tone ?? existing?.tone ?? "casual",
    topicType: parsed.topicType ?? existing?.topicType ?? "other",
    intensity: typeof parsed.intensity === "number"
      ? parsed.intensity
      : existing?.intensity ?? 0.5,
    reactions: [...reactionsByIndex.values()].sort(
      (left, right) => left.commentIndex - right.commentIndex
    )
  };
}

async function readThread(projectDir: string): Promise<ThreadData> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(projectDir, "content.json"), "utf-8")
    ) as ThreadData;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return JSON.parse(
        await fs.readFile(path.join(projectDir, "thread.json"), "utf-8")
      ) as ThreadData;
    }
    throw error;
  }
}
