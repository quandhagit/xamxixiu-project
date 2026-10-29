import path from "node:path";
import { fileURLToPath } from "node:url";

export function isDirectCli(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  try {
    const resolvedEntry = path.normalize(path.resolve(entry));
    const modulePath = path.normalize(fileURLToPath(metaUrl));
    if (process.platform === "win32") {
      return resolvedEntry.toLowerCase() === modulePath.toLowerCase();
    }
    return resolvedEntry === modulePath;
  } catch {
    return false;
  }
}
