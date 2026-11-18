import {
  cloneTimelineProject,
  recomputeTotalDuration,
  roundTime,
  type TimelineProject
} from "./project.js";

export const DEFAULT_BEEP_DURATION = 0.18;

export function addBeepClip(
  project: TimelineProject,
  start: number,
  duration = DEFAULT_BEEP_DURATION,
  file = "audio/beep.wav"
): TimelineProject {
  const next = cloneTimelineProject(project);
  const id = `beep-${Math.round(start * 1000)}`;
  if (next.clips.some((clip) => clip.id === id)) {
    return project;
  }
  next.clips.push({
    id,
    trackId: "beep",
    start: roundTime(Math.max(0, start)),
    duration: roundTime(Math.max(0.05, duration)),
    trimIn: 0,
    sourceDuration: duration,
    file,
    fadeIn: 0.01,
    fadeOut: 0.01,
    volume: 1,
    locked: false,
    label: "Beep",
    kind: "audio"
  });
  return recomputeTotalDuration(next);
}

export function removeClip(
  project: TimelineProject,
  clipId: string
): TimelineProject {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  return recomputeTotalDuration({
    ...project,
    clips: project.clips.filter((item) => item.id !== clipId)
  });
}

/** 16-bit PCM WAV, 0.18s 1000Hz beep. */
export function createBeepWav(
  duration = DEFAULT_BEEP_DURATION,
  frequency = 1000,
  sampleRate = 44100
): Buffer {
  const samples = Math.max(1, Math.floor(duration * sampleRate));
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + samples * 2, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    const t = index / sampleRate;
    const envelope = t < 0.01
      ? t / 0.01
      : t > duration - 0.01
        ? Math.max(0, (duration - t) / 0.01)
        : 1;
    const sample = Math.round(
      Math.sin(2 * Math.PI * frequency * t) * 0.35 * envelope * 32767
    );
    data.writeInt16LE(sample, 44 + index * 2);
  }
  return data;
}
