import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import {
  defaultCapCutDraftsDirectory
} from "../capcut/compile/project-generator.js";
import type {
  AppSettings
} from "./ipc-types.js";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_PORT = "3001";

const ENV_KEYS = {
  deepseekApiKey: "DEEPSEEK_API_KEY",
  deepseekBaseUrl: "DEEPSEEK_BASE_URL",
  deepseekModel: "DEEPSEEK_MODEL",
  vbeeAccessToken: "VBEE_ACCESS_TOKEN",
  vbeeAppId: "VBEE_APP_ID",
  vbeeWebhookPort: "VBEE_WEBHOOK_PORT",
  capcutDraftsDir: "CAPCUT_DRAFTS_DIR"
} as const;

function settingsFile(): string {
  return path.join(
    app.getPath("userData"),
    "settings.json"
  );
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function settingsFromEnv(): AppSettings {
  return {
    deepseekApiKey: readEnv("DEEPSEEK_API_KEY"),
    deepseekBaseUrl:
      readEnv("DEEPSEEK_BASE_URL") || DEFAULT_BASE_URL,
    deepseekModel:
      readEnv("DEEPSEEK_MODEL") || DEFAULT_MODEL,
    vbeeAccessToken: readEnv("VBEE_ACCESS_TOKEN"),
    vbeeAppId: readEnv("VBEE_APP_ID"),
    vbeeWebhookPort:
      readEnv("VBEE_WEBHOOK_PORT") || DEFAULT_PORT,
    capcutDraftsDir:
      readEnv("CAPCUT_DRAFTS_DIR") ||
      defaultCapCutDraftsDirectory()
  };
}

function readField(
  value: unknown,
  fallback: string
): string {
  return typeof value === "string"
    ? value.trim()
    : fallback;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function normalizeSettings(
  input: Partial<AppSettings>,
  fallback: AppSettings = settingsFromEnv()
): AppSettings {
  return {
    deepseekApiKey: readField(
      input.deepseekApiKey,
      fallback.deepseekApiKey
    ),
    deepseekBaseUrl:
      readField(
        input.deepseekBaseUrl,
        fallback.deepseekBaseUrl
      ) || DEFAULT_BASE_URL,
    deepseekModel:
      readField(
        input.deepseekModel,
        fallback.deepseekModel
      ) || DEFAULT_MODEL,
    vbeeAccessToken: readField(
      input.vbeeAccessToken,
      fallback.vbeeAccessToken
    ),
    vbeeAppId: readField(
      input.vbeeAppId,
      fallback.vbeeAppId
    ),
    vbeeWebhookPort:
      readField(
        input.vbeeWebhookPort,
        fallback.vbeeWebhookPort
      ) || DEFAULT_PORT,
    capcutDraftsDir:
      readField(
        input.capcutDraftsDir,
        fallback.capcutDraftsDir
      ) || defaultCapCutDraftsDirectory()
  };
}

export async function assertValidSettings(
  settings: AppSettings
): Promise<void> {
  const port = Number(settings.vbeeWebhookPort);
  if (
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535
  ) {
    throw new Error(
      `Cổng webhook không hợp lệ: ${settings.vbeeWebhookPort}`
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(settings.deepseekBaseUrl);
  } catch {
    throw new Error("DeepSeek base URL không hợp lệ.");
  }

  if (
    baseUrl.protocol !== "https:" &&
    baseUrl.protocol !== "http:"
  ) {
    throw new Error(
      "DeepSeek base URL phải bắt đầu bằng http hoặc https."
    );
  }

  if (!path.isAbsolute(settings.capcutDraftsDir)) {
    throw new Error(
      "Thư mục CapCut phải là đường dẫn đầy đủ."
    );
  }

  const draftsStat = await fs.stat(
    settings.capcutDraftsDir
  ).catch(() => undefined);
  if (draftsStat && !draftsStat.isDirectory()) {
    throw new Error(
      "Đường dẫn CapCut không phải thư mục."
    );
  }
}

export function applySettings(
  settings: AppSettings
): void {
  const values: AppSettings = settings;
  (
    Object.keys(ENV_KEYS) as Array<keyof AppSettings>
  ).forEach((field) => {
    process.env[ENV_KEYS[field]] = values[field];
  });
}

export async function loadSettings(): Promise<AppSettings> {
  const fallback = settingsFromEnv();

  try {
    const raw = await fs.readFile(
      settingsFile(),
      "utf8"
    );
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return fallback;
    }

    return normalizeSettings(
      parsed as Partial<AppSettings>,
      fallback
    );
  } catch (error) {
    if (isMissingFile(error)) {
      return fallback;
    }

    console.error(
      "[Settings] Could not read settings.json:",
      error
    );
    return fallback;
  }
}

export async function saveSettings(
  input: unknown
): Promise<AppSettings> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new Error("Settings không hợp lệ.");
  }

  const settings = normalizeSettings(
    input as Partial<AppSettings>
  );
  await assertValidSettings(settings);
  const file = settingsFile();
  await fs.mkdir(path.dirname(file), {
    recursive: true
  });
  await fs.writeFile(
    file,
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8"
  );
  applySettings(settings);
  return settings;
}
