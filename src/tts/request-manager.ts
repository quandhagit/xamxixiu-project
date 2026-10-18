import fs from "node:fs/promises";
import path from "node:path";

export interface VbeeWebhookPayload {
  app_id: string;
  request_id: string;
  characters: number;
  voice_code: string;
  audio_type: string;
  speed_rate: number;
  sample_rate: number;
  bitrate: number;
  created_at: string;
  status: "COMPLETED" | "FAILED";
  audio_link?: string;
  error?: string;
}

export interface StoredRequest {
  requestId: string;
  outputFile: string;
  status: "pending" | "completed" | "failed";
  error?: string;
}

const REQUESTS_FILE = path.join(process.cwd(), ".vbee-requests.json");
const CALLBACKS_FILE = path.join(process.cwd(), ".vbee-callbacks.json");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readRequests(): Promise<Record<string, StoredRequest>> {
  try {
    const data = await fs.readFile(REQUESTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return {};
    }
    await sleep(100);
    try {
      const data = await fs.readFile(REQUESTS_FILE, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
}

async function writeRequests(requests: Record<string, StoredRequest>): Promise<void> {
  const data = JSON.stringify(requests, null, 2);
  for (let i = 0; i < 5; i++) {
    try {
      await fs.writeFile(REQUESTS_FILE, data, "utf-8");
      return;
    } catch {
      await sleep(50);
    }
  }
}

async function readCallbacks(): Promise<Record<string, VbeeWebhookPayload>> {
  try {
    const data = await fs.readFile(CALLBACKS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return {};
    }
    await sleep(100);
    try {
      const data = await fs.readFile(CALLBACKS_FILE, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
}

async function writeCallbacks(callbacks: Record<string, VbeeWebhookPayload>): Promise<void> {
  const data = JSON.stringify(callbacks, null, 2);
  for (let i = 0; i < 5; i++) {
    try {
      await fs.writeFile(CALLBACKS_FILE, data, "utf-8");
      return;
    } catch {
      await sleep(50);
    }
  }
}

class RequestManager {
  private operationQueue: Promise<void> =
    Promise.resolve();

  private async runExclusive<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const previous =
      this.operationQueue;
    let release!: () => void;
    this.operationQueue =
      new Promise<void>((resolve) => {
        release = resolve;
      });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async registerRequest(requestId: string, outputFile: string): Promise<void> {
    await this.runExclusive(async () => {
      const requests = await readRequests();
      const callbacks = await readCallbacks();

      requests[requestId] = {
        requestId,
        outputFile,
        status: "pending"
      };

      const cachedCallback = callbacks[requestId];
      if (cachedCallback) {
        console.log(`[RequestManager] Match found for cached callback of ${requestId}`);
        delete callbacks[requestId];
        await writeCallbacks(callbacks);

        try {
          await this.processCallback(cachedCallback, outputFile);
          requests[requestId].status = "completed";
        } catch (err: unknown) {
          requests[requestId].status = "failed";
          requests[requestId].error = err instanceof Error ? err.message : "Failed to process cached callback";
        }
      }

      await writeRequests(requests);
    });
  }

  async handleCallback(payload: VbeeWebhookPayload): Promise<void> {
    await this.runExclusive(async () => {
      const requestId = payload.request_id;
      const requests = await readRequests();

      const req = requests[requestId];
      if (!req) {
        console.log(`[RequestManager] No pending request found for ${requestId}, caching callback.`);
        const callbacks = await readCallbacks();
        callbacks[requestId] = payload;
        await writeCallbacks(callbacks);
        return;
      }

      try {
        await this.processCallback(payload, req.outputFile);
        req.status = "completed";
      } catch (err: unknown) {
        req.status = "failed";
        req.error = err instanceof Error ? err.message : "Failed to process callback";
      }

      await writeRequests(requests);
    });
  }

  private async processCallback(
    payload: VbeeWebhookPayload,
    outputFile: string
  ): Promise<void> {
    if (payload.status === "FAILED") {
      throw new Error(`Vbee processing failed: ${payload.error || "Unknown error"}`);
    }

    if (!payload.audio_link) {
      throw new Error("Vbee callback missing audio_link");
    }

    console.log(`Downloading audio: ${payload.request_id}`);
    await this.downloadAndSave(payload.audio_link, outputFile);
    console.log(`Audio saved: ${outputFile}`);
    console.log(`Vbee request completed: ${payload.request_id}`);
  }

  async downloadAndSave(audioLink: string, outputFile: string): Promise<void> {
    const response = await fetch(audioLink);
    if (!response.ok) {
      throw new Error(`Failed to download audio from ${audioLink} (${response.status})`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error("Downloaded audio is empty");
    }

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, Buffer.from(buffer));
  }

  async updateRequestStatus(
    requestId: string,
    status: "completed" | "failed",
    error?: string
  ): Promise<void> {
    await this.runExclusive(async () => {
      const requests = await readRequests();
      if (requests[requestId]) {
        requests[requestId].status = status;
        if (error) {
          requests[requestId].error = error;
        }
        await writeRequests(requests);
      }
    });
  }

  async waitForCompletion(
    requestId: string,
    fallbackCheck?: () => Promise<{ status?: string; audioLink?: string; error?: { message?: string } } | null>
  ): Promise<void> {
    const maxAttempts = 150; // 5 minutes with 2s interval
    const intervalMs = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const requests = await readRequests();
      const req = requests[requestId];

      if (!req) {
        throw new Error(`Request ${requestId} not found in store`);
      }

      if (req.status === "completed") {
        return;
      }

      if (req.status === "failed") {
        throw new Error(`Vbee TTS request failed: ${req.error || "Unknown error"}`);
      }

      // Fallback check every 10 attempts (20 seconds)
      if (fallbackCheck && attempt % 10 === 0) {
        console.log(`[RequestManager] Webhook fallback: Active polling Vbee API for ${requestId}...`);
        let result: Awaited<ReturnType<typeof fallbackCheck>> = null;
        try {
          result = await fallbackCheck();
        } catch (err: unknown) {
          console.error(`[RequestManager] Fallback check failed for ${requestId}:`, err);
        }

        if (result?.status === "COMPLETED" && result.audioLink) {
          console.log(`[RequestManager] Webhook fallback: Request ${requestId} is COMPLETED. Downloading...`);
          await this.downloadAndSave(result.audioLink, req.outputFile);
          await this.updateRequestStatus(requestId, "completed");
          return;
        }

        if (result?.status === "FAILED") {
          const errMsg = result.error?.message || "Unknown error in fallback";
          await this.updateRequestStatus(requestId, "failed", errMsg);
          throw new Error(`Vbee TTS failed (fallback): ${errMsg}`);
        }
      }

      await sleep(intervalMs);
    }

    throw new Error(`Timeout waiting for Vbee request ${requestId}`);
  }
}

export const requestManager = new RequestManager();
