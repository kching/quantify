import { redirect } from "next/navigation";
import Preferences from "./preferences";
import { getTelegramConnection } from "@/core/db";
import { getCurrentUser } from "@/lib/current-user";

export default async function TelegramPreferencesPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const connection = await getTelegramConnection(user.id);
  const botConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_WEBHOOK_URL &&
    process.env.TELEGRAM_WEBHOOK_SECRET,
  );
  return (
    <Preferences
      initialConnected={Boolean(connection)}
      botConfigured={botConfigured}
    />
  );
}
