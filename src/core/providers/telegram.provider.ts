import type { SignalResult, SignalType } from '../types';

interface TelegramCredentials {
  botToken: string;
  chatId: string;
}

interface TelegramSignalNotification extends TelegramCredentials {
  previousSignal: SignalType;
  result: SignalResult;
}

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
}

function signalMessage({ previousSignal, result }: Pick<TelegramSignalNotification, 'previousSignal' | 'result'>): string {
  return [
    'Quantify signal changed',
    `${result.symbol} · ${result.label ?? result.strategyName}`,
    `${previousSignal} → ${result.signal}`,
    `Price: ${result.price.toFixed(2)}`,
    result.rationale,
    new Date(result.timestamp).toISOString(),
  ].join('\n').slice(0, 4096);
}

export async function sendTelegramSignalNotification(notification: TelegramSignalNotification): Promise<void> {
  const botToken = notification.botToken.trim();
  const chatId = notification.chatId.trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) throw new Error('Telegram bot token is invalid.');
  if (!chatId || chatId.length > 200) throw new Error('Telegram chat ID is invalid.');

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: signalMessage(notification) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Telegram could not be reached.');
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error('Telegram returned an invalid response.');
  }
  if (!result || typeof result !== 'object') throw new Error('Telegram returned an invalid response.');
  const apiResult = result as TelegramApiResponse;
  if (!response.ok || apiResult.ok !== true) throw new Error(apiResult.description || 'Telegram could not send the message.');
}
