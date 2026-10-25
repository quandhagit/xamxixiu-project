import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import {
  DEFAULT_SPEECH_ABBREVIATION_ENTRIES,
  normalizeAbbreviationEntries
} from "../comments/speech-abbreviations.js";
import type {
  SpeechAbbreviationEntry
} from "../comments/speech-abbreviations.js";

function abbreviationsFile(): string {
  return path.join(
    app.getPath("userData"),
    "speech-abbreviations.json"
  );
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function defaults(): SpeechAbbreviationEntry[] {
  return DEFAULT_SPEECH_ABBREVIATION_ENTRIES.map(
    (entry) => ({ ...entry })
  );
}

/**
 * The user's abbreviation list. A missing file means the user never edited
 * it, so the starter list is returned; an empty saved list stays empty.
 */
export async function loadAbbreviationEntries(): Promise<
  SpeechAbbreviationEntry[]
> {
  try {
    const raw = await fs.readFile(
      abbreviationsFile(),
      "utf8"
    );
    const parsed: unknown = JSON.parse(raw);
    const entries =
      typeof parsed === "object" &&
      parsed !== null &&
      "entries" in parsed
        ? (parsed as { entries: unknown }).entries
        : parsed;

    return normalizeAbbreviationEntries(entries);
  } catch (error) {
    if (isMissingFile(error)) {
      return defaults();
    }

    console.error(
      "[Abbreviations] Could not read speech-abbreviations.json:",
      error
    );
    return defaults();
  }
}

export async function saveAbbreviationEntries(
  input: unknown
): Promise<SpeechAbbreviationEntry[]> {
  const entries = normalizeAbbreviationEntries(input);
  const file = abbreviationsFile();
  const temporary = `${file}.tmp`;

  await fs.mkdir(path.dirname(file), { recursive: true });

  try {
    await fs.writeFile(
      temporary,
      `${JSON.stringify({ entries }, null, 2)}\n`,
      "utf8"
    );
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }

  return entries;
}
