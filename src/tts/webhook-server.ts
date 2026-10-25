import "dotenv/config";

import express from "express";
import type { Server } from "node:http";

import {
  requestManager,
  type VbeeWebhookPayload
} from "./request-manager.js";

export function startWebhookServer(
  requestedPort = process.env.VBEE_WEBHOOK_PORT ?? "3001"
): Promise<Server> {
  const port = Number(requestedPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid VBEE_WEBHOOK_PORT: ${requestedPort}`);
  }

  const app = express();
  app.use(express.json());

  app.post("/webhooks/vbee", (req, res) => {
    const payload = req.body as VbeeWebhookPayload;

    if (!payload || !payload.request_id) {
      console.error("[Webhook] Received invalid callback body:", req.body);
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    console.log(`Vbee webhook received: ${payload.request_id}`);

    requestManager.handleCallback(payload).catch((err) => {
      console.error(
        `[Webhook] Error processing callback for ${payload.request_id}:`,
        err
      );
    });

    res.json({ status: "ok" });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`[Webhook] Server is running on port ${port}`);
      console.log("[Webhook] Listening for callbacks at /webhooks/vbee");
      resolve(server);
    });

    server.once("error", reject);
  });
}
