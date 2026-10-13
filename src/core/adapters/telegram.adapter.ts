import "server-only";
import type { SignalResult, SignalType } from "../types";

interface TelegramSignalNotification {
  chatId: string;
  previousSignal: SignalType;
  result: SignalResult;
}

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  result?: { username?: string };
}

const welcomeMessage = [
  "Welcome to Quantify!",
  "",
  "Your Telegram account is connected. You’ll receive a message here when one of your configured signals changes.",
  "",
  "You can disconnect this chat any time from Telegram preferences or by sending /stop.",
].join("\n");

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("The app Telegram bot is not configured.");
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token))
    throw new Error("The app Telegram bot token is invalid.");
  return token;
}

async function callTelegram(
  method: string,
  payload?: Record<string, string>,
): Promise<TelegramApiResponse> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${botToken()}/${method}`,
      {
        method: payload ? "POST" : "GET",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new Error("Telegram could not be reached.");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("Telegram returned an invalid response.");
  }
  if (!result || typeof result !== "object")
    throw new Error("Telegram returned an invalid response.");
  const apiResult = result as TelegramApiResponse;
  if (!response.ok || apiResult.ok !== true)
    throw new Error(
      apiResult.description || "Telegram could not send the message.",
    );
  return apiResult;
}

function signalMessage({
  previousSignal,
  result,
}: Pick<TelegramSignalNotification, "previousSignal" | "result">): string {
  return [
    "Quantify signal changed",
    `${result.symbol} · ${result.label ?? result.strategyName}`,
    `${previousSignal} → ${result.signal}`,
    `Price: ${result.price.toFixed(2)}`,
    result.rationale,
    new Date(result.timestamp).toISOString(),
  ]
    .join("\n")
    .slice(0, 4096);
}

export async function sendTelegramText(
  rawChatId: string,
  text: string,
): Promise<void> {
  const chatId = rawChatId.trim();
  if (!chatId || chatId.length > 200)
    throw new Error("Telegram chat ID is invalid.");
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096),
  });
}

export async function getTelegramBotUsername(): Promise<string> {
  const response = await callTelegram("getMe");
  const username = response.result?.username;
  if (!username) throw new Error("The app Telegram bot has no username.");
  return username;
}

export async function configureTelegramWebhook(): Promise<void> {
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !webhookSecret)
    throw new Error(
      "Set TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET to enable Telegram.",
    );
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    throw new Error("TELEGRAM_WEBHOOK_URL must be a valid HTTPS URL.");
  }
  if (parsedUrl.protocol !== "https:")
    throw new Error("TELEGRAM_WEBHOOK_URL must use HTTPS.");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret))
    throw new Error("TELEGRAM_WEBHOOK_SECRET has an invalid format.");
  await callTelegram("setWebhook", {
    url: parsedUrl.toString(),
    secret_token: webhookSecret,
    allowed_updates: JSON.stringify(["message"]),
  });
}

export async function sendTelegramSignalNotification(
  notification: TelegramSignalNotification,
): Promise<void> {
  await sendTelegramText(notification.chatId, signalMessage(notification));
}

export async function sendTelegramTestMessage(chatId: string): Promise<void> {
  await sendTelegramText(
    chatId,
    "Quantify test message\nYour Telegram connection is working.",
  );
}

export async function sendTelegramWelcomeMessage(
  chatId: string,
): Promise<void> {
  await sendTelegramText(chatId, welcomeMessage);
}
