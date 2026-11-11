import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import {
  normalizeUserCombo,
  type MemeCombo
} from "../timeline/meme-combo.js";

function combosFile(): string {
  return path.join(app.getPath("userData"), "combos.json");
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function loadUserCombos(): Promise<MemeCombo[]> {
  try {
    const raw = await fs.readFile(combosFile(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    const items =
      typeof parsed === "object" &&
      parsed !== null &&
      "combos" in parsed
        ? (parsed as { combos: unknown }).combos
        : parsed;
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .map((item) => normalizeUserCombo(item))
      .filter((item): item is MemeCombo => Boolean(item));
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    console.error("[Combos] Could not read combos.json:", error);
    return [];
  }
}

async function writeCombos(combos: MemeCombo[]): Promise<MemeCombo[]> {
  const file = combosFile();
  const temporary = `${file}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(
      temporary,
      `${JSON.stringify({ combos }, null, 2)}\n`,
      "utf8"
    );
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return combos;
}

export async function saveUserCombo(input: unknown): Promise<MemeCombo[]> {
  const combo = normalizeUserCombo(input);
  if (!combo) {
    throw new Error("Combo không hợp lệ.");
  }
  const current = await loadUserCombos();
  const index = current.findIndex((item) => item.id === combo.id);
  if (index >= 0) {
    current[index] = combo;
  } else {
    current.push(combo);
  }
  return writeCombos(current);
}

export async function deleteUserCombo(comboId: string): Promise<MemeCombo[]> {
  const current = await loadUserCombos();
  return writeCombos(current.filter((item) => item.id !== comboId));
}
