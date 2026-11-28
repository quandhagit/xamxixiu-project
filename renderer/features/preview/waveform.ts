export const WAVEFORM_BAR_PITCH_PX = 2;

export function waveformBarCount(
  widthPx: number,
  pitchPx = WAVEFORM_BAR_PITCH_PX
): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0 || pitchPx <= 0) {
    return 0;
  }
  return Math.max(1, Math.floor(widthPx / pitchPx));
}

export function sampleWaveformPeaks(
  peaks: number[],
  count: number
): number[] {
  if (peaks.length === 0 || count <= 0) {
    return [];
  }
  const bars = Math.min(count, peaks.length);
  if (bars === peaks.length) {
    return peaks.slice();
  }
  const sampled: number[] = [];
  for (let index = 0; index < bars; index += 1) {
    const start = Math.floor((index * peaks.length) / bars);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) * peaks.length) / bars)
    );
    let peak = 0;
    for (let sample = start; sample < end && sample < peaks.length; sample += 1) {
      peak = Math.max(peak, peaks[sample] ?? 0);
    }
    sampled.push(peak);
  }
  return sampled;
}

export function waveformBarHeightPercent(peak: number): number {
  const value = Number.isFinite(peak) ? Math.max(0, Math.min(1, peak)) : 0;
  return 14 + value * 82;
}

export async function computeWaveformPeaks(
  url: string,
  buckets = 240
): Promise<number[]> {
  if (!url || typeof AudioContext === "undefined") {
    return [];
  }
  const context = new AudioContext();
  try {
    const response = await fetch(url);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const data = buffer.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / buckets));
    const peaks: number[] = [];
    for (let index = 0; index < buckets; index += 1) {
      let sum = 0;
      const start = index * size;
      for (let sample = start; sample < start + size && sample < data.length; sample += 1) {
        sum += Math.abs(data[sample] ?? 0);
      }
      peaks.push(sum / size);
    }
    const max = Math.max(...peaks, 0.0001);
    return peaks.map((value) => value / max);
  } catch {
    return [];
  } finally {
    void context.close();
  }
}
