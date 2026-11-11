import { getDeepseek, getDeepseekModel } from "./deepseek.js";

export async function generateJsonWithRetry(
  prompt: string,
  system = "Return only valid JSON."
): Promise<string> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await getDeepseek().chat.completions.create({
        model: getDeepseekModel(),
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      });
      const text = response.choices[0]?.message.content?.trim();
      if (!text) {
        throw new Error("DeepSeek returned an empty response.");
      }
      return text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    } catch (error) {
      const status =
        error instanceof Error &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : undefined;
      const retryable =
        status === 503 || status === 429 || status === 500;
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }

  throw new Error("DeepSeek request failed after retries.");
}

export function parseModelJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Failed to parse DeepSeek response as JSON.");
  }
}
