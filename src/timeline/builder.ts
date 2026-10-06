import fs from "node:fs/promises";
import path from "node:path";
import { parseFile } from "music-metadata";

import type {
  ThreadData,
  TimelineOverlay,
  TimelineScene,
  VideoTimeline
} from "../types.js";
import type { MatchedReaction } from "../assets/matcher.js";

const CANVAS = {
  width: 1080,
  height: 1920,
  fps: 30
} as const;

interface ProjectInputs {
  thread: ThreadData;
  reactions: MatchedReaction[];
}

function projectPath(file: string): string {
  return file.replaceAll("\\", "/");
}

function resolveProjectFile(
  projectDir: string,
  relativeFile: string
): string {
  return path.resolve(projectDir, relativeFile);
}

function timelineFile(
  file: string
): string {
  return projectPath(
    path.relative(process.cwd(), path.resolve(file))
  );
}

async function readJson<T>(
  file: string
): Promise<T> {
  const content = await fs.readFile(file, "utf-8");
  return JSON.parse(content) as T;
}

async function assertFile(
  file: string,
  description: string
): Promise<void> {
  try {
    await fs.access(file);
  } catch {
    throw new Error(
      `${description} not found: ${file}`
    );
  }
}

async function readAudioDuration(
  file: string
): Promise<number> {
  const metadata = await parseFile(file);
  const duration = metadata.format.duration;

  if (!duration || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      `Could not read a valid audio duration: ${file}`
    );
  }

  return duration;
}

function createOverlay(
  type: "meme" | "sfx",
  file: string,
  sceneDuration: number,
  duration: number,
  animation?: TimelineScene["overlays"][number]["animation"]
): TimelineOverlay {
  const overlayDuration = Math.min(
    Math.max(duration, 0),
    sceneDuration
  );

  return {
    type,
    file,
    start: Math.max(
      0,
      sceneDuration - overlayDuration
    ),
    duration: overlayDuration,
    ...(animation ? { animation } : {})
  };
}

function createScene(
  id: string,
  commentIndex: number | null,
  imageFile: string,
  audioFile: string,
  audioDuration: number,
  overlays: TimelineOverlay[]
): TimelineScene {
  return {
    id,
    commentIndex,
    imageFile,
    imageStart: 0,
    imageDuration: audioDuration,
    audioFile,
    audioStart: 0,
    audioDuration,
    overlays
  };
}

async function createCommentScene(
  projectDir: string,
  commentIndex: number,
  reaction: MatchedReaction | undefined
): Promise<TimelineScene> {
  const imageAbsolute = path.join(
    projectDir,
    "processed",
    `comment-${String(commentIndex + 1).padStart(2, "0")}.png`
  );
  const audioAbsolute = path.join(
    projectDir,
    "audio",
    `comment-${commentIndex}.mp3`
  );

  await assertFile(
    imageAbsolute,
    `Processed comment image ${commentIndex}`
  );
  await assertFile(
    audioAbsolute,
    `Comment audio ${commentIndex}`
  );

  const audioDuration =
    await readAudioDuration(audioAbsolute);
  const overlays: TimelineOverlay[] = [];

  if (reaction?.meme) {
    const memeAbsolute = path.resolve(
      reaction.meme.file
    );
    await assertFile(
      memeAbsolute,
      `Meme asset ${reaction.meme.id}`
    );
    overlays.push(
      createOverlay(
        "meme",
        projectPath(reaction.meme.file),
        audioDuration,
        reaction.duration,
        reaction.animation
      )
    );
  }

  if (reaction?.sfx) {
    const sfxAbsolute = path.resolve(
      reaction.sfx.file
    );
    await assertFile(
      sfxAbsolute,
      `SFX asset ${reaction.sfx.id}`
    );
    overlays.push(
      createOverlay(
        "sfx",
        projectPath(reaction.sfx.file),
        audioDuration,
        reaction.duration
      )
    );
  }

  return createScene(
    `comment-${commentIndex}`,
    commentIndex,
    timelineFile(imageAbsolute),
    timelineFile(audioAbsolute),
    audioDuration,
    overlays
  );
}

export async function buildTimeline(
  projectDir: string
): Promise<VideoTimeline> {
  const threadPath = path.join(
    projectDir,
    "thread.json"
  );
  const reactionsPath = path.join(
    projectDir,
    "reactions.json"
  );

  const inputs: ProjectInputs = {
    thread: await readJson<ThreadData>(
      threadPath
    ),
    reactions: await readJson<MatchedReaction[]>(
      reactionsPath
    )
  };

  const topicImage = path.join(
    projectDir,
    "processed",
    "topic.png"
  );
  const topicAudio = path.join(
    projectDir,
    "audio",
    "topic.mp3"
  );

  await assertFile(
    topicImage,
    "Processed topic image"
  );
  await assertFile(
    topicAudio,
    "Topic audio"
  );

  const topicDuration =
    await readAudioDuration(topicAudio);
  const scenes: TimelineScene[] = [
    createScene(
      "topic",
      null,
      timelineFile(topicImage),
      timelineFile(topicAudio),
      topicDuration,
      []
    )
  ];

  for (
    let i = 0;
    i < inputs.thread.comments.length;
    i++
  ) {
    const reaction = inputs.reactions.find(
      (item) => item.commentIndex === i
    );
    scenes.push(
      await createCommentScene(
        projectDir,
        i,
        reaction
      )
    );
  }

  const totalDuration = scenes.reduce(
    (total, scene) =>
      total + scene.audioDuration,
    0
  );

  return {
    version: 1,
    canvas: CANVAS,
    totalDuration,
    scenes
  };
}
