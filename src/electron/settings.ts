import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";
import os from "node:os";

import type {
  AiProvider,
  AppSettings
} from "./ipc-types.js";
import {
  clampCommentCaptureStyle,
  DEFAULT_COMMENT_CAPTURE_STYLE
} from "../capture-style.js";
import {
  clampTopicTitleStyle,
  DEFAULT_TOPIC_TITLE_STYLE
} from "../topic-title-style.js";
import {
  clampMemeDefaultStyle,
  DEFAULT_MEME_STYLE
} from "../meme-style.js";
import {
  clampImageEffectStyle,
  DEFAULT_IMAGE_EFFECT
} from "../image-effect.js";
import {
  clampWatermarkStyle,
  DEFAULT_WATERMARK_STYLE
} from "../watermark-style.js";

function defaultCapCutDraftsDirectory(): string {
  const localAppData =
    process.env.LOCALAPPDATA ??
    path.join(os.homedir(), "AppData", "Local");
  return path.join(
    localAppData,
    "CapCut",
    "User Data",
    "Projects",
    "com.lveditor.draft"
  );
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash-high";
const DEFAULT_PORT = "3001";
const DEFAULT_AI_PROVIDER: AiProvider = "deepseek";

const ENV_KEYS = {
  aiProvider: "AI_PROVIDER",
  deepseekApiKey: "DEEPSEEK_API_KEY",
  deepseekBaseUrl: "DEEPSEEK_BASE_URL",
  deepseekModel: "DEEPSEEK_MODEL",
  geminiApiKey: "GEMINI_API_KEY",
  geminiBaseUrl: "GEMINI_BASE_URL",
  geminiModel: "GEMINI_MODEL",
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
    aiProvider: DEFAULT_AI_PROVIDER,
    deepseekApiKey: "",
    deepseekBaseUrl: DEFAULT_BASE_URL,
    deepseekModel: DEFAULT_MODEL,
    geminiApiKey: "",
    geminiBaseUrl: DEFAULT_GEMINI_BASE_URL,
    geminiModel: DEFAULT_GEMINI_MODEL,
    vbeeAccessToken: readEnv("VBEE_ACCESS_TOKEN"),
    vbeeAppId: readEnv("VBEE_APP_ID"),
    vbeeWebhookPort:
      readEnv("VBEE_WEBHOOK_PORT") || DEFAULT_PORT,
    capcutDraftsDir:
      readEnv("CAPCUT_DRAFTS_DIR") ||
      defaultCapCutDraftsDirectory(),
    commentCapture: DEFAULT_COMMENT_CAPTURE_STYLE,
    topicTitle: DEFAULT_TOPIC_TITLE_STYLE,
    meme: DEFAULT_MEME_STYLE,
    imageEffect: DEFAULT_IMAGE_EFFECT,
    watermark: DEFAULT_WATERMARK_STYLE
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

function normalizeAiProvider(
  value: unknown,
  fallback: AiProvider
): AiProvider {
  const raw =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : fallback;
  return raw === "gemini" ? "gemini" : "deepseek";
}

function assertHttpUrl(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} không hợp lệ.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `${label} phải bắt đầu bằng http hoặc https.`
    );
  }
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
    aiProvider: normalizeAiProvider(
      input.aiProvider,
      fallback.aiProvider
    ),
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
    geminiApiKey: readField(
      input.geminiApiKey,
      fallback.geminiApiKey
    ),
    geminiBaseUrl:
      readField(
        input.geminiBaseUrl,
        fallback.geminiBaseUrl
      ) || DEFAULT_GEMINI_BASE_URL,
    geminiModel:
      readField(
        input.geminiModel,
        fallback.geminiModel
      ) || DEFAULT_GEMINI_MODEL,
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
      ) || defaultCapCutDraftsDirectory(),
    commentCapture: clampCommentCaptureStyle(
      input.commentCapture,
      fallback.commentCapture
    ),
    topicTitle: clampTopicTitleStyle(
      input.topicTitle,
      fallback.topicTitle
    ),
    meme: clampMemeDefaultStyle(input.meme, fallback.meme),
    imageEffect: clampImageEffectStyle(
      input.imageEffect,
      fallback.imageEffect
    ),
    watermark: clampWatermarkStyle(input.watermark, fallback.watermark)
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

  assertHttpUrl(settings.deepseekBaseUrl, "DeepSeek base URL");
  assertHttpUrl(settings.geminiBaseUrl, "Gemini base URL");

  if (
    settings.capcutDraftsDir &&
    !path.isAbsolute(settings.capcutDraftsDir)
  ) {
    throw new Error(
      "Thư mục CapCut phải là đường dẫn đầy đủ."
    );
  }
}

export function applySettings(
  settings: AppSettings
): void {
  const values: AppSettings = settings;
  (
    Object.keys(ENV_KEYS) as Array<keyof typeof ENV_KEYS>
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
    input as Partial<AppSettings>,
    await loadSettings()
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
