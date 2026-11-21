import fs from "node:fs/promises";
import path from "node:path";
import type { ExportProgress } from "../electron/ipc-types.js";
import { exportTimelineVideo } from "../export/video-exporter.js";
import type { TimelineProject } from "../timeline/project.js";
import { compileTimelineProject } from "./compile.js";
import { getExportEngine } from "./engine.js";

export async function writeHyperframesProject(
  projectDirectory: string,
  timelineProject: TimelineProject
): Promise<string> {
  const outputDir = path.join(projectDirectory, "hyperframes");
  await fs.mkdir(outputDir, { recursive: true });
  const html = compileTimelineProject(timelineProject, {
    resolveSrc: (file) => {
      if (path.isAbsolute(file) || file.startsWith("data:")) {
        return file.replaceAll("\\", "/");
      }
      return path
        .relative(outputDir, path.join(projectDirectory, file))
        .replaceAll("\\", "/");
    }
  });
  const entry = path.join(outputDir, "index.html");
  await fs.writeFile(entry, html, "utf-8");
  return outputDir;
}

export async function exportWithHyperframes(
  projectDirectory: string,
  timelineProject: TimelineProject,
  outputPath: string,
  onProgress?: (progress: ExportProgress) => void
): Promise<string> {
  const engine = getExportEngine();
  if (engine === "ffmpeg") {
    return exportTimelineVideo(projectDirectory, outputPath, onProgress);
  }

  onProgress?.({ phase: "preparing", percent: 2 });
  const projectDir = await writeHyperframesProject(
    projectDirectory,
    timelineProject
  );

  try {
    const producer = await import("@hyperframes/producer").catch(() => null);
    if (producer && "executeRenderJob" in producer) {
      const job = producer.createRenderJob({
        fps: timelineProject.canvas.fps,
        quality: "standard",
        format: "mp4"
      });
      await producer.executeRenderJob(
        job,
        projectDir,
        outputPath,
        (current: { progress?: number }, message: string) => {
          onProgress?.({
            phase: "rendering",
            percent: Math.max(3, Math.round(current.progress ?? 0)),
            time: undefined,
            duration: timelineProject.totalDuration
          });
          if (message) {
            console.log(message);
          }
        }
      );
      onProgress?.({ phase: "done", percent: 100 });
      return outputPath;
    }
  } catch (error) {
    console.warn("Hyperframes producer failed, falling back to ffmpeg.", error);
  }

  console.warn("Hyperframes render unavailable; falling back to ffmpeg exporter.");
  return exportTimelineVideo(projectDirectory, outputPath, onProgress);
}
