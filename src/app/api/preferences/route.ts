import { getUserPreferences, updateUserPreferences } from "@/core/db";
import type { UserPreferences } from "@/core/types";
import { sendTelegramWelcomeMessage } from "@/core/providers/telegram.provider";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to view preferences." },
      { status: 401 },
    );
  return Response.json({ preferences: await getUserPreferences(user.id) });
}

export async function PATCH(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to update preferences." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Preferences must be valid JSON." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json(
      { error: "Preferences must be a JSON object." },
      { status: 400 },
    );
  const updates = (body as { preferences?: unknown }).preferences;
  if (!updates || typeof updates !== "object" || Array.isArray(updates))
    return Response.json(
      { error: "Preferences must be a JSON object." },
      { status: 400 },
    );
  const previousPreferences = await getUserPreferences(user.id);
  const preferences = await updateUserPreferences(
    user.id,
    updates as UserPreferences,
  );
  const previousTelegram = telegramCredentials(previousPreferences);
  const currentTelegram = telegramCredentials(preferences);
  let welcomeMessageError: string | undefined;
  if (
    currentTelegram &&
    (!previousTelegram ||
      previousTelegram.botToken !== currentTelegram.botToken ||
      previousTelegram.chatId !== currentTelegram.chatId)
  ) {
    try {
      await sendTelegramWelcomeMessage(currentTelegram);
    } catch (error) {
      welcomeMessageError =
        error instanceof Error
          ? error.message
          : "Unable to send the Telegram welcome message.";
    }
  }
  return Response.json({ preferences, welcomeMessageError });
}

function telegramCredentials(
  preferences: UserPreferences,
): { botToken: string; chatId: string } | null {
  const telegram = preferences.telegram;
  if (!telegram || typeof telegram !== "object" || Array.isArray(telegram))
    return null;
  const { botToken, chatId } = telegram as Record<string, unknown>;
  if (
    typeof botToken !== "string" ||
    typeof chatId !== "string" ||
    !botToken.trim() ||
    !chatId.trim()
  )
    return null;
  return { botToken, chatId };
}
