import OpenAI from "openai";

import type { AiProvider } from "../electron/ipc-types.js";
import { getDeepseek, getDeepseekModel } from "./deepseek.js";

const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash-high";

let geminiCached:
  | {
      apiKey: string;
      baseURL: string;
      client: OpenAI;
    }
  | null = null;

export function getAiProvider(): AiProvider {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "gemini"
    ? "gemini"
    : "deepseek";
}

export function getAiLabel(): string {
  return getAiProvider() === "gemini" ? "Gemini" : "DeepSeek";
}

function getGemini(): OpenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const baseURL =
    process.env.GEMINI_BASE_URL?.trim() || DEFAULT_GEMINI_BASE_URL;

  if (
    geminiCached &&
    geminiCached.apiKey === apiKey &&
    geminiCached.baseURL === baseURL
  ) {
    return geminiCached.client;
  }

  const client = new OpenAI({
    apiKey,
    baseURL
  });
  geminiCached = {
    apiKey,
    baseURL,
    client
  };
  return client;
}

function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function getChatClient(): OpenAI {
  return getAiProvider() === "gemini" ? getGemini() : getDeepseek();
}

export function getChatModel(): string {
  return getAiProvider() === "gemini"
    ? getGeminiModel()
    : getDeepseekModel();
}
