import { sendTelegramTestMessage } from "@/core/adapters/telegram.adapter";
import { getTelegramConnection } from "@/core/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to test Telegram settings." },
      { status: 401 },
    );

  try {
    const connection = await getTelegramConnection(user.id);
    if (!connection)
      return Response.json(
        { error: "Connect a Telegram chat before sending a test message." },
        { status: 409 },
      );
    await sendTelegramTestMessage(connection.chatId);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to send a Telegram test message.",
      },
      { status: 502 },
    );
  }
}
