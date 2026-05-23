import { logger } from "../utils/logger.js";

export async function sendToWebhook(item) {
  const webhook = process.env.MAKE_WEBHOOK_URL;

  if (!webhook) {
    logger.warn("MAKE_WEBHOOK_URL not configured");
    return;
  }

  // PAYLOAD SIMPLIFICADO PARA TESTE
  const payload = {
    title: item.title,
    url: item.url
  };

  logger.info({
    webhook,
    payload
  }, "Sending webhook");

  let response;
  let responseText = "";

  try {
    response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    responseText = await response.text();

    logger.info({
      status: response.status,
      response: responseText
    }, "Webhook response");

  } catch (error) {
    throw new Error(`Webhook network error: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} - ${responseText}`);
  }
}
