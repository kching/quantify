import "server-only";
import { recordWebhookDeliveryLog } from "../db";
import type { WebhookConfig, WebhookDeliveryLog } from "../types";

export interface WebhookEventPayload<TData = unknown> {
  type: string;
  data: TData;
}

export interface WebhookDeliveryResult {
  delivered: boolean;
  log: WebhookDeliveryLog;
}

export async function invokeWebhook<TData>(
  config: WebhookConfig,
  payload: WebhookEventPayload<TData>,
): Promise<WebhookDeliveryResult> {
  if (!payload.type.trim()) throw new Error("Webhook event type is required.");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.clientId) headers["X-Client-ID"] = config.clientId;
  if (config.secretToken)
    headers.Authorization = `Bearer ${config.secretToken}`;

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error: unknown) {
    const log = await recordWebhookDeliveryLog({
      userId: config.userId,
      webhookConfigId: config.id,
      eventType: payload.type,
      url: config.url,
      status: "error",
      statusCode: null,
      message:
        error instanceof Error && error.name === "TimeoutError"
          ? "Webhook request timed out."
          : "Webhook request failed.",
    });
    return { delivered: false, log };
  }

  const delivered = response.status >= 200 && response.status < 300;
  const log = await recordWebhookDeliveryLog({
    userId: config.userId,
    webhookConfigId: config.id,
    eventType: payload.type,
    url: config.url,
    status: delivered ? "success" : "error",
    statusCode: response.status,
    message: delivered
      ? `Webhook accepted with HTTP ${response.status}.`
      : `Webhook returned HTTP ${response.status}.`,
  });
  return { delivered, log };
}
