import { createHash, randomBytes } from "node:crypto";
import {
  createTelegramLinkToken,
  disconnectTelegramConnection,
  getTelegramConnection,
} from "@/core/db";
import {
  configureTelegramWebhook,
  getTelegramBotUsername,
} from "@/core/adapters/telegram.adapter";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const LINK_LIFETIME_MS = 10 * 60_000;

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to connect Telegram." },
      { status: 401 },
    );
  const connection = await getTelegramConnection(user.id);
  return Response.json({
    connected: Boolean(connection),
    configured: Boolean(
      process.env.TELEGRAM_BOT_TOKEN &&
      process.env.TELEGRAM_WEBHOOK_URL &&
      process.env.TELEGRAM_WEBHOOK_SECRET,
    ),
  });
}

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to connect Telegram." },
      { status: 401 },
    );
  try {
    await configureTelegramWebhook();
    const botUsername = await getTelegramBotUsername();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = Date.now() + LINK_LIFETIME_MS;
    await createTelegramLinkToken(user.id, tokenHash, expiresAt);
    return Response.json({
      connectUrl: `https://t.me/${botUsername}?start=${token}`,
      expiresAt,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create a Telegram connection link.",
      },
      { status: 503 },
    );
  }
}

export async function DELETE(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to disconnect Telegram." },
      { status: 401 },
    );
  await disconnectTelegramConnection(user.id);
  return Response.json({ connected: false });
}
