import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import type {
  TTSProvider,
  TTSRequest
} from "./types.js";

import { requestManager } from "./request-manager.js";
import { VOICE_SPEED } from "../timeline/audio-constants.js";

const VBEE_API_URL =
  "https://api.vbee.vn/v1/tts";

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not configured`
    );
  }

  return value;
}

function credentials(): {
  accessToken: string;
  appId: string;
  webhookUrl: string;
} {
  return {
    accessToken: getEnv("VBEE_ACCESS_TOKEN"),
    appId: getEnv("VBEE_APP_ID"),
    webhookUrl: getEnv("VBEE_WEBHOOK_URL")
  };
}

interface VbeeCreateResponse {
  requestId?: string;
  status?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

interface VbeeRequestResponse {
  requestId?: string;
  status?: string;
  audioLink?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

async function readJson<T>(
  response: Response,
  action: string
): Promise<T> {
  const body = await response.text();

  try {
    return JSON.parse(body) as T;
  } catch {
    const snippet = body
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

    throw new Error(
      `Vbee ${action} returned a non-JSON response (${response.status}): ${snippet || "empty body"}`
    );
  }
}

export class VbeeTTS implements TTSProvider {
  async synthesize(
    request: TTSRequest
  ): Promise<void> {

    if (!request.text.trim()) {
      throw new Error(
        "Vbee TTS text cannot be empty"
      );
    }

    if (request.text.length > 100000) {
      throw new Error(
        `Vbee text exceeds 100000 characters: ${request.text.length}`
      );
    }

    await fs.mkdir(
      path.dirname(request.outputFile),
      {
        recursive: true
      }
    );

    const requestId =
      await this.createRequest(request);

    console.log(
      `Vbee request created: ${requestId}`
    );

    console.log(
      `Waiting for webhook: ${request.outputFile}`
    );

    // Register request
    await requestManager.registerRequest(requestId, request.outputFile);

    // Wait for webhook callback or fallback poll
    await requestManager.waitForCompletion(requestId, async () => {
      try {
        const result = await this.getRequest(requestId);
        return {
          status: result.status,
          audioLink: result.audioLink,
          error: result.error
        };
      } catch (err) {
        console.error(`[VbeeTTS] Active polling fallback error for ${requestId}:`, err);
        return null;
      }
    });
  }

  private async createRequest(
    request: TTSRequest
  ): Promise<string> {
    const { accessToken, appId, webhookUrl } =
      credentials();
    const response =
      await fetch(
        VBEE_API_URL,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "App-Id": appId,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            text: request.text,

            mode: "async",

            webhookUrl: webhookUrl,

            voiceCode:
              request.voice.voiceCode,

            outputFormat: "mp3",

            bitrate: 128,

            speed: VOICE_SPEED
          })
        }
      );

    const data =
      await readJson<VbeeCreateResponse>(
        response,
        "create request"
      );

    if (!response.ok) {
      throw new Error(
        `Vbee create request failed (${response.status}): ${data.error?.message ??
        "Unknown error"
        }`
      );
    }

    if (!data.requestId) {
      throw new Error(
        `Vbee did not return requestId: ${JSON.stringify(data)}`
      );
    }

    return data.requestId;
  }

  private async getRequest(
    requestId: string
  ): Promise<VbeeRequestResponse> {
    const { accessToken, appId } = credentials();
    const response =
      await fetch(
        `${VBEE_API_URL}/requests/${requestId}`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "App-Id": appId,

            "Content-Type":
              "application/json"
          }
        }
      );

    const data =
      await readJson<VbeeRequestResponse>(
        response,
        "get request"
      );

    if (!response.ok) {
      throw new Error(
        `Vbee get request failed (${response.status}): ${data.error?.message ??
        "Unknown error"
        }`
      );
    }

    return data;
  }
}
