import { createHash } from "node:crypto";
import {
  connectTelegramChat,
  consumeTelegramLinkToken,
  disconnectTelegramChat,
} from "@/core/db";
import {
  sendTelegramText,
  sendTelegramWelcomeMessage,
} from "@/core/providers/telegram.provider";

export const dynamic = "force-dynamic";

interface TelegramMessage {
  text?: unknown;
  chat?: { id?: unknown };
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

function secretMatches(supplied: string, expected: string): boolean {
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < supplied.length; index += 1)
    difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: Request): Promise<Response> {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret)
    return Response.json(
      { error: "Telegram webhook is not configured." },
      { status: 503 },
    );
  const suppliedSecret =
    request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secretMatches(suppliedSecret, webhookSecret))
    return Response.json({ error: "Unauthorized." }, { status: 401 });

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid Telegram update." },
      { status: 400 },
    );
  }
  if (!update || typeof update !== "object" || Array.isArray(update))
    return Response.json(
      { error: "Invalid Telegram update." },
      { status: 400 },
    );

  const message = (update as TelegramUpdate).message;
  const chatIdValue = message?.chat?.id;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (
    !message ||
    (typeof chatIdValue !== "string" && typeof chatIdValue !== "number")
  )
    return Response.json({ ok: true });
  const chatId = String(chatIdValue);

  if (/^\/stop(?:@\w+)?(?:\s|$)/i.test(text)) {
    await disconnectTelegramChat(chatId);
    await sendTelegramText(chatId, "Telegram notifications are disconnected.");
    return Response.json({ ok: true });
  }

  const startMatch = text.match(
    /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/i,
  );
  if (!startMatch) return Response.json({ ok: true });
  const linkToken = startMatch[1];
  if (!linkToken) {
    await sendTelegramText(
      chatId,
      "To connect this chat, create a connection link from Quantify Telegram preferences.",
    );
    return Response.json({ ok: true });
  }

  const tokenHash = createHash("sha256").update(linkToken).digest("hex");
  const userId = await consumeTelegramLinkToken(tokenHash);
  if (!userId) {
    await sendTelegramText(
      chatId,
      "This connection link has expired or was already used. Create a new one in Quantify and try again.",
    );
    return Response.json({ ok: true });
  }

  try {
    await connectTelegramChat(userId, chatId);
  } catch {
    await sendTelegramText(
      chatId,
      "This Telegram chat is already connected to another Quantify account.",
    );
    return Response.json({ ok: true });
  }

  try {
    await sendTelegramWelcomeMessage(chatId);
  } catch (error) {
    console.warn(
      "[quantify] Telegram linked, but the welcome message failed.",
      error,
    );
  }
  return Response.json({ ok: true });
}
