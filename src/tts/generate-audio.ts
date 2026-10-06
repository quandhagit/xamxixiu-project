import fs from "node:fs/promises";
import path from "node:path";

import {
  VbeeTTS
} from "./vbee.js";

import {
  VOICE_POOL
} from "./voice-pool.js";

import type {
  Voice
} from "./types.js";
import type {
  AudioFailure,
  AudioFailureTarget,
  ThreadData
} from "../types.js";
import type {
  ThreadAnalysis
} from "../types.js";

function pickVoice(index: number): Voice {
  if (VOICE_POOL.length === 0) {
    throw new Error(
      "VOICE_POOL is empty"
    );
  }

  return VOICE_POOL[
    index % VOICE_POOL.length
  ];
}

function findVoice(
  voiceId: string | undefined,
  fallbackIndex: number
): Voice {
  if (voiceId) {
    const voice = VOICE_POOL.find(
      (item) => item.id === voiceId
    );

    if (voice) {
      return voice;
    }
  }

  return pickVoice(fallbackIndex);
}

function isAudioFailureTarget(
  value: string | undefined
): value is AudioFailureTarget {
  return (
    value === "topic" ||
    /^comment-\d+$/.test(value ?? "")
  );
}

async function readThread(
  projectDir: string
): Promise<ThreadData> {
  const threadPath =
    path.join(
      projectDir,
      "thread.json"
    );
  const contentPath =
    path.join(
      projectDir,
      "content.json"
    );

  let raw: string;
  try {
    raw = await fs.readFile(
      contentPath,
      "utf-8"
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      raw = await fs.readFile(
        threadPath,
        "utf-8"
      );
    } else {
      throw error;
    }
  }

  return JSON.parse(raw) as ThreadData;
}

async function readAnalysis(
  projectDir: string
): Promise<ThreadAnalysis | null> {
  const analysisPath = path.join(
    projectDir,
    "analysis.json"
  );

  try {
    const raw = await fs.readFile(
      analysisPath,
      "utf-8"
    );

    return JSON.parse(raw) as ThreadAnalysis;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function generateAudio(
  projectDir: string,
  onlyTarget?: AudioFailureTarget
): Promise<void> {
  const thread =
    await readThread(projectDir);
  const analysis =
    await readAnalysis(projectDir);

  const audioDir =
    path.join(
      projectDir,
      "audio"
    );

  await fs.mkdir(
    audioDir,
    {
      recursive: true
    }
  );

  const tts =
    new VbeeTTS();
  const failuresPath =
    path.join(
      projectDir,
      "audio-failures.json"
    );
  let failures: AudioFailure[] = [];

  try {
    const rawFailures =
      await fs.readFile(
        failuresPath,
        "utf-8"
      );
    failures =
      JSON.parse(rawFailures) as AudioFailure[];
  } catch (error: unknown) {
    if (
      !(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )
    ) {
      throw error;
    }
  }

  const clearFailure = (
    target: AudioFailureTarget
  ): void => {
    failures = failures.filter(
      (failure) => failure.target !== target
    );
  };

  const recordFailure = (
    target: AudioFailureTarget,
    error: unknown
  ): void => {
    const message =
      error instanceof Error
        ? error.message
        : String(error);
    failures = [
      ...failures.filter(
        (failure) => failure.target !== target
      ),
      {
        target,
        message
      }
    ];
    console.error(
      `✗ ${target}: ${message}`
    );
  };

  const saveFailures = async (): Promise<void> => {
    await fs.writeFile(
      failuresPath,
      JSON.stringify(failures, null, 2),
      "utf-8"
    );
  };

  // ==========================================
  // TOPIC
  // ==========================================

  const topicVoice =
    findVoice(
      analysis?.topicVoiceId,
      0
    );

  const topicOutput =
    path.join(
      audioDir,
      "topic.mp3"
    );

  if (!onlyTarget || onlyTarget === "topic") {
    console.log(
      `Generating topic audio...`
    );

    try {
      await tts.synthesize({
        text: thread.text,
        voice: topicVoice,
        outputFile: topicOutput
      });
      clearFailure("topic");
      console.log(
        `✓ topic.mp3`
      );
    } catch (error: unknown) {
      recordFailure("topic", error);
    }
  }

  // ==========================================
  // COMMENTS
  // ==========================================

  for (let i = 0; i < thread.comments.length; i++) {
    const target: AudioFailureTarget =
      `comment-${i}`;
    if (onlyTarget && onlyTarget !== target) {
      continue;
    }

    const comment = thread.comments[i];

    const reaction =
      analysis?.reactions.find(
        (item) =>
          item.commentIndex === i
      );

    const voice =
      findVoice(
        reaction?.voiceId,
        i + 1
      );

    const outputFile =
      path.join(
        audioDir,
        `comment-${i}.mp3`
      );

    console.log(
      `Generating comment-${i}.mp3...`
    );

    try {
      await tts.synthesize({
        text: comment.text,
        voice,
        outputFile
      });
      clearFailure(target);
      console.log(
        `✓ comment-${i}.mp3`
      );
    } catch (error: unknown) {
      recordFailure(target, error);
    }
  }

  await saveFailures();
  console.log("");
  console.log(
    `Audio generated: ${audioDir}`
  );
  if (failures.length > 0) {
    console.log(
      `Failed audio items: ${failures.length}`
    );
  }
}

// ==========================================
// CLI
// ==========================================

const projectDir =
  process.argv[2];
const targetArgument =
  process.argv[3];
const onlyTarget =
  isAudioFailureTarget(targetArgument)
    ? targetArgument
    : undefined;

if (!projectDir) {
  throw new Error(
    "Usage: yarn generate-audio <project-dir>"
  );
}

await generateAudio(
  projectDir,
  onlyTarget
);