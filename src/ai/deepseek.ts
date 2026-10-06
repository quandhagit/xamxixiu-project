import "dotenv/config";

import OpenAI from "openai";

const apiKey = process.env.DEEPSEEK_API_KEY;
const baseURL =
  process.env.DEEPSEEK_BASE_URL?.trim() ??
  "https://api.deepseek.com";

if (!apiKey) {
  throw new Error(
    "DEEPSEEK_API_KEY is not configured"
  );
}

export const deepseek = new OpenAI({
  apiKey,
  baseURL
});

export const deepseekModel =
  process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
