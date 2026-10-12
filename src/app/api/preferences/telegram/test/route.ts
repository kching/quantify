import { sendTelegramTestMessage } from "@/core/providers/telegram.provider";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await getCurrentUser()))
    return Response.json(
      { error: "Sign in to test Telegram settings." },
      { status: 401 },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Telegram settings must be valid JSON." },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !("botToken" in body) ||
    typeof body.botToken !== "string" ||
    !("chatId" in body) ||
    typeof body.chatId !== "string"
  )
    return Response.json(
      { error: "A bot token and chat ID are required." },
      { status: 400 },
    );

  try {
    await sendTelegramTestMessage({
      botToken: body.botToken,
      chatId: body.chatId,
    });
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
