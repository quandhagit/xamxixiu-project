declare module "@hyperframes/producer" {
  export function createRenderJob(options: {
    fps?: number;
    quality?: string;
    format?: string;
    entryFile?: string;
  }): unknown;

  export function executeRenderJob(
    job: unknown,
    projectDir: string,
    outputPath: string,
    onProgress?: (current: { progress?: number }, message: string) => void
  ): Promise<void>;
}
