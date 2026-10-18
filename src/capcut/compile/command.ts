import { spawn } from "node:child_process";

export function windowsArg(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function runCapCut(
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const isWindows =
      process.platform === "win32";
    const command = isWindows
      ? [
          "capcut.cmd",
          ...args.map(windowsArg)
        ].join(" ")
      : "capcut";
    const commandArgs = isWindows
      ? []
      : args;
    const child = spawn(
      command,
      commandArgs,
      {
        cwd,
        env: process.env,
        shell: isWindows,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      reject(
        new Error(
          `Không tìm thấy capcut-cli global. ` +
            `Hãy chạy "npm install -g capcut-cli@latest". ` +
            `${error.message}`
        )
      );
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(
          [stdout.trim(), stderr.trim()]
            .filter(Boolean)
            .join("\n")
        );
        return;
      }

      const details = [stderr.trim(), stdout.trim()]
        .filter(Boolean)
        .join("\n");
      if (args[0] === "lint") {
        const jsonStart = details.indexOf("{");
        if (jsonStart >= 0) {
          try {
            const report = JSON.parse(
              details.slice(jsonStart)
            ) as {
              ok?: boolean;
              summary?: {
                errors?: number;
              };
            };
            if (
              report.ok === true &&
              (report.summary?.errors ?? 0) === 0
            ) {
              resolve(details);
              return;
            }
          } catch {
            // Preserve the original command failure below.
          }
        }
      }
      reject(
        new Error(
          `capcut ${args.join(" ")} thất bại ` +
            `(${code ?? "unknown"}): ${details}`
        )
      );
    });
  });
}

