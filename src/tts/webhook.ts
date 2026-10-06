import "dotenv/config";
import express from "express";
import { requestManager, type VbeeWebhookPayload } from "./request-manager.js";

const app = express();
app.use(express.json());

const port = process.env.VBEE_WEBHOOK_PORT || 3000;

app.post("/webhooks/vbee", (req, res) => {
  const payload = req.body as VbeeWebhookPayload;

  if (!payload || !payload.request_id) {
    console.error("[Webhook] Received invalid callback body:", req.body);
    return res.status(400).json({ error: "Invalid payload" });
  }

  console.log(`Vbee webhook received: ${payload.request_id}`);

  // Process callback asynchronously so we reply to Vbee immediately
  requestManager.handleCallback(payload).catch((err) => {
    console.error(`[Webhook] Error processing callback for ${payload.request_id}:`, err);
  });

  return res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`[Webhook] Server is running on port ${port}`);
  console.log(`[Webhook] Listening for callbacks at /webhooks/vbee`);
});
