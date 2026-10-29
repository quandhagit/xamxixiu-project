import "dotenv/config";

import OpenAI from "openai";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

let cached:
  | {
      apiKey: string;
      baseURL: string;
      client: OpenAI;
    }
  | null = null;

export function getDeepseek(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not configured"
    );
  }

  const baseURL =
    process.env.DEEPSEEK_BASE_URL?.trim() ||
    DEFAULT_BASE_URL;

  if (
    cached &&
    cached.apiKey === apiKey &&
    cached.baseURL === baseURL
  ) {
    return cached.client;
  }

  const client = new OpenAI({
    apiKey,
    baseURL
  });
  cached = {
    apiKey,
    baseURL,
    client
  };
  return client;
}

export function getDeepseekModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
}
