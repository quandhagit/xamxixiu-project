import "dotenv/config";

import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import type { Server } from "node:http";
import type { Readable } from "node:stream";

import { startWebhookServer } from "../tts/webhook-server.js";

const tunnelUrlPattern =
  /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

type TunnelProcess =
  ChildProcessByStdio<null, Readable, Readable>;

export interface VbeeServices {
  publicUrl: string;
  stop: () => Promise<void>;
}

function getPort(): number {
  const value = process.env.VBEE_WEBHOOK_PORT ?? "3000";
  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid VBEE_WEBHOOK_PORT: ${value}`);
  }

  return port;
}

function getCloudflaredCommand(): string {
  return process.env.CLOUDFLARED_PATH ?? "cloudflared";
}

function stopProcess(child: TunnelProcess): void {
  if (!child.killed) {
    child.kill();
  }
}

async function startQuickTunnel(
  port: number
): Promise<{
  child: TunnelProcess;
  publicUrl: string;
}> {
  const child = spawn(
    getCloudflaredCommand(),
    ["tunnel", "--url", `http://localhost:${port}`],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );

  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        stopProcess(child);
        reject(
          new Error(
            "Timed out waiting for Cloudflare Quick Tunnel URL. " +
            "Is cloudflared installed and available in PATH?"
          )
        );
      }
    }, 30_000);

    const handleOutput = (chunk: Buffer): void => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(`[Cloudflare] ${text}`);

      const match = output.match(tunnelUrlPattern);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({
          child,
          publicUrl: match[0]
        });
      }
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);

    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(
          new Error(
            `Could not start cloudflared (${getCloudflaredCommand()}): ${error.message}`
          )
        );
      }
    });

    child.once("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(
          new Error(
            `cloudflared exited before creating a tunnel (code ${code ?? "unknown"}).`
          )
        );
      }
    });
  });
}

export async function startVbeeServices(): Promise<VbeeServices> {
  const port = getPort();
  let webhookServer: Server | undefined;
  let tunnel: TunnelProcess | undefined;

  try {
    webhookServer = await startWebhookServer(String(port));
    const startedTunnel = await startQuickTunnel(port);
    tunnel = startedTunnel.child;

    const webhookUrl =
      `${startedTunnel.publicUrl}/webhooks/vbee`;
    process.env.VBEE_WEBHOOK_URL = webhookUrl;

    console.log(`[Vbee] Webhook URL: ${webhookUrl}`);

    return {
      publicUrl: startedTunnel.publicUrl,
      stop: async () => {
        stopProcess(startedTunnel.child);
        await new Promise<void>((resolve) => {
          webhookServer?.close(() => resolve());
        });
      }
    };
  } catch (error) {
    if (tunnel) {
      stopProcess(tunnel);
    }

    await new Promise<void>((resolve) => {
      if (webhookServer) {
        webhookServer.close(() => resolve());
      } else {
        resolve();
      }
    });

    throw error;
  }
}
