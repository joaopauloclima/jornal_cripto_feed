import { logger } from "../utils/logger.js";

export async function sendToWebhook(item) {
  const webhook = process.env.MAKE_WEBHOOK_URL;

  if (!webhook) {
    logger.warn("MAKE_WEBHOOK_URL not configured");
    return;
  }

  const payload = {
    event: "news.created",
    timestamp: new Date().toISOString(),
    data: item
  };

  let response;

  try {
    response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error(`Webhook network error: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status}`);
  }
}
