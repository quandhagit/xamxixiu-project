import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseFile } from "music-metadata";
import { resolveFfprobePath } from "./binaries.js";

const execFileAsync = promisify(execFile);

interface ProbeResult {
  format?: {
    duration?: string | number;
  };
  streams?: Array<{
    duration?: string | number;
  }>;
}

export async function readMediaDuration(
  file: string
): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      resolveFfprobePath(),
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        file
      ],
      {
        maxBuffer: 4 * 1024 * 1024
      }
    );
    const probe = JSON.parse(stdout) as ProbeResult;
    const rawDuration =
      probe.format?.duration ??
      probe.streams?.find(
        (stream) => stream.duration !== undefined
      )?.duration;
    const duration = Number(rawDuration);

    if (Number.isFinite(duration) && duration > 0) {
      return duration;
    }
  } catch {
    // Fall back below for environments without ffprobe.
  }

  const metadata = await parseFile(file);
  const duration = metadata.format.duration;
  if (!duration || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      `Could not read a valid media duration: ${file}`
    );
  }
  return duration;
}
