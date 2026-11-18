export async function computeWaveformPeaks(
  url: string,
  buckets = 120
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
